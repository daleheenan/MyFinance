/**
 * Recurring Patterns Service
 * Detects and manages recurring transaction patterns (subscriptions, bills, salary)
 */

// Known subscription services for is_subscription detection
const SUBSCRIPTION_KEYWORDS = [
  'NETFLIX', 'SPOTIFY', 'DISNEY', 'AMAZON PRIME', 'APPLE', 'YOUTUBE',
  'HBO', 'HULU', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'AUDIBLE',
  'DROPBOX', 'GOOGLE', 'MICROSOFT', 'ADOBE', 'PATREON'
];

// Entertainment category ID
const ENTERTAINMENT_CATEGORY_ID = 5;

/**
 * Calculate the average of an array of numbers
 * @param {number[]} values
 * @returns {number}
 */
function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate the coefficient of variation (for amount consistency check)
 * @param {number[]} values
 * @returns {number} Coefficient of variation (0-1 range typically)
 */
function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  const avg = average(values);
  if (avg === 0) return 0;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return stdDev / avg;
}

/**
 * Get the day of month from a date string
 * @param {string} dateStr
 * @returns {number}
 */
function getDayOfMonth(dateStr) {
  return new Date(dateStr).getDate();
}

/**
 * Calculate the average gap in days between transactions
 * @param {Array} transactions - Sorted by date ascending
 * @returns {number}
 */
function calculateAverageGap(transactions) {
  if (transactions.length < 2) return 0;

  const gaps = [];
  for (let i = 1; i < transactions.length; i++) {
    const date1 = new Date(transactions[i - 1].transaction_date);
    const date2 = new Date(transactions[i].transaction_date);
    const diffDays = Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
    gaps.push(diffDays);
  }

  return average(gaps);
}

/**
 * Determine if amounts are consistent (within 10% variance)
 * @param {number[]} amounts
 * @returns {boolean}
 */
function areAmountsConsistent(amounts) {
  if (amounts.length < 2) return true;
  const cv = coefficientOfVariation(amounts);
  return cv <= 0.1; // 10% variance threshold
}

/**
 * Check if a description matches subscription keywords
 * @param {string} description
 * @returns {boolean}
 */
function isSubscriptionDescription(description) {
  const upperDesc = description.toUpperCase();
  return SUBSCRIPTION_KEYWORDS.some(keyword => upperDesc.includes(keyword));
}

/**
 * Classify frequency based on average gap between transactions
 * @param {Array} transactions - Array of transaction objects with transaction_date
 * @returns {{ frequency: string|null, typical_day: number|null, typical_amount: number }}
 */
export function classifyPattern(transactions) {
  if (transactions.length < 2) {
    return { frequency: null, typical_day: null, typical_amount: 0 };
  }

  // Sort by date
  const sorted = [...transactions].sort((a, b) =>
    new Date(a.transaction_date) - new Date(b.transaction_date)
  );

  const avgGap = calculateAverageGap(sorted);

  // Get amounts (use whichever is non-zero)
  const amounts = sorted.map(t => t.debit_amount > 0 ? t.debit_amount : t.credit_amount);
  const typicalAmount = Math.round(average(amounts) * 100) / 100;

  // Determine frequency based on gap
  let frequency = null;

  if (avgGap >= 4 && avgGap <= 10) {
    frequency = 'weekly';
  } else if (avgGap >= 11 && avgGap <= 18) {
    frequency = 'fortnightly';
  } else if (avgGap >= 25 && avgGap <= 35) {
    frequency = 'monthly';
  } else if (avgGap >= 80 && avgGap <= 100) {
    frequency = 'quarterly';
  } else if (avgGap >= 350 && avgGap <= 380) {
    frequency = 'yearly';
  }

  // Calculate typical day for monthly patterns
  let typicalDay = null;
  if (frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly') {
    const days = sorted.map(t => getDayOfMonth(t.transaction_date));
    typicalDay = Math.round(average(days));
  }

  return { frequency, typical_day: typicalDay, typical_amount: typicalAmount };
}

/**
 * Detect recurring patterns from transactions
 * @param {Object} db - Database connection
 * @param {number} [accountId] - Optional account ID to filter by
 * @returns {Array} Array of detected patterns
 */
