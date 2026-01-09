/**
 * Net Worth Routes
 *
 * API endpoints for net worth tracking:
 * - GET /api/networth/current - Get current net worth
 * - GET /api/networth/history - Get historical snapshots
 * - GET /api/networth/breakdown - Get accounts grouped by type
 * - POST /api/networth/snapshot - Create a snapshot
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import {
  getCurrentNetWorth,
  getNetWorthHistory,
  getNetWorthBreakdown,
  takeSnapshot
} from './networth.service.js';

const router = Router();

// ==========================================================================
// GET /api/networth/current
// ==========================================================================
router.get('/current', (req, res, next) => {
  try {
    const db = getDb();
    const data = getCurrentNetWorth(db);

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/networth/history
// ==========================================================================
router.get('/history', (req, res, next) => {
  try {
    const db = getDb();
    const { months = '12' } = req.query;

    // Parse and validate months parameter
    const monthsNum = parseInt(months, 10);
    if (isNaN(monthsNum) || monthsNum < 1 || monthsNum > 120) {
      return res.status(400).json({
        success: false,
        error: 'Invalid months parameter. Expected 1-120.'
      });
    }

    const data = getNetWorthHistory(db, monthsNum);

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/networth/breakdown
// ==========================================================================
router.get('/breakdown', (req, res, next) => {
  try {
    const db = getDb();
    const data = getNetWorthBreakdown(db);

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/networth/snapshot
// ==========================================================================
router.post('/snapshot', (req, res, next) => {
  try {
    const db = getDb();
    const snapshot = takeSnapshot(db);

    res.status(201).json({
      success: true,
      data: snapshot
    });
  } catch (err) {
    next(err);
  }
});

export default router;
