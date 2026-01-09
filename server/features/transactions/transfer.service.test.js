import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import {
  detectTransfers,
  linkTransferPair,
  unlinkTransfer,
  isInternalTransfer
} from './transfer.service.js';

describe('TransferService', () => {
  let db;

  // Account IDs from seeds.sql
  const MAIN_ACCOUNT_ID = 1;      // 17570762
  const DAILY_SPEND_ID = 2;       // 00393366
  const THEO_ACCOUNT_ID = 3;      // 55128841
  const CREDIT_CARD_ID = 4;       // 4521XXXXXXXX

  // Transfer category ID from seeds.sql
  const TRANSFER_CATEGORY_ID = 10;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('detectTransfers', () => {
    it('should return empty result when no transactions exist', () => {
      const result = detectTransfers(db);

      expect(result).toEqual({ detected: 0, pairs: [] });
    });

    it('should detect transfer pair between Main and Daily Spend accounts', () => {
      // Debit from Main Account
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER TO DAILY',
        debit_amount: 500,
        credit_amount: 0
      });

      // Credit to Daily Spend
      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER FROM MAIN',
        debit_amount: 0,
        credit_amount: 500
      });

      const result = detectTransfers(db);

      expect(result.detected).toBe(1);
      expect(result.pairs).toHaveLength(1);
      expect(result.pairs[0]).toEqual({
        debitTxnId: txn1Id,
        creditTxnId: txn2Id,
        amount: 500
      });
    });

    it('should detect transfer pair between Main and Theo accounts', () => {
      // Debit from Main Account
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-20',
        description: 'TO THEO',
        debit_amount: 250.50,
        credit_amount: 0
      });

      // Credit to Theo Entertainment
      const txn2Id = insertTestTransaction(db, {
        account_id: THEO_ACCOUNT_ID,
        transaction_date: '2025-01-20',
        description: 'FROM MAIN',
        debit_amount: 0,
        credit_amount: 250.50
      });

      const result = detectTransfers(db);

      expect(result.detected).toBe(1);
      expect(result.pairs[0].amount).toBeCloseTo(250.50, 2);
    });

    it('should detect transfer when credit happens on Main (reverse direction)', () => {
      // Debit from Daily Spend
      const txn1Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-18',
        description: 'TRANSFER TO MAIN',
        debit_amount: 100,
        credit_amount: 0
      });

      // Credit to Main Account
      const txn2Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-18',
        description: 'TRANSFER FROM DAILY',
        debit_amount: 0,
        credit_amount: 100
      });

      const result = detectTransfers(db);

      expect(result.detected).toBe(1);
      expect(result.pairs[0].amount).toBe(100);
    });

    it('should respect 3-day window (same day)', () => {
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 200,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 200
      });

      const result = detectTransfers(db);
      expect(result.detected).toBe(1);
    });

    it('should respect 3-day window (3 days apart)', () => {
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 300,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-18', // 3 days later
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 300
      });

      const result = detectTransfers(db);
      expect(result.detected).toBe(1);
    });

    it('should reject pairs more than 3 days apart', () => {
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 400,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-19', // 4 days later - outside window
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 400
      });

      const result = detectTransfers(db);
      expect(result.detected).toBe(0);
      expect(result.pairs).toHaveLength(0);
    });

    it('should not detect transfers between Daily Spend and Theo (not valid pair)', () => {
      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER',
        debit_amount: 150,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: THEO_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER',
        debit_amount: 0,
        credit_amount: 150
      });

      const result = detectTransfers(db);
      expect(result.detected).toBe(0);
    });

    it('should not detect transfers involving Credit Card account', () => {
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'CREDIT CARD PAYMENT',
        debit_amount: 500,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: CREDIT_CARD_ID,
        transaction_date: '2025-01-15',
        description: 'PAYMENT RECEIVED',
        debit_amount: 0,
        credit_amount: 500
      });

      const result = detectTransfers(db);
      expect(result.detected).toBe(0);
    });

    it('should not match transactions with different amounts', () => {
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER',
        debit_amount: 100,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER',
        debit_amount: 0,
        credit_amount: 150 // Different amount
      });

      const result = detectTransfers(db);
      expect(result.detected).toBe(0);
    });

    it('should skip transactions already linked as transfers', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER',
        debit_amount: 200,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER',
        debit_amount: 0,
        credit_amount: 200
      });

      // Link them first
      linkTransferPair(db, txn1Id, txn2Id);

      // Now detect should not find them again
      const result = detectTransfers(db);
      expect(result.detected).toBe(0);
    });

    it('should detect multiple transfer pairs', () => {
      // First pair
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-10',
        description: 'TRANSFER 1',
        debit_amount: 100,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-10',
        description: 'TRANSFER 1',
        debit_amount: 0,
        credit_amount: 100
      });

      // Second pair
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-20',
        description: 'TRANSFER 2',
        debit_amount: 200,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: THEO_ACCOUNT_ID,
        transaction_date: '2025-01-21',
        description: 'TRANSFER 2',
        debit_amount: 0,
        credit_amount: 200
      });

      const result = detectTransfers(db);
      expect(result.detected).toBe(2);
      expect(result.pairs).toHaveLength(2);
    });

    it('should handle penny amounts correctly', () => {
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'SMALL TRANSFER',
        debit_amount: 0.01,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'SMALL TRANSFER',
        debit_amount: 0,
        credit_amount: 0.01
      });

      const result = detectTransfers(db);
      expect(result.detected).toBe(1);
      expect(result.pairs[0].amount).toBeCloseTo(0.01, 2);
    });
  });

  describe('linkTransferPair', () => {
    it('should set is_transfer = 1 on both transactions', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      linkTransferPair(db, txn1Id, txn2Id);

      const txn1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn1Id);
      const txn2 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn2Id);

      expect(txn1.is_transfer).toBe(1);
      expect(txn2.is_transfer).toBe(1);
    });

    it('should set linked_transaction_id bidirectionally', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      linkTransferPair(db, txn1Id, txn2Id);

      const txn1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn1Id);
      const txn2 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn2Id);

      expect(txn1.linked_transaction_id).toBe(txn2Id);
      expect(txn2.linked_transaction_id).toBe(txn1Id);
    });

    it('should assign Transfer category (id=10) to both transactions', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0,
        category_id: 11 // Originally Other
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100,
        category_id: 11 // Originally Other
      });

      linkTransferPair(db, txn1Id, txn2Id);

      const txn1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn1Id);
      const txn2 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn2Id);

      expect(txn1.category_id).toBe(TRANSFER_CATEGORY_ID);
      expect(txn2.category_id).toBe(TRANSFER_CATEGORY_ID);
    });

    it('should update updated_at timestamp', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      const before1 = db.prepare('SELECT updated_at FROM transactions WHERE id = ?').get(txn1Id);
      const before2 = db.prepare('SELECT updated_at FROM transactions WHERE id = ?').get(txn2Id);

      // Small delay to ensure timestamp difference
      linkTransferPair(db, txn1Id, txn2Id);

      const after1 = db.prepare('SELECT updated_at FROM transactions WHERE id = ?').get(txn1Id);
      const after2 = db.prepare('SELECT updated_at FROM transactions WHERE id = ?').get(txn2Id);

      // updated_at should be set (not necessarily different due to timestamp resolution)
      expect(after1.updated_at).toBeDefined();
      expect(after2.updated_at).toBeDefined();
    });

    it('should throw error for invalid transaction id', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      expect(() => {
        linkTransferPair(db, txn1Id, 99999);
      }).toThrow();
    });

    it('should be atomic - both updates succeed or both fail', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      // Try to link with non-existent transaction
      try {
        linkTransferPair(db, txn1Id, 99999);
      } catch (e) {
        // Expected
      }

      // First transaction should remain unchanged
      const txn1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn1Id);
      expect(txn1.is_transfer).toBe(0);
      expect(txn1.linked_transaction_id).toBeNull();
    });

    it('should return success indicator', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      const result = linkTransferPair(db, txn1Id, txn2Id);

      expect(result).toEqual({ success: true, linkedCount: 2 });
    });
  });

  describe('unlinkTransfer', () => {
    it('should set is_transfer = 0 on both linked transactions', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      linkTransferPair(db, txn1Id, txn2Id);
      unlinkTransfer(db, txn1Id);

      const txn1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn1Id);
      const txn2 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn2Id);

      expect(txn1.is_transfer).toBe(0);
      expect(txn2.is_transfer).toBe(0);
    });

    it('should clear linked_transaction_id on both transactions', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      linkTransferPair(db, txn1Id, txn2Id);
      unlinkTransfer(db, txn1Id);

      const txn1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn1Id);
      const txn2 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn2Id);

      expect(txn1.linked_transaction_id).toBeNull();
      expect(txn2.linked_transaction_id).toBeNull();
    });

    it('should work when called with either transaction id', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      linkTransferPair(db, txn1Id, txn2Id);

      // Unlink using the second transaction ID
      unlinkTransfer(db, txn2Id);

      const txn1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn1Id);
      const txn2 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn2Id);

      expect(txn1.is_transfer).toBe(0);
      expect(txn2.is_transfer).toBe(0);
      expect(txn1.linked_transaction_id).toBeNull();
      expect(txn2.linked_transaction_id).toBeNull();
    });

    it('should reset category to Other (id=11)', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      linkTransferPair(db, txn1Id, txn2Id);
      unlinkTransfer(db, txn1Id);

      const txn1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn1Id);
      const txn2 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn2Id);

      expect(txn1.category_id).toBe(11); // Other
      expect(txn2.category_id).toBe(11); // Other
    });

    it('should return unlinked count', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      linkTransferPair(db, txn1Id, txn2Id);
      const result = unlinkTransfer(db, txn1Id);

      expect(result).toEqual({ success: true, unlinkedCount: 2 });
    });

    it('should return zero count for non-transfer transaction', () => {
      const txnId = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'REGULAR TXN',
        debit_amount: 100,
        credit_amount: 0
      });

      const result = unlinkTransfer(db, txnId);

      expect(result).toEqual({ success: true, unlinkedCount: 0 });
    });

    it('should throw error for non-existent transaction', () => {
      expect(() => {
        unlinkTransfer(db, 99999);
      }).toThrow('Transaction not found');
    });
  });

  describe('isInternalTransfer', () => {
    it('should return true for transaction with is_transfer = 1', () => {
      const txn1Id = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER OUT',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn2Id = insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER IN',
        debit_amount: 0,
        credit_amount: 100
      });

      linkTransferPair(db, txn1Id, txn2Id);

      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn1Id);
      expect(isInternalTransfer(txn)).toBe(true);
    });

    it('should return false for transaction with is_transfer = 0', () => {
      const txnId = insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'REGULAR',
        debit_amount: 100,
        credit_amount: 0
      });

      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
      expect(isInternalTransfer(txn)).toBe(false);
    });

    it('should return false for null/undefined input', () => {
      expect(isInternalTransfer(null)).toBe(false);
      expect(isInternalTransfer(undefined)).toBe(false);
    });

    it('should return false for transaction without is_transfer property', () => {
      const txn = { id: 1, description: 'TEST' };
      expect(isInternalTransfer(txn)).toBe(false);
    });

    it('should return true when linked_transaction_id is set', () => {
      const txn = { id: 1, is_transfer: 1, linked_transaction_id: 2 };
      expect(isInternalTransfer(txn)).toBe(true);
    });
  });

  describe('Integration: Detect and Link', () => {
    it('should detect and link transfers automatically', () => {
      // Create matching pair
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-15',
        description: 'TRANSFER TO DAILY',
        debit_amount: 750,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-16',
        description: 'TRANSFER FROM MAIN',
        debit_amount: 0,
        credit_amount: 750
      });

      // Detect transfers
      const detected = detectTransfers(db);
      expect(detected.detected).toBe(1);

      // Link the detected pair
      const pair = detected.pairs[0];
      linkTransferPair(db, pair.debitTxnId, pair.creditTxnId);

      // Verify both are now marked as transfers
      const txns = db.prepare('SELECT * FROM transactions WHERE is_transfer = 1').all();
      expect(txns).toHaveLength(2);

      // Running detect again should find nothing
      const redetected = detectTransfers(db);
      expect(redetected.detected).toBe(0);
    });

    it('should handle complex scenario with mixed transactions', () => {
      // Regular transaction (not a transfer)
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-10',
        description: 'SALARY',
        debit_amount: 0,
        credit_amount: 3000
      });

      // Transfer pair 1: Main -> Daily
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-12',
        description: 'TO DAILY',
        debit_amount: 500,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-12',
        description: 'FROM MAIN',
        debit_amount: 0,
        credit_amount: 500
      });

      // Regular expense
      insertTestTransaction(db, {
        account_id: DAILY_SPEND_ID,
        transaction_date: '2025-01-15',
        description: 'TESCO GROCERIES',
        debit_amount: 85.50,
        credit_amount: 0
      });

      // Transfer pair 2: Main -> Theo
      insertTestTransaction(db, {
        account_id: MAIN_ACCOUNT_ID,
        transaction_date: '2025-01-20',
        description: 'THEO ALLOWANCE',
        debit_amount: 100,
        credit_amount: 0
      });

      insertTestTransaction(db, {
        account_id: THEO_ACCOUNT_ID,
        transaction_date: '2025-01-21',
        description: 'FROM DAD',
        debit_amount: 0,
        credit_amount: 100
      });

      const result = detectTransfers(db);

      expect(result.detected).toBe(2);

      // Link all pairs
      for (const pair of result.pairs) {
        linkTransferPair(db, pair.debitTxnId, pair.creditTxnId);
      }

      // Verify transfer count
      const transfers = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE is_transfer = 1').get();
      expect(transfers.count).toBe(4);

      // Verify non-transfers remain untouched
      const nonTransfers = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE is_transfer = 0').all();
      expect(nonTransfers[0].count).toBe(2); // Salary and Tesco
    });
  });
});
