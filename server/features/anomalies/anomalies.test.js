/**
 * Anomaly Detection Service Tests
 *
 * TDD: Tests written FIRST, implementation follows.
 * Tests anomaly detection, retrieval, dismissal, and fraud confirmation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import {
  pennyPrecision,
  detectAnomalies,
  getAnomalies,
  dismissAnomaly,
  confirmFraud,
  getAnomalyStats
} from './anomalies.service.js';

// Helper to get date strings relative to today
function getDateStr(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

// Helper to get month string (YYYY-MM) relative to today
function getMonthStr(monthsAgo = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  return date.toISOString().slice(0, 7);
}

describe('AnomaliesService', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // pennyPrecision
  // ==========================================================================
  describe('pennyPrecision', () => {
    it('should round to 2 decimal places', () => {
      expect(pennyPrecision(10.125)).toBe(10.13);
      expect(pennyPrecision(10.124)).toBe(10.12);
    });

    it('should handle whole numbers', () => {
      expect(pennyPrecision(100)).toBe(100);
    });

    it('should handle negative numbers', () => {
      expect(pennyPrecision(-10.125)).toBe(-10.12);
    });

    it('should handle floating point errors', () => {
      expect(pennyPrecision(0.1 + 0.2)).toBe(0.3);
    });
  });

  // ==========================================================================
  // detectAnomalies - unusual_amount
  // ==========================================================================
  describe('detectAnomalies - unusual_amount', () => {
    it('should detect transactions with amounts > 3 standard deviations from category average', () => {
      // Insert typical Groceries transactions (category 3)
      insertTestTransaction(db, {
        description: 'TESCO STORES 1',
        debit_amount: 50,
        category_id: 3,
        transaction_date: getDateStr(10)
      });
      insertTestTransaction(db, {
        description: 'TESCO STORES 2',
        debit_amount: 55,
        category_id: 3,
        transaction_date: getDateStr(9)
      });
      insertTestTransaction(db, {
        description: 'TESCO STORES 3',
        debit_amount: 45,
        category_id: 3,
        transaction_date: getDateStr(8)
      });
      insertTestTransaction(db, {
        description: 'TESCO STORES 4',
        debit_amount: 52,
        category_id: 3,
        transaction_date: getDateStr(7)
      });
      insertTestTransaction(db, {
        description: 'TESCO STORES 5',
        debit_amount: 48,
        category_id: 3,
        transaction_date: getDateStr(6)
      });

      // Insert an unusually large Groceries transaction (way above average)
      const unusualId = insertTestTransaction(db, {
        description: 'TESCO STORES UNUSUAL',
        debit_amount: 500, // Much higher than typical ~50
        category_id: 3,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const unusualAmount = anomalies.find(
        a => a.anomalyType === 'unusual_amount' && a.transaction.id === unusualId
      );

      expect(unusualAmount).toBeDefined();
      expect(unusualAmount.severity).toBe('medium');
      expect(unusualAmount.description).toContain('standard deviation');
    });

    it('should not flag normal transactions within expected range', () => {
      // Insert consistent transactions
      insertTestTransaction(db, {
        description: 'TESCO STORES 1',
        debit_amount: 50,
        category_id: 3,
        transaction_date: getDateStr(10)
      });
      insertTestTransaction(db, {
        description: 'TESCO STORES 2',
        debit_amount: 52,
        category_id: 3,
        transaction_date: getDateStr(9)
      });
      insertTestTransaction(db, {
        description: 'TESCO STORES 3',
        debit_amount: 48,
        category_id: 3,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const unusualAmounts = anomalies.filter(a => a.anomalyType === 'unusual_amount');

      expect(unusualAmounts.length).toBe(0);
    });
  });

  // ==========================================================================
  // detectAnomalies - new_merchant_large
  // ==========================================================================
  describe('detectAnomalies - new_merchant_large', () => {
    it('should detect first-time merchant with amount > 100', () => {
      // Insert a large transaction from a new merchant
      const newMerchantId = insertTestTransaction(db, {
        description: 'NEW STORE NEVER SEEN BEFORE',
        debit_amount: 150,
        category_id: 11,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const newMerchant = anomalies.find(
        a => a.anomalyType === 'new_merchant_large' && a.transaction.id === newMerchantId
      );

      expect(newMerchant).toBeDefined();
      expect(newMerchant.severity).toBe('low');
      expect(newMerchant.description).toContain('new merchant');
    });

    it('should not flag new merchant with amount <= 100', () => {
      insertTestTransaction(db, {
        description: 'NEW STORE SMALL AMOUNT',
        debit_amount: 50,
        category_id: 11,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const newMerchant = anomalies.filter(a => a.anomalyType === 'new_merchant_large');

      expect(newMerchant.length).toBe(0);
    });

    it('should not flag known merchant with large amount', () => {
      // Insert existing merchant pattern (before the detection window)
      insertTestTransaction(db, {
        description: 'KNOWN STORE XYZ',
        debit_amount: 25,
        category_id: 4,
        transaction_date: getDateStr(60) // 60 days ago - before detection window
      });

      // Insert another transaction from same merchant
      insertTestTransaction(db, {
        description: 'KNOWN STORE XYZ',
        debit_amount: 200,
        category_id: 4,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const newMerchant = anomalies.filter(
        a => a.anomalyType === 'new_merchant_large' &&
             a.transaction.description.includes('KNOWN STORE')
      );

      expect(newMerchant.length).toBe(0);
    });
  });

  // ==========================================================================
  // detectAnomalies - potential_duplicate
  // ==========================================================================
  describe('detectAnomalies - potential_duplicate', () => {
    it('should detect same amount, same day, same description as potential duplicate', () => {
      // Insert duplicate transactions
      const txn1 = insertTestTransaction(db, {
        description: 'AMAZON ORDER 12345',
        debit_amount: 29.99,
        category_id: 4,
        transaction_date: getDateStr(5)
      });

      const txn2 = insertTestTransaction(db, {
        description: 'AMAZON ORDER 12345',
        debit_amount: 29.99,
        category_id: 4,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const duplicates = anomalies.filter(a => a.anomalyType === 'potential_duplicate');

      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0].severity).toBe('high');
      expect(duplicates[0].description).toContain('duplicate');
    });

    it('should not flag different amounts as duplicates', () => {
      insertTestTransaction(db, {
        description: 'AMAZON ORDER',
        debit_amount: 29.99,
        category_id: 4,
        transaction_date: getDateStr(5)
      });

      insertTestTransaction(db, {
        description: 'AMAZON ORDER',
        debit_amount: 39.99,
        category_id: 4,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const duplicates = anomalies.filter(a => a.anomalyType === 'potential_duplicate');

      expect(duplicates.length).toBe(0);
    });

    it('should not flag same amount different day as duplicates', () => {
      insertTestTransaction(db, {
        description: 'AMAZON ORDER',
        debit_amount: 29.99,
        category_id: 4,
        transaction_date: getDateStr(6)
      });

      insertTestTransaction(db, {
        description: 'AMAZON ORDER',
        debit_amount: 29.99,
        category_id: 4,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const duplicates = anomalies.filter(a => a.anomalyType === 'potential_duplicate');

      expect(duplicates.length).toBe(0);
    });
  });

  // ==========================================================================
  // detectAnomalies - category_spike
  // ==========================================================================
  describe('detectAnomalies - category_spike', () => {
    it('should detect category spending 200%+ above monthly average', () => {
      // Create historical spending pattern for Entertainment (category 5)
      // Simulate 3 months of ~100/month average in previous months
      insertTestTransaction(db, {
        description: 'NETFLIX',
        debit_amount: 100,
        category_id: 5,
        transaction_date: `${getMonthStr(3)}-15`
      });
      insertTestTransaction(db, {
        description: 'SPOTIFY',
        debit_amount: 100,
        category_id: 5,
        transaction_date: `${getMonthStr(2)}-15`
      });
      insertTestTransaction(db, {
        description: 'NETFLIX',
        debit_amount: 100,
        category_id: 5,
        transaction_date: `${getMonthStr(1)}-15`
      });

      // Current month has massive spike
      insertTestTransaction(db, {
        description: 'ENTERTAINMENT BINGE',
        debit_amount: 500,
        category_id: 5,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const spike = anomalies.find(a => a.anomalyType === 'category_spike');

      expect(spike).toBeDefined();
      expect(spike.severity).toBe('medium');
      expect(spike.description).toMatch(/\d+% above/);
    });

    it('should not flag normal category spending', () => {
      // Create consistent spending pattern
      insertTestTransaction(db, {
        description: 'NETFLIX',
        debit_amount: 100,
        category_id: 5,
        transaction_date: `${getMonthStr(2)}-15`
      });
      insertTestTransaction(db, {
        description: 'SPOTIFY',
        debit_amount: 100,
        category_id: 5,
        transaction_date: `${getMonthStr(1)}-15`
      });
      insertTestTransaction(db, {
        description: 'XBOX',
        debit_amount: 110,
        category_id: 5,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });
      const spikes = anomalies.filter(a => a.anomalyType === 'category_spike');

      expect(spikes.length).toBe(0);
    });
  });

  // ==========================================================================
  // detectAnomalies - general behavior
  // ==========================================================================
  describe('detectAnomalies - general', () => {
    it('should return array of anomaly objects with required properties', () => {
      insertTestTransaction(db, {
        description: 'BRAND NEW EXPENSIVE STORE',
        debit_amount: 999,
        category_id: 11,
        transaction_date: getDateStr(5)
      });

      const anomalies = detectAnomalies(db, { days: 30 });

      expect(Array.isArray(anomalies)).toBe(true);
      if (anomalies.length > 0) {
        expect(anomalies[0]).toHaveProperty('transaction');
        expect(anomalies[0]).toHaveProperty('anomalyType');
        expect(anomalies[0]).toHaveProperty('severity');
        expect(anomalies[0]).toHaveProperty('description');
      }
    });

    it('should insert detected anomalies into anomalies table', () => {
      insertTestTransaction(db, {
        description: 'NEW EXPENSIVE MERCHANT',
        debit_amount: 200,
        category_id: 11,
        transaction_date: getDateStr(5)
      });

      detectAnomalies(db, { days: 30 });

      const dbAnomalies = db.prepare('SELECT * FROM anomalies').all();
      expect(dbAnomalies.length).toBeGreaterThan(0);
    });

    it('should not duplicate anomalies on multiple detection runs', () => {
      insertTestTransaction(db, {
        description: 'NEW EXPENSIVE MERCHANT',
        debit_amount: 200,
        category_id: 11,
        transaction_date: getDateStr(5)
      });

      detectAnomalies(db, { days: 30 });
      detectAnomalies(db, { days: 30 });

      const dbAnomalies = db.prepare('SELECT * FROM anomalies WHERE anomaly_type = ?').all('new_merchant_large');
      // Should not have duplicate entries for same transaction
      expect(dbAnomalies.length).toBe(1);
    });

    it('should respect days option for detection window', () => {
      // Old transaction outside window
      insertTestTransaction(db, {
        description: 'OLD EXPENSIVE MERCHANT',
        debit_amount: 200,
        category_id: 11,
        transaction_date: getDateStr(60) // 60 days ago - outside 30-day window
      });

      const anomalies = detectAnomalies(db, { days: 30 });

      // Should not detect old transaction
      expect(anomalies.length).toBe(0);
    });
  });

  // ==========================================================================
  // getAnomalies
  // ==========================================================================
  describe('getAnomalies', () => {
    beforeEach(() => {
      // Insert some test anomalies via detection
      insertTestTransaction(db, {
        description: 'NEW MERCHANT 1',
        debit_amount: 200,
        category_id: 11,
        transaction_date: getDateStr(5)
      });
      detectAnomalies(db, { days: 30 });
    });

    it('should return list of anomalies', () => {
      const anomalies = getAnomalies(db);

      expect(Array.isArray(anomalies)).toBe(true);
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('should exclude dismissed anomalies by default', () => {
      // Dismiss the anomaly
      const allAnomalies = db.prepare('SELECT id FROM anomalies').all();
      if (allAnomalies.length > 0) {
        db.prepare('UPDATE anomalies SET is_dismissed = 1 WHERE id = ?').run(allAnomalies[0].id);
      }

      const anomalies = getAnomalies(db);
      expect(anomalies.length).toBe(0);
    });

    it('should include dismissed anomalies when option is true', () => {
      const allAnomalies = db.prepare('SELECT id FROM anomalies').all();
      if (allAnomalies.length > 0) {
        db.prepare('UPDATE anomalies SET is_dismissed = 1 WHERE id = ?').run(allAnomalies[0].id);
      }

      const anomalies = getAnomalies(db, { dismissed: true });
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('should respect limit option', () => {
      // Insert more anomalies
      insertTestTransaction(db, {
        description: 'NEW MERCHANT 2',
        debit_amount: 300,
        category_id: 11,
        transaction_date: getDateStr(5)
      });
      insertTestTransaction(db, {
        description: 'NEW MERCHANT 3',
        debit_amount: 400,
        category_id: 11,
        transaction_date: getDateStr(5)
      });
      detectAnomalies(db, { days: 30 });

      const anomalies = getAnomalies(db, { limit: 2 });
      expect(anomalies.length).toBeLessThanOrEqual(2);
    });

    it('should include transaction details with each anomaly', () => {
      const anomalies = getAnomalies(db);

      if (anomalies.length > 0) {
        expect(anomalies[0]).toHaveProperty('transaction_id');
        expect(anomalies[0]).toHaveProperty('anomaly_type');
        expect(anomalies[0]).toHaveProperty('severity');
        expect(anomalies[0]).toHaveProperty('description');
      }
    });
  });

  // ==========================================================================
  // dismissAnomaly
  // ==========================================================================
  describe('dismissAnomaly', () => {
    let anomalyId;

    beforeEach(() => {
      insertTestTransaction(db, {
        description: 'NEW MERCHANT TEST',
        debit_amount: 200,
        category_id: 11,
        transaction_date: getDateStr(5)
      });
      detectAnomalies(db, { days: 30 });
      const anomaly = db.prepare('SELECT id FROM anomalies').get();
      anomalyId = anomaly?.id;
    });

    it('should mark anomaly as dismissed', () => {
      const result = dismissAnomaly(db, anomalyId);

      expect(result.success).toBe(true);

      const anomaly = db.prepare('SELECT is_dismissed FROM anomalies WHERE id = ?').get(anomalyId);
      expect(anomaly.is_dismissed).toBe(1);
    });

    it('should return dismissed anomaly info', () => {
      const result = dismissAnomaly(db, anomalyId);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('dismissed');
      expect(result.dismissed).toBe(true);
    });

    it('should throw error for non-existent anomaly', () => {
      expect(() => dismissAnomaly(db, 99999)).toThrow('Anomaly not found');
    });

    it('should throw error for invalid anomaly ID', () => {
      expect(() => dismissAnomaly(db, null)).toThrow();
    });
  });

  // ==========================================================================
  // confirmFraud
  // ==========================================================================
  describe('confirmFraud', () => {
    let anomalyId;

    beforeEach(() => {
      insertTestTransaction(db, {
        description: 'SUSPICIOUS MERCHANT',
        debit_amount: 500,
        category_id: 11,
        transaction_date: getDateStr(5)
      });
      detectAnomalies(db, { days: 30 });
      const anomaly = db.prepare('SELECT id FROM anomalies').get();
      anomalyId = anomaly?.id;
    });

    it('should mark anomaly as confirmed fraud', () => {
      const result = confirmFraud(db, anomalyId);

      expect(result.success).toBe(true);

      const anomaly = db.prepare('SELECT is_confirmed_fraud FROM anomalies WHERE id = ?').get(anomalyId);
      expect(anomaly.is_confirmed_fraud).toBe(1);
    });

    it('should return fraud confirmation info', () => {
      const result = confirmFraud(db, anomalyId);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('confirmedFraud');
      expect(result.confirmedFraud).toBe(true);
    });

    it('should throw error for non-existent anomaly', () => {
      expect(() => confirmFraud(db, 99999)).toThrow('Anomaly not found');
    });
  });

  // ==========================================================================
  // getAnomalyStats
  // ==========================================================================
  describe('getAnomalyStats', () => {
    beforeEach(() => {
      // Create various types of anomalies
      insertTestTransaction(db, {
        description: 'NEW MERCHANT 1',
        debit_amount: 200,
        category_id: 11,
        transaction_date: getDateStr(5)
      });
      insertTestTransaction(db, {
        description: 'NEW MERCHANT 2',
        debit_amount: 300,
        category_id: 11,
        transaction_date: getDateStr(5)
      });
      detectAnomalies(db, { days: 30 });
    });

    it('should return count by anomaly type', () => {
      const stats = getAnomalyStats(db);

      expect(stats).toHaveProperty('byType');
      expect(typeof stats.byType).toBe('object');
    });

    it('should return count by severity', () => {
      const stats = getAnomalyStats(db);

      expect(stats).toHaveProperty('bySeverity');
      expect(typeof stats.bySeverity).toBe('object');
    });

    it('should return total counts', () => {
      const stats = getAnomalyStats(db);

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('dismissed');
      expect(stats).toHaveProperty('confirmedFraud');
      expect(typeof stats.total).toBe('number');
    });

    it('should include pending (not dismissed, not fraud) count', () => {
      const stats = getAnomalyStats(db);

      expect(stats).toHaveProperty('pending');
      expect(stats.pending).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Integration tests
  // ==========================================================================
  describe('Integration', () => {
    it('should handle complete workflow: detect, view, dismiss', () => {
      // Create anomaly
      insertTestTransaction(db, {
        description: 'SUSPICIOUS ACTIVITY',
        debit_amount: 999,
        category_id: 11,
        transaction_date: getDateStr(5)
      });

      // Detect
      const detected = detectAnomalies(db, { days: 30 });
      expect(detected.length).toBeGreaterThan(0);

      // View
      const anomalies = getAnomalies(db);
      expect(anomalies.length).toBeGreaterThan(0);

      // Dismiss
      const result = dismissAnomaly(db, anomalies[0].id);
      expect(result.success).toBe(true);

      // Verify dismissed
      const remaining = getAnomalies(db);
      expect(remaining.length).toBe(0);
    });

    it('should handle complete workflow: detect, view, confirm fraud', () => {
      // Create anomaly
      insertTestTransaction(db, {
        description: 'FRAUD TRANSACTION',
        debit_amount: 1500,
        category_id: 11,
        transaction_date: getDateStr(5)
      });

      // Detect
      detectAnomalies(db, { days: 30 });

      // View and confirm
      const anomalies = getAnomalies(db);
      const result = confirmFraud(db, anomalies[0].id);
      expect(result.success).toBe(true);

      // Check stats
      const stats = getAnomalyStats(db);
      expect(stats.confirmedFraud).toBeGreaterThan(0);
    });
  });
});
