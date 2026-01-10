/**
 * Merchants Routes
 *
 * API endpoints for merchant analysis and statistics.
 *
 * Endpoints:
 * - GET /api/merchants                 - List all merchants with stats
 * - GET /api/merchants/top             - Get top merchants by spend or frequency
 * - GET /api/merchants/:pattern/stats  - Get detailed stats for a specific merchant
 * - GET /api/merchants/:pattern/history - Get monthly spending history for a merchant
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import {
  getAllMerchants,
  getTopMerchants,
  getMerchantStats,
  getMerchantHistory
} from './merchants.service.js';

const router = Router();

/**
 * GET /api/merchants
 * Returns all merchants with their stats, ordered by total spent.
 */
router.get('/', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const merchants = getAllMerchants(db, userId);

  // Transform to new format for consistency
  const data = merchants.map(m => ({
    name: m.merchant_name,
    totalSpend: m.total_spent,
    transactionCount: m.transaction_count,
    lastTransaction: m.last_transaction
  }));

  res.json({ success: true, data });
});

/**
 * GET /api/merchants/top
 * Returns top merchants by spend or frequency.
 * Query params:
 *   - by: 'spend' (default) or 'frequency'
 *   - limit: number (default 10)
 *   - month: YYYY-MM (optional filter)
 *   - startDate: YYYY-MM-DD
 *   - endDate: YYYY-MM-DD
 */
router.get('/top', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { by = 'spend', limit = '10', month, startDate, endDate } = req.query;

  // Validate 'by' parameter
  if (!['spend', 'frequency'].includes(by)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid by parameter. Expected: spend or frequency'
    });
  }

  const options = {
    by,
    limit: parseInt(limit, 10) || 10,
    month,
    startDate,
    endDate,
    userId
  };

  const merchants = getTopMerchants(db, options);

  res.json({ success: true, data: merchants });
});

/**
 * GET /api/merchants/:pattern/stats
 * Returns detailed statistics for a specific merchant.
 */
router.get('/:pattern/stats', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { pattern } = req.params;

  const stats = getMerchantStats(db, decodeURIComponent(pattern), userId);

  if (!stats) {
    return res.status(404).json({
      success: false,
      error: 'Merchant not found'
    });
  }

  res.json({ success: true, data: stats });
});

/**
 * GET /api/merchants/:pattern/history
 * Returns monthly spending history for a merchant.
 * Query params:
 *   - months: number (default 12, max 24)
 */
router.get('/:pattern/history', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { pattern } = req.params;
  const { months = '12' } = req.query;

  const monthsNum = parseInt(months, 10);
  if (isNaN(monthsNum) || monthsNum < 1 || monthsNum > 24) {
    return res.status(400).json({
      success: false,
      error: 'Invalid months parameter. Expected 1-24.'
    });
  }

  const history = getMerchantHistory(db, decodeURIComponent(pattern), monthsNum, userId);

  res.json({ success: true, data: history });
});

export default router;
