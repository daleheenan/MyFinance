/**
 * Recurring Transactions Routes
 *
 * API endpoints for managing recurring transaction patterns:
 * GET    /api/recurring           - List all recurring patterns
 * GET    /api/recurring/:id       - Get pattern with recent transactions
 * POST   /api/recurring/detect    - Run detection algorithm
 * POST   /api/recurring           - Create new pattern
 * PUT    /api/recurring/:id       - Update pattern details
 * DELETE /api/recurring/:id       - Delete pattern (unlink transactions)
 * POST   /api/recurring/:id/transactions - Link transactions to pattern
 * DELETE /api/recurring/:id/transactions/:txnId - Unlink transaction from pattern
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import { ApiError } from '../../core/errors.js';
import {
  detectRecurringPatterns,
  getAllPatterns,
  getPatternById,
  getRecurringTransactions,
  markAsRecurring,
  createPattern,
  updatePattern,
  deletePattern,
  unlinkTransaction
} from './recurring.service.js';

const router = Router();

/**
 * GET /api/recurring
 * List all active recurring patterns with category info and transaction counts
 */
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const patterns = getAllPatterns(db);

    res.json({
      success: true,
      data: patterns
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/recurring/:id
 * Get single pattern with category info and linked transactions
 */
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    // Validate id is a number
    const patternId = parseInt(id, 10);
    if (isNaN(patternId)) {
      throw new ApiError('Invalid pattern ID', 400);
    }

    const pattern = getPatternById(db, patternId);
    if (!pattern) {
      throw new ApiError('Pattern not found', 404);
    }

    // Get linked transactions
    const transactions = getRecurringTransactions(db, patternId);

    res.json({
      success: true,
      data: {
        ...pattern,
        transactions
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/recurring/detect
 * Run the recurring pattern detection algorithm
 * Body: { minOccurrences?, maxAmountVariance?, lookbackMonths? }
 */
router.post('/detect', (req, res, next) => {
  try {
    const db = getDb();
    const { minOccurrences, maxAmountVariance, lookbackMonths } = req.body;

    const options = {};
    if (minOccurrences !== undefined) {
      options.minOccurrences = parseInt(minOccurrences, 10) || 3;
    }
    if (maxAmountVariance !== undefined) {
      options.maxAmountVariance = parseFloat(maxAmountVariance) || 10;
    }
    if (lookbackMonths !== undefined) {
      options.lookbackMonths = parseInt(lookbackMonths, 10);
    }

    const patterns = detectRecurringPatterns(db, options);

    res.json({
      success: true,
      data: patterns
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/recurring
 * Create a new recurring pattern
 * Body: { description_pattern, merchant_name?, typical_amount?, typical_day?,
 *         frequency?, category_id?, is_subscription?, transaction_ids? }
 */
router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const {
      description_pattern,
      merchant_name,
      typical_amount,
      typical_day,
      frequency,
      category_id,
      is_subscription,
      transaction_ids
    } = req.body;

    // Validate required fields
    if (!description_pattern || !description_pattern.trim()) {
      throw new ApiError('description_pattern is required', 400);
    }

    // Validate frequency if provided
    const validFrequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];
    if (frequency && !validFrequencies.includes(frequency)) {
      throw new ApiError(`Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`, 400);
    }

    const patternData = {
      description_pattern: description_pattern.trim(),
      merchant_name: merchant_name?.trim() || null,
      typical_amount: typical_amount !== undefined ? parseFloat(typical_amount) : null,
      typical_day: typical_day !== undefined ? parseInt(typical_day, 10) : null,
      frequency: frequency || 'monthly',
      category_id: category_id !== undefined ? parseInt(category_id, 10) : null,
      is_subscription: is_subscription ? 1 : 0
    };

    const txnIds = Array.isArray(transaction_ids) ? transaction_ids.map(id => parseInt(id, 10)) : [];

    const pattern = createPattern(db, patternData, txnIds);

    res.status(201).json({
      success: true,
      data: pattern
    });
  } catch (err) {
    if (err.message === 'Category not found') {
      return next(new ApiError('Category not found', 400));
    }
    next(err);
  }
});

/**
 * PUT /api/recurring/:id
 * Update a recurring pattern
 * Body: { merchant_name?, typical_amount?, typical_day?,
 *         frequency?, category_id?, is_subscription?, is_active? }
 */
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    // Validate id is a number
    const patternId = parseInt(id, 10);
    if (isNaN(patternId)) {
      throw new ApiError('Invalid pattern ID', 400);
    }

    const {
      merchant_name,
      typical_amount,
      typical_day,
      frequency,
      category_id,
      is_subscription,
      is_active
    } = req.body;

    // Validate frequency if provided
    const validFrequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];
    if (frequency !== undefined && !validFrequencies.includes(frequency)) {
      throw new ApiError(`Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`, 400);
    }

    const updateData = {};
    if (merchant_name !== undefined) {
      updateData.merchant_name = merchant_name;
    }
    if (typical_amount !== undefined) {
      updateData.typical_amount = parseFloat(typical_amount);
    }
    if (typical_day !== undefined) {
      updateData.typical_day = parseInt(typical_day, 10);
    }
    if (frequency !== undefined) {
      updateData.frequency = frequency;
    }
    if (category_id !== undefined) {
      updateData.category_id = category_id === null ? null : parseInt(category_id, 10);
    }
    if (is_subscription !== undefined) {
      updateData.is_subscription = is_subscription ? 1 : 0;
    }
    if (is_active !== undefined) {
      updateData.is_active = is_active ? 1 : 0;
    }

    const pattern = updatePattern(db, patternId, updateData);

    res.json({
      success: true,
      data: pattern
    });
  } catch (err) {
    if (err.message === 'Pattern not found') {
      return next(new ApiError('Pattern not found', 404));
    }
    if (err.message === 'Category not found') {
      return next(new ApiError('Category not found', 400));
    }
    if (err.message.includes('Invalid frequency')) {
      return next(new ApiError(err.message, 400));
    }
    next(err);
  }
});

/**
 * DELETE /api/recurring/:id
 * Delete a recurring pattern and unlink all associated transactions
 */
router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    // Validate id is a number
    const patternId = parseInt(id, 10);
    if (isNaN(patternId)) {
      throw new ApiError('Invalid pattern ID', 400);
    }

    const result = deletePattern(db, patternId);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.message === 'Pattern not found') {
      return next(new ApiError('Pattern not found', 404));
    }
    next(err);
  }
});

