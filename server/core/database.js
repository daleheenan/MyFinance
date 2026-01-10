import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Run database migrations for schema updates.
 * Safely adds columns that may not exist in older databases.
 * @param {Database} database - The database instance
 */
function runMigrations(database) {
  // Migration 1: Add subscriptions.type column
  const subscriptionsTableCheck = database.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions'
  `).get();

  if (subscriptionsTableCheck) {
    const subColumns = database.prepare(`PRAGMA table_info(subscriptions)`).all();
    const hasTypeColumn = subColumns.some(col => col.name === 'type');

    if (!hasTypeColumn) {
      database.exec(`ALTER TABLE subscriptions ADD COLUMN type TEXT DEFAULT 'expense'`);
    }
  }

  // Migration 2: Add transactions.sequence column for same-date ordering
  const transactionsTableCheck = database.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'
  `).get();

  if (transactionsTableCheck) {
    const txnColumns = database.prepare(`PRAGMA table_info(transactions)`).all();
    const hasSequenceColumn = txnColumns.some(col => col.name === 'sequence');

    if (!hasSequenceColumn) {
      database.exec(`ALTER TABLE transactions ADD COLUMN sequence INTEGER DEFAULT 0`);
    }
  }
}

export function initDb(dbPath) {
  const path = dbPath || process.env.DATABASE_PATH || './data/financeflow.db';

  // Ensure directory exists
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(path);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run migrations FIRST for existing databases (before schema runs indexes)
  // This ensures columns exist before indexes reference them
  runMigrations(db);

  // Run schema
  const schemaPath = join(__dirname, '../db/schema.sql');
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  // Run seeds only in development (not in production)
  // Production databases should be set up manually or via migration scripts
  if (process.env.NODE_ENV !== 'production') {
    const seedsPath = join(__dirname, '../db/seeds.sql');
    if (existsSync(seedsPath)) {
      const seeds = readFileSync(seedsPath, 'utf-8');
      db.exec(seeds);
    }
  }

  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// Allow setting db externally (for testing)
export function setDb(database) {
  db = database;
}
