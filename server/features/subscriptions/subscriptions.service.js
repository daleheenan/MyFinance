/**
 * Subscriptions Service
 *
 * Manages subscription detection and CRUD operations:
 * - detectSubscriptions(db, options?) - Find recurring transactions that look like subscriptions
 * - detectRecurringIncome(db) - Find recurring income patterns
 * - getSubscriptions(db, options?) - Get all/active subscriptions
 * - getSubscriptionSummary(db) - Monthly/yearly totals, count, upcoming
 * - getUpcomingCharges(db, days?) - Get charges expected in next N days
 * - createSubscription(db, data) - Create a subscription
 * - updateSubscription(db, id, data) - Update a subscription
 * - deleteSubscription(db, id) - Soft delete (set is_active = 0)
 */

const VALID_TYPES = ['expense', 'income'];

const VALID_FREQUENCIES = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];

/**
 * Apply penny precision rounding to avoid floating point errors.
 * @param {number} amount - The amount to round
 * @returns {number} Amount rounded to 2 decimal places
 */
function pennyPrecision(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Calculate the coefficient of variation (CV) as a percentage.
 * CV = (standard deviation / mean) * 100
 * @param {number[]} values - Array of numbers
 * @returns {number} Coefficient of variation as percentage
 */
function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;

  const squareDiffs = values.map(value => Math.pow(value - mean, 2));
  const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);

  return (stdDev / Math.abs(mean)) * 100;
}

/**
 * Normalize a description for pattern matching.
 * Removes numbers, special characters, and extra whitespace.
 * @param {string} description - Transaction description
 * @returns {string} Normalized description
 */
function normalizeDescription(description) {
  if (!description) return '';
  return description
    .toUpperCase()
    // Remove dates in various formats
    .replace(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]?\d{0,4}/g, '')
    // Remove standalone numbers
    .replace(/\s\d+\s/g, ' ')
    .replace(/^\d+\s/, '')
    .replace(/\s\d+$/, '')
    // Remove reference numbers
    .replace(/REF[:\s]*\w+/gi, '')
    .replace(/TXN[:\s]*\w+/gi, '')
    // Remove asterisks
    .replace(/\s*\*+\s*/g, ' ')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a cleaner merchant name from description.
 * @param {string} description - Raw transaction description
 * @returns {string} Cleaned merchant name
 */
function extractMerchantName(description) {
  if (!description) return '';

  let name = description
    .toUpperCase()
    // Remove common prefixes
    .replace(/^(CARD\s+PAYMENT\s+TO\s+)/i, '')
    .replace(/^(DIRECT\s+DEBIT\s+TO\s+)/i, '')
    .replace(/^(STANDING\s+ORDER\s+TO\s+)/i, '')
    .replace(/^(FASTER\s+PAYMENT\s+TO\s+)/i, '')
    .replace(/^(BANK\s+TRANSFER\s+TO\s+)/i, '')
    .replace(/^(PAYMENT\s+TO\s+)/i, '')
    // Remove dates and reference numbers
    .replace(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]?\d{0,4}/g, '')
    .replace(/REF[:\s]*\w+/gi, '')
    // Remove .COM/.CO.UK suffixes
    .replace(/\.COM$/i, '')
    .replace(/\.CO\.UK$/i, '')
    // Clean up
    .replace(/\s+/g, ' ')
    .trim();

  // Take first meaningful part
  const parts = name.split(/[,*\-\/\\|]/);
  if (parts.length > 0 && parts[0].trim().length > 2) {
    name = parts[0].trim();
  }

  // Title case
  return name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Determine frequency based on average interval in days.
 * @param {number} avgDays - Average days between transactions
 * @returns {string} Frequency type
 */
function determineFrequency(avgDays) {
  if (avgDays <= 10) return 'weekly';
  if (avgDays <= 21) return 'fortnightly';
  if (avgDays <= 45) return 'monthly';
  if (avgDays <= 100) return 'quarterly';
  return 'yearly';
}

/**
 * Calculate confidence score for subscription detection.
 * Based on amount consistency and date regularity.
 * @param {number} amountCV - Coefficient of variation for amounts
 * @param {number} dateCV - Coefficient of variation for intervals
 * @param {number} occurrences - Number of occurrences
 * @returns {number} Confidence score 0-1
 */
