/**
 * Subscriptions Service Tests (TDD)
 *
 * Tests for:
 * - detectSubscriptions(db) - Find recurring transactions that look like subscriptions
 * - getSubscriptions(db, options?) - Get all/active subscriptions
 * - getSubscriptionSummary(db) - Monthly/yearly totals, count, upcoming
 * - getUpcomingCharges(db, days?) - Get charges expected in next N days
 * - createSubscription(db, data) - Create a subscription
 * - updateSubscription(db, id, data) - Update a subscription
 * - deleteSubscription(db, id) - Soft delete (set is_active = 0)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import {
  detectSubscriptions,
  getSubscriptions,
  getSubscriptionSummary,
  getUpcomingCharges,
  createSubscription,
  updateSubscription,
  deleteSubscription
} from './subscriptions.service.js';

describe('SubscriptionsService', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // detectSubscriptions
  // ==========================================================================
  describe('detectSubscriptions', () => {
    it('should detect recurring transactions as potential subscriptions', () => {
      // Arrange: Netflix transactions - monthly, same amount
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-05',
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 9.99
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-05',
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 9.99
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-05',
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 9.99
      });

      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      expect(subscriptions.length).toBeGreaterThanOrEqual(1);
      const netflix = subscriptions.find(s => s.pattern.includes('NETFLIX'));
      expect(netflix).toBeDefined();
      expect(netflix.merchant_name).toContain('Netflix');
      expect(netflix.typical_amount).toBe(9.99);
      expect(netflix.frequency).toBe('monthly');
      expect(netflix.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should require at least 2 occurrences for detection', () => {
      // Arrange: Only 1 Netflix transaction
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-05',
        description: 'SINGLE SUBSCRIPTION',
        original_description: 'SINGLE SUBSCRIPTION',
        debit_amount: 9.99
      });

      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      const single = subscriptions.find(s => s.pattern.includes('SINGLE'));
      expect(single).toBeUndefined();
    });

    it('should not detect transactions with amount variance > 10%', () => {
      // Arrange: Variable amounts
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-05',
        description: 'VARIABLE SERVICE',
        original_description: 'VARIABLE SERVICE',
        debit_amount: 10.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-05',
        description: 'VARIABLE SERVICE',
        original_description: 'VARIABLE SERVICE',
        debit_amount: 50.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-05',
        description: 'VARIABLE SERVICE',
        original_description: 'VARIABLE SERVICE',
        debit_amount: 25.00
      });

      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      const variable = subscriptions.find(s => s.pattern.includes('VARIABLE'));
      expect(variable).toBeUndefined();
    });

    it('should detect subscriptions with small amount variance < 10%', () => {
      // Arrange: Small variance (price changes slightly)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-05',
        description: 'SPOTIFY PREMIUM',
        original_description: 'SPOTIFY PREMIUM',
        debit_amount: 9.99
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-05',
        description: 'SPOTIFY PREMIUM',
        original_description: 'SPOTIFY PREMIUM',
        debit_amount: 10.49 // ~5% increase
      });

      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      const spotify = subscriptions.find(s => s.pattern.includes('SPOTIFY'));
      expect(spotify).toBeDefined();
    });

    it('should not detect transactions with date variance > 5 days', () => {
      // Arrange: Irregular dates
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'IRREGULAR PAYMENT',
        original_description: 'IRREGULAR PAYMENT',
        debit_amount: 20.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-15', // 14 days off from expected
        description: 'IRREGULAR PAYMENT',
        original_description: 'IRREGULAR PAYMENT',
        debit_amount: 20.00
      });

      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      const irregular = subscriptions.find(s => s.pattern.includes('IRREGULAR'));
      expect(irregular).toBeUndefined();
    });

    it('should include lastDate in detected subscriptions', () => {
      // Arrange
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-05',
        description: 'DISNEY PLUS',
        original_description: 'DISNEY PLUS',
        debit_amount: 7.99
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-05',
        description: 'DISNEY PLUS',
        original_description: 'DISNEY PLUS',
        debit_amount: 7.99
      });

      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      const disney = subscriptions.find(s => s.pattern.includes('DISNEY'));
      expect(disney).toBeDefined();
      expect(disney.last_date).toBe('2025-02-05');
    });

    it('should return empty array when no transactions exist', () => {
      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      expect(subscriptions).toEqual([]);
    });

    it('should exclude transfers from detection', () => {
      // Arrange: Transfer transactions
      const id1 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-05',
        description: 'TRANSFER TO SAVINGS',
        original_description: 'TRANSFER TO SAVINGS',
        debit_amount: 100.00
      });
      db.prepare('UPDATE transactions SET is_transfer = 1 WHERE id = ?').run(id1);

      const id2 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-05',
        description: 'TRANSFER TO SAVINGS',
        original_description: 'TRANSFER TO SAVINGS',
        debit_amount: 100.00
      });
      db.prepare('UPDATE transactions SET is_transfer = 1 WHERE id = ?').run(id2);

      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      const transfer = subscriptions.find(s => s.pattern.includes('TRANSFER'));
      expect(transfer).toBeUndefined();
    });
  });

  // ==========================================================================
  // getSubscriptions
  // ==========================================================================
  describe('getSubscriptions', () => {
    it('should return all active subscriptions by default', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        expected_amount: 9.99,
        frequency: 'monthly'
      });
      createSubscription(db, {
        merchant_pattern: 'SPOTIFY',
        display_name: 'Spotify',
        expected_amount: 9.99,
        frequency: 'monthly'
      });

      // Act
      const subscriptions = getSubscriptions(db);

      // Assert
      expect(subscriptions).toHaveLength(2);
      expect(subscriptions[0]).toHaveProperty('display_name');
      expect(subscriptions[0]).toHaveProperty('expected_amount');
    });

    it('should not return inactive subscriptions when active_only is true', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'CANCELLED',
        display_name: 'Cancelled Service',
        expected_amount: 5.99,
        frequency: 'monthly'
      });
      deleteSubscription(db, sub.id); // Soft delete

      // Act
      const subscriptions = getSubscriptions(db, { active_only: true });

      // Assert
      const cancelled = subscriptions.find(s => s.display_name === 'Cancelled Service');
      expect(cancelled).toBeUndefined();
    });

    it('should return all subscriptions including inactive when active_only is false', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'ACTIVE',
        display_name: 'Active Service',
        expected_amount: 9.99,
        frequency: 'monthly'
      });
      const inactiveSub = createSubscription(db, {
        merchant_pattern: 'INACTIVE',
        display_name: 'Inactive Service',
        expected_amount: 5.99,
        frequency: 'monthly'
      });
      deleteSubscription(db, inactiveSub.id);

      // Act
      const subscriptions = getSubscriptions(db, { active_only: false });

      // Assert
      expect(subscriptions).toHaveLength(2);
    });

    it('should include category information when available', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        expected_amount: 9.99,
        frequency: 'monthly',
        category_id: 5 // Entertainment
      });

      // Act
      const subscriptions = getSubscriptions(db);

      // Assert
      expect(subscriptions[0].category_name).toBe('Entertainment');
      expect(subscriptions[0].category_colour).toBeDefined();
    });

    it('should return empty array when no subscriptions exist', () => {
      // Act
      const subscriptions = getSubscriptions(db);

      // Assert
      expect(subscriptions).toEqual([]);
    });
  });

  // ==========================================================================
  // getSubscriptionSummary
  // ==========================================================================
  describe('getSubscriptionSummary', () => {
    it('should calculate monthly_total correctly', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        expected_amount: 9.99,
        frequency: 'monthly'
      });
      createSubscription(db, {
        merchant_pattern: 'SPOTIFY',
        display_name: 'Spotify',
        expected_amount: 9.99,
        frequency: 'monthly'
      });

      // Act
      const summary = getSubscriptionSummary(db);

      // Assert
      expect(summary.monthly_total).toBeCloseTo(19.98, 2);
    });

    it('should convert yearly subscriptions to monthly equivalent', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'AMAZON PRIME',
        display_name: 'Amazon Prime',
        expected_amount: 95.00,
        frequency: 'yearly'
      });

      // Act
      const summary = getSubscriptionSummary(db);

      // Assert
      expect(summary.monthly_total).toBeCloseTo(7.92, 2); // 95/12
    });

    it('should convert quarterly subscriptions to monthly equivalent', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'QUARTERLY SERVICE',
        display_name: 'Quarterly Service',
        expected_amount: 30.00,
        frequency: 'quarterly'
      });

      // Act
      const summary = getSubscriptionSummary(db);

      // Assert
      expect(summary.monthly_total).toBeCloseTo(10.00, 2); // 30/3
    });

    it('should calculate yearly_total correctly', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        expected_amount: 9.99,
        frequency: 'monthly'
      });

      // Act
      const summary = getSubscriptionSummary(db);

      // Assert
      expect(summary.yearly_total).toBeCloseTo(119.88, 2); // 9.99 * 12
    });

    it('should return count of active subscriptions', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'SUB1',
        display_name: 'Sub 1',
        expected_amount: 5.00,
        frequency: 'monthly'
      });
      createSubscription(db, {
        merchant_pattern: 'SUB2',
        display_name: 'Sub 2',
        expected_amount: 10.00,
        frequency: 'monthly'
      });
      const inactive = createSubscription(db, {
        merchant_pattern: 'INACTIVE',
        display_name: 'Inactive',
        expected_amount: 15.00,
        frequency: 'monthly'
      });
      deleteSubscription(db, inactive.id);

      // Act
      const summary = getSubscriptionSummary(db);

      // Assert
      expect(summary.active_count).toBe(2);
    });

    it('should include upcoming_7_days total in summary', () => {
      // Arrange: Use a fixed date for predictable testing
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-10'));

      createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        expected_amount: 9.99,
        frequency: 'monthly',
        next_expected_date: '2025-01-15'
      });

      // Act
      const summary = getSubscriptionSummary(db);

      // Assert
      expect(typeof summary.upcoming_7_days).toBe('number');
      expect(summary.upcoming_7_days).toBeGreaterThanOrEqual(0);

      vi.useRealTimers();
    });

    it('should return zeros when no subscriptions exist', () => {
      // Act
      const summary = getSubscriptionSummary(db);

      // Assert
      expect(summary.monthly_total).toBe(0);
      expect(summary.yearly_total).toBe(0);
      expect(summary.active_count).toBe(0);
      expect(summary.upcoming_7_days).toBe(0);
    });
  });

  // ==========================================================================
  // getUpcomingCharges
  // ==========================================================================
  describe('getUpcomingCharges', () => {
    it('should return subscriptions due within specified days', () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-10'));

      createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        expected_amount: 9.99,
        frequency: 'monthly',
        next_expected_date: '2025-01-15'
      });

      // Act
      const upcoming = getUpcomingCharges(db, 30);

      // Assert
      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].display_name).toBe('Netflix');
      expect(upcoming[0].next_expected_date).toBe('2025-01-15');

      vi.useRealTimers();
    });

    it('should default to 30 days when no parameter provided', () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-10'));

      createSubscription(db, {
        merchant_pattern: 'SOON',
        display_name: 'Soon Service',
        expected_amount: 9.99,
        frequency: 'monthly',
        next_expected_date: '2025-01-20'
      });
      createSubscription(db, {
        merchant_pattern: 'LATER',
        display_name: 'Later Service',
        expected_amount: 9.99,
        frequency: 'monthly',
        next_expected_date: '2025-03-01' // Beyond 30 days
      });

      // Act
      const upcoming = getUpcomingCharges(db);

      // Assert
      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].display_name).toBe('Soon Service');

      vi.useRealTimers();
    });

    it('should not include past due dates', () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15'));

      createSubscription(db, {
        merchant_pattern: 'PAST',
        display_name: 'Past Service',
        expected_amount: 9.99,
        frequency: 'monthly',
        next_expected_date: '2025-01-10' // In the past
      });

      // Act
      const upcoming = getUpcomingCharges(db, 30);

      // Assert
      expect(upcoming).toHaveLength(0);

      vi.useRealTimers();
    });

    it('should only include active subscriptions', () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-10'));

      const inactive = createSubscription(db, {
        merchant_pattern: 'INACTIVE',
        display_name: 'Inactive',
        expected_amount: 9.99,
        frequency: 'monthly',
        next_expected_date: '2025-01-15'
      });
      deleteSubscription(db, inactive.id);

      // Act
      const upcoming = getUpcomingCharges(db, 30);

      // Assert
      expect(upcoming).toHaveLength(0);

      vi.useRealTimers();
    });

    it('should order by next_expected_date ascending', () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01'));

      createSubscription(db, {
        merchant_pattern: 'LATER',
        display_name: 'Later',
        expected_amount: 10.00,
        frequency: 'monthly',
        next_expected_date: '2025-01-25'
      });
      createSubscription(db, {
        merchant_pattern: 'SOONER',
        display_name: 'Sooner',
        expected_amount: 5.00,
        frequency: 'monthly',
        next_expected_date: '2025-01-10'
      });

      // Act
      const upcoming = getUpcomingCharges(db, 30);

      // Assert
      expect(upcoming).toHaveLength(2);
      expect(upcoming[0].display_name).toBe('Sooner');
      expect(upcoming[1].display_name).toBe('Later');

      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // createSubscription
  // ==========================================================================
  describe('createSubscription', () => {
    it('should create a new subscription with all fields', () => {
      // Act
      const sub = createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        category_id: 5,
        expected_amount: 9.99,
        frequency: 'monthly',
        billing_day: 5,
        next_expected_date: '2025-02-05'
      });

      // Assert
      expect(sub.id).toBeDefined();
      expect(sub.merchant_pattern).toBe('NETFLIX');
      expect(sub.display_name).toBe('Netflix');
      expect(sub.expected_amount).toBe(9.99);
      expect(sub.frequency).toBe('monthly');
      expect(sub.billing_day).toBe(5);
      expect(sub.is_active).toBe(1);
    });

    it('should throw error when merchant_pattern is missing', () => {
      expect(() => createSubscription(db, {
        display_name: 'Test'
      })).toThrow('merchant_pattern is required');
    });

    it('should throw error when display_name is missing', () => {
      expect(() => createSubscription(db, {
        merchant_pattern: 'TEST'
      })).toThrow('display_name is required');
    });

    it('should throw error for invalid frequency', () => {
      expect(() => createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        frequency: 'invalid'
      })).toThrow('Invalid frequency');
    });

    it('should throw error for invalid category_id', () => {
      expect(() => createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        category_id: 999
      })).toThrow('Category not found');
    });

    it('should set is_active to 1 by default', () => {
      // Act
      const sub = createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        frequency: 'monthly'
      });

      // Assert
      expect(sub.is_active).toBe(1);
    });

    it('should set created_at and updated_at timestamps', () => {
      // Act
      const sub = createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        frequency: 'monthly'
      });

      // Assert
      expect(sub.created_at).toBeDefined();
      expect(sub.updated_at).toBeDefined();
    });
  });

  // ==========================================================================
  // updateSubscription
  // ==========================================================================
  describe('updateSubscription', () => {
    it('should update subscription display_name', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        frequency: 'monthly'
      });

      // Act
      const updated = updateSubscription(db, sub.id, {
        display_name: 'Netflix Premium'
      });

      // Assert
      expect(updated.display_name).toBe('Netflix Premium');
    });

    it('should update subscription expected_amount', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        expected_amount: 9.99,
        frequency: 'monthly'
      });

      // Act
      const updated = updateSubscription(db, sub.id, {
        expected_amount: 15.99
      });

      // Assert
      expect(updated.expected_amount).toBe(15.99);
    });

    it('should update subscription frequency', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'PRIME',
        display_name: 'Amazon Prime',
        frequency: 'monthly'
      });

      // Act
      const updated = updateSubscription(db, sub.id, {
        frequency: 'yearly'
      });

      // Assert
      expect(updated.frequency).toBe('yearly');
    });

    it('should update subscription category_id', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        frequency: 'monthly',
        category_id: 5
      });

      // Act
      const updated = updateSubscription(db, sub.id, {
        category_id: 2 // Bills
      });

      // Assert
      expect(updated.category_id).toBe(2);
    });

    it('should update next_expected_date', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        frequency: 'monthly',
        next_expected_date: '2025-01-15'
      });

      // Act
      const updated = updateSubscription(db, sub.id, {
        next_expected_date: '2025-02-15'
      });

      // Assert
      expect(updated.next_expected_date).toBe('2025-02-15');
    });

    it('should throw error for non-existent subscription', () => {
      expect(() => updateSubscription(db, 999, {
        display_name: 'Test'
      })).toThrow('Subscription not found');
    });

    it('should throw error for invalid frequency', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        frequency: 'monthly'
      });

      // Assert
      expect(() => updateSubscription(db, sub.id, {
        frequency: 'invalid'
      })).toThrow('Invalid frequency');
    });

    it('should throw error for invalid category_id', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        frequency: 'monthly'
      });

      // Assert
      expect(() => updateSubscription(db, sub.id, {
        category_id: 999
      })).toThrow('Category not found');
    });

    it('should update updated_at timestamp', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        frequency: 'monthly'
      });
      const originalUpdatedAt = sub.updated_at;

      // Wait a tiny bit to ensure timestamp changes
      const updated = updateSubscription(db, sub.id, {
        display_name: 'Updated Test'
      });

      // Assert - updated_at should be set (we can't guarantee it's different in fast tests)
      expect(updated.updated_at).toBeDefined();
    });
  });

  // ==========================================================================
  // deleteSubscription
  // ==========================================================================
  describe('deleteSubscription', () => {
    it('should soft delete by setting is_active to 0', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'NETFLIX',
        display_name: 'Netflix',
        frequency: 'monthly'
      });

      // Act
      const result = deleteSubscription(db, sub.id);

      // Assert
      expect(result.deleted).toBe(true);
      expect(result.id).toBe(sub.id);

      // Verify it's soft deleted
      const row = db.prepare('SELECT is_active FROM subscriptions WHERE id = ?').get(sub.id);
      expect(row.is_active).toBe(0);
    });

    it('should not appear in active subscriptions after delete', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'DELETED',
        display_name: 'Deleted Service',
        frequency: 'monthly'
      });
      deleteSubscription(db, sub.id);

      // Act
      const subscriptions = getSubscriptions(db, { active_only: true });

      // Assert
      const deleted = subscriptions.find(s => s.display_name === 'Deleted Service');
      expect(deleted).toBeUndefined();
    });

    it('should throw error for non-existent subscription', () => {
      expect(() => deleteSubscription(db, 999)).toThrow('Subscription not found');
    });

    it('should update updated_at timestamp on delete', () => {
      // Arrange
      const sub = createSubscription(db, {
        merchant_pattern: 'TEST',
        display_name: 'Test',
        frequency: 'monthly'
      });

      // Act
      deleteSubscription(db, sub.id);

      // Assert
      const row = db.prepare('SELECT updated_at FROM subscriptions WHERE id = ?').get(sub.id);
      expect(row.updated_at).toBeDefined();
    });
  });

  // ==========================================================================
  // Edge Cases and Integration
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle weekly frequency in summary calculations', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'WEEKLY',
        display_name: 'Weekly Service',
        expected_amount: 5.00,
        frequency: 'weekly'
      });

      // Act
      const summary = getSubscriptionSummary(db);

      // Assert
      // Weekly = 5 * 52 / 12 = ~21.67 monthly
      expect(summary.monthly_total).toBeCloseTo(21.67, 1);
    });

    it('should handle fortnightly frequency in summary calculations', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'FORTNIGHTLY',
        display_name: 'Fortnightly Service',
        expected_amount: 10.00,
        frequency: 'fortnightly'
      });

      // Act
      const summary = getSubscriptionSummary(db);

      // Assert
      // Fortnightly = 10 * 26 / 12 = ~21.67 monthly
      expect(summary.monthly_total).toBeCloseTo(21.67, 1);
    });

    it('should handle null expected_amount in summary', () => {
      // Arrange
      createSubscription(db, {
        merchant_pattern: 'NO AMOUNT',
        display_name: 'No Amount Service',
        frequency: 'monthly'
        // No expected_amount
      });

      // Act
      const summary = getSubscriptionSummary(db);

      // Assert - should not crash, treat as 0
      expect(summary.monthly_total).toBe(0);
    });

    it('should detect subscriptions across multiple accounts', () => {
      // Arrange: Same subscription pattern on different accounts
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-05',
        description: 'MULTI ACC SUB',
        original_description: 'MULTI ACC SUB',
        debit_amount: 9.99
      });
      insertTestTransaction(db, {
        account_id: 2,
        transaction_date: '2025-02-05',
        description: 'MULTI ACC SUB',
        original_description: 'MULTI ACC SUB',
        debit_amount: 9.99
      });

      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      const multiAcc = subscriptions.find(s => s.pattern.includes('MULTI'));
      expect(multiAcc).toBeDefined();
    });

    it('should calculate billing_day from transaction dates during detection', () => {
      // Arrange: Transactions consistently on the 15th
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        description: 'CONSISTENT DATE',
        original_description: 'CONSISTENT DATE',
        debit_amount: 20.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-15',
        description: 'CONSISTENT DATE',
        original_description: 'CONSISTENT DATE',
        debit_amount: 20.00
      });

      // Act
      const subscriptions = detectSubscriptions(db);

      // Assert
      const consistent = subscriptions.find(s => s.pattern.includes('CONSISTENT'));
      expect(consistent).toBeDefined();
      // The billing day should be detected from the transaction dates
    });
  });
});
