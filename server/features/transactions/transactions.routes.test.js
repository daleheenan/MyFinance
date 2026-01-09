/**
 * Transactions Routes Tests (TDD - TASK-3.2)
 *
 * Tests for:
 * - GET /api/transactions - List transactions with pagination and filters
 * - GET /api/transactions/:id - Get single transaction with category info
 * - PUT /api/transactions/:id - Update description, category_id, notes
 * - DELETE /api/transactions/:id - Delete transaction and recalculate balances
 * - POST /api/transactions/:id/categorize - Auto/manual categorization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import { setDb } from '../../core/database.js';
import { setupMiddleware } from '../../core/middleware.js';
import { errorHandler, notFoundHandler } from '../../core/errors.js';
import transactionsRouter from './transactions.routes.js';

/**
 * Create test app with transactions routes directly registered.
 * This avoids async route registration issues in tests.
 */
function createTestApp(db) {
  const app = express();
  setDb(db);
  setupMiddleware(app);
  app.use('/api/transactions', transactionsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('Transactions API', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createTestApp(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // Helper to insert multiple transactions for testing
  function insertTransactions(transactionsData) {
    const ids = [];
    for (const txn of transactionsData) {
      const id = insertTestTransaction(db, txn);
      ids.push(id);
    }
    return ids;
  }

  // Helper to recalculate running balances after inserting test data
  function recalculateBalances(accountId) {
    const account = db.prepare('SELECT opening_balance FROM accounts WHERE id = ?').get(accountId);
    const openingBalance = account?.opening_balance || 0;

    const transactions = db.prepare(`
      SELECT id, credit_amount, debit_amount
      FROM transactions
      WHERE account_id = ?
      ORDER BY transaction_date ASC, id ASC
    `).all(accountId);

    let runningBalance = openingBalance;
    const updateStmt = db.prepare('UPDATE transactions SET balance_after = ? WHERE id = ?');

    for (const txn of transactions) {
      runningBalance = Math.round((runningBalance + txn.credit_amount - txn.debit_amount) * 100) / 100;
      updateStmt.run(runningBalance, txn.id);
    }

    // Update account current balance
    db.prepare('UPDATE accounts SET current_balance = ? WHERE id = ?').run(runningBalance, accountId);
  }

  // ==========================================================================
  // GET /api/transactions - List transactions
  // ==========================================================================
  describe('GET /api/transactions', () => {
    it('should require account_id parameter', async () => {
      const response = await request(app)
        .get('/api/transactions')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('account_id is required');
    });

    it('should return empty array when no transactions exist', async () => {
      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 0,
        pages: 0
      });
    });

    it('should return transactions for given account', async () => {
      insertTransactions([
        { account_id: 1, description: 'TXN 1', debit_amount: 100, transaction_date: '2025-01-15' },
        { account_id: 1, description: 'TXN 2', credit_amount: 50, transaction_date: '2025-01-16' },
        { account_id: 2, description: 'TXN 3', debit_amount: 25, transaction_date: '2025-01-15' }
      ]);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every(t => t.account_id === 1)).toBe(true);
    });

    it('should include category information in response', async () => {
      insertTransactions([
        { account_id: 1, description: 'GROCERY', category_id: 3, debit_amount: 50 }
      ]);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1 })
        .expect(200);

      expect(response.body.data[0]).toHaveProperty('category_name');
      expect(response.body.data[0]).toHaveProperty('category_colour');
      expect(response.body.data[0].category_name).toBe('Groceries');
    });

    it('should paginate results with default limit of 50', async () => {
      // Insert 60 transactions
      const txns = Array.from({ length: 60 }, (_, i) => ({
        account_id: 1,
        description: `TXN ${i + 1}`,
        debit_amount: 10,
        transaction_date: `2025-01-${String(Math.min(i + 1, 28)).padStart(2, '0')}`
      }));
      insertTransactions(txns);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1 })
        .expect(200);

      expect(response.body.data).toHaveLength(50);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 60,
        pages: 2
      });
    });

    it('should support custom page and limit', async () => {
      const txns = Array.from({ length: 25 }, (_, i) => ({
        account_id: 1,
        description: `TXN ${i + 1}`,
        debit_amount: 10,
        transaction_date: '2025-01-15'
      }));
      insertTransactions(txns);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1, page: 2, limit: 10 })
        .expect(200);

      expect(response.body.data).toHaveLength(10);
      expect(response.body.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        pages: 3
      });
    });

    it('should filter by date range with from_date and to_date', async () => {
      insertTransactions([
        { account_id: 1, description: 'TXN 1', debit_amount: 10, transaction_date: '2025-01-01' },
        { account_id: 1, description: 'TXN 2', debit_amount: 20, transaction_date: '2025-01-15' },
        { account_id: 1, description: 'TXN 3', debit_amount: 30, transaction_date: '2025-01-31' }
      ]);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1, from_date: '2025-01-10', to_date: '2025-01-20' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].description).toBe('TXN 2');
    });

    it('should filter by from_date only', async () => {
      insertTransactions([
        { account_id: 1, description: 'TXN 1', debit_amount: 10, transaction_date: '2025-01-01' },
        { account_id: 1, description: 'TXN 2', debit_amount: 20, transaction_date: '2025-01-15' }
      ]);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1, from_date: '2025-01-10' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].description).toBe('TXN 2');
    });

    it('should filter by to_date only', async () => {
      insertTransactions([
        { account_id: 1, description: 'TXN 1', debit_amount: 10, transaction_date: '2025-01-01' },
        { account_id: 1, description: 'TXN 2', debit_amount: 20, transaction_date: '2025-01-15' }
      ]);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1, to_date: '2025-01-10' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].description).toBe('TXN 1');
    });

    it('should filter by category_id', async () => {
      insertTransactions([
        { account_id: 1, description: 'TXN 1', category_id: 3, debit_amount: 10 },
        { account_id: 1, description: 'TXN 2', category_id: 4, debit_amount: 20 },
        { account_id: 1, description: 'TXN 3', category_id: 3, debit_amount: 30 }
      ]);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1, category_id: 3 })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every(t => t.category_id === 3)).toBe(true);
    });

    it('should search by description (case insensitive)', async () => {
      insertTransactions([
        { account_id: 1, description: 'TESCO SUPERMARKET', debit_amount: 50 },
        { account_id: 1, description: 'AMAZON PURCHASE', debit_amount: 100 },
        { account_id: 1, description: 'Tesco Express', debit_amount: 25 }
      ]);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1, search: 'tesco' })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every(t => t.description.toLowerCase().includes('tesco'))).toBe(true);
    });

    it('should combine multiple filters', async () => {
      insertTransactions([
        { account_id: 1, description: 'TESCO JAN', category_id: 3, debit_amount: 50, transaction_date: '2025-01-15' },
        { account_id: 1, description: 'TESCO FEB', category_id: 3, debit_amount: 60, transaction_date: '2025-02-15' },
        { account_id: 1, description: 'AMAZON JAN', category_id: 4, debit_amount: 100, transaction_date: '2025-01-15' }
      ]);

      const response = await request(app)
        .get('/api/transactions')
        .query({
          account_id: 1,
          category_id: 3,
          search: 'tesco',
          from_date: '2025-01-01',
          to_date: '2025-01-31'
        })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].description).toBe('TESCO JAN');
    });

    it('should order transactions by date descending', async () => {
      insertTransactions([
        { account_id: 1, description: 'TXN 1', debit_amount: 10, transaction_date: '2025-01-01' },
        { account_id: 1, description: 'TXN 2', debit_amount: 20, transaction_date: '2025-01-15' },
        { account_id: 1, description: 'TXN 3', debit_amount: 30, transaction_date: '2025-01-10' }
      ]);

      const response = await request(app)
        .get('/api/transactions')
        .query({ account_id: 1 })
        .expect(200);

      expect(response.body.data[0].transaction_date).toBe('2025-01-15');
      expect(response.body.data[1].transaction_date).toBe('2025-01-10');
      expect(response.body.data[2].transaction_date).toBe('2025-01-01');
    });
  });

  // ==========================================================================
  // GET /api/transactions/:id - Get single transaction
  // ==========================================================================
  describe('GET /api/transactions/:id', () => {
    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app)
        .get('/api/transactions/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Transaction not found');
    });

    it('should return single transaction with category info', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'TESCO GROCERIES', category_id: 3, debit_amount: 75.50 }
      ]);

      const response = await request(app)
        .get(`/api/transactions/${id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(id);
      expect(response.body.data.description).toBe('TESCO GROCERIES');
      expect(response.body.data.debit_amount).toBe(75.50);
      expect(response.body.data.category_name).toBe('Groceries');
      expect(response.body.data.category_colour).toBe('#007aff');
    });

    it('should handle transaction without category', async () => {
      // Insert without category
      const stmt = db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(1, '2025-01-15', 'UNCATEGORIZED TXN', 50, 0);

      const response = await request(app)
        .get(`/api/transactions/${result.lastInsertRowid}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.category_name).toBeNull();
    });
  });

  // ==========================================================================
  // PUT /api/transactions/:id - Update transaction
  // ==========================================================================
  describe('PUT /api/transactions/:id', () => {
    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app)
        .put('/api/transactions/999')
        .send({ description: 'Updated' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Transaction not found');
    });

    it('should update description and preserve original_description', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'ORIGINAL DESC', original_description: 'ORIGINAL DESC', debit_amount: 50 }
      ]);

      const response = await request(app)
        .put(`/api/transactions/${id}`)
        .send({ description: 'NEW DESCRIPTION' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.description).toBe('NEW DESCRIPTION');
      expect(response.body.data.original_description).toBe('ORIGINAL DESC');
    });

    it('should update category_id', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'TXN', category_id: 11, debit_amount: 50 }
      ]);

      const response = await request(app)
        .put(`/api/transactions/${id}`)
        .send({ category_id: 3 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.category_id).toBe(3);
    });

    it('should update notes', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'TXN', debit_amount: 50 }
      ]);

      const response = await request(app)
        .put(`/api/transactions/${id}`)
        .send({ notes: 'This is a test note' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notes).toBe('This is a test note');
    });

    it('should NOT allow updating amounts (immutable from import)', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'TXN', debit_amount: 50, credit_amount: 0 }
      ]);

      const response = await request(app)
        .put(`/api/transactions/${id}`)
        .send({ debit_amount: 100, credit_amount: 200 })
        .expect(200);

      // Verify amounts unchanged
      const txn = db.prepare('SELECT debit_amount, credit_amount FROM transactions WHERE id = ?').get(id);
      expect(txn.debit_amount).toBe(50);
      expect(txn.credit_amount).toBe(0);
    });

    it('should NOT allow updating transaction_date', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'TXN', debit_amount: 50, transaction_date: '2025-01-15' }
      ]);

      await request(app)
        .put(`/api/transactions/${id}`)
        .send({ transaction_date: '2025-12-31' })
        .expect(200);

      // Verify date unchanged
      const txn = db.prepare('SELECT transaction_date FROM transactions WHERE id = ?').get(id);
      expect(txn.transaction_date).toBe('2025-01-15');
    });

    it('should return updated transaction with category info', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'TXN', category_id: 11, debit_amount: 50 }
      ]);

      const response = await request(app)
        .put(`/api/transactions/${id}`)
        .send({ category_id: 3 })
        .expect(200);

      expect(response.body.data).toHaveProperty('category_name');
      expect(response.body.data.category_name).toBe('Groceries');
    });

    it('should update multiple fields at once', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'OLD DESC', category_id: 11, debit_amount: 50 }
      ]);

      const response = await request(app)
        .put(`/api/transactions/${id}`)
        .send({
          description: 'NEW DESC',
          category_id: 4,
          notes: 'Updated note'
        })
        .expect(200);

      expect(response.body.data.description).toBe('NEW DESC');
      expect(response.body.data.category_id).toBe(4);
      expect(response.body.data.notes).toBe('Updated note');
    });
  });

  // ==========================================================================
  // DELETE /api/transactions/:id - Delete transaction
  // ==========================================================================
  describe('DELETE /api/transactions/:id', () => {
    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app)
        .delete('/api/transactions/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Transaction not found');
    });

    it('should delete transaction successfully', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'TO DELETE', debit_amount: 50 }
      ]);

      const response = await request(app)
        .delete(`/api/transactions/${id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Transaction deleted');

      // Verify deletion
      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
      expect(txn).toBeUndefined();
    });

    it('should recalculate running balances after delete', async () => {
      // Insert transactions with known values
      insertTransactions([
        { account_id: 1, description: 'TXN 1', credit_amount: 100, debit_amount: 0, transaction_date: '2025-01-01' },
        { account_id: 1, description: 'TXN 2', debit_amount: 30, credit_amount: 0, transaction_date: '2025-01-02' },
        { account_id: 1, description: 'TXN 3', debit_amount: 20, credit_amount: 0, transaction_date: '2025-01-03' }
      ]);

      // Recalculate balances first
      recalculateBalances(1);

      // Verify initial balances: 100, 70, 50
      let txns = db.prepare('SELECT * FROM transactions WHERE account_id = 1 ORDER BY transaction_date').all();
      expect(txns[0].balance_after).toBe(100);
      expect(txns[1].balance_after).toBe(70);
      expect(txns[2].balance_after).toBe(50);

      // Delete middle transaction (TXN 2 with -30)
      const middleId = txns[1].id;
      await request(app)
        .delete(`/api/transactions/${middleId}`)
        .expect(200);

      // After deletion, balances should be recalculated: 100, 80
      txns = db.prepare('SELECT * FROM transactions WHERE account_id = 1 ORDER BY transaction_date').all();
      expect(txns).toHaveLength(2);
      expect(txns[0].balance_after).toBe(100);  // TXN 1
      expect(txns[1].balance_after).toBe(80);   // TXN 3 (100 - 20 = 80)
    });

    it('should update account current_balance after delete', async () => {
      insertTransactions([
        { account_id: 1, description: 'TXN 1', credit_amount: 100, debit_amount: 0, transaction_date: '2025-01-01' },
        { account_id: 1, description: 'TXN 2', debit_amount: 30, credit_amount: 0, transaction_date: '2025-01-02' }
      ]);
      recalculateBalances(1);

      // Initial balance should be 70
      let account = db.prepare('SELECT current_balance FROM accounts WHERE id = 1').get();
      expect(account.current_balance).toBe(70);

      // Delete debit transaction
      const txns = db.prepare('SELECT * FROM transactions WHERE account_id = 1 ORDER BY transaction_date').all();
      await request(app)
        .delete(`/api/transactions/${txns[1].id}`)
        .expect(200);

      // Balance should now be 100
      account = db.prepare('SELECT current_balance FROM accounts WHERE id = 1').get();
      expect(account.current_balance).toBe(100);
    });
  });

  // ==========================================================================
  // POST /api/transactions/:id/categorize - Categorize transaction
  // ==========================================================================
  describe('POST /api/transactions/:id/categorize', () => {
    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app)
        .post('/api/transactions/999/categorize')
        .send({})
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Transaction not found');
    });

    it('should manually assign category when categoryId provided', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'SOME TXN', category_id: 11, debit_amount: 50 }
      ]);

      const response = await request(app)
        .post(`/api/transactions/${id}/categorize`)
        .send({ categoryId: 3 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.category_id).toBe(3);
      expect(response.body.data.category_name).toBe('Groceries');
    });

    it('should auto-categorize using rules when no categoryId provided', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'TESCO SUPERMARKET', category_id: 11, debit_amount: 50 }
      ]);

      const response = await request(app)
        .post(`/api/transactions/${id}/categorize`)
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should match TESCO rule -> Groceries (id: 3)
      expect(response.body.data.category_id).toBe(3);
      expect(response.body.data.category_name).toBe('Groceries');
    });

    it('should keep existing category if no rule matches', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'RANDOM MERCHANT XYZ', category_id: 11, debit_amount: 50 }
      ]);

      const response = await request(app)
        .post(`/api/transactions/${id}/categorize`)
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      // No rule matches, should keep "Other" category (id: 11)
      expect(response.body.data.category_id).toBe(11);
    });

    it('should return 400 for invalid categoryId', async () => {
      const [id] = insertTransactions([
        { account_id: 1, description: 'TXN', category_id: 11, debit_amount: 50 }
      ]);

      const response = await request(app)
        .post(`/api/transactions/${id}/categorize`)
        .send({ categoryId: 9999 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Category not found');
    });
  });
});
