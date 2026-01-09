-- MyFinance Seed Data
-- Default accounts, categories, and categorization rules

-- ============================================================================
-- DEFAULT ACCOUNTS
-- ============================================================================
INSERT INTO accounts (account_number, name, sort_code, opening_balance, current_balance) VALUES
    ('17570762', 'Main Account', NULL, 0, 0),
    ('00393366', 'Daily Spend', NULL, 0, 0);

-- ============================================================================
-- DEFAULT CATEGORIES
-- ============================================================================

-- Income Categories
INSERT INTO categories (name, type, color, icon, sort_order) VALUES
    ('Salary', 'income', '#34C759', 'briefcase', 1),
    ('Investment Income', 'income', '#30D158', 'chart-line', 2),
    ('Refunds', 'income', '#32D74B', 'arrow-rotate-left', 3),
    ('Other Income', 'income', '#28CD41', 'plus-circle', 4);

-- Expense Categories
INSERT INTO categories (name, type, color, icon, sort_order) VALUES
    ('Groceries', 'expense', '#FF9500', 'shopping-cart', 10),
    ('Dining Out', 'expense', '#FF9F0A', 'utensils', 11),
    ('Transport', 'expense', '#FF6B00', 'car', 12),
    ('Utilities', 'expense', '#FFD60A', 'bolt', 13),
    ('Entertainment', 'expense', '#FF375F', 'film', 14),
    ('Shopping', 'expense', '#FF2D55', 'bag-shopping', 15),
    ('Health', 'expense', '#FF453A', 'heart-pulse', 16),
    ('Subscriptions', 'expense', '#BF5AF2', 'repeat', 17),
    ('Home', 'expense', '#AC8E68', 'house', 18),
    ('Personal Care', 'expense', '#FF6482', 'spa', 19),
    ('Travel', 'expense', '#64D2FF', 'plane', 20),
    ('Education', 'expense', '#5E5CE6', 'graduation-cap', 21),
    ('Gifts', 'expense', '#FF6B6B', 'gift', 22),
    ('Cash Withdrawal', 'expense', '#8E8E93', 'money-bill', 23),
    ('Fees & Charges', 'expense', '#636366', 'receipt', 24),
    ('Other Expenses', 'expense', '#AEAEB2', 'ellipsis', 25);

-- Neutral Categories
INSERT INTO categories (name, type, color, icon, sort_order) VALUES
    ('Transfer', 'neutral', '#007AFF', 'arrow-right-arrow-left', 30),
    ('Savings', 'neutral', '#5856D6', 'piggy-bank', 31),
    ('Other', 'neutral', '#8E8E93', 'question', 99);

-- ============================================================================
-- DEFAULT CATEGORIZATION RULES
-- Pattern uses SQL LIKE syntax: % matches any characters
-- Higher priority values are checked first
-- ============================================================================

-- Salary patterns (priority 100)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%SALARY%', (SELECT id FROM categories WHERE name = 'Salary'), 100),
    ('%PAYROLL%', (SELECT id FROM categories WHERE name = 'Salary'), 100),
    ('%WAGES%', (SELECT id FROM categories WHERE name = 'Salary'), 100);

-- Transfer patterns (priority 90)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%TRANSFER%', (SELECT id FROM categories WHERE name = 'Transfer'), 90),
    ('%TFR%', (SELECT id FROM categories WHERE name = 'Transfer'), 90);

-- Groceries patterns (priority 80)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%TESCO%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%SAINSBURY%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%ASDA%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%ALDI%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%LIDL%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%MORRISONS%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%WAITROSE%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%CO-OP%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%COOP%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%M&S FOOD%', (SELECT id FROM categories WHERE name = 'Groceries'), 80),
    ('%OCADO%', (SELECT id FROM categories WHERE name = 'Groceries'), 80);

-- Dining Out patterns (priority 80)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%MCDONALDS%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%MCDONALD%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%NANDOS%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%PRET%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%GREGGS%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%STARBUCKS%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%COSTA%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%DELIVEROO%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%UBER EATS%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%JUST EAT%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%JUSTEAT%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%KFC%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%PIZZA%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%RESTAURANT%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80),
    ('%CAFE%', (SELECT id FROM categories WHERE name = 'Dining Out'), 80);

