/**
 * Anomaly Routes Tests
 *
 * TDD: Tests written FIRST, implementation follows.
 * Tests API endpoints for anomaly detection and management.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../index.js';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';

// Use a fixed reference date for consistency
const REFERENCE_DATE = '2025-01-20';

describe('Anomaly Routes', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db, { skipAuth: true });
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // GET /api/analytics/anomalies
  // ==========================================================================
  describe('GET /api/analytics/anomalies', () => {
    beforeEach(() => {
      // Create an anomaly
      insertTestTransaction(db, {
        description: 'NEW EXPENSIVE MERCHANT',
        debit_amount: 200,
        category_id: 11,
        transaction_date: '2025-01-15'
      });
      // Manually insert an anomaly for testing
      db.prepare(`
        INSERT INTO anomalies (transaction_id, anomaly_type, severity, description)
        VALUES (?, ?, ?, ?)
      `).run(1, 'new_merchant_large', 'low', 'Test anomaly');
    });

    it('should return list of anomalies', async () => {
      const response = await request(app)
        .get('/api/analytics/anomalies')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should exclude dismissed anomalies by default', async () => {
      // Dismiss the anomaly
      db.prepare('UPDATE anomalies SET is_dismissed = 1 WHERE id = 1').run();

      const response = await request(app)
        .get('/api/analytics/anomalies')
        .expect(200);

      expect(response.body.data.length).toBe(0);
    });

    it('should include dismissed anomalies when dismissed=true', async () => {
      db.prepare('UPDATE anomalies SET is_dismissed = 1 WHERE id = 1').run();

      const response = await request(app)
        .get('/api/analytics/anomalies?dismissed=true')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      // Insert more anomalies
      db.prepare(`
        INSERT INTO anomalies (transaction_id, anomaly_type, severity, description)
        VALUES (?, ?, ?, ?)
      `).run(1, 'potential_duplicate', 'high', 'Another anomaly');

      const response = await request(app)
        .get('/api/analytics/anomalies?limit=1')
        .expect(200);

      expect(response.body.data.length).toBe(1);
    });

    it('should return anomaly details with transaction info', async () => {
      const response = await request(app)
        .get('/api/analytics/anomalies')
        .expect(200);

      const anomaly = response.body.data[0];
      expect(anomaly).toHaveProperty('id');
      expect(anomaly).toHaveProperty('anomaly_type');
      expect(anomaly).toHaveProperty('severity');
      expect(anomaly).toHaveProperty('description');
    });
  });

  // ==========================================================================
  // GET /api/analytics/anomalies/stats
  // ==========================================================================
  describe('GET /api/analytics/anomalies/stats', () => {
    beforeEach(() => {
      // Create test anomalies
      db.prepare(`
        INSERT INTO anomalies (transaction_id, anomaly_type, severity, description)
        VALUES (?, ?, ?, ?)
      `).run(null, 'new_merchant_large', 'low', 'Test anomaly 1');
      db.prepare(`
        INSERT INTO anomalies (transaction_id, anomaly_type, severity, description)
        VALUES (?, ?, ?, ?)
      `).run(null, 'potential_duplicate', 'high', 'Test anomaly 2');
    });

    it('should return anomaly statistics', async () => {
      const response = await request(app)
        .get('/api/analytics/anomalies/stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('byType');
      expect(response.body.data).toHaveProperty('bySeverity');
      expect(response.body.data).toHaveProperty('pending');
    });

    it('should return correct counts by type', async () => {
      const response = await request(app)
        .get('/api/analytics/anomalies/stats')
        .expect(200);

      expect(response.body.data.total).toBe(2);
      expect(response.body.data.byType.new_merchant_large).toBe(1);
      expect(response.body.data.byType.potential_duplicate).toBe(1);
    });

    it('should return correct counts by severity', async () => {
      const response = await request(app)
        .get('/api/analytics/anomalies/stats')
        .expect(200);

      expect(response.body.data.bySeverity.low).toBe(1);
      expect(response.body.data.bySeverity.high).toBe(1);
    });
  });

  // ==========================================================================
  // POST /api/analytics/anomalies/detect
  // ==========================================================================
  describe('POST /api/analytics/anomalies/detect', () => {
    beforeEach(() => {
      // Create transactions that should trigger anomaly detection
      insertTestTransaction(db, {
        description: 'NEW EXPENSIVE MERCHANT',
        debit_amount: 200,
        category_id: 11,
        transaction_date: '2025-01-15'
      });
    });

    it('should run anomaly detection and return detected anomalies', async () => {
      const response = await request(app)
        .post('/api/analytics/anomalies/detect')
        .send({ days: 30, referenceDate: REFERENCE_DATE })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.anomalies)).toBe(true);
    });

    it('should insert detected anomalies into database', async () => {
      await request(app)
        .post('/api/analytics/anomalies/detect')
        .send({ days: 30, referenceDate: REFERENCE_DATE })
        .expect(200);

      const dbAnomalies = db.prepare('SELECT * FROM anomalies').all();
      expect(dbAnomalies.length).toBeGreaterThan(0);
    });

    it('should accept optional days parameter', async () => {
      const response = await request(app)
        .post('/api/analytics/anomalies/detect')
        .send({ days: 7, referenceDate: REFERENCE_DATE })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return count of detected anomalies', async () => {
      const response = await request(app)
        .post('/api/analytics/anomalies/detect')
        .send({ days: 30, referenceDate: REFERENCE_DATE })
        .expect(200);

      expect(response.body.data).toHaveProperty('count');
      expect(typeof response.body.data.count).toBe('number');
    });
  });

  // ==========================================================================
  // POST /api/analytics/anomalies/:id/dismiss
  // ==========================================================================
  describe('POST /api/analytics/anomalies/:id/dismiss', () => {
    let anomalyId;

    beforeEach(() => {
      const result = db.prepare(`
        INSERT INTO anomalies (transaction_id, anomaly_type, severity, description)
        VALUES (?, ?, ?, ?)
      `).run(null, 'new_merchant_large', 'low', 'Test anomaly');
      anomalyId = result.lastInsertRowid;
    });

    it('should dismiss an anomaly', async () => {
      const response = await request(app)
        .post(`/api/analytics/anomalies/${anomalyId}/dismiss`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.dismissed).toBe(true);

      const anomaly = db.prepare('SELECT is_dismissed FROM anomalies WHERE id = ?').get(anomalyId);
      expect(anomaly.is_dismissed).toBe(1);
    });

    it('should return 404 for non-existent anomaly', async () => {
      const response = await request(app)
        .post('/api/analytics/anomalies/99999/dismiss')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Anomaly not found');
    });

    it('should return 400 for invalid anomaly ID', async () => {
      const response = await request(app)
        .post('/api/analytics/anomalies/invalid/dismiss')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // POST /api/analytics/anomalies/:id/fraud
  // ==========================================================================
  describe('POST /api/analytics/anomalies/:id/fraud', () => {
    let anomalyId;

    beforeEach(() => {
      const result = db.prepare(`
        INSERT INTO anomalies (transaction_id, anomaly_type, severity, description)
        VALUES (?, ?, ?, ?)
      `).run(null, 'potential_duplicate', 'high', 'Suspicious transaction');
      anomalyId = result.lastInsertRowid;
    });

    it('should confirm anomaly as fraud', async () => {
      const response = await request(app)
        .post(`/api/analytics/anomalies/${anomalyId}/fraud`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.confirmedFraud).toBe(true);

      const anomaly = db.prepare('SELECT is_confirmed_fraud FROM anomalies WHERE id = ?').get(anomalyId);
      expect(anomaly.is_confirmed_fraud).toBe(1);
    });

    it('should return 404 for non-existent anomaly', async () => {
      const response = await request(app)
        .post('/api/analytics/anomalies/99999/fraud')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Anomaly not found');
    });

    it('should return 400 for invalid anomaly ID', async () => {
      const response = await request(app)
        .post('/api/analytics/anomalies/invalid/fraud')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // Integration tests
  // ==========================================================================
  describe('Integration', () => {
    it('should complete full workflow: detect, view, dismiss', async () => {
      // Create data
      insertTestTransaction(db, {
        description: 'SUSPICIOUS PAYMENT',
        debit_amount: 500,
        category_id: 11,
        transaction_date: '2025-01-15'
      });

      // Detect
      const detectResponse = await request(app)
        .post('/api/analytics/anomalies/detect')
        .send({ days: 30, referenceDate: REFERENCE_DATE })
        .expect(200);

      expect(detectResponse.body.data.count).toBeGreaterThan(0);

      // View
      const viewResponse = await request(app)
        .get('/api/analytics/anomalies')
        .expect(200);

      expect(viewResponse.body.data.length).toBeGreaterThan(0);
      const anomalyId = viewResponse.body.data[0].id;

      // Dismiss
      await request(app)
        .post(`/api/analytics/anomalies/${anomalyId}/dismiss`)
        .expect(200);

      // Verify dismissed
      const afterResponse = await request(app)
        .get('/api/analytics/anomalies')
        .expect(200);

      expect(afterResponse.body.data.length).toBe(0);
    });
  });
});
