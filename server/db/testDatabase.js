import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createTestDb() {
  const db = new Database(':memory:');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Run seeds
  const seeds = readFileSync(join(__dirname, 'seeds.sql'), 'utf-8');
  db.exec(seeds);

  return db;
}

export function closeTestDb(db) {
  if (db) {
    db.close();
  }
}

// Helper to insert test transactions
export function insertTestTransaction(db, overrides = {}) {
  const defaults = {
    account_id: 1,
    transaction_date: '2025-01-15',
    description: 'TEST TRANSACTION',
    original_description: 'TEST TRANSACTION',
    debit_amount: 0,
    credit_amount: 0,
    category_id: 11,  // Other
    is_transfer: 0
  };

  const data = { ...defaults, ...overrides };

  // Auto-set original_description to match description if not explicitly provided
  if (overrides.description && !overrides.original_description) {
    data.original_description = overrides.description;
  }

  const stmt = db.prepare(`
    INSERT INTO transactions
    (account_id, transaction_date, description, original_description, debit_amount, credit_amount, category_id, is_transfer)
    VALUES (@account_id, @transaction_date, @description, @original_description, @debit_amount, @credit_amount, @category_id, @is_transfer)
  `);

  const result = stmt.run(data);
  return result.lastInsertRowid;
}
