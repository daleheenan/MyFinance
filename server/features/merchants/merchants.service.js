/**
 * Merchants Service
 *
 * Provides merchant extraction, analysis, and statistics:
 * - extractMerchantName(description) - Extract clean merchant name from transaction
 * - getTopMerchants(db, options) - Get top merchants by spend or frequency
 * - getMerchantStats(db, merchantName) - Get detailed stats for a merchant
 * - getAllMerchants(db) - Get all merchants with stats
 */

// Known merchant patterns mapping
// Pattern (uppercase) -> Display Name
const KNOWN_MERCHANTS = {
  'TESCO': 'Tesco',
  'SAINSBURY': "Sainsbury's",
  'ASDA': 'Asda',
  'MORRISONS': 'Morrisons',
  'LIDL': 'Lidl',
  'ALDI': 'Aldi',
  'AMAZON': 'Amazon',
  'AMZN': 'Amazon',
  'NETFLIX': 'Netflix',
  'SPOTIFY': 'Spotify',
  'UBER': 'Uber',
  'DELIVEROO': 'Deliveroo',
  'MCDONALD': "McDonald's",
  'COSTA': 'Costa',
  'STARBUCKS': 'Starbucks',
  'TRAINLINE': 'Trainline',
  'TFL': 'TfL',
  'PAYPAL': 'PayPal'
};

/**
 * Extract merchant name from transaction description.
 * First checks against known patterns, then falls back to first word extraction.
 *
 * @param {string} description - Transaction description
 * @returns {string} Cleaned merchant name
 */
