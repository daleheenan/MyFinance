/**
 * Recurring Transactions Service
 *
 * Handles detection and management of recurring transaction patterns:
 * - detectRecurringPatterns(db) - Analyze transactions to find recurring patterns
 * - getRecurringTransactions(db, patternId) - Get all transactions for a pattern
 * - markAsRecurring(db, txnIds, patternId) - Link transactions to a pattern
 * - getAllPatterns(db) - Get all recurring patterns
 * - getPatternById(db, patternId) - Get pattern with details
 * - updatePattern(db, patternId, data) - Update pattern details
 * - deletePattern(db, patternId) - Delete pattern and unlink transactions
 */

/**
 * Apply penny precision rounding to avoid floating point errors.
 * @param {number} amount - The amount to round
 * @returns {number} Amount rounded to 2 decimal places
 */
function pennyPrecision(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Calculate the standard deviation of an array of numbers.
 * @param {number[]} values - Array of numbers
 * @returns {number} Standard deviation
 */
function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - mean, 2));
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
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
  return (standardDeviation(values) / Math.abs(mean)) * 100;
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
    // Remove standalone numbers (but keep alphanumeric codes)
    .replace(/\s\d+\s/g, ' ')
    .replace(/^\d+\s/, '')
    .replace(/\s\d+$/, '')
    // Remove reference numbers
    .replace(/REF[:\s]*\w+/gi, '')
    .replace(/TXN[:\s]*\w+/gi, '')
    // Remove common suffixes
    .replace(/\s*\*+\s*/g, ' ')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determine the frequency based on average interval in days.
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
 * Detect recurring transaction patterns from historical data.
 * Looks for transactions with:
 * - Same/similar description appearing multiple times
 * - Similar amounts (within 10% coefficient of variation)
 * - Regular intervals
 *
 * @param {Database} db - The database instance
 * @param {Object} options - Detection options
 * @param {number} options.minOccurrences - Minimum occurrences to be considered recurring (default: 3)
 * @param {number} options.maxAmountVariance - Maximum amount variance percentage (default: 10)
 * @param {number} options.lookbackMonths - Number of months to look back (default: 12, 0 for all)
 * @returns {Array<Object>} Array of detected patterns
 */
export function detectRecurringPatterns(db, options = {}) {
  const {
    minOccurrences = 3,
    maxAmountVariance = 10,
    lookbackMonths = 12
  } = options;

  // Build query with optional date filter
  const dateFilter = lookbackMonths > 0
    ? `AND transaction_date >= date('now', '-${lookbackMonths} months')`
    : '';

  // Get all transactions that are not transfers
  const transactions = db.prepare(`
    SELECT
      id, account_id, transaction_date, description, original_description,
      debit_amount, credit_amount, category_id, is_recurring, recurring_group_id
    FROM transactions
    WHERE is_transfer = 0
      ${dateFilter}
    ORDER BY transaction_date ASC
  `).all();

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

  const detectedPatterns = [];

  // Analyze each group for recurring patterns
  for (const [normalizedDesc, txns] of groupedByDescription) {
    if (txns.length < minOccurrences) continue;

    // Get amounts (use debit or credit, whichever is non-zero)
    const amounts = txns.map(t => t.debit_amount > 0 ? t.debit_amount : t.credit_amount);

    // Check amount variance
    const amountCV = coefficientOfVariation(amounts);
    if (amountCV > maxAmountVariance) continue;

    // Calculate intervals between transactions
    const dates = txns.map(t => new Date(t.transaction_date).getTime());
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }

    if (intervals.length === 0) continue;

    // Check if intervals are consistent (CV < 30% for intervals)
    const intervalCV = coefficientOfVariation(intervals);
    if (intervalCV > 30) continue;

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const frequency = determineFrequency(avgInterval);

    // Calculate typical day of month
    const daysOfMonth = txns.map(t => new Date(t.transaction_date).getDate());
    const avgDay = Math.round(daysOfMonth.reduce((a, b) => a + b, 0) / daysOfMonth.length);

    // Get most common category
    const categoryCount = new Map();
    for (const txn of txns) {
      if (txn.category_id) {
        categoryCount.set(txn.category_id, (categoryCount.get(txn.category_id) || 0) + 1);
      }
    }
    let mostCommonCategory = null;
    let maxCount = 0;
    for (const [catId, count] of categoryCount) {
      if (count > maxCount) {
        mostCommonCategory = catId;
        maxCount = count;
      }
    }

    // Get last seen date
    const lastTxn = txns[txns.length - 1];
    const lastSeen = lastTxn.transaction_date;

    // Create pattern object
    const pattern = {
      description_pattern: normalizedDesc,
      merchant_name: extractMerchantName(txns[0].original_description || txns[0].description),
      typical_amount: pennyPrecision(avgAmount),
      typical_day: avgDay,
      frequency: frequency,
      category_id: mostCommonCategory,
      last_seen: lastSeen,
      is_subscription: avgAmount > 0 && frequency === 'monthly',
      transaction_ids: txns.map(t => t.id),
      transaction_count: txns.length
    };

    detectedPatterns.push(pattern);
  }

  // Sort by number of transactions (most common first)
  detectedPatterns.sort((a, b) => b.transaction_count - a.transaction_count);

  return detectedPatterns;
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
    // Clean up
    .replace(/\s+/g, ' ')
    .trim();

  // Take first meaningful part (before special characters)
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
 * Get all recurring patterns from the database.
 *
 * @param {Database} db - The database instance
 * @returns {Array<Object>} Array of patterns with category info
 */
