/**
 * Analytics Service
 *
 * Provides analytics calculations for:
 * - Spending by category
 * - Income vs expenses comparison
 * - Spending trends
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
 * Parse date string to ensure consistency.
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {string} Validated date string
 */
function parseDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD');
  }
  return dateStr;
}

/**
 * Get start of month for a given date.
 * @param {Date} date - The date
 * @returns {string} First day of month in YYYY-MM-DD format
 */
function getMonthStart(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Get end of month for a given date.
 * @param {Date} date - The date
 * @returns {string} Last day of month in YYYY-MM-DD format
 */
function getMonthEnd(date) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
}

/**
 * Calculate date range based on preset or custom dates.
 * @param {string} range - Range preset: 'this_month', 'last_3_months', 'last_year', 'custom'
 * @param {string|null} startDate - Custom start date (required if range is 'custom')
 * @param {string|null} endDate - Custom end date (required if range is 'custom')
 * @returns {{ startDate: string, endDate: string }}
 */
export function calculateDateRange(range, startDate = null, endDate = null) {
  const today = new Date();

  switch (range) {
    case 'this_month':
      return {
        startDate: getMonthStart(today),
        endDate: getMonthEnd(today)
      };

    case 'last_3_months': {
      const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      return {
        startDate: getMonthStart(threeMonthsAgo),
        endDate: getMonthEnd(today)
      };
    }

    case 'last_year': {
      const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      return {
        startDate: `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}-${String(oneYearAgo.getDate()).padStart(2, '0')}`,
        endDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      };
    }

    case 'custom':
      if (!startDate || !endDate) {
        throw new Error('Custom range requires startDate and endDate');
      }
      return {
        startDate: parseDate(startDate),
        endDate: parseDate(endDate)
      };

    default:
      throw new Error('Invalid range. Expected: this_month, last_3_months, last_year, or custom');
  }
}

/**
 * Get spending grouped by category for a date range.
 * Excludes transfers and income transactions.
 *
 * @param {Database} db - The database instance
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} userId - User ID to filter by
 * @param {number|null} accountId - Optional account ID filter
 * @returns {Array<{ category_id: number, category_name: string, colour: string, icon: string, total: number, percentage: number, transaction_count: number }>}
 */
export function getSpendingByCategory(db, startDate, endDate, userId, accountId = null) {
  // Build query with user and optional account filter
  let accountFilter = '';
  const params = [startDate, endDate];

  if (accountId) {
    accountFilter = 'AND t.account_id = ?';
    params.push(accountId);
  }

  // Add userId params for the WHERE clause
  params.push(userId, userId);

  // Get spending by category (debits only, excluding transfers)
  const spending = db.prepare(`
    SELECT
      c.id AS category_id,
      c.name AS category_name,
      c.colour,
      c.icon,
      COALESCE(SUM(t.debit_amount), 0) AS total,
      COUNT(t.id) AS transaction_count
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
      AND t.transaction_date BETWEEN ? AND ?
      AND t.is_transfer = 0
      AND t.debit_amount > 0
      ${accountFilter}
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE c.type = 'expense'
      AND (c.user_id = ? OR c.user_id IS NULL)
      AND (a.user_id = ? OR a.user_id IS NULL OR t.id IS NULL)
    GROUP BY c.id, c.name, c.colour, c.icon
    HAVING total > 0
    ORDER BY total DESC
  `).all(...params);

  // Calculate total spending for percentages
  const totalSpending = spending.reduce((sum, cat) => sum + cat.total, 0);

  // Add percentages
  return spending.map(cat => ({
    category_id: cat.category_id,
    category_name: cat.category_name,
    colour: cat.colour,
    icon: cat.icon,
    total: pennyPrecision(cat.total),
    percentage: totalSpending > 0 ? pennyPrecision((cat.total / totalSpending) * 100) : 0,
    transaction_count: cat.transaction_count
  }));
}

/**
 * Get monthly income vs expenses for the last N months.
 * Excludes transfers from calculations.
 *
 * @param {Database} db - The database instance
 * @param {number} months - Number of months to retrieve (default 12)
 * @param {number} userId - User ID to filter by
 * @param {number|null} accountId - Optional account ID filter
 * @returns {Array<{ month: string, income: number, expenses: number, net: number }>}
 */
