/**
 * Budgets Routes
 *
 * API endpoints for budget management.
 *
 * Endpoints:
 * - GET    /api/budgets              - List budgets for a month (default current month)
 * - GET    /api/budgets/summary      - Get budget summary for a month
 * - GET    /api/budgets/unbudgeted   - Get categories without budgets for a month
 * - GET    /api/budgets/:id          - Get single budget with spent amount
 * - POST   /api/budgets              - Create/update budget for category+month
 * - DELETE /api/budgets/:id          - Delete a budget
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import {
  getBudgetsForMonth,
  getBudgetById,
  upsertBudget,
  deleteBudget,
  getCategoriesWithoutBudget,
  getBudgetSummary
} from './budgets.service.js';

const router = Router();

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

// =============================================================================
// Budget Endpoints
// =============================================================================

/**
 * GET /api/budgets
 * Returns all budgets for a specific month with spending calculations.
 * Query params:
 *   - month: YYYY-MM format (default: current month)
 */
router.get('/', (req, res) => {
  const db = getDb();
  const month = req.query.month || getCurrentMonth();

  try {
    const budgets = getBudgetsForMonth(db, month);
    res.json({ success: true, data: budgets });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/budgets/summary
 * Returns budget summary totals for a specific month.
 * Query params:
 *   - month: YYYY-MM format (default: current month)
 */
router.get('/summary', (req, res) => {
  const db = getDb();
  const month = req.query.month || getCurrentMonth();

  try {
    const summary = getBudgetSummary(db, month);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/budgets/unbudgeted
 * Returns expense categories that don't have a budget for the month.
 * Query params:
 *   - month: YYYY-MM format (default: current month)
 */
router.get('/unbudgeted', (req, res) => {
  const db = getDb();
  const month = req.query.month || getCurrentMonth();

  try {
    const categories = getCategoriesWithoutBudget(db, month);
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/budgets/:id
 * Returns single budget by ID with spending calculations.
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid budget ID'
    });
  }

  try {
    const budget = getBudgetById(db, id);

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: 'Budget not found'
      });
    }

    res.json({ success: true, data: budget });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/budgets
 * Creates or updates a budget for a category+month combination.
 * Body: { categoryId, month, budgetedAmount, rolloverAmount?, notes? }
 */
router.post('/', (req, res) => {
  const db = getDb();
  const { categoryId, month, budgetedAmount, rolloverAmount, notes } = req.body;

  // Basic validation
  if (categoryId === undefined || categoryId === null) {
    return res.status(400).json({
      success: false,
      error: 'Category ID is required'
    });
  }

  if (!month) {
    return res.status(400).json({
      success: false,
      error: 'Month is required (YYYY-MM format)'
    });
  }

  if (budgetedAmount === undefined || budgetedAmount === null) {
    return res.status(400).json({
      success: false,
      error: 'Budgeted amount is required'
    });
  }

  const parsedAmount = parseFloat(budgetedAmount);
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    return res.status(400).json({
      success: false,
      error: 'Budgeted amount must be a positive number'
    });
  }

  try {
    const budget = upsertBudget(db, {
      categoryId: parseInt(categoryId, 10),
      month,
      budgetedAmount: parsedAmount,
      rolloverAmount: rolloverAmount ? parseFloat(rolloverAmount) : 0,
      notes: notes || null
    });

    res.status(201).json({ success: true, data: budget });
  } catch (err) {
    if (err.message === 'Category not found') {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * DELETE /api/budgets/:id
 * Deletes a budget.
 */
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid budget ID'
    });
  }

  try {
    const result = deleteBudget(db, id);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'Budget not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
