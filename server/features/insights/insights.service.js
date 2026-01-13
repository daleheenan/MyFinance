/**
 * Insights Service
 *
 * Provides financial health scoring, spending comparisons,
 * trend alerts, and personalized insights.
 */

import { getDb } from '../../core/database.js';

/**
 * Calculate Financial Health Score (0-100)
 * Components:
 * - Budget adherence (25%): How well user sticks to budgets
 * - Savings rate (25%): Income minus expenses / income
 * - Spending stability (20%): Consistency of monthly spending
 * - Balance trend (15%): 3-month balance trajectory
 * - Bill regularity (15%): On-time recurring payments
 *
 * @param {number} userId - User ID
 * @returns {Object} Health score with breakdown
 */
export function calculateFinancialHealthScore(userId) {
  const db = getDb();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  // Get last 6 months for calculations
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const startDate = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
  const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 1. Budget Adherence Score (25 points)
  const budgetScore = calculateBudgetAdherenceScore(db, userId, currentMonth);

  // 2. Savings Rate Score (25 points)
  const savingsScore = calculateSavingsRateScore(db, userId, startDate, endDate);

  // 3. Spending Stability Score (20 points)
  const stabilityScore = calculateSpendingStabilityScore(db, userId, startDate, endDate);

  // 4. Balance Trend Score (15 points)
  const trendScore = calculateBalanceTrendScore(db, userId);

  // 5. Bill Regularity Score (15 points)
  const billScore = calculateBillRegularityScore(db, userId);

  const totalScore = Math.round(budgetScore.score + savingsScore.score + stabilityScore.score + trendScore.score + billScore.score);

  // Determine health grade
  let grade, status, color;
  if (totalScore >= 80) {
    grade = 'A'; status = 'Excellent'; color = 'green';
  } else if (totalScore >= 65) {
    grade = 'B'; status = 'Good'; color = 'teal';
  } else if (totalScore >= 50) {
    grade = 'C'; status = 'Fair'; color = 'yellow';
  } else if (totalScore >= 35) {
    grade = 'D'; status = 'Needs Work'; color = 'orange';
  } else {
    grade = 'F'; status = 'Critical'; color = 'red';
  }

  // Generate tips based on lowest scores
  const tips = generateHealthTips(budgetScore, savingsScore, stabilityScore, trendScore, billScore);

  return {
    score: totalScore,
    grade,
    status,
    color,
    breakdown: {
      budget: { ...budgetScore, maxPoints: 25 },
      savings: { ...savingsScore, maxPoints: 25 },
      stability: { ...stabilityScore, maxPoints: 20 },
      trend: { ...trendScore, maxPoints: 15 },
      bills: { ...billScore, maxPoints: 15 }
    },
    tips,
    calculatedAt: new Date().toISOString()
  };
}

function calculateBudgetAdherenceScore(db, userId, month) {
  const budgets = db.prepare(`
    SELECT b.category_id, b.budgeted_amount, c.name as category_name,
           COALESCE(SUM(t.debit_amount), 0) as spent
    FROM budgets b
    JOIN categories c ON c.id = b.category_id
    LEFT JOIN transactions t ON t.category_id = b.category_id
      AND strftime('%Y-%m', t.transaction_date) = b.month
      AND t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)
    WHERE b.user_id = ? AND b.month = ?
    GROUP BY b.category_id
  `).all(userId, userId, month);

  if (budgets.length === 0) {
    return { score: 12.5, label: 'No budgets set', detail: 'Set budgets to track your spending' };
  }

  let onTrack = 0;
  let overBudget = 0;
  let totalVariance = 0;

  budgets.forEach(b => {
    const variance = (b.spent - b.budgeted_amount) / b.budgeted_amount;
    totalVariance += Math.max(0, variance);
    if (b.spent <= b.budgeted_amount * 1.1) {
      onTrack++;
    } else {
      overBudget++;
    }
  });

  const adherenceRate = onTrack / budgets.length;
  const score = Math.round(adherenceRate * 25);

  return {
    score,
    label: `${Math.round(adherenceRate * 100)}% on track`,
    detail: `${onTrack} of ${budgets.length} budgets on track`,
    onTrack,
    overBudget,
    totalBudgets: budgets.length
  };
}