/**
 * POST /api/recurring/:id/transactions
 * Link transactions to a pattern
 * Body: { transaction_ids: number[] }
 */
router.post('/:id/transactions', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { transaction_ids } = req.body;

    // Validate id is a number
    const patternId = parseInt(id, 10);
    if (isNaN(patternId)) {
      throw new ApiError('Invalid pattern ID', 400);
    }

    // Validate transaction_ids
    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      throw new ApiError('transaction_ids array is required', 400);
    }

    const txnIds = transaction_ids.map(txnId => {
      const parsed = parseInt(txnId, 10);
      if (isNaN(parsed)) {
        throw new ApiError('Invalid transaction ID in array', 400);
      }
      return parsed;
    });

    const count = markAsRecurring(db, txnIds, patternId);

    res.json({
      success: true,
      data: {
        pattern_id: patternId,
        transactions_linked: count
      }
    });
  } catch (err) {
    if (err.message === 'Pattern not found') {
      return next(new ApiError('Pattern not found', 404));
    }
    if (err.message === 'One or more transactions not found') {
      return next(new ApiError('One or more transactions not found', 400));
    }
    if (err.message === 'Transaction IDs are required') {
      return next(new ApiError('Transaction IDs are required', 400));
    }
    next(err);
  }
});

/**
 * DELETE /api/recurring/:id/transactions/:txnId
 * Unlink a single transaction from its pattern
 */
router.delete('/:id/transactions/:txnId', (req, res, next) => {
  try {
    const db = getDb();
    const { id, txnId } = req.params;

    // Validate ids are numbers
    const patternId = parseInt(id, 10);
    const transactionId = parseInt(txnId, 10);

    if (isNaN(patternId)) {
      throw new ApiError('Invalid pattern ID', 400);
    }
    if (isNaN(transactionId)) {
      throw new ApiError('Invalid transaction ID', 400);
    }

    // Verify the transaction belongs to this pattern
    const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId);
    if (!txn) {
      throw new ApiError('Transaction not found', 404);
    }
    if (txn.recurring_group_id !== patternId) {
      throw new ApiError('Transaction does not belong to this pattern', 400);
    }

    const result = unlinkTransaction(db, transactionId);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.message === 'Transaction not found') {
      return next(new ApiError('Transaction not found', 404));
    }
    next(err);
  }
});

export default router;