function calculateConfidence(amountCV, dateCV, occurrences) {
  // Start with base confidence
  let confidence = 0.5;

  // Amount consistency (max 0.25 bonus)
  // Perfect consistency (CV=0) = +0.25, CV=10% = +0
  const amountScore = Math.max(0, 0.25 * (1 - amountCV / 10));
  confidence += amountScore;

  // Date regularity (max 0.15 bonus)
  // Perfect regularity (CV=0) = +0.15, CV=30% = +0
  const dateScore = Math.max(0, 0.15 * (1 - dateCV / 30));
  confidence += dateScore;

  // Occurrence bonus (max 0.1)
  // 2 occurrences = +0.02, 5+ = +0.1
  const occurrenceScore = Math.min(0.1, (occurrences - 2) * 0.02 + 0.02);
  confidence += occurrenceScore;

  return pennyPrecision(Math.min(1, confidence));
}

/**
 * Detect potential subscriptions from transaction history.
 * Looks for transactions with:
 * - Same/similar merchant pattern
 * - Similar amounts (within 10% variance)
 * - Regular intervals (date variance < 5 days from expected)
 * - At least 2 occurrences
 *
 * @param {Database} db - The database instance
 * @returns {Array<Object>} Array of detected subscriptions
 */
export function detectSubscriptions(db) {
  // Get all non-transfer transactions
  const transactions = db.prepare(`
    SELECT
      id, account_id, transaction_date, description, original_description,
      debit_amount, credit_amount
    FROM transactions
    WHERE is_transfer = 0
      AND debit_amount > 0
    ORDER BY transaction_date ASC
  `).all();

  if (transactions.length === 0) {
    return [];
  }

  // Group transactions by normalized description
  const groupedByDescription = new Map();

  for (const txn of transactions) {
    const desc = txn.original_description || txn.description;
    const normalizedDesc = normalizeDescription(desc);

    if (!normalizedDesc || normalizedDesc.length < 3) continue;

    if (!groupedByDescription.has(normalizedDesc)) {
      groupedByDescription.set(normalizedDesc, []);
    }
    groupedByDescription.get(normalizedDesc).push(txn);
  }

  const detectedSubscriptions = [];

  // Analyze each group for subscription patterns
  for (const [normalizedDesc, txns] of groupedByDescription) {
    // Need at least 2 occurrences
    if (txns.length < 2) continue;

    // Get amounts
    const amounts = txns.map(t => t.debit_amount);

    // Check amount variance (must be < 10%)
    const amountCV = coefficientOfVariation(amounts);
    if (amountCV > 10) continue;

    // Calculate intervals between transactions
    const dates = txns.map(t => new Date(t.transaction_date).getTime());
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }

    if (intervals.length === 0) continue;

    // Check date regularity
    // For monthly subscriptions, expect ~30 days with variance < 5 days
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const frequency = determineFrequency(avgInterval);

    // Calculate expected interval based on frequency
    let expectedInterval;
    switch (frequency) {
      case 'weekly': expectedInterval = 7; break;
      case 'fortnightly': expectedInterval = 14; break;
      case 'monthly': expectedInterval = 30; break;
      case 'quarterly': expectedInterval = 91; break;
      case 'yearly': expectedInterval = 365; break;
      default: expectedInterval = 30;
    }

    // Check if intervals are within 5 days of expected
    const dateVariances = intervals.map(i => Math.abs(i - expectedInterval));
    const maxDateVariance = Math.max(...dateVariances);
    if (maxDateVariance > 5 && frequency === 'monthly') continue;

    // Calculate date CV for confidence scoring
    const dateCV = coefficientOfVariation(intervals);

    // Calculate average amount and typical day
    const avgAmount = pennyPrecision(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    const daysOfMonth = txns.map(t => new Date(t.transaction_date).getDate());
    const avgDay = Math.round(daysOfMonth.reduce((a, b) => a + b, 0) / daysOfMonth.length);

    // Get last transaction date
    const lastTxn = txns[txns.length - 1];
    const lastDate = lastTxn.transaction_date;

    // Calculate confidence score
    const confidence = calculateConfidence(amountCV, dateCV, txns.length);

    detectedSubscriptions.push({
      pattern: normalizedDesc,
      merchant_name: extractMerchantName(txns[0].original_description || txns[0].description),
      typical_amount: avgAmount,
      frequency: frequency,
      confidence: confidence,
      last_date: lastDate,
      billing_day: avgDay,
      occurrence_count: txns.length
    });
  }

  // Sort by confidence (highest first)
  detectedSubscriptions.sort((a, b) => b.confidence - a.confidence);

  return detectedSubscriptions;
}

