/**
 * Bills Calendar Service
 *
 * Provides bill calendar data with predictions for upcoming bills.
 */

import { getDb } from '../../core/database.js';

/**
 * Get bill calendar for a month
 * @param {number} userId - User ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Object} Calendar data with bills by day
 */
export function getBillCalendar(userId, year, month) {
  const db = getDb();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10); // Last day of month
  const daysInMonth = new Date(year, month, 0).getDate();

  // Get actual transactions for the month (bills/recurring)
  const actualBills = db.prepare(`
    SELECT
      t.id,
      t.transaction_date,
      t.description,
      t.debit_amount as amount,
      c.name as category_name,
      c.colour as category_colour,
      'actual' as status
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)
      AND t.transaction_date BETWEEN ? AND ?
      AND t.is_recurring = 1
    ORDER BY t.transaction_date
  `).all(userId, startDate, endDate);

  // Get predicted bills from subscriptions
  const subscriptions = db.prepare(`
    SELECT
      id,
      display_name as name,
      expected_amount as amount,
      billing_day,
      frequency,
      last_charged_date
    FROM subscriptions
    WHERE user_id = ? AND is_active = 1 AND type = 'expense'
  `).all(userId);

  // Get predicted bills from recurring patterns
  const recurringPatterns = db.prepare(`
    SELECT
      id,
      merchant_name as name,
      description_pattern,
      typical_amount as amount,
      typical_day as billing_day,
      frequency,
      last_seen,
      c.name as category_name,
      c.colour as category_colour
    FROM recurring_patterns rp
    LEFT JOIN categories c ON rp.category_id = c.id
    WHERE rp.user_id = ? AND rp.is_active = 1
  `).all(userId);

  // Build calendar days
  const calendar = [];
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const currentDay = today.getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBills = [];

    // Add actual bills for this day
    actualBills.filter(b => b.transaction_date === date).forEach(bill => {
      dayBills.push({
        id: `actual-${bill.id}`,
        name: bill.description,
        amount: bill.amount,
        category: bill.category_name,
        colour: bill.category_colour,
        status: 'paid'
      });
    });

    // Add predicted bills for this day (only if not already paid)
    const isPast = year < currentYear ||
      (year === currentYear && month < currentMonth) ||
      (year === currentYear && month === currentMonth && day < currentDay);
    const isToday = year === currentYear && month === currentMonth && day === currentDay;

    if (!isPast || isToday) {
      // Check subscriptions
      subscriptions.forEach(sub => {
        if (sub.billing_day === day) {
          // Check if already paid this month
          const alreadyPaid = actualBills.some(ab =>
            ab.transaction_date === date &&
            ab.description.toLowerCase().includes(sub.name.toLowerCase())
          );
          if (!alreadyPaid) {
            dayBills.push({
              id: `sub-${sub.id}`,
              name: sub.name,
              amount: sub.amount,
              status: isToday ? 'due' : 'upcoming',
              source: 'subscription'
            });
          }
        }
      });

      // Check recurring patterns
      recurringPatterns.forEach(rp => {
        if (rp.billing_day === day) {
          const alreadyPaid = actualBills.some(ab =>
            ab.transaction_date === date &&
            (ab.description.toLowerCase().includes((rp.name || '').toLowerCase()) ||
             ab.description.toLowerCase().includes((rp.description_pattern || '').toLowerCase()))
          );
          if (!alreadyPaid) {
            dayBills.push({
              id: `rp-${rp.id}`,
              name: rp.name || rp.description_pattern,
              amount: rp.amount,
              category: rp.category_name,
              colour: rp.category_colour,
              status: isToday ? 'due' : 'upcoming',
              source: 'recurring'
            });
          }
        }
      });
    }

    calendar.push({
      day,
      date,
      isPast,
      isToday,
      bills: dayBills,
      total: dayBills.reduce((sum, b) => sum + (b.amount || 0), 0)
    });
  }

  // Calculate month summary
  const paidBills = calendar.flatMap(d => d.bills.filter(b => b.status === 'paid'));
  const upcomingBills = calendar.flatMap(d => d.bills.filter(b => b.status === 'upcoming' || b.status === 'due'));

  return {
    year,
    month,
    calendar,
    summary: {
      totalPaid: paidBills.reduce((sum, b) => sum + (b.amount || 0), 0),
      paidCount: paidBills.length,
      totalUpcoming: upcomingBills.reduce((sum, b) => sum + (b.amount || 0), 0),
      upcomingCount: upcomingBills.length,
      totalBills: paidBills.length + upcomingBills.length
    }
  };
}