export function getIncomeVsExpenses(db, months = 12, userId, accountId = null) {
  const today = new Date();
  const results = [];

  // Build account filter - always filter by user
  let accountFilter = 'AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)';
  const baseParams = [userId];

  if (accountId) {
    accountFilter = 'AND account_id = ?';
    baseParams.length = 0;
    baseParams.push(accountId);
  }

  // Calculate for each month
  for (let i = months - 1; i >= 0; i--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

    // Get income (credits, excluding transfers)
    const incomeResult = db.prepare(`
      SELECT COALESCE(SUM(credit_amount), 0) AS total
      FROM transactions
      WHERE strftime('%Y-%m', transaction_date) = ?
        AND is_transfer = 0
        AND credit_amount > 0
        ${accountFilter}
    `).get(monthStr, ...baseParams);

    // Get expenses (debits, excluding transfers)
    const expenseResult = db.prepare(`
      SELECT COALESCE(SUM(debit_amount), 0) AS total
      FROM transactions
      WHERE strftime('%Y-%m', transaction_date) = ?
        AND is_transfer = 0
        AND debit_amount > 0
        ${accountFilter}
    `).get(monthStr, ...baseParams);

    const income = pennyPrecision(incomeResult.total || 0);
    const expenses = pennyPrecision(expenseResult.total || 0);

    results.push({
      month: monthStr,
      income,
      expenses,
      net: pennyPrecision(income - expenses)
    });
  }

  return results;
}

/**
 * Get spending trends grouped by day or week.
 * Excludes transfers from calculations.
 *
 * @param {Database} db - The database instance
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} groupBy - Grouping: 'day' or 'week'
 * @param {number} userId - User ID to filter by
 * @param {number|null} accountId - Optional account ID filter
 * @returns {Array<{ period: string, spending: number, income: number, transaction_count: number }>}
 */
export function getSpendingTrends(db, startDate, endDate, groupBy = 'day', userId, accountId = null) {
  // Validate groupBy
  if (!['day', 'week'].includes(groupBy)) {
    throw new Error('Invalid groupBy. Expected: day or week');
  }

  // Build account filter - always filter by user
  let accountFilter = 'AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)';
  const params = [startDate, endDate, userId];

  if (accountId) {
    accountFilter = 'AND account_id = ?';
    params.length = 2;
    params.push(accountId);
  }

  // Determine grouping expression
  const groupExpression = groupBy === 'day'
    ? "strftime('%Y-%m-%d', transaction_date)"
    : "strftime('%Y-W%W', transaction_date)";

  // Get trends
  const trends = db.prepare(`
    SELECT
      ${groupExpression} AS period,
      COALESCE(SUM(debit_amount), 0) AS spending,
      COALESCE(SUM(credit_amount), 0) AS income,
      COUNT(*) AS transaction_count
    FROM transactions
    WHERE transaction_date BETWEEN ? AND ?
      AND is_transfer = 0
      ${accountFilter}
    GROUP BY period
    ORDER BY period ASC
  `).all(...params);

  return trends.map(t => ({
    period: t.period,
    spending: pennyPrecision(t.spending),
    income: pennyPrecision(t.income),
    transaction_count: t.transaction_count
  }));
}

/**
 * Get top spending categories for a date range.
 *
 * @param {Database} db - The database instance
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} limit - Number of top categories to return (default 5)
 * @param {number} userId - User ID to filter by
 * @param {number|null} accountId - Optional account ID filter
 * @returns {Array<{ category_id: number, category_name: string, colour: string, icon: string, total: number }>}
 */
export function getTopSpendingCategories(db, startDate, endDate, limit = 5, userId, accountId = null) {
  const allSpending = getSpendingByCategory(db, startDate, endDate, userId, accountId);
  return allSpending.slice(0, limit);
}

/**
 * Get summary statistics for a date range.
 *
 * @param {Database} db - The database instance
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} userId - User ID to filter by
 * @param {number|null} accountId - Optional account ID filter
 * @returns {{ totalIncome: number, totalExpenses: number, net: number, transactionCount: number, avgDailySpending: number }}
 */
export function getSummaryStats(db, startDate, endDate, userId, accountId = null) {
  // Build account filter - always filter by user
  let accountFilter = 'AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)';
  const params = [startDate, endDate, userId];

  if (accountId) {
    accountFilter = 'AND account_id = ?';
    params.length = 2;
    params.push(accountId);
  }

  // Get totals
  const result = db.prepare(`
    SELECT
      COALESCE(SUM(credit_amount), 0) AS total_income,
      COALESCE(SUM(debit_amount), 0) AS total_expenses,
      COUNT(*) AS transaction_count
    FROM transactions
    WHERE transaction_date BETWEEN ? AND ?
      AND is_transfer = 0
      ${accountFilter}
  `).get(...params);

  const totalIncome = pennyPrecision(result.total_income || 0);
  const totalExpenses = pennyPrecision(result.total_expenses || 0);

  // Calculate number of days in range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

  return {
    totalIncome,
    totalExpenses,
    net: pennyPrecision(totalIncome - totalExpenses),
    transactionCount: result.transaction_count,
    avgDailySpending: daysDiff > 0 ? pennyPrecision(totalExpenses / daysDiff) : 0
  };
}

