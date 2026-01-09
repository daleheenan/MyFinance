/**
 * Recurring Service Tests (TDD)
 *
 * Tests for:
 * - detectRecurringPatterns(db, options?)
 * - getAllPatterns(db)
 * - getPatternById(db, patternId)
 * - getRecurringTransactions(db, patternId)
 * - markAsRecurring(db, txnIds, patternId)
 * - createPattern(db, patternData, txnIds?)
 * - updatePattern(db, patternId, data)
 * - deletePattern(db, patternId)
 * - unlinkTransaction(db, txnId)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
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

describe('RecurringService', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // detectRecurringPatterns
  // ==========================================================================
  describe('detectRecurringPatterns', () => {
    it('should detect recurring patterns from transactions with same description', () => {
      // Arrange: Insert 3+ transactions with same description, regular intervals
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 15.99
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 15.99
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-01',
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 15.99
      });

      // Act
      const patterns = detectRecurringPatterns(db, { lookbackMonths: 0 });

      // Assert
      expect(patterns.length).toBeGreaterThanOrEqual(1);
      const netflixPattern = patterns.find(p => p.description_pattern.includes('NETFLIX'));
      expect(netflixPattern).toBeDefined();
      expect(netflixPattern.typical_amount).toBe(15.99);
      expect(netflixPattern.transaction_count).toBe(3);
      expect(netflixPattern.frequency).toBe('monthly');
    });

    it('should not detect patterns with fewer than minimum occurrences', () => {
      // Arrange: Only 2 transactions
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'RARE PAYMENT',
        original_description: 'RARE PAYMENT',
        debit_amount: 50.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'RARE PAYMENT',
        original_description: 'RARE PAYMENT',
        debit_amount: 50.00
      });

      // Act
      const patterns = detectRecurringPatterns(db, { minOccurrences: 3, lookbackMonths: 0 });

      // Assert
      const rarePattern = patterns.find(p => p.description_pattern.includes('RARE'));
      expect(rarePattern).toBeUndefined();
    });

    it('should not detect patterns with high amount variance', () => {
      // Arrange: Transactions with varying amounts (>10% variance)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'VARIABLE SHOP',
        original_description: 'VARIABLE SHOP',
        debit_amount: 10.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'VARIABLE SHOP',
        original_description: 'VARIABLE SHOP',
        debit_amount: 50.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-01',
        description: 'VARIABLE SHOP',
        original_description: 'VARIABLE SHOP',
        debit_amount: 100.00
      });

      // Act
      const patterns = detectRecurringPatterns(db, { maxAmountVariance: 10, lookbackMonths: 0 });

      // Assert
      const variablePattern = patterns.find(p => p.description_pattern.includes('VARIABLE'));
      expect(variablePattern).toBeUndefined();
    });

    it('should detect patterns with small amount variance within threshold', () => {
      // Arrange: Transactions with small variance (<10%)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'SPOTIFY PREMIUM',
        original_description: 'SPOTIFY PREMIUM',
        debit_amount: 9.99
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'SPOTIFY PREMIUM',
        original_description: 'SPOTIFY PREMIUM',
        debit_amount: 10.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-01',
        description: 'SPOTIFY PREMIUM',
        original_description: 'SPOTIFY PREMIUM',
        debit_amount: 9.99
      });

      // Act
      const patterns = detectRecurringPatterns(db, { lookbackMonths: 0 });

      // Assert
      const spotifyPattern = patterns.find(p => p.description_pattern.includes('SPOTIFY'));
      expect(spotifyPattern).toBeDefined();
    });

    it('should identify weekly frequency for weekly transactions', () => {
      // Arrange: Weekly transactions
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'WEEKLY SUB',
        original_description: 'WEEKLY SUB',
        debit_amount: 5.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-08',
        description: 'WEEKLY SUB',
        original_description: 'WEEKLY SUB',
        debit_amount: 5.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        description: 'WEEKLY SUB',
        original_description: 'WEEKLY SUB',
        debit_amount: 5.00
      });

      // Act
      const patterns = detectRecurringPatterns(db, { lookbackMonths: 0 });

      // Assert
      const weeklyPattern = patterns.find(p => p.description_pattern.includes('WEEKLY'));
      expect(weeklyPattern).toBeDefined();
      expect(weeklyPattern.frequency).toBe('weekly');
    });

    it('should calculate typical day of month', () => {
      // Arrange: Monthly transactions on ~15th
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        description: 'MONTHLY BILL',
        original_description: 'MONTHLY BILL',
        debit_amount: 100.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-14',
        description: 'MONTHLY BILL',
        original_description: 'MONTHLY BILL',
        debit_amount: 100.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-15',
        description: 'MONTHLY BILL',
        original_description: 'MONTHLY BILL',
        debit_amount: 100.00
      });

      // Act
      const patterns = detectRecurringPatterns(db, { lookbackMonths: 0 });

      // Assert
      const monthlyPattern = patterns.find(p => p.description_pattern.includes('MONTHLY'));
      expect(monthlyPattern).toBeDefined();
      expect(monthlyPattern.typical_day).toBeGreaterThanOrEqual(14);
      expect(monthlyPattern.typical_day).toBeLessThanOrEqual(15);
    });

    it('should exclude transfers from detection', () => {
      // Arrange: Insert transfer transactions
      const id1 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TRANSFER TO SAVINGS',
        original_description: 'TRANSFER TO SAVINGS',
        debit_amount: 500.00
      });
      db.prepare('UPDATE transactions SET is_transfer = 1 WHERE id = ?').run(id1);

      const id2 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'TRANSFER TO SAVINGS',
        original_description: 'TRANSFER TO SAVINGS',
        debit_amount: 500.00
      });
      db.prepare('UPDATE transactions SET is_transfer = 1 WHERE id = ?').run(id2);

      const id3 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-01',
        description: 'TRANSFER TO SAVINGS',
        original_description: 'TRANSFER TO SAVINGS',
        debit_amount: 500.00
      });
      db.prepare('UPDATE transactions SET is_transfer = 1 WHERE id = ?').run(id3);

      // Act
      const patterns = detectRecurringPatterns(db, { lookbackMonths: 0 });

      // Assert
      const transferPattern = patterns.find(p => p.description_pattern.includes('TRANSFER'));
      expect(transferPattern).toBeUndefined();
    });

    it('should return empty array when no patterns found', () => {
      // Act (no transactions inserted)
      const patterns = detectRecurringPatterns(db);

      // Assert
      expect(patterns).toEqual([]);
    });
  });

  // ==========================================================================
  // createPattern
  // ==========================================================================
  describe('createPattern', () => {
    it('should create a new recurring pattern', () => {
      // Act
      const pattern = createPattern(db, {
        description_pattern: 'NETFLIX',
        merchant_name: 'Netflix',
        typical_amount: 15.99,
        typical_day: 1,
        frequency: 'monthly',
        category_id: 5, // Entertainment
        is_subscription: true
      });

      // Assert
      expect(pattern.id).toBeDefined();
      expect(pattern.description_pattern).toBe('NETFLIX');
      expect(pattern.merchant_name).toBe('Netflix');
      expect(pattern.typical_amount).toBe(15.99);
      expect(pattern.frequency).toBe('monthly');
      expect(pattern.is_subscription).toBe(1);
      expect(pattern.category_name).toBe('Entertainment');
    });

    it('should create pattern and link transactions', () => {
      // Arrange
      const txnId1 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'NETFLIX',
        debit_amount: 15.99
      });
      const txnId2 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'NETFLIX',
        debit_amount: 15.99
      });

      // Act
      const pattern = createPattern(db, {
        description_pattern: 'NETFLIX',
        merchant_name: 'Netflix',
        frequency: 'monthly'
      }, [txnId1, txnId2]);

      // Assert
      const txns = getRecurringTransactions(db, pattern.id);
      expect(txns).toHaveLength(2);
      expect(txns[0].is_recurring).toBe(1);
      expect(txns[0].recurring_group_id).toBe(pattern.id);
    });

    it('should throw error when description_pattern is missing', () => {
      expect(() => createPattern(db, {
        merchant_name: 'Test'
      })).toThrow('Description pattern is required');
    });

    it('should throw error for invalid category_id', () => {
      expect(() => createPattern(db, {
        description_pattern: 'TEST',
        category_id: 999
      })).toThrow('Category not found');
    });
  });

  // ==========================================================================
  // getAllPatterns
  // ==========================================================================
  describe('getAllPatterns', () => {
    it('should return all active patterns with category info', () => {
      // Arrange
      createPattern(db, {
        description_pattern: 'NETFLIX',
        merchant_name: 'Netflix',
        category_id: 5, // Entertainment
        frequency: 'monthly'
      });
      createPattern(db, {
        description_pattern: 'SPOTIFY',
        merchant_name: 'Spotify',
        category_id: 5,
        frequency: 'monthly'
      });

      // Act
      const patterns = getAllPatterns(db);

      // Assert
      expect(patterns).toHaveLength(2);
      expect(patterns[0]).toHaveProperty('category_name');
      expect(patterns[0]).toHaveProperty('category_colour');
      expect(patterns[0]).toHaveProperty('transaction_count');
    });

    it('should not return inactive patterns', () => {
      // Arrange
      const pattern = createPattern(db, {
        description_pattern: 'INACTIVE',
        frequency: 'monthly'
      });
      updatePattern(db, pattern.id, { is_active: false });

      // Act
      const patterns = getAllPatterns(db);

      // Assert
      const inactive = patterns.find(p => p.description_pattern === 'INACTIVE');
      expect(inactive).toBeUndefined();
    });

    it('should include transaction count for each pattern', () => {
      // Arrange
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'NETFLIX',
        debit_amount: 15.99
      });
      const pattern = createPattern(db, {
        description_pattern: 'NETFLIX',
        frequency: 'monthly'
      }, [txnId]);

      // Act
      const patterns = getAllPatterns(db);

      // Assert
      const netflix = patterns.find(p => p.description_pattern === 'NETFLIX');
      expect(netflix.transaction_count).toBe(1);
    });
  });

  // ==========================================================================
  // getPatternById
  // ==========================================================================
  describe('getPatternById', () => {
    it('should return pattern with category info and transaction count', () => {
      // Arrange
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'NETFLIX',
        debit_amount: 15.99
      });
      const created = createPattern(db, {
        description_pattern: 'NETFLIX',
        merchant_name: 'Netflix',
        category_id: 5,
        frequency: 'monthly'
      }, [txnId]);

      // Act
      const pattern = getPatternById(db, created.id);

      // Assert
      expect(pattern).toBeDefined();
      expect(pattern.description_pattern).toBe('NETFLIX');
      expect(pattern.category_name).toBe('Entertainment');
      expect(pattern.transaction_count).toBe(1);
    });

    it('should return null for non-existent pattern', () => {
      const pattern = getPatternById(db, 999);
      expect(pattern).toBeNull();
    });
  });

  // ==========================================================================
  // getRecurringTransactions
  // ==========================================================================
  describe('getRecurringTransactions', () => {
    it('should return all transactions linked to a pattern', () => {
      // Arrange
      const txnId1 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'NETFLIX',
        debit_amount: 15.99
      });
      const txnId2 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'NETFLIX',
        debit_amount: 15.99
      });
      const pattern = createPattern(db, {
        description_pattern: 'NETFLIX',
        frequency: 'monthly'
      }, [txnId1, txnId2]);

      // Act
      const txns = getRecurringTransactions(db, pattern.id);

      // Assert
      expect(txns).toHaveLength(2);
      expect(txns[0]).toHaveProperty('category_name');
      expect(txns[0]).toHaveProperty('account_name');
    });

    it('should throw error for non-existent pattern', () => {
      expect(() => getRecurringTransactions(db, 999)).toThrow('Pattern not found');
    });

    it('should return transactions ordered by date descending', () => {
      // Arrange
      const txnId1 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00
      });
      const txnId2 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-01',
        description: 'TEST',
        debit_amount: 10.00
      });
      const txnId3 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'TEST',
        debit_amount: 10.00
      });
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      }, [txnId1, txnId2, txnId3]);

      // Act
      const txns = getRecurringTransactions(db, pattern.id);

      // Assert
      expect(txns[0].transaction_date).toBe('2025-03-01');
      expect(txns[1].transaction_date).toBe('2025-02-01');
      expect(txns[2].transaction_date).toBe('2025-01-01');
    });
  });

  // ==========================================================================
  // markAsRecurring
  // ==========================================================================
  describe('markAsRecurring', () => {
    it('should mark transactions as recurring and link to pattern', () => {
      // Arrange
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      });
      const txnId1 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00
      });
      const txnId2 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'TEST',
        debit_amount: 10.00
      });

      // Act
      const count = markAsRecurring(db, [txnId1, txnId2], pattern.id);

      // Assert
      expect(count).toBe(2);

      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId1);
      expect(txn.is_recurring).toBe(1);
      expect(txn.recurring_group_id).toBe(pattern.id);
    });

    it('should update pattern last_seen date', () => {
      // Arrange
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      });
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-06-15',
        description: 'TEST',
        debit_amount: 10.00
      });

      // Act
      markAsRecurring(db, [txnId], pattern.id);

      // Assert
      const updated = getPatternById(db, pattern.id);
      expect(updated.last_seen).toBe('2025-06-15');
    });

    it('should throw error for empty transaction IDs', () => {
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      });

      expect(() => markAsRecurring(db, [], pattern.id)).toThrow('Transaction IDs are required');
    });

    it('should throw error for non-existent pattern', () => {
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00
      });

      expect(() => markAsRecurring(db, [txnId], 999)).toThrow('Pattern not found');
    });

    it('should throw error for non-existent transaction', () => {
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      });

      expect(() => markAsRecurring(db, [99999], pattern.id)).toThrow('One or more transactions not found');
    });
  });

  // ==========================================================================
  // updatePattern
  // ==========================================================================
  describe('updatePattern', () => {
    it('should update pattern merchant_name', () => {
      // Arrange
      const pattern = createPattern(db, {
        description_pattern: 'NETFLIX',
        merchant_name: 'Netflix Inc',
        frequency: 'monthly'
      });

      // Act
      const updated = updatePattern(db, pattern.id, { merchant_name: 'Netflix' });

      // Assert
      expect(updated.merchant_name).toBe('Netflix');
    });

    it('should update pattern frequency', () => {
      // Arrange
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      });

      // Act
      const updated = updatePattern(db, pattern.id, { frequency: 'weekly' });

      // Assert
      expect(updated.frequency).toBe('weekly');
    });

    it('should update category and also update linked transactions', () => {
      // Arrange
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00,
        category_id: 3 // Groceries
      });
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        category_id: 3,
        frequency: 'monthly'
      }, [txnId]);

      // Act
      updatePattern(db, pattern.id, { category_id: 5 }); // Entertainment

      // Assert
      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
      expect(txn.category_id).toBe(5);
    });

    it('should throw error for non-existent pattern', () => {
      expect(() => updatePattern(db, 999, { merchant_name: 'Test' })).toThrow('Pattern not found');
    });

    it('should throw error for invalid frequency', () => {
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      });

      expect(() => updatePattern(db, pattern.id, { frequency: 'invalid' })).toThrow('Invalid frequency');
    });

    it('should throw error for invalid category_id', () => {
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      });

      expect(() => updatePattern(db, pattern.id, { category_id: 999 })).toThrow('Category not found');
    });

    it('should set is_active to false (soft delete)', () => {
      // Arrange
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      });

      // Act
      const updated = updatePattern(db, pattern.id, { is_active: false });

      // Assert
      expect(updated.is_active).toBe(0);
    });
  });

  // ==========================================================================
  // deletePattern
  // ==========================================================================
  describe('deletePattern', () => {
    it('should delete pattern and unlink transactions', () => {
      // Arrange
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00
      });
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      }, [txnId]);

      // Act
      const result = deletePattern(db, pattern.id);

      // Assert
      expect(result.deleted).toBe(true);
      expect(result.transactions_unlinked).toBe(1);

      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
      expect(txn.is_recurring).toBe(0);
      expect(txn.recurring_group_id).toBeNull();

      const deletedPattern = getPatternById(db, pattern.id);
      expect(deletedPattern).toBeNull();
    });

    it('should throw error for non-existent pattern', () => {
      expect(() => deletePattern(db, 999)).toThrow('Pattern not found');
    });
  });

  // ==========================================================================
  // unlinkTransaction
  // ==========================================================================
  describe('unlinkTransaction', () => {
    it('should unlink transaction from its pattern', () => {
      // Arrange
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00
      });
      const pattern = createPattern(db, {
        description_pattern: 'TEST',
        frequency: 'monthly'
      }, [txnId]);

      // Act
      const result = unlinkTransaction(db, txnId);

      // Assert
      expect(result.is_recurring).toBe(0);
      expect(result.recurring_group_id).toBeNull();
    });

    it('should throw error for non-existent transaction', () => {
      expect(() => unlinkTransaction(db, 99999)).toThrow('Transaction not found');
    });
  });

  // ==========================================================================
  // Edge Cases and Integration Tests
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle transactions with different date formats in description', () => {
      // Arrange: Descriptions with dates that should be normalized
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'PAYMENT 01/01/2025 REF123',
        original_description: 'PAYMENT 01/01/2025 REF123',
        debit_amount: 50.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'PAYMENT 01/02/2025 REF456',
        original_description: 'PAYMENT 01/02/2025 REF456',
        debit_amount: 50.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-01',
        description: 'PAYMENT 01/03/2025 REF789',
        original_description: 'PAYMENT 01/03/2025 REF789',
        debit_amount: 50.00
      });

      // Act
      const patterns = detectRecurringPatterns(db, { lookbackMonths: 0 });

      // Assert: Should group these together despite different dates in description
      const paymentPattern = patterns.find(p => p.description_pattern.includes('PAYMENT'));
      expect(paymentPattern).toBeDefined();
    });

    it('should detect quarterly patterns', () => {
      // Arrange: Quarterly transactions (every ~90 days)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2024-01-15',
        description: 'QUARTERLY INSURANCE',
        original_description: 'QUARTERLY INSURANCE',
        debit_amount: 200.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2024-04-15',
        description: 'QUARTERLY INSURANCE',
        original_description: 'QUARTERLY INSURANCE',
        debit_amount: 200.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2024-07-15',
        description: 'QUARTERLY INSURANCE',
        original_description: 'QUARTERLY INSURANCE',
        debit_amount: 200.00
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2024-10-15',
        description: 'QUARTERLY INSURANCE',
        original_description: 'QUARTERLY INSURANCE',
        debit_amount: 200.00
      });

      // Act
      const patterns = detectRecurringPatterns(db, { lookbackMonths: 0 });

      // Assert
      const quarterlyPattern = patterns.find(p => p.description_pattern.includes('QUARTERLY'));
      expect(quarterlyPattern).toBeDefined();
      expect(quarterlyPattern.frequency).toBe('quarterly');
    });

    it('should use most common category from transactions', () => {
      // Arrange: 3 transactions, 2 with category 3, 1 with category 4
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'MIXED CATEGORY',
        original_description: 'MIXED CATEGORY',
        debit_amount: 25.00,
        category_id: 3
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'MIXED CATEGORY',
        original_description: 'MIXED CATEGORY',
        debit_amount: 25.00,
        category_id: 3
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-01',
        description: 'MIXED CATEGORY',
        original_description: 'MIXED CATEGORY',
        debit_amount: 25.00,
        category_id: 4
      });

      // Act
      const patterns = detectRecurringPatterns(db, { lookbackMonths: 0 });

      // Assert
      const mixedPattern = patterns.find(p => p.description_pattern.includes('MIXED'));
      expect(mixedPattern).toBeDefined();
      expect(mixedPattern.category_id).toBe(3);
    });

    it('should handle pattern with null category gracefully', () => {
      // Arrange
      const pattern = createPattern(db, {
        description_pattern: 'NO CATEGORY',
        frequency: 'monthly',
        category_id: null
      });

      // Act
      const retrieved = getPatternById(db, pattern.id);

      // Assert
      expect(retrieved.category_id).toBeNull();
      expect(retrieved.category_name).toBeNull();
    });
  });
});
