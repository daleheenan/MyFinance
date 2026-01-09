/**
 * Merchants Service Tests (TDD)
 *
 * TDD: Tests written FIRST, implementation follows.
 * Tests merchant name extraction, top merchants, stats, and history.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import { createApp } from '../../index.js';
import {
  extractMerchantName,
  getTopMerchants,
  getMerchantStats,
  getMerchantHistory
} from './merchants.service.js';

// ==========================================================================
// Unit Tests - extractMerchantName
// ==========================================================================
describe('MerchantsService', () => {
  describe('extractMerchantName', () => {
    describe('Known merchants', () => {
      it('should extract TESCO as Tesco', () => {
        expect(extractMerchantName('TESCO STORES 1234')).toBe('Tesco');
      });

      it('should extract SAINSBURY as Sainsbury\'s', () => {
        expect(extractMerchantName("SAINSBURY'S SUPERMARKET")).toBe("Sainsbury's");
      });

      it('should extract ASDA as Asda', () => {
        expect(extractMerchantName('ASDA SUPERSTORE LONDON')).toBe('Asda');
      });

      it('should extract MORRISONS as Morrisons', () => {
        expect(extractMerchantName('WM MORRISONS STORE')).toBe('Morrisons');
      });

      it('should extract LIDL as Lidl', () => {
        expect(extractMerchantName('LIDL GB MANCHESTER')).toBe('Lidl');
      });

      it('should extract ALDI as Aldi', () => {
        expect(extractMerchantName('ALDI STORES LTD')).toBe('Aldi');
      });

      it('should extract AMAZON as Amazon', () => {
        expect(extractMerchantName('AMAZON.CO.UK*AB12CD34E')).toBe('Amazon');
      });

      it('should extract AMZN as Amazon', () => {
        expect(extractMerchantName('AMZN MKTP UK*123ABC')).toBe('Amazon');
      });

      it('should extract NETFLIX as Netflix', () => {
        expect(extractMerchantName('NETFLIX.COM MONTHLY')).toBe('Netflix');
      });

      it('should extract SPOTIFY as Spotify', () => {
        expect(extractMerchantName('SPOTIFY P1234567890')).toBe('Spotify');
      });

      it('should extract UBER as Uber', () => {
        expect(extractMerchantName('UBER *TRIP LONDON')).toBe('Uber');
      });

      it('should extract DELIVEROO as Deliveroo', () => {
        expect(extractMerchantName('DELIVEROO.COM ORDER')).toBe('Deliveroo');
      });

      it('should extract MCDONALD as McDonald\'s', () => {
        expect(extractMerchantName('MCDONALD\'S LONDON')).toBe("McDonald's");
      });

      it('should extract COSTA as Costa', () => {
        expect(extractMerchantName('COSTA COFFEE EUSTON')).toBe('Costa');
      });

      it('should extract STARBUCKS as Starbucks', () => {
        expect(extractMerchantName('STARBUCKS LONDON BRIDGE')).toBe('Starbucks');
      });

      it('should extract TRAINLINE as Trainline', () => {
        expect(extractMerchantName('TRAINLINE.COM LONDON')).toBe('Trainline');
      });

      it('should extract TFL as TfL', () => {
        expect(extractMerchantName('TFL TRAVEL CHARGE')).toBe('TfL');
      });

      it('should extract PAYPAL as PayPal', () => {
        expect(extractMerchantName('PAYPAL *MERCHANT123')).toBe('PayPal');
      });
    });

    describe('Case insensitivity', () => {
      it('should match lowercase tesco', () => {
        expect(extractMerchantName('tesco stores')).toBe('Tesco');
      });

      it('should match mixed case TeSCo', () => {
        expect(extractMerchantName('TeSCo ExTrA')).toBe('Tesco');
      });

      it('should match lowercase netflix', () => {
        expect(extractMerchantName('netflix monthly')).toBe('Netflix');
      });
    });

    describe('Default extraction (unknown merchants)', () => {
      it('should return first word title cased for unknown merchants', () => {
        expect(extractMerchantName('GREGGS BAKERY LONDON')).toBe('Greggs');
      });

      it('should remove numbers from unknown merchants', () => {
        expect(extractMerchantName('SHOP123 OXFORD STREET')).toBe('Shop');
      });

      it('should handle asterisk separators', () => {
        expect(extractMerchantName('RANDOM*MERCHANT*123')).toBe('Random');
      });

      it('should handle space separators', () => {
        expect(extractMerchantName('UNKNOWN PAYMENT REF')).toBe('Unknown');
      });

      it('should return Unknown for empty string', () => {
        expect(extractMerchantName('')).toBe('Unknown');
      });

      it('should return Unknown for null', () => {
        expect(extractMerchantName(null)).toBe('Unknown');
      });

      it('should return Unknown for undefined', () => {
        expect(extractMerchantName(undefined)).toBe('Unknown');
      });

      it('should return Unknown for whitespace only', () => {
        expect(extractMerchantName('   ')).toBe('Unknown');
      });

      it('should return Unknown for numbers only', () => {
        expect(extractMerchantName('123456')).toBe('Unknown');
      });
    });

    describe('Edge cases', () => {
      it('should handle description with special characters', () => {
        expect(extractMerchantName('TESCO*STORE#123!')).toBe('Tesco');
      });

      it('should prefer known merchant over first word extraction', () => {
        // Even if RANDOM comes first, AMAZON should be detected
        expect(extractMerchantName('CD AMAZON PURCHASE')).toBe('Amazon');
      });

      it('should handle very long descriptions', () => {
        const longDesc = 'TESCO ' + 'X'.repeat(500);
        expect(extractMerchantName(longDesc)).toBe('Tesco');
      });
    });
  });

  // ==========================================================================
  // Database Tests - getTopMerchants, getMerchantStats, getMerchantHistory
  // ==========================================================================
  describe('Database Operations', () => {
    let db;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      closeTestDb(db);
    });

    /**
     * Helper to seed test transactions for merchant tests
     */
    function seedMerchantTransactions() {
      const today = new Date();
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
      const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
      const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 15);
      const twoMonthsAgoStr = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

      // TESCO transactions (3 this month, 2 last month)
      insertTestTransaction(db, {
        transaction_date: `${currentMonth}-05`,
        description: 'TESCO STORES 1234',
        original_description: 'TESCO STORES 1234',
        debit_amount: 85.50,
        category_id: 3
      });
      insertTestTransaction(db, {
        transaction_date: `${currentMonth}-12`,
        description: 'TESCO EXPRESS LONDON',
        original_description: 'TESCO EXPRESS LONDON',
        debit_amount: 15.99,
        category_id: 3
      });
      insertTestTransaction(db, {
        transaction_date: `${currentMonth}-20`,
        description: 'TESCO METRO',
        original_description: 'TESCO METRO',
        debit_amount: 42.00,
        category_id: 3
      });
      insertTestTransaction(db, {
        transaction_date: `${lastMonthStr}-10`,
        description: 'TESCO STORES',
        original_description: 'TESCO STORES',
        debit_amount: 95.00,
        category_id: 3
      });
      insertTestTransaction(db, {
        transaction_date: `${lastMonthStr}-25`,
        description: 'TESCO EXTRA',
        original_description: 'TESCO EXTRA',
        debit_amount: 120.00,
        category_id: 3
      });

      // AMAZON transactions (2 this month)
      insertTestTransaction(db, {
        transaction_date: `${currentMonth}-03`,
        description: 'AMAZON.CO.UK*ORDER123',
        original_description: 'AMAZON.CO.UK*ORDER123',
        debit_amount: 29.99,
        category_id: 4
      });
      insertTestTransaction(db, {
        transaction_date: `${currentMonth}-15`,
        description: 'AMZN MKTP UK*ABC',
        original_description: 'AMZN MKTP UK*ABC',
        debit_amount: 45.00,
        category_id: 4
      });

      // NETFLIX transactions (1 per month for 3 months - subscription)
      insertTestTransaction(db, {
        transaction_date: `${currentMonth}-01`,
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 15.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        transaction_date: `${lastMonthStr}-01`,
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 15.99,
        category_id: 5
      });
      insertTestTransaction(db, {
        transaction_date: `${twoMonthsAgoStr}-01`,
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 15.99,
        category_id: 5
      });

      // COSTA transaction (1 this month)
      insertTestTransaction(db, {
        transaction_date: `${currentMonth}-08`,
        description: 'COSTA COFFEE EUSTON',
        original_description: 'COSTA COFFEE EUSTON',
        debit_amount: 4.50,
        category_id: 7
      });

      // Transfer (should be excluded)
      insertTestTransaction(db, {
        transaction_date: `${currentMonth}-02`,
        description: 'TRANSFER TO SAVINGS',
        original_description: 'TRANSFER TO SAVINGS',
        debit_amount: 500,
        category_id: 10,
        is_transfer: 1
      });

      // Income (should be excluded from merchant spending)
      insertTestTransaction(db, {
        transaction_date: `${currentMonth}-01`,
        description: 'SALARY PAYMENT',
        original_description: 'SALARY PAYMENT',
        credit_amount: 3000,
        debit_amount: 0,
        category_id: 1
      });
    }

    // ==========================================================================
    // getTopMerchants
    // ==========================================================================
    describe('getTopMerchants', () => {
      it('should return top merchants by spend', () => {
        seedMerchantTransactions();

        const result = getTopMerchants(db, { by: 'spend', limit: 10 });

        expect(result).toBeInstanceOf(Array);
        expect(result.length).toBeGreaterThan(0);

        // Each merchant should have required fields
        result.forEach(merchant => {
          expect(merchant).toHaveProperty('name');
          expect(merchant).toHaveProperty('totalSpend');
          expect(merchant).toHaveProperty('transactionCount');
        });

        // Should be sorted by spend descending
        for (let i = 1; i < result.length; i++) {
          expect(result[i - 1].totalSpend).toBeGreaterThanOrEqual(result[i].totalSpend);
        }
      });

      it('should return top merchants by frequency', () => {
        seedMerchantTransactions();

        const result = getTopMerchants(db, { by: 'frequency', limit: 10 });

        expect(result.length).toBeGreaterThan(0);

        // Should be sorted by transaction count descending
        for (let i = 1; i < result.length; i++) {
          expect(result[i - 1].transactionCount).toBeGreaterThanOrEqual(result[i].transactionCount);
        }
      });

      it('should respect limit parameter', () => {
        seedMerchantTransactions();

        const result = getTopMerchants(db, { by: 'spend', limit: 2 });

        expect(result.length).toBeLessThanOrEqual(2);
      });

      it('should use default limit of 10', () => {
        seedMerchantTransactions();

        const result = getTopMerchants(db);

        expect(result.length).toBeLessThanOrEqual(10);
      });

      it('should filter by month when provided', () => {
        seedMerchantTransactions();

        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

        const result = getTopMerchants(db, { by: 'spend', limit: 10, month: currentMonth });

        expect(result.length).toBeGreaterThan(0);

        // Tesco should have 3 transactions this month (143.49 total)
        const tesco = result.find(m => m.name === 'Tesco');
        expect(tesco).toBeDefined();
        expect(tesco.transactionCount).toBe(3);
        expect(tesco.totalSpend).toBeCloseTo(143.49, 2);
      });

      it('should exclude transfers from merchant spending', () => {
        seedMerchantTransactions();

        const result = getTopMerchants(db, { by: 'spend', limit: 10 });

        // Transfer should not appear as a merchant
        const transfer = result.find(m => m.name.toLowerCase().includes('transfer'));
        expect(transfer).toBeUndefined();
      });

      it('should exclude income from merchant list', () => {
        seedMerchantTransactions();

        const result = getTopMerchants(db, { by: 'spend', limit: 10 });

        // Salary should not appear
        const salary = result.find(m => m.name.toLowerCase().includes('salary'));
        expect(salary).toBeUndefined();
      });

      it('should return empty array when no transactions', () => {
        const result = getTopMerchants(db, { by: 'spend', limit: 10 });

        expect(result).toEqual([]);
      });

      it('should include average spend per transaction', () => {
        seedMerchantTransactions();

        const result = getTopMerchants(db, { by: 'spend', limit: 10 });

        result.forEach(merchant => {
          expect(merchant).toHaveProperty('avgSpend');
          const expectedAvg = merchant.totalSpend / merchant.transactionCount;
          expect(merchant.avgSpend).toBeCloseTo(expectedAvg, 2);
        });
      });
    });

    // ==========================================================================
    // getMerchantStats
    // ==========================================================================
    describe('getMerchantStats', () => {
      it('should return stats for a known merchant pattern', () => {
        seedMerchantTransactions();

        const result = getMerchantStats(db, 'TESCO');

        expect(result).toHaveProperty('merchantName', 'Tesco');
        expect(result).toHaveProperty('totalSpend');
        expect(result).toHaveProperty('transactionCount');
        expect(result).toHaveProperty('avgSpend');
        expect(result).toHaveProperty('firstSeen');
        expect(result).toHaveProperty('lastSeen');
      });

      it('should calculate correct totals for TESCO', () => {
        seedMerchantTransactions();

        const result = getMerchantStats(db, 'TESCO');

        // 85.50 + 15.99 + 42.00 + 95.00 + 120.00 = 358.49
        expect(result.totalSpend).toBeCloseTo(358.49, 2);
        expect(result.transactionCount).toBe(5);
      });

      it('should handle case-insensitive pattern matching', () => {
        seedMerchantTransactions();

        const result = getMerchantStats(db, 'tesco');

        expect(result.merchantName).toBe('Tesco');
        expect(result.transactionCount).toBe(5);
      });

      it('should return stats for AMAZON pattern', () => {
        seedMerchantTransactions();

        const result = getMerchantStats(db, 'AMAZON');

        // Should match AMAZON.CO.UK (AMZN is a different pattern)
        expect(result.merchantName).toBe('Amazon');
        expect(result.transactionCount).toBe(1);
        expect(result.totalSpend).toBeCloseTo(29.99, 2);
      });

      it('should return stats for AMZN pattern', () => {
        seedMerchantTransactions();

        const result = getMerchantStats(db, 'AMZN');

        // Should match AMZN MKTP
        expect(result.merchantName).toBe('Amazon');
        expect(result.transactionCount).toBe(1);
        expect(result.totalSpend).toBeCloseTo(45.00, 2);
      });

      it('should return null for non-existent merchant', () => {
        seedMerchantTransactions();

        const result = getMerchantStats(db, 'NONEXISTENT');

        expect(result).toBeNull();
      });

      it('should include most common category', () => {
        seedMerchantTransactions();

        const result = getMerchantStats(db, 'TESCO');

        expect(result).toHaveProperty('category');
        expect(result.category).toHaveProperty('id', 3);
        expect(result.category).toHaveProperty('name', 'Groceries');
      });
    });

    // ==========================================================================
    // getMerchantHistory
    // ==========================================================================
    describe('getMerchantHistory', () => {
      it('should return monthly spending history for a merchant', () => {
        seedMerchantTransactions();

        const result = getMerchantHistory(db, 'TESCO', 12);

        expect(result).toBeInstanceOf(Array);
        expect(result.length).toBe(12); // Should return 12 months

        result.forEach(month => {
          expect(month).toHaveProperty('month');
          expect(month).toHaveProperty('spend');
          expect(month).toHaveProperty('transactionCount');
          expect(month.month).toMatch(/^\d{4}-\d{2}$/);
        });
      });

      it('should return correct spending per month for TESCO', () => {
        seedMerchantTransactions();

        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

        const result = getMerchantHistory(db, 'TESCO', 12);

        const currentMonthData = result.find(m => m.month === currentMonth);
        const lastMonthData = result.find(m => m.month === lastMonthStr);

        expect(currentMonthData.spend).toBeCloseTo(143.49, 2); // 85.50 + 15.99 + 42.00
        expect(currentMonthData.transactionCount).toBe(3);

        expect(lastMonthData.spend).toBeCloseTo(215.00, 2); // 95.00 + 120.00
        expect(lastMonthData.transactionCount).toBe(2);
      });

      it('should return zeros for months with no transactions', () => {
        seedMerchantTransactions();

        const result = getMerchantHistory(db, 'TESCO', 12);

        // Some months should have zero spend
        const zeroMonths = result.filter(m => m.spend === 0);
        expect(zeroMonths.length).toBeGreaterThan(0);

        zeroMonths.forEach(month => {
          expect(month.transactionCount).toBe(0);
        });
      });

      it('should return history sorted by month descending', () => {
        seedMerchantTransactions();

        const result = getMerchantHistory(db, 'TESCO', 12);

        // Months should be in descending order (most recent first)
        for (let i = 1; i < result.length; i++) {
          // String comparison works for YYYY-MM format
          expect(result[i - 1].month > result[i].month).toBe(true);
        }
      });

      it('should respect months parameter', () => {
        seedMerchantTransactions();

        const result = getMerchantHistory(db, 'TESCO', 3);

        expect(result.length).toBe(3);
      });

      it('should default to 12 months', () => {
        seedMerchantTransactions();

        const result = getMerchantHistory(db, 'TESCO');

        expect(result.length).toBe(12);
      });

      it('should return empty history array for non-existent merchant', () => {
        seedMerchantTransactions();

        const result = getMerchantHistory(db, 'NONEXISTENT', 12);

        expect(result).toBeInstanceOf(Array);
        expect(result.length).toBe(12);
        result.forEach(month => {
          expect(month.spend).toBe(0);
          expect(month.transactionCount).toBe(0);
        });
      });
    });
  });
});

