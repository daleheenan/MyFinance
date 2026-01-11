/**
 * Analytics Routes
 *
 * API endpoints for analytics and reporting:
 * - GET /api/analytics/spending-by-category - Spending grouped by category
 * - GET /api/analytics/income-vs-expenses - Monthly income vs expenses
 * - GET /api/analytics/trends - Daily/weekly spending trends
 * - GET /api/analytics/summary - Summary statistics
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import {
  calculateDateRange,
  getSpendingByCategory,
  getIncomeVsExpenses,
  getSpendingTrends,
  getTopSpendingCategories,
  getSummaryStats,
  getYearOverYearComparison,
  getMonthlyYoYComparison,
  getMonthlyExpenseBreakdown,
  getAllYearsComparison
} from './analytics.service.js';
import anomaliesRouter from '../anomalies/anomalies.routes.js';

const router = Router();

// Mount anomalies sub-router at /api/analytics/anomalies
router.use('/anomalies', anomaliesRouter);

/**
 * Parse and validate account ID from query parameter.
 * @param {string|undefined} id - Account ID string
 * @returns {number|null} - Parsed ID or null
 */
function parseAccountId(id) {
  if (!id) return null;
  const parsed = parseInt(id, 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Validate that an account exists and belongs to user.
 * @param {Database} db - Database instance
 * @param {number} accountId - Account ID
 * @param {number} userId - User ID
 * @returns {boolean} - True if exists and belongs to user
 */
function accountExists(db, accountId, userId) {
  const account = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
  return !!account;
}

// ==========================================================================
// GET /api/analytics/spending-by-category
// ==========================================================================
router.get('/spending-by-category', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const {
      range = 'this_month',
      start_date: startDate,
      end_date: endDate,
      account_id: accountIdStr
    } = req.query;

    // Calculate date range
    let dateRange;
    try {
      dateRange = calculateDateRange(range, startDate, endDate);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    // Parse optional account filter
    const accountId = parseAccountId(accountIdStr);
    if (accountIdStr && !accountId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account_id'
      });
    }

    // Validate account exists and belongs to user if specified
    if (accountId && !accountExists(db, accountId, userId)) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const data = getSpendingByCategory(
      db,
      dateRange.startDate,
      dateRange.endDate,
      userId,
      accountId
    );

    res.json({
      success: true,
      data: {
        range: {
          start_date: dateRange.startDate,
          end_date: dateRange.endDate
        },
        categories: data
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/analytics/income-vs-expenses
// Supports both months param (legacy) and date range filtering
// ==========================================================================
router.get('/income-vs-expenses', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const {
      months = '12',
      range,
      start_date: startDate,
      end_date: endDate,
      account_id: accountIdStr
    } = req.query;

    // Parse optional account filter
    const accountId = parseAccountId(accountIdStr);
    if (accountIdStr && !accountId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account_id'
      });
    }

    // Validate account exists and belongs to user if specified
    if (accountId && !accountExists(db, accountId, userId)) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    let data;

    // If range is specified, use date range filtering
    if (range) {
      let dateRange;
      try {
        dateRange = calculateDateRange(range, startDate, endDate);
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }

      // Calculate months between start and end dates
      const start = new Date(dateRange.startDate);
      const end = new Date(dateRange.endDate);
      const monthsInRange = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;

      data = getIncomeVsExpenses(db, monthsInRange, userId, accountId, dateRange.startDate);
    } else {
      // Legacy: use months param
      const monthsNum = parseInt(months, 10);
      if (isNaN(monthsNum) || monthsNum < 1 || monthsNum > 24) {
        return res.status(400).json({
          success: false,
          error: 'Invalid months parameter. Expected 1-24.'
        });
      }
      data = getIncomeVsExpenses(db, monthsNum, userId, accountId);
    }

    // Calculate totals
    const totals = data.reduce(
      (acc, m) => ({
        income: acc.income + m.income,
        expenses: acc.expenses + m.expenses,
        net: acc.net + m.net
      }),
      { income: 0, expenses: 0, net: 0 }
    );

    res.json({
      success: true,
      data: {
        months: data,
        totals: {
          income: Math.round(totals.income * 100) / 100,
          expenses: Math.round(totals.expenses * 100) / 100,
          net: Math.round(totals.net * 100) / 100
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/analytics/trends
// ==========================================================================
router.get('/trends', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const {
      range = 'this_month',
      start_date: startDate,
      end_date: endDate,
      group_by: groupBy = 'day',
      account_id: accountIdStr
    } = req.query;

    // Calculate date range
    let dateRange;
    try {
      dateRange = calculateDateRange(range, startDate, endDate);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    // Validate groupBy
    if (!['day', 'week'].includes(groupBy)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid group_by. Expected: day or week'
      });
    }

    // Parse optional account filter
    const accountId = parseAccountId(accountIdStr);
    if (accountIdStr && !accountId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account_id'
      });
    }

    // Validate account exists and belongs to user if specified
    if (accountId && !accountExists(db, accountId, userId)) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const data = getSpendingTrends(
      db,
      dateRange.startDate,
      dateRange.endDate,
      groupBy,
      userId,
      accountId
    );

    res.json({
      success: true,
      data: {
        range: {
          start_date: dateRange.startDate,
          end_date: dateRange.endDate
        },
        group_by: groupBy,
        trends: data
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/analytics/summary
// ==========================================================================
router.get('/summary', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const {
      range = 'this_month',
      start_date: startDate,
      end_date: endDate,
      account_id: accountIdStr
    } = req.query;

    // Calculate date range
    let dateRange;
    try {
      dateRange = calculateDateRange(range, startDate, endDate);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    // Parse optional account filter
    const accountId = parseAccountId(accountIdStr);
    if (accountIdStr && !accountId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account_id'
      });
    }

    // Validate account exists and belongs to user if specified
    if (accountId && !accountExists(db, accountId, userId)) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Get summary stats
    const summary = getSummaryStats(
      db,
      dateRange.startDate,
      dateRange.endDate,
      userId,
      accountId
    );

    // Get top categories
    const topCategories = getTopSpendingCategories(
      db,
      dateRange.startDate,
      dateRange.endDate,
      5,
      userId,
      accountId
    );

    res.json({
      success: true,
      data: {
        range: {
          start_date: dateRange.startDate,
          end_date: dateRange.endDate
        },
        summary,
        top_categories: topCategories
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/analytics/monthly-breakdown
// Monthly expense breakdown with category details
// ==========================================================================
router.get('/monthly-breakdown', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { months: monthsStr = '3' } = req.query;

    // Parse months
    const months = parseInt(monthsStr, 10);
    if (isNaN(months) || months < 1 || months > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid months parameter. Expected 1-12.'
      });
    }

    const data = getMonthlyExpenseBreakdown(db, months, userId);

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/analytics/year-over-year
// All years comparison with monthly data
// ==========================================================================
router.get('/year-over-year', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const data = getAllYearsComparison(db, userId);

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/analytics/yoy
// Year-over-Year comparison
// ==========================================================================
router.get('/yoy', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const {
      year: yearStr,
      category_id: categoryIdStr
    } = req.query;

    // Parse year (default to current year)
    let year = new Date().getFullYear();
    if (yearStr) {
      year = parseInt(yearStr, 10);
      if (isNaN(year) || year < 1900 || year > 2100) {
        return res.status(400).json({
          success: false,
          error: 'Invalid year parameter'
        });
      }
    }

    // Parse optional category filter
    let categoryId = null;
    if (categoryIdStr) {
      categoryId = parseInt(categoryIdStr, 10);
      if (isNaN(categoryId) || categoryId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid category_id'
        });
      }
    }

    const data = getYearOverYearComparison(db, { year, category_id: categoryId, user_id: userId });

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/analytics/yoy/monthly
// Monthly Year-over-Year comparison
// ==========================================================================
router.get('/yoy/monthly', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const {
      month,
      year: yearStr,
      category_id: categoryIdStr
    } = req.query;

    // Validate month parameter (required)
    if (!month) {
      return res.status(400).json({
        success: false,
        error: 'month parameter is required'
      });
    }

    // Validate month format
    if (!/^(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month format. Expected "01" to "12"'
      });
    }

    // Parse year (default to current year)
    let year = new Date().getFullYear();
    if (yearStr) {
      year = parseInt(yearStr, 10);
      if (isNaN(year) || year < 1900 || year > 2100) {
        return res.status(400).json({
          success: false,
          error: 'Invalid year parameter'
        });
      }
    }

    // Parse optional category filter
    let categoryId = null;
    if (categoryIdStr) {
      categoryId = parseInt(categoryIdStr, 10);
      if (isNaN(categoryId) || categoryId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid category_id'
        });
      }
    }

    const data = getMonthlyYoYComparison(db, month, { year, category_id: categoryId, user_id: userId });

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

export default router;
