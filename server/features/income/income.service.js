/**
 * Income Analysis Service
 *
 * Provides income tracking, analysis, and insights.
 */

import { getDb } from '../../core/database.js';

/**
 * Get income summary for dashboard
 * @param {number} userId - User ID
 * @returns {Object} Income summary with trends
 */
export function getIncomeSummary(userId) {
  const db = getDb();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = today.getMonth() === 0
    ? `${today.getFullYear() - 1}-12`
    : `${today.getFullYear()}-${String(today.getMonth()).padStart(2, '0')}`;

  // This month's income
  const thisMonthIncome = db.prepare(`
    SELECT
      COALESCE(SUM(credit_amount), 0) as total,
      COUNT(*) as count
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND strftime('%Y-%m', t.transaction_date) = ?
      AND t.credit_amount > 0
      AND t.is_transfer = 0
  `).get(userId, currentMonth);

  // Last month's income
  const lastMonthIncome = db.prepare(`
    SELECT COALESCE(SUM(credit_amount), 0) as total
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND strftime('%Y-%m', t.transaction_date) = ?
      AND t.credit_amount > 0
      AND t.is_transfer = 0
  `).get(userId, lastMonth);

  // Average monthly income (last 6 months)
  const avgIncome = db.prepare(`
    SELECT AVG(monthly_total) as average
    FROM (
      SELECT SUM(credit_amount) as monthly_total
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.user_id = ?
        AND t.transaction_date >= date('now', '-6 months')
        AND t.credit_amount > 0
        AND t.is_transfer = 0
      GROUP BY strftime('%Y-%m', t.transaction_date)
    )
  `).get(userId);

  const change = lastMonthIncome.total > 0
    ? ((thisMonthIncome.total - lastMonthIncome.total) / lastMonthIncome.total) * 100
    : 0;

  return {
    thisMonth: {
      total: thisMonthIncome.total,
      count: thisMonthIncome.count,
      month: currentMonth
    },
    lastMonth: {
      total: lastMonthIncome.total,
      month: lastMonth
    },
    average: avgIncome.average || 0,
    change: Math.round(change),
    trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
  };
}

/**
 * Get income by source/category
 * @param {number} userId - User ID
 * @param {number} months - Number of months to analyze
 * @returns {Array} Income breakdown by source
 */
export function getIncomeBySource(userId, months = 6) {
  const db = getDb();

  const sources = db.prepare(`
    SELECT
      COALESCE(c.name, 'Uncategorized') as source,
      c.colour,
      SUM(t.credit_amount) as total,
      COUNT(*) as transaction_count,
      AVG(t.credit_amount) as average_amount
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE a.user_id = ?
      AND t.transaction_date >= date('now', '-' || ? || ' months')
      AND t.credit_amount > 0
      AND t.is_transfer = 0
    GROUP BY c.id
    ORDER BY total DESC
  `).all(userId, months);

  const totalIncome = sources.reduce((sum, s) => sum + s.total, 0);

  return sources.map(s => ({
    ...s,
    percentage: totalIncome > 0 ? (s.total / totalIncome) * 100 : 0
  }));
}

/**
 * Get monthly income trend
 * @param {number} userId - User ID
 * @param {number} months - Number of months
 * @returns {Array} Monthly income data
 */
export function getMonthlyIncomeTrend(userId, months = 12) {
  const db = getDb();

  const trend = db.prepare(`
    SELECT
      strftime('%Y-%m', t.transaction_date) as month,
      SUM(t.credit_amount) as total,
      COUNT(*) as transaction_count
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND t.transaction_date >= date('now', '-' || ? || ' months')
      AND t.credit_amount > 0
      AND t.is_transfer = 0
    GROUP BY strftime('%Y-%m', t.transaction_date)
    ORDER BY month ASC
  `).all(userId, months);

  return trend;
}

/**
 * Get recurring income patterns
 * @param {number} userId - User ID
 * @returns {Array} Recurring income sources
 */
export function getRecurringIncome(userId) {
  const db = getDb();

  // Find regular income patterns (same description, consistent amounts)
  const patterns = db.prepare(`
    WITH IncomePatterns AS (
      SELECT
        t.description,
        AVG(t.credit_amount) as avg_amount,
        COUNT(*) as occurrence_count,
        MAX(t.transaction_date) as last_seen,
        c.name as category_name,
        c.colour
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE a.user_id = ?
        AND t.credit_amount > 0
        AND t.is_transfer = 0
        AND t.transaction_date >= date('now', '-6 months')
      GROUP BY LOWER(TRIM(t.description))
      HAVING occurrence_count >= 2
    )
    SELECT *
    FROM IncomePatterns
    ORDER BY avg_amount DESC
    LIMIT 10
  `).all(userId);

  // Also get from recurring_patterns marked as income
  const recurringPatterns = db.prepare(`
    SELECT
      rp.description_pattern as description,
      rp.merchant_name,
      rp.typical_amount as avg_amount,
      rp.frequency,
      rp.last_seen,
      c.name as category_name,
      c.colour
    FROM recurring_patterns rp
    LEFT JOIN categories c ON rp.category_id = c.id
    WHERE rp.user_id = ? AND rp.is_active = 1
  `).all(userId);

  // Get from subscriptions marked as income
  const subscriptionIncome = db.prepare(`
    SELECT
      s.display_name as description,
      s.expected_amount as avg_amount,
      s.frequency,
      s.last_charged_date as last_seen,
      c.name as category_name,
      c.colour
    FROM subscriptions s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.user_id = ? AND s.is_active = 1 AND s.type = 'income'
  `).all(userId);

  // Combine and deduplicate
  const all = [...patterns.map(p => ({ ...p, source: 'detected' }))];

  subscriptionIncome.forEach(s => {
    if (!all.some(a => a.description?.toLowerCase() === s.description?.toLowerCase())) {
      all.push({ ...s, source: 'subscription', occurrence_count: null });
    }
  });

  // Calculate monthly equivalent
  return all.map(item => {
    let monthlyAmount = item.avg_amount;
    if (item.frequency === 'weekly') monthlyAmount *= 4.33;
    else if (item.frequency === 'fortnightly') monthlyAmount *= 2.17;
    else if (item.frequency === 'quarterly') monthlyAmount /= 3;
    else if (item.frequency === 'yearly') monthlyAmount /= 12;

    return {
      ...item,
      monthlyAmount
    };
  });
}

/**
 * Get income vs expenses comparison
 * @param {number} userId - User ID
 * @param {number} months - Number of months
 * @returns {Array} Monthly income vs expenses
 */
export function getIncomeVsExpenses(userId, months = 12) {
  const db = getDb();

  const data = db.prepare(`
    SELECT
      strftime('%Y-%m', t.transaction_date) as month,
      COALESCE(SUM(CASE WHEN t.credit_amount > 0 THEN t.credit_amount END), 0) as income,
      COALESCE(SUM(CASE WHEN t.debit_amount > 0 THEN t.debit_amount END), 0) as expenses
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND t.transaction_date >= date('now', '-' || ? || ' months')
      AND t.is_transfer = 0
    GROUP BY strftime('%Y-%m', t.transaction_date)
    ORDER BY month ASC
  `).all(userId, months);

  return data.map(d => ({
    ...d,
    net: d.income - d.expenses,
    savingsRate: d.income > 0 ? ((d.income - d.expenses) / d.income) * 100 : 0
  }));
}