/**
 * Get Year-over-Year comparison for spending by category.
 * Compares current year with previous year.
 * Excludes transfers from calculations.
 *
 * @param {Database} db - The database instance
 * @param {Object} options - Options object
 * @param {number} options.year - The year to compare (default: current year)
 * @param {number|null} options.category_id - Optional category filter
 * @returns {{
 *   thisYear: number,
 *   lastYear: number,
 *   categories: Array<{
 *     category: { id: number, name: string, colour: string },
 *     thisYear: { total: number, count: number },
 *     lastYear: { total: number, count: number },
 *     change: { amount: number, percentage: number|null }
 *   }>,
 *   totals: {
 *     thisYear: { income: number, expenses: number },
 *     lastYear: { income: number, expenses: number }
 *   }
 * }}
 */
export function getYearOverYearComparison(db, options = {}) {
  const { year = new Date().getFullYear(), category_id = null, user_id = null } = options;
  const lastYear = year - 1;

  // Build category and user filters
  let categoryFilter = '';
  let userFilter = '';
  const baseParams = [];
  if (category_id) {
    categoryFilter = 'AND c.id = ?';
    baseParams.push(category_id);
  }
  if (user_id) {
    userFilter = 'AND t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)';
  }

  // Query spending by category for both years
  // Only include expense categories
  const queryParams = [
    String(year), String(year),
    String(lastYear), String(lastYear),
    String(year), String(lastYear),
    ...baseParams
  ];
  if (user_id) queryParams.push(user_id);

  const categoryData = db.prepare(`
    SELECT
      c.id AS category_id,
      c.name AS category_name,
      c.colour,
      COALESCE(SUM(CASE WHEN strftime('%Y', t.transaction_date) = ? THEN t.debit_amount ELSE 0 END), 0) AS this_year_total,
      COALESCE(SUM(CASE WHEN strftime('%Y', t.transaction_date) = ? THEN 1 ELSE 0 END), 0) AS this_year_count,
      COALESCE(SUM(CASE WHEN strftime('%Y', t.transaction_date) = ? THEN t.debit_amount ELSE 0 END), 0) AS last_year_total,
      COALESCE(SUM(CASE WHEN strftime('%Y', t.transaction_date) = ? THEN 1 ELSE 0 END), 0) AS last_year_count
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
      AND t.is_transfer = 0
      AND t.debit_amount > 0
      AND (strftime('%Y', t.transaction_date) = ? OR strftime('%Y', t.transaction_date) = ?)
      ${userFilter}
    WHERE c.type = 'expense'
      ${categoryFilter}
    GROUP BY c.id, c.name, c.colour
    HAVING this_year_total > 0 OR last_year_total > 0
    ORDER BY this_year_total DESC
  `).all(...queryParams);

  // Build categories array with change calculations
  const categories = categoryData.map(cat => {
    const thisYearTotal = pennyPrecision(cat.this_year_total);
    const lastYearTotal = pennyPrecision(cat.last_year_total);
    const changeAmount = pennyPrecision(thisYearTotal - lastYearTotal);

    // Handle division by zero for new categories
    let changePercentage = null;
    if (lastYearTotal > 0) {
      changePercentage = pennyPrecision((changeAmount / lastYearTotal) * 100);
    }

    return {
      category: {
        id: cat.category_id,
        name: cat.category_name,
        colour: cat.colour
      },
      thisYear: {
        total: thisYearTotal,
        count: cat.this_year_count
      },
      lastYear: {
        total: lastYearTotal,
        count: cat.last_year_count
      },
      change: {
        amount: changeAmount,
        percentage: changePercentage
      }
    };
  });

  // Calculate totals for both years
  const totalsParams = [
    String(year), String(year),
    String(lastYear), String(lastYear),
    String(year), String(lastYear)
  ];
  if (user_id) totalsParams.push(user_id);

  const totalsQuery = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN strftime('%Y', transaction_date) = ? AND credit_amount > 0 THEN credit_amount ELSE 0 END), 0) AS this_year_income,
      COALESCE(SUM(CASE WHEN strftime('%Y', transaction_date) = ? AND debit_amount > 0 THEN debit_amount ELSE 0 END), 0) AS this_year_expenses,
      COALESCE(SUM(CASE WHEN strftime('%Y', transaction_date) = ? AND credit_amount > 0 THEN credit_amount ELSE 0 END), 0) AS last_year_income,
      COALESCE(SUM(CASE WHEN strftime('%Y', transaction_date) = ? AND debit_amount > 0 THEN debit_amount ELSE 0 END), 0) AS last_year_expenses
    FROM transactions
    WHERE is_transfer = 0
      AND (strftime('%Y', transaction_date) = ? OR strftime('%Y', transaction_date) = ?)
      ${user_id ? 'AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)' : ''}
  `).get(...totalsParams);

  return {
    thisYear: year,
    lastYear: lastYear,
    categories,
    totals: {
      thisYear: {
        income: pennyPrecision(totalsQuery.this_year_income),
        expenses: pennyPrecision(totalsQuery.this_year_expenses)
      },
      lastYear: {
        income: pennyPrecision(totalsQuery.last_year_income),
        expenses: pennyPrecision(totalsQuery.last_year_expenses)
      }
    }
  };
}

/**
 * Get Month-over-Month Year-over-Year comparison.
 * Compares a specific month this year vs the same month last year.
 * Excludes transfers from calculations.
 *
 * @param {Database} db - The database instance
 * @param {string} month - The month to compare (format: "01" to "12")
 * @param {Object} options - Options object
 * @param {number} options.year - The year to compare (default: current year)
 * @param {number|null} options.category_id - Optional category filter
 * @returns {{
 *   thisYear: number,
 *   lastYear: number,
 *   month: string,
 *   categories: Array<{
 *     category: { id: number, name: string, colour: string },
 *     thisYear: { total: number, count: number },
 *     lastYear: { total: number, count: number },
 *     change: { amount: number, percentage: number|null }
 *   }>,
 *   totals: {
 *     thisYear: { income: number, expenses: number },
 *     lastYear: { income: number, expenses: number }
 *   }
 * }}
 */
/**
 * Get monthly expense breakdown showing what's included in average monthly expenses.
 * Returns data for the last N months with category breakdown and transaction details.
 *
 * @param {Database} db - The database instance
 * @param {number} months - Number of months to analyze (default: 3)
 * @returns {{
 *   months_analyzed: number,
 *   period: { start: string, end: string },
 *   avg_monthly_expenses: number,
 *   avg_monthly_income: number,
 *   monthly_breakdown: Array<{
 *     month: string,
 *     total_expenses: number,
 *     total_income: number,
 *     category_breakdown: Array<{
 *       category_id: number,
 *       category_name: string,
 *       colour: string,
 *       total: number,
 *       transaction_count: number
 *     }>
 *   }>,
 *   category_averages: Array<{
 *     category_id: number,
 *     category_name: string,
 *     colour: string,
 *     avg_monthly: number,
 *     total: number,
 *     transaction_count: number,
 *     percentage: number
 *   }>
 * }}
 */
export function getMonthlyExpenseBreakdown(db, months = 3, userId = null) {
  const today = new Date();
  const monthlyData = [];

  // Get primary account ID for user - first debit account or fallback
  let accountQuery = `SELECT id FROM accounts WHERE account_type = 'debit'`;
  const accountParams = [];
  if (userId) {
    accountQuery += ' AND user_id = ?';
    accountParams.push(userId);
  }
  accountQuery += ' ORDER BY id LIMIT 1';
  const primaryAccount = db.prepare(accountQuery).get(...accountParams);
  const mainAccountId = primaryAccount?.id || 1;

  // Calculate data for each of the last N months (excluding current month which is incomplete)
  for (let i = 1; i <= months; i++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

    // Get total expenses and income for this month (Main Account only)
    const totalsResult = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN debit_amount > 0 THEN debit_amount ELSE 0 END), 0) AS total_expenses,
        COALESCE(SUM(CASE WHEN credit_amount > 0 THEN credit_amount ELSE 0 END), 0) AS total_income
      FROM transactions
      WHERE account_id = ?
        AND strftime('%Y-%m', transaction_date) = ?
        AND is_transfer = 0
    `).get(mainAccountId, monthStr);

    // Get category breakdown for this month (Main Account only)
    const categoryBreakdown = db.prepare(`
      SELECT
        COALESCE(c.id, 0) AS category_id,
        COALESCE(c.name, 'Uncategorized') AS category_name,
        COALESCE(c.colour, '#8e8e93') AS colour,
        COALESCE(SUM(t.debit_amount), 0) AS total,
        COUNT(t.id) AS transaction_count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.account_id = ?
        AND strftime('%Y-%m', t.transaction_date) = ?
        AND t.is_transfer = 0
        AND t.debit_amount > 0
      GROUP BY COALESCE(c.id, 0), COALESCE(c.name, 'Uncategorized'), COALESCE(c.colour, '#8e8e93')
      ORDER BY total DESC
    `).all(mainAccountId, monthStr);

    monthlyData.push({
      month: monthStr,
      total_expenses: pennyPrecision(totalsResult.total_expenses),
      total_income: pennyPrecision(totalsResult.total_income),
      category_breakdown: categoryBreakdown.map(c => ({
        category_id: c.category_id,
        category_name: c.category_name,
        colour: c.colour,
        total: pennyPrecision(c.total),
        transaction_count: c.transaction_count
      }))
    });
  }

  // Calculate averages
  const totalExpenses = monthlyData.reduce((sum, m) => sum + m.total_expenses, 0);
  const totalIncome = monthlyData.reduce((sum, m) => sum + m.total_income, 0);
  const avgMonthlyExpenses = monthlyData.length > 0 ? pennyPrecision(totalExpenses / monthlyData.length) : 0;
  const avgMonthlyIncome = monthlyData.length > 0 ? pennyPrecision(totalIncome / monthlyData.length) : 0;

  // Calculate category averages across all months
  const categoryTotals = new Map();
  monthlyData.forEach(month => {
    month.category_breakdown.forEach(cat => {
      if (!categoryTotals.has(cat.category_id)) {
        categoryTotals.set(cat.category_id, {
          category_id: cat.category_id,
          category_name: cat.category_name,
          colour: cat.colour,
          total: 0,
          transaction_count: 0
        });
      }
      const existing = categoryTotals.get(cat.category_id);
      existing.total += cat.total;
      existing.transaction_count += cat.transaction_count;
    });
  });

  const categoryAverages = Array.from(categoryTotals.values())
    .map(cat => ({
      category_id: cat.category_id,
      category_name: cat.category_name,
      colour: cat.colour,
      avg_monthly: monthlyData.length > 0 ? pennyPrecision(cat.total / monthlyData.length) : 0,
      total: pennyPrecision(cat.total),
      transaction_count: cat.transaction_count,
      percentage: totalExpenses > 0 ? pennyPrecision((cat.total / totalExpenses) * 100) : 0
    }))
    .sort((a, b) => b.avg_monthly - a.avg_monthly);

  // Calculate period
  const startMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].month : '';
  const endMonth = monthlyData.length > 0 ? monthlyData[0].month : '';

  return {
    months_analyzed: monthlyData.length,
    period: {
      start: startMonth,
      end: endMonth
    },
    avg_monthly_expenses: avgMonthlyExpenses,
    avg_monthly_income: avgMonthlyIncome,
    monthly_breakdown: monthlyData,
    category_averages: categoryAverages
  };
}