function calculateSavingsRateScore(db, userId, startDate, endDate) {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(credit_amount), 0) as income,
      COALESCE(SUM(debit_amount), 0) as expenses
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND t.transaction_date BETWEEN ? AND ?
      AND t.is_transfer = 0
  `).get(userId, startDate, endDate);

  const income = totals.income || 0;
  const expenses = totals.expenses || 0;
  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;

  // Score: 25 points max
  // 20%+ savings = 25 points, 10% = 15 points, 0% = 5 points, negative = 0
  let score;
  if (savingsRate >= 20) score = 25;
  else if (savingsRate >= 15) score = 22;
  else if (savingsRate >= 10) score = 18;
  else if (savingsRate >= 5) score = 12;
  else if (savingsRate >= 0) score = 6;
  else score = 0;

  return {
    score,
    label: `${savingsRate.toFixed(1)}% savings rate`,
    detail: savingsRate >= 10 ? 'Great job saving!' : 'Try to save at least 10% of income',
    savingsRate: Math.round(savingsRate * 10) / 10,
    income,
    expenses,
    net
  };
}

function calculateSpendingStabilityScore(db, userId, startDate, endDate) {
  const monthlySpending = db.prepare(`
    SELECT strftime('%Y-%m', transaction_date) as month,
           SUM(debit_amount) as spending
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND t.transaction_date BETWEEN ? AND ?
      AND t.is_transfer = 0
    GROUP BY strftime('%Y-%m', transaction_date)
    ORDER BY month
  `).all(userId, startDate, endDate);

  if (monthlySpending.length < 2) {
    return { score: 10, label: 'Insufficient data', detail: 'Need more months of data' };
  }

  const values = monthlySpending.map(m => m.spending);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? (stdDev / mean) * 100 : 0; // Coefficient of variation

  // Score: 20 points max
  // CV < 10% = very stable, CV > 50% = very unstable
  let score;
  if (cv <= 10) score = 20;
  else if (cv <= 20) score = 16;
  else if (cv <= 30) score = 12;
  else if (cv <= 40) score = 8;
  else score = 4;

  return {
    score,
    label: cv <= 20 ? 'Stable spending' : 'Variable spending',
    detail: `${cv.toFixed(0)}% variation in monthly spending`,
    coefficientOfVariation: Math.round(cv),
    monthsAnalyzed: monthlySpending.length
  };
}

function calculateBalanceTrendScore(db, userId) {
  // Get balance 3 months ago vs now
  const today = new Date();
  const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  const threeMonthsAgoStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-${String(threeMonthsAgo.getDate()).padStart(2, '0')}`;

  // Get total balance across all accounts now
  const currentBalance = db.prepare(`
    SELECT COALESCE(SUM(current_balance), 0) as balance
    FROM accounts WHERE user_id = ? AND is_active = 1
  `).get(userId)?.balance || 0;

  // Estimate balance 3 months ago from transactions
  const netChange = db.prepare(`
    SELECT COALESCE(SUM(credit_amount), 0) - COALESCE(SUM(debit_amount), 0) as net
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ? AND t.transaction_date > ?
  `).get(userId, threeMonthsAgoStr)?.net || 0;

  const pastBalance = currentBalance - netChange;
  const changePercent = pastBalance !== 0 ? ((currentBalance - pastBalance) / Math.abs(pastBalance)) * 100 : 0;

  // Score: 15 points max
  let score;
  if (changePercent >= 10) score = 15;
  else if (changePercent >= 5) score = 12;
  else if (changePercent >= 0) score = 9;
  else if (changePercent >= -5) score = 6;
  else score = 3;

  return {
    score,
    label: changePercent >= 0 ? 'Balance growing' : 'Balance declining',
    detail: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}% over 3 months`,
    currentBalance,
    pastBalance,
    changePercent: Math.round(changePercent * 10) / 10
  };
}

function calculateBillRegularityScore(db, userId) {
  // Check recurring patterns for consistency
  const patterns = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN last_seen >= date('now', '-45 days') THEN 1 ELSE 0 END) as recent
    FROM recurring_patterns
    WHERE user_id = ? AND is_active = 1
  `).get(userId);

  if (!patterns || patterns.total === 0) {
    return { score: 10, label: 'No recurring bills tracked', detail: 'Add recurring bills to track' };
  }

  const regularityRate = patterns.recent / patterns.total;
  const score = Math.round(regularityRate * 15);

  return {
    score,
    label: `${Math.round(regularityRate * 100)}% bills on track`,
    detail: `${patterns.recent} of ${patterns.total} recurring payments up to date`,
    totalBills: patterns.total,
    recentBills: patterns.recent
  };
}