/**
 * Detect potential recurring income from transaction history.
 * Looks for credit transactions with:
 * - Same/similar source pattern
 * - Similar amounts (within 10% variance)
 * - Regular intervals (date variance < 5 days from expected)
 * - At least 2 occurrences
 *
 * @param {Database} db - The database instance
 * @returns {Array<Object>} Array of detected recurring income sources
 */
export function detectRecurringIncome(db) {
  // Get all non-transfer credit transactions
  const transactions = db.prepare(`
    SELECT
      id, account_id, transaction_date, description, original_description,
      debit_amount, credit_amount
    FROM transactions
    WHERE is_transfer = 0
      AND credit_amount > 0
    ORDER BY transaction_date ASC
  `).all();

  if (transactions.length === 0) {
    return [];
  }

  // Group transactions by normalized description
  const groupedByDescription = new Map();

  for (const txn of transactions) {
    const desc = txn.original_description || txn.description;
    const normalizedDesc = normalizeDescription(desc);

    if (!normalizedDesc || normalizedDesc.length < 3) continue;

    if (!groupedByDescription.has(normalizedDesc)) {
      groupedByDescription.set(normalizedDesc, []);
    }
    groupedByDescription.get(normalizedDesc).push(txn);
  }

  const detectedIncome = [];

  // Analyze each group for recurring income patterns
  for (const [normalizedDesc, txns] of groupedByDescription) {
    // Need at least 2 occurrences
    if (txns.length < 2) continue;

    // Get amounts
    const amounts = txns.map(t => t.credit_amount);

    // Check amount variance (must be < 10%)
    const amountCV = coefficientOfVariation(amounts);
    if (amountCV > 10) continue;

    // Calculate intervals between transactions
    const dates = txns.map(t => new Date(t.transaction_date).getTime());
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }

    if (intervals.length === 0) continue;

    // Check date regularity
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const frequency = determineFrequency(avgInterval);

    // Calculate expected interval based on frequency
    let expectedInterval;
    switch (frequency) {
      case 'weekly': expectedInterval = 7; break;
      case 'fortnightly': expectedInterval = 14; break;
      case 'monthly': expectedInterval = 30; break;
      case 'quarterly': expectedInterval = 91; break;
      case 'yearly': expectedInterval = 365; break;
      default: expectedInterval = 30;
    }

    // Check if intervals are within reasonable variance
    const dateVariances = intervals.map(i => Math.abs(i - expectedInterval));
    const maxDateVariance = Math.max(...dateVariances);
    if (maxDateVariance > 10 && frequency === 'monthly') continue;

    // Calculate date CV for confidence scoring
    const dateCV = coefficientOfVariation(intervals);

    // Calculate average amount and typical day
    const avgAmount = pennyPrecision(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    const daysOfMonth = txns.map(t => new Date(t.transaction_date).getDate());
    const avgDay = Math.round(daysOfMonth.reduce((a, b) => a + b, 0) / daysOfMonth.length);

    // Get last transaction date
    const lastTxn = txns[txns.length - 1];
    const lastDate = lastTxn.transaction_date;

    // Calculate confidence score
    const confidence = calculateConfidence(amountCV, dateCV, txns.length);

    detectedIncome.push({
      pattern: normalizedDesc,
      source_name: extractMerchantName(txns[0].original_description || txns[0].description),
      typical_amount: avgAmount,
      frequency: frequency,
      confidence: confidence,
      last_date: lastDate,
      billing_day: avgDay,
      occurrence_count: txns.length,
      type: 'income'
    });
  }

  // Sort by confidence (highest first)
  detectedIncome.sort((a, b) => b.confidence - a.confidence);

  return detectedIncome;
}

/**
 * Get subscriptions from the database.
 *
 * @param {Database} db - The database instance
 * @param {Object} options - Query options
 * @param {boolean} options.active_only - Only return active subscriptions (default: true)
 * @param {string} options.type - Filter by type: 'expense', 'income', or null for all (default: null)
 * @returns {Array<Object>} Array of subscriptions with category info
 */
