/**
 * Subscription Check Middleware
 *
 * Enforces trial and subscription status for protected routes.
 * - Checks if user's subscription is active or trial is valid
 * - Calculates days remaining in trial
 * - Blocks access if trial expired AND subscription_status != 'active'
 * - Returns 402 Payment Required with message
 */

import { getDb } from '../../core/database.js';

/**
 * Calculate days remaining from a date
 * @param {string} endDateStr - ISO date string
 * @returns {number} Days remaining (negative if expired)
 */
function calculateDaysRemaining(endDateStr) {
  if (!endDateStr) return 0;

  const endDate = new Date(endDateStr);
  const now = new Date();

  // Set both dates to midnight for accurate day calculation
  endDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Check if trial has expired
 * @param {string} trialEndDate - ISO date string
 * @returns {boolean}
 */
function isTrialExpired(trialEndDate) {
  if (!trialEndDate) return true;

  const endDate = new Date(trialEndDate);
  const now = new Date();

  return endDate < now;
}

/**
 * Get user's subscription/trial status
 * @param {number} userId - User ID
 * @returns {object} Status object with subscription info
 */
export function getUserSubscriptionStatus(userId) {
  const db = getDb();

  // Get user info including trial dates and admin status
  const user = db.prepare(`
    SELECT
      id,
      is_admin,
      trial_start_date,
      trial_end_date,
      subscription_status
    FROM users
    WHERE id = ?
  `).get(userId);

  if (!user) {
    return {
      subscription_status: 'inactive',
      trial_end_date: null,
      days_remaining: 0,
      is_expired: true,
      is_admin: false
    };
  }

  // Check user_subscriptions table for active Stripe subscription
  const stripeSubscription = db.prepare(`
    SELECT plan, status, current_period_end
    FROM user_subscriptions
    WHERE user_id = ?
  `).get(userId);

  // Determine effective subscription status
  let effectiveStatus = user.subscription_status || 'trial';
  let isActive = false;

  // If there's an active Stripe subscription, that takes precedence
  if (stripeSubscription && (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing')) {
    effectiveStatus = 'active';
    isActive = true;
  } else if (effectiveStatus === 'active') {
    // User marked as active in users table
    isActive = true;
  }

  // Calculate trial days remaining
  const daysRemaining = calculateDaysRemaining(user.trial_end_date);
  const trialExpired = isTrialExpired(user.trial_end_date);

  // User is expired if trial is expired AND they don't have an active subscription
  const isExpired = trialExpired && !isActive;

  return {
    subscription_status: effectiveStatus,
    trial_end_date: user.trial_end_date,
    days_remaining: Math.max(0, daysRemaining),
    is_expired: isExpired,
    is_admin: user.is_admin === 1,
    is_in_trial: effectiveStatus === 'trial' && !trialExpired,
    stripe_status: stripeSubscription?.status || null
  };
}

/**
 * Middleware to check subscription/trial status
 * Blocks access if trial expired and no active subscription
 *
 * Usage: Apply to protected API routes that require active subscription
 */
export function requireActiveSubscription(req, res, next) {
  // User must be authenticated first (req.user set by requireAuth middleware)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const status = getUserSubscriptionStatus(req.user.id);

  // Admin users bypass subscription checks
  if (status.is_admin) {
    req.subscriptionStatus = status;
    return next();
  }

  // Active subscription users pass through
  if (status.subscription_status === 'active' && !status.is_expired) {
    req.subscriptionStatus = status;
    return next();
  }

  // Trial users with time remaining pass through
  if (status.is_in_trial && status.days_remaining > 0) {
    req.subscriptionStatus = status;
    return next();
  }

  // Expired trial or inactive subscription - block access
  if (status.is_expired) {
    return res.status(402).json({
      success: false,
      error: 'Your trial has ended. Please upgrade to continue using Flow Money Manager.',
      code: 'TRIAL_EXPIRED',
      subscription_status: status.subscription_status,
      trial_end_date: status.trial_end_date,
      days_remaining: 0,
      is_expired: true,
      upgrade_url: '/pricing'
    });
  }

  // Fallback - allow access but attach status
  req.subscriptionStatus = status;
  next();
}

/**
 * Optional middleware that attaches subscription status without blocking
 * Useful for routes that need status info but shouldn't block access
 */
export function attachSubscriptionStatus(req, res, next) {
  if (req.user) {
    req.subscriptionStatus = getUserSubscriptionStatus(req.user.id);
  }
  next();
}