function generateHealthTips(budget, savings, stability, trend, bills) {
  const tips = [];
  const components = [
    { name: 'budget', ...budget, maxPoints: 25 },
    { name: 'savings', ...savings, maxPoints: 25 },
    { name: 'stability', ...stability, maxPoints: 20 },
    { name: 'trend', ...trend, maxPoints: 15 },
    { name: 'bills', ...bills, maxPoints: 15 }
  ].sort((a, b) => (a.score / a.maxPoints) - (b.score / b.maxPoints));

  // Generate tips for lowest scoring areas
  components.slice(0, 2).forEach(c => {
    const percentage = (c.score / c.maxPoints) * 100;
    if (percentage < 60) {
      switch (c.name) {
        case 'budget':
          tips.push({ icon: '📊', text: 'Review your budget categories - some are over limit' });
          break;
        case 'savings':
          tips.push({ icon: '💰', text: 'Try to increase your savings rate to at least 10%' });
          break;
        case 'stability':
          tips.push({ icon: '📈', text: 'Your spending varies a lot month to month - consider more consistent budgeting' });
          break;
        case 'trend':
          tips.push({ icon: '📉', text: 'Your balance has been declining - review expenses for cuts' });
          break;
        case 'bills':
          tips.push({ icon: '📅', text: 'Some recurring bills may be missed - check your subscriptions' });
          break;
      }
    }
  });

  // Add positive reinforcement if doing well
  if (tips.length === 0) {
    tips.push({ icon: '🌟', text: 'Great work! Keep maintaining your healthy financial habits' });
  }

  return tips;
}

/**
 * Get spending comparison insights (current vs previous period)
 * @param {number} userId - User ID
 * @returns {Array} List of comparison insights
 */