export function extractMerchantName(description) {
  // Handle null/undefined/empty
  if (!description || typeof description !== 'string') {
    return 'Unknown';
  }

  const trimmed = description.trim();
  if (!trimmed) {
    return 'Unknown';
  }

  const upper = trimmed.toUpperCase();

  // Check known patterns first
  for (const [pattern, name] of Object.entries(KNOWN_MERCHANTS)) {
    if (upper.includes(pattern)) {
      return name;
    }
  }

  // Default: Take first word, title case, remove numbers
  const firstWord = trimmed.split(/[\s*]/)[0];
  const cleaned = firstWord.replace(/[0-9]/g, '').trim();

  if (!cleaned) {
    return 'Unknown';
  }

  // Title case: first letter uppercase, rest lowercase
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

/**
 * Apply penny precision rounding to avoid floating point errors.
 * @param {number} amount - The amount to round
 * @returns {number} Amount rounded to 2 decimal places
 */
function pennyPrecision(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Get top merchants by spend or frequency.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {Object} options - Query options
 * @param {string} [options.by='spend'] - Sort by 'spend' or 'frequency'
 * @param {number} [options.limit=10] - Maximum number of merchants to return
 * @param {string} [options.month=null] - Filter by month (YYYY-MM format)
 * @param {string} [options.startDate] - Start date filter (YYYY-MM-DD)
 * @param {string} [options.endDate] - End date filter (YYYY-MM-DD)
 * @returns {Array<Object>} Array of merchant objects with stats
 */
export function getTopMerchants(db, options = {}) {
  const {
    by = 'spend',
    limit = 10,
    month = null,
    startDate,
    endDate
  } = options;

  // Build date filter clause
  let dateFilter = '';
  const params = [];

  if (month) {
    dateFilter = "AND strftime('%Y-%m', t.transaction_date) = ?";
    params.push(month);
  } else if (startDate && endDate) {
    dateFilter = 'AND t.transaction_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (startDate) {
    dateFilter = 'AND t.transaction_date >= ?';
    params.push(startDate);
  } else if (endDate) {
    dateFilter = 'AND t.transaction_date <= ?';
    params.push(endDate);
  }

  // Get all non-transfer debit transactions
  const transactions = db.prepare(`
    SELECT
      t.description,
      t.original_description,
      t.debit_amount,
      t.transaction_date
    FROM transactions t
    WHERE t.is_transfer = 0
      AND t.debit_amount > 0
      ${dateFilter}
  `).all(...params);

  // Group by extracted merchant name
  const merchantMap = new Map();

  for (const txn of transactions) {
    const desc = txn.original_description || txn.description;
    const merchantName = extractMerchantName(desc);

    if (!merchantMap.has(merchantName)) {
      merchantMap.set(merchantName, {
        name: merchantName,
        totalSpend: 0,
        transactionCount: 0,
        lastTransaction: null
      });
    }

    const merchant = merchantMap.get(merchantName);
    merchant.totalSpend += txn.debit_amount;
    merchant.transactionCount += 1;

    if (!merchant.lastTransaction || txn.transaction_date > merchant.lastTransaction) {
      merchant.lastTransaction = txn.transaction_date;
    }
  }

  // Convert to array, calculate averages, and sort
  let merchants = Array.from(merchantMap.values()).map(m => ({
    ...m,
    totalSpend: pennyPrecision(m.totalSpend),
    avgSpend: pennyPrecision(m.totalSpend / m.transactionCount)
  }));

  if (by === 'frequency') {
    merchants.sort((a, b) => b.transactionCount - a.transactionCount);
  } else {
    // Default: sort by spend
    merchants.sort((a, b) => b.totalSpend - a.totalSpend);
  }

  // Apply limit
  return merchants.slice(0, limit);
}

/**
 * Get detailed statistics for a specific merchant.
 * Matches transactions by pattern (case-insensitive substring match).
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} merchantPattern - Pattern to match in descriptions (case-insensitive)
 * @returns {Object|null} Merchant statistics or null if not found
 */
export function getMerchantStats(db, merchantPattern) {
  const patternUpper = merchantPattern.toUpperCase();

  // Find all matching transactions with category info
  const transactions = db.prepare(`
    SELECT t.*, c.id AS cat_id, c.name AS cat_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE (UPPER(t.description) LIKE ? OR UPPER(t.original_description) LIKE ?)
      AND t.debit_amount > 0
      AND t.is_transfer = 0
    ORDER BY t.transaction_date ASC
  `).all(`%${patternUpper}%`, `%${patternUpper}%`);

  if (transactions.length === 0) {
    return null;
  }

  // Calculate totals
  let totalSpend = 0;
  const categoryCounts = new Map();

  for (const txn of transactions) {
    totalSpend += txn.debit_amount;

    // Track category frequency
    if (txn.cat_id) {
      const current = categoryCounts.get(txn.cat_id) || { id: txn.cat_id, name: txn.cat_name, count: 0 };
      current.count += 1;
      categoryCounts.set(txn.cat_id, current);
    }
  }

  // Find most common category
  let mostCommonCategory = null;
  let maxCount = 0;

  for (const cat of categoryCounts.values()) {
    if (cat.count > maxCount) {
      maxCount = cat.count;
      mostCommonCategory = { id: cat.id, name: cat.name };
    }
  }

  // Extract merchant display name from first transaction
  const desc = transactions[0].original_description || transactions[0].description;
  const merchantName = extractMerchantName(desc);

  return {
    merchantName,
    totalSpend: pennyPrecision(totalSpend),
    transactionCount: transactions.length,
    avgSpend: pennyPrecision(totalSpend / transactions.length),
    firstSeen: transactions[0].transaction_date,
    lastSeen: transactions[transactions.length - 1].transaction_date,
    category: mostCommonCategory
  };
}

/**
 * Get monthly spending history for a merchant.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} merchantPattern - Pattern to match in descriptions (case-insensitive)
 * @param {number} [months=12] - Number of months to retrieve
 * @returns {Array<{month: string, spend: number, transactionCount: number}>}
 */
export function getMerchantHistory(db, merchantPattern, months = 12) {
  const patternUpper = merchantPattern.toUpperCase();
  const today = new Date();
  const result = [];

  // Generate month list (most recent first)
  for (let i = 0; i < months; i++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

    // Get spending for this month and merchant
    const data = db.prepare(`
      SELECT
        COALESCE(SUM(debit_amount), 0) AS spend,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE (UPPER(description) LIKE ? OR UPPER(original_description) LIKE ?)
        AND strftime('%Y-%m', transaction_date) = ?
        AND debit_amount > 0
        AND is_transfer = 0
    `).get(`%${patternUpper}%`, `%${patternUpper}%`, monthStr);

    // Get actual count (since COUNT returns 1 when no matches with SUM)
    const actualCount = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM transactions
      WHERE (UPPER(description) LIKE ? OR UPPER(original_description) LIKE ?)
        AND strftime('%Y-%m', transaction_date) = ?
        AND debit_amount > 0
        AND is_transfer = 0
    `).get(`%${patternUpper}%`, `%${patternUpper}%`, monthStr);

    result.push({
      month: monthStr,
      spend: pennyPrecision(data.spend),
      transactionCount: actualCount.cnt
    });
  }

  return result;
}

/**
 * Get all unique merchants with their stats.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @returns {Array<Object>} Array of all merchants with stats
 */
export function getAllMerchants(db) {
  // Get all non-transfer debit transactions
  const transactions = db.prepare(`
    SELECT
      t.description,
      t.original_description,
      t.debit_amount,
      t.transaction_date
    FROM transactions t
    WHERE t.is_transfer = 0
      AND t.debit_amount > 0
  `).all();

  // Group by merchant name
  const merchantMap = new Map();

  for (const txn of transactions) {
    const desc = txn.original_description || txn.description;
    const merchantName = extractMerchantName(desc);

    if (!merchantMap.has(merchantName)) {
      merchantMap.set(merchantName, {
        merchant_name: merchantName,
        total_spent: 0,
        transaction_count: 0,
        last_transaction: null
      });
    }

    const merchant = merchantMap.get(merchantName);
    merchant.total_spent += txn.debit_amount;
    merchant.transaction_count += 1;

    if (!merchant.last_transaction || txn.transaction_date > merchant.last_transaction) {
      merchant.last_transaction = txn.transaction_date;
    }
  }

  // Convert to array, sort by total_spent descending, and round amounts
  return Array.from(merchantMap.values())
    .sort((a, b) => b.total_spent - a.total_spent)
    .map(m => ({
      ...m,
      total_spent: Math.round(m.total_spent * 100) / 100
    }));
}