/**
 * Get upcoming bills for the next N days
 * @param {number} userId - User ID
 * @param {number} days - Number of days to look ahead
 * @returns {Array} List of upcoming bills
 */
export function getUpcomingBills(userId, days = 30) {
  const db = getDb();
  const today = new Date();
  const endDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

  const bills = [];

  // Get subscriptions with billing days
  const subscriptions = db.prepare(`
    SELECT
      id,
      display_name as name,
      expected_amount as amount,
      billing_day,
      frequency,
      next_expected_date,
      c.name as category_name,
      c.colour as category_colour
    FROM subscriptions s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.user_id = ? AND s.is_active = 1 AND s.type = 'expense'
  `).all(userId);

  // Get recurring patterns
  const patterns = db.prepare(`
    SELECT
      id,
      merchant_name as name,
      description_pattern,
      typical_amount as amount,
      typical_day as billing_day,
      frequency,
      c.name as category_name,
      c.colour as category_colour
    FROM recurring_patterns rp
    LEFT JOIN categories c ON rp.category_id = c.id
    WHERE rp.user_id = ? AND rp.is_active = 1
  `).all(userId);

  // Calculate upcoming dates for each bill
  const addBillOccurrences = (bill, source) => {
    if (!bill.billing_day) return;

    // Find next occurrence
    let checkDate = new Date(today);
    while (checkDate <= endDate) {
      if (checkDate.getDate() === bill.billing_day) {
        const dateStr = checkDate.toISOString().slice(0, 10);
        const daysUntil = Math.ceil((checkDate - today) / (1000 * 60 * 60 * 24));
        bills.push({
          id: `${source}-${bill.id}-${dateStr}`,
          name: bill.name || bill.description_pattern,
          amount: bill.amount,
          date: dateStr,
          daysUntil,
          category: bill.category_name,
          colour: bill.category_colour,
          source
        });
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
  };

  subscriptions.forEach(s => addBillOccurrences(s, 'subscription'));
  patterns.forEach(p => addBillOccurrences(p, 'recurring'));

  // Sort by date
  bills.sort((a, b) => new Date(a.date) - new Date(b.date));

  return bills;
}

/**
 * Get bill predictions summary
 * @param {number} userId - User ID
 * @returns {Object} Summary of bill predictions
 */
export function getBillPredictionsSummary(userId) {
  const db = getDb();
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  // Get this month's expected bills
  const thisMonthBills = getUpcomingBills(userId, 31 - today.getDate());

  // Get last month's actual spending on recurring
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthStart = lastMonth.toISOString().slice(0, 10);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10);

  const lastMonthActual = db.prepare(`
    SELECT COALESCE(SUM(debit_amount), 0) as total
    FROM transactions t
    WHERE t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)
      AND t.transaction_date BETWEEN ? AND ?
      AND t.is_recurring = 1
  `).get(userId, lastMonthStart, lastMonthEnd);

  // Get this month's paid so far
  const thisMonthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const todayStr = today.toISOString().slice(0, 10);

  const thisMonthPaid = db.prepare(`
    SELECT COALESCE(SUM(debit_amount), 0) as total
    FROM transactions t
    WHERE t.account_id IN (SELECT id FROM accounts WHERE user_id = ?)
      AND t.transaction_date BETWEEN ? AND ?
      AND t.is_recurring = 1
  `).get(userId, thisMonthStart, todayStr);

  const upcomingTotal = thisMonthBills.reduce((sum, b) => sum + (b.amount || 0), 0);

  return {
    thisMonth: {
      paid: thisMonthPaid.total,
      upcoming: upcomingTotal,
      total: thisMonthPaid.total + upcomingTotal,
      upcomingBills: thisMonthBills.slice(0, 5)
    },
    lastMonth: {
      total: lastMonthActual.total
    },
    comparison: {
      vsLastMonth: lastMonthActual.total > 0
        ? ((thisMonthPaid.total + upcomingTotal - lastMonthActual.total) / lastMonthActual.total) * 100
        : 0
    }
  };
}
