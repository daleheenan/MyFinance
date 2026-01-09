import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Database Schema', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);
  });

  afterEach(() => {
    db.close();
  });

  describe('Tables', () => {
    it('should create accounts table', () => {
      const info = db.prepare("PRAGMA table_info(accounts)").all();
      const columns = info.map(c => c.name);

      expect(columns).toContain('id');
      expect(columns).toContain('account_number');
      expect(columns).toContain('account_name');
      expect(columns).toContain('account_type');
      expect(columns).toContain('opening_balance');
      expect(columns).toContain('current_balance');
    });

    it('should create categories table', () => {
      const info = db.prepare("PRAGMA table_info(categories)").all();
      const columns = info.map(c => c.name);

      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('type');
      expect(columns).toContain('colour');
      expect(columns).toContain('icon');
    });

    it('should create transactions table', () => {
      const info = db.prepare("PRAGMA table_info(transactions)").all();
      const columns = info.map(c => c.name);

      expect(columns).toContain('id');
      expect(columns).toContain('account_id');
      expect(columns).toContain('transaction_date');
      expect(columns).toContain('description');
      expect(columns).toContain('debit_amount');
      expect(columns).toContain('credit_amount');
      expect(columns).toContain('balance_after');
      expect(columns).toContain('category_id');
      expect(columns).toContain('is_transfer');
      expect(columns).toContain('linked_transaction_id');
    });

    it('should create all required tables', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all().map(t => t.name);

      // Core tables
      expect(tables).toContain('accounts');
      expect(tables).toContain('categories');
      expect(tables).toContain('transactions');
      expect(tables).toContain('category_rules');
      expect(tables).toContain('budgets');
      expect(tables).toContain('recurring_patterns');
      expect(tables).toContain('import_batches');
      expect(tables).toContain('settings');
      // Advanced feature tables
      expect(tables).toContain('merchants');
      expect(tables).toContain('subscriptions');
      expect(tables).toContain('net_worth_snapshots');
      expect(tables).toContain('anomalies');
      expect(tables).toHaveLength(12);
    });
  });

  describe('Foreign Keys', () => {
    it('should enforce foreign key on transactions.account_id', () => {
      db.pragma('foreign_keys = ON');

      expect(() => {
        db.prepare(`
          INSERT INTO transactions (account_id, transaction_date, description, debit_amount)
          VALUES (999, '2025-01-01', 'Test', 100)
        `).run();
      }).toThrow();
    });

    it('should allow valid foreign key references', () => {
      db.pragma('foreign_keys = ON');

      // Insert valid account first
      db.prepare(`
        INSERT INTO accounts (account_number, account_name)
        VALUES ('12345', 'Test Account')
      `).run();

      // Insert valid category
      db.prepare(`
        INSERT INTO categories (name, type, colour)
        VALUES ('Test', 'expense', '#000000')
      `).run();

      // Should not throw
      expect(() => {
        db.prepare(`
          INSERT INTO transactions (account_id, transaction_date, description, debit_amount, category_id)
          VALUES (1, '2025-01-01', 'Test', 100, 1)
        `).run();
      }).not.toThrow();
    });
  });

  describe('Indexes', () => {
    it('should create index on transactions(account_id, transaction_date)', () => {
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='transactions'
      `).all().map(i => i.name);

      expect(indexes).toContain('idx_transactions_account_date');
    });

    it('should create index on transactions(category_id)', () => {
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='transactions'
      `).all().map(i => i.name);

      expect(indexes).toContain('idx_transactions_category');
    });
  });

  describe('Constraints', () => {
    it('should enforce unique account_number', () => {
      db.prepare(`
        INSERT INTO accounts (account_number, account_name) VALUES ('123', 'Test 1')
      `).run();

      expect(() => {
        db.prepare(`
          INSERT INTO accounts (account_number, account_name) VALUES ('123', 'Test 2')
        `).run();
      }).toThrow();
    });

    it('should enforce category type constraint', () => {
      expect(() => {
        db.prepare(`
          INSERT INTO categories (name, type, colour) VALUES ('Bad', 'invalid', '#000')
        `).run();
      }).toThrow();
    });

    it('should enforce account_type constraint', () => {
      expect(() => {
        db.prepare(`
          INSERT INTO accounts (account_number, account_name, account_type)
          VALUES ('999', 'Bad', 'invalid')
        `).run();
      }).toThrow();
    });
  });
});
