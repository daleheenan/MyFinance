/**
 * Cash Flow Forecasting Service
 *
 * Provides forecasting and projection capabilities:
 * - getCashFlowForecast: Project cash flow forward for N months
 * - getMonthlyAverages: Calculate average income/expenses over past months
 * - getScenarios: Generate optimistic/expected/conservative projections
 * - getSeasonalPatterns: Analyze spending patterns by month of year
 *
 * Integrates with subscriptions for more accurate predictions by using
 * known recurring income and expenses as a baseline.
 */

import { getMonthsAhead, getMonthsAgo, getMonthString } from '../../core/dates.js';

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
  return getMonthString(getMonthsAhead(monthsAhead));
}

/**
 * Get the month string (YYYY-MM) for a date N months in the past.
 * @param {number} monthsBack - Number of months back (0 = current month)
 * @returns {string} Month in YYYY-MM format
 */
function getPastMonth(monthsBack) {
  return getMonthString(getMonthsAgo(monthsBack));
}

/**
 * Get total balance across all accounts for a user.
 * @param {Database} db - The database instance
 * @param {number} userId - User ID to filter by
 * @returns {number} Total balance
 */
function getTotalBalance(db, userId) {
  const result = db.prepare(`
    SELECT COALESCE(SUM(current_balance), 0) AS total
    FROM accounts
    WHERE is_active = 1 AND user_id = ?
  `).get(userId);
  return pennyPrecision(result.total);
}

/**
 * Get active recurring patterns from the database for a user.
 * @param {Database} db - The database instance
 * @param {number} userId - User ID to filter by
 * @returns {Array<Object>} Active recurring patterns
 */
