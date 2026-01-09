-- MyFinance Database Schema
-- SQLite3 database for household finance management

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- ============================================================================
-- ACCOUNTS
-- Stores bank accounts with balances
-- ============================================================================
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sort_code TEXT,
    opening_balance DECIMAL(12,2) DEFAULT 0,
    current_balance DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CATEGORIES
-- Transaction categories for income, expenses, and transfers
-- ============================================================================
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    type TEXT CHECK(type IN ('income', 'expense', 'neutral')) NOT NULL,
    color TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CATEGORY RULES
-- Pattern-matching rules for auto-categorization
-- ============================================================================
CREATE TABLE category_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- ============================================================================
-- TRANSACTIONS
-- All financial transactions imported from CSV
-- ============================================================================
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    transaction_date DATE NOT NULL,
    description TEXT NOT NULL,
    original_description TEXT,
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2),
    category_id INTEGER,
    transaction_type TEXT,
    is_transfer BOOLEAN DEFAULT 0,
    linked_transaction_id INTEGER,
    upload_batch_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (linked_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

-- ============================================================================
-- BUDGETS
-- Monthly budget allocations per category
-- ============================================================================
CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    month TEXT NOT NULL,  -- YYYY-MM format
    amount DECIMAL(12,2) NOT NULL,
    rollover_amount DECIMAL(12,2) DEFAULT 0,  -- Budget rollover from previous month
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, month),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- ============================================================================
-- REGULAR PAYMENTS
-- Detected recurring transactions (subscriptions, bills)
-- ============================================================================
CREATE TABLE regular_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    typical_amount DECIMAL(12,2),
    frequency TEXT CHECK(frequency IN ('weekly', 'monthly', 'quarterly', 'annual')),
    category_id INTEGER,
    account_id INTEGER,
    last_seen DATE,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- ============================================================================
-- UPLOAD BATCHES
-- Track CSV import batches for undo capability
-- ============================================================================
CREATE TABLE upload_batches (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    filename TEXT,
    transaction_count INTEGER,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- ============================================================================
-- SAVINGS GOALS
-- Track progress toward savings targets
-- ============================================================================
CREATE TABLE savings_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_amount DECIMAL(12,2) NOT NULL,
    current_amount DECIMAL(12,2) DEFAULT 0,
    target_date DATE,
    color TEXT,
    icon TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MANUAL ACCOUNTS
-- For net worth tracking (assets/liabilities not imported via CSV)
-- ============================================================================
CREATE TABLE manual_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    account_type TEXT CHECK(account_type IN ('asset', 'liability')) NOT NULL,
    current_value DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- Performance optimization for common queries
-- ============================================================================
CREATE INDEX idx_transactions_account_date ON transactions(account_id, transaction_date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_batch ON transactions(upload_batch_id);
CREATE INDEX idx_budgets_month ON budgets(month);
CREATE INDEX idx_category_rules_priority ON category_rules(priority DESC);
CREATE INDEX idx_regular_payments_active ON regular_payments(is_active);