// ==========================================================================
// Route Tests
// ==========================================================================
describe('Merchants Routes', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  /**
   * Helper to seed test transactions for route tests
   */
  function seedMerchantTransactions() {
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    // TESCO transactions
    insertTestTransaction(db, {
      transaction_date: `${currentMonth}-05`,
      description: 'TESCO STORES 1234',
      original_description: 'TESCO STORES 1234',
      debit_amount: 85.50,
      category_id: 3
    });
    insertTestTransaction(db, {
      transaction_date: `${currentMonth}-12`,
      description: 'TESCO EXPRESS LONDON',
      original_description: 'TESCO EXPRESS LONDON',
      debit_amount: 15.99,
      category_id: 3
    });

    // AMAZON transactions
    insertTestTransaction(db, {
      transaction_date: `${currentMonth}-03`,
      description: 'AMAZON.CO.UK*ORDER123',
      original_description: 'AMAZON.CO.UK*ORDER123',
      debit_amount: 29.99,
      category_id: 4
    });

    // NETFLIX transaction
    insertTestTransaction(db, {
      transaction_date: `${currentMonth}-01`,
      description: 'NETFLIX.COM',
      original_description: 'NETFLIX.COM',
      debit_amount: 15.99,
      category_id: 5
    });
  }

  // ==========================================================================
  // GET /api/merchants
  // ==========================================================================
  describe('GET /api/merchants', () => {
    it('should return list of all merchants with stats', async () => {
      seedMerchantTransactions();

      const response = await request(app)
        .get('/api/merchants')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      response.body.data.forEach(merchant => {
        expect(merchant).toHaveProperty('name');
        expect(merchant).toHaveProperty('totalSpend');
        expect(merchant).toHaveProperty('transactionCount');
      });
    });

    it('should return empty array when no transactions', async () => {
      const response = await request(app)
        .get('/api/merchants')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  // ==========================================================================
  // GET /api/merchants/top
  // ==========================================================================
  describe('GET /api/merchants/top', () => {
    it('should return top merchants by spend', async () => {
      seedMerchantTransactions();

      const response = await request(app)
        .get('/api/merchants/top')
        .query({ by: 'spend', limit: '5' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeLessThanOrEqual(5);

      // First merchant should be Tesco (highest spend)
      expect(response.body.data[0].name).toBe('Tesco');
    });

    it('should return top merchants by frequency', async () => {
      seedMerchantTransactions();

      const response = await request(app)
        .get('/api/merchants/top')
        .query({ by: 'frequency', limit: '5' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].name).toBe('Tesco'); // 2 transactions
    });

    it('should use default parameters', async () => {
      seedMerchantTransactions();

      const response = await request(app)
        .get('/api/merchants/top')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(10);
    });

    it('should accept month filter', async () => {
      seedMerchantTransactions();

      const today = new Date();
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

      const response = await request(app)
        .get('/api/merchants/top')
        .query({ month: currentMonth })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for invalid by parameter', async () => {
      const response = await request(app)
        .get('/api/merchants/top')
        .query({ by: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });
  });

  // ==========================================================================
  // GET /api/merchants/:pattern/stats
  // ==========================================================================
  describe('GET /api/merchants/:pattern/stats', () => {
    it('should return stats for a merchant pattern', async () => {
      seedMerchantTransactions();

      const response = await request(app)
        .get('/api/merchants/TESCO/stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.merchantName).toBe('Tesco');
      expect(response.body.data.totalSpend).toBeCloseTo(101.49, 2);
      expect(response.body.data.transactionCount).toBe(2);
    });

    it('should handle case-insensitive patterns', async () => {
      seedMerchantTransactions();

      const response = await request(app)
        .get('/api/merchants/tesco/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.merchantName).toBe('Tesco');
    });

    it('should return 404 for non-existent merchant', async () => {
      const response = await request(app)
        .get('/api/merchants/NONEXISTENT/stats')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should handle URL-encoded patterns', async () => {
      seedMerchantTransactions();

      const response = await request(app)
        .get('/api/merchants/' + encodeURIComponent('AMAZON') + '/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.merchantName).toBe('Amazon');
    });
  });

  // ==========================================================================
  // GET /api/merchants/:pattern/history
  // ==========================================================================
  describe('GET /api/merchants/:pattern/history', () => {
    it('should return monthly history for a merchant', async () => {
      seedMerchantTransactions();

      const response = await request(app)
        .get('/api/merchants/TESCO/history')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(12); // Default 12 months

      response.body.data.forEach(month => {
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('spend');
        expect(month).toHaveProperty('transactionCount');
      });
    });

    it('should respect months query parameter', async () => {
      seedMerchantTransactions();

      const response = await request(app)
        .get('/api/merchants/TESCO/history')
        .query({ months: '6' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(6);
    });

    it('should return 400 for invalid months parameter', async () => {
      const response = await request(app)
        .get('/api/merchants/TESCO/history')
        .query({ months: '0' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid months');
    });

    it('should return 400 for months > 24', async () => {
      const response = await request(app)
        .get('/api/merchants/TESCO/history')
        .query({ months: '25' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return empty history for non-existent merchant', async () => {
      const response = await request(app)
        .get('/api/merchants/NONEXISTENT/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(12);
      response.body.data.forEach(month => {
        expect(month.spend).toBe(0);
        expect(month.transactionCount).toBe(0);
      });
    });
  });
});
