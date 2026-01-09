/**
 * Cash Flow Forecasting Service
 *
 * Provides forecasting and projection capabilities:
 * - getCashFlowForecast: Project cash flow forward for N months
 * - getMonthlyAverages: Calculate average income/expenses over past months
 * - getScenarios: Generate optimistic/expected/conservative projections
 * - getSeasonalPatterns: Analyze spending patterns by month of year
 */

/**
 * Apply penny precision rounding to avoid floating point errors.
 * @param {number} amount - The amount to round
 * @returns {number} Amount rounded to 2 decimal places
 */
export function pennyPrecision(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Get the month string (YYYY-MM) for a date N months in the future.
 * @param {number} monthsAhead - Number of months ahead (0 = current month)
 * @returns {string} Month in YYYY-MM format
 */
function getFutureMonth(monthsAhead) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsAhead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get the month string (YYYY-MM) for a date N months in the past.
 * @param {number} monthsBack - Number of months back (0 = current month)
 * @returns {string} Month in YYYY-MM format
 */
function getPastMonth(monthsBack) {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsBack);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get total balance across all accounts.
 * @param {Database} db - The database instance
 * @returns {number} Total balance
 */
function getTotalBalance(db) {
  const result = db.prepare(`
    SELECT COALESCE(SUM(current_balance), 0) AS total
    FROM accounts
    WHERE is_active = 1
  `).get();
  return pennyPrecision(result.total);
}

/**
 * Get active recurring patterns from the database.
 * @param {Database} db - The database instance
 * @returns {Array<Object>} Active recurring patterns
 */
function getActiveRecurringPatterns(db) {
  return db.prepare(`
    SELECT
      rp.id,
      rp.description_pattern,
      rp.merchant_name,
      rp.typical_amount,
      rp.typical_day,
      rp.frequency,
      rp.category_id,
      rp.is_subscription,
      c.name AS category_name,
      c.type AS category_type
    FROM recurring_patterns rp
    LEFT JOIN categories c ON rp.category_id = c.id
    WHERE rp.is_active = 1
  `).all();
}

/**
 * Calculate average income and expenses over the past N months.
 * Excludes transfers from calculations.
 *
 * @param {Database} db - The database instance
 * @param {number} months - Number of months to look back (default: 6)
 * @returns {{ avgIncome: number, avgExpenses: number, avgNet: number, monthsAnalyzed: number }}
 */
export function getMonthlyAverages(db, months = 6) {
  // Calculate the date range
  const endMonth = getPastMonth(1); // Start from last month (current month is incomplete)
  const startMonth = getPastMonth(months);

  // Get monthly totals
  const monthlyData = db.prepare(`
    SELECT
      strftime('%Y-%m', transaction_date) AS month,
      COALESCE(SUM(CASE WHEN credit_amount > 0 THEN credit_amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN debit_amount > 0 THEN debit_amount ELSE 0 END), 0) AS expenses
    FROM transactions
    WHERE is_transfer = 0
      AND strftime('%Y-%m', transaction_date) >= ?
      AND strftime('%Y-%m', transaction_date) <= ?
    GROUP BY month
    ORDER BY month
  `).all(startMonth, endMonth);

  if (monthlyData.length === 0) {
    return {
      avgIncome: 0,
      avgExpenses: 0,
      avgNet: 0,
      monthsAnalyzed: 0
    };
  }

  const totalIncome = monthlyData.reduce((sum, m) => sum + m.income, 0);
  const totalExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0);
  const monthCount = monthlyData.length;

  const avgIncome = pennyPrecision(totalIncome / monthCount);
  const avgExpenses = pennyPrecision(totalExpenses / monthCount);

  return {
    avgIncome,
    avgExpenses,
    avgNet: pennyPrecision(avgIncome - avgExpenses),
    monthsAnalyzed: monthCount
  };
}

/**
 * Get cash flow forecast projecting forward for N months.
 * Uses historical averages and known recurring transactions.
 *
 * @param {Database} db - The database instance
 * @param {Object} options - Forecast options
 * @param {number} options.months - Number of months to project (default: 12)
 * @param {number} options.historyMonths - Number of months of history to analyze (default: 6)
 * @returns {{
 *   currentBalance: number,
 *   averages: Object,
 *   projections: Array<{
 *     month: string,
 *     projectedIncome: number,
 *     projectedExpenses: number,
 *     projectedNet: number,
 *     projectedBalance: number,
 *     recurringItems: Array<{ description: string, amount: number, type: string }>
 *   }>
 * }}
 */
