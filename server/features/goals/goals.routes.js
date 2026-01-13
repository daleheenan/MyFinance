/**
 * Savings Goals Routes
 *
 * API endpoints for savings goals management.
 *
 * Endpoints:
 * - GET    /api/goals           - List all savings goals
 * - GET    /api/goals/summary   - Get goals summary for dashboard
 * - GET    /api/goals/:id       - Get a single goal with contributions
 * - POST   /api/goals           - Create a new goal
 * - PUT    /api/goals/:id       - Update a goal
 * - DELETE /api/goals/:id       - Delete a goal
 * - POST   /api/goals/:id/contribute - Add contribution to goal
 */

import { Router } from 'express';
import {
  getSavingsGoals,
  getSavingsGoalById,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
  addContribution,
  getSavingsGoalsSummary
} from './goals.service.js';

const router = Router();

/**
 * GET /api/goals
 * Returns all active savings goals for the user
 */
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const goals = getSavingsGoals(userId);
    res.json({ success: true, data: goals });
  } catch (err) {
    console.error('Get goals error:', err);
    res.status(500).json({ success: false, error: 'Failed to get goals' });
  }
});

/**
 * GET /api/goals/summary
 * Returns savings goals summary for dashboard
 */
router.get('/summary', (req, res) => {
  try {
    const userId = req.user.id;
    const summary = getSavingsGoalsSummary(userId);
    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('Get goals summary error:', err);
    res.status(500).json({ success: false, error: 'Failed to get summary' });
  }
});

/**
 * GET /api/goals/:id
 * Returns a single goal with contributions
 */
router.get('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const goalId = parseInt(req.params.id, 10);

    if (isNaN(goalId)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    const goal = getSavingsGoalById(goalId, userId);
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Goal not found' });
    }

    res.json({ success: true, data: goal });
  } catch (err) {
    console.error('Get goal error:', err);
    res.status(500).json({ success: false, error: 'Failed to get goal' });
  }
});

/**
 * POST /api/goals
 * Creates a new savings goal
 * Body: { name, targetAmount, targetDate?, linkedAccountId?, colour?, icon? }
 */
router.post('/', (req, res) => {
  try {
    const userId = req.user.id;
    const { name, targetAmount, targetDate, linkedAccountId, colour, icon } = req.body;

    if (!name || !targetAmount) {
      return res.status(400).json({
        success: false,
        error: 'Name and target amount are required'
      });
    }

    const goal = createSavingsGoal({
      userId,
      name,
      targetAmount: parseFloat(targetAmount),
      targetDate,
      linkedAccountId: linkedAccountId ? parseInt(linkedAccountId, 10) : null,
      colour,
      icon
    });

    res.status(201).json({ success: true, data: goal });
  } catch (err) {
    console.error('Create goal error:', err);
    res.status(500).json({ success: false, error: 'Failed to create goal' });
  }
});

/**
 * PUT /api/goals/:id
 * Updates a savings goal
 */
router.put('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const goalId = parseInt(req.params.id, 10);

    if (isNaN(goalId)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    const goal = updateSavingsGoal(goalId, userId, req.body);
    res.json({ success: true, data: goal });
  } catch (err) {
    if (err.message === 'Goal not found') {
      return res.status(404).json({ success: false, error: err.message });
    }
    console.error('Update goal error:', err);
    res.status(500).json({ success: false, error: 'Failed to update goal' });
  }
});

/**
 * DELETE /api/goals/:id
 * Deletes a savings goal
 */
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const goalId = parseInt(req.params.id, 10);

    if (isNaN(goalId)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    const result = deleteSavingsGoal(goalId, userId);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'Goal not found') {
      return res.status(404).json({ success: false, error: err.message });
    }
    console.error('Delete goal error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete goal' });
  }
});

/**
 * POST /api/goals/:id/contribute
 * Adds a contribution to a goal
 * Body: { amount, contributionDate?, notes?, transactionId? }
 */
router.post('/:id/contribute', (req, res) => {
  try {
    const userId = req.user.id;
    const goalId = parseInt(req.params.id, 10);
    const { amount, contributionDate, notes, transactionId } = req.body;

    if (isNaN(goalId)) {
      return res.status(400).json({ success: false, error: 'Invalid goal ID' });
    }

    if (!amount || isNaN(parseFloat(amount))) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }

    const goal = addContribution(goalId, userId, {
      amount: parseFloat(amount),
      contributionDate,
      notes,
      transactionId: transactionId ? parseInt(transactionId, 10) : null
    });

    res.json({ success: true, data: goal });
  } catch (err) {
    if (err.message === 'Goal not found') {
      return res.status(404).json({ success: false, error: err.message });
    }
    console.error('Add contribution error:', err);
    res.status(500).json({ success: false, error: 'Failed to add contribution' });
  }
});

export default router;