export function getSubscriptions(db, options = { active_only: true }) {
  const { active_only = true, type = null } = options;

  const conditions = [];
  const params = [];

  if (active_only) {
    conditions.push('s.is_active = 1');
  }

  if (type && VALID_TYPES.includes(type)) {
    conditions.push('s.type = ?');
    params.push(type);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT
      s.*,
      c.name AS category_name,
      c.colour AS category_colour,
      c.icon AS category_icon
    FROM subscriptions s
    LEFT JOIN categories c ON s.category_id = c.id
    ${whereClause}
    ORDER BY s.display_name ASC
  `).all(...params);
}

/**
 * Convert subscription amount to monthly equivalent.
 * @param {number} amount - The subscription amount
 * @param {string} frequency - The billing frequency
 * @returns {number} Monthly equivalent amount
 */
function toMonthlyAmount(amount, frequency) {
  if (!amount) return 0;

  switch (frequency) {
    case 'weekly': return pennyPrecision(amount * 52 / 12);
    case 'fortnightly': return pennyPrecision(amount * 26 / 12);
    case 'monthly': return amount;
    case 'quarterly': return pennyPrecision(amount / 3);
    case 'yearly': return pennyPrecision(amount / 12);
    default: return amount;
  }
}

/**
 * Get subscription summary with totals and upcoming charges.
 * Includes separate totals for expenses and income.
 *
 * @param {Database} db - The database instance
 * @returns {Object} Summary with expense/income totals, counts, and upcoming
 */
export function getSubscriptionSummary(db) {
  // Get all active subscriptions
  const subscriptions = db.prepare(`
    SELECT expected_amount, frequency, next_expected_date, display_name, type
    FROM subscriptions
    WHERE is_active = 1
  `).all();

  // Calculate monthly totals by type
  let monthlyExpenses = 0;
  let monthlyIncome = 0;
  let expenseCount = 0;
  let incomeCount = 0;

  for (const sub of subscriptions) {
    const monthlyAmount = toMonthlyAmount(sub.expected_amount, sub.frequency);
    if (sub.type === 'income') {
      monthlyIncome += monthlyAmount;
      incomeCount++;
    } else {
      monthlyExpenses += monthlyAmount;
      expenseCount++;
    }
  }

  monthlyExpenses = pennyPrecision(monthlyExpenses);
  monthlyIncome = pennyPrecision(monthlyIncome);

  // Calculate net and yearly totals
  const monthlyNet = pennyPrecision(monthlyIncome - monthlyExpenses);
  const yearlyExpenses = pennyPrecision(monthlyExpenses * 12);
  const yearlyIncome = pennyPrecision(monthlyIncome * 12);
  const yearlyNet = pennyPrecision(monthlyNet * 12);

  // Get upcoming charges (next 7 days for summary) - expenses only
  const upcoming7Days = getUpcomingCharges(db, 7);
  const upcoming7DaysTotal = pennyPrecision(
    upcoming7Days.filter(sub => sub.type !== 'income').reduce((sum, sub) => sum + (sub.expected_amount || 0), 0)
  );

  // Get upcoming income (next 7 days)
  const upcoming7DaysIncome = pennyPrecision(
    upcoming7Days.filter(sub => sub.type === 'income').reduce((sum, sub) => sum + (sub.expected_amount || 0), 0)
  );

  return {
    // Legacy fields for backwards compatibility
    monthly_total: monthlyExpenses,
    yearly_total: yearlyExpenses,
    active_count: subscriptions.length,
    upcoming_7_days: upcoming7DaysTotal,
    // New detailed fields
    expenses: {
      monthly: monthlyExpenses,
      yearly: yearlyExpenses,
      count: expenseCount,
      upcoming_7_days: upcoming7DaysTotal
    },
    income: {
      monthly: monthlyIncome,
      yearly: yearlyIncome,
      count: incomeCount,
      upcoming_7_days: upcoming7DaysIncome
    },
    net: {
      monthly: monthlyNet,
      yearly: yearlyNet
    }
  };
}

/**
 * Get upcoming subscription charges within specified days.
 *
 * @param {Database} db - The database instance
 * @param {number} days - Number of days to look ahead (default: 30)
 * @returns {Array<Object>} Array of upcoming subscriptions
 */
export function getUpcomingCharges(db, days = 30) {
  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  const endDate = futureDate.toISOString().split('T')[0];

  return db.prepare(`
    SELECT
      s.*,
      c.name AS category_name,
      c.colour AS category_colour,
      c.icon AS category_icon
    FROM subscriptions s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.is_active = 1
      AND s.next_expected_date >= ?
      AND s.next_expected_date <= ?
    ORDER BY s.next_expected_date ASC
  `).all(today, endDate);
}

/**
 * Create a new subscription.
 *
 * @param {Database} db - The database instance
 * @param {Object} data - Subscription data
 * @returns {Object} Created subscription
 */
export function createSubscription(db, data) {
  const {
    merchant_pattern,
    display_name,
    category_id,
    expected_amount,
    frequency,
    billing_day,
    next_expected_date,
    last_charged_date,
    type
  } = data;

  // Validate required fields
  if (!merchant_pattern || !merchant_pattern.trim()) {
    throw new Error('merchant_pattern is required');
  }
  if (!display_name || !display_name.trim()) {
    throw new Error('display_name is required');
  }

  // Validate frequency if provided
  if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
    throw new Error(`Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}`);
  }

  // Validate type if provided
  if (type && !VALID_TYPES.includes(type)) {
    throw new Error(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  // Validate category if provided
  if (category_id !== undefined && category_id !== null) {
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
    if (!category) {
      throw new Error('Category not found');
    }
  }

  const result = db.prepare(`
    INSERT INTO subscriptions
    (merchant_pattern, display_name, category_id, expected_amount, frequency, billing_day, next_expected_date, last_charged_date, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    merchant_pattern.trim(),
    display_name.trim(),
    category_id || null,
    expected_amount || null,
    frequency || 'monthly',
    billing_day || null,
    next_expected_date || null,
    last_charged_date || null,
    type || 'expense'
  );

  return getSubscriptionById(db, result.lastInsertRowid);
}

