import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;

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

  // Run schema
  const schemaPath = join(__dirname, '../db/schema.sql');
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  // Run seeds
  const seedsPath = join(__dirname, '../db/seeds.sql');
  if (existsSync(seedsPath)) {
    const seeds = readFileSync(seedsPath, 'utf-8');
    db.exec(seeds);
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
