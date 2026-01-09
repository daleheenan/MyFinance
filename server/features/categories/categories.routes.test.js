/**
 * Categories Routes Tests (TASK-3.3)
 *
 * TDD tests for Categories API endpoints.
 * Tests CRUD operations for categories and category rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../index.js';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';

describe('Categories Routes', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // GET /api/categories - List all categories
  // ==========================================================================
  describe('GET /api/categories', () => {
    it('should return all categories', async () => {
      const response = await request(app)
        .get('/api/categories')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(11);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('name');
      expect(response.body.data[0]).toHaveProperty('type');
      expect(response.body.data[0]).toHaveProperty('colour');
    });

    it('should return categories in sort_order', async () => {
      const response = await request(app)
        .get('/api/categories')
        .expect(200);

      const names = response.body.data.map(c => c.name);
      expect(names[0]).toBe('Salary');
      expect(names[1]).toBe('Bills');
      expect(names[10]).toBe('Other');
    });

    it('should include spending totals when include_totals=true', async () => {
      // Insert a transaction in current month
      const currentMonth = new Date().toISOString().slice(0, 7);
      const currentDate = new Date().toISOString().slice(0, 10);

      insertTestTransaction(db, {
        category_id: 3, // Groceries
        transaction_date: currentDate,
        debit_amount: 50.00
      });

      insertTestTransaction(db, {
        category_id: 3, // Groceries
        transaction_date: currentDate,
        debit_amount: 30.00
      });

      const response = await request(app)
        .get('/api/categories?include_totals=true')
        .expect(200);

      expect(response.body.success).toBe(true);
      const groceries = response.body.data.find(c => c.name === 'Groceries');
      expect(groceries).toHaveProperty('spending_total');
      expect(groceries.spending_total).toBeCloseTo(80.00, 2);
    });

    it('should not include totals when include_totals is not set', async () => {
      const response = await request(app)
        .get('/api/categories')
        .expect(200);

      expect(response.body.data[0]).not.toHaveProperty('spending_total');
    });
  });

  // ==========================================================================
  // GET /api/categories/:id - Get single category
  // ==========================================================================
  describe('GET /api/categories/:id', () => {
    it('should return single category by id', async () => {
      const response = await request(app)
        .get('/api/categories/3')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: 3,
        name: 'Groceries',
        type: 'expense',
        colour: '#007aff'
      });
    });

    it('should return 404 for non-existent category', async () => {
      const response = await request(app)
        .get('/api/categories/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Category not found');
    });

    it('should return 400 for invalid id format', async () => {
      const response = await request(app)
        .get('/api/categories/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });
  });

  // ==========================================================================
  // POST /api/categories - Create new category
  // ==========================================================================
  describe('POST /api/categories', () => {
    it('should create a new category with required fields', async () => {
      const newCategory = {
        name: 'Savings',
        type: 'expense',
        colour: '#00ff00'
      };

      const response = await request(app)
        .post('/api/categories')
        .send(newCategory)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: 'Savings',
        type: 'expense',
        colour: '#00ff00',
        is_default: 0
      });
      expect(response.body.data.id).toBeDefined();
    });

    it('should create category with optional fields', async () => {
      const newCategory = {
        name: 'Investments',
        type: 'income',
        colour: '#ffaa00',
        icon: '$',
        parent_group: 'Finance'
      };

      const response = await request(app)
        .post('/api/categories')
        .send(newCategory)
        .expect(201);

      expect(response.body.data).toMatchObject({
        name: 'Investments',
        type: 'income',
        colour: '#ffaa00',
        icon: '$',
        parent_group: 'Finance'
      });
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({ type: 'expense', colour: '#ff0000' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('name');
    });

    it('should return 400 when type is missing', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Test', colour: '#ff0000' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('type');
    });

    it('should return 400 when colour is missing', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Test', type: 'expense' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('colour');
    });

    it('should return 400 when type is invalid', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Test', type: 'invalid', colour: '#ff0000' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('type');
    });

    it('should return 400 for duplicate category name', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Groceries', type: 'expense', colour: '#ff0000' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });
  });

  // ==========================================================================
  // PUT /api/categories/:id - Update category
  // ==========================================================================
  describe('PUT /api/categories/:id', () => {
    it('should update a user-created category', async () => {
      // First create a non-default category
      const createRes = await request(app)
        .post('/api/categories')
        .send({ name: 'TestCat', type: 'expense', colour: '#123456' });

      const categoryId = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/categories/${categoryId}`)
        .send({ name: 'UpdatedCat', colour: '#654321' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('UpdatedCat');
      expect(response.body.data.colour).toBe('#654321');
    });

    it('should not update default categories', async () => {
      const response = await request(app)
        .put('/api/categories/1')  // Salary is default
        .send({ name: 'NewName' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('default');
    });

    it('should return 404 for non-existent category', async () => {
      const response = await request(app)
        .put('/api/categories/999')
        .send({ name: 'Test' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Category not found');
    });

    it('should validate type when updating', async () => {
      // Create non-default category
      const createRes = await request(app)
        .post('/api/categories')
        .send({ name: 'TestCat2', type: 'expense', colour: '#123456' });

      const categoryId = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/categories/${categoryId}`)
        .send({ type: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('type');
    });
  });

  // ==========================================================================
  // DELETE /api/categories/:id - Delete category
  // ==========================================================================
  describe('DELETE /api/categories/:id', () => {
    it('should delete a user-created category with no transactions', async () => {
      // Create a non-default category
      const createRes = await request(app)
        .post('/api/categories')
        .send({ name: 'ToDelete', type: 'expense', colour: '#000000' });

      const categoryId = createRes.body.data.id;

      const response = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);

      // Verify it's deleted
      await request(app)
        .get(`/api/categories/${categoryId}`)
        .expect(404);
    });

    it('should not delete default categories', async () => {
      const response = await request(app)
        .delete('/api/categories/1')  // Salary is default
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('default');
    });

    it('should not delete category with transactions', async () => {
      // Create a non-default category
      const createRes = await request(app)
        .post('/api/categories')
        .send({ name: 'HasTransactions', type: 'expense', colour: '#000000' });

      const categoryId = createRes.body.data.id;

      // Add a transaction using this category
      insertTestTransaction(db, {
        category_id: categoryId,
        description: 'Test transaction',
        debit_amount: 10.00
      });

      const response = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('transactions');
    });

    it('should return 404 for non-existent category', async () => {
      const response = await request(app)
        .delete('/api/categories/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Category not found');
    });
  });

  // ==========================================================================
  // GET /api/category-rules - List all rules
  // ==========================================================================
  describe('GET /api/category-rules', () => {
    it('should return all category rules', async () => {
      const response = await request(app)
        .get('/api/category-rules')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('pattern');
      expect(response.body.data[0]).toHaveProperty('categoryId');
      expect(response.body.data[0]).toHaveProperty('categoryName');
      expect(response.body.data[0]).toHaveProperty('priority');
    });

    it('should return rules ordered by priority descending', async () => {
      const response = await request(app)
        .get('/api/category-rules')
        .expect(200);

      const priorities = response.body.data.map(r => r.priority);
      const sorted = [...priorities].sort((a, b) => b - a);
      expect(priorities).toEqual(sorted);
    });
  });

  // ==========================================================================
  // POST /api/category-rules - Create new rule
  // ==========================================================================
  describe('POST /api/category-rules', () => {
    it('should create a new category rule', async () => {
      const newRule = {
        pattern: 'WAITROSE',
        categoryId: 3  // Groceries
      };

      const response = await request(app)
        .post('/api/category-rules')
        .send(newRule)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        pattern: 'WAITROSE',
        categoryId: 3,
        priority: 0  // Default priority
      });
      expect(response.body.data.id).toBeDefined();
    });

    it('should create rule with custom priority', async () => {
      const newRule = {
        pattern: 'MARKS SPENCER',
        categoryId: 3,
        priority: 20
      };

      const response = await request(app)
        .post('/api/category-rules')
        .send(newRule)
        .expect(201);

      expect(response.body.data.priority).toBe(20);
    });

    it('should return 400 when pattern is missing', async () => {
      const response = await request(app)
        .post('/api/category-rules')
        .send({ categoryId: 3 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('pattern');
    });

    it('should return 400 when categoryId is missing', async () => {
      const response = await request(app)
        .post('/api/category-rules')
        .send({ pattern: 'TEST' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('categoryId');
    });

    it('should return 400 for non-existent category', async () => {
      const response = await request(app)
        .post('/api/category-rules')
        .send({ pattern: 'TEST', categoryId: 999 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Category not found');
    });
  });

  // ==========================================================================
  // PUT /api/category-rules/:id - Update rule
  // ==========================================================================
  describe('PUT /api/category-rules/:id', () => {
    it('should update an existing rule', async () => {
      // First create a rule
      const createRes = await request(app)
        .post('/api/category-rules')
        .send({ pattern: 'ORIGINAL', categoryId: 3 });

      const ruleId = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/category-rules/${ruleId}`)
        .send({ pattern: 'UPDATED', priority: 15 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pattern).toBe('UPDATED');
      expect(response.body.data.priority).toBe(15);
    });

    it('should update rule categoryId', async () => {
      const createRes = await request(app)
        .post('/api/category-rules')
        .send({ pattern: 'CHANGEME', categoryId: 3 });

      const ruleId = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/category-rules/${ruleId}`)
        .send({ categoryId: 4 })  // Change to Shopping
        .expect(200);

      expect(response.body.data.categoryId).toBe(4);
    });

    it('should return 404 for non-existent rule', async () => {
      const response = await request(app)
        .put('/api/category-rules/99999')
        .send({ pattern: 'TEST' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Rule not found');
    });

    it('should return 400 for non-existent categoryId', async () => {
      const createRes = await request(app)
        .post('/api/category-rules')
        .send({ pattern: 'TEST', categoryId: 3 });

      const ruleId = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/category-rules/${ruleId}`)
        .send({ categoryId: 999 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Category not found');
    });
  });

  // ==========================================================================
  // DELETE /api/category-rules/:id - Delete rule
  // ==========================================================================
  describe('DELETE /api/category-rules/:id', () => {
    it('should delete an existing rule', async () => {
      // First create a rule
      const createRes = await request(app)
        .post('/api/category-rules')
        .send({ pattern: 'TODELETE', categoryId: 3 });

      const ruleId = createRes.body.data.id;

      const response = await request(app)
        .delete(`/api/category-rules/${ruleId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
      expect(response.body.data.pattern).toBe('TODELETE');
    });

    it('should return 404 for non-existent rule', async () => {
      const response = await request(app)
        .delete('/api/category-rules/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Rule not found');
    });
  });
});
