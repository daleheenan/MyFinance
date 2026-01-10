/**
 * Subscriptions Routes
 *
 * API endpoints for managing subscriptions:
 * GET    /api/subscriptions           - List all subscriptions
 * GET    /api/subscriptions/summary   - Get summary with totals
 * GET    /api/subscriptions/upcoming  - Get upcoming charges
 * GET    /api/subscriptions/detect    - Detect subscriptions from transactions
 * POST   /api/subscriptions           - Create new subscription
 * PUT    /api/subscriptions/:id       - Update subscription
 * DELETE /api/subscriptions/:id       - Soft delete subscription
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import { ApiError } from '../../core/errors.js';
import {
  detectSubscriptions,
  detectRecurringIncome,
  getSubscriptions,
  getSubscriptionSummary,
  getUpcomingCharges,
  createSubscription,
  updateSubscription,
  deleteSubscription
} from './subscriptions.service.js';

const router = Router();

/**
 * GET /api/subscriptions
 * List all subscriptions (active by default)
 * Query params:
 *   - active_only (boolean, default true)
 *   - type ('expense' | 'income', optional - filters by type)
 */
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const activeOnly = req.query.active_only !== 'false';
    const type = req.query.type || null;

    // Validate type if provided
    const validTypes = ['expense', 'income'];
    if (type && !validTypes.includes(type)) {
      throw new ApiError(`Invalid type. Must be one of: ${validTypes.join(', ')}`, 400);
    }

    const subscriptions = getSubscriptions(db, { active_only: activeOnly, type, userId });

    res.json({
      success: true,
      data: subscriptions
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/subscriptions/summary
 * Get subscription summary with monthly/yearly totals and upcoming charges
 */
router.get('/summary', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const summary = getSubscriptionSummary(db, userId);

    res.json({
      success: true,
      data: summary
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/subscriptions/upcoming
 * Get upcoming subscription charges
 * Query params: days (number, default 30)
 */
router.get('/upcoming', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const days = parseInt(req.query.days, 10) || 30;

    if (days < 1 || days > 365) {
      throw new ApiError('Days must be between 1 and 365', 400);
    }

    const upcoming = getUpcomingCharges(db, days, userId);

    res.json({
      success: true,
      data: upcoming
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/subscriptions/detect
 * Detect potential subscriptions from transaction history
 * Query params:
 *   - type ('expense' | 'income', default 'expense')
 */
router.get('/detect', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const type = req.query.type || 'expense';

    let detected;
    if (type === 'income') {
      detected = detectRecurringIncome(db, userId);
    } else {
      detected = detectSubscriptions(db, userId);
    }

    res.json({
      success: true,
      data: detected
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/subscriptions
 * Create a new subscription
 * Body: { merchant_pattern, display_name, category_id?, expected_amount?,
 *         frequency?, billing_day?, next_expected_date?, last_charged_date?, type? }
 */
router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const {
      merchant_pattern,
      display_name,
      category_id,
      expected_amount,
      frequency,
      billing_day,
      next_expected_date,
      last_charged_date,
      type
    } = req.body;

    // Validate required fields
    if (!merchant_pattern || !merchant_pattern.trim()) {
      throw new ApiError('merchant_pattern is required', 400);
    }
    if (!display_name || !display_name.trim()) {
      throw new ApiError('display_name is required', 400);
    }

    // Validate frequency if provided
    const validFrequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];
    if (frequency && !validFrequencies.includes(frequency)) {
      throw new ApiError(`Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`, 400);
    }

    // Validate type if provided
    const validTypes = ['expense', 'income'];
    if (type && !validTypes.includes(type)) {
      throw new ApiError(`Invalid type. Must be one of: ${validTypes.join(', ')}`, 400);
    }

    const subscriptionData = {
      merchant_pattern: merchant_pattern.trim(),
      display_name: display_name.trim(),
      category_id: category_id !== undefined ? parseInt(category_id, 10) : null,
      expected_amount: expected_amount !== undefined ? parseFloat(expected_amount) : null,
      frequency: frequency || 'monthly',
      billing_day: billing_day !== undefined ? parseInt(billing_day, 10) : null,
      next_expected_date: next_expected_date || null,
      last_charged_date: last_charged_date || null,
      type: type || 'expense'
    };

    const subscription = createSubscription(db, subscriptionData, userId);

    res.status(201).json({
      success: true,
      data: subscription
    });
  } catch (err) {
    if (err.message === 'Category not found') {
      return next(new ApiError('Category not found', 400));
    }
    if (err.message.includes('merchant_pattern is required')) {
      return next(new ApiError('merchant_pattern is required', 400));
    }
    if (err.message.includes('display_name is required')) {
      return next(new ApiError('display_name is required', 400));
    }
    if (err.message.includes('Invalid frequency')) {
      return next(new ApiError(err.message, 400));
    }
    if (err.message.includes('Invalid type')) {
      return next(new ApiError(err.message, 400));
    }
    next(err);
  }
});

/**
 * PUT /api/subscriptions/:id
 * Update an existing subscription
 * Body: { display_name?, merchant_pattern?, category_id?, expected_amount?,
 *         frequency?, billing_day?, next_expected_date?, last_charged_date?, is_active?, type? }
 */
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { id } = req.params;

    // Validate id is a number
    const subscriptionId = parseInt(id, 10);
    if (isNaN(subscriptionId)) {
      throw new ApiError('Invalid subscription ID', 400);
    }

    const {
      display_name,
      merchant_pattern,
      category_id,
      expected_amount,
      frequency,
      billing_day,
      next_expected_date,
      last_charged_date,
      is_active,
      type
    } = req.body;

    // Validate frequency if provided
    const validFrequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];
    if (frequency !== undefined && !validFrequencies.includes(frequency)) {
      throw new ApiError(`Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`, 400);
    }

    // Validate type if provided
    const validTypes = ['expense', 'income'];
    if (type !== undefined && !validTypes.includes(type)) {
      throw new ApiError(`Invalid type. Must be one of: ${validTypes.join(', ')}`, 400);
    }

    const updateData = {};
    if (display_name !== undefined) {
      updateData.display_name = display_name;
    }
    if (merchant_pattern !== undefined) {
      updateData.merchant_pattern = merchant_pattern;
    }
    if (category_id !== undefined) {
      updateData.category_id = category_id === null ? null : parseInt(category_id, 10);
    }
    if (expected_amount !== undefined) {
      updateData.expected_amount = expected_amount === null ? null : parseFloat(expected_amount);
    }
    if (frequency !== undefined) {
      updateData.frequency = frequency;
    }
    if (billing_day !== undefined) {
      updateData.billing_day = billing_day === null ? null : parseInt(billing_day, 10);
    }
    if (next_expected_date !== undefined) {
      updateData.next_expected_date = next_expected_date;
    }
    if (last_charged_date !== undefined) {
      updateData.last_charged_date = last_charged_date;
    }
    if (is_active !== undefined) {
      updateData.is_active = is_active ? 1 : 0;
    }
    if (type !== undefined) {
      updateData.type = type;
    }

    const subscription = updateSubscription(db, subscriptionId, updateData, userId);

    res.json({
      success: true,
      data: subscription
    });
  } catch (err) {
    if (err.message === 'Subscription not found') {
      return next(new ApiError('Subscription not found', 404));
    }
    if (err.message === 'Category not found') {
      return next(new ApiError('Category not found', 400));
    }
    if (err.message.includes('Invalid frequency')) {
      return next(new ApiError(err.message, 400));
    }
    if (err.message.includes('Invalid type')) {
      return next(new ApiError(err.message, 400));
    }
    next(err);
  }
});

/**
 * DELETE /api/subscriptions/:id
 * Soft delete a subscription (sets is_active = 0)
 */
router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { id } = req.params;

    // Validate id is a number
    const subscriptionId = parseInt(id, 10);
    if (isNaN(subscriptionId)) {
      throw new ApiError('Invalid subscription ID', 400);
    }

    const result = deleteSubscription(db, subscriptionId, userId);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.message === 'Subscription not found') {
      return next(new ApiError('Subscription not found', 404));
    }
    next(err);
  }
});

export default router;
