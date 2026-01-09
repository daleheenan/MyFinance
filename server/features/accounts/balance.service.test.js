/**
 * Balance Service Tests (TDD - TASK-2.1)
 *
 * Tests for:
 * - calculateRunningBalances(db, accountId, startDate?)
 * - verifyBalanceAccuracy(db, accountId)
 * - updateOpeningBalance(db, accountId, amount)
 * - getAccountSummary(db, accountId, month?)
 * - getMonthlyAccountSummary(db, accountId, month)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import {
  calculateRunningBalances,
  verifyBalanceAccuracy,
  updateOpeningBalance,
  getAccountSummary,
  getMonthlyAccountSummary
} from './balance.service.js';

describe('BalanceService', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // calculateRunningBalances
  // ==========================================================================
  describe('calculateRunningBalances', () => {
    it('should calculate running balances from opening balance', () => {
      // Arrange: Set opening balance
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();

      // Insert transactions in chronological order
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'Deposit',
        credit_amount: 500,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-02',
        description: 'Withdrawal',
        debit_amount: 200,
        credit_amount: 0
      });

      // Act
      calculateRunningBalances(db, 1);

      // Assert
      const transactions = db.prepare(
        'SELECT * FROM transactions WHERE account_id = 1 ORDER BY transaction_date, id'
      ).all();

      expect(transactions[0].balance_after).toBe(1500); // 1000 + 500
      expect(transactions[1].balance_after).toBe(1300); // 1500 - 200
    });

    it('should handle zero opening balance', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 0 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 100,
        debit_amount: 0
      });

      // Act
      calculateRunningBalances(db, 1);

      // Assert
      const txn = db.prepare('SELECT balance_after FROM transactions WHERE account_id = 1').get();
      expect(txn.balance_after).toBe(100);
    });

    it('should maintain penny precision using Math.round', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 0.01 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 0.02,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-02',
        debit_amount: 0.01,
        credit_amount: 0
      });

      // Act
      calculateRunningBalances(db, 1);

      // Assert
      const transactions = db.prepare(
        'SELECT balance_after FROM transactions WHERE account_id = 1 ORDER BY transaction_date, id'
      ).all();

      expect(transactions[0].balance_after).toBe(0.03); // 0.01 + 0.02
      expect(transactions[1].balance_after).toBe(0.02); // 0.03 - 0.01
    });

    it('should handle floating point edge cases with penny precision', () => {
      // Arrange: Test case that would fail without proper rounding
      // 0.1 + 0.2 = 0.30000000000000004 in JavaScript
      db.prepare('UPDATE accounts SET opening_balance = 0.1 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 0.2,
        debit_amount: 0
      });

      // Act
      calculateRunningBalances(db, 1);

      // Assert
      const txn = db.prepare('SELECT balance_after FROM transactions WHERE account_id = 1').get();
      expect(txn.balance_after).toBe(0.3); // Should be exactly 0.30, not 0.30000000000000004
    });

    it('should order transactions by date and then by id', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 100 WHERE id = 1').run();

      // Insert same date transactions (id order matters)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        description: 'First same day',
        credit_amount: 50,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        description: 'Second same day',
        debit_amount: 25,
        credit_amount: 0
      });

      // Act
      calculateRunningBalances(db, 1);

      // Assert
      const transactions = db.prepare(
        'SELECT description, balance_after FROM transactions WHERE account_id = 1 ORDER BY transaction_date, id'
      ).all();

      expect(transactions[0].description).toBe('First same day');
      expect(transactions[0].balance_after).toBe(150); // 100 + 50
      expect(transactions[1].description).toBe('Second same day');
      expect(transactions[1].balance_after).toBe(125); // 150 - 25
    });

    it('should update account current_balance after recalculation', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 500 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 300,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-02',
        debit_amount: 100,
        credit_amount: 0
      });

      // Act
      calculateRunningBalances(db, 1);

      // Assert
      const account = db.prepare('SELECT current_balance FROM accounts WHERE id = 1').get();
      expect(account.current_balance).toBe(700); // 500 + 300 - 100
    });

    it('should only calculate for specified account', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 100 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET opening_balance = 200 WHERE id = 2').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 50,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 2,
        transaction_date: '2025-01-01',
        credit_amount: 75,
        debit_amount: 0
      });

      // Act: Only calculate for account 1
      calculateRunningBalances(db, 1);

      // Assert
      const txn1 = db.prepare('SELECT balance_after FROM transactions WHERE account_id = 1').get();
      const txn2 = db.prepare('SELECT balance_after FROM transactions WHERE account_id = 2').get();

      expect(txn1.balance_after).toBe(150); // Calculated
      expect(txn2.balance_after).toBeNull(); // Not calculated
    });

    it('should recalculate from startDate when provided', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 100 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 50,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-10',
        credit_amount: 25,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-20',
        debit_amount: 10,
        credit_amount: 0
      });

      // First calculate all
      calculateRunningBalances(db, 1);

      // Manually corrupt the first balance to verify it's not recalculated
      db.prepare('UPDATE transactions SET balance_after = 999 WHERE account_id = 1 AND transaction_date = ?')
        .run('2025-01-01');

      // Act: Recalculate from Jan 10 onwards
      calculateRunningBalances(db, 1, '2025-01-10');

      // Assert
      const transactions = db.prepare(
        'SELECT transaction_date, balance_after FROM transactions WHERE account_id = 1 ORDER BY transaction_date, id'
      ).all();

      expect(transactions[0].balance_after).toBe(999); // Not recalculated (before startDate)
      expect(transactions[1].balance_after).toBe(1024); // 999 + 25 (recalculated from corrupted balance)
      expect(transactions[2].balance_after).toBe(1014); // 1024 - 10
    });

    it('should handle empty transaction list', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 500 WHERE id = 1').run();

      // Act
      calculateRunningBalances(db, 1);

      // Assert: No error, current_balance should equal opening_balance
      const account = db.prepare('SELECT current_balance FROM accounts WHERE id = 1').get();
      expect(account.current_balance).toBe(500);
    });

    it('should throw error for non-existent account', () => {
      expect(() => calculateRunningBalances(db, 999)).toThrow('Account not found');
    });
  });

  // ==========================================================================
  // verifyBalanceAccuracy
  // ==========================================================================
  describe('verifyBalanceAccuracy', () => {
    it('should return true when all balances are correct', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 100 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 50,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-02',
        debit_amount: 25,
        credit_amount: 0
      });

      calculateRunningBalances(db, 1);

      // Act
      const result = verifyBalanceAccuracy(db, 1);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when a balance is incorrect', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 100 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 50,
        debit_amount: 0
      });

      calculateRunningBalances(db, 1);

      // Corrupt the balance
      db.prepare('UPDATE transactions SET balance_after = 999 WHERE account_id = 1').run();

      // Act
      const result = verifyBalanceAccuracy(db, 1);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for account with no transactions', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 100, current_balance = 100 WHERE id = 1').run();

      // Act
      const result = verifyBalanceAccuracy(db, 1);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when current_balance is incorrect', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 100 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 50,
        debit_amount: 0
      });

      calculateRunningBalances(db, 1);

      // Corrupt the account current_balance
      db.prepare('UPDATE accounts SET current_balance = 999 WHERE id = 1').run();

      // Act
      const result = verifyBalanceAccuracy(db, 1);

      // Assert
      expect(result).toBe(false);
    });

    it('should throw error for non-existent account', () => {
      expect(() => verifyBalanceAccuracy(db, 999)).toThrow('Account not found');
    });
  });

  // ==========================================================================
  // updateOpeningBalance
  // ==========================================================================
  describe('updateOpeningBalance', () => {
    it('should update opening balance and recalculate all transactions', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 100 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 50,
        debit_amount: 0
      });

      calculateRunningBalances(db, 1);

      // Act
      updateOpeningBalance(db, 1, 500);

      // Assert
      const account = db.prepare('SELECT opening_balance, current_balance FROM accounts WHERE id = 1').get();
      const txn = db.prepare('SELECT balance_after FROM transactions WHERE account_id = 1').get();

      expect(account.opening_balance).toBe(500);
      expect(txn.balance_after).toBe(550); // 500 + 50
      expect(account.current_balance).toBe(550);
    });

    it('should apply penny precision to opening balance', () => {
      // Arrange: Use a value that would have floating point issues
      updateOpeningBalance(db, 1, 100.005);

      // Assert
      const account = db.prepare('SELECT opening_balance FROM accounts WHERE id = 1').get();
      expect(account.opening_balance).toBe(100.01); // Rounded to 2 decimal places
    });

    it('should handle negative opening balance', () => {
      // Arrange
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 50,
        debit_amount: 0
      });

      // Act
      updateOpeningBalance(db, 1, -100);

      // Assert
      const account = db.prepare('SELECT opening_balance, current_balance FROM accounts WHERE id = 1').get();
      const txn = db.prepare('SELECT balance_after FROM transactions WHERE account_id = 1').get();

      expect(account.opening_balance).toBe(-100);
      expect(txn.balance_after).toBe(-50); // -100 + 50
      expect(account.current_balance).toBe(-50);
    });

    it('should throw error for non-existent account', () => {
      expect(() => updateOpeningBalance(db, 999, 100)).toThrow('Account not found');
    });
  });

  // ==========================================================================
  // getAccountSummary
  // ==========================================================================
  describe('getAccountSummary', () => {
    it('should return income, expenses, net, and balance', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();

      // Income transaction (credit)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'Salary',
        credit_amount: 2000,
        debit_amount: 0,
        category_id: 1 // Salary (income)
      });

      // Expense transaction (debit)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-05',
        description: 'Shopping',
        debit_amount: 150,
        credit_amount: 0,
        category_id: 4 // Shopping (expense)
      });

      calculateRunningBalances(db, 1);

      // Act
      const summary = getAccountSummary(db, 1);

      // Assert
      expect(summary).toEqual({
        income: 2000,
        expenses: 150,
        net: 1850,
        balance: 2850 // 1000 + 2000 - 150
      });
    });

    it('should exclude transfers from income and expenses', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();

      // Regular income
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 500,
        debit_amount: 0,
        category_id: 1
      });

      // Transfer OUT (should be excluded)
      const transferOutId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-02',
        description: 'Transfer to Daily Spend',
        debit_amount: 200,
        credit_amount: 0,
        category_id: 10 // Transfer category
      });
      db.prepare('UPDATE transactions SET is_transfer = 1 WHERE id = ?').run(transferOutId);

      calculateRunningBalances(db, 1);

      // Act
      const summary = getAccountSummary(db, 1);

      // Assert
      expect(summary.income).toBe(500);
      expect(summary.expenses).toBe(0); // Transfer excluded
      expect(summary.net).toBe(500);
      expect(summary.balance).toBe(1300); // 1000 + 500 - 200 (balance includes transfer)
    });

    it('should exclude Daily Spend account transactions from Main Account income', () => {
      // Arrange: This tests the business rule that Daily Spend (account_id=2)
      // income should be excluded from Main Account (account_id=1) calculations
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();

      // Regular income on Main Account
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 500,
        debit_amount: 0,
        category_id: 1
      });

      // This is a transfer FROM Daily Spend TO Main Account
      // Should not count as income on Main Account summary
      const transferInId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-02',
        description: 'Transfer from Daily Spend',
        credit_amount: 200,
        debit_amount: 0,
        category_id: 10,
        // Link to Daily Spend transaction
      });
      db.prepare('UPDATE transactions SET is_transfer = 1, linked_transaction_id = 2 WHERE id = ?').run(transferInId);

      calculateRunningBalances(db, 1);

      // Act
      const summary = getAccountSummary(db, 1);

      // Assert
      expect(summary.income).toBe(500); // Only regular income, not transfer
      expect(summary.balance).toBe(1700); // But balance includes all: 1000 + 500 + 200
    });

    it('should filter by month when provided', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();

      // January transaction
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        credit_amount: 500,
        debit_amount: 0,
        category_id: 1
      });

      // February transaction
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-15',
        credit_amount: 300,
        debit_amount: 0,
        category_id: 1
      });

      calculateRunningBalances(db, 1);

      // Act
      const januarySummary = getAccountSummary(db, 1, '2025-01');
      const februarySummary = getAccountSummary(db, 1, '2025-02');

      // Assert
      expect(januarySummary.income).toBe(500);
      expect(februarySummary.income).toBe(300);
    });

    it('should return zeros when no transactions exist', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 500, current_balance = 500 WHERE id = 1').run();

      // Act
      const summary = getAccountSummary(db, 1);

      // Assert
      expect(summary).toEqual({
        income: 0,
        expenses: 0,
        net: 0,
        balance: 500
      });
    });

    it('should apply penny precision to all values', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 0.01 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 0.1,
        debit_amount: 0,
        category_id: 1
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-02',
        credit_amount: 0.2,
        debit_amount: 0,
        category_id: 1
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-03',
        debit_amount: 0.05,
        credit_amount: 0,
        category_id: 4
      });

      calculateRunningBalances(db, 1);

      // Act
      const summary = getAccountSummary(db, 1);

      // Assert: 0.1 + 0.2 = 0.3 (not 0.30000000000000004)
      expect(summary.income).toBe(0.3);
      expect(summary.expenses).toBe(0.05);
      expect(summary.net).toBe(0.25);
      expect(summary.balance).toBe(0.26); // 0.01 + 0.3 - 0.05
    });

    it('should throw error for non-existent account', () => {
      expect(() => getAccountSummary(db, 999)).toThrow('Account not found');
    });
  });

  // ==========================================================================
  // getMonthlyAccountSummary
  // ==========================================================================
  describe('getMonthlyAccountSummary', () => {
    it('should return monthly income and expenses excluding transfers', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();

      // Regular income
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-05',
        credit_amount: 2000,
        debit_amount: 0,
        category_id: 1
      });

      // Regular expense
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-10',
        debit_amount: 100,
        credit_amount: 0,
        category_id: 3
      });

      // Transfer (should be excluded)
      const transferId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        debit_amount: 500,
        credit_amount: 0,
        category_id: 10
      });
      db.prepare('UPDATE transactions SET is_transfer = 1 WHERE id = ?').run(transferId);

      calculateRunningBalances(db, 1);

      // Act
      const summary = getMonthlyAccountSummary(db, 1, '2025-01');

      // Assert
      expect(summary.income).toBe(2000);
      expect(summary.expenses).toBe(100); // Transfer excluded
      expect(summary.net).toBe(1900);
    });

    it('should only include transactions from specified month', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 0 WHERE id = 1').run();

      // December transaction
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2024-12-15',
        credit_amount: 1000,
        debit_amount: 0,
        category_id: 1
      });

      // January transaction
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        credit_amount: 500,
        debit_amount: 0,
        category_id: 1
      });

      // February transaction
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-15',
        credit_amount: 300,
        debit_amount: 0,
        category_id: 1
      });

      // Act
      const summary = getMonthlyAccountSummary(db, 1, '2025-01');

      // Assert
      expect(summary.income).toBe(500);
      expect(summary.expenses).toBe(0);
      expect(summary.net).toBe(500);
    });

    it('should return zeros for month with no transactions', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();

      // Act
      const summary = getMonthlyAccountSummary(db, 1, '2025-06');

      // Assert
      expect(summary).toEqual({
        income: 0,
        expenses: 0,
        net: 0
      });
    });

    it('should handle edge of month dates correctly', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 0 WHERE id = 1').run();

      // First day of January
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 100,
        debit_amount: 0,
        category_id: 1
      });

      // Last day of January
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-31',
        credit_amount: 200,
        debit_amount: 0,
        category_id: 1
      });

      // First day of February (should not be included)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        credit_amount: 50,
        debit_amount: 0,
        category_id: 1
      });

      // Act
      const summary = getMonthlyAccountSummary(db, 1, '2025-01');

      // Assert
      expect(summary.income).toBe(300); // 100 + 200
    });

    it('should apply penny precision', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 0 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 0.1,
        debit_amount: 0,
        category_id: 1
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-02',
        credit_amount: 0.2,
        debit_amount: 0,
        category_id: 1
      });

      // Act
      const summary = getMonthlyAccountSummary(db, 1, '2025-01');

      // Assert
      expect(summary.income).toBe(0.3); // Not 0.30000000000000004
      expect(summary.net).toBe(0.3);
    });

    it('should throw error for non-existent account', () => {
      expect(() => getMonthlyAccountSummary(db, 999, '2025-01')).toThrow('Account not found');
    });

    it('should throw error for invalid month format', () => {
      expect(() => getMonthlyAccountSummary(db, 1, '2025-1')).toThrow('Invalid month format');
      expect(() => getMonthlyAccountSummary(db, 1, '2025/01')).toThrow('Invalid month format');
      expect(() => getMonthlyAccountSummary(db, 1, 'January 2025')).toThrow('Invalid month format');
    });

    it('should handle month parameter as required', () => {
      expect(() => getMonthlyAccountSummary(db, 1)).toThrow();
    });
  });

  // ==========================================================================
  // Edge Cases and Integration Tests
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle very large transaction amounts', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 0 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 1000000.99,
        debit_amount: 0,
        category_id: 1
      });

      // Act
      calculateRunningBalances(db, 1);
      const summary = getAccountSummary(db, 1);

      // Assert
      expect(summary.income).toBe(1000000.99);
      expect(summary.balance).toBe(1000000.99);
    });

    it('should handle many transactions efficiently', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();

      // Insert 100 transactions
      for (let i = 1; i <= 100; i++) {
        const day = String(Math.min(i, 28)).padStart(2, '0');
        insertTestTransaction(db, {
          account_id: 1,
          transaction_date: `2025-01-${day}`,
          credit_amount: 10,
          debit_amount: 0,
          category_id: 1
        });
      }

      // Act
      const startTime = Date.now();
      calculateRunningBalances(db, 1);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second

      const account = db.prepare('SELECT current_balance FROM accounts WHERE id = 1').get();
      expect(account.current_balance).toBe(2000); // 1000 + (100 * 10)
    });

    it('should correctly handle credit card account (negative = owed)', () => {
      // Arrange: Credit Card is account_id 4
      db.prepare('UPDATE accounts SET opening_balance = 0 WHERE id = 4').run();

      // Purchase (debit on credit card = money owed)
      insertTestTransaction(db, {
        account_id: 4,
        transaction_date: '2025-01-01',
        debit_amount: 100,
        credit_amount: 0,
        category_id: 4
      });

      // Payment (credit on credit card = paying off debt)
      insertTestTransaction(db, {
        account_id: 4,
        transaction_date: '2025-01-15',
        credit_amount: 50,
        debit_amount: 0,
        category_id: 10
      });

      // Act
      calculateRunningBalances(db, 4);

      // Assert
      const transactions = db.prepare(
        'SELECT balance_after FROM transactions WHERE account_id = 4 ORDER BY transaction_date, id'
      ).all();

      expect(transactions[0].balance_after).toBe(-100); // Owed 100
      expect(transactions[1].balance_after).toBe(-50);  // Owed 50 after payment
    });

    it('should maintain consistency after multiple recalculations', () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 100 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        credit_amount: 50,
        debit_amount: 0,
        category_id: 1
      });

      // Act: Calculate multiple times
      calculateRunningBalances(db, 1);
      calculateRunningBalances(db, 1);
      calculateRunningBalances(db, 1);

      // Assert
      const account = db.prepare('SELECT current_balance FROM accounts WHERE id = 1').get();
      const txn = db.prepare('SELECT balance_after FROM transactions WHERE account_id = 1').get();

      expect(account.current_balance).toBe(150);
      expect(txn.balance_after).toBe(150);
      expect(verifyBalanceAccuracy(db, 1)).toBe(true);
    });
  });
});
