import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Helper to add a column if it doesn't exist
 */
function addColumnIfNotExists(database, table, column, definition) {
  try {
    const tableCheck = database.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=?
    `).get(table);

    if (tableCheck) {
      const columns = database.prepare(`PRAGMA table_info(${table})`).all();
      const hasColumn = columns.some(col => col.name === column);

      if (!hasColumn) {
        console.log(`Migration: Adding column ${column} to ${table}`);
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error(`Migration error adding ${column} to ${table}:`, err.message);
    throw err;
  }
}

/**
 * Run database migrations for schema updates.
 * Safely adds columns that may not exist in older databases.
 * @param {Database} database - The database instance
 */
function runMigrations(database) {
  // Migration 1: Add subscriptions.type column
  addColumnIfNotExists(database, 'subscriptions', 'type', "TEXT DEFAULT 'expense'");

  // Migration 2: Add transactions.sequence column for same-date ordering
  addColumnIfNotExists(database, 'transactions', 'sequence', 'INTEGER DEFAULT 0');

  // Migration 3: Add user_id columns to all user-owned tables for multi-tenant support
  // All existing data gets assigned to user_id = 1 (the first/admin user)
  addColumnIfNotExists(database, 'accounts', 'user_id', 'INTEGER NOT NULL DEFAULT 1');

  // Migration 4: Add email column to users table for password reset
  // Note: SQLite cannot add UNIQUE column via ALTER TABLE, so we add column first, then create unique index
  const emailAdded = addColumnIfNotExists(database, 'users', 'email', 'TEXT');
  if (emailAdded) {
    // Create unique index on email column (only if we just added it)
    try {
      database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    } catch (e) {
      // Index may already exist from schema.sql, ignore error
    }
  }
  addColumnIfNotExists(database, 'categories', 'user_id', 'INTEGER');
  addColumnIfNotExists(database, 'category_rules', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfNotExists(database, 'budgets', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfNotExists(database, 'recurring_patterns', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfNotExists(database, 'settings', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfNotExists(database, 'merchants', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfNotExists(database, 'subscriptions', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfNotExists(database, 'net_worth_snapshots', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfNotExists(database, 'anomalies', 'user_id', 'INTEGER NOT NULL DEFAULT 1');
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

  // IMPORTANT: Disable foreign keys during schema/migration to avoid constraint errors
  // when tables reference user_id = 1 but no user exists yet (fresh database)
  db.pragma('foreign_keys = OFF');

  // Run migrations FIRST for existing databases (before schema runs indexes)
  // This ensures columns exist before indexes reference them
  runMigrations(db);

  // Run schema
  const schemaPath = join(__dirname, '../db/schema.sql');
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  // Check if we have orphaned data referencing user_id = 1 but no user exists
  // This can happen when migrating an existing database to multi-user
  const hasOrphanedData = db.prepare(`
    SELECT 1 FROM accounts WHERE user_id = 1 LIMIT 1
  `).get();
  const userExists = db.prepare(`
    SELECT 1 FROM users WHERE id = 1 LIMIT 1
  `).get();

  if (hasOrphanedData && !userExists) {
    // Clear orphaned data - user will need to set up fresh
    console.log('Clearing orphaned data from previous installation...');
    db.exec(`
      DELETE FROM transactions;
      DELETE FROM accounts;
      DELETE FROM category_rules;
      DELETE FROM budgets;
      DELETE FROM recurring_patterns;
      DELETE FROM settings;
      DELETE FROM merchants;
      DELETE FROM subscriptions;
      DELETE FROM net_worth_snapshots;
      DELETE FROM anomalies;
      DELETE FROM sessions;
      DELETE FROM login_attempts;
    `);
  }

  // Now enable foreign keys for runtime operations
  db.pragma('foreign_keys = ON');

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
