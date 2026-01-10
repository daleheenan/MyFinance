-- FinanceFlow Database Schema
-- 8 tables with foreign keys, indexes, and constraints

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT NOT NULL UNIQUE,
    account_name TEXT NOT NULL,
    sort_code TEXT,
    account_type TEXT DEFAULT 'debit' CHECK(account_type IN ('debit', 'credit')),
    opening_balance REAL DEFAULT 0,
    current_balance REAL DEFAULT 0,
    credit_limit REAL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'neutral')),
    colour TEXT NOT NULL,
    icon TEXT,
    parent_group TEXT,
    is_default INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Import batches table (must be created before transactions for FK)
CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    row_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    transaction_date TEXT NOT NULL,
    transaction_type TEXT,
    description TEXT NOT NULL,
    original_description TEXT,
    debit_amount REAL DEFAULT 0,
    credit_amount REAL DEFAULT 0,
    balance_after REAL,
    category_id INTEGER,
    is_transfer INTEGER DEFAULT 0,
    linked_transaction_id INTEGER,
    is_recurring INTEGER DEFAULT 0,
    recurring_group_id INTEGER,
    import_batch_id INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (linked_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (import_batch_id) REFERENCES import_batches(id)
);

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_description ON transactions(description);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);

-- Category rules table
CREATE TABLE IF NOT EXISTS category_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    budgeted_amount REAL NOT NULL,
    rollover_amount REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    UNIQUE(category_id, month)
);

CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);

-- Recurring patterns table
CREATE TABLE IF NOT EXISTS recurring_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description_pattern TEXT NOT NULL,
    merchant_name TEXT,
    typical_amount REAL,
    typical_day INTEGER,
    frequency TEXT CHECK(frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
    category_id INTEGER,
    last_seen TEXT,
    is_subscription INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== ADVANCED FEATURES TABLES =====

-- Merchants table
CREATE TABLE IF NOT EXISTS merchants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_pattern TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    category_id INTEGER,
    logo_url TEXT,
    is_subscription INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_merchants_pattern ON merchants(raw_pattern);

-- Subscriptions table (supports both recurring expenses and recurring income)
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_pattern TEXT NOT NULL,
    display_name TEXT NOT NULL,
    category_id INTEGER,
    expected_amount REAL,
    frequency TEXT CHECK(frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
    billing_day INTEGER,
    next_expected_date TEXT,
    last_charged_date TEXT,
    type TEXT DEFAULT 'expense' CHECK(type IN ('expense', 'income')),
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_type ON subscriptions(type);

-- Migration: Add type column to existing subscriptions table if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a workaround
-- This will silently fail if the column already exists (which is fine)

-- Net worth snapshots table
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT UNIQUE NOT NULL,
    total_assets REAL NOT NULL DEFAULT 0,
    total_liabilities REAL NOT NULL DEFAULT 0,
    net_worth REAL NOT NULL DEFAULT 0,
    account_breakdown TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_net_worth_date ON net_worth_snapshots(snapshot_date);

-- Anomalies log table
CREATE TABLE IF NOT EXISTS anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER,
    anomaly_type TEXT NOT NULL,
    severity TEXT CHECK(severity IN ('low', 'medium', 'high')),
    description TEXT,
    is_dismissed INTEGER DEFAULT 0,
    is_confirmed_fraud INTEGER DEFAULT 0,
    detected_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_anomalies_dismissed ON anomalies(is_dismissed);
CREATE INDEX IF NOT EXISTS idx_anomalies_type ON anomalies(anomaly_type);

-- ===== AUTHENTICATION TABLES =====

-- Users table (single user system, but extensible)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT,
    failed_login_count INTEGER DEFAULT 0,
    locked_until TEXT
);

-- Sessions table for session-based authentication
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    last_activity TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Login attempts logging for security auditing
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    username_attempted TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    success INTEGER NOT NULL,
    failure_reason TEXT,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_timestamp ON login_attempts(timestamp);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username_attempted);
