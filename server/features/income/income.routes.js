/**
 * Income Analysis Routes
 *
 * API endpoints for income analysis.
 *
 * Endpoints:
 * - GET /api/income/summary       - Get income summary
 * - GET /api/income/sources       - Get income by source
 * - GET /api/income/trend         - Get monthly income trend
 * - GET /api/income/recurring     - Get recurring income patterns
 * - GET /api/income/vs-expenses   - Get income vs expenses comparison
 */

import { Router } from 'express';
import {
  getIncomeSummary,
  getIncomeBySource,
  getMonthlyIncomeTrend,
  getRecurringIncome,
  getIncomeVsExpenses
} from './income.service.js';

const router = Router();

/**
 * GET /api/income/summary
 * Returns income summary for dashboard
 */
router.get('/summary', (req, res) => {
  try {
    const userId = req.user.id;
    const summary = getIncomeSummary(userId);
    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('Get income summary error:', err);
    res.status(500).json({ success: false, error: 'Failed to get summary' });
  }
});

/**
 * GET /api/income/sources
 * Returns income breakdown by source/category
 * Query params:
 *   - months: Number of months (default: 6)
 */
router.get('/sources', (req, res) => {
  try {
    const userId = req.user.id;
    const months = parseInt(req.query.months, 10) || 6;
    const sources = getIncomeBySource(userId, months);
    res.json({ success: true, data: sources });
  } catch (err) {
    console.error('Get income sources error:', err);
    res.status(500).json({ success: false, error: 'Failed to get sources' });
  }
});

/**
 * GET /api/income/trend
 * Returns monthly income trend
 * Query params:
 *   - months: Number of months (default: 12)
 */
router.get('/trend', (req, res) => {
  try {
    const userId = req.user.id;
    const months = parseInt(req.query.months, 10) || 12;
    const trend = getMonthlyIncomeTrend(userId, months);
    res.json({ success: true, data: trend });
  } catch (err) {
    console.error('Get income trend error:', err);
    res.status(500).json({ success: false, error: 'Failed to get trend' });
  }
});

/**
 * GET /api/income/recurring
 * Returns recurring income patterns
 */
router.get('/recurring', (req, res) => {
  try {
    const userId = req.user.id;
    const recurring = getRecurringIncome(userId);
    res.json({ success: true, data: recurring });
  } catch (err) {
    console.error('Get recurring income error:', err);
    res.status(500).json({ success: false, error: 'Failed to get recurring income' });
  }
});

/**
 * GET /api/income/vs-expenses
 * Returns income vs expenses comparison
 * Query params:
 *   - months: Number of months (default: 12)
 */
router.get('/vs-expenses', (req, res) => {
  try {
    const userId = req.user.id;
    const months = parseInt(req.query.months, 10) || 12;
    const data = getIncomeVsExpenses(userId, months);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Get income vs expenses error:', err);
    res.status(500).json({ success: false, error: 'Failed to get data' });
  }
});

export default router;
