/**
 * Analytics Routes Tests
 *
 * TDD tests for analytics API endpoints:
 * - GET /api/analytics/spending-by-category
 * - GET /api/analytics/income-vs-expenses
 * - GET /api/analytics/trends
 * - GET /api/analytics/summary
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../index.js';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';

describe('Analytics Routes', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // Helper to insert test data
  // ==========================================================================
  function seedTestTransactions() {
    // Get current month for realistic test data
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    // Income transaction - this month
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: `${currentMonth}-01`,
      description: 'SALARY',
      credit_amount: 3000,
      debit_amount: 0,
      category_id: 1  // Salary (income)
    });

    // Grocery spending - this month
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: `${currentMonth}-05`,
      description: 'TESCO GROCERIES',
      debit_amount: 85.50,
      credit_amount: 0,
      category_id: 3  // Groceries
    });

    // Entertainment spending - this month
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: `${currentMonth}-10`,
      description: 'NETFLIX',
      debit_amount: 15.99,
      credit_amount: 0,
      category_id: 5  // Entertainment
    });

    // Dining spending - this month
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: `${currentMonth}-12`,
      description: 'COSTA COFFEE',
      debit_amount: 4.50,
      credit_amount: 0,
      category_id: 7  // Dining
    });

    // Transfer - should be excluded from analytics
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: `${currentMonth}-03`,
      description: 'TRANSFER TO SAVINGS',
      debit_amount: 500,
      credit_amount: 0,
      category_id: 10,  // Transfer
      is_transfer: 1
    });

    // Last month transactions
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: `${lastMonthStr}-01`,
      description: 'SALARY',
      credit_amount: 3000,
      debit_amount: 0,
      category_id: 1
    });

    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: `${lastMonthStr}-15`,
      description: 'AMAZON PURCHASE',
      debit_amount: 150.00,
      credit_amount: 0,
      category_id: 4  // Shopping
    });

    // Different account transaction
    insertTestTransaction(db, {
      account_id: 2,
      transaction_date: `${currentMonth}-08`,
      description: 'UBER RIDE',
      debit_amount: 25.00,
      credit_amount: 0,
      category_id: 6  // Transport
    });
  }

  // ==========================================================================
  // GET /api/analytics/spending-by-category
  // ==========================================================================
  describe('GET /api/analytics/spending-by-category', () => {
    it('should return spending grouped by category for this month', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/spending-by-category')
        .query({ range: 'this_month' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('range');
      expect(response.body.data).toHaveProperty('categories');
      expect(Array.isArray(response.body.data.categories)).toBe(true);

      // Should have spending categories (not income, not transfers)
      const categories = response.body.data.categories;
      expect(categories.length).toBeGreaterThan(0);

      // Each category should have required fields
      categories.forEach(cat => {
        expect(cat).toHaveProperty('category_id');
        expect(cat).toHaveProperty('category_name');
        expect(cat).toHaveProperty('colour');
        expect(cat).toHaveProperty('total');
        expect(cat).toHaveProperty('percentage');
        expect(cat).toHaveProperty('transaction_count');
        expect(cat.total).toBeGreaterThan(0);
      });

      // Percentages should sum to ~100
      const totalPercentage = categories.reduce((sum, c) => sum + c.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 0);
    });

    it('should filter by account_id when provided', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/spending-by-category')
        .query({ range: 'this_month', account_id: '2' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Should only have Transport category (from account 2)
      const categories = response.body.data.categories;
      expect(categories.length).toBe(1);
      expect(categories[0].category_name).toBe('Transport');
    });

    it('should support custom date range', async () => {
      seedTestTransactions();

      const today = new Date();
      const startDate = `${today.getFullYear()}-01-01`;
      const endDate = `${today.getFullYear()}-12-31`;

      const response = await request(app)
        .get('/api/analytics/spending-by-category')
        .query({ range: 'custom', start_date: startDate, end_date: endDate })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.range.start_date).toBe(startDate);
      expect(response.body.data.range.end_date).toBe(endDate);
    });

    it('should return 400 for invalid range', async () => {
      const response = await request(app)
        .get('/api/analytics/spending-by-category')
        .query({ range: 'invalid_range' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid range');
    });

    it('should return 400 for custom range without dates', async () => {
      const response = await request(app)
        .get('/api/analytics/spending-by-category')
        .query({ range: 'custom' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('requires startDate and endDate');
    });

    it('should return 404 for non-existent account', async () => {
      const response = await request(app)
        .get('/api/analytics/spending-by-category')
        .query({ range: 'this_month', account_id: '999' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Account not found');
    });

    it('should exclude transfers from spending calculations', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/spending-by-category')
        .query({ range: 'this_month' })
        .expect(200);

      // Transfer category should not appear in results
      const categories = response.body.data.categories;
      const transferCategory = categories.find(c => c.category_name === 'Transfer');
      expect(transferCategory).toBeUndefined();
    });
  });

  // ==========================================================================
  // GET /api/analytics/income-vs-expenses
  // ==========================================================================
  describe('GET /api/analytics/income-vs-expenses', () => {
    it('should return monthly income vs expenses for last 12 months', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/income-vs-expenses')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('months');
      expect(response.body.data).toHaveProperty('totals');
      expect(response.body.data.months).toHaveLength(12);

      // Each month should have required fields
      response.body.data.months.forEach(m => {
        expect(m).toHaveProperty('month');
        expect(m).toHaveProperty('income');
        expect(m).toHaveProperty('expenses');
        expect(m).toHaveProperty('net');
        expect(m.month).toMatch(/^\d{4}-\d{2}$/);
      });

      // Totals should be calculated correctly
      expect(response.body.data.totals).toHaveProperty('income');
      expect(response.body.data.totals).toHaveProperty('expenses');
      expect(response.body.data.totals).toHaveProperty('net');
    });

    it('should accept custom months parameter', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/income-vs-expenses')
        .query({ months: '6' })
        .expect(200);

      expect(response.body.data.months).toHaveLength(6);
    });

    it('should return 400 for invalid months parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/income-vs-expenses')
        .query({ months: '0' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid months');
    });

    it('should return 400 for months > 24', async () => {
      const response = await request(app)
        .get('/api/analytics/income-vs-expenses')
        .query({ months: '25' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should filter by account_id when provided', async () => {
      seedTestTransactions();

      // Account 2 has no income, only expenses
      const response = await request(app)
        .get('/api/analytics/income-vs-expenses')
        .query({ months: '3', account_id: '2' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totals.income).toBe(0);
      expect(response.body.data.totals.expenses).toBe(25); // Only Uber ride
    });

    it('should exclude transfers from income and expense totals', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/income-vs-expenses')
        .expect(200);

      // The transfer (500) should not be included in expenses
      // Only: Groceries (85.50) + Entertainment (15.99) + Dining (4.50) + Transport (25.00) + Shopping (150.00) + account 2 transport
      // This month account 1: 85.50 + 15.99 + 4.50 = 105.99
      // This month account 2: 25.00

      const currentMonthData = response.body.data.months.find(m => {
        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        return m.month === currentMonth;
      });

      // Total expenses this month should NOT include the 500 transfer
      expect(currentMonthData.expenses).toBeCloseTo(130.99, 2);
    });
  });

  // ==========================================================================
  // GET /api/analytics/trends
  // ==========================================================================
  describe('GET /api/analytics/trends', () => {
    it('should return daily spending trends for this month', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/trends')
        .query({ range: 'this_month', group_by: 'day' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('range');
      expect(response.body.data).toHaveProperty('group_by', 'day');
      expect(response.body.data).toHaveProperty('trends');
      expect(Array.isArray(response.body.data.trends)).toBe(true);

      // Each trend should have required fields
      response.body.data.trends.forEach(t => {
        expect(t).toHaveProperty('period');
        expect(t).toHaveProperty('spending');
        expect(t).toHaveProperty('income');
        expect(t).toHaveProperty('transaction_count');
        expect(t.period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('should return weekly spending trends', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/trends')
        .query({ range: 'last_3_months', group_by: 'week' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.group_by).toBe('week');

      // Weekly periods should have format YYYY-WNN
      response.body.data.trends.forEach(t => {
        expect(t.period).toMatch(/^\d{4}-W\d{2}$/);
      });
    });

    it('should return 400 for invalid group_by', async () => {
      const response = await request(app)
        .get('/api/analytics/trends')
        .query({ range: 'this_month', group_by: 'month' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid group_by');
    });

    it('should support custom date range', async () => {
      seedTestTransactions();

      const today = new Date();
      const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;

      const response = await request(app)
        .get('/api/analytics/trends')
        .query({ range: 'custom', start_date: startDate, end_date: endDate, group_by: 'day' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.range.start_date).toBe(startDate);
      expect(response.body.data.range.end_date).toBe(endDate);
    });

    it('should filter by account_id when provided', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/trends')
        .query({ range: 'this_month', group_by: 'day', account_id: '2' })
        .expect(200);

      // Should only have one day with the Uber transaction
      const trends = response.body.data.trends;
      expect(trends.length).toBe(1);
      expect(trends[0].spending).toBe(25);
    });

    it('should exclude transfers from trends', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/trends')
        .query({ range: 'this_month', group_by: 'day' })
        .expect(200);

      // Calculate total spending from trends
      const totalSpending = response.body.data.trends.reduce((sum, t) => sum + t.spending, 0);

      // Should not include the 500 transfer
      // Account 1 this month: 85.50 + 15.99 + 4.50 = 105.99
      // Account 2 this month: 25.00
      // Total: 130.99
      expect(totalSpending).toBeCloseTo(130.99, 2);
    });
  });

  // ==========================================================================
  // GET /api/analytics/summary
  // ==========================================================================
  describe('GET /api/analytics/summary', () => {
    it('should return summary statistics for this month', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/summary')
        .query({ range: 'this_month' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('range');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('top_categories');

      // Summary should have expected fields
      const summary = response.body.data.summary;
      expect(summary).toHaveProperty('totalIncome');
      expect(summary).toHaveProperty('totalExpenses');
      expect(summary).toHaveProperty('net');
      expect(summary).toHaveProperty('transactionCount');
      expect(summary).toHaveProperty('avgDailySpending');

      // Top categories should be an array
      expect(Array.isArray(response.body.data.top_categories)).toBe(true);
    });

    it('should return top 5 spending categories', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/summary')
        .query({ range: 'this_month' })
        .expect(200);

      const topCategories = response.body.data.top_categories;
      expect(topCategories.length).toBeLessThanOrEqual(5);

      // Should be sorted by total descending
      for (let i = 1; i < topCategories.length; i++) {
        expect(topCategories[i - 1].total).toBeGreaterThanOrEqual(topCategories[i].total);
      }
    });

    it('should filter by account_id when provided', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/summary')
        .query({ range: 'this_month', account_id: '2' })
        .expect(200);

      const summary = response.body.data.summary;
      expect(summary.totalIncome).toBe(0);
      expect(summary.totalExpenses).toBe(25); // Only Uber ride
    });

    it('should calculate net correctly', async () => {
      seedTestTransactions();

      const response = await request(app)
        .get('/api/analytics/summary')
        .query({ range: 'this_month' })
        .expect(200);

      const summary = response.body.data.summary;
      const expectedNet = summary.totalIncome - summary.totalExpenses;
      expect(summary.net).toBeCloseTo(expectedNet, 2);
    });

    it('should return empty top_categories when no spending', async () => {
      // No seed data = no spending

      const response = await request(app)
        .get('/api/analytics/summary')
        .query({ range: 'this_month' })
        .expect(200);

      expect(response.body.data.top_categories).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Date Range Tests
  // ==========================================================================
  describe('Date Range Calculations', () => {
    it('should handle last_3_months range', async () => {
      const response = await request(app)
        .get('/api/analytics/spending-by-category')
        .query({ range: 'last_3_months' })
        .expect(200);

      const range = response.body.data.range;
      const start = new Date(range.start_date);
      const end = new Date(range.end_date);

      // Should span approximately 3 months
      const monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      expect(monthDiff).toBe(2); // 3 months = difference of 2
    });

    it('should handle last_year range', async () => {
      const response = await request(app)
        .get('/api/analytics/spending-by-category')
        .query({ range: 'last_year' })
        .expect(200);

      const range = response.body.data.range;
      const start = new Date(range.start_date);
      const end = new Date(range.end_date);

      // Should span approximately 1 year
      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(364);
      expect(daysDiff).toBeLessThanOrEqual(366);
    });
  });

  // ==========================================================================
  // Year-over-Year Comparison Tests
  // ==========================================================================
  describe('GET /api/analytics/yoy', () => {
    function seedYoYTestData() {
      // 2025 Transactions (last year)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        description: 'SALARY JAN 2025',
        credit_amount: 3000,
        debit_amount: 0,
        category_id: 1
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-20',
        description: 'TESCO GROCERIES',
        debit_amount: 150,
        credit_amount: 0,
        category_id: 3
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-10',
        description: 'SAINSBURY',
        debit_amount: 120,
        credit_amount: 0,
        category_id: 3
      });

      // 2026 Transactions (this year)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-01-15',
        description: 'SALARY JAN 2026',
        credit_amount: 3200,
        debit_amount: 0,
        category_id: 1
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-01-18',
        description: 'TESCO GROCERIES',
        debit_amount: 180,
        credit_amount: 0,
        category_id: 3
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-02-12',
        description: 'TESCO',
        debit_amount: 140,
        credit_amount: 0,
        category_id: 3
      });

      // New category in 2026 only (Dining)
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-03-20',
        description: 'COSTA COFFEE',
        debit_amount: 25,
        credit_amount: 0,
        category_id: 7
      });

      // Transfer - should be excluded
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-01-05',
        description: 'TRANSFER TO SAVINGS',
        debit_amount: 500,
        credit_amount: 0,
        category_id: 10,
        is_transfer: 1
      });
    }

    it('should return year-over-year comparison data', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy')
        .query({ year: '2026' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('thisYear', 2026);
      expect(response.body.data).toHaveProperty('lastYear', 2025);
      expect(response.body.data).toHaveProperty('categories');
      expect(response.body.data).toHaveProperty('totals');
      expect(Array.isArray(response.body.data.categories)).toBe(true);
    });

    it('should return category comparison with change calculations', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy')
        .query({ year: '2026' })
        .expect(200);

      const categories = response.body.data.categories;
      const groceries = categories.find(c => c.category.name === 'Groceries');

      expect(groceries).toBeDefined();
      expect(groceries.thisYear).toHaveProperty('total');
      expect(groceries.thisYear).toHaveProperty('count');
      expect(groceries.lastYear).toHaveProperty('total');
      expect(groceries.lastYear).toHaveProperty('count');
      expect(groceries.change).toHaveProperty('amount');
      expect(groceries.change).toHaveProperty('percentage');
    });

    it('should use current year as default', async () => {
      const response = await request(app)
        .get('/api/analytics/yoy')
        .expect(200);

      const currentYear = new Date().getFullYear();
      expect(response.body.data.thisYear).toBe(currentYear);
      expect(response.body.data.lastYear).toBe(currentYear - 1);
    });

    it('should filter by category_id when provided', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy')
        .query({ year: '2026', category_id: '3' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.categories).toHaveLength(1);
      expect(response.body.data.categories[0].category.name).toBe('Groceries');
    });

    it('should return 400 for invalid year', async () => {
      const response = await request(app)
        .get('/api/analytics/yoy')
        .query({ year: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid year');
    });

    it('should return 400 for invalid category_id', async () => {
      const response = await request(app)
        .get('/api/analytics/yoy')
        .query({ year: '2026', category_id: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid category_id');
    });

    it('should exclude transfers from totals', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy')
        .query({ year: '2026' })
        .expect(200);

      // 2026 expenses (non-transfer): 180 + 140 + 25 = 345
      expect(response.body.data.totals.thisYear.expenses).toBe(345);

      // 2025 expenses: 150 + 120 = 270
      expect(response.body.data.totals.lastYear.expenses).toBe(270);
    });

    it('should calculate income totals correctly', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy')
        .query({ year: '2026' })
        .expect(200);

      expect(response.body.data.totals.thisYear.income).toBe(3200);
      expect(response.body.data.totals.lastYear.income).toBe(3000);
    });

    it('should handle null percentage for new categories', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy')
        .query({ year: '2026' })
        .expect(200);

      // Dining only exists in 2026
      const dining = response.body.data.categories.find(c => c.category.name === 'Dining');
      expect(dining).toBeDefined();
      expect(dining.lastYear.total).toBe(0);
      expect(dining.change.percentage).toBeNull();
    });
  });

  // ==========================================================================
  // Monthly Year-over-Year Comparison Tests
  // ==========================================================================
  describe('GET /api/analytics/yoy/monthly', () => {
    function seedYoYTestData() {
      // 2025 Transactions
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-15',
        description: 'SALARY JAN 2025',
        credit_amount: 3000,
        debit_amount: 0,
        category_id: 1
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-20',
        description: 'TESCO GROCERIES',
        debit_amount: 150,
        credit_amount: 0,
        category_id: 3
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-10',
        description: 'SAINSBURY',
        debit_amount: 120,
        credit_amount: 0,
        category_id: 3
      });

      // 2026 Transactions
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-01-15',
        description: 'SALARY JAN 2026',
        credit_amount: 3200,
        debit_amount: 0,
        category_id: 1
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-01-18',
        description: 'TESCO GROCERIES',
        debit_amount: 180,
        credit_amount: 0,
        category_id: 3
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-01-25',
        description: 'ALDI',
        debit_amount: 50,
        credit_amount: 0,
        category_id: 3
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-02-12',
        description: 'TESCO',
        debit_amount: 140,
        credit_amount: 0,
        category_id: 3
      });

      // Transfer - should be excluded
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-01-05',
        description: 'TRANSFER TO SAVINGS',
        debit_amount: 500,
        credit_amount: 0,
        category_id: 10,
        is_transfer: 1
      });
    }

    it('should return monthly year-over-year comparison data', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '01', year: '2026' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('thisYear', 2026);
      expect(response.body.data).toHaveProperty('lastYear', 2025);
      expect(response.body.data).toHaveProperty('month', '01');
      expect(response.body.data).toHaveProperty('categories');
      expect(response.body.data).toHaveProperty('totals');
    });

    it('should only include transactions from the specified month', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '01', year: '2026' })
        .expect(200);

      const groceries = response.body.data.categories.find(c => c.category.name === 'Groceries');

      // January 2026: 180 + 50 = 230
      expect(groceries.thisYear.total).toBe(230);
      expect(groceries.thisYear.count).toBe(2);

      // January 2025: 150
      expect(groceries.lastYear.total).toBe(150);
      expect(groceries.lastYear.count).toBe(1);
    });

    it('should calculate correct change percentage', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '01', year: '2026' })
        .expect(200);

      const groceries = response.body.data.categories.find(c => c.category.name === 'Groceries');

      // Change: 230 - 150 = 80
      expect(groceries.change.amount).toBe(80);

      // Percentage: (80 / 150) * 100 = 53.33%
      expect(groceries.change.percentage).toBeCloseTo(53.33, 1);
    });

    it('should return 400 when month is missing', async () => {
      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ year: '2026' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('month');
    });

    it('should return 400 for invalid month format', async () => {
      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '13', year: '2026' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid month');
    });

    it('should return 400 for month without leading zero', async () => {
      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '1', year: '2026' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid month');
    });

    it('should use current year as default', async () => {
      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '01' })
        .expect(200);

      const currentYear = new Date().getFullYear();
      expect(response.body.data.thisYear).toBe(currentYear);
      expect(response.body.data.lastYear).toBe(currentYear - 1);
    });

    it('should filter by category_id when provided', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '01', year: '2026', category_id: '3' })
        .expect(200);

      expect(response.body.data.categories).toHaveLength(1);
      expect(response.body.data.categories[0].category.name).toBe('Groceries');
    });

    it('should exclude transfers from monthly totals', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '01', year: '2026' })
        .expect(200);

      // January 2026 expenses (non-transfer): 180 + 50 = 230
      expect(response.body.data.totals.thisYear.expenses).toBe(230);

      // January 2025 expenses: 150
      expect(response.body.data.totals.lastYear.expenses).toBe(150);
    });

    it('should calculate monthly income totals correctly', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '01', year: '2026' })
        .expect(200);

      expect(response.body.data.totals.thisYear.income).toBe(3200);
      expect(response.body.data.totals.lastYear.income).toBe(3000);
    });

    it('should return empty data for month with no transactions', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '12', year: '2026' })
        .expect(200);

      expect(response.body.data.categories).toHaveLength(0);
      expect(response.body.data.totals.thisYear.expenses).toBe(0);
      expect(response.body.data.totals.thisYear.income).toBe(0);
    });

    it('should handle February comparison', async () => {
      seedYoYTestData();

      const response = await request(app)
        .get('/api/analytics/yoy/monthly')
        .query({ month: '02', year: '2026' })
        .expect(200);

      const groceries = response.body.data.categories.find(c => c.category.name === 'Groceries');

      // February 2026: 140
      expect(groceries.thisYear.total).toBe(140);

      // February 2025: 120
      expect(groceries.lastYear.total).toBe(120);

      // Change: 140 - 120 = 20
      expect(groceries.change.amount).toBe(20);
    });
  });
});
