/**
 * Cash Flow Forecasting Tests
 *
 * TDD tests for forecasting feature:
 * - getCashFlowForecast: Project monthly cash flow forward
 * - getMonthlyAverages: Calculate average income/expenses
 * - getScenarios: Return optimistic/expected/conservative projections
 * - getSeasonalPatterns: Analyze spending by month of year
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../index.js';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import {
  getCashFlowForecast,
  getMonthlyAverages,
  getScenarios,
  getSeasonalPatterns,
  pennyPrecision
} from './forecasting.service.js';

describe('Forecasting Service', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    // Set fake date to 2026-01-15 for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15'));
  });

  afterEach(() => {
    closeTestDb(db);
    vi.useRealTimers();
  });

  // Helper to insert test transactions for specific months
  const insertMonthlyTransactions = (monthsAgo, income, expenses) => {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    const dateStr = date.toISOString().slice(0, 10);

    // Income transaction
    if (income > 0) {
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: dateStr,
        description: 'SALARY',
        credit_amount: income,
        debit_amount: 0,
        category_id: 1, // Salary
        is_transfer: 0
      });
    }

    // Expense transaction
    if (expenses > 0) {
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: dateStr,
        description: 'GROCERIES',
        debit_amount: expenses,
        credit_amount: 0,
        category_id: 3, // Groceries
        is_transfer: 0
      });
    }
  };

  // Helper to insert recurring pattern
  const insertRecurringPattern = (data) => {
    return db.prepare(`
      INSERT INTO recurring_patterns (description_pattern, merchant_name, typical_amount, typical_day, frequency, category_id, is_subscription, is_active)
      VALUES (@description_pattern, @merchant_name, @typical_amount, @typical_day, @frequency, @category_id, @is_subscription, @is_active)
    `).run({
      description_pattern: data.description_pattern,
      merchant_name: data.merchant_name || null,
      typical_amount: data.typical_amount,
      typical_day: data.typical_day || 1,
      frequency: data.frequency || 'monthly',
      category_id: data.category_id || 2, // Bills
      is_subscription: data.is_subscription ? 1 : 0,
      is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
    });
  };

  // ==========================================================================
  // pennyPrecision utility
  // ==========================================================================
  describe('pennyPrecision', () => {
    it('should round to 2 decimal places', () => {
      expect(pennyPrecision(10.555)).toBe(10.56);
      expect(pennyPrecision(10.554)).toBe(10.55);
      expect(pennyPrecision(100.999)).toBe(101);
    });

    it('should handle whole numbers', () => {
      expect(pennyPrecision(100)).toBe(100);
      expect(pennyPrecision(0)).toBe(0);
    });

    it('should handle negative numbers', () => {
      expect(pennyPrecision(-10.555)).toBe(-10.55);
    });
  });

  // ==========================================================================
  // getMonthlyAverages
  // ==========================================================================
  describe('getMonthlyAverages', () => {
    it('should return zeros when no transactions exist', () => {
      const result = getMonthlyAverages(db, 6);

      expect(result).toEqual({
        avg_income: 0,
        avg_expenses: 0,
        avg_net: 0,
        months_analyzed: 0
      });
    });

    it('should calculate average income and expenses over past months', () => {
      // Insert transactions for last 3 months
      insertMonthlyTransactions(1, 3000, 2000); // Last month
      insertMonthlyTransactions(2, 3000, 2500); // 2 months ago
      insertMonthlyTransactions(3, 3000, 1500); // 3 months ago

      const result = getMonthlyAverages(db, 6);

      expect(result.avg_income).toBe(3000);
      expect(result.avg_expenses).toBe(2000); // (2000+2500+1500)/3
      expect(result.avg_net).toBe(1000);
      expect(result.months_analyzed).toBe(3);
    });

    it('should respect the months parameter', () => {
      // Insert transactions for 4 months
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);
      insertMonthlyTransactions(3, 3000, 2000);
      insertMonthlyTransactions(4, 6000, 5000); // Older, should be excluded with months=3

      const result = getMonthlyAverages(db, 3);

      expect(result.avg_income).toBe(3000);
      expect(result.avg_expenses).toBe(2000);
      expect(result.months_analyzed).toBe(3);
    });

    it('should exclude transfer transactions', () => {
      insertMonthlyTransactions(1, 3000, 1000);

      // Add a transfer (should be excluded)
      const date = new Date();
      date.setMonth(date.getMonth() - 1);
      const dateStr = date.toISOString().slice(0, 10);

      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, ?, 'TRANSFER OUT', 500, 0, 10, 1)
      `).run(dateStr);

      const result = getMonthlyAverages(db, 6);

      // Transfer should NOT be counted in expenses
      expect(result.avg_expenses).toBe(1000);
    });

    it('should use penny precision for results', () => {
      // Insert amounts that would cause floating point issues
      insertMonthlyTransactions(1, 1000.01, 333.33);
      insertMonthlyTransactions(2, 1000.02, 333.34);
      insertMonthlyTransactions(3, 1000.00, 333.33);

      const result = getMonthlyAverages(db, 6);

      // Results should be properly rounded
      expect(Number.isInteger(result.avg_income * 100)).toBe(true);
      expect(Number.isInteger(result.avg_expenses * 100)).toBe(true);
    });
  });

  // ==========================================================================
  // getCashFlowForecast
  // ==========================================================================
  describe('getCashFlowForecast', () => {
    it('should return empty projection when no data exists', () => {
      const result = getCashFlowForecast(db, { months: 3 });

      expect(result.current_balance).toBe(0);
      expect(result.projections).toHaveLength(3);
      expect(result.projections[0].projected_income).toBe(0);
      expect(result.projections[0].projected_expenses).toBe(0);
    });

    it('should project forward for specified number of months', () => {
      // Set up historical data
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);
      insertMonthlyTransactions(3, 3000, 2000);

      const result = getCashFlowForecast(db, { months: 6 });

      expect(result.projections).toHaveLength(6);
      // First projection should be for February 2026
      expect(result.projections[0].month).toBe('2026-02');
      expect(result.projections[5].month).toBe('2026-07');
    });

    it('should calculate projected income based on historical average', () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3600, 2000);
      insertMonthlyTransactions(3, 3000, 2000);

      const result = getCashFlowForecast(db, { months: 3 });

      // Average income: (3000+3600+3000)/3 = 3200
      expect(result.projections[0].projected_income).toBe(3200);
    });

    it('should calculate projected expenses based on historical average', () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2500);
      insertMonthlyTransactions(3, 3000, 3000);

      const result = getCashFlowForecast(db, { months: 3 });

      // Average expenses: (2000+2500+3000)/3 = 2500
      expect(result.projections[0].projected_expenses).toBe(2500);
    });

    it('should calculate running projected balance', () => {
      // Set account balance
      db.prepare('UPDATE accounts SET current_balance = 5000 WHERE id = 1').run();

      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const result = getCashFlowForecast(db, { months: 3 });

      // Starting: 5000, Net per month: 1000
      expect(result.current_balance).toBe(5000);
      expect(result.projections[0].projected_balance).toBe(6000);
      expect(result.projections[1].projected_balance).toBe(7000);
      expect(result.projections[2].projected_balance).toBe(8000);
    });

    it('should include recurring items in projections', () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      // Add recurring pattern
      insertRecurringPattern({
        description_pattern: 'NETFLIX',
        merchant_name: 'Netflix',
        typical_amount: 15.99,
        frequency: 'monthly',
        category_id: 5, // Entertainment
        is_subscription: true
      });

      const result = getCashFlowForecast(db, { months: 3 });

      // Should have recurring items
      expect(result.projections[0].recurring_items).toBeDefined();
      expect(result.projections[0].recurring_items.length).toBeGreaterThanOrEqual(1);
      expect(result.projections[0].recurring_items[0]).toMatchObject({
        description: 'Netflix',
        amount: 15.99
      });
    });

    it('should not include inactive recurring patterns', () => {
      insertMonthlyTransactions(1, 3000, 2000);

      // Add inactive recurring pattern
      insertRecurringPattern({
        description_pattern: 'OLD SUB',
        merchant_name: 'Old Subscription',
        typical_amount: 10.00,
        frequency: 'monthly',
        is_active: false
      });

      const result = getCashFlowForecast(db, { months: 3 });

      const hasOldSub = result.projections[0].recurring_items.some(
        item => item.description === 'Old Subscription'
      );
      expect(hasOldSub).toBe(false);
    });

    it('should calculate projected_net correctly', () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const result = getCashFlowForecast(db, { months: 3 });

      // Net = Income - Expenses = 3000 - 2000 = 1000
      expect(result.projections[0].projected_net).toBe(1000);
    });

    it('should aggregate balance across all accounts', () => {
      // Set balances on multiple accounts
      db.prepare('UPDATE accounts SET current_balance = 3000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 2000 WHERE id = 2').run();

      insertMonthlyTransactions(1, 3000, 2000);

      const result = getCashFlowForecast(db, { months: 1 });

      // Total balance: 3000 + 2000 = 5000
      expect(result.current_balance).toBe(5000);
    });

    it('should default to 12 months if not specified', () => {
      insertMonthlyTransactions(1, 3000, 2000);

      const result = getCashFlowForecast(db);

      expect(result.projections).toHaveLength(12);
    });
  });

  // ==========================================================================
  // getScenarios
  // ==========================================================================
  describe('getScenarios', () => {
    it('should return three scenarios: optimistic, expected, conservative', () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const result = getScenarios(db);

      expect(result).toHaveProperty('optimistic');
      expect(result).toHaveProperty('expected');
      expect(result).toHaveProperty('conservative');
    });

    it('should calculate optimistic scenario with +10% income and -10% expenses', () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const result = getScenarios(db);

      // Expected: income=3000, expenses=2000
      // Optimistic: income=3300 (+10%), expenses=1800 (-10%)
      expect(result.optimistic.projected_income).toBe(3300);
      expect(result.optimistic.projected_expenses).toBe(1800);
      expect(result.optimistic.projected_net).toBe(1500); // 3300 - 1800
    });

    it('should calculate expected scenario with average values', () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const result = getScenarios(db);

      expect(result.expected.projected_income).toBe(3000);
      expect(result.expected.projected_expenses).toBe(2000);
      expect(result.expected.projected_net).toBe(1000);
    });

    it('should calculate conservative scenario with -10% income and +10% expenses', () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const result = getScenarios(db);

      // Conservative: income=2700 (-10%), expenses=2200 (+10%)
      expect(result.conservative.projected_income).toBe(2700);
      expect(result.conservative.projected_expenses).toBe(2200);
      expect(result.conservative.projected_net).toBe(500); // 2700 - 2200
    });

    it('should project balance forward for each scenario', () => {
      db.prepare('UPDATE accounts SET current_balance = 5000 WHERE id = 1').run();

      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const result = getScenarios(db, { months: 12 });

      // Starting balance: 5000
      // Optimistic net: 1500/month -> 5000 + (1500*12) = 23000
      expect(result.optimistic.projected_balance_end).toBe(23000);
      // Expected net: 1000/month -> 5000 + (1000*12) = 17000
      expect(result.expected.projected_balance_end).toBe(17000);
      // Conservative net: 500/month -> 5000 + (500*12) = 11000
      expect(result.conservative.projected_balance_end).toBe(11000);
    });

    it('should return zeros for all scenarios when no data exists', () => {
      const result = getScenarios(db);

      expect(result.optimistic.projected_income).toBe(0);
      expect(result.expected.projected_income).toBe(0);
      expect(result.conservative.projected_income).toBe(0);
    });

    it('should use penny precision for all values', () => {
      insertMonthlyTransactions(1, 3333.33, 2222.22);
      insertMonthlyTransactions(2, 3333.34, 2222.23);

      const result = getScenarios(db);

      // All values should be properly rounded
      expect(Number.isInteger(result.optimistic.projected_income * 100)).toBe(true);
      expect(Number.isInteger(result.expected.projected_expenses * 100)).toBe(true);
    });
  });

  // ==========================================================================
  // getSeasonalPatterns
  // ==========================================================================
  describe('getSeasonalPatterns', () => {
    it('should return spending patterns for each month of year', () => {
      // Insert transactions in different months
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-01-15', 'JAN EXPENSE', 1000, 0, 3, 0)
      `).run();
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-07-15', 'JUL EXPENSE', 2000, 0, 3, 0)
      `).run();

      const result = getSeasonalPatterns(db);

      expect(result).toHaveProperty('01');
      expect(result).toHaveProperty('07');
      expect(result['01']).toBe(1000);
      expect(result['07']).toBe(2000);
    });

    it('should average spending when multiple years of data exist', () => {
      // 2024 January
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2024-01-15', 'JAN 2024', 1000, 0, 3, 0)
      `).run();
      // 2025 January
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-01-15', 'JAN 2025', 2000, 0, 3, 0)
      `).run();

      const result = getSeasonalPatterns(db);

      // Average of 1000 and 2000 = 1500
      expect(result['01']).toBe(1500);
    });

    it('should filter by category when categoryId is provided', () => {
      // Groceries (category 3)
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-01-15', 'GROCERIES', 500, 0, 3, 0)
      `).run();
      // Shopping (category 4)
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-01-15', 'SHOPPING', 1000, 0, 4, 0)
      `).run();

      const result = getSeasonalPatterns(db, 3); // Groceries only

      expect(result['01']).toBe(500);
    });

    it('should exclude transfer transactions', () => {
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-01-15', 'EXPENSE', 1000, 0, 3, 0)
      `).run();
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-01-15', 'TRANSFER', 500, 0, 10, 1)
      `).run();

      const result = getSeasonalPatterns(db);

      expect(result['01']).toBe(1000);
    });

    it('should return empty object when no transactions exist', () => {
      const result = getSeasonalPatterns(db);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should return all 12 months when data exists for full year', () => {
      for (let month = 1; month <= 12; month++) {
        const monthStr = String(month).padStart(2, '0');
        db.prepare(`
          INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
          VALUES (1, '2025-${monthStr}-15', 'EXPENSE', ${month * 100}, 0, 3, 0)
        `).run();
      }

      const result = getSeasonalPatterns(db);

      expect(Object.keys(result)).toHaveLength(12);
      expect(result['01']).toBe(100);
      expect(result['12']).toBe(1200);
    });
  });
});

// ==========================================================================
// Forecasting Routes Tests
// ==========================================================================
describe('Forecasting Routes', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15'));
  });

  afterEach(() => {
    closeTestDb(db);
    vi.useRealTimers();
  });

  // Helper to insert test transactions
  const insertMonthlyTransactions = (monthsAgo, income, expenses) => {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    const dateStr = date.toISOString().slice(0, 10);

    if (income > 0) {
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: dateStr,
        description: 'SALARY',
        credit_amount: income,
        debit_amount: 0,
        category_id: 1,
        is_transfer: 0
      });
    }

    if (expenses > 0) {
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: dateStr,
        description: 'GROCERIES',
        debit_amount: expenses,
        credit_amount: 0,
        category_id: 3,
        is_transfer: 0
      });
    }
  };

  // ==========================================================================
  // GET /api/forecasting/cashflow
  // ==========================================================================
  describe('GET /api/forecasting/cashflow', () => {
    it('should return cash flow projections', async () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const response = await request(app)
        .get('/api/forecasting/cashflow')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('current_balance');
      expect(response.body.data).toHaveProperty('projections');
      expect(response.body.data.projections).toHaveLength(12); // Default 12 months
    });

    it('should accept months parameter', async () => {
      insertMonthlyTransactions(1, 3000, 2000);

      const response = await request(app)
        .get('/api/forecasting/cashflow?months=6')
        .expect(200);

      expect(response.body.data.projections).toHaveLength(6);
    });

    it('should return 400 for invalid months parameter', async () => {
      const response = await request(app)
        .get('/api/forecasting/cashflow?months=invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });

    it('should return 400 for months out of range', async () => {
      const response = await request(app)
        .get('/api/forecasting/cashflow?months=0')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('between');
    });

    it('should include averages in response', async () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const response = await request(app)
        .get('/api/forecasting/cashflow')
        .expect(200);

      expect(response.body.data).toHaveProperty('averages');
      expect(response.body.data.averages).toHaveProperty('avg_income');
      expect(response.body.data.averages).toHaveProperty('avg_expenses');
    });
  });

  // ==========================================================================
  // GET /api/forecasting/averages
  // ==========================================================================
  describe('GET /api/forecasting/averages', () => {
    it('should return monthly averages', async () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const response = await request(app)
        .get('/api/forecasting/averages')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        avg_income: 3000,
        avg_expenses: 2000,
        avg_net: 1000
      });
    });

    it('should accept months parameter', async () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);
      insertMonthlyTransactions(3, 3000, 2000);
      insertMonthlyTransactions(6, 6000, 5000); // Should be excluded with months=3

      const response = await request(app)
        .get('/api/forecasting/averages?months=3')
        .expect(200);

      expect(response.body.data.avg_income).toBe(3000);
    });

    it('should return zeros when no data', async () => {
      const response = await request(app)
        .get('/api/forecasting/averages')
        .expect(200);

      expect(response.body.data).toMatchObject({
        avg_income: 0,
        avg_expenses: 0,
        avg_net: 0
      });
    });

    it('should return 400 for invalid months parameter', async () => {
      const response = await request(app)
        .get('/api/forecasting/averages?months=-1')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // GET /api/forecasting/scenarios
  // ==========================================================================
  describe('GET /api/forecasting/scenarios', () => {
    it('should return three scenarios', async () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const response = await request(app)
        .get('/api/forecasting/scenarios')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('optimistic');
      expect(response.body.data).toHaveProperty('expected');
      expect(response.body.data).toHaveProperty('conservative');
    });

    it('should calculate scenarios correctly', async () => {
      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const response = await request(app)
        .get('/api/forecasting/scenarios')
        .expect(200);

      // Expected: 3000 income, 2000 expenses
      expect(response.body.data.expected.projected_income).toBe(3000);
      expect(response.body.data.expected.projected_expenses).toBe(2000);

      // Optimistic: +10% income, -10% expenses
      expect(response.body.data.optimistic.projected_income).toBe(3300);
      expect(response.body.data.optimistic.projected_expenses).toBe(1800);

      // Conservative: -10% income, +10% expenses
      expect(response.body.data.conservative.projected_income).toBe(2700);
      expect(response.body.data.conservative.projected_expenses).toBe(2200);
    });

    it('should include current balance', async () => {
      db.prepare('UPDATE accounts SET current_balance = 5000 WHERE id = 1').run();

      insertMonthlyTransactions(1, 3000, 2000);

      const response = await request(app)
        .get('/api/forecasting/scenarios')
        .expect(200);

      expect(response.body.data).toHaveProperty('current_balance');
      expect(response.body.data.current_balance).toBe(5000);
    });

    it('should accept months parameter for projection period', async () => {
      db.prepare('UPDATE accounts SET current_balance = 5000 WHERE id = 1').run();

      insertMonthlyTransactions(1, 3000, 2000);
      insertMonthlyTransactions(2, 3000, 2000);

      const response = await request(app)
        .get('/api/forecasting/scenarios?months=6')
        .expect(200);

      // Net per month = 1000, 6 months = 6000 added
      expect(response.body.data.expected.projected_balance_end).toBe(11000);
    });
  });

  // ==========================================================================
  // GET /api/forecasting/seasonal
  // ==========================================================================
  describe('GET /api/forecasting/seasonal', () => {
    it('should return seasonal spending patterns', async () => {
      // Insert transactions in different months
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-01-15', 'JAN EXPENSE', 1000, 0, 3, 0)
      `).run();
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-06-15', 'JUN EXPENSE', 1500, 0, 3, 0)
      `).run();

      const response = await request(app)
        .get('/api/forecasting/seasonal')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('01');
      expect(response.body.data).toHaveProperty('06');
      expect(response.body.data['01']).toBe(1000);
      expect(response.body.data['06']).toBe(1500);
    });

    it('should filter by category_id when provided', async () => {
      // Groceries (cat 3)
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-01-15', 'GROCERIES', 500, 0, 3, 0)
      `).run();
      // Shopping (cat 4)
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, debit_amount, credit_amount, category_id, is_transfer)
        VALUES (1, '2025-01-15', 'SHOPPING', 1000, 0, 4, 0)
      `).run();

      const response = await request(app)
        .get('/api/forecasting/seasonal?category_id=3')
        .expect(200);

      expect(response.body.data['01']).toBe(500);
    });

    it('should return 400 for invalid category_id', async () => {
      const response = await request(app)
        .get('/api/forecasting/seasonal?category_id=invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return empty object when no data', async () => {
      const response = await request(app)
        .get('/api/forecasting/seasonal')
        .expect(200);

      expect(response.body.data).toEqual({});
    });
  });
});
