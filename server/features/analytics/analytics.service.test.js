/**
 * Analytics Service Tests
 *
 * TDD tests for analytics service functions:
 * - getYearOverYearComparison
 * - getMonthlyYoYComparison
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import {
  getYearOverYearComparison,
  getMonthlyYoYComparison
} from './analytics.service.js';

describe('Analytics Service - Year over Year', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // Helper to insert YoY test data
  // ==========================================================================
  function seedYoYTestData() {
    // 2025 Transactions (last year)
    // January 2025 - Salary
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2025-01-15',
      description: 'SALARY JAN 2025',
      credit_amount: 3000,
      debit_amount: 0,
      category_id: 1  // Salary (income)
    });

    // January 2025 - Groceries
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2025-01-20',
      description: 'TESCO GROCERIES',
      debit_amount: 150,
      credit_amount: 0,
      category_id: 3  // Groceries
    });

    // February 2025 - Groceries
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2025-02-10',
      description: 'SAINSBURY',
      debit_amount: 120,
      credit_amount: 0,
      category_id: 3  // Groceries
    });

    // March 2025 - Entertainment
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2025-03-15',
      description: 'NETFLIX',
      debit_amount: 12.99,
      credit_amount: 0,
      category_id: 5  // Entertainment
    });

    // 2026 Transactions (this year)
    // January 2026 - Salary
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2026-01-15',
      description: 'SALARY JAN 2026',
      credit_amount: 3200,
      debit_amount: 0,
      category_id: 1  // Salary (income)
    });

    // January 2026 - Groceries (increased spending)
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2026-01-18',
      description: 'TESCO GROCERIES',
      debit_amount: 180,
      credit_amount: 0,
      category_id: 3  // Groceries
    });

    // January 2026 - Second grocery trip
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2026-01-25',
      description: 'ALDI',
      debit_amount: 50,
      credit_amount: 0,
      category_id: 3  // Groceries
    });

    // February 2026 - Groceries
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2026-02-12',
      description: 'TESCO',
      debit_amount: 140,
      credit_amount: 0,
      category_id: 3  // Groceries
    });

    // March 2026 - Entertainment (increased)
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2026-03-15',
      description: 'NETFLIX',
      debit_amount: 15.99,
      credit_amount: 0,
      category_id: 5  // Entertainment
    });

    // March 2026 - New category (Dining) - did not exist in 2025
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2026-03-20',
      description: 'COSTA COFFEE',
      debit_amount: 25,
      credit_amount: 0,
      category_id: 7  // Dining
    });

    // Transfer - should be excluded
    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2026-01-05',
      description: 'TRANSFER TO SAVINGS',
      debit_amount: 500,
      credit_amount: 0,
      category_id: 10,  // Transfer
      is_transfer: 1
    });

    insertTestTransaction(db, {
      account_id: 1,
      transaction_date: '2025-01-05',
      description: 'TRANSFER TO SAVINGS',
      debit_amount: 400,
      credit_amount: 0,
      category_id: 10,  // Transfer
      is_transfer: 1
    });
  }

  // ==========================================================================
  // getYearOverYearComparison
  // ==========================================================================
  describe('getYearOverYearComparison', () => {
    it('should return comparison data for current year vs last year', () => {
      seedYoYTestData();

      const result = getYearOverYearComparison(db, { year: 2026 });

      expect(result).toHaveProperty('thisYear', 2026);
      expect(result).toHaveProperty('lastYear', 2025);
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('totals');
      expect(Array.isArray(result.categories)).toBe(true);
    });

    it('should calculate correct totals for each category', () => {
      seedYoYTestData();

      const result = getYearOverYearComparison(db, { year: 2026 });

      // Find Groceries category
      const groceries = result.categories.find(c => c.category.name === 'Groceries');
      expect(groceries).toBeDefined();

      // 2025 Groceries: 150 + 120 = 270
      expect(groceries.lastYear.total).toBe(270);
      expect(groceries.lastYear.count).toBe(2);

      // 2026 Groceries: 180 + 50 + 140 = 370
      expect(groceries.thisYear.total).toBe(370);
      expect(groceries.thisYear.count).toBe(3);
    });

    it('should calculate correct change amount and percentage', () => {
      seedYoYTestData();

      const result = getYearOverYearComparison(db, { year: 2026 });

      // Find Groceries category
      const groceries = result.categories.find(c => c.category.name === 'Groceries');

      // Change: 370 - 270 = 100
      expect(groceries.change.amount).toBe(100);

      // Percentage: ((370 - 270) / 270) * 100 = 37.04%
      expect(groceries.change.percentage).toBeCloseTo(37.04, 1);
    });

    it('should handle division by zero for new categories', () => {
      seedYoYTestData();

      const result = getYearOverYearComparison(db, { year: 2026 });

      // Dining only exists in 2026
      const dining = result.categories.find(c => c.category.name === 'Dining');
      expect(dining).toBeDefined();
      expect(dining.lastYear.total).toBe(0);
      expect(dining.lastYear.count).toBe(0);
      expect(dining.thisYear.total).toBe(25);
      expect(dining.change.amount).toBe(25);
      // When last year is 0, percentage should be null or Infinity handling
      expect(dining.change.percentage).toBeNull();
    });

    it('should exclude transfers from calculations', () => {
      seedYoYTestData();

      const result = getYearOverYearComparison(db, { year: 2026 });

      // Transfer category should not appear
      const transfer = result.categories.find(c => c.category.name === 'Transfer');
      expect(transfer).toBeUndefined();

      // Totals should not include transfers
      // 2025 expenses (non-transfer): 150 + 120 + 12.99 = 282.99
      expect(result.totals.lastYear.expenses).toBeCloseTo(282.99, 2);

      // 2026 expenses (non-transfer): 180 + 50 + 140 + 15.99 + 25 = 410.99
      expect(result.totals.thisYear.expenses).toBeCloseTo(410.99, 2);
    });

    it('should calculate income totals correctly', () => {
      seedYoYTestData();

      const result = getYearOverYearComparison(db, { year: 2026 });

      // 2025 income: 3000
      expect(result.totals.lastYear.income).toBe(3000);

      // 2026 income: 3200
      expect(result.totals.thisYear.income).toBe(3200);
    });

    it('should include category metadata (id, name, colour)', () => {
      seedYoYTestData();

      const result = getYearOverYearComparison(db, { year: 2026 });

      const groceries = result.categories.find(c => c.category.name === 'Groceries');
      expect(groceries.category).toHaveProperty('id');
      expect(groceries.category).toHaveProperty('name', 'Groceries');
      expect(groceries.category).toHaveProperty('colour');
    });

    it('should filter by category_id when provided', () => {
      seedYoYTestData();

      // Category 3 is Groceries
      const result = getYearOverYearComparison(db, { year: 2026, category_id: 3 });

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].category.name).toBe('Groceries');
    });

    it('should use current year as default if not specified', () => {
      seedYoYTestData();

      const result = getYearOverYearComparison(db);
      const currentYear = new Date().getFullYear();

      expect(result.thisYear).toBe(currentYear);
      expect(result.lastYear).toBe(currentYear - 1);
    });

    it('should return empty categories array when no data exists', () => {
      // No seed data

      const result = getYearOverYearComparison(db, { year: 2026 });

      expect(result.categories).toHaveLength(0);
      expect(result.totals.thisYear.expenses).toBe(0);
      expect(result.totals.thisYear.income).toBe(0);
      expect(result.totals.lastYear.expenses).toBe(0);
      expect(result.totals.lastYear.income).toBe(0);
    });

    it('should apply penny precision to all amounts', () => {
      // Insert transaction with floating point edge case
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-01-15',
        description: 'TEST PURCHASE',
        debit_amount: 10.1,
        credit_amount: 0,
        category_id: 3
      });

      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2026-01-16',
        description: 'TEST PURCHASE 2',
        debit_amount: 10.2,
        credit_amount: 0,
        category_id: 3
      });

      const result = getYearOverYearComparison(db, { year: 2026 });

      const groceries = result.categories.find(c => c.category.name === 'Groceries');
      // 10.1 + 10.2 should be exactly 20.30, not 20.299999...
      expect(groceries.thisYear.total).toBe(20.3);
    });
  });

  // ==========================================================================
  // getMonthlyYoYComparison
  // ==========================================================================
  describe('getMonthlyYoYComparison', () => {
    it('should return comparison data for a specific month', () => {
      seedYoYTestData();

      const result = getMonthlyYoYComparison(db, '01', { year: 2026 });

      expect(result).toHaveProperty('thisYear', 2026);
      expect(result).toHaveProperty('lastYear', 2025);
      expect(result).toHaveProperty('month', '01');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('totals');
    });

    it('should only include transactions from the specified month', () => {
      seedYoYTestData();

      const result = getMonthlyYoYComparison(db, '01', { year: 2026 });

      // January 2026 Groceries: 180 + 50 = 230
      const groceries = result.categories.find(c => c.category.name === 'Groceries');
      expect(groceries.thisYear.total).toBe(230);
      expect(groceries.thisYear.count).toBe(2);

      // January 2025 Groceries: 150
      expect(groceries.lastYear.total).toBe(150);
      expect(groceries.lastYear.count).toBe(1);
    });

    it('should calculate correct change for monthly comparison', () => {
      seedYoYTestData();

      const result = getMonthlyYoYComparison(db, '01', { year: 2026 });

      const groceries = result.categories.find(c => c.category.name === 'Groceries');

      // Change: 230 - 150 = 80
      expect(groceries.change.amount).toBe(80);

      // Percentage: ((230 - 150) / 150) * 100 = 53.33%
      expect(groceries.change.percentage).toBeCloseTo(53.33, 1);
    });

    it('should handle month with no data in last year', () => {
      seedYoYTestData();

      // March has Entertainment in both years
      const result = getMonthlyYoYComparison(db, '03', { year: 2026 });

      // Dining only in March 2026
      const dining = result.categories.find(c => c.category.name === 'Dining');
      expect(dining).toBeDefined();
      expect(dining.lastYear.total).toBe(0);
      expect(dining.thisYear.total).toBe(25);
      expect(dining.change.percentage).toBeNull();
    });

    it('should calculate monthly income totals correctly', () => {
      seedYoYTestData();

      const result = getMonthlyYoYComparison(db, '01', { year: 2026 });

      // January 2025 income: 3000
      expect(result.totals.lastYear.income).toBe(3000);

      // January 2026 income: 3200
      expect(result.totals.thisYear.income).toBe(3200);
    });

    it('should exclude transfers from monthly comparison', () => {
      seedYoYTestData();

      const result = getMonthlyYoYComparison(db, '01', { year: 2026 });

      // Transfer should not appear
      const transfer = result.categories.find(c => c.category.name === 'Transfer');
      expect(transfer).toBeUndefined();

      // January 2026 expenses (non-transfer): 180 + 50 = 230
      expect(result.totals.thisYear.expenses).toBe(230);

      // January 2025 expenses (non-transfer): 150
      expect(result.totals.lastYear.expenses).toBe(150);
    });

    it('should validate month format', () => {
      seedYoYTestData();

      // Valid months: '01' through '12'
      expect(() => getMonthlyYoYComparison(db, '13', { year: 2026 })).toThrow();
      expect(() => getMonthlyYoYComparison(db, '00', { year: 2026 })).toThrow();
      expect(() => getMonthlyYoYComparison(db, 'invalid', { year: 2026 })).toThrow();
      expect(() => getMonthlyYoYComparison(db, '1', { year: 2026 })).toThrow();
    });

    it('should filter by category_id when provided', () => {
      seedYoYTestData();

      // Category 3 is Groceries
      const result = getMonthlyYoYComparison(db, '01', { year: 2026, category_id: 3 });

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].category.name).toBe('Groceries');
    });

    it('should use current year as default if not specified', () => {
      seedYoYTestData();

      const result = getMonthlyYoYComparison(db, '01');
      const currentYear = new Date().getFullYear();

      expect(result.thisYear).toBe(currentYear);
      expect(result.lastYear).toBe(currentYear - 1);
    });

    it('should handle February comparison between years', () => {
      seedYoYTestData();

      const result = getMonthlyYoYComparison(db, '02', { year: 2026 });

      // February 2025 Groceries: 120
      // February 2026 Groceries: 140
      const groceries = result.categories.find(c => c.category.name === 'Groceries');
      expect(groceries.lastYear.total).toBe(120);
      expect(groceries.thisYear.total).toBe(140);
      expect(groceries.change.amount).toBeCloseTo(20, 2);
    });

    it('should return empty data for month with no transactions', () => {
      seedYoYTestData();

      const result = getMonthlyYoYComparison(db, '12', { year: 2026 });

      expect(result.categories).toHaveLength(0);
      expect(result.totals.thisYear.expenses).toBe(0);
      expect(result.totals.thisYear.income).toBe(0);
      expect(result.totals.lastYear.expenses).toBe(0);
      expect(result.totals.lastYear.income).toBe(0);
    });
  });
});
