import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import {
  detectRecurringPatterns,
  classifyPattern,
  getRegularPayments,
  markAsRecurring
} from './patterns.service.js';

describe('PatternsService', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('detectRecurringPatterns', () => {
    it('should detect monthly salary payments (same amount, same day)', () => {
      // Arrange - Insert 4 months of salary on 28th of each month
      insertTestTransaction(db, {
        description: 'ACME CORP SALARY',
        transaction_date: '2025-01-28',
        credit_amount: 3500.00,
        account_id: 1
      });
      insertTestTransaction(db, {
        description: 'ACME CORP SALARY',
        transaction_date: '2025-02-28',
        credit_amount: 3500.00,
        account_id: 1
      });
      insertTestTransaction(db, {
        description: 'ACME CORP SALARY',
        transaction_date: '2025-03-28',
        credit_amount: 3500.00,
        account_id: 1
      });
      insertTestTransaction(db, {
        description: 'ACME CORP SALARY',
        transaction_date: '2025-04-28',
        credit_amount: 3500.00,
        account_id: 1
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(1);
      expect(patterns[0].description_pattern).toBe('ACME CORP SALARY');
      expect(patterns[0].frequency).toBe('monthly');
      expect(patterns[0].typical_amount).toBe(3500.00);
      expect(patterns[0].typical_day).toBe(28);
      expect(patterns[0].occurrence_count).toBe(4);
    });

    it('should detect Netflix subscription (monthly debit)', () => {
      // Arrange - Netflix on 15th of each month
      insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-01-15',
        debit_amount: 15.99,
        category_id: 5 // Entertainment
      });
      insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-02-15',
        debit_amount: 15.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-03-15',
        debit_amount: 15.99,
        category_id: 5
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(1);
      expect(patterns[0].description_pattern).toBe('NETFLIX.COM');
      expect(patterns[0].frequency).toBe('monthly');
      expect(patterns[0].typical_amount).toBe(15.99);
      expect(patterns[0].is_subscription).toBe(1);
    });

    it('should detect Spotify subscription with day variation within 3 days', () => {
      // Arrange - Spotify with slight day variations
      insertTestTransaction(db, {
        description: 'SPOTIFY PREMIUM',
        transaction_date: '2025-01-10',
        debit_amount: 10.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'SPOTIFY PREMIUM',
        transaction_date: '2025-02-12', // +2 days
        debit_amount: 10.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'SPOTIFY PREMIUM',
        transaction_date: '2025-03-09', // -1 day
        debit_amount: 10.99,
        category_id: 5
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(1);
      expect(patterns[0].description_pattern).toBe('SPOTIFY PREMIUM');
      expect(patterns[0].frequency).toBe('monthly');
    });

    it('should handle amount variations within 10%', () => {
      // Arrange - Utility bill with slight variations
      insertTestTransaction(db, {
        description: 'BRITISH GAS',
        transaction_date: '2025-01-05',
        debit_amount: 100.00,
        category_id: 9 // Utilities
      });
      insertTestTransaction(db, {
        description: 'BRITISH GAS',
        transaction_date: '2025-02-05',
        debit_amount: 105.00, // +5%
        category_id: 9
      });
      insertTestTransaction(db, {
        description: 'BRITISH GAS',
        transaction_date: '2025-03-05',
        debit_amount: 95.00, // -5%
        category_id: 9
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(1);
      expect(patterns[0].description_pattern).toBe('BRITISH GAS');
      expect(patterns[0].typical_amount).toBeCloseTo(100.00, 0); // Average amount
    });

    it('should NOT detect patterns with less than 3 occurrences', () => {
      // Arrange - Only 2 occurrences
      insertTestTransaction(db, {
        description: 'RANDOM PAYMENT',
        transaction_date: '2025-01-15',
        debit_amount: 50.00
      });
      insertTestTransaction(db, {
        description: 'RANDOM PAYMENT',
        transaction_date: '2025-02-15',
        debit_amount: 50.00
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(0);
    });

    it('should NOT detect one-off transactions as recurring', () => {
      // Arrange - Various one-off transactions
      insertTestTransaction(db, {
        description: 'AMAZON MARKETPLACE',
        transaction_date: '2025-01-05',
        debit_amount: 25.99
      });
      insertTestTransaction(db, {
        description: 'TESCO STORES',
        transaction_date: '2025-01-10',
        debit_amount: 45.00
      });
      insertTestTransaction(db, {
        description: 'COSTA COFFEE',
        transaction_date: '2025-01-12',
        debit_amount: 4.50
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(0);
    });

    it('should filter patterns by account when accountId provided', () => {
      // Arrange - Salary on account 1, subscription on account 2
      insertTestTransaction(db, {
        description: 'SALARY PAYMENT',
        transaction_date: '2025-01-28',
        credit_amount: 3000.00,
        account_id: 1
      });
      insertTestTransaction(db, {
        description: 'SALARY PAYMENT',
        transaction_date: '2025-02-28',
        credit_amount: 3000.00,
        account_id: 1
      });
      insertTestTransaction(db, {
        description: 'SALARY PAYMENT',
        transaction_date: '2025-03-28',
        credit_amount: 3000.00,
        account_id: 1
      });

      insertTestTransaction(db, {
        description: 'GYM MEMBERSHIP',
        transaction_date: '2025-01-01',
        debit_amount: 30.00,
        account_id: 2
      });
      insertTestTransaction(db, {
        description: 'GYM MEMBERSHIP',
        transaction_date: '2025-02-01',
        debit_amount: 30.00,
        account_id: 2
      });
      insertTestTransaction(db, {
        description: 'GYM MEMBERSHIP',
        transaction_date: '2025-03-01',
        debit_amount: 30.00,
        account_id: 2
      });

      // Act - Filter for account 1 only
      const patterns = detectRecurringPatterns(db, 1);

      // Assert
      expect(patterns).toHaveLength(1);
      expect(patterns[0].description_pattern).toBe('SALARY PAYMENT');
    });

    it('should detect weekly payments', () => {
      // Arrange - Weekly cleaning service (every 7 days)
      const startDate = new Date('2025-01-06'); // Monday
      for (let i = 0; i < 4; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + (i * 7));
        insertTestTransaction(db, {
          description: 'CLEANING SERVICE',
          transaction_date: date.toISOString().split('T')[0],
          debit_amount: 80.00
        });
      }

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe('weekly');
    });

    it('should detect fortnightly payments', () => {
      // Arrange - Fortnightly pay (every 14 days)
      const startDate = new Date('2025-01-03');
      for (let i = 0; i < 4; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + (i * 14));
        insertTestTransaction(db, {
          description: 'FORTNIGHTLY PAY',
          transaction_date: date.toISOString().split('T')[0],
          credit_amount: 1500.00
        });
      }

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe('fortnightly');
    });

    it('should detect quarterly payments', () => {
      // Arrange - Quarterly insurance
      insertTestTransaction(db, {
        description: 'CAR INSURANCE',
        transaction_date: '2025-01-15',
        debit_amount: 200.00
      });
      insertTestTransaction(db, {
        description: 'CAR INSURANCE',
        transaction_date: '2025-04-15',
        debit_amount: 200.00
      });
      insertTestTransaction(db, {
        description: 'CAR INSURANCE',
        transaction_date: '2025-07-15',
        debit_amount: 200.00
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe('quarterly');
    });

    it('should detect yearly payments', () => {
      // Arrange - Annual subscription
      insertTestTransaction(db, {
        description: 'AMAZON PRIME ANNUAL',
        transaction_date: '2023-03-01',
        debit_amount: 95.00
      });
      insertTestTransaction(db, {
        description: 'AMAZON PRIME ANNUAL',
        transaction_date: '2024-03-01',
        debit_amount: 95.00
      });
      insertTestTransaction(db, {
        description: 'AMAZON PRIME ANNUAL',
        transaction_date: '2025-03-01',
        debit_amount: 95.00
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe('yearly');
    });

    it('should NOT detect patterns with amount variance over 10%', () => {
      // Arrange - Inconsistent amounts (>10% variance)
      insertTestTransaction(db, {
        description: 'VARIABLE EXPENSE',
        transaction_date: '2025-01-15',
        debit_amount: 100.00
      });
      insertTestTransaction(db, {
        description: 'VARIABLE EXPENSE',
        transaction_date: '2025-02-15',
        debit_amount: 150.00 // +50%
      });
      insertTestTransaction(db, {
        description: 'VARIABLE EXPENSE',
        transaction_date: '2025-03-15',
        debit_amount: 80.00 // -20%
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toHaveLength(0);
    });
  });

  describe('classifyPattern', () => {
    it('should classify weekly pattern (~7 day gaps)', () => {
      const transactions = [
        { transaction_date: '2025-01-06', debit_amount: 50, credit_amount: 0 },
        { transaction_date: '2025-01-13', debit_amount: 50, credit_amount: 0 },
        { transaction_date: '2025-01-20', debit_amount: 50, credit_amount: 0 },
        { transaction_date: '2025-01-27', debit_amount: 50, credit_amount: 0 }
      ];

      const result = classifyPattern(transactions);

      expect(result.frequency).toBe('weekly');
      expect(result.typical_amount).toBe(50);
    });

    it('should classify fortnightly pattern (~14 day gaps)', () => {
      const transactions = [
        { transaction_date: '2025-01-03', debit_amount: 0, credit_amount: 1500 },
        { transaction_date: '2025-01-17', debit_amount: 0, credit_amount: 1500 },
        { transaction_date: '2025-01-31', debit_amount: 0, credit_amount: 1500 }
      ];

      const result = classifyPattern(transactions);

      expect(result.frequency).toBe('fortnightly');
      expect(result.typical_amount).toBe(1500);
    });

    it('should classify monthly pattern (~30 day gaps)', () => {
      const transactions = [
        { transaction_date: '2025-01-15', debit_amount: 15.99, credit_amount: 0 },
        { transaction_date: '2025-02-15', debit_amount: 15.99, credit_amount: 0 },
        { transaction_date: '2025-03-15', debit_amount: 15.99, credit_amount: 0 }
      ];

      const result = classifyPattern(transactions);

      expect(result.frequency).toBe('monthly');
      expect(result.typical_day).toBe(15);
      expect(result.typical_amount).toBe(15.99);
    });

    it('should classify quarterly pattern (~90 day gaps)', () => {
      const transactions = [
        { transaction_date: '2025-01-01', debit_amount: 200, credit_amount: 0 },
        { transaction_date: '2025-04-01', debit_amount: 200, credit_amount: 0 },
        { transaction_date: '2025-07-01', debit_amount: 200, credit_amount: 0 }
      ];

      const result = classifyPattern(transactions);

      expect(result.frequency).toBe('quarterly');
      expect(result.typical_amount).toBe(200);
    });

    it('should classify yearly pattern (~365 day gaps)', () => {
      const transactions = [
        { transaction_date: '2023-06-15', debit_amount: 500, credit_amount: 0 },
        { transaction_date: '2024-06-15', debit_amount: 500, credit_amount: 0 },
        { transaction_date: '2025-06-15', debit_amount: 500, credit_amount: 0 }
      ];

      const result = classifyPattern(transactions);

      expect(result.frequency).toBe('yearly');
      expect(result.typical_amount).toBe(500);
    });

    it('should calculate typical day for monthly patterns', () => {
      const transactions = [
        { transaction_date: '2025-01-28', debit_amount: 100, credit_amount: 0 },
        { transaction_date: '2025-02-28', debit_amount: 100, credit_amount: 0 },
        { transaction_date: '2025-03-28', debit_amount: 100, credit_amount: 0 }
      ];

      const result = classifyPattern(transactions);

      expect(result.typical_day).toBe(28);
    });

    it('should return null frequency for irregular patterns', () => {
      // Gaps of 45 and 50 days (avg 47.5) - doesn't match any frequency pattern
      // Weekly: 4-10, Fortnightly: 11-18, Monthly: 25-35, Quarterly: 80-100, Yearly: 350-380
      const transactions = [
        { transaction_date: '2025-01-05', debit_amount: 100, credit_amount: 0 },
        { transaction_date: '2025-02-19', debit_amount: 100, credit_amount: 0 }, // 45 days
        { transaction_date: '2025-04-10', debit_amount: 100, credit_amount: 0 }  // 50 days
      ];

      const result = classifyPattern(transactions);

      expect(result.frequency).toBeNull();
    });
  });

  describe('getRegularPayments', () => {
    it('should return payments grouped by frequency', () => {
      // Arrange - Create patterns in the database
      // Monthly Netflix
      insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-01-15',
        debit_amount: 15.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-02-15',
        debit_amount: 15.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-03-15',
        debit_amount: 15.99,
        category_id: 5
      });

      // Weekly gym
      const startDate = new Date('2025-01-06');
      for (let i = 0; i < 4; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + (i * 7));
        insertTestTransaction(db, {
          description: 'GYM DIRECT DEBIT',
          transaction_date: date.toISOString().split('T')[0],
          debit_amount: 10.00
        });
      }

      // First detect patterns
      detectRecurringPatterns(db);

      // Act
      const payments = getRegularPayments(db);

      // Assert
      expect(payments).toHaveProperty('weekly');
      expect(payments).toHaveProperty('monthly');
      expect(payments).toHaveProperty('annual');
      expect(payments.monthly.length).toBeGreaterThanOrEqual(1);
      expect(payments.weekly.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty arrays when no patterns exist', () => {
      // Act
      const payments = getRegularPayments(db);

      // Assert
      expect(payments.weekly).toEqual([]);
      expect(payments.monthly).toEqual([]);
      expect(payments.annual).toEqual([]);
    });

    it('should include pattern details in regular payments', () => {
      // Arrange
      insertTestTransaction(db, {
        description: 'SPOTIFY',
        transaction_date: '2025-01-10',
        debit_amount: 10.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'SPOTIFY',
        transaction_date: '2025-02-10',
        debit_amount: 10.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'SPOTIFY',
        transaction_date: '2025-03-10',
        debit_amount: 10.99,
        category_id: 5
      });

      detectRecurringPatterns(db);

      // Act
      const payments = getRegularPayments(db);

      // Assert
      const spotify = payments.monthly.find(p => p.description_pattern === 'SPOTIFY');
      expect(spotify).toBeDefined();
      expect(spotify.typical_amount).toBe(10.99);
      expect(spotify.typical_day).toBe(10);
    });
  });

  describe('markAsRecurring', () => {
    it('should mark transactions as recurring with pattern ID', () => {
      // Arrange
      const txId1 = insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-01-15',
        debit_amount: 15.99
      });
      const txId2 = insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-02-15',
        debit_amount: 15.99
      });
      const txId3 = insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-03-15',
        debit_amount: 15.99
      });

      // Create a pattern first
      const patterns = detectRecurringPatterns(db);
      const patternId = patterns[0].id;

      // Act
      markAsRecurring(db, [txId1, txId2, txId3], patternId);

      // Assert
      const transactions = db.prepare(
        'SELECT is_recurring, recurring_group_id FROM transactions WHERE id IN (?, ?, ?)'
      ).all(txId1, txId2, txId3);

      transactions.forEach(tx => {
        expect(tx.is_recurring).toBe(1);
        expect(tx.recurring_group_id).toBe(patternId);
      });
    });

    it('should update multiple transactions in a single call', () => {
      // Arrange
      const ids = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date('2025-01-15');
        date.setMonth(date.getMonth() + i);
        ids.push(insertTestTransaction(db, {
          description: 'MONTHLY BILL',
          transaction_date: date.toISOString().split('T')[0],
          debit_amount: 50.00
        }));
      }

      const patterns = detectRecurringPatterns(db);
      const patternId = patterns[0].id;

      // Act
      const result = markAsRecurring(db, ids, patternId);

      // Assert
      expect(result.changes).toBe(5);
    });

    it('should throw error for invalid pattern ID', () => {
      // Arrange
      const txId = insertTestTransaction(db, {
        description: 'TEST',
        transaction_date: '2025-01-15',
        debit_amount: 10.00
      });

      // Act & Assert
      expect(() => markAsRecurring(db, [txId], 99999)).toThrow();
    });

    it('should handle empty transaction array gracefully', () => {
      // Arrange - Create a pattern first
      insertTestTransaction(db, {
        description: 'TEST PATTERN',
        transaction_date: '2025-01-15',
        debit_amount: 10.00
      });
      insertTestTransaction(db, {
        description: 'TEST PATTERN',
        transaction_date: '2025-02-15',
        debit_amount: 10.00
      });
      insertTestTransaction(db, {
        description: 'TEST PATTERN',
        transaction_date: '2025-03-15',
        debit_amount: 10.00
      });

      const patterns = detectRecurringPatterns(db);
      const patternId = patterns[0].id;

      // Act
      const result = markAsRecurring(db, [], patternId);

      // Assert
      expect(result.changes).toBe(0);
    });
  });

  describe('Entertainment subscriptions detection', () => {
    it('should mark Netflix as subscription', () => {
      // Arrange
      insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-01-15',
        debit_amount: 15.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-02-15',
        debit_amount: 15.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'NETFLIX.COM',
        transaction_date: '2025-03-15',
        debit_amount: 15.99,
        category_id: 5
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns[0].is_subscription).toBe(1);
    });

    it('should mark Spotify as subscription', () => {
      // Arrange
      insertTestTransaction(db, {
        description: 'SPOTIFY PREMIUM',
        transaction_date: '2025-01-10',
        debit_amount: 10.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'SPOTIFY PREMIUM',
        transaction_date: '2025-02-10',
        debit_amount: 10.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        description: 'SPOTIFY PREMIUM',
        transaction_date: '2025-03-10',
        debit_amount: 10.99,
        category_id: 5
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns[0].is_subscription).toBe(1);
    });

    it('should mark utility bill as NOT a subscription', () => {
      // Arrange
      insertTestTransaction(db, {
        description: 'BRITISH GAS',
        transaction_date: '2025-01-05',
        debit_amount: 100.00,
        category_id: 9 // Utilities
      });
      insertTestTransaction(db, {
        description: 'BRITISH GAS',
        transaction_date: '2025-02-05',
        debit_amount: 100.00,
        category_id: 9
      });
      insertTestTransaction(db, {
        description: 'BRITISH GAS',
        transaction_date: '2025-03-05',
        debit_amount: 100.00,
        category_id: 9
      });

      // Act
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns[0].is_subscription).toBe(0);
    });
  });
});
