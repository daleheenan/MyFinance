/**
 * Insights Routes
 *
 * API endpoints for financial insights, health scores, and recommendations.
 *
 * Endpoints:
 * - GET /api/insights/health-score       - Get financial health score
 * - GET /api/insights/spending-comparison - Get spending comparison insights
 * - GET /api/insights/trend-alerts       - Get category trend alerts
 * - GET /api/insights/subscriptions      - Get subscription cost summary
 * - GET /api/insights/safe-to-spend      - Get enhanced safe to spend
 */

import { Router } from 'express';
import {
  calculateFinancialHealthScore,
  getSpendingComparisons,
  getCategoryTrendAlerts,
  getSubscriptionSummary,
  getEnhancedSafeToSpend
} from './insights.service.js';

const router = Router();

/**
 * GET /api/insights/health-score
 * Returns the user's financial health score (0-100) with breakdown
 */
router.get('/health-score', (req, res) => {
  try {
    const userId = req.user.id;
    const healthScore = calculateFinancialHealthScore(userId);
    res.json({ success: true, data: healthScore });
  } catch (err) {
    console.error('Health score error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate health score'
    });
  }
});

/**
 * GET /api/insights/spending-comparison
 * Returns spending comparison between current and previous period
 */
router.get('/spending-comparison', (req, res) => {
  try {
    const userId = req.user.id;
    const comparisons = getSpendingComparisons(userId);
    res.json({ success: true, data: comparisons });
  } catch (err) {
    console.error('Spending comparison error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get spending comparisons'
    });
  }
});

/**
 * GET /api/insights/trend-alerts
 * Returns category spending trend alerts (improving or worsening)
 */
router.get('/trend-alerts', (req, res) => {
  try {
    const userId = req.user.id;
    const alerts = getCategoryTrendAlerts(userId);
    res.json({ success: true, data: alerts });
  } catch (err) {
    console.error('Trend alerts error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get trend alerts'
    });
  }
});

/**
 * GET /api/insights/subscriptions
 * Returns subscription cost summary with insights
 */
router.get('/subscriptions', (req, res) => {
  try {
    const userId = req.user.id;
    const summary = getSubscriptionSummary(userId);
    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('Subscription summary error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription summary'
    });
  }
});

/**
 * GET /api/insights/safe-to-spend
 * Returns enhanced safe-to-spend calculation with daily allowance
 */
router.get('/safe-to-spend', (req, res) => {
  try {
    const userId = req.user.id;
    const safeToSpend = getEnhancedSafeToSpend(userId);
    res.json({ success: true, data: safeToSpend });
  } catch (err) {
    console.error('Safe to spend error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate safe to spend'
    });
  }
});

export default router;
