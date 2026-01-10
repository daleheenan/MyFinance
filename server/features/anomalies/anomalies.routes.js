/**
 * Anomaly Detection Routes
 *
 * API endpoints for anomaly detection and management:
 * - GET  /api/analytics/anomalies        - List detected anomalies
 * - GET  /api/analytics/anomalies/stats  - Anomaly statistics
 * - POST /api/analytics/anomalies/detect - Run anomaly detection
 * - POST /api/analytics/anomalies/:id/dismiss - Dismiss an anomaly
 * - POST /api/analytics/anomalies/:id/fraud   - Confirm as fraud
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import {
  detectAnomalies,
  getAnomalies,
  dismissAnomaly,
  confirmFraud,
  getAnomalyStats
} from './anomalies.service.js';

const router = Router();

// ==========================================================================
// GET /api/analytics/anomalies
// ==========================================================================
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { dismissed = 'false', limit = '50' } = req.query;

    const anomalies = getAnomalies(db, {
      dismissed: dismissed === 'true',
      limit: parseInt(limit, 10) || 50,
      userId
    });

    res.json({
      success: true,
      data: anomalies
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/analytics/anomalies/stats
// ==========================================================================
router.get('/stats', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const stats = getAnomalyStats(db, userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/analytics/anomalies/detect
// ==========================================================================
router.post('/detect', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const { days = 30, referenceDate } = req.body;

    const anomalies = detectAnomalies(db, {
      days: parseInt(days, 10) || 30,
      referenceDate: referenceDate || null,
      userId
    });

    res.json({
      success: true,
      data: {
        count: anomalies.length,
        anomalies
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/analytics/anomalies/:id/dismiss
// ==========================================================================
router.post('/:id/dismiss', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid anomaly ID'
      });
    }

    const result = dismissAnomaly(db, id, userId);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.message === 'Anomaly not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
});

// ==========================================================================
// POST /api/analytics/anomalies/:id/fraud
// ==========================================================================
router.post('/:id/fraud', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid anomaly ID'
      });
    }

    const result = confirmFraud(db, id, userId);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.message === 'Anomaly not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
});

export default router;
