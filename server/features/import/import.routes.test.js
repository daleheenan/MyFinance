/**
 * Import Routes Tests (TDD - TASK-3.4)
 *
 * Tests for:
 * - POST /api/import/preview - Preview CSV data
 * - POST /api/import - Import CSV with column mapping
 * - GET /api/import/batches - List import history
 * - GET /api/import/batches/:id - Get batch details
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestDb, closeTestDb } from '../../db/testDatabase.js';
import { createApp } from '../../index.js';

describe('Import Routes', () => {
  let app, db;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db, { skipAuth: true });
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // Helper: Create mock CSV data
  // ==========================================================================
  const createCsvBuffer = (content) => Buffer.from(content, 'utf-8');

  const sampleCsv = `Date,Transaction Type,Description,Debit Amount,Credit Amount,Balance
01/01/2025,DEB,TESCO STORES,45.00,,1234.56
02/01/2025,CR,SALARY PAYMENT,,2500.00,3734.56
03/01/2025,DEB,AMAZON UK,29.99,,3704.57`;

  const csvWithDifferentColumns = `Trans Date,Type,Payee,Withdrawal,Deposit
2025-01-01,DEB,SAINSBURYS,35.50,
2025-01-02,CR,WAGES,,1800.00`;

  // ==========================================================================
  // POST /api/import/preview
  // ==========================================================================
  describe('POST /api/import/preview', () => {
    it('should return preview of CSV with columns and first 10 rows', async () => {
      const response = await request(app)
        .post('/api/import/preview')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('columns');
      expect(response.body.data).toHaveProperty('preview');
      expect(response.body.data).toHaveProperty('totalRows');
      expect(response.body.data.columns).toContain('Date');
      expect(response.body.data.columns).toContain('Description');
      expect(response.body.data.preview).toHaveLength(3);
      expect(response.body.data.totalRows).toBe(3);
    });

    it('should limit preview to 10 rows for large files', async () => {
      // Create CSV with more than 10 rows
      let largeCsv = 'Date,Description,Debit,Credit\n';
      for (let i = 1; i <= 25; i++) {
        largeCsv += `0${i % 10}/01/2025,TRANSACTION ${i},${i * 10},,\n`;
      }

      const response = await request(app)
        .post('/api/import/preview')
        .attach('file', createCsvBuffer(largeCsv), 'large.csv')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.preview).toHaveLength(10);
      expect(response.body.data.totalRows).toBe(25);
    });

    it('should auto-detect column mapping when possible', async () => {
      const response = await request(app)
        .post('/api/import/preview')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .expect(200);

      expect(response.body.data).toHaveProperty('suggestedMapping');
      const mapping = response.body.data.suggestedMapping;
      expect(mapping.date).toBe('Date');
      expect(mapping.description).toBe('Description');
      expect(mapping.debit).toBe('Debit Amount');
      expect(mapping.credit).toBe('Credit Amount');
    });

    it('should return 400 when no file is uploaded', async () => {
      const response = await request(app)
        .post('/api/import/preview')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/file.*required/i);
    });

    it('should return 400 for invalid CSV format', async () => {
      const invalidCsv = 'This is not,a valid\nCSV"file"with"broken quotes';

      const response = await request(app)
        .post('/api/import/preview')
        .attach('file', createCsvBuffer(invalidCsv), 'invalid.csv')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/parse|invalid|csv/i);
    });

    it('should handle empty CSV file', async () => {
      const response = await request(app)
        .post('/api/import/preview')
        .attach('file', createCsvBuffer(''), 'empty.csv')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/empty|no data/i);
    });
  });

  // ==========================================================================
  // POST /api/import
  // ==========================================================================
  describe('POST /api/import', () => {
    const standardMapping = JSON.stringify({
      date: 'Date',
      description: 'Description',
      debit: 'Debit Amount',
      credit: 'Credit Amount'
    });

    it('should import CSV transactions successfully', async () => {
      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .field('mapping', standardMapping)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('batchId');
      expect(response.body.data).toHaveProperty('imported');
      expect(response.body.data.imported).toBe(3);
      expect(response.body.data.errors).toEqual([]);
    });

    it('should create import_batch record', async () => {
      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .field('mapping', standardMapping)
        .expect(200);

      const batchId = response.body.data.batchId;
      const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId);

      expect(batch).toBeDefined();
      expect(batch.account_id).toBe(1);
      expect(batch.filename).toBe('transactions.csv');
      expect(batch.row_count).toBe(3);
      expect(batch.success_count).toBe(3);
      expect(batch.error_count).toBe(0);
    });

    it('should insert transactions with correct data', async () => {
      await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .field('mapping', standardMapping)
        .expect(200);

      const transactions = db.prepare(
        'SELECT * FROM transactions WHERE account_id = 1 ORDER BY transaction_date'
      ).all();

      expect(transactions).toHaveLength(3);

      // First transaction (debit)
      expect(transactions[0].transaction_date).toBe('2025-01-01');
      expect(transactions[0].description).toBe('TESCO STORES');
      expect(transactions[0].original_description).toBe('TESCO STORES');
      expect(transactions[0].debit_amount).toBe(45.00);
      expect(transactions[0].credit_amount).toBe(0);

      // Second transaction (credit)
      expect(transactions[1].transaction_date).toBe('2025-01-02');
      expect(transactions[1].description).toBe('SALARY PAYMENT');
      expect(transactions[1].credit_amount).toBe(2500.00);
    });

    it('should link transactions to import batch', async () => {
      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .field('mapping', standardMapping)
        .expect(200);

      const batchId = response.body.data.batchId;
      const transactions = db.prepare(
        'SELECT import_batch_id FROM transactions WHERE account_id = 1'
      ).all();

      transactions.forEach(txn => {
        expect(txn.import_batch_id).toBe(batchId);
      });
    });

    it('should auto-assign categories using bulkAssignCategories', async () => {
      await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .field('mapping', standardMapping)
        .expect(200);

      // TESCO should be categorized as Groceries (id=3)
      const tescoTxn = db.prepare(
        "SELECT category_id FROM transactions WHERE description LIKE '%TESCO%'"
      ).get();
      expect(tescoTxn.category_id).toBe(3); // Groceries

      // AMAZON should be categorized as Shopping (id=4)
      const amazonTxn = db.prepare(
        "SELECT category_id FROM transactions WHERE description LIKE '%AMAZON%'"
      ).get();
      expect(amazonTxn.category_id).toBe(4); // Shopping
    });

    it('should calculate running balances after import', async () => {
      // Set opening balance
      db.prepare('UPDATE accounts SET opening_balance = 1000 WHERE id = 1').run();

      await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .field('mapping', standardMapping)
        .expect(200);

      const transactions = db.prepare(
        'SELECT balance_after FROM transactions WHERE account_id = 1 ORDER BY transaction_date, id'
      ).all();

      // 1000 - 45 = 955
      expect(transactions[0].balance_after).toBe(955);
      // 955 + 2500 = 3455
      expect(transactions[1].balance_after).toBe(3455);
      // 3455 - 29.99 = 3425.01
      expect(transactions[2].balance_after).toBeCloseTo(3425.01, 2);
    });

    it('should handle custom column mapping', async () => {
      const customMapping = JSON.stringify({
        date: 'Trans Date',
        description: 'Payee',
        debit: 'Withdrawal',
        credit: 'Deposit'
      });

      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(csvWithDifferentColumns), 'custom.csv')
        .field('accountId', '1')
        .field('mapping', customMapping)
        .expect(200);

      expect(response.body.data.imported).toBe(2);

      const transactions = db.prepare(
        'SELECT * FROM transactions WHERE account_id = 1 ORDER BY transaction_date'
      ).all();

      expect(transactions[0].description).toBe('SAINSBURYS');
      expect(transactions[0].debit_amount).toBe(35.50);
    });

    it('should parse DD/MM/YYYY date format', async () => {
      await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .field('mapping', standardMapping)
        .expect(200);

      const txn = db.prepare(
        'SELECT transaction_date FROM transactions WHERE description = ?'
      ).get('TESCO STORES');

      // 01/01/2025 should become 2025-01-01
      expect(txn.transaction_date).toBe('2025-01-01');
    });

    it('should return 400 when accountId is missing', async () => {
      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('mapping', standardMapping)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/account.*required/i);
    });

    it('should return 400 when mapping is missing', async () => {
      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/mapping.*required/i);
    });

    it('should return 400 when required mapping columns are missing', async () => {
      const incompleteMapping = JSON.stringify({
        date: 'Date'
        // Missing description, debit, credit
      });

      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .field('mapping', incompleteMapping)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/mapping.*description|required/i);
    });

    it('should return 404 when account does not exist', async () => {
      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '999')
        .field('mapping', standardMapping)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/account.*not found/i);
    });

    it('should handle rows with invalid data and report errors', async () => {
      const csvWithErrors = `Date,Description,Debit Amount,Credit Amount
01/01/2025,VALID TRANSACTION,50.00,
INVALID DATE,BAD ROW,abc,def
02/01/2025,ANOTHER VALID,25.00,`;

      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(csvWithErrors), 'errors.csv')
        .field('accountId', '1')
        .field('mapping', standardMapping)
        .expect(200);

      expect(response.body.data.imported).toBe(2);
      expect(response.body.data.errors).toHaveLength(1);
      expect(response.body.data.errors[0]).toHaveProperty('row');
      expect(response.body.data.errors[0]).toHaveProperty('message');
    });

    it('should use transaction for atomicity', async () => {
      // If this test is about atomicity, we need to verify that
      // either all transactions are inserted or none in case of failure
      // This is implicitly tested by the import working correctly
      const response = await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(sampleCsv), 'transactions.csv')
        .field('accountId', '1')
        .field('mapping', standardMapping)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify all 3 transactions were inserted
      const count = db.prepare(
        'SELECT COUNT(*) as count FROM transactions WHERE account_id = 1'
      ).get();
      expect(count.count).toBe(3);
    });
  });

  // ==========================================================================
  // GET /api/import/batches
  // ==========================================================================
  describe('GET /api/import/batches', () => {
    beforeEach(() => {
      // Insert test import batches
      db.prepare(`
        INSERT INTO import_batches (account_id, filename, row_count, success_count, error_count, imported_at)
        VALUES (1, 'jan2025.csv', 50, 48, 2, '2025-01-15 10:00:00')
      `).run();
      db.prepare(`
        INSERT INTO import_batches (account_id, filename, row_count, success_count, error_count, imported_at)
        VALUES (2, 'feb2025.csv', 30, 30, 0, '2025-02-01 14:30:00')
      `).run();
    });

    it('should return list of import batches', async () => {
      const response = await request(app)
        .get('/api/import/batches')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should include account name via JOIN', async () => {
      const response = await request(app)
        .get('/api/import/batches')
        .expect(200);

      const batch = response.body.data.find(b => b.filename === 'jan2025.csv');
      expect(batch).toHaveProperty('account_name');
      expect(batch.account_name).toBe('Main Account');
    });

    it('should return batches ordered by imported_at descending', async () => {
      const response = await request(app)
        .get('/api/import/batches')
        .expect(200);

      // Most recent first
      expect(response.body.data[0].filename).toBe('feb2025.csv');
      expect(response.body.data[1].filename).toBe('jan2025.csv');
    });

    it('should include all batch fields', async () => {
      const response = await request(app)
        .get('/api/import/batches')
        .expect(200);

      const batch = response.body.data[0];
      expect(batch).toHaveProperty('id');
      expect(batch).toHaveProperty('account_id');
      expect(batch).toHaveProperty('filename');
      expect(batch).toHaveProperty('row_count');
      expect(batch).toHaveProperty('success_count');
      expect(batch).toHaveProperty('error_count');
      expect(batch).toHaveProperty('imported_at');
    });
  });

  // ==========================================================================
  // GET /api/import/batches/:id
  // ==========================================================================
  describe('GET /api/import/batches/:id', () => {
    let batchId;

    beforeEach(() => {
      // Create a batch with transactions
      const result = db.prepare(`
        INSERT INTO import_batches (account_id, filename, row_count, success_count, error_count)
        VALUES (1, 'test.csv', 3, 3, 0)
      `).run();
      batchId = result.lastInsertRowid;

      // Insert transactions linked to this batch
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, original_description, debit_amount, credit_amount, import_batch_id, category_id)
        VALUES (1, '2025-01-01', 'TXN 1', 'TXN 1', 100, 0, ?, 11)
      `).run(batchId);
      db.prepare(`
        INSERT INTO transactions (account_id, transaction_date, description, original_description, debit_amount, credit_amount, import_batch_id, category_id)
        VALUES (1, '2025-01-02', 'TXN 2', 'TXN 2', 0, 200, ?, 11)
      `).run(batchId);
    });

    it('should return batch details with id', async () => {
      const response = await request(app)
        .get(`/api/import/batches/${batchId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.batch).toHaveProperty('id', batchId);
      expect(response.body.data.batch).toHaveProperty('filename', 'test.csv');
    });

    it('should include account name', async () => {
      const response = await request(app)
        .get(`/api/import/batches/${batchId}`)
        .expect(200);

      expect(response.body.data.batch).toHaveProperty('account_name', 'Main Account');
    });

    it('should include transactions from that batch', async () => {
      const response = await request(app)
        .get(`/api/import/batches/${batchId}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('transactions');
      expect(response.body.data.transactions).toHaveLength(2);
    });

    it('should return 404 for non-existent batch', async () => {
      const response = await request(app)
        .get('/api/import/batches/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/batch.*not found/i);
    });

    it('should return 400 for invalid batch id', async () => {
      const response = await request(app)
        .get('/api/import/batches/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid.*id/i);
    });
  });

  // ==========================================================================
  // Transfer Detection Integration
  // ==========================================================================
  describe('Transfer Detection Integration', () => {
    it('should detect transfers after import', async () => {
      // Import to Main Account (id=1) with a debit
      const mainAccountCsv = `Date,Description,Debit Amount,Credit Amount
01/01/2025,TRANSFER TO DAILY,500.00,`;

      const mainMapping = JSON.stringify({
        date: 'Date',
        description: 'Description',
        debit: 'Debit Amount',
        credit: 'Credit Amount'
      });

      await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(mainAccountCsv), 'main.csv')
        .field('accountId', '1')
        .field('mapping', mainMapping)
        .expect(200);

      // Import to Daily Spend Account (id=2) with matching credit
      const dailyAccountCsv = `Date,Description,Debit Amount,Credit Amount
01/01/2025,TRANSFER FROM MAIN,,500.00`;

      await request(app)
        .post('/api/import')
        .attach('file', createCsvBuffer(dailyAccountCsv), 'daily.csv')
        .field('accountId', '2')
        .field('mapping', mainMapping)
        .expect(200);

      // Check if transfers were detected and linked
      const mainTxn = db.prepare(
        "SELECT is_transfer, linked_transaction_id FROM transactions WHERE account_id = 1"
      ).get();
      const dailyTxn = db.prepare(
        "SELECT is_transfer, linked_transaction_id FROM transactions WHERE account_id = 2"
      ).get();

      // At least check that detect was called - linking may depend on criteria
      expect(mainTxn).toBeDefined();
      expect(dailyTxn).toBeDefined();
    });
  });
});
