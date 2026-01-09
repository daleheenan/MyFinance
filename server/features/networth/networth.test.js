/**
 * Net Worth Service Tests (TDD)
 *
 * Tests for:
 * - getCurrentNetWorth(db) - Calculate current net worth from accounts
 * - getNetWorthHistory(db, months?) - Get historical snapshots
 * - getNetWorthBreakdown(db) - Get accounts grouped by type
 * - takeSnapshot(db) - Create a net worth snapshot
 *
 * Test Database has 4 accounts:
 * - Account 1: Main Account (debit)
 * - Account 2: Daily Spend (debit)
 * - Account 3: Theo Entertainment (debit)
 * - Account 4: Credit Card (credit)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestDb, closeTestDb } from '../../db/testDatabase.js';
import {
  getCurrentNetWorth,
  getNetWorthHistory,
  getNetWorthBreakdown,
  takeSnapshot
} from './networth.service.js';
import { createApp } from '../../index.js';

describe('NetWorthService', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // getCurrentNetWorth
  // ==========================================================================
  describe('getCurrentNetWorth', () => {
    it('should return zero net worth when all accounts have zero balance', () => {
      // Arrange: Test database starts with zero balances

      // Act
      const result = getCurrentNetWorth(db);

      // Assert
      expect(result.totalAssets).toBe(0);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(0);
    });

    it('should calculate total assets from debit accounts', () => {
      // Arrange: Set balances for debit accounts
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run(); // Main Account
      db.prepare('UPDATE accounts SET current_balance = 500 WHERE id = 2').run();  // Daily Spend
      db.prepare('UPDATE accounts SET current_balance = 250 WHERE id = 3').run();  // Theo Entertainment

      // Act
      const result = getCurrentNetWorth(db);

      // Assert
      expect(result.totalAssets).toBe(1750); // 1000 + 500 + 250
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(1750);
    });

    it('should calculate total liabilities from credit accounts (negative balance = debt)', () => {
      // Arrange: Credit card with debt (negative balance means money owed)
      db.prepare('UPDATE accounts SET current_balance = -500 WHERE id = 4').run(); // Credit Card debt

      // Act
      const result = getCurrentNetWorth(db);

      // Assert
      expect(result.totalAssets).toBe(0);
      expect(result.totalLiabilities).toBe(500); // Debt shown as positive liability
      expect(result.netWorth).toBe(-500);
    });

    it('should calculate net worth as assets minus liabilities', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 5000 WHERE id = 1').run(); // Main Account
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 2').run(); // Daily Spend
      db.prepare('UPDATE accounts SET current_balance = -2000 WHERE id = 4').run(); // Credit Card debt

      // Act
      const result = getCurrentNetWorth(db);

      // Assert
      expect(result.totalAssets).toBe(6000);     // 5000 + 1000
      expect(result.totalLiabilities).toBe(2000); // Credit card debt
      expect(result.netWorth).toBe(4000);         // 6000 - 2000
    });

    it('should handle credit card overpayment (positive balance on credit)', () => {
      // Arrange: Credit card with overpayment (positive balance)
      db.prepare('UPDATE accounts SET current_balance = 100 WHERE id = 4').run();

      // Act
      const result = getCurrentNetWorth(db);

      // Assert
      // Overpayment on credit card is technically an asset (they owe you)
      expect(result.totalAssets).toBe(100);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(100);
    });

    it('should include breakdown of all accounts', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 500 WHERE id = 2').run();
      db.prepare('UPDATE accounts SET current_balance = -300 WHERE id = 4').run();

      // Act
      const result = getCurrentNetWorth(db);

      // Assert
      expect(result.breakdown).toHaveLength(4); // All 4 accounts
      expect(result.breakdown).toContainEqual(
        expect.objectContaining({
          id: 1,
          name: 'Main Account',
          type: 'debit',
          balance: 1000
        })
      );
      expect(result.breakdown).toContainEqual(
        expect.objectContaining({
          id: 4,
          name: 'Credit Card',
          type: 'credit',
          balance: -300
        })
      );
    });

    it('should apply penny precision to all calculations', () => {
      // Arrange: Use values that would have floating point issues
      db.prepare('UPDATE accounts SET current_balance = 0.1 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 0.2 WHERE id = 2').run();
      db.prepare('UPDATE accounts SET current_balance = -0.3 WHERE id = 4').run();

      // Act
      const result = getCurrentNetWorth(db);

      // Assert: 0.1 + 0.2 = 0.3 (not 0.30000000000000004)
      expect(result.totalAssets).toBe(0.3);
      expect(result.totalLiabilities).toBe(0.3);
      expect(result.netWorth).toBe(0); // 0.3 - 0.3 = 0
    });

    it('should only include active accounts', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 500, is_active = 0 WHERE id = 2').run(); // Deactivated

      // Act
      const result = getCurrentNetWorth(db);

      // Assert
      expect(result.totalAssets).toBe(1000); // Only account 1
      expect(result.breakdown).toHaveLength(3); // 3 active accounts
    });

    it('should handle negative debit account balance', () => {
      // Arrange: Overdraft on debit account
      db.prepare('UPDATE accounts SET current_balance = -200 WHERE id = 1').run();

      // Act
      const result = getCurrentNetWorth(db);

      // Assert: Overdraft reduces assets (or counts as liability depending on business logic)
      // Based on business rules: debit accounts contribute to assets regardless of sign
      expect(result.totalAssets).toBe(-200);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(-200);
    });
  });

  // ==========================================================================
  // getNetWorthHistory
  // ==========================================================================
  describe('getNetWorthHistory', () => {
    it('should return empty array when no snapshots exist', () => {
      // Act
      const result = getNetWorthHistory(db);

      // Assert
      expect(result).toEqual([]);
    });

    it('should return snapshots ordered by date descending', () => {
      // Arrange: Insert some snapshots
      const insertSnapshot = db.prepare(`
        INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth)
        VALUES (?, ?, ?, ?)
      `);
      insertSnapshot.run('2025-01-01', 1000, 200, 800);
      insertSnapshot.run('2025-01-15', 1200, 150, 1050);
      insertSnapshot.run('2025-01-31', 1500, 100, 1400);

      // Act
      const result = getNetWorthHistory(db);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0].snapshot_date).toBe('2025-01-31'); // Most recent first
      expect(result[1].snapshot_date).toBe('2025-01-15');
      expect(result[2].snapshot_date).toBe('2025-01-01');
    });

    it('should limit results to specified number of months', () => {
      // Arrange: Insert 15 snapshots
      const insertSnapshot = db.prepare(`
        INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth)
        VALUES (?, ?, ?, ?)
      `);
      for (let i = 1; i <= 15; i++) {
        const month = String(i).padStart(2, '0');
        const date = i <= 12 ? `2024-${month}-01` : `2025-${String(i - 12).padStart(2, '0')}-01`;
        insertSnapshot.run(date, 1000 * i, 100 * i, 900 * i);
      }

      // Act: Default is 12 months
      const result = getNetWorthHistory(db);

      // Assert
      expect(result).toHaveLength(12);
    });

    it('should allow custom limit for history', () => {
      // Arrange: Insert 10 snapshots
      const insertSnapshot = db.prepare(`
        INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth)
        VALUES (?, ?, ?, ?)
      `);
      for (let i = 1; i <= 10; i++) {
        insertSnapshot.run(`2025-01-${String(i).padStart(2, '0')}`, 1000, 200, 800);
      }

      // Act
      const result = getNetWorthHistory(db, 5);

      // Assert
      expect(result).toHaveLength(5);
    });

    it('should include all snapshot fields', () => {
      // Arrange
      db.prepare(`
        INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth, account_breakdown)
        VALUES (?, ?, ?, ?, ?)
      `).run('2025-01-15', 5000, 1000, 4000, '{"accounts": []}');

      // Act
      const result = getNetWorthHistory(db, 1);

      // Assert
      expect(result[0]).toMatchObject({
        snapshot_date: '2025-01-15',
        total_assets: 5000,
        total_liabilities: 1000,
        net_worth: 4000
      });
    });
  });

  // ==========================================================================
  // getNetWorthBreakdown
  // ==========================================================================
  describe('getNetWorthBreakdown', () => {
    it('should group accounts by type', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 500 WHERE id = 2').run();
      db.prepare('UPDATE accounts SET current_balance = -300 WHERE id = 4').run();

      // Act
      const result = getNetWorthBreakdown(db);

      // Assert
      expect(result.assets).toBeDefined();
      expect(result.liabilities).toBeDefined();
      expect(result.assets.length).toBe(3); // 3 debit accounts
      expect(result.liabilities.length).toBe(1); // 1 credit account
    });

    it('should include account details in breakdown', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();

      // Act
      const result = getNetWorthBreakdown(db);

      // Assert
      const mainAccount = result.assets.find(a => a.id === 1);
      expect(mainAccount).toMatchObject({
        id: 1,
        name: 'Main Account',
        account_number: '17570762',
        balance: 1000
      });
    });

    it('should calculate totals for each group', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 500 WHERE id = 2').run();
      db.prepare('UPDATE accounts SET current_balance = 250 WHERE id = 3').run();
      db.prepare('UPDATE accounts SET current_balance = -750 WHERE id = 4').run();

      // Act
      const result = getNetWorthBreakdown(db);

      // Assert
      expect(result.totals.assets).toBe(1750);       // 1000 + 500 + 250
      expect(result.totals.liabilities).toBe(750);   // Credit card debt
      expect(result.totals.netWorth).toBe(1000);     // 1750 - 750
    });

    it('should only include active accounts', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 500, is_active = 0 WHERE id = 2').run();

      // Act
      const result = getNetWorthBreakdown(db);

      // Assert
      expect(result.assets.find(a => a.id === 2)).toBeUndefined();
      expect(result.totals.assets).toBe(1000);
    });

    it('should apply penny precision to totals', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 0.1 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 0.2 WHERE id = 2').run();

      // Act
      const result = getNetWorthBreakdown(db);

      // Assert
      expect(result.totals.assets).toBe(0.3); // Not 0.30000000000000004
    });

    it('should handle credit card with positive balance (overpayment)', () => {
      // Arrange: Overpayment appears in assets section
      db.prepare('UPDATE accounts SET current_balance = 50 WHERE id = 4').run();

      // Act
      const result = getNetWorthBreakdown(db);

      // Assert: Credit card with positive balance contributes to assets
      expect(result.totals.assets).toBe(50);
      expect(result.totals.liabilities).toBe(0);
    });
  });

  // ==========================================================================
  // takeSnapshot
  // ==========================================================================
  describe('takeSnapshot', () => {
    it('should create a snapshot with current date', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = -500 WHERE id = 4').run();

      // Act
      const result = takeSnapshot(db);

      // Assert
      const today = new Date().toISOString().slice(0, 10);
      expect(result.snapshot_date).toBe(today);
      expect(result.total_assets).toBe(1000);
      expect(result.total_liabilities).toBe(500);
      expect(result.net_worth).toBe(500);
    });

    it('should store snapshot in database', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 2000 WHERE id = 1').run();

      // Act
      takeSnapshot(db);

      // Assert
      const snapshots = db.prepare('SELECT * FROM net_worth_snapshots').all();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].total_assets).toBe(2000);
    });

    it('should replace existing snapshot for same date', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();
      takeSnapshot(db);

      // Update balance
      db.prepare('UPDATE accounts SET current_balance = 2000 WHERE id = 1').run();

      // Act: Take another snapshot (same date)
      takeSnapshot(db);

      // Assert: Only one snapshot exists with updated values
      const snapshots = db.prepare('SELECT * FROM net_worth_snapshots').all();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].total_assets).toBe(2000);
    });

    it('should include account breakdown in snapshot', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 500 WHERE id = 2').run();

      // Act
      const result = takeSnapshot(db);

      // Assert
      expect(result.account_breakdown).toBeDefined();
      const breakdown = JSON.parse(result.account_breakdown);
      expect(breakdown).toBeInstanceOf(Array);
      expect(breakdown).toContainEqual(
        expect.objectContaining({ id: 1, balance: 1000 })
      );
    });

    it('should return the created snapshot', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 3000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = -1000 WHERE id = 4').run();

      // Act
      const result = takeSnapshot(db);

      // Assert
      expect(result).toMatchObject({
        total_assets: 3000,
        total_liabilities: 1000,
        net_worth: 2000
      });
      expect(result.id).toBeDefined();
    });

    it('should apply penny precision to stored values', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 0.1 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 0.2 WHERE id = 2').run();

      // Act
      const result = takeSnapshot(db);

      // Assert
      expect(result.total_assets).toBe(0.3);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle large balances', () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000000.99 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = -500000.50 WHERE id = 4').run();

      // Act
      const result = getCurrentNetWorth(db);

      // Assert
      expect(result.totalAssets).toBe(1000000.99);
      expect(result.totalLiabilities).toBe(500000.5);
      expect(result.netWorth).toBe(500000.49);
    });

    it('should handle all accounts having zero balance', () => {
      // Act
      const netWorth = getCurrentNetWorth(db);
      const breakdown = getNetWorthBreakdown(db);

      // Assert
      expect(netWorth.netWorth).toBe(0);
      expect(breakdown.totals.netWorth).toBe(0);
    });

    it('should handle negative net worth', () => {
      // Arrange: More debt than assets
      db.prepare('UPDATE accounts SET current_balance = 500 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = -2000 WHERE id = 4').run();

      // Act
      const result = getCurrentNetWorth(db);

      // Assert
      expect(result.netWorth).toBe(-1500); // 500 - 2000
    });
  });
});

// =============================================================================
// Route Tests
// =============================================================================
describe('NetWorth Routes', () => {
  let app;
  let db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // GET /api/networth/current
  // ==========================================================================
  describe('GET /api/networth/current', () => {
    it('should return current net worth', async () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 5000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = -1000 WHERE id = 4').run();

      // Act
      const response = await request(app)
        .get('/api/networth/current')
        .expect('Content-Type', /json/)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        totalAssets: 5000,
        totalLiabilities: 1000,
        netWorth: 4000
      });
      expect(response.body.data.breakdown).toBeDefined();
    });

    it('should return proper structure with zero balances', async () => {
      // Act
      const response = await request(app)
        .get('/api/networth/current')
        .expect(200);

      // Assert
      expect(response.body.data.totalAssets).toBe(0);
      expect(response.body.data.totalLiabilities).toBe(0);
      expect(response.body.data.netWorth).toBe(0);
    });
  });

  // ==========================================================================
  // GET /api/networth/history
  // ==========================================================================
  describe('GET /api/networth/history', () => {
    it('should return empty array when no history', async () => {
      // Act
      const response = await request(app)
        .get('/api/networth/history')
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return snapshots with default limit of 12', async () => {
      // Arrange: Insert 15 snapshots
      const insertSnapshot = db.prepare(`
        INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth)
        VALUES (?, ?, ?, ?)
      `);
      for (let i = 1; i <= 15; i++) {
        insertSnapshot.run(`2025-01-${String(i).padStart(2, '0')}`, 1000 * i, 100, 900 * i);
      }

      // Act
      const response = await request(app)
        .get('/api/networth/history')
        .expect(200);

      // Assert
      expect(response.body.data).toHaveLength(12);
    });

    it('should accept months query parameter', async () => {
      // Arrange: Insert 10 snapshots
      const insertSnapshot = db.prepare(`
        INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth)
        VALUES (?, ?, ?, ?)
      `);
      for (let i = 1; i <= 10; i++) {
        insertSnapshot.run(`2025-01-${String(i).padStart(2, '0')}`, 1000, 100, 900);
      }

      // Act
      const response = await request(app)
        .get('/api/networth/history?months=5')
        .expect(200);

      // Assert
      expect(response.body.data).toHaveLength(5);
    });

    it('should return snapshots ordered by date descending', async () => {
      // Arrange
      const insertSnapshot = db.prepare(`
        INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth)
        VALUES (?, ?, ?, ?)
      `);
      insertSnapshot.run('2025-01-01', 1000, 100, 900);
      insertSnapshot.run('2025-01-15', 2000, 100, 1900);

      // Act
      const response = await request(app)
        .get('/api/networth/history')
        .expect(200);

      // Assert
      expect(response.body.data[0].snapshot_date).toBe('2025-01-15');
      expect(response.body.data[1].snapshot_date).toBe('2025-01-01');
    });
  });

  // ==========================================================================
  // GET /api/networth/breakdown
  // ==========================================================================
  describe('GET /api/networth/breakdown', () => {
    it('should return accounts grouped by type', async () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = -500 WHERE id = 4').run();

      // Act
      const response = await request(app)
        .get('/api/networth/breakdown')
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.assets).toBeDefined();
      expect(response.body.data.liabilities).toBeDefined();
      expect(response.body.data.totals).toBeDefined();
    });

    it('should include totals in response', async () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 2000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 2').run();
      db.prepare('UPDATE accounts SET current_balance = -500 WHERE id = 4').run();

      // Act
      const response = await request(app)
        .get('/api/networth/breakdown')
        .expect(200);

      // Assert
      expect(response.body.data.totals).toMatchObject({
        assets: 3000,
        liabilities: 500,
        netWorth: 2500
      });
    });
  });

  // ==========================================================================
  // POST /api/networth/snapshot
  // ==========================================================================
  describe('POST /api/networth/snapshot', () => {
    it('should create a new snapshot', async () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 5000 WHERE id = 1').run();
      db.prepare('UPDATE accounts SET current_balance = -2000 WHERE id = 4').run();

      // Act
      const response = await request(app)
        .post('/api/networth/snapshot')
        .expect(201);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.total_assets).toBe(5000);
      expect(response.body.data.total_liabilities).toBe(2000);
      expect(response.body.data.net_worth).toBe(3000);
    });

    it('should return snapshot with today date', async () => {
      // Act
      const response = await request(app)
        .post('/api/networth/snapshot')
        .expect(201);

      // Assert
      const today = new Date().toISOString().slice(0, 10);
      expect(response.body.data.snapshot_date).toBe(today);
    });

    it('should update existing snapshot for same date', async () => {
      // Arrange
      db.prepare('UPDATE accounts SET current_balance = 1000 WHERE id = 1').run();

      // First snapshot
      await request(app)
        .post('/api/networth/snapshot')
        .expect(201);

      // Update balance
      db.prepare('UPDATE accounts SET current_balance = 2000 WHERE id = 1').run();

      // Act: Second snapshot
      const response = await request(app)
        .post('/api/networth/snapshot')
        .expect(201);

      // Assert: Should have updated value
      expect(response.body.data.total_assets).toBe(2000);

      // Verify only one snapshot exists
      const snapshots = db.prepare('SELECT * FROM net_worth_snapshots').all();
      expect(snapshots).toHaveLength(1);
    });
  });
});