/**
 * Get a single subscription by ID.
 *
 * @param {Database} db - The database instance
 * @param {number} id - Subscription ID
 * @returns {Object|null} Subscription or null if not found
 */
export function getSubscriptionById(db, id) {
  return db.prepare(`
    SELECT
      s.*,
      c.name AS category_name,
      c.colour AS category_colour,
      c.icon AS category_icon
    FROM subscriptions s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.id = ?
  `).get(id);
}

/**
 * Update an existing subscription.
 *
 * @param {Database} db - The database instance
 * @param {number} id - Subscription ID
 * @param {Object} data - Update data
 * @returns {Object} Updated subscription
 */
export function updateSubscription(db, id, data) {
  // Verify subscription exists
  const existing = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
  if (!existing) {
    throw new Error('Subscription not found');
  }

  const {
    display_name,
    merchant_pattern,
    category_id,
    expected_amount,
    frequency,
    billing_day,
    next_expected_date,
    last_charged_date,
    is_active,
    type
  } = data;

  // Validate frequency if provided
  if (frequency !== undefined && !VALID_FREQUENCIES.includes(frequency)) {
    throw new Error(`Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}`);
  }

  // Validate type if provided
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    throw new Error(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  // Validate category if provided
  if (category_id !== undefined && category_id !== null) {
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
    if (!category) {
      throw new Error('Category not found');
    }
  }

  // Build update query dynamically
  const updates = [];
  const params = [];

  if (display_name !== undefined) {
    updates.push('display_name = ?');
    params.push(display_name);
  }
  if (merchant_pattern !== undefined) {
    updates.push('merchant_pattern = ?');
    params.push(merchant_pattern);
  }
  if (category_id !== undefined) {
    updates.push('category_id = ?');
    params.push(category_id);
  }
  if (expected_amount !== undefined) {
    updates.push('expected_amount = ?');
    params.push(expected_amount);
  }
  if (frequency !== undefined) {
    updates.push('frequency = ?');
    params.push(frequency);
  }
  if (billing_day !== undefined) {
    updates.push('billing_day = ?');
    params.push(billing_day);
  }
  if (next_expected_date !== undefined) {
    updates.push('next_expected_date = ?');
    params.push(next_expected_date);
  }
  if (last_charged_date !== undefined) {
    updates.push('last_charged_date = ?');
    params.push(last_charged_date);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }
  if (type !== undefined) {
    updates.push('type = ?');
    params.push(type);
  }

  if (updates.length === 0) {
    return getSubscriptionById(db, id);
  }

  // Always update updated_at
  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`
    UPDATE subscriptions
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);

  return getSubscriptionById(db, id);
}

/**
 * Soft delete a subscription by setting is_active = 0.
 *
 * @param {Database} db - The database instance
 * @param {number} id - Subscription ID
 * @returns {Object} Deleted subscription info
 */
export function deleteSubscription(db, id) {
  // Get subscription first to return its info
  const existing = getSubscriptionById(db, id);
  if (!existing) {
    throw new Error('Subscription not found');
  }

  db.prepare(`
    UPDATE subscriptions
    SET is_active = 0, updated_at = datetime('now')
    WHERE id = ?
  `).run(id);

  return {
    ...existing,
    deleted: true,
    is_active: 0
  };
}
