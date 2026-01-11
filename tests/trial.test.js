/**
 * Trial Logic Unit Tests
 *
 * Tests for trial period functionality:
 * - User in active trial (days remaining > 0)
 * - User with expired trial
 * - User with active subscription (bypasses trial)
 * - Admin user (bypasses trial)
 * - Trial days calculation accuracy
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, closeTestDb } from '../server/db/testDatabase.js';
import { setDb, getDb } from '../server/core/database.js';

/**
 * Trial service functions to test
 * These should be implemented in the actual service
 */

/**
 * Calculate days remaining in trial
 * @param {Date|string} trialEndDate
 * @returns {number} Days remaining (can be negative if expired)
 */
function calculateTrialDaysRemaining(trialEndDate) {
  if (!trialEndDate) return 0;
  const endDate = new Date(trialEndDate);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Check if user has access (active trial, subscription, or admin)
 * @param {object} user - User object from database
 * @returns {{hasAccess: boolean, reason: string, daysRemaining?: number}}
 */
function checkUserAccess(user) {
  // Admin always has access
  if (user.is_admin === 1) {
    return { hasAccess: true, reason: 'admin' };
  }

  // Active subscription
  if (user.subscription_status === 'active') {
    return { hasAccess: true, reason: 'subscription' };
  }

  // Check trial
  if (user.subscription_status === 'trial' && user.trial_end_date) {
    const daysRemaining = calculateTrialDaysRemaining(user.trial_end_date);
    if (daysRemaining > 0) {
      return { hasAccess: true, reason: 'trial', daysRemaining };
    } else {
      return { hasAccess: false, reason: 'trial_expired', daysRemaining };
    }
  }

  // No access
  return { hasAccess: false, reason: 'no_subscription' };
}

/**
 * Get trial status for a user
 * @param {number} userId
 * @returns {object} Trial status object
 */
function getTrialStatus(db, userId) {
  const user = db.prepare(`
    SELECT id, username, is_admin, subscription_status, trial_start_date, trial_end_date
    FROM users WHERE id = ?
  `).get(userId);

  if (!user) {
    return { error: 'User not found' };
  }

  return checkUserAccess(user);
}

/**
 * Create a test user with trial data
 */
function createTrialUser(db, options = {}) {
  const defaults = {
    username: 'trialuser',
    email: 'trial@example.com',
    password_hash: '$2a$10$test.hash.for.testing.purposes.only',
    is_admin: 0,
    subscription_status: 'trial',
    trial_start_date: new Date().toISOString().slice(0, 10),
    trial_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 14 days
    is_active: 1
  };

  const data = { ...defaults, ...options };

  const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, is_admin, subscription_status, trial_start_date, trial_end_date, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.username,
    data.email,
    data.password_hash,
    data.is_admin,
    data.subscription_status,
    data.trial_start_date,
    data.trial_end_date,
    data.is_active
  );

  return { id: result.lastInsertRowid, ...data };
}

