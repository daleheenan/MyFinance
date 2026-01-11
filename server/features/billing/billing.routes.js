/**
 * Billing Routes
 *
 * Handles subscription management and Stripe webhooks.
 */

import { Router } from 'express';
import express from 'express';
import { getDb } from '../../core/database.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { getUserEmail } from '../auth/auth.service.js';
import {
  isStripeConfigured,
  getSubscriptionStatus,
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
  resumeSubscription,
  getPaymentHistory,
  handleWebhook
} from './billing.service.js';

const router = Router();

/**
 * GET /api/billing/config
 * Check if billing is configured (public endpoint)
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    configured: isStripeConfigured(),
    plans: {
      free: {
        name: 'Free',
        price: 0,
        features: [
          'Up to 2 bank accounts',
          'Basic transaction categorization',
          'Monthly spending reports',
          'CSV import'
        ]
      },
      pro: {
        name: 'Pro',
        price: 7.99,
        currency: 'GBP',
        interval: 'month',
        features: [
          'Unlimited bank accounts',
          'Advanced auto-categorization',
          'Custom category rules',
          'Budget tracking',
          'Subscription detection',
          'CSV & OFX import',
          'Priority support'
        ]
      }
    }
  });
});

/**
 * GET /api/billing/status
 * Get current user's subscription status
 */
router.get('/status', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const status = getSubscriptionStatus(db, req.user.id);

    res.json({ success: true, data: { subscription: status } });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status'
    });
  }
});

/**
 * POST /api/billing/checkout
 * Create a checkout session for Pro subscription
 */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'Billing not configured'
      });
    }

    const db = getDb();
    const email = getUserEmail(req.user.id);

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Please set your email address before subscribing'
      });
    }

    // Build URLs
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const successUrl = `${baseUrl}/app/settings?subscription=success`;
    const cancelUrl = `${baseUrl}/app/settings?subscription=canceled`;

    const session = await createCheckoutSession(db, req.user.id, email, successUrl, cancelUrl);

    res.json({
      success: true,
      sessionId: session.sessionId,
      url: session.url
    });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
});

/**
 * POST /api/billing/portal
 * Create a billing portal session for managing subscription
 */
router.post('/portal', requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'Billing not configured'
      });
    }

    const db = getDb();

    // Build return URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const returnUrl = `${protocol}://${host}/app/settings`;

    const session = await createPortalSession(db, req.user.id, returnUrl);

    res.json({
      success: true,
      url: session.url
    });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create portal session'
    });
  }
});

/**
 * POST /api/billing/cancel
 * Cancel subscription at period end
 */
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const result = await cancelSubscription(db, req.user.id);

    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period'
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel subscription'
    });
  }
});

/**
 * POST /api/billing/resume
 * Resume a canceled subscription
 */
router.post('/resume', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const result = await resumeSubscription(db, req.user.id);

    res.json({
      success: true,
      message: 'Subscription resumed'
    });
  } catch (error) {
    console.error('Resume subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to resume subscription'
    });
  }
});

/**
 * GET /api/billing/history
 * Get payment history
 */
router.get('/history', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit) || 20;
    const history = getPaymentHistory(db, req.user.id, Math.min(limit, 100));

    res.json({
      success: true,
      payments: history
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment history'
    });
  }
});

/**
 * POST /api/billing/webhook
 * Handle Stripe webhooks (public - verified by signature)
 * Note: This needs raw body parsing, handled separately
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const db = getDb();
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const result = await handleWebhook(db, req.body, signature);
    res.json(result);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
