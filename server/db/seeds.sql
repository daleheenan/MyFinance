-- FinanceFlow Seed Data
-- 4 Accounts, 11 Categories, Category Rules

-- Accounts (4)
INSERT OR IGNORE INTO accounts (account_number, account_name, sort_code, account_type, opening_balance) VALUES
('17570762', 'Main Account', '12-34-56', 'debit', 0),
('00393366', 'Daily Spend', '12-34-56', 'debit', 0),
('55128841', 'Theo Entertainment', '12-34-56', 'debit', 0),
('4521XXXXXXXX', 'Credit Card', NULL, 'credit', 0);

-- Categories (11)
INSERT OR IGNORE INTO categories (name, type, colour, icon, is_default, sort_order) VALUES
('Salary', 'income', '#34c759', '💰', 1, 1),
('Bills', 'expense', '#ff3b30', '📄', 1, 2),
('Groceries', 'expense', '#007aff', '🛒', 1, 3),
('Shopping', 'expense', '#ff9500', '🛍️', 1, 4),
('Entertainment', 'expense', '#af52de', '🎬', 1, 5),
('Transport', 'expense', '#5ac8fa', '🚗', 1, 6),
('Dining', 'expense', '#ff2d55', '🍽️', 1, 7),
('Healthcare', 'expense', '#32ade6', '⚕️', 1, 8),
('Utilities', 'expense', '#ff6482', '💡', 1, 9),
('Transfer', 'neutral', '#8e8e93', '↔️', 1, 10),
('Other', 'neutral', '#636366', '📌', 1, 11);

-- Category Rules
INSERT OR IGNORE INTO category_rules (pattern, category_id, priority) VALUES
('TESCO', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('SAINSBURY', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('ASDA', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('MORRISONS', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('LIDL', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('ALDI', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('AMAZON', (SELECT id FROM categories WHERE name = 'Shopping'), 10),
('UBER', (SELECT id FROM categories WHERE name = 'Transport'), 10),
('TRAINLINE', (SELECT id FROM categories WHERE name = 'Transport'), 10),
('NETFLIX', (SELECT id FROM categories WHERE name = 'Entertainment'), 10),
('SPOTIFY', (SELECT id FROM categories WHERE name = 'Entertainment'), 10),
('PLAYSTATION', (SELECT id FROM categories WHERE name = 'Entertainment'), 10),
('XBOX', (SELECT id FROM categories WHERE name = 'Entertainment'), 10),
('COSTA', (SELECT id FROM categories WHERE name = 'Dining'), 10),
('STARBUCKS', (SELECT id FROM categories WHERE name = 'Dining'), 10),
('PRET', (SELECT id FROM categories WHERE name = 'Dining'), 10),
('RESTAURANT', (SELECT id FROM categories WHERE name = 'Dining'), 5),
('CAFE', (SELECT id FROM categories WHERE name = 'Dining'), 5),
('COFFEE', (SELECT id FROM categories WHERE name = 'Dining'), 5);
