/**
 * Accounts Routes Tests (TDD - TASK-3.1)
 *
 * Tests for:
 * - GET /api/accounts - List all accounts with current_balance
 * - GET /api/accounts/:id - Get single account with current month summary
 * - PUT /api/accounts/:id - Update account_name, opening_balance
 * - GET /api/accounts/:id/summary - Get account summary for a month
 * - GET /api/accounts/:id/monthly - Get month-by-month summary for last 12 months
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import { setDb } from '../../core/database.js';
import { setupMiddleware } from '../../core/middleware.js';
import { errorHandler, notFoundHandler } from '../../core/errors.js';
import accountsRouter from './accounts.routes.js';

/**
 * Create test app with accounts routes directly registered.
 * This avoids async route registration issues in tests.
 */
function createTestApp(db) {
  const app = express();
  setDb(db);
  setupMiddleware(app);
  app.use('/api/accounts', accountsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('Accounts Routes', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createTestApp(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // GET /api/accounts - List all accounts
  // ==========================================================================
  describe('GET /api/accounts', () => {
    it('should return all accounts with current_balance', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts')
        .expect('Content-Type', /json/)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(4);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('account_name');
      expect(response.body.data[0]).toHaveProperty('account_number');
      expect(response.body.data[0]).toHaveProperty('account_type');
      expect(response.body.data[0]).toHaveProperty('current_balance');
    });

    it('should return accounts ordered by id', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts')
        .expect(200);

      // Assert
      expect(response.body.data[0].account_name).toBe('Main Account');
      expect(response.body.data[1].account_name).toBe('Daily Spend');
      expect(response.body.data[2].account_name).toBe('Theo Entertainment');
      expect(response.body.data[3].account_name).toBe('Credit Card');
    });

    it('should return current_balance reflecting transactions', async () => {
      // Arrange: Add transactions and update balance
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        credit_amount: 500,
        debit_amount: 0
      });
      // Update current_balance to reflect transactions
      db.prepare('UPDATE accounts SET current_balance = 1500 WHERE id = 1').run();

      // Act
      const response = await request(app)
        .get('/api/accounts')
        .expect(200);

      // Assert
      const mainAccount = response.body.data.find(a => a.id === 1);
      expect(mainAccount.current_balance).toBe(1500);
    });
  });

  // ==========================================================================
  // GET /api/accounts/:id - Get single account
  // ==========================================================================
  describe('GET /api/accounts/:id', () => {
    it('should return single account by ID', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/1')
        .expect('Content-Type', /json/)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', 1);
      expect(response.body.data).toHaveProperty('account_name', 'Main Account');
      expect(response.body.data).toHaveProperty('account_number', '17570762');
      expect(response.body.data).toHaveProperty('account_type', 'debit');
    });

    it('should include current month summary (income, expenses, net)', async () => {
      // Arrange: Add transactions for current month
      const currentMonth = new Date().toISOString().slice(0, 7);
      const currentDate = new Date().toISOString().slice(0, 10);

      db.prepare('UPDATE accounts SET opening_balance = 1000, current_balance = 1000 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: currentDate,
        credit_amount: 500,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: currentDate,
        debit_amount: 100,
        credit_amount: 0
      });

      // Act
      const response = await request(app)
        .get('/api/accounts/1')
        .expect(200);

      // Assert
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data.summary).toHaveProperty('income');
      expect(response.body.data.summary).toHaveProperty('expenses');
      expect(response.body.data.summary).toHaveProperty('net');
    });

    it('should return 404 for non-existent account', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/999')
        .expect(404);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Account not found');
    });

    it('should return 400 for invalid account ID', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/abc')
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid/i);
    });
  });

  // ==========================================================================
  // PUT /api/accounts/:id - Update account
  // ==========================================================================
  describe('PUT /api/accounts/:id', () => {
    it('should update account_name', async () => {
      // Act
      const response = await request(app)
        .put('/api/accounts/1')
        .send({ account_name: 'Primary Account' })
        .expect('Content-Type', /json/)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.account_name).toBe('Primary Account');

      // Verify in database
      const account = db.prepare('SELECT account_name FROM accounts WHERE id = 1').get();
      expect(account.account_name).toBe('Primary Account');
    });

    it('should update opening_balance and recalculate balances', async () => {
      // Arrange: Add a transaction
      db.prepare('UPDATE accounts SET opening_balance = 100, current_balance = 100 WHERE id = 1').run();
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        credit_amount: 50,
        debit_amount: 0
      });
      db.prepare('UPDATE transactions SET balance_after = 150 WHERE account_id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 150 WHERE id = 1').run();

      // Act
      const response = await request(app)
        .put('/api/accounts/1')
        .send({ opening_balance: 500 })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.opening_balance).toBe(500);

      // Verify balances were recalculated
      const account = db.prepare('SELECT opening_balance, current_balance FROM accounts WHERE id = 1').get();
      expect(account.opening_balance).toBe(500);
      expect(account.current_balance).toBe(550); // 500 + 50
    });

    it('should update both account_name and opening_balance together', async () => {
      // Act
      const response = await request(app)
        .put('/api/accounts/1')
        .send({
          account_name: 'New Name',
          opening_balance: 1000
        })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.account_name).toBe('New Name');
      expect(response.body.data.opening_balance).toBe(1000);
    });

    it('should return 404 for non-existent account', async () => {
      // Act
      const response = await request(app)
        .put('/api/accounts/999')
        .send({ account_name: 'Test' })
        .expect(404);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Account not found');
    });

    it('should return 400 for invalid account ID', async () => {
      // Act
      const response = await request(app)
        .put('/api/accounts/abc')
        .send({ account_name: 'Test' })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid/i);
    });

    it('should return 400 when no valid fields provided', async () => {
      // Act
      const response = await request(app)
        .put('/api/accounts/1')
        .send({})
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/no valid fields/i);
    });

    it('should return 400 for empty account_name', async () => {
      // Act
      const response = await request(app)
        .put('/api/accounts/1')
        .send({ account_name: '' })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/account_name cannot be empty/i);
    });

    it('should return 400 for non-numeric opening_balance', async () => {
      // Act
      const response = await request(app)
        .put('/api/accounts/1')
        .send({ opening_balance: 'abc' })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/opening_balance must be a number/i);
    });
  });

  // ==========================================================================
  // GET /api/accounts/:id/summary - Get account summary for a month
  // ==========================================================================
  describe('GET /api/accounts/:id/summary', () => {
    it('should return account summary for specified month', async () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000, current_balance = 1000 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        credit_amount: 500,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-20',
        debit_amount: 100,
        credit_amount: 0
      });

      // Update current_balance
      db.prepare('UPDATE accounts SET current_balance = 1400 WHERE id = 1').run();

      // Act
      const response = await request(app)
        .get('/api/accounts/1/summary?month=2025-01')
        .expect('Content-Type', /json/)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('income', 500);
      expect(response.body.data).toHaveProperty('expenses', 100);
      expect(response.body.data).toHaveProperty('net', 400);
      expect(response.body.data).toHaveProperty('balance');
    });

    it('should use current month when no month query param provided', async () => {
      // Arrange
      const currentMonth = new Date().toISOString().slice(0, 7);
      const currentDate = new Date().toISOString().slice(0, 10);

      db.prepare('UPDATE accounts SET opening_balance = 1000, current_balance = 1000 WHERE id = 1').run();

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: currentDate,
        credit_amount: 200,
        debit_amount: 0
      });

      // Act
      const response = await request(app)
        .get('/api/accounts/1/summary')
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.income).toBe(200);
    });

    it('should return 404 for non-existent account', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/999/summary?month=2025-01')
        .expect(404);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Account not found');
    });

    it('should return 400 for invalid month format', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/1/summary?month=2025-1')
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid month format/i);
    });

    it('should exclude transfers from summary', async () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000, current_balance = 1000 WHERE id = 1').run();

      // Regular income
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-10',
        credit_amount: 500,
        debit_amount: 0
      });

      // Transfer (should be excluded)
      const transferId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        debit_amount: 100,
        credit_amount: 0
      });
      db.prepare('UPDATE transactions SET is_transfer = 1 WHERE id = ?').run(transferId);

      // Act
      const response = await request(app)
        .get('/api/accounts/1/summary?month=2025-01')
        .expect(200);

      // Assert
      expect(response.body.data.income).toBe(500);
      expect(response.body.data.expenses).toBe(0); // Transfer excluded
    });
  });

  // ==========================================================================
  // GET /api/accounts/:id/monthly - Get month-by-month summary
  // ==========================================================================
  describe('GET /api/accounts/:id/monthly', () => {
    it('should return month-by-month summary for last 12 months', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/1/monthly')
        .expect('Content-Type', /json/)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(12);

      // Each month should have month, income, expenses, net
      expect(response.body.data[0]).toHaveProperty('month');
      expect(response.body.data[0]).toHaveProperty('income');
      expect(response.body.data[0]).toHaveProperty('expenses');
      expect(response.body.data[0]).toHaveProperty('net');
    });

    it('should return months in chronological order (oldest first)', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/1/monthly')
        .expect(200);

      // Assert
      const months = response.body.data.map(m => m.month);
      const sortedMonths = [...months].sort();
      expect(months).toEqual(sortedMonths);
    });

    it('should include current month as the last month', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/1/monthly')
        .expect(200);

      // Assert
      const currentMonth = new Date().toISOString().slice(0, 7);
      const lastMonth = response.body.data[response.body.data.length - 1];
      expect(lastMonth.month).toBe(currentMonth);
    });

    it('should calculate correct summaries for months with transactions', async () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000, current_balance = 1000 WHERE id = 1').run();

      // Add transactions for January 2025
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-10',
        credit_amount: 500,
        debit_amount: 0
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-20',
        debit_amount: 150,
        credit_amount: 0
      });

      // Act
      const response = await request(app)
        .get('/api/accounts/1/monthly')
        .expect(200);

      // Assert
      const jan2025 = response.body.data.find(m => m.month === '2025-01');
      if (jan2025) {
        expect(jan2025.income).toBe(500);
        expect(jan2025.expenses).toBe(150);
        expect(jan2025.net).toBe(350);
      }
    });

    it('should return 404 for non-existent account', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/999/monthly')
        .expect(404);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Account not found');
    });

    it('should return 400 for invalid account ID', async () => {
      // Act
      const response = await request(app)
        .get('/api/accounts/abc/monthly')
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid/i);
    });

    it('should exclude transfers from monthly summaries', async () => {
      // Arrange
      db.prepare('UPDATE accounts SET opening_balance = 1000, current_balance = 1000 WHERE id = 1').run();

      // Regular expense
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-10',
        debit_amount: 100,
        credit_amount: 0
      });

      // Transfer (should be excluded)
      const transferId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        debit_amount: 200,
        credit_amount: 0
      });
      db.prepare('UPDATE transactions SET is_transfer = 1 WHERE id = ?').run(transferId);

      // Act
      const response = await request(app)
        .get('/api/accounts/1/monthly')
        .expect(200);

      // Assert
      const jan2025 = response.body.data.find(m => m.month === '2025-01');
      if (jan2025) {
        expect(jan2025.expenses).toBe(100); // Transfer excluded
      }
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================
  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Arrange: Close the database to simulate an error
      closeTestDb(db);

      // Act & Assert: Should return 500 error
      const response = await request(app)
        .get('/api/accounts')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });
});
