/**
 * Recurring Routes Tests (TDD)
 *
 * Tests for:
 * GET    /api/recurring           - List all recurring patterns
 * GET    /api/recurring/:id       - Get pattern with transactions
 * POST   /api/recurring/detect    - Run detection algorithm
 * POST   /api/recurring           - Create new pattern
 * PUT    /api/recurring/:id       - Update pattern details
 * DELETE /api/recurring/:id       - Delete pattern
 * POST   /api/recurring/:id/transactions - Link transactions
 * DELETE /api/recurring/:id/transactions/:txnId - Unlink transaction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../index.js';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';

describe('Recurring Routes', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // Helper to create a pattern via API
  async function createPatternViaApi(data = {}) {
    const defaults = {
      description_pattern: 'TEST PATTERN',
      merchant_name: 'Test Merchant',
      frequency: 'monthly'
    };
    const response = await request(app)
      .post('/api/recurring')
      .send({ ...defaults, ...data });
    return response.body.data;
  }

  // ==========================================================================
  // GET /api/recurring - List all patterns
  // ==========================================================================
  describe('GET /api/recurring', () => {
    it('should return empty array when no patterns exist', async () => {
      const response = await request(app)
        .get('/api/recurring')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return all active patterns with category info', async () => {
      // Create a pattern
      await createPatternViaApi({
        description_pattern: 'NETFLIX',
        merchant_name: 'Netflix',
        category_id: 5 // Entertainment
      });

      const response = await request(app)
        .get('/api/recurring')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toHaveProperty('category_name', 'Entertainment');
      expect(response.body.data[0]).toHaveProperty('transaction_count', 0);
    });

    it('should not return inactive patterns', async () => {
      // Create a pattern
      const pattern = await createPatternViaApi();

      // Deactivate it
      await request(app)
        .put(`/api/recurring/${pattern.id}`)
        .send({ is_active: false });

      const response = await request(app)
        .get('/api/recurring')
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });

  // ==========================================================================
  // GET /api/recurring/:id - Get single pattern
  // ==========================================================================
  describe('GET /api/recurring/:id', () => {
    it('should return pattern with transactions', async () => {
      // Create pattern with linked transactions
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'NETFLIX',
        debit_amount: 15.99
      });

      const pattern = await createPatternViaApi({
        description_pattern: 'NETFLIX',
        transaction_ids: [txnId]
      });

      const response = await request(app)
        .get(`/api/recurring/${pattern.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(pattern.id);
      expect(response.body.data.transactions).toHaveLength(1);
      expect(response.body.data.transactions[0].id).toBe(txnId);
    });

    it('should return 404 for non-existent pattern', async () => {
      const response = await request(app)
        .get('/api/recurring/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Pattern not found');
    });

    it('should return 400 for invalid id format', async () => {
      const response = await request(app)
        .get('/api/recurring/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });
  });

  // ==========================================================================
  // POST /api/recurring/detect - Run detection
  // ==========================================================================
  describe('POST /api/recurring/detect', () => {
    it('should detect recurring patterns', async () => {
      // Insert recurring transactions
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 15.99
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 15.99
      });
      insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-03-01',
        description: 'NETFLIX.COM',
        original_description: 'NETFLIX.COM',
        debit_amount: 15.99
      });

      const response = await request(app)
        .post('/api/recurring/detect')
        .send({ lookbackMonths: 0 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      const netflixPattern = response.body.data.find(p =>
        p.description_pattern.includes('NETFLIX')
      );
      expect(netflixPattern).toBeDefined();
      expect(netflixPattern.typical_amount).toBe(15.99);
    });

    it('should accept custom detection options', async () => {
      const response = await request(app)
        .post('/api/recurring/detect')
        .send({
          minOccurrences: 5,
          maxAmountVariance: 5,
          lookbackMonths: 6
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  // ==========================================================================
  // POST /api/recurring - Create pattern
  // ==========================================================================
  describe('POST /api/recurring', () => {
    it('should create a new pattern', async () => {
      const response = await request(app)
        .post('/api/recurring')
        .send({
          description_pattern: 'SPOTIFY',
          merchant_name: 'Spotify',
          typical_amount: 9.99,
          typical_day: 15,
          frequency: 'monthly',
          category_id: 5,
          is_subscription: true
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        description_pattern: 'SPOTIFY',
        merchant_name: 'Spotify',
        typical_amount: 9.99,
        frequency: 'monthly',
        is_subscription: 1,
        category_name: 'Entertainment'
      });
      expect(response.body.data.id).toBeDefined();
    });

    it('should create pattern and link transactions', async () => {
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'SPOTIFY',
        debit_amount: 9.99
      });

      const response = await request(app)
        .post('/api/recurring')
        .send({
          description_pattern: 'SPOTIFY',
          transaction_ids: [txnId]
        })
        .expect(201);

      expect(response.body.data.transaction_count).toBe(1);

      // Verify transaction was linked
      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
      expect(txn.is_recurring).toBe(1);
      expect(txn.recurring_group_id).toBe(response.body.data.id);
    });

    it('should return 400 when description_pattern is missing', async () => {
      const response = await request(app)
        .post('/api/recurring')
        .send({
          merchant_name: 'Test'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('description_pattern');
    });

    it('should return 400 for invalid frequency', async () => {
      const response = await request(app)
        .post('/api/recurring')
        .send({
          description_pattern: 'TEST',
          frequency: 'invalid'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('frequency');
    });

    it('should return 400 for non-existent category', async () => {
      const response = await request(app)
        .post('/api/recurring')
        .send({
          description_pattern: 'TEST',
          category_id: 999
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Category');
    });
  });

  // ==========================================================================
  // PUT /api/recurring/:id - Update pattern
  // ==========================================================================
  describe('PUT /api/recurring/:id', () => {
    it('should update pattern merchant_name', async () => {
      const pattern = await createPatternViaApi();

      const response = await request(app)
        .put(`/api/recurring/${pattern.id}`)
        .send({ merchant_name: 'Updated Merchant' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.merchant_name).toBe('Updated Merchant');
    });

    it('should update pattern category and linked transactions', async () => {
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00,
        category_id: 3
      });

      const pattern = await createPatternViaApi({
        category_id: 3,
        transaction_ids: [txnId]
      });

      await request(app)
        .put(`/api/recurring/${pattern.id}`)
        .send({ category_id: 5 })
        .expect(200);

      // Verify transaction category was updated
      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
      expect(txn.category_id).toBe(5);
    });

    it('should return 404 for non-existent pattern', async () => {
      const response = await request(app)
        .put('/api/recurring/999')
        .send({ merchant_name: 'Test' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Pattern not found');
    });

    it('should return 400 for invalid frequency', async () => {
      const pattern = await createPatternViaApi();

      const response = await request(app)
        .put(`/api/recurring/${pattern.id}`)
        .send({ frequency: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('frequency');
    });

    it('should return 400 for non-existent category', async () => {
      const pattern = await createPatternViaApi();

      const response = await request(app)
        .put(`/api/recurring/${pattern.id}`)
        .send({ category_id: 999 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Category');
    });

    it('should deactivate pattern with is_active: false', async () => {
      const pattern = await createPatternViaApi();

      const response = await request(app)
        .put(`/api/recurring/${pattern.id}`)
        .send({ is_active: false })
        .expect(200);

      expect(response.body.data.is_active).toBe(0);
    });
  });

  // ==========================================================================
  // DELETE /api/recurring/:id - Delete pattern
  // ==========================================================================
  describe('DELETE /api/recurring/:id', () => {
    it('should delete pattern and unlink transactions', async () => {
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00
      });

      const pattern = await createPatternViaApi({
        transaction_ids: [txnId]
      });

      const response = await request(app)
        .delete(`/api/recurring/${pattern.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
      expect(response.body.data.transactions_unlinked).toBe(1);

      // Verify transaction was unlinked
      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
      expect(txn.is_recurring).toBe(0);
      expect(txn.recurring_group_id).toBeNull();

      // Verify pattern was deleted
      const getResponse = await request(app)
        .get(`/api/recurring/${pattern.id}`)
        .expect(404);
    });

    it('should return 404 for non-existent pattern', async () => {
      const response = await request(app)
        .delete('/api/recurring/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Pattern not found');
    });
  });

  // ==========================================================================
  // POST /api/recurring/:id/transactions - Link transactions
  // ==========================================================================
  describe('POST /api/recurring/:id/transactions', () => {
    it('should link transactions to pattern', async () => {
      const pattern = await createPatternViaApi();

      const txnId1 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00
      });
      const txnId2 = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-02-01',
        description: 'TEST',
        debit_amount: 10.00
      });

      const response = await request(app)
        .post(`/api/recurring/${pattern.id}/transactions`)
        .send({ transaction_ids: [txnId1, txnId2] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions_linked).toBe(2);

      // Verify transactions were linked
      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId1);
      expect(txn.is_recurring).toBe(1);
      expect(txn.recurring_group_id).toBe(pattern.id);
    });

    it('should return 400 when transaction_ids is missing', async () => {
      const pattern = await createPatternViaApi();

      const response = await request(app)
        .post(`/api/recurring/${pattern.id}/transactions`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('transaction_ids');
    });

    it('should return 400 when transaction_ids is empty', async () => {
      const pattern = await createPatternViaApi();

      const response = await request(app)
        .post(`/api/recurring/${pattern.id}/transactions`)
        .send({ transaction_ids: [] })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent pattern', async () => {
      const response = await request(app)
        .post('/api/recurring/999/transactions')
        .send({ transaction_ids: [1] })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Pattern not found');
    });

    it('should return 400 for non-existent transaction', async () => {
      const pattern = await createPatternViaApi();

      const response = await request(app)
        .post(`/api/recurring/${pattern.id}/transactions`)
        .send({ transaction_ids: [99999] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('transactions not found');
    });
  });

  // ==========================================================================
  // DELETE /api/recurring/:id/transactions/:txnId - Unlink transaction
  // ==========================================================================
  describe('DELETE /api/recurring/:id/transactions/:txnId', () => {
    it('should unlink transaction from pattern', async () => {
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00
      });

      const pattern = await createPatternViaApi({
        transaction_ids: [txnId]
      });

      const response = await request(app)
        .delete(`/api/recurring/${pattern.id}/transactions/${txnId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_recurring).toBe(0);
      expect(response.body.data.recurring_group_id).toBeNull();
    });

    it('should return 404 for non-existent transaction', async () => {
      const pattern = await createPatternViaApi();

      const response = await request(app)
        .delete(`/api/recurring/${pattern.id}/transactions/99999`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should return 400 when transaction does not belong to pattern', async () => {
      // Create pattern 1 with transaction
      const txnId = insertTestTransaction(db, {
        account_id: 1,
        transaction_date: '2025-01-01',
        description: 'TEST',
        debit_amount: 10.00
      });

      const pattern1 = await createPatternViaApi({
        description_pattern: 'PATTERN1',
        transaction_ids: [txnId]
      });

      // Create pattern 2 without transaction
      const pattern2 = await createPatternViaApi({
        description_pattern: 'PATTERN2'
      });

      // Try to unlink from wrong pattern
      const response = await request(app)
        .delete(`/api/recurring/${pattern2.id}/transactions/${txnId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('does not belong');
    });
  });
});