export function getAllPatterns(db) {
  const patterns = db.prepare(`
    SELECT
      rp.*,
      c.name AS category_name,
      c.colour AS category_colour,
      c.icon AS category_icon
    FROM recurring_patterns rp
    LEFT JOIN categories c ON rp.category_id = c.id
    WHERE rp.is_active = 1
    ORDER BY rp.last_seen DESC
  `).all();

  // Add transaction count for each pattern
  const countStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM transactions
    WHERE recurring_group_id = ?
  `);

  return patterns.map(p => ({
    ...p,
    transaction_count: countStmt.get(p.id)?.count || 0
  }));
}

/**
 * Get a single pattern by ID with category info.
 *
 * @param {Database} db - The database instance
 * @param {number} patternId - Pattern ID
 * @returns {Object|null} Pattern object or null if not found
 */
export function getPatternById(db, patternId) {
  const pattern = db.prepare(`
    SELECT
      rp.*,
      c.name AS category_name,
      c.colour AS category_colour,
      c.icon AS category_icon
    FROM recurring_patterns rp
    LEFT JOIN categories c ON rp.category_id = c.id
    WHERE rp.id = ?
  `).get(patternId);

  if (!pattern) return null;

  // Get transaction count
  const { count } = db.prepare(`
    SELECT COUNT(*) as count
    FROM transactions
    WHERE recurring_group_id = ?
  `).get(patternId);

  return {
    ...pattern,
    transaction_count: count
  };
}

/**
 * Get all transactions linked to a recurring pattern.
 *
 * @param {Database} db - The database instance
 * @param {number} patternId - Pattern ID
 * @returns {Array<Object>} Array of transactions
 */
export function getRecurringTransactions(db, patternId) {
  // Verify pattern exists
  const pattern = db.prepare('SELECT id FROM recurring_patterns WHERE id = ?').get(patternId);
  if (!pattern) {
    throw new Error('Pattern not found');
  }

  return db.prepare(`
    SELECT
      t.*,
      c.name AS category_name,
      c.colour AS category_colour,
      c.icon AS category_icon,
      a.account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.recurring_group_id = ?
    ORDER BY t.transaction_date DESC
  `).all(patternId);
}

/**
 * Mark transactions as belonging to a recurring pattern.
 *
 * @param {Database} db - The database instance
 * @param {number[]} txnIds - Array of transaction IDs
 * @param {number} patternId - Pattern ID to link to
 * @returns {number} Number of transactions updated
 */
export function markAsRecurring(db, txnIds, patternId) {
  if (!txnIds || txnIds.length === 0) {
    throw new Error('Transaction IDs are required');
  }

  // Verify pattern exists
  const pattern = db.prepare('SELECT id FROM recurring_patterns WHERE id = ?').get(patternId);
  if (!pattern) {
    throw new Error('Pattern not found');
  }

  // Verify all transactions exist
  const placeholders = txnIds.map(() => '?').join(',');
  const existingTxns = db.prepare(`
    SELECT id FROM transactions WHERE id IN (${placeholders})
  `).all(...txnIds);

  if (existingTxns.length !== txnIds.length) {
    throw new Error('One or more transactions not found');
  }

  // Update transactions
  const updateTxns = db.transaction(() => {
    const stmt = db.prepare(`
      UPDATE transactions
      SET is_recurring = 1, recurring_group_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    let updated = 0;
    for (const txnId of txnIds) {
      const result = stmt.run(patternId, txnId);
      updated += result.changes;
    }

    // Update pattern's last_seen date
    const lastDate = db.prepare(`
      SELECT MAX(transaction_date) as last_date
      FROM transactions
      WHERE recurring_group_id = ?
    `).get(patternId);

    if (lastDate?.last_date) {
      db.prepare(`
        UPDATE recurring_patterns
        SET last_seen = ?
        WHERE id = ?
      `).run(lastDate.last_date, patternId);
    }

    return updated;
  });

  return updateTxns();
}

/**
 * Create a new recurring pattern and optionally link transactions.
 *
 * @param {Database} db - The database instance
 * @param {Object} patternData - Pattern data
 * @param {number[]} [txnIds] - Optional transaction IDs to link
 * @returns {Object} Created pattern
 */