function getActiveRecurringPatterns(db, userId) {
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
    WHERE rp.is_active = 1 AND rp.user_id = ?
  `).all(userId);
}

/**
 * Get active subscriptions from the database for a user.
 * @param {Database} db - The database instance
 * @param {number} userId - User ID to filter by
 * @returns {Array<Object>} Active subscriptions with category info
 */
function getActiveSubscriptions(db, userId) {
  return db.prepare(`
    SELECT
      s.id,
      s.display_name,
      s.merchant_pattern,
      s.expected_amount,
      s.frequency,
      s.billing_day,
      s.type,
      s.category_id,
      c.name AS category_name,
      c.type AS category_type
    FROM subscriptions s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.is_active = 1 AND s.user_id = ?
  `).all(userId);
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
 * Get monthly totals from subscriptions (income and expenses) for a user.
 * @param {Database} db - The database instance
 * @param {number} userId - User ID to filter by
 * @returns {{ monthlyIncome: number, monthlyExpenses: number, items: Array }}
 */
function getSubscriptionMonthlyTotals(db, userId) {
  const subscriptions = getActiveSubscriptions(db, userId);

  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  const items = [];

  for (const sub of subscriptions) {
    const monthlyAmount = toMonthlyAmount(sub.expected_amount, sub.frequency);

    if (sub.type === 'income') {
      monthlyIncome += monthlyAmount;
    } else {
      monthlyExpenses += monthlyAmount;
    }

    items.push({
      id: sub.id,
      description: sub.display_name,
      amount: monthlyAmount,
      type: sub.type || 'expense',
      frequency: sub.frequency,
      category_id: sub.category_id,
      category_name: sub.category_name,
      source: 'subscription'
    });
  }

  return {
    monthly_income: pennyPrecision(monthlyIncome),
    monthly_expenses: pennyPrecision(monthlyExpenses),
    items
  };
}

/**
 * Calculate average income and expenses over the past N months.
 * Uses all user accounts for accurate calculations.
 * Excludes transfers from calculations.
 *
 * @param {Database} db - The database instance
 * @param {number} months - Number of months to look back (default: 3)
 * @param {number} userId - User ID to filter by
 * @returns {{ avgIncome: number, avgExpenses: number, avgNet: number, monthsAnalyzed: number }}
 */
export function getMonthlyAverages(db, months = 3, userId = null) {
  // Calculate the date range
  const endMonth = getPastMonth(1); // Start from last month (current month is incomplete)
  const startMonth = getPastMonth(months);

  // Get monthly totals from user's accounts
  const monthlyData = db.prepare(`
    SELECT
      strftime('%Y-%m', t.transaction_date) AS month,
      COALESCE(SUM(CASE WHEN t.credit_amount > 0 THEN t.credit_amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN t.debit_amount > 0 THEN t.debit_amount ELSE 0 END), 0) AS expenses
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND t.is_transfer = 0
      AND strftime('%Y-%m', t.transaction_date) >= ?
      AND strftime('%Y-%m', t.transaction_date) <= ?
    GROUP BY month
    ORDER BY month
  `).all(userId, startMonth, endMonth);

  if (monthlyData.length === 0) {
    return {
      avg_income: 0,
      avg_expenses: 0,
      avg_net: 0,
      months_analyzed: 0
    };
  }

  const totalIncome = monthlyData.reduce((sum, m) => sum + m.income, 0);
  const totalExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0);
  const monthCount = monthlyData.length;

  const avgIncome = pennyPrecision(totalIncome / monthCount);
  const avgExpenses = pennyPrecision(totalExpenses / monthCount);

  return {
    avg_income: avgIncome,
    avg_expenses: avgExpenses,
    avg_net: pennyPrecision(avgIncome - avgExpenses),
    months_analyzed: monthCount
  };
}

/**
 * Get cash flow forecast projecting forward for N months.
 * Uses subscriptions as a baseline for known recurring income/expenses,
 * then adds variable spending from historical averages.
 *
 * @param {Database} db - The database instance
 * @param {Object} options - Forecast options
 * @param {number} options.months - Number of months to project (default: 12)
 * @param {number} options.historyMonths - Number of months of history to analyze (default: 3)
 * @param {number} options.userId - User ID to filter by
 * @returns {{
 *   currentBalance: number,
 *   averages: Object,
 *   subscriptions: Object,
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
    historyMonths = 3,
    userId = null
  } = options;

  // Get current total balance
  const currentBalance = getTotalBalance(db, userId);

  // Get historical averages
  const averages = getMonthlyAverages(db, historyMonths, userId);

  // Get subscription-based recurring items (more reliable than patterns)
  const subscriptionTotals = getSubscriptionMonthlyTotals(db, userId);

  // Get active recurring patterns (as fallback/additional data)
  const recurringPatterns = getActiveRecurringPatterns(db, userId);

  // Build recurring items list from patterns (excluding duplicates with subscriptions)
  const patternItems = recurringPatterns
    .filter(p => p.frequency === 'monthly')
    .map(p => ({
      description: p.merchant_name || p.description_pattern,
      amount: pennyPrecision(p.typical_amount || 0),
      type: p.category_type || 'expense',
      category_id: p.category_id,
      category_name: p.category_name,
      source: 'pattern'
    }));

  // Combine subscription items with pattern items
  const recurringItems = [...subscriptionTotals.items, ...patternItems];

  // Calculate base monthly projections using subscriptions as ground truth
  // Then add "variable" spending (historical average minus known recurring)
  const knownRecurringExpenses = subscriptionTotals.monthly_expenses;
  const knownRecurringIncome = subscriptionTotals.monthly_income;

  // Variable spending = historical average - known recurring
  // This captures non-subscription spending like groceries, dining, etc.
  const variableExpenses = pennyPrecision(
    Math.max(0, averages.avg_expenses - knownRecurringExpenses)
  );
  const variableIncome = pennyPrecision(
    Math.max(0, averages.avg_income - knownRecurringIncome)
  );

  // Project forward month by month
  const projections = [];
  let runningBalance = currentBalance;

  for (let i = 1; i <= months; i++) {
    const month = getFutureMonth(i);

    // Total projected = known recurring + variable
    const projectedIncome = pennyPrecision(knownRecurringIncome + variableIncome);
    const projectedExpenses = pennyPrecision(knownRecurringExpenses + variableExpenses);
    const projectedNet = pennyPrecision(projectedIncome - projectedExpenses);

    runningBalance = pennyPrecision(runningBalance + projectedNet);

    projections.push({
      month,
      projected_income: projectedIncome,
      projected_expenses: projectedExpenses,
      projected_net: projectedNet,
      projected_balance: runningBalance,
      recurring_items: recurringItems.map(item => ({ ...item })),
      breakdown: {
        known_income: knownRecurringIncome,
        variable_income: variableIncome,
        known_expenses: knownRecurringExpenses,
        variable_expenses: variableExpenses
      }
    });
  }

  return {
    current_balance: currentBalance,
    averages,
    subscriptions: {
      monthly_income: knownRecurringIncome,
      monthly_expenses: knownRecurringExpenses,
      monthly_net: pennyPrecision(knownRecurringIncome - knownRecurringExpenses),
      count: subscriptionTotals.items.length
    },
    projections
  };
}

/**
 * Get four forecast scenarios: subscriptions_only, optimistic, expected, and conservative.
 * Uses subscriptions as a baseline for known recurring amounts.
 * - Subscriptions Only: Only known recurring income and expenses (no variable spending)
 * - Optimistic: +10% variable income, -10% variable expenses (subscriptions stay fixed)
 * - Expected: Average values
 * - Conservative: -10% variable income, +10% variable expenses (subscriptions stay fixed)
 *
 * @param {Database} db - The database instance
 * @param {Object} options - Scenario options
 * @param {number} options.months - Projection period in months (default: 12)
 * @param {number} options.historyMonths - History period for averages (default: 3)
 * @param {number} options.userId - User ID to filter by
 * @returns {{
 *   currentBalance: number,
 *   subscriptions: Object,
 *   subscriptions_only: Object,
 *   optimistic: Object,
 *   expected: Object,
 *   conservative: Object
 * }}
 */
export function getScenarios(db, options = {}) {
  const {
    months = 12,
    historyMonths = 3,
    userId = null
  } = options;

  // Get current balance
  const currentBalance = getTotalBalance(db, userId);

  // Get historical averages
  const averages = getMonthlyAverages(db, historyMonths, userId);

  // Get subscription-based recurring amounts
  const subscriptionTotals = getSubscriptionMonthlyTotals(db, userId);
  const knownRecurringExpenses = subscriptionTotals.monthly_expenses;
  const knownRecurringIncome = subscriptionTotals.monthly_income;

  // Variable amounts = historical average - known recurring
  const variableExpenses = pennyPrecision(
    Math.max(0, averages.avg_expenses - knownRecurringExpenses)
  );
  const variableIncome = pennyPrecision(
    Math.max(0, averages.avg_income - knownRecurringIncome)
  );

  // Total expected = known recurring + variable
  const expectedIncome = pennyPrecision(knownRecurringIncome + variableIncome);
  const expectedExpenses = pennyPrecision(knownRecurringExpenses + variableExpenses);

  // Subscriptions Only: ONLY known recurring income and expenses, no variable spending
  const subscriptionsOnly = {
    projected_income: knownRecurringIncome,
    projected_expenses: knownRecurringExpenses,
    projected_net: pennyPrecision(knownRecurringIncome - knownRecurringExpenses),
    projected_balance_end: pennyPrecision(currentBalance + (pennyPrecision(knownRecurringIncome - knownRecurringExpenses) * months))
  };

  // Calculate scenarios
  // Optimistic: Subscriptions stay fixed, variable income +10%, variable expenses -10%
  const optimistic = {
    projected_income: pennyPrecision(knownRecurringIncome + (variableIncome * 1.10)),
    projected_expenses: pennyPrecision(knownRecurringExpenses + (variableExpenses * 0.90)),
    projected_net: 0,
    projected_balance_end: 0
  };
  optimistic.projected_net = pennyPrecision(optimistic.projected_income - optimistic.projected_expenses);
  optimistic.projected_balance_end = pennyPrecision(currentBalance + (optimistic.projected_net * months));

  const expected = {
    projected_income: expectedIncome,
    projected_expenses: expectedExpenses,
    projected_net: pennyPrecision(expectedIncome - expectedExpenses),
    projected_balance_end: pennyPrecision(currentBalance + (pennyPrecision(expectedIncome - expectedExpenses) * months))
  };

  // Conservative: Subscriptions stay fixed, variable income -10%, variable expenses +10%
  const conservative = {
    projected_income: pennyPrecision(knownRecurringIncome + (variableIncome * 0.90)),
    projected_expenses: pennyPrecision(knownRecurringExpenses + (variableExpenses * 1.10)),
    projected_net: 0,
    projected_balance_end: 0
  };
  conservative.projected_net = pennyPrecision(conservative.projected_income - conservative.projected_expenses);
  conservative.projected_balance_end = pennyPrecision(currentBalance + (conservative.projected_net * months));

  return {
    current_balance: currentBalance,
    subscriptions: {
      monthly_income: knownRecurringIncome,
      monthly_expenses: knownRecurringExpenses,
      monthly_net: pennyPrecision(knownRecurringIncome - knownRecurringExpenses),
      count: subscriptionTotals.items.length
    },
    subscriptions_only: subscriptionsOnly,
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
 * @param {number} userId - User ID to filter by
 * @returns {Object.<string, number>} Object with month keys ("01"-"12") and average spending values
 */
export function getSeasonalPatterns(db, categoryId = null, userId = null) {
  // Build filters
  const conditions = ['t.is_transfer = 0', 't.debit_amount > 0'];
  const params = [];

  if (categoryId !== null && categoryId !== undefined) {
    conditions.push('t.category_id = ?');
    params.push(categoryId);
  }

  if (userId) {
    conditions.push('a.user_id = ?');
    params.push(userId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get spending grouped by calendar month, then average across years
  const monthlySpending = db.prepare(`
    SELECT
      strftime('%m', t.transaction_date) AS calendar_month,
      strftime('%Y', t.transaction_date) AS year,
      COALESCE(SUM(t.debit_amount), 0) AS total_spending
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    ${whereClause}
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
