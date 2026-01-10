/**
 * Cash Flow Forecasting Routes
 *
 * API endpoints for financial forecasting:
 * - GET /api/forecasting/cashflow - Get cash flow projections
 * - GET /api/forecasting/averages - Get monthly averages
 * - GET /api/forecasting/scenarios - Get optimistic/expected/conservative scenarios
 * - GET /api/forecasting/seasonal - Get seasonal spending patterns
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import {
  getCashFlowForecast,
  getMonthlyAverages,
  getScenarios,
  getSeasonalPatterns
} from './forecasting.service.js';

const router = Router();

/**
 * Parse and validate a positive integer from query parameter.
 * @param {string|undefined} value - Value to parse
 * @param {number} defaultValue - Default if not provided
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function parsePositiveInt(value, defaultValue, min = 1, max = 24) {
  if (value === undefined || value === null || value === '') {
    return { valid: true, value: defaultValue };
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    return { valid: false, error: 'Invalid number format' };
  }

  if (parsed < min || parsed > max) {
    return { valid: false, error: `Value must be between ${min} and ${max}` };
  }

  return { valid: true, value: parsed };
}

/**
 * Parse category ID from query parameter.
 * @param {string|undefined} value - Value to parse
 * @returns {{ valid: boolean, value?: number|null, error?: string }}
 */
function parseCategoryId(value) {
  if (value === undefined || value === null || value === '') {
    return { valid: true, value: null };
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || parsed <= 0) {
    return { valid: false, error: 'Invalid category_id format' };
  }

  return { valid: true, value: parsed };
}

// ==========================================================================
// GET /api/forecasting/cashflow
// ==========================================================================
router.get('/cashflow', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { months } = req.query;

    // Validate months parameter
    const monthsResult = parsePositiveInt(months, 12, 1, 36);
    if (!monthsResult.valid) {
      return res.status(400).json({
        success: false,
        error: monthsResult.error
      });
    }

    // Get cash flow forecast
    const forecast = getCashFlowForecast(db, {
      months: monthsResult.value,
      userId
    });

    res.json({
      success: true,
      data: forecast
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/forecasting/averages
// ==========================================================================
router.get('/averages', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { months } = req.query;

    // Validate months parameter
    const monthsResult = parsePositiveInt(months, 6, 1, 24);
    if (!monthsResult.valid) {
      return res.status(400).json({
        success: false,
        error: monthsResult.error
      });
    }

    // Get monthly averages
    const averages = getMonthlyAverages(db, monthsResult.value, userId);

    res.json({
      success: true,
      data: averages
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/forecasting/scenarios
// ==========================================================================
router.get('/scenarios', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { months } = req.query;

    // Validate months parameter
    const monthsResult = parsePositiveInt(months, 12, 1, 36);
    if (!monthsResult.valid) {
      return res.status(400).json({
        success: false,
        error: monthsResult.error
      });
    }

    // Get scenarios
    const scenarios = getScenarios(db, {
      months: monthsResult.value,
      userId
    });

    res.json({
      success: true,
      data: scenarios
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/forecasting/seasonal
// ==========================================================================
router.get('/seasonal', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { category_id: categoryIdStr } = req.query;

    // Validate category_id parameter
    const categoryResult = parseCategoryId(categoryIdStr);
    if (!categoryResult.valid) {
      return res.status(400).json({
        success: false,
        error: categoryResult.error
      });
    }

    // Get seasonal patterns
    const patterns = getSeasonalPatterns(db, categoryResult.value, userId);

    res.json({
      success: true,
      data: patterns
    });
  } catch (err) {
    next(err);
  }
});

export default router;