export function detectRecurringPatterns(db, accountId = null) {
  // Get all transactions, optionally filtered by account
  let query = `
    SELECT id, account_id, transaction_date, description,
           debit_amount, credit_amount, category_id
    FROM transactions
    ORDER BY description, transaction_date
  `;

  let transactions;
  if (accountId) {
    query = `
      SELECT id, account_id, transaction_date, description,
             debit_amount, credit_amount, category_id
      FROM transactions
      WHERE account_id = ?
      ORDER BY description, transaction_date
    `;
    transactions = db.prepare(query).all(accountId);
  } else {
    transactions = db.prepare(query).all();
  }

  // Group by description (exact match)
  const grouped = {};
  for (const tx of transactions) {
    const key = tx.description;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(tx);
  }

  const detectedPatterns = [];

  for (const [description, txs] of Object.entries(grouped)) {
    // Minimum 3 occurrences required
    if (txs.length < 3) continue;

    // Check amount consistency
    const amounts = txs.map(t => t.debit_amount > 0 ? t.debit_amount : t.credit_amount);
    if (!areAmountsConsistent(amounts)) continue;

    // Classify the pattern
    const classification = classifyPattern(txs);

    // Skip if no valid frequency detected
    if (!classification.frequency) continue;

    // Determine if this is a subscription
    const isEntertainment = txs.some(t => t.category_id === ENTERTAINMENT_CATEGORY_ID);
    const hasSubscriptionKeyword = isSubscriptionDescription(description);
    const isSubscription = isEntertainment && hasSubscriptionKeyword ? 1 : 0;

    // Get last seen date
    const sortedByDate = [...txs].sort((a, b) =>
      new Date(b.transaction_date) - new Date(a.transaction_date)
    );
    const lastSeen = sortedByDate[0].transaction_date;

    // Get merchant name (first part before space or full description)
    const merchantName = description.split(' ')[0];

    // Check if pattern already exists in database
    const existingPattern = db.prepare(
      'SELECT id FROM recurring_patterns WHERE description_pattern = ?'
    ).get(description);

    let patternId;

    if (existingPattern) {
      // Update existing pattern
      db.prepare(`
        UPDATE recurring_patterns
        SET typical_amount = ?,
            typical_day = ?,
            frequency = ?,
            last_seen = ?,
            is_subscription = ?
        WHERE id = ?
      `).run(
        classification.typical_amount,
        classification.typical_day,
        classification.frequency,
        lastSeen,
        isSubscription,
        existingPattern.id
      );
      patternId = existingPattern.id;
    } else {
      // Insert new pattern
      const result = db.prepare(`
        INSERT INTO recurring_patterns
        (description_pattern, merchant_name, typical_amount, typical_day, frequency, last_seen, is_subscription, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        description,
        merchantName,
        classification.typical_amount,
        classification.typical_day,
        classification.frequency,
        lastSeen,
        isSubscription,
        txs[0].category_id
      );
      patternId = result.lastInsertRowid;
    }

    detectedPatterns.push({
      id: patternId,
      description_pattern: description,
      merchant_name: merchantName,
      typical_amount: classification.typical_amount,
      typical_day: classification.typical_day,
      frequency: classification.frequency,
      is_subscription: isSubscription,
      last_seen: lastSeen,
      occurrence_count: txs.length,
      transaction_ids: txs.map(t => t.id)
    });
  }

  return detectedPatterns;
}

/**
 * Get all regular payments grouped by frequency
 * @param {Object} db - Database connection
 * @returns {{ weekly: Array, monthly: Array, annual: Array }}
 */
export function getRegularPayments(db) {
  const patterns = db.prepare(`
    SELECT id, description_pattern, merchant_name, typical_amount, typical_day,
           frequency, is_subscription, last_seen, category_id
    FROM recurring_patterns
    WHERE is_active = 1
    ORDER BY typical_amount DESC
  `).all();

  const result = {
    weekly: [],
    monthly: [],
    annual: []
  };

  for (const pattern of patterns) {
    switch (pattern.frequency) {
      case 'weekly':
        result.weekly.push(pattern);
        break;
      case 'fortnightly':
        // Group fortnightly with weekly for simplicity
        result.weekly.push(pattern);
        break;
      case 'monthly':
        result.monthly.push(pattern);
        break;
      case 'quarterly':
        // Group quarterly with monthly
        result.monthly.push(pattern);
        break;
      case 'yearly':
        result.annual.push(pattern);
        break;
    }
  }

  return result;
}

/**
 * Mark transactions as recurring and link to a pattern
 * @param {Object} db - Database connection
 * @param {number[]} transactionIds - Array of transaction IDs to mark
 * @param {number} patternId - ID of the recurring pattern
 * @returns {{ changes: number }}
 */
export function markAsRecurring(db, transactionIds, patternId) {
  if (transactionIds.length === 0) {
    return { changes: 0 };
  }

  // Verify pattern exists
  const pattern = db.prepare('SELECT id FROM recurring_patterns WHERE id = ?').get(patternId);
  if (!pattern) {
    throw new Error(`Pattern with ID ${patternId} not found`);
  }

  // Create placeholders for IN clause
  const placeholders = transactionIds.map(() => '?').join(',');

  const stmt = db.prepare(`
    UPDATE transactions
    SET is_recurring = 1, recurring_group_id = ?
    WHERE id IN (${placeholders})
  `);

  const result = stmt.run(patternId, ...transactionIds);

  return { changes: result.changes };
}