-- Transport patterns (priority 80)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%TFL%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%TRANSPORT FOR LONDON%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%UBER%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%BOLT%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%TRAINLINE%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%NATIONAL RAIL%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%FUEL%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%PETROL%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%SHELL%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%BP%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%ESSO%', (SELECT id FROM categories WHERE name = 'Transport'), 80),
    ('%PARKING%', (SELECT id FROM categories WHERE name = 'Transport'), 80);

-- Utilities patterns (priority 80)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%ELECTRIC%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%GAS%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%WATER%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%BRITISH GAS%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%EDF%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%OCTOPUS ENERGY%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%OVO ENERGY%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%THAMES WATER%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%COUNCIL TAX%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%TV LICENCE%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%BT%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%VIRGIN MEDIA%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%SKY%', (SELECT id FROM categories WHERE name = 'Utilities'), 80),
    ('%BROADBAND%', (SELECT id FROM categories WHERE name = 'Utilities'), 80);

-- Subscriptions patterns (priority 80)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%NETFLIX%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%SPOTIFY%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%AMAZON PRIME%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%DISNEY%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%APPLE%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%GOOGLE%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%YOUTUBE%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%GYM%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%PUREGYM%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%THE GYM%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80),
    ('%MEMBERSHIP%', (SELECT id FROM categories WHERE name = 'Subscriptions'), 80);

-- Shopping patterns (priority 70)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%AMAZON%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%EBAY%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%ARGOS%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%JOHN LEWIS%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%NEXT%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%PRIMARK%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%H&M%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%ZARA%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%IKEA%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%CURRYS%', (SELECT id FROM categories WHERE name = 'Shopping'), 70),
    ('%B&Q%', (SELECT id FROM categories WHERE name = 'Shopping'), 70);

-- Health patterns (priority 80)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%PHARMACY%', (SELECT id FROM categories WHERE name = 'Health'), 80),
    ('%BOOTS%', (SELECT id FROM categories WHERE name = 'Health'), 80),
    ('%SUPERDRUG%', (SELECT id FROM categories WHERE name = 'Health'), 80),
    ('%NHS%', (SELECT id FROM categories WHERE name = 'Health'), 80),
    ('%DENTIST%', (SELECT id FROM categories WHERE name = 'Health'), 80),
    ('%DOCTOR%', (SELECT id FROM categories WHERE name = 'Health'), 80),
    ('%OPTICIAN%', (SELECT id FROM categories WHERE name = 'Health'), 80),
    ('%SPECSAVERS%', (SELECT id FROM categories WHERE name = 'Health'), 80);

-- Entertainment patterns (priority 70)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%CINEMA%', (SELECT id FROM categories WHERE name = 'Entertainment'), 70),
    ('%ODEON%', (SELECT id FROM categories WHERE name = 'Entertainment'), 70),
    ('%VUE%', (SELECT id FROM categories WHERE name = 'Entertainment'), 70),
    ('%CINEWORLD%', (SELECT id FROM categories WHERE name = 'Entertainment'), 70),
    ('%THEATRE%', (SELECT id FROM categories WHERE name = 'Entertainment'), 70),
    ('%TICKETMASTER%', (SELECT id FROM categories WHERE name = 'Entertainment'), 70),
    ('%PUB%', (SELECT id FROM categories WHERE name = 'Entertainment'), 70);

-- Cash patterns (priority 80)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%ATM%', (SELECT id FROM categories WHERE name = 'Cash Withdrawal'), 80),
    ('%CASH%', (SELECT id FROM categories WHERE name = 'Cash Withdrawal'), 80),
    ('%WITHDRAWAL%', (SELECT id FROM categories WHERE name = 'Cash Withdrawal'), 80);

-- Refunds patterns (priority 85)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%REFUND%', (SELECT id FROM categories WHERE name = 'Refunds'), 85),
    ('%REVERSAL%', (SELECT id FROM categories WHERE name = 'Refunds'), 85),
    ('%CASHBACK%', (SELECT id FROM categories WHERE name = 'Refunds'), 85);

-- Fees patterns (priority 80)
INSERT INTO category_rules (pattern, category_id, priority) VALUES
    ('%FEE%', (SELECT id FROM categories WHERE name = 'Fees & Charges'), 80),
    ('%CHARGE%', (SELECT id FROM categories WHERE name = 'Fees & Charges'), 80),
    ('%OVERDRAFT%', (SELECT id FROM categories WHERE name = 'Fees & Charges'), 80),
    ('%INTEREST%', (SELECT id FROM categories WHERE name = 'Fees & Charges'), 80);
