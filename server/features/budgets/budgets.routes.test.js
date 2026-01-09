/**
 * Budgets Routes Tests
 *
 * TDD tests for Budgets API endpoints.
 * Tests CRUD operations for budgets with spending calculations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../index.js';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';

describe('Budgets Routes', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // Helper to get current month in YYYY-MM format
  const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

  // Helper to insert a budget
  const insertBudget = (categoryId, month, amount, rollover = 0) => {
    return db.prepare(`
      INSERT INTO budgets (category_id, month, budgeted_amount, rollover_amount)
      VALUES (?, ?, ?, ?)
    `).run(categoryId, month, amount, rollover);
  };

  // ==========================================================================
  // GET /api/budgets - List budgets for a month
  // ==========================================================================
  describe('GET /api/budgets', () => {
    it('should return empty array when no budgets exist', async () => {
      const response = await request(app)
        .get('/api/budgets')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return budgets for current month by default', async () => {
      const currentMonth = getCurrentMonth();
      insertBudget(3, currentMonth, 200); // Groceries

      const response = await request(app)
        .get('/api/budgets')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        category_name: 'Groceries',
        budgeted_amount: 200,
        month: currentMonth
      });
    });

    it('should return budgets for specified month', async () => {
      insertBudget(3, '2025-01', 150);
      insertBudget(3, '2025-02', 200);

      const response = await request(app)
        .get('/api/budgets?month=2025-01')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].budgeted_amount).toBe(150);
    });

    it('should calculate spent_amount from transactions', async () => {
      const currentMonth = getCurrentMonth();
      const currentDate = new Date().toISOString().slice(0, 10);

      insertBudget(3, currentMonth, 200); // Groceries

      // Add transactions for Groceries (category_id = 3)
      insertTestTransaction(db, {
        category_id: 3,
        transaction_date: currentDate,
        debit_amount: 50.00
      });
      insertTestTransaction(db, {
        category_id: 3,
        transaction_date: currentDate,
        debit_amount: 30.00
      });

      const response = await request(app)
        .get('/api/budgets')
        .expect(200);

      expect(response.body.data[0].spent_amount).toBeCloseTo(80, 2);
    });

    it('should calculate remaining_amount correctly', async () => {
      const currentMonth = getCurrentMonth();
      const currentDate = new Date().toISOString().slice(0, 10);

      insertBudget(3, currentMonth, 200);

      insertTestTransaction(db, {
        category_id: 3,
        transaction_date: currentDate,
        debit_amount: 75.00
      });

      const response = await request(app)
        .get('/api/budgets')
        .expect(200);

      expect(response.body.data[0].remaining_amount).toBeCloseTo(125, 2);
    });

    it('should calculate percent_used correctly', async () => {
      const currentMonth = getCurrentMonth();
      const currentDate = new Date().toISOString().slice(0, 10);

      insertBudget(3, currentMonth, 100);

      insertTestTransaction(db, {
        category_id: 3,
        transaction_date: currentDate,
        debit_amount: 45.00
      });

      const response = await request(app)
        .get('/api/budgets')
        .expect(200);

      expect(response.body.data[0].percent_used).toBe(45);
    });

    it('should include rollover_amount in calculations', async () => {
      const currentMonth = getCurrentMonth();
      const currentDate = new Date().toISOString().slice(0, 10);

      // Budget 100 + rollover 50 = 150 total
      insertBudget(3, currentMonth, 100, 50);

      insertTestTransaction(db, {
        category_id: 3,
        transaction_date: currentDate,
        debit_amount: 75.00
      });

      const response = await request(app)
        .get('/api/budgets')
        .expect(200);

      // 75 spent of 150 total = 50%
      expect(response.body.data[0].percent_used).toBe(50);
      expect(response.body.data[0].remaining_amount).toBeCloseTo(75, 2);
    });

    it('should return 400 for invalid month format', async () => {
      const response = await request(app)
        .get('/api/budgets?month=invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid month format');
    });

    it('should exclude transfer transactions from spent calculation', async () => {
      const currentMonth = getCurrentMonth();
      const currentDate = new Date().toISOString().slice(0, 10);

      insertBudget(3, currentMonth, 200);

      // Regular transaction
      insertTestTransaction(db, {
        category_id: 3,
        transaction_date: currentDate,
        debit_amount: 50.00,
        is_transfer: 0
      });

      // Transfer transaction (should be excluded)
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, category_id, is_transfer)
        VALUES (1, ?, 'TRANSFER', 100.00, 3, 1)
      `).run(currentDate);

      const response = await request(app)
        .get('/api/budgets')
        .expect(200);

      expect(response.body.data[0].spent_amount).toBeCloseTo(50, 2);
    });
  });

  // ==========================================================================
  // GET /api/budgets/summary - Budget summary
  // ==========================================================================
  describe('GET /api/budgets/summary', () => {
    it('should return summary with zero values when no budgets', async () => {
      const response = await request(app)
        .get('/api/budgets/summary')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        budgetCount: 0,
        totalBudgeted: 0,
        totalSpent: 0,
        totalRemaining: 0,
        overallPercent: 0
      });
    });

    it('should return correct totals', async () => {
      const currentMonth = getCurrentMonth();
      const currentDate = new Date().toISOString().slice(0, 10);

      insertBudget(3, currentMonth, 200); // Groceries
      insertBudget(4, currentMonth, 100); // Shopping

      insertTestTransaction(db, {
        category_id: 3,
        transaction_date: currentDate,
        debit_amount: 80.00
      });

      insertTestTransaction(db, {
        category_id: 4,
        transaction_date: currentDate,
        debit_amount: 50.00
      });

      const response = await request(app)
        .get('/api/budgets/summary')
        .expect(200);

      expect(response.body.data.budgetCount).toBe(2);
      expect(response.body.data.totalBudgeted).toBeCloseTo(300, 2);
      expect(response.body.data.totalSpent).toBeCloseTo(130, 2);
      expect(response.body.data.totalRemaining).toBeCloseTo(170, 2);
      // 130/300 = 43.33%
      expect(response.body.data.overallPercent).toBe(43);
    });

    it('should include status counts', async () => {
      const currentMonth = getCurrentMonth();
      const currentDate = new Date().toISOString().slice(0, 10);

      insertBudget(3, currentMonth, 100); // Will be on track (50%)
      insertBudget(4, currentMonth, 100); // Will be warning (85%)
      insertBudget(5, currentMonth, 100); // Will be over (120%)

      insertTestTransaction(db, {
        category_id: 3,
        transaction_date: currentDate,
        debit_amount: 50.00
      });

      insertTestTransaction(db, {
        category_id: 4,
        transaction_date: currentDate,
        debit_amount: 85.00
      });

      insertTestTransaction(db, {
        category_id: 5,
        transaction_date: currentDate,
        debit_amount: 120.00
      });

      const response = await request(app)
        .get('/api/budgets/summary')
        .expect(200);

      expect(response.body.data.status.onTrack).toBe(1);
      expect(response.body.data.status.warning).toBe(1);
      expect(response.body.data.status.overBudget).toBe(1);
    });
  });

  // ==========================================================================
  // GET /api/budgets/unbudgeted - Categories without budgets
  // ==========================================================================
  describe('GET /api/budgets/unbudgeted', () => {
    it('should return expense categories without budgets', async () => {
      const currentMonth = getCurrentMonth();

      // Add budget for Groceries only
      insertBudget(3, currentMonth, 200);

      const response = await request(app)
        .get('/api/budgets/unbudgeted')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should have other expense categories but not Groceries
      const names = response.body.data.map(c => c.name);
      expect(names).not.toContain('Groceries');
      expect(names).toContain('Shopping');
      expect(names).toContain('Bills');
    });

    it('should not include income or neutral categories', async () => {
      const response = await request(app)
        .get('/api/budgets/unbudgeted')
        .expect(200);

      const types = response.body.data.map(c => c.type);
      expect(types).not.toContain('income');
      expect(types).not.toContain('neutral');
      expect(types.every(t => t === 'expense')).toBe(true);
    });

    it('should include spent_this_month for each category', async () => {
      const currentMonth = getCurrentMonth();
      const currentDate = new Date().toISOString().slice(0, 10);

      insertTestTransaction(db, {
        category_id: 4, // Shopping (no budget)
        transaction_date: currentDate,
        debit_amount: 75.00
      });

      const response = await request(app)
        .get('/api/budgets/unbudgeted')
        .expect(200);

      const shopping = response.body.data.find(c => c.name === 'Shopping');
      expect(shopping).toBeDefined();
      expect(shopping.spent_this_month).toBeCloseTo(75, 2);
    });
  });

  // ==========================================================================
  // GET /api/budgets/:id - Get single budget
  // ==========================================================================
  describe('GET /api/budgets/:id', () => {
    it('should return budget by id with calculations', async () => {
      const currentMonth = getCurrentMonth();
      const currentDate = new Date().toISOString().slice(0, 10);

      const result = insertBudget(3, currentMonth, 200);

      insertTestTransaction(db, {
        category_id: 3,
        transaction_date: currentDate,
        debit_amount: 60.00
      });

      const response = await request(app)
        .get(`/api/budgets/${result.lastInsertRowid}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: Number(result.lastInsertRowid),
        category_name: 'Groceries',
        budgeted_amount: 200,
        spent_amount: 60
      });
      expect(response.body.data.remaining_amount).toBeCloseTo(140, 2);
      expect(response.body.data.percent_used).toBe(30);
    });

    it('should return 404 for non-existent budget', async () => {
      const response = await request(app)
        .get('/api/budgets/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Budget not found');
    });

    it('should return 400 for invalid id format', async () => {
      const response = await request(app)
        .get('/api/budgets/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });
  });

  // ==========================================================================
  // POST /api/budgets - Create/Update budget
  // ==========================================================================
  describe('POST /api/budgets', () => {
    it('should create a new budget', async () => {
      const currentMonth = getCurrentMonth();

      const response = await request(app)
        .post('/api/budgets')
        .send({
          categoryId: 3,
          month: currentMonth,
          budgetedAmount: 250
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        category_id: 3,
        category_name: 'Groceries',
        month: currentMonth,
        budgeted_amount: 250
      });
      expect(response.body.data.id).toBeDefined();
    });

    it('should update existing budget (upsert)', async () => {
      const currentMonth = getCurrentMonth();

      // Create initial budget
      insertBudget(3, currentMonth, 200);

      // Update via POST (upsert)
      const response = await request(app)
        .post('/api/budgets')
        .send({
          categoryId: 3,
          month: currentMonth,
          budgetedAmount: 300
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.budgeted_amount).toBe(300);

      // Verify only one budget exists
      const budgets = db.prepare(
        'SELECT * FROM budgets WHERE category_id = ? AND month = ?'
      ).all(3, currentMonth);
      expect(budgets).toHaveLength(1);
    });

    it('should create budget with optional notes', async () => {
      const currentMonth = getCurrentMonth();

      const response = await request(app)
        .post('/api/budgets')
        .send({
          categoryId: 3,
          month: currentMonth,
          budgetedAmount: 200,
          notes: 'Weekly grocery shopping'
        })
        .expect(201);

      expect(response.body.data.notes).toBe('Weekly grocery shopping');
    });

    it('should create budget with rollover amount', async () => {
      const currentMonth = getCurrentMonth();

      const response = await request(app)
        .post('/api/budgets')
        .send({
          categoryId: 3,
          month: currentMonth,
          budgetedAmount: 200,
          rolloverAmount: 50
        })
        .expect(201);

      expect(response.body.data.rollover_amount).toBe(50);
    });

    it('should return 400 when categoryId is missing', async () => {
      const response = await request(app)
        .post('/api/budgets')
        .send({
          month: '2025-01',
          budgetedAmount: 200
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Category ID');
    });

    it('should return 400 when month is missing', async () => {
      const response = await request(app)
        .post('/api/budgets')
        .send({
          categoryId: 3,
          budgetedAmount: 200
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Month');
    });

    it('should return 400 when budgetedAmount is missing', async () => {
      const response = await request(app)
        .post('/api/budgets')
        .send({
          categoryId: 3,
          month: '2025-01'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('amount');
    });

    it('should return 400 for invalid month format', async () => {
      const response = await request(app)
        .post('/api/budgets')
        .send({
          categoryId: 3,
          month: 'invalid',
          budgetedAmount: 200
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid month format');
    });

    it('should return 400 for negative budget amount', async () => {
      const response = await request(app)
        .post('/api/budgets')
        .send({
          categoryId: 3,
          month: '2025-01',
          budgetedAmount: -100
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('positive');
    });

    it('should return 400 for non-existent category', async () => {
      const response = await request(app)
        .post('/api/budgets')
        .send({
          categoryId: 9999,
          month: '2025-01',
          budgetedAmount: 200
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Category not found');
    });
  });

  // ==========================================================================
  // DELETE /api/budgets/:id - Delete budget
  // ==========================================================================
  describe('DELETE /api/budgets/:id', () => {
    it('should delete an existing budget', async () => {
      const currentMonth = getCurrentMonth();
      const result = insertBudget(3, currentMonth, 200);
      const budgetId = result.lastInsertRowid;

      const response = await request(app)
        .delete(`/api/budgets/${budgetId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        deleted: true,
        id: Number(budgetId),
        categoryName: 'Groceries',
        month: currentMonth
      });

      // Verify deletion
      const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(budgetId);
      expect(budget).toBeUndefined();
    });

    it('should return 404 for non-existent budget', async () => {
      const response = await request(app)
        .delete('/api/budgets/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Budget not found');
    });

    it('should return 400 for invalid id format', async () => {
      const response = await request(app)
        .delete('/api/budgets/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });
  });
});