export function createPattern(db, patternData, txnIds = []) {
  const {
    description_pattern,
    merchant_name,
    typical_amount,
    typical_day,
    frequency,
    category_id,
    is_subscription = 0
  } = patternData;

  if (!description_pattern) {
    throw new Error('Description pattern is required');
  }

  // Verify category exists if provided
  if (category_id) {
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
    if (!category) {
      throw new Error('Category not found');
    }
  }

  const createPatternTxn = db.transaction(() => {
    // Create the pattern
    const result = db.prepare(`
      INSERT INTO recurring_patterns
      (description_pattern, merchant_name, typical_amount, typical_day, frequency, category_id, is_subscription, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))
    `).run(
      description_pattern,
      merchant_name || null,
      typical_amount || null,
      typical_day || null,
      frequency || 'monthly',
      category_id || null,
      is_subscription ? 1 : 0
    );

    const patternId = result.lastInsertRowid;

    // Link transactions if provided
    if (txnIds.length > 0) {
      const stmt = db.prepare(`
        UPDATE transactions
        SET is_recurring = 1, recurring_group_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `);

      for (const txnId of txnIds) {
        stmt.run(patternId, txnId);
      }

      // Update last_seen from transactions
      const lastDate = db.prepare(`
        SELECT MAX(transaction_date) as last_date
        FROM transactions
        WHERE recurring_group_id = ?
      `).get(patternId);

      if (lastDate?.last_date) {
        db.prepare(`
          UPDATE recurring_patterns
          SET last_seen = ?
          WHERE id = ?
        `).run(lastDate.last_date, patternId);
      }
    }

    return patternId;
  });

  const patternId = createPatternTxn();
  return getPatternById(db, patternId);
}

/**
 * Update a recurring pattern's details.
 *
 * @param {Database} db - The database instance
 * @param {number} patternId - Pattern ID
 * @param {Object} data - Update data
 * @returns {Object} Updated pattern
 */
export function updatePattern(db, patternId, data) {
  // Verify pattern exists
  const existing = db.prepare('SELECT * FROM recurring_patterns WHERE id = ?').get(patternId);
  if (!existing) {
    throw new Error('Pattern not found');
  }

  const {
    merchant_name,
    typical_amount,
    typical_day,
    frequency,
    category_id,
    is_subscription,
    is_active
  } = data;

  // Validate frequency if provided
  const validFrequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];
  if (frequency && !validFrequencies.includes(frequency)) {
    throw new Error('Invalid frequency. Must be one of: ' + validFrequencies.join(', '));
  }

  // Verify category exists if provided
  if (category_id !== undefined && category_id !== null) {
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
    if (!category) {
      throw new Error('Category not found');
    }
  }

  // Build update query dynamically
  const updates = [];
  const params = [];

  if (merchant_name !== undefined) {
    updates.push('merchant_name = ?');
    params.push(merchant_name);
  }
  if (typical_amount !== undefined) {
    updates.push('typical_amount = ?');
    params.push(typical_amount);
  }
  if (typical_day !== undefined) {
    updates.push('typical_day = ?');
    params.push(typical_day);
  }
  if (frequency !== undefined) {
    updates.push('frequency = ?');
    params.push(frequency);
  }
  if (category_id !== undefined) {
    updates.push('category_id = ?');
    params.push(category_id);
  }
  if (is_subscription !== undefined) {
    updates.push('is_subscription = ?');
    params.push(is_subscription ? 1 : 0);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return getPatternById(db, patternId);
  }

  params.push(patternId);

  db.prepare(`
    UPDATE recurring_patterns
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);

  // If category was updated, also update linked transactions
  if (category_id !== undefined) {
    db.prepare(`
      UPDATE transactions
      SET category_id = ?, updated_at = datetime('now')
      WHERE recurring_group_id = ?
    `).run(category_id, patternId);
  }

  return getPatternById(db, patternId);
}

/**
 * Delete a recurring pattern and unlink all associated transactions.
 *
 * @param {Database} db - The database instance
 * @param {number} patternId - Pattern ID
 * @returns {Object} Deletion result with unlinked transaction count
 */
export function deletePattern(db, patternId) {
  // Verify pattern exists
  const existing = db.prepare('SELECT * FROM recurring_patterns WHERE id = ?').get(patternId);
  if (!existing) {
    throw new Error('Pattern not found');
  }

  const deletePatternTxn = db.transaction(() => {
    // Unlink transactions
    const unlinkResult = db.prepare(`
      UPDATE transactions
      SET is_recurring = 0, recurring_group_id = NULL, updated_at = datetime('now')
      WHERE recurring_group_id = ?
    `).run(patternId);

    // Delete the pattern
    db.prepare('DELETE FROM recurring_patterns WHERE id = ?').run(patternId);

    return unlinkResult.changes;
  });

  const unlinkedCount = deletePatternTxn();

  return {
    deleted: true,
    pattern_id: patternId,
    transactions_unlinked: unlinkedCount
  };
}

/**
 * Unlink a transaction from its recurring pattern.
 *
 * @param {Database} db - The database instance
 * @param {number} txnId - Transaction ID
 * @returns {Object} Updated transaction
 */
export function unlinkTransaction(db, txnId) {
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
  if (!txn) {
    throw new Error('Transaction not found');
  }

  db.prepare(`
    UPDATE transactions
    SET is_recurring = 0, recurring_group_id = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(txnId);

  return db.prepare(`
    SELECT t.*, c.name AS category_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?
  `).get(txnId);
}