/**
 * Get all available years with monthly income/expense data for year-over-year chart.
 * Returns data for all calendar years that have transaction data.
 *
 * @param {Database} db - The database instance
 * @param {number} userId - User ID to filter by
 * @returns {{
 *   years: Array<{
 *     year: number,
 *     months: Array<{
 *       month: number,
 *       income: number,
 *       expenses: number
 *     }>
 *   }>
 * }}
 */
export function getAllYearsComparison(db, userId) {
  // Get all distinct years with transactions
  const yearsResult = db.prepare(`
    SELECT DISTINCT strftime('%Y', transaction_date) as year
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND t.is_transfer = 0
    ORDER BY year DESC
  `).all(userId);

  const years = yearsResult.map(r => parseInt(r.year));

  // For each year, get monthly income and expenses
  const result = years.map(year => {
    const monthlyData = [];

    for (let month = 1; month <= 12; month++) {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;

      const monthResult = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN credit_amount > 0 THEN credit_amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN debit_amount > 0 THEN debit_amount ELSE 0 END), 0) AS expenses
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id = ?
          AND strftime('%Y-%m', t.transaction_date) = ?
          AND t.is_transfer = 0
      `).get(userId, monthStr);

      monthlyData.push({
        month,
        income: pennyPrecision(monthResult.income || 0),
        expenses: pennyPrecision(monthResult.expenses || 0)
      });
    }

    return {
      year,
      months: monthlyData
    };
  });

  return { years: result };
}

export function getMonthlyYoYComparison(db, month, options = {}) {
  // Validate month format
  if (!month || !/^(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('Invalid month format. Expected "01" to "12"');
  }

  const { year = new Date().getFullYear(), category_id = null, user_id = null } = options;
  const lastYear = year - 1;

  const thisYearMonth = `${year}-${month}`;
  const lastYearMonth = `${lastYear}-${month}`;

  // Build category and user filters
  let categoryFilter = '';
  let userFilter = '';
  const baseParams = [];
  if (category_id) {
    categoryFilter = 'AND c.id = ?';
    baseParams.push(category_id);
  }
  if (user_id) {
    userFilter = 'AND t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)';
  }

  // Query spending by category for both months
  const queryParams = [
    thisYearMonth, thisYearMonth,
    lastYearMonth, lastYearMonth,
    thisYearMonth, lastYearMonth,
    ...baseParams
  ];
  if (user_id) queryParams.push(user_id);

  const categoryData = db.prepare(`
    SELECT
      c.id AS category_id,
      c.name AS category_name,
      c.colour,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.transaction_date) = ? THEN t.debit_amount ELSE 0 END), 0) AS this_year_total,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.transaction_date) = ? THEN 1 ELSE 0 END), 0) AS this_year_count,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.transaction_date) = ? THEN t.debit_amount ELSE 0 END), 0) AS last_year_total,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.transaction_date) = ? THEN 1 ELSE 0 END), 0) AS last_year_count
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
      AND t.is_transfer = 0
      AND t.debit_amount > 0
      AND (strftime('%Y-%m', t.transaction_date) = ? OR strftime('%Y-%m', t.transaction_date) = ?)
      ${userFilter}
    WHERE c.type = 'expense'
      ${categoryFilter}
    GROUP BY c.id, c.name, c.colour
    HAVING this_year_total > 0 OR last_year_total > 0
    ORDER BY this_year_total DESC
  `).all(...queryParams);

  // Build categories array with change calculations
  const categories = categoryData.map(cat => {
    const thisYearTotal = pennyPrecision(cat.this_year_total);
    const lastYearTotal = pennyPrecision(cat.last_year_total);
    const changeAmount = pennyPrecision(thisYearTotal - lastYearTotal);

    // Handle division by zero for new categories
    let changePercentage = null;
    if (lastYearTotal > 0) {
      changePercentage = pennyPrecision((changeAmount / lastYearTotal) * 100);
    }

    return {
      category: {
        id: cat.category_id,
        name: cat.category_name,
        colour: cat.colour
      },
      thisYear: {
        total: thisYearTotal,
        count: cat.this_year_count
      },
      lastYear: {
        total: lastYearTotal,
        count: cat.last_year_count
      },
      change: {
        amount: changeAmount,
        percentage: changePercentage
      }
    };
  });

  // Calculate totals for both months
  const totalsParams = [
    thisYearMonth, thisYearMonth,
    lastYearMonth, lastYearMonth,
    thisYearMonth, lastYearMonth
  ];
  if (user_id) totalsParams.push(user_id);

  const totalsQuery = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', transaction_date) = ? AND credit_amount > 0 THEN credit_amount ELSE 0 END), 0) AS this_year_income,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', transaction_date) = ? AND debit_amount > 0 THEN debit_amount ELSE 0 END), 0) AS this_year_expenses,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', transaction_date) = ? AND credit_amount > 0 THEN credit_amount ELSE 0 END), 0) AS last_year_income,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', transaction_date) = ? AND debit_amount > 0 THEN debit_amount ELSE 0 END), 0) AS last_year_expenses
    FROM transactions
    WHERE is_transfer = 0
      AND (strftime('%Y-%m', transaction_date) = ? OR strftime('%Y-%m', transaction_date) = ?)
      ${user_id ? 'AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)' : ''}
  `).get(...totalsParams);

  return {
    thisYear: year,
    lastYear: lastYear,
    month,
    categories,
    totals: {
      thisYear: {
        income: pennyPrecision(totalsQuery.this_year_income),
        expenses: pennyPrecision(totalsQuery.this_year_expenses)
      },
      lastYear: {
        income: pennyPrecision(totalsQuery.last_year_income),
        expenses: pennyPrecision(totalsQuery.last_year_expenses)
      }
    }
  };
}