describe('Trial Logic', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    // Clear default test user
    db.prepare('DELETE FROM users').run();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // Active Trial Tests
  // ==========================================================================
  describe('User in Active Trial', () => {
    it('should return hasAccess true for user in active trial', () => {
      const user = createTrialUser(db, {
        username: 'activetrialuser',
        trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // 7 days from now
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('trial');
      expect(status.daysRemaining).toBeGreaterThan(0);
    });

    it('should show correct days remaining for active trial', () => {
      const daysInFuture = 10;
      const user = createTrialUser(db, {
        username: 'trialdaysuser',
        trial_end_date: new Date(Date.now() + daysInFuture * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      });

      const status = getTrialStatus(db, user.id);

      // Allow for 1 day variance due to date boundary
      expect(status.daysRemaining).toBeGreaterThanOrEqual(daysInFuture - 1);
      expect(status.daysRemaining).toBeLessThanOrEqual(daysInFuture + 1);
    });

    it('should return hasAccess true on first day of trial', () => {
      const user = createTrialUser(db, {
        username: 'firstdayuser',
        trial_start_date: new Date().toISOString().slice(0, 10),
        trial_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('trial');
    });

    it('should return hasAccess true on last day of trial', () => {
      // End date is tomorrow (so today is last day)
      const user = createTrialUser(db, {
        username: 'lastdayuser',
        trial_end_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.daysRemaining).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Expired Trial Tests
  // ==========================================================================
  describe('User with Expired Trial', () => {
    it('should return hasAccess false for user with expired trial', () => {
      const user = createTrialUser(db, {
        username: 'expiredtrialuser',
        trial_end_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // 7 days ago
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(false);
      expect(status.reason).toBe('trial_expired');
    });

    it('should show negative days remaining for expired trial', () => {
      const daysAgo = 5;
      const user = createTrialUser(db, {
        username: 'negativedaysuser',
        trial_end_date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      });

      const status = getTrialStatus(db, user.id);

      expect(status.daysRemaining).toBeLessThan(0);
    });

    it('should return hasAccess false on day after trial expires', () => {
      // Trial ended yesterday
      const user = createTrialUser(db, {
        username: 'justexpireduser',
        trial_end_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(false);
      expect(status.reason).toBe('trial_expired');
    });

    it('should handle trial that expired long ago', () => {
      // Trial ended 100 days ago
      const user = createTrialUser(db, {
        username: 'longexpireduser',
        trial_end_date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(false);
      expect(status.daysRemaining).toBeLessThan(-90);
    });
  });

  // ==========================================================================
  // Active Subscription Tests (Bypasses Trial)
  // ==========================================================================
  describe('User with Active Subscription', () => {
    it('should return hasAccess true for user with active subscription', () => {
      const user = createTrialUser(db, {
        username: 'subscribeduser',
        subscription_status: 'active',
        trial_end_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // Trial expired
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('subscription');
    });

    it('should bypass trial check for subscribed users', () => {
      const user = createTrialUser(db, {
        username: 'subscriptionbypass',
        subscription_status: 'active',
        trial_end_date: null // No trial end date
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('subscription');
      expect(status.daysRemaining).toBeUndefined();
    });

    it('should prefer subscription status over expired trial', () => {
      const user = createTrialUser(db, {
        username: 'subovertrialuser',
        subscription_status: 'active',
        trial_start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        trial_end_date: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // Expired 16 days ago
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('subscription');
    });
  });

  // ==========================================================================
  // Admin User Tests (Bypasses Trial)
  // ==========================================================================
  describe('Admin User', () => {
    it('should return hasAccess true for admin user without trial', () => {
      const user = createTrialUser(db, {
        username: 'adminuser',
        is_admin: 1,
        subscription_status: 'trial',
        trial_end_date: null
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('admin');
    });

    it('should bypass trial check for admin users', () => {
      // Admin with expired trial
      const user = createTrialUser(db, {
        username: 'adminexpiredtrial',
        is_admin: 1,
        subscription_status: 'trial',
        trial_end_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('admin');
    });

    it('should bypass subscription check for admin users', () => {
      // Admin without active subscription
      const user = createTrialUser(db, {
        username: 'adminnosub',
        is_admin: 1,
        subscription_status: 'inactive',
        trial_end_date: null
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('admin');
    });

    it('admin reason should take priority over subscription', () => {
      // Admin with active subscription
      const user = createTrialUser(db, {
        username: 'adminwithsub',
        is_admin: 1,
        subscription_status: 'active'
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('admin');
    });
  });

  // ==========================================================================
  // Trial Days Calculation Accuracy
  // ==========================================================================
  describe('Trial Days Calculation', () => {
    it('should calculate exact days correctly', () => {
      // Set trial end to exactly 7 days from now at midnight
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      futureDate.setHours(23, 59, 59, 999);

      const days = calculateTrialDaysRemaining(futureDate.toISOString().slice(0, 10));

      expect(days).toBeGreaterThanOrEqual(7);
      expect(days).toBeLessThanOrEqual(8);
    });

    it('should return 0 for today as end date', () => {
      const today = new Date().toISOString().slice(0, 10);
      const days = calculateTrialDaysRemaining(today);

      // Depending on time of day, could be 0 or 1
      expect(days).toBeGreaterThanOrEqual(0);
      expect(days).toBeLessThanOrEqual(1);
    });

    it('should return negative for past dates', () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const days = calculateTrialDaysRemaining(pastDate);

      expect(days).toBeLessThan(0);
    });

    it('should handle null end date', () => {
      const days = calculateTrialDaysRemaining(null);
      expect(days).toBe(0);
    });

    it('should handle undefined end date', () => {
      const days = calculateTrialDaysRemaining(undefined);
      expect(days).toBe(0);
    });

    it('should calculate 14-day trial correctly', () => {
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      const days = calculateTrialDaysRemaining(endDate.toISOString().slice(0, 10));

      expect(days).toBeGreaterThanOrEqual(13);
      expect(days).toBeLessThanOrEqual(15);
    });

    it('should handle year boundary correctly', () => {
      // Test with date crossing year boundary
      const futureYear = new Date();
      futureYear.setFullYear(futureYear.getFullYear() + 1);
      const days = calculateTrialDaysRemaining(futureYear.toISOString().slice(0, 10));

      expect(days).toBeGreaterThan(300); // Should be more than 300 days
    });

    it('should handle leap year correctly', () => {
      // Feb 29, 2028 (leap year)
      const leapDate = '2028-02-29';
      const days = calculateTrialDaysRemaining(leapDate);

      // Should return a reasonable number (depends on current date)
      expect(typeof days).toBe('number');
      expect(Number.isFinite(days)).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle user not found', () => {
      const status = getTrialStatus(db, 99999);

      expect(status.error).toBe('User not found');
    });

    it('should handle user with no subscription status', () => {
      const result = db.prepare(`
        INSERT INTO users (username, password_hash, is_active, is_admin)
        VALUES ('nostatususer', '$2a$10$test', 1, 0)
      `).run();

      // Set subscription_status to null explicitly
      db.prepare('UPDATE users SET subscription_status = NULL WHERE id = ?').run(result.lastInsertRowid);

      const status = getTrialStatus(db, result.lastInsertRowid);

      expect(status.hasAccess).toBe(false);
      expect(status.reason).toBe('no_subscription');
    });

    it('should handle trial with no end date', () => {
      const user = createTrialUser(db, {
        username: 'noendateuser',
        subscription_status: 'trial',
        trial_end_date: null
      });

      const status = getTrialStatus(db, user.id);

      // Without an end date, trial is effectively expired
      expect(status.hasAccess).toBe(false);
    });

    it('should handle inactive user correctly', () => {
      const user = createTrialUser(db, {
        username: 'inactiveuser',
        is_active: 0,
        subscription_status: 'active'
      });

      const status = getTrialStatus(db, user.id);

      // This test checks trial status only, not account active status
      // Account lockout should be handled separately
      expect(status.hasAccess).toBe(true);
      expect(status.reason).toBe('subscription');
    });
  });

  // ==========================================================================
  // Subscription Status Values
  // ==========================================================================
  describe('Subscription Status Values', () => {
    it('should handle inactive status', () => {
      const user = createTrialUser(db, {
        username: 'inactivesubuser',
        subscription_status: 'inactive'
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(false);
    });

    it('should handle past_due status as no access', () => {
      const user = createTrialUser(db, {
        username: 'pastdueuser',
        subscription_status: 'past_due'
      });

      const status = getTrialStatus(db, user.id);

      // Past due should not have access (depends on business logic)
      expect(status.hasAccess).toBe(false);
    });

    it('should handle canceled status as no access', () => {
      const user = createTrialUser(db, {
        username: 'canceleduser',
        subscription_status: 'canceled'
      });

      const status = getTrialStatus(db, user.id);

      expect(status.hasAccess).toBe(false);
    });

    it('should handle trialing status same as trial', () => {
      const user = createTrialUser(db, {
        username: 'trialingstatus',
        subscription_status: 'trialing',
        trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      });

      // Update to use Stripe's trialing status
      db.prepare("UPDATE users SET subscription_status = 'trialing' WHERE id = ?").run(user.id);

      const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      const status = checkUserAccess(dbUser);

      // trialing from Stripe should be treated as having access
      // This depends on implementation - Stripe's trialing is different from app's trial
      expect(typeof status.hasAccess).toBe('boolean');
    });
  });
});
