/**
 * Anomaly Detection Service
 *
 * Detects unusual transaction patterns:
 * 1. unusual_amount - Transactions > 3 standard deviations from category average
 * 2. new_merchant_large - First-time merchant with amount > 100
 * 3. potential_duplicate - Same amount, same day, same description
 * 4. category_spike - Category spending 200%+ above monthly average
 */

import { getDaysAgo, getCurrentMonthUTC, parseDateUTC, getMonthString } from '../../core/dates.js';

/**
 * Round to penny precision (2 decimal places).
 * @param {number} amount - Amount to round
 * @returns {number} Rounded amount
 */
export function pennyPrecision(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Get date string for N days ago from a reference date.
 * @param {number} days - Number of days ago
 * @param {string|null} referenceDate - Reference date (YYYY-MM-DD) or null for today
 * @returns {string} Date in YYYY-MM-DD format
 */
function getDateDaysAgo(days, referenceDate = null) {
  const refDate = referenceDate ? parseDateUTC(referenceDate) : null;
  return getDaysAgo(days, refDate);
}

/**
 * Get month in YYYY-MM format from a reference date.
 * @param {string|null} referenceDate - Reference date (YYYY-MM-DD) or null for today
 * @returns {string} Month string
 */
function getMonth(referenceDate = null) {
  if (!referenceDate) {
    return getCurrentMonthUTC();
  }
  return getMonthString(parseDateUTC(referenceDate));
}

/**
 * Calculate standard deviation of an array of numbers.
 * @param {number[]} values - Array of numbers
 * @returns {{ mean: number, stdDev: number }} Mean and standard deviation
 */
function calculateStats(values) {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

  if (values.length === 1) {
    return { mean, stdDev: 0 };
  }

  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  return { mean, stdDev };
}

/**
 * Extract merchant pattern from description (first significant word).
 * @param {string} description - Transaction description
 * @returns {string} Merchant pattern
 */
function extractMerchantPattern(description) {
  // Remove numbers and special chars, get first word
  const cleaned = description.toUpperCase().replace(/[^A-Z\s]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  return words.length > 0 ? words[0] : description.toUpperCase().slice(0, 10);
}

/**
 * Detect anomalies in recent transactions.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {object} options - Detection options
 * @param {number} options.days - Number of days to look back (default: 30)
 * @param {string} options.referenceDate - Reference date for testing (YYYY-MM-DD)
 * @param {number} options.userId - User ID to filter by
 * @returns {object[]} Array of detected anomalies
 */
export function detectAnomalies(db, options = {}) {
  const { days = 30, referenceDate = null, userId = null } = options;
  const cutoffDate = getDateDaysAgo(days, referenceDate);
  const currentMonth = getMonth(referenceDate);
  const anomalies = [];

  // Build user filter for accounts
  let userFilter = '';
  const params = [cutoffDate];
  if (userId) {
    userFilter = 'AND t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)';
    params.push(userId);
  }

  // Get recent transactions within window
  const recentTransactions = db.prepare(`
    SELECT t.*, c.name as category_name
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.transaction_date >= ?
      AND t.debit_amount > 0
      AND t.is_transfer = 0
      ${userFilter}
    ORDER BY t.transaction_date DESC
  `).all(...params);

  // 1. Detect unusual_amount anomalies
  detectUnusualAmounts(db, recentTransactions, anomalies);

  // 2. Detect new_merchant_large anomalies
  detectNewMerchantLarge(db, recentTransactions, cutoffDate, anomalies, userId);

  // 3. Detect potential_duplicate anomalies
  detectPotentialDuplicates(recentTransactions, anomalies);

  // 4. Detect category_spike anomalies
  detectCategorySpikes(db, currentMonth, anomalies, userId);

  // Insert anomalies into database (avoiding duplicates)
  insertAnomalies(db, anomalies, userId);

  return anomalies;
}

/**
 * Detect transactions with amounts > 3 standard deviations from category average.
 * Uses leave-one-out approach: for each transaction, calculate stats excluding it.
 */
function detectUnusualAmounts(db, recentTransactions, anomalies) {
  // Group transactions by category
  const byCategory = new Map();

  for (const txn of recentTransactions) {
    if (!txn.category_id) continue;
    if (!byCategory.has(txn.category_id)) {
      byCategory.set(txn.category_id, []);
    }
    byCategory.get(txn.category_id).push(txn);
  }

  // Check each category for outliers using leave-one-out method
  for (const [categoryId, transactions] of byCategory) {
    if (transactions.length < 5) continue; // Need enough data points

    for (const txn of transactions) {
      // Calculate stats excluding this transaction
      const otherAmounts = transactions
        .filter(t => t.id !== txn.id)
        .map(t => t.debit_amount);

      if (otherAmounts.length < 4) continue; // Need enough reference points

      const { mean, stdDev } = calculateStats(otherAmounts);

      if (stdDev === 0) continue; // All same amounts

      const deviation = Math.abs(txn.debit_amount - mean) / stdDev;
      if (deviation > 3) {
        anomalies.push({
          transaction: {
            id: txn.id,
            description: txn.description,
            amount: txn.debit_amount,
            date: txn.transaction_date,
            category: txn.category_name
          },
          anomalyType: 'unusual_amount',
          severity: 'medium',
          description: `Amount ${pennyPrecision(txn.debit_amount)} is ${pennyPrecision(deviation)} standard deviations from category average of ${pennyPrecision(mean)}`
        });
      }
    }
  }
}

/**
 * Detect first-time merchants with transactions > 100.
 */
function detectNewMerchantLarge(db, recentTransactions, cutoffDate, anomalies, userId = null) {
  // Build user filter
  let userFilter = '';
  const baseParams = [];
  if (userId) {
    userFilter = 'AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)';
  }

  for (const txn of recentTransactions) {
    if (txn.debit_amount <= 100) continue;

    const merchantPattern = extractMerchantPattern(txn.description);

    // Build params for this query
    const params = [`%${merchantPattern}%`, txn.id, txn.transaction_date];
    if (userId) params.push(userId);

    // Check if merchant has appeared before this transaction
    const previousTxn = db.prepare(`
      SELECT id FROM transactions
      WHERE description LIKE ?
        AND id != ?
        AND transaction_date < ?
        ${userFilter}
      LIMIT 1
    `).get(...params);

    if (!previousTxn) {
      anomalies.push({
        transaction: {
          id: txn.id,
          description: txn.description,
          amount: txn.debit_amount,
          date: txn.transaction_date,
          category: txn.category_name
        },
        anomalyType: 'new_merchant_large',
        severity: 'low',
        description: `First transaction from new merchant "${merchantPattern}" with amount ${pennyPrecision(txn.debit_amount)}`
      });
    }
  }
}

/**
 * Detect potential duplicate transactions (same amount, same day, same description).
 */
function detectPotentialDuplicates(recentTransactions, anomalies) {
  // Group by date + description + amount
  const groups = new Map();

  for (const txn of recentTransactions) {
    const key = `${txn.transaction_date}|${txn.description}|${txn.debit_amount}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(txn);
  }

  // Find groups with more than one transaction
  for (const [key, transactions] of groups) {
    if (transactions.length > 1) {
      // Mark the second (and subsequent) as potential duplicates
      for (let i = 1; i < transactions.length; i++) {
        const txn = transactions[i];
        anomalies.push({
          transaction: {
            id: txn.id,
            description: txn.description,
            amount: txn.debit_amount,
            date: txn.transaction_date,
            category: txn.category_name
          },
          anomalyType: 'potential_duplicate',
          severity: 'high',
          description: `Potential duplicate transaction: same amount (${pennyPrecision(txn.debit_amount)}), same day, same description`
        });
      }
    }
  }
}

/**
 * Detect categories with spending 200%+ above monthly average.
 */
function detectCategorySpikes(db, currentMonth, anomalies, userId = null) {
  // Build user filter
  let userFilter = '';
  const params = [currentMonth];
  if (userId) {
    userFilter = 'AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)';
    params.push(userId);
  }

  // Get historical monthly spending by category (excluding current month)
  const historicalSpending = db.prepare(`
    SELECT
      category_id,
      strftime('%Y-%m', transaction_date) as month,
      SUM(debit_amount) as total
    FROM transactions
    WHERE is_transfer = 0
      AND debit_amount > 0
      AND strftime('%Y-%m', transaction_date) < ?
      ${userFilter}
    GROUP BY category_id, strftime('%Y-%m', transaction_date)
    ORDER BY category_id, month
  `).all(...params);

  // Calculate average monthly spending per category
  const categoryAverages = new Map();
  const categoryMonthCounts = new Map();

  for (const row of historicalSpending) {
    if (!categoryAverages.has(row.category_id)) {
      categoryAverages.set(row.category_id, 0);
      categoryMonthCounts.set(row.category_id, 0);
    }
    categoryAverages.set(row.category_id, categoryAverages.get(row.category_id) + row.total);
    categoryMonthCounts.set(row.category_id, categoryMonthCounts.get(row.category_id) + 1);
  }

  // Build params for current month query
  const currentParams = [currentMonth];
  if (userId) currentParams.push(userId);

  // Get current month spending by category
  // Note: Need to use t.account_id since transactions has alias 't'
  const userFilterAliased = userId ? 'AND t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)' : '';
  const currentSpending = db.prepare(`
    SELECT
      t.category_id,
      c.name as category_name,
      SUM(t.debit_amount) as total
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.is_transfer = 0
      AND t.debit_amount > 0
      AND strftime('%Y-%m', t.transaction_date) = ?
      ${userFilterAliased}
    GROUP BY t.category_id
  `).all(...currentParams);

  // Check for spikes
  for (const current of currentSpending) {
    const histTotal = categoryAverages.get(current.category_id) || 0;
    const monthCount = categoryMonthCounts.get(current.category_id) || 0;

    if (monthCount < 2) continue; // Need at least 2 months of history

    const avgMonthly = histTotal / monthCount;
    if (avgMonthly === 0) continue;

    const percentIncrease = (current.total / avgMonthly) * 100;

    if (percentIncrease >= 300) { // 200% above = 300% of average
      anomalies.push({
        transaction: null,
        categoryId: current.category_id,
        categoryName: current.category_name,
        anomalyType: 'category_spike',
        severity: 'medium',
        description: `${current.category_name} spending is ${pennyPrecision(percentIncrease - 100)}% above monthly average (${pennyPrecision(current.total)} vs avg ${pennyPrecision(avgMonthly)})`
      });
    }
  }
}

/**
 * Insert detected anomalies into database, avoiding duplicates.
 */
function insertAnomalies(db, anomalies, userId = null) {
  const insertStmt = db.prepare(`
    INSERT INTO anomalies (user_id, transaction_id, anomaly_type, severity, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  const checkExistsStmt = db.prepare(`
    SELECT id FROM anomalies
    WHERE transaction_id IS ?
      AND anomaly_type = ?
      AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))
    LIMIT 1
  `);

  const insertAll = db.transaction(() => {
    for (const anomaly of anomalies) {
      const txnId = anomaly.transaction?.id || null;

      // Check if already exists
      const existing = checkExistsStmt.get(txnId, anomaly.anomalyType, userId, userId);
      if (!existing) {
        insertStmt.run(userId, txnId, anomaly.anomalyType, anomaly.severity, anomaly.description);
      }
    }
  });

  insertAll();
}

/**
 * Get anomalies from database.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {object} options - Query options
 * @param {boolean} options.dismissed - Include dismissed anomalies (default: false)
 * @param {number} options.limit - Maximum number to return (default: 50)
 * @param {number} options.userId - User ID to filter by
 * @returns {object[]} Array of anomalies with transaction details
 */
export function getAnomalies(db, options = {}) {
  const { dismissed = false, limit = 50, userId = null } = options;

  const conditions = [];
  const params = [];

  if (!dismissed) {
    conditions.push('a.is_dismissed = 0');
  }

  if (userId) {
    conditions.push('a.user_id = ?');
    params.push(userId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      a.id,
      a.transaction_id,
      a.anomaly_type,
      a.severity,
      a.description,
      a.is_dismissed,
      a.is_confirmed_fraud,
      a.detected_at,
      t.description as transaction_description,
      t.debit_amount as transaction_amount,
      t.transaction_date
    FROM anomalies a
    LEFT JOIN transactions t ON t.id = a.transaction_id
    ${whereClause}
    ORDER BY a.detected_at DESC
    LIMIT ?
  `;

  params.push(limit);
  return db.prepare(query).all(...params);
}

/**
 * Dismiss an anomaly (mark as reviewed and not a concern).
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} anomalyId - Anomaly ID to dismiss
 * @param {number} userId - User ID to verify ownership
 * @returns {object} Result with success and dismissed info
 * @throws {Error} If anomaly not found or ID invalid
 */
export function dismissAnomaly(db, anomalyId, userId) {
  if (anomalyId == null) {
    throw new Error('Anomaly ID is required');
  }

  // Check anomaly exists and belongs to user
  const anomaly = db.prepare('SELECT id FROM anomalies WHERE id = ? AND user_id = ?').get(anomalyId, userId);
  if (!anomaly) {
    throw new Error('Anomaly not found');
  }

  db.prepare('UPDATE anomalies SET is_dismissed = 1 WHERE id = ? AND user_id = ?').run(anomalyId, userId);

  return {
    success: true,
    id: anomalyId,
    dismissed: true
  };
}

/**
 * Confirm an anomaly as fraud.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} anomalyId - Anomaly ID to confirm as fraud
 * @param {number} userId - User ID to verify ownership
 * @returns {object} Result with success and fraud confirmation info
 * @throws {Error} If anomaly not found or ID invalid
 */
export function confirmFraud(db, anomalyId, userId) {
  if (anomalyId == null) {
    throw new Error('Anomaly ID is required');
  }

  // Check anomaly exists and belongs to user
  const anomaly = db.prepare('SELECT id FROM anomalies WHERE id = ? AND user_id = ?').get(anomalyId, userId);
  if (!anomaly) {
    throw new Error('Anomaly not found');
  }

  db.prepare('UPDATE anomalies SET is_confirmed_fraud = 1 WHERE id = ? AND user_id = ?').run(anomalyId, userId);

  return {
    success: true,
    id: anomalyId,
    confirmedFraud: true
  };
}

/**
 * Get anomaly statistics - counts by type and severity.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} userId - User ID to filter by
 * @returns {object} Stats object with byType, bySeverity, totals
 */
export function getAnomalyStats(db, userId) {
  // Count by type
  const byType = db.prepare(`
    SELECT anomaly_type, COUNT(*) as count
    FROM anomalies
    WHERE user_id = ?
    GROUP BY anomaly_type
  `).all(userId);

  // Count by severity
  const bySeverity = db.prepare(`
    SELECT severity, COUNT(*) as count
    FROM anomalies
    WHERE user_id = ?
    GROUP BY severity
  `).all(userId);

  // Total counts
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_dismissed = 1 THEN 1 ELSE 0 END) as dismissed,
      SUM(CASE WHEN is_confirmed_fraud = 1 THEN 1 ELSE 0 END) as confirmedFraud,
      SUM(CASE WHEN is_dismissed = 0 AND is_confirmed_fraud = 0 THEN 1 ELSE 0 END) as pending
    FROM anomalies
    WHERE user_id = ?
  `).get(userId);

  // Convert to objects
  const byTypeObj = {};
  for (const row of byType) {
    byTypeObj[row.anomaly_type] = row.count;
  }

  const bySeverityObj = {};
  for (const row of bySeverity) {
    bySeverityObj[row.severity] = row.count;
  }

  return {
    byType: byTypeObj,
    bySeverity: bySeverityObj,
    total: totals?.total || 0,
    dismissed: totals?.dismissed || 0,
    confirmedFraud: totals?.confirmedFraud || 0,
    pending: totals?.pending || 0
  };
}