export function getSpendingComparisons(userId) {
  const db = getDb();
  const today = new Date();

  // Current month
  const currentStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const currentEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Previous month (same day range for fair comparison)
  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
  const prevEnd = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(Math.min(today.getDate(), new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate())).padStart(2, '0')}`;

  // Get spending by category for both periods
  const currentSpending = db.prepare(`
    SELECT c.id, c.name, c.colour, COALESCE(SUM(t.debit_amount), 0) as amount
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
      AND t.transaction_date BETWEEN ? AND ?
      AND t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)
      AND t.is_transfer = 0
    WHERE c.type = 'expense' AND (c.user_id = ? OR c.is_default = 1)
    GROUP BY c.id
    HAVING amount > 0
  `).all(currentStart, currentEnd, userId, userId);

  const prevSpending = db.prepare(`
    SELECT c.id, c.name, COALESCE(SUM(t.debit_amount), 0) as amount
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
      AND t.transaction_date BETWEEN ? AND ?
      AND t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)
      AND t.is_transfer = 0
    WHERE c.type = 'expense' AND (c.user_id = ? OR c.is_default = 1)
    GROUP BY c.id
  `).all(prevStart, prevEnd, userId, userId);

  const prevMap = new Map(prevSpending.map(p => [p.id, p.amount]));

  const insights = [];

  currentSpending.forEach(curr => {
    const prev = prevMap.get(curr.id) || 0;
    if (prev === 0 && curr.amount > 0) {
      insights.push({
        type: 'new_spending',
        category: curr.name,
        categoryId: curr.id,
        colour: curr.colour,
        currentAmount: curr.amount,
        previousAmount: 0,
        change: 100,
        message: `New spending in ${curr.name} this month`,
        sentiment: 'neutral'
      });
    } else if (prev > 0) {
      const change = ((curr.amount - prev) / prev) * 100;
      if (Math.abs(change) >= 15) { // Only show significant changes
        const direction = change > 0 ? 'more' : 'less';
        const sentiment = change > 0 ? 'negative' : 'positive';
        insights.push({
          type: 'comparison',
          category: curr.name,
          categoryId: curr.id,
          colour: curr.colour,
          currentAmount: curr.amount,
          previousAmount: prev,
          change: Math.round(change),
          message: `${Math.abs(Math.round(change))}% ${direction} on ${curr.name} vs last month`,
          sentiment
        });
      }
    }
  });

  // Sort by absolute change (most significant first)
  insights.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Add total comparison
  const totalCurrent = currentSpending.reduce((sum, c) => sum + c.amount, 0);
  const totalPrev = prevSpending.reduce((sum, p) => sum + p.amount, 0);
  const totalChange = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 0;

  return {
    insights: insights.slice(0, 5), // Top 5 insights
    totals: {
      current: totalCurrent,
      previous: totalPrev,
      change: Math.round(totalChange),
      message: totalChange >= 0
        ? `Total spending up ${Math.round(totalChange)}% from last month`
        : `Total spending down ${Math.abs(Math.round(totalChange))}% from last month`,
      sentiment: totalChange > 10 ? 'negative' : totalChange < -10 ? 'positive' : 'neutral'
    },
    period: {
      current: { start: currentStart, end: currentEnd },
      previous: { start: prevStart, end: prevEnd }
    }
  };
}

/**
 * Get category trend alerts (improving or worsening trends)
 * @param {number} userId - User ID
 * @returns {Array} List of trend alerts
 */
export function getCategoryTrendAlerts(userId) {
  const db = getDb();
  const today = new Date();

  // Get last 3 months of spending by category
  const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const startDate = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;

  const monthlyByCategory = db.prepare(`
    SELECT
      c.id as category_id,
      c.name as category_name,
      c.colour,
      strftime('%Y-%m', t.transaction_date) as month,
      SUM(t.debit_amount) as amount
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    JOIN categories c ON t.category_id = c.id
    WHERE a.user_id = ?
      AND t.transaction_date >= ?
      AND t.is_transfer = 0
      AND c.type = 'expense'
    GROUP BY c.id, strftime('%Y-%m', t.transaction_date)
    ORDER BY c.id, month
  `).all(userId, startDate);

  // Group by category
  const categoryMap = new Map();
  monthlyByCategory.forEach(row => {
    if (!categoryMap.has(row.category_id)) {
      categoryMap.set(row.category_id, {
        id: row.category_id,
        name: row.category_name,
        colour: row.colour,
        months: []
      });
    }
    categoryMap.get(row.category_id).months.push({
      month: row.month,
      amount: row.amount
    });
  });

  const alerts = [];

  categoryMap.forEach(cat => {
    if (cat.months.length >= 2) {
      const recent = cat.months[cat.months.length - 1].amount;
      const previous = cat.months[cat.months.length - 2].amount;
      const change = previous > 0 ? ((recent - previous) / previous) * 100 : 0;

      // Check for 3-month trend
      let trend = 'stable';
      if (cat.months.length >= 3) {
        const oldest = cat.months[0].amount;
        const middle = cat.months[1].amount;
        if (recent < middle && middle < oldest) {
          trend = 'improving'; // Consistently decreasing
        } else if (recent > middle && middle > oldest) {
          trend = 'worsening'; // Consistently increasing
        }
      }

      if (Math.abs(change) >= 20 || trend !== 'stable') {
        alerts.push({
          categoryId: cat.id,
          categoryName: cat.name,
          colour: cat.colour,
          recentAmount: recent,
          previousAmount: previous,
          change: Math.round(change),
          trend,
          type: change < -15 ? 'positive' : change > 15 ? 'warning' : 'info',
          message: generateTrendMessage(cat.name, change, trend)
        });
      }
    }
  });

  // Sort: improvements first, then warnings
  alerts.sort((a, b) => {
    if (a.type === 'positive' && b.type !== 'positive') return -1;
    if (a.type !== 'positive' && b.type === 'positive') return 1;
    return Math.abs(b.change) - Math.abs(a.change);
  });

  return alerts.slice(0, 6);
}

function generateTrendMessage(categoryName, change, trend) {
  if (trend === 'improving') {
    return `${categoryName} spending has been decreasing for 3 months straight`;
  } else if (trend === 'worsening') {
    return `${categoryName} spending has increased for 3 consecutive months`;
  } else if (change < -20) {
    return `Great job! ${categoryName} spending down ${Math.abs(Math.round(change))}%`;
  } else if (change > 20) {
    return `${categoryName} spending up ${Math.round(change)}% - worth reviewing`;
  }
  return `${categoryName} spending ${change >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(change))}%`;
}

/**
 * Get subscription cost summary
 * @param {number} userId - User ID
 * @returns {Object} Subscription summary with insights
 */
export function getSubscriptionSummary(userId) {
  const db = getDb();

  // Get active subscriptions
  const subscriptions = db.prepare(`
    SELECT s.*, c.name as category_name, c.colour
    FROM subscriptions s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.user_id = ? AND s.is_active = 1 AND s.type = 'expense'
    ORDER BY s.expected_amount DESC
  `).all(userId);

  // Also get from recurring patterns marked as subscriptions
  const recurringSubscriptions = db.prepare(`
    SELECT rp.*, c.name as category_name, c.colour
    FROM recurring_patterns rp
    LEFT JOIN categories c ON rp.category_id = c.id
    WHERE rp.user_id = ? AND rp.is_active = 1 AND rp.is_subscription = 1
    ORDER BY rp.typical_amount DESC
  `).all(userId);

  // Calculate totals
  let monthlyTotal = 0;
  const allSubs = [];

  subscriptions.forEach(s => {
    const monthlyAmount = calculateMonthlyAmount(s.expected_amount, s.frequency);
    monthlyTotal += monthlyAmount;
    allSubs.push({
      id: s.id,
      source: 'subscription',
      name: s.display_name,
      amount: s.expected_amount,
      monthlyAmount,
      frequency: s.frequency,
      category: s.category_name,
      colour: s.colour,
      lastCharged: s.last_charged_date,
      nextExpected: s.next_expected_date
    });
  });

  recurringSubscriptions.forEach(r => {
    // Avoid duplicates
    if (!allSubs.some(s => s.name?.toLowerCase() === r.merchant_name?.toLowerCase())) {
      const monthlyAmount = calculateMonthlyAmount(r.typical_amount, r.frequency);
      monthlyTotal += monthlyAmount;
      allSubs.push({
        id: r.id,
        source: 'recurring',
        name: r.merchant_name || r.description_pattern,
        amount: r.typical_amount,
        monthlyAmount,
        frequency: r.frequency,
        category: r.category_name,
        colour: r.colour,
        lastCharged: r.last_seen
      });
    }
  });

  // Get monthly income for percentage calculation
  const monthlyIncome = db.prepare(`
    SELECT AVG(monthly_income) as avg_income FROM (
      SELECT strftime('%Y-%m', transaction_date) as month, SUM(credit_amount) as monthly_income
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.user_id = ? AND t.is_transfer = 0
        AND t.transaction_date >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', transaction_date)
    )
  `).get(userId)?.avg_income || 0;

  const percentOfIncome = monthlyIncome > 0 ? (monthlyTotal / monthlyIncome) * 100 : 0;

  // Categorize subscriptions
  const byCategory = {};
  allSubs.forEach(s => {
    const cat = s.category || 'Uncategorized';
    if (!byCategory[cat]) {
      byCategory[cat] = { name: cat, colour: s.colour, total: 0, count: 0 };
    }
    byCategory[cat].total += s.monthlyAmount;
    byCategory[cat].count++;
  });

  // Find potentially unused (no transaction in 45+ days)
  const potentiallyUnused = allSubs.filter(s => {
    if (!s.lastCharged) return false;
    const lastDate = new Date(s.lastCharged);
    const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 45;
  });

  return {
    totals: {
      monthly: Math.round(monthlyTotal * 100) / 100,
      yearly: Math.round(monthlyTotal * 12 * 100) / 100,
      percentOfIncome: Math.round(percentOfIncome * 10) / 10,
      count: allSubs.length
    },
    subscriptions: allSubs.sort((a, b) => b.monthlyAmount - a.monthlyAmount),
    byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
    potentiallyUnused,
    insights: generateSubscriptionInsights(monthlyTotal, percentOfIncome, potentiallyUnused)
  };
}

function calculateMonthlyAmount(amount, frequency) {
  if (!amount) return 0;
  switch (frequency) {
    case 'weekly': return amount * 4.33;
    case 'fortnightly': return amount * 2.17;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
    default: return amount;
  }
}

function generateSubscriptionInsights(monthlyTotal, percentOfIncome, unused) {
  const insights = [];

  if (percentOfIncome > 15) {
    insights.push({
      type: 'warning',
      icon: '⚠️',
      message: `Subscriptions are ${percentOfIncome.toFixed(0)}% of your income - consider reviewing`
    });
  }

  if (unused.length > 0) {
    insights.push({
      type: 'info',
      icon: '💡',
      message: `${unused.length} subscription${unused.length > 1 ? 's' : ''} may be unused (no charge in 45+ days)`
    });
  }

  if (monthlyTotal > 100) {
    insights.push({
      type: 'tip',
      icon: '💰',
      message: `You could save £${(monthlyTotal * 12).toFixed(0)}/year by reviewing subscriptions`
    });
  }

  return insights;
}

/**
 * Get enhanced safe-to-spend calculation
 * @param {number} userId - User ID
 * @returns {Object} Safe to spend details
 */
export function getEnhancedSafeToSpend(userId) {
  const db = getDb();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  // Get current total balance
  const totalBalance = db.prepare(`
    SELECT COALESCE(SUM(current_balance), 0) as balance
    FROM accounts WHERE user_id = ? AND is_active = 1
  `).get(userId)?.balance || 0;

  // Get upcoming bills this month (from subscriptions and recurring)
  const upcomingBills = db.prepare(`
    SELECT display_name as name, expected_amount as amount, billing_day, frequency
    FROM subscriptions
    WHERE user_id = ? AND is_active = 1 AND type = 'expense'
      AND (billing_day > ? OR billing_day IS NULL)
    UNION ALL
    SELECT merchant_name as name, typical_amount as amount, typical_day as billing_day, frequency
    FROM recurring_patterns
    WHERE user_id = ? AND is_active = 1 AND is_subscription = 0
      AND (typical_day > ? OR typical_day IS NULL)
  `).all(userId, dayOfMonth, userId, dayOfMonth);

  const upcomingBillsTotal = upcomingBills.reduce((sum, b) => sum + (b.amount || 0), 0);

  // Get budget commitments remaining
  const budgetRemaining = db.prepare(`
    SELECT
      SUM(CASE WHEN spent < budgeted THEN budgeted - spent ELSE 0 END) as remaining
    FROM (
      SELECT b.budgeted_amount as budgeted, COALESCE(SUM(t.debit_amount), 0) as spent
      FROM budgets b
      LEFT JOIN transactions t ON t.category_id = b.category_id
        AND strftime('%Y-%m', t.transaction_date) = b.month
        AND t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)
      WHERE b.user_id = ? AND b.month = ?
      GROUP BY b.category_id
    )
  `).get(userId, userId, currentMonth)?.remaining || 0;

  // Calculate safe to spend
  const reserveForBills = upcomingBillsTotal;
  const safeToSpend = Math.max(0, totalBalance - reserveForBills);
  const dailyAllowance = daysRemaining > 0 ? safeToSpend / daysRemaining : 0;

  // Determine status
  let status, color;
  if (dailyAllowance >= 50) {
    status = 'healthy';
    color = 'green';
  } else if (dailyAllowance >= 20) {
    status = 'moderate';
    color = 'yellow';
  } else if (dailyAllowance >= 0) {
    status = 'tight';
    color = 'orange';
  } else {
    status = 'critical';
    color = 'red';
  }

  return {
    totalBalance,
    upcomingBills: {
      total: Math.round(upcomingBillsTotal * 100) / 100,
      count: upcomingBills.length,
      items: upcomingBills.slice(0, 5)
    },
    safeToSpend: Math.round(safeToSpend * 100) / 100,
    dailyAllowance: Math.round(dailyAllowance * 100) / 100,
    daysRemaining,
    status,
    color,
    message: generateSafeToSpendMessage(dailyAllowance, daysRemaining, status)
  };
}

function generateSafeToSpendMessage(daily, days, status) {
  if (status === 'critical') {
    return 'Your balance may not cover upcoming bills';
  } else if (status === 'tight') {
    return `Budget carefully - £${daily.toFixed(0)}/day for ${days} days`;
  } else if (status === 'moderate') {
    return `You can spend £${daily.toFixed(0)}/day and still cover your bills`;
  } else {
    return `You're in great shape - £${daily.toFixed(0)}/day available`;
  }
}