export function getCashFlowForecast(db, options = {}) {
  const {
    months = 12,
    historyMonths = 6
  } = options;

  // Get current total balance
  const currentBalance = getTotalBalance(db);

  // Get historical averages
  const averages = getMonthlyAverages(db, historyMonths);

  // Get active recurring patterns
  const recurringPatterns = getActiveRecurringPatterns(db);

  // Build recurring items list (monthly recurring expenses/income)
  const recurringItems = recurringPatterns
    .filter(p => p.frequency === 'monthly')
    .map(p => ({
      description: p.merchant_name || p.description_pattern,
      amount: pennyPrecision(p.typical_amount || 0),
      type: p.category_type || 'expense',
      categoryId: p.category_id,
      categoryName: p.category_name
    }));

  // Project forward month by month
  const projections = [];
  let runningBalance = currentBalance;

  for (let i = 1; i <= months; i++) {
    const month = getFutureMonth(i);
    const projectedIncome = averages.avgIncome;
    const projectedExpenses = averages.avgExpenses;
    const projectedNet = pennyPrecision(projectedIncome - projectedExpenses);

    runningBalance = pennyPrecision(runningBalance + projectedNet);

    projections.push({
      month,
      projectedIncome,
      projectedExpenses,
      projectedNet,
      projectedBalance: runningBalance,
      recurringItems: recurringItems.map(item => ({ ...item }))
    });
  }

  return {
    currentBalance,
    averages,
    projections
  };
}

/**
 * Get three forecast scenarios: optimistic, expected, and conservative.
 * - Optimistic: +10% income, -10% expenses
 * - Expected: Average values
 * - Conservative: -10% income, +10% expenses
 *
 * @param {Database} db - The database instance
 * @param {Object} options - Scenario options
 * @param {number} options.months - Projection period in months (default: 12)
 * @param {number} options.historyMonths - History period for averages (default: 6)
 * @returns {{
 *   currentBalance: number,
 *   optimistic: Object,
 *   expected: Object,
 *   conservative: Object
 * }}
 */
export function getScenarios(db, options = {}) {
  const {
    months = 12,
    historyMonths = 6
  } = options;

  // Get current balance
  const currentBalance = getTotalBalance(db);

  // Get historical averages
  const averages = getMonthlyAverages(db, historyMonths);

  // Calculate scenarios
  const optimistic = {
    projectedIncome: pennyPrecision(averages.avgIncome * 1.10),
    projectedExpenses: pennyPrecision(averages.avgExpenses * 0.90),
    projectedNet: 0,
    projectedBalanceEnd: 0
  };
  optimistic.projectedNet = pennyPrecision(optimistic.projectedIncome - optimistic.projectedExpenses);
  optimistic.projectedBalanceEnd = pennyPrecision(currentBalance + (optimistic.projectedNet * months));

  const expected = {
    projectedIncome: averages.avgIncome,
    projectedExpenses: averages.avgExpenses,
    projectedNet: averages.avgNet,
    projectedBalanceEnd: pennyPrecision(currentBalance + (averages.avgNet * months))
  };

  const conservative = {
    projectedIncome: pennyPrecision(averages.avgIncome * 0.90),
    projectedExpenses: pennyPrecision(averages.avgExpenses * 1.10),
    projectedNet: 0,
    projectedBalanceEnd: 0
  };
  conservative.projectedNet = pennyPrecision(conservative.projectedIncome - conservative.projectedExpenses);
  conservative.projectedBalanceEnd = pennyPrecision(currentBalance + (conservative.projectedNet * months));

  return {
    currentBalance,
    optimistic,
    expected,
    conservative
  };
}

/**
 * Analyze spending patterns by month of year.
 * Returns average spending for each calendar month across all available data.
 *
 * @param {Database} db - The database instance
 * @param {number|null} categoryId - Optional category ID to filter by
 * @returns {Object.<string, number>} Object with month keys ("01"-"12") and average spending values
 */
export function getSeasonalPatterns(db, categoryId = null) {
  // Build category filter
  let categoryFilter = '';
  const params = [];

  if (categoryId !== null && categoryId !== undefined) {
    categoryFilter = 'AND category_id = ?';
    params.push(categoryId);
  }

  // Get spending grouped by calendar month, then average across years
  const monthlySpending = db.prepare(`
    SELECT
      strftime('%m', transaction_date) AS calendar_month,
      strftime('%Y', transaction_date) AS year,
      COALESCE(SUM(debit_amount), 0) AS total_spending
    FROM transactions
    WHERE is_transfer = 0
      AND debit_amount > 0
      ${categoryFilter}
    GROUP BY calendar_month, year
  `).all(...params);

  if (monthlySpending.length === 0) {
    return {};
  }

  // Group by calendar month and calculate average
  const monthTotals = new Map();

  for (const record of monthlySpending) {
    const month = record.calendar_month;
    if (!monthTotals.has(month)) {
      monthTotals.set(month, { total: 0, count: 0 });
    }
    const data = monthTotals.get(month);
    data.total += record.total_spending;
    data.count += 1;
  }

  // Calculate averages
  const result = {};
  for (const [month, data] of monthTotals) {
    result[month] = pennyPrecision(data.total / data.count);
  }

  return result;
}
