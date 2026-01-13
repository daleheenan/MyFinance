/**
 * Bills Calendar Routes
 *
 * API endpoints for bill calendar and predictions.
 *
 * Endpoints:
 * - GET /api/bills/calendar     - Get bill calendar for a month
 * - GET /api/bills/upcoming     - Get upcoming bills
 * - GET /api/bills/summary      - Get bill predictions summary
 */

import { Router } from 'express';
import {
  getBillCalendar,
  getUpcomingBills,
  getBillPredictionsSummary
} from './bills.service.js';

const router = Router();

/**
 * GET /api/bills/calendar
 * Returns bill calendar for a specific month
 * Query params:
 *   - year: Year (default: current year)
 *   - month: Month 1-12 (default: current month)
 */
router.get('/calendar', (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    const year = parseInt(req.query.year, 10) || today.getFullYear();
    const month = parseInt(req.query.month, 10) || today.getMonth() + 1;

    if (month < 1 || month > 12) {
      return res.status(400).json({ success: false, error: 'Month must be 1-12' });
    }

    const calendar = getBillCalendar(userId, year, month);
    res.json({ success: true, data: calendar });
  } catch (err) {
    console.error('Get bill calendar error:', err);
    res.status(500).json({ success: false, error: 'Failed to get calendar' });
  }
});

/**
 * GET /api/bills/upcoming
 * Returns upcoming bills for the next N days
 * Query params:
 *   - days: Number of days to look ahead (default: 30, max: 90)
 */
router.get('/upcoming', (req, res) => {
  try {
    const userId = req.user.id;
    const days = Math.min(90, parseInt(req.query.days, 10) || 30);

    const bills = getUpcomingBills(userId, days);
    res.json({ success: true, data: bills });
  } catch (err) {
    console.error('Get upcoming bills error:', err);
    res.status(500).json({ success: false, error: 'Failed to get upcoming bills' });
  }
});

/**
 * GET /api/bills/summary
 * Returns bill predictions summary for dashboard
 */
router.get('/summary', (req, res) => {
  try {
    const userId = req.user.id;
    const summary = getBillPredictionsSummary(userId);
    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('Get bill summary error:', err);
    res.status(500).json({ success: false, error: 'Failed to get summary' });
  }
});

export default router;
