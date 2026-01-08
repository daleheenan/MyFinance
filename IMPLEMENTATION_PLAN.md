# MyFinance - Implementation Plan

## Executive Summary
A professional-grade household finance management application with SQLite backend, modular frontend architecture, and Apple-inspired clean UI.

---

## 1. Technology Stack

### Backend
- **Language**: Python 3.x with Flask
- **Database**: SQLite3
- **API**: RESTful JSON API
- **Server**: Flask development server (upgradeable to Gunicorn)

### Frontend
- **Structure**: Multi-page application with shared components
- **Styling**: Vanilla CSS with CSS custom properties (variables)
- **Scripts**: Modular ES6 JavaScript modules
- **Charts**: Pure SVG (no external libraries)

### Why This Stack?
- Python/Flask: Simple, readable, excellent SQLite support
- Modular JS: Maintainable, cacheable, separation of concerns
- Pure SVG: No dependencies, full control, lightweight

---

## 2. Project Structure

```
/MyFinance
├── backend/
│   ├── app.py                 # Flask application entry point
│   ├── config.py              # Configuration settings
│   ├── database/
│   │   ├── schema.sql         # Database schema
│   │   ├── seed.sql           # Default data (accounts, categories, rules)
│   │   └── db.py              # Database connection utilities
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── accounts.py        # Account endpoints
│   │   ├── transactions.py    # Transaction endpoints
│   │   ├── categories.py      # Category endpoints
│   │   ├── budgets.py         # Budget endpoints
│   │   ├── analytics.py       # Analytics endpoints
│   │   ├── forecast.py        # Forecast endpoints
│   │   └── upload.py          # CSV upload endpoint
│   ├── services/
│   │   ├── __init__.py
│   │   ├── csv_parser.py      # CSV parsing & auto-detection
│   │   ├── categorizer.py     # Auto-categorization engine
│   │   ├── transfer_detector.py # Transfer linking logic
│   │   ├── balance_calculator.py # Running balance calculations
│   │   ├── analytics_engine.py  # Analytics computations
│   │   ├── forecast_engine.py   # Forecasting algorithms
│   │   └── subscription_detector.py # Recurring payment detection
│   └── utils/
│       ├── __init__.py
│       └── helpers.py         # Utility functions
│
├── frontend/
│   ├── index.html             # Landing/redirect to overview
│   ├── pages/
│   │   ├── overview.html      # Page 1: Dashboard overview
│   │   ├── transactions.html  # Page 2: Transaction list
│   │   ├── analysis.html      # Page 3: Analytics & charts
│   │   ├── budget.html        # Page 4: Budget management
│   │   ├── forecast.html      # Page 5: Forecasting
│   │   ├── settings.html      # Page 6: Settings & upload
│   │   ├── subscriptions.html # Page 7: Subscription management
│   │   └── advanced.html      # Page 8: Advanced analytics (Phase 2)
│   ├── css/
│   │   ├── variables.css      # CSS custom properties
│   │   ├── base.css           # Reset & base styles
│   │   ├── layout.css         # Grid & layout
│   │   ├── components.css     # Reusable components
│   │   ├── cards.css          # Card styles
│   │   ├── forms.css          # Form elements
│   │   ├── tables.css         # Table styles
│   │   └── charts.css         # SVG chart styles
│   ├── js/
│   │   ├── core/
│   │   │   ├── api.js         # API client
│   │   │   ├── state.js       # Global state management
│   │   │   ├── router.js      # Page navigation
│   │   │   └── utils.js       # Helper utilities
│   │   ├── components/
│   │   │   ├── navigation.js  # Side navigation
│   │   │   ├── cards.js       # Summary cards
│   │   │   ├── tables.js      # Data tables
│   │   │   ├── modals.js      # Modal dialogs
│   │   │   ├── filters.js     # Filter components
│   │   │   └── alerts.js      # Alert/notification system
│   │   ├── charts/
│   │   │   ├── svg-base.js    # SVG chart utilities
│   │   │   ├── line-chart.js  # Line chart component
│   │   │   ├── pie-chart.js   # Pie/donut chart
│   │   │   ├── bar-chart.js   # Bar chart
│   │   │   └── progress-bar.js # Progress bars
│   │   └── pages/
│   │       ├── overview.js    # Overview page logic
│   │       ├── transactions.js # Transactions page logic
│   │       ├── analysis.js    # Analysis page logic
│   │       ├── budget.js      # Budget page logic
│   │       ├── forecast.js    # Forecast page logic
│   │       ├── settings.js    # Settings page logic
│   │       └── subscriptions.js # Subscriptions page logic
│   └── assets/
│       └── icons/             # SVG icons
│
├── data/
│   └── finance.db             # SQLite database file
│
├── scripts/
│   ├── setup.sh               # Initial setup script
│   └── start.sh               # Start application
│
└── README.md
```

---

## 3. Database Schema

### Tables

#### accounts
```sql
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
```

#### categories
```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    type TEXT CHECK(type IN ('income', 'expense', 'neutral')) NOT NULL,
    color TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### category_rules
```sql
CREATE TABLE category_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

#### transactions
```sql
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
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (linked_transaction_id) REFERENCES transactions(id)
);
```

#### budgets
```sql
CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    month TEXT NOT NULL,  -- YYYY-MM format
    amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, month),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

#### regular_payments
```sql
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
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

#### upload_batches
```sql
CREATE TABLE upload_batches (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    filename TEXT,
    transaction_count INTEGER,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

### Indexes
```sql
CREATE INDEX idx_transactions_account_date ON transactions(account_id, transaction_date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_budgets_month ON budgets(month);
```

---

## 4. API Endpoints

### Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/accounts | List all accounts with balances |
| GET | /api/accounts/:id | Get single account |
| PUT | /api/accounts/:id | Update account (name, opening balance) |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/transactions | List with filters (account, category, date range, search) |
| GET | /api/transactions/:id | Get single transaction |
| PUT | /api/transactions/:id | Update transaction (description, category) |
| DELETE | /api/transactions/:id | Delete transaction |
| POST | /api/transactions/bulk-update | Bulk category update |
| POST | /api/upload | CSV file upload |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/categories | List all categories |
| POST | /api/categories | Create category |
| PUT | /api/categories/:id | Update category |
| DELETE | /api/categories/:id | Delete category |
| GET | /api/category-rules | List categorization rules |
| POST | /api/category-rules | Create rule |
| DELETE | /api/category-rules/:id | Delete rule |

### Budgets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/budgets | Get budgets for month |
| POST | /api/budgets | Create/update budget |
| GET | /api/budgets/status | Budget vs actual spending |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/analytics/summary | Overview summary (income, expenses, balance) |
| GET | /api/analytics/monthly | Monthly breakdown |
| GET | /api/analytics/categories | Spending by category |
| GET | /api/analytics/merchants | Top merchants analysis |
| GET | /api/analytics/trends | Trend data (moving averages, YoY) |
| GET | /api/analytics/regular-payments | Detected recurring payments |

### Forecast
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/forecast | 12-month projection |
| GET | /api/forecast/pace | Current month pace analysis |

### Subscriptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/subscriptions | Detected subscriptions |
| PUT | /api/subscriptions/:id | Update subscription status |

---

## 5. Implementation Phases

### Phase 1: Foundation (Core Infrastructure)

#### 1.1 Database Setup
- [ ] Create SQLite schema
- [ ] Seed default accounts (Main: 17570762, Daily Spend: 00393366)
- [ ] Seed default categories with colors and icons
- [ ] Seed default categorization rules

#### 1.2 Backend Core
- [ ] Flask application structure
- [ ] Database connection utilities
- [ ] Base route handlers
- [ ] Error handling middleware

#### 1.3 Frontend Foundation
- [ ] CSS variables and base styles
- [ ] Navigation component
- [ ] Page templates
- [ ] API client module

### Phase 2: CSV Upload & Transactions

#### 2.1 CSV Parser Service
- [ ] Auto-detect CSV format (Main vs Daily Spend)
- [ ] Parse Main Account format: `Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance`
- [ ] Parse Daily Spend format: `Date,Description,Money in,Money out,Balance`
- [ ] Date parsing (handle UK formats: DD/MM/YYYY)
- [ ] Amount normalization (debit negative, credit positive)

#### 2.2 Upload Endpoint
- [ ] File upload handling
- [ ] Duplicate detection (by date, amount, description)
- [ ] Batch tracking for undo capability
- [ ] Return upload summary

#### 2.3 Auto-Categorization
- [ ] Pattern matching engine (SQL LIKE patterns)
- [ ] Apply rules on import
- [ ] Default to "Other" for unmatched

#### 2.4 Running Balance Calculator
- [ ] Calculate balance_after for each transaction
- [ ] Derive opening balance from first transaction
- [ ] Update account current_balance
- [ ] Ensure penny-accuracy with DECIMAL handling

### Phase 3: Transfer Detection

#### 3.1 Transfer Detector Service
- [ ] Identify potential transfers (same amount, opposite sign)
- [ ] Match within configurable date window (±3 days)
- [ ] Link transactions bidirectionally
- [ ] Auto-categorize as "Transfer"

#### 3.2 Income Calculation Rules
- [ ] Exclude internal transfers from income totals
- [ ] Handle Daily Spend transfers correctly
- [ ] Provide clear audit trail

### Phase 4: Dashboard Pages

#### 4.1 Overview Page (Page 1)
- [ ] Summary cards: Income, Expenses, Net Balance
- [ ] Both accounts at-a-glance (no scrolling)
- [ ] YTD vs previous year comparison table
- [ ] Quick metrics: savings rate, budget health

#### 4.2 Transactions Page (Page 2)
- [ ] Paginated transaction table
- [ ] Running balance column
- [ ] Inline editing (description, category)
- [ ] Filters: account, category, date range, amount
- [ ] Search functionality
- [ ] Bulk category update

#### 4.3 Analysis Page (Page 3)
- [ ] Monthly trends line chart (SVG)
- [ ] Spending by category pie chart (SVG)
- [ ] Top 25 merchants card with account filter
- [ ] Click category → filter transactions

#### 4.4 Budget Page (Page 4)
- [ ] Category budget setup
- [ ] Progress bars (green/yellow/red thresholds)
- [ ] Spent vs remaining display
- [ ] Alert indicators at 80%, 90%, 100%

#### 4.5 Forecast Page (Page 5)
- [ ] 12-month projection chart
- [ ] Regular payments incorporation
- [ ] Linear and weighted projections
- [ ] Spend pace analysis (daily rate, on/off pace)

#### 4.6 Settings Page (Page 6)
- [ ] CSV upload interface
- [ ] Account management (edit opening balance)
- [ ] Category management (add/edit/delete)
- [ ] Rule management (add/edit/delete)

### Phase 5: Analytics Engine

#### 5.1 Monthly Analytics
- [ ] Monthly income/expense totals
- [ ] Category breakdowns per month
- [ ] Moving averages (3/6/12 month)

#### 5.2 Trend Analysis
- [ ] Month-over-month comparison
- [ ] Year-over-year trends
- [ ] Quarterly summaries
- [ ] Seasonal pattern detection

#### 5.3 Merchant Analysis
- [ ] Top merchants by spend
- [ ] Average transaction size
- [ ] Transaction frequency
- [ ] Day-of-week patterns

#### 5.4 Regular Payment Detection
- [ ] Identify recurring transactions
- [ ] Group by description similarity
- [ ] Determine frequency (weekly/monthly/annual)
- [ ] Track last seen date

### Phase 6: SVG Charts

#### 6.1 Chart Base
- [ ] SVG viewBox and responsive scaling
- [ ] Axis drawing utilities
- [ ] Grid lines
- [ ] Tooltip system

#### 6.2 Line Chart
- [ ] Multi-series support (income/expense)
- [ ] Smooth curves or straight lines
- [ ] Data point markers
- [ ] Legend component

#### 6.3 Pie/Donut Chart
- [ ] Segment calculation
- [ ] Interactive hover states
- [ ] Click-through functionality
- [ ] Percentage labels

#### 6.4 Progress Bars
- [ ] Percentage fill
- [ ] Color-coded thresholds
- [ ] Animated transitions
- [ ] Label positioning

### Phase 7: Subscriptions (Page 7)

#### 7.1 Subscription Detection
- [ ] Identify recurring same-amount transactions
- [ ] Group by merchant/description
- [ ] Calculate monthly/annual cost

#### 7.2 Subscription Management UI
- [ ] List detected subscriptions
- [ ] Mark as cancelled
- [ ] Track savings from cancellations

### Phase 8: Advanced Analytics Placeholder (Page 8)

#### 8.1 Placeholder Page
- [ ] "Coming Soon" UI
- [ ] Feature preview descriptions
- [ ] Phase 2 roadmap display

---

## 6. Key Algorithms

### 6.1 Running Balance Calculation
```python
def calculate_running_balances(account_id):
    # Get all transactions ordered by date, then by id for same-day ordering
    transactions = get_transactions_ordered(account_id)

    # Start from opening balance
    running_balance = get_opening_balance(account_id)

    for txn in transactions:
        running_balance += txn.amount  # amount is +ve for credit, -ve for debit
        txn.balance_after = running_balance

    # Update current_balance on account
    update_account_balance(account_id, running_balance)
```

### 6.2 Transfer Detection
```python
def detect_transfers(transactions):
    # Group by absolute amount
    by_amount = group_by_abs_amount(transactions)

    for amount, txns in by_amount.items():
        # Look for opposite pairs within date window
        for t1 in txns:
            for t2 in txns:
                if (t1.account_id != t2.account_id and
                    t1.amount == -t2.amount and
                    abs(t1.date - t2.date) <= 3 days):
                    link_as_transfer(t1, t2)
```

### 6.3 Auto-Categorization
```python
def categorize_transaction(description):
    rules = get_rules_ordered_by_priority()

    for rule in rules:
        # Convert SQL LIKE pattern to regex
        pattern = rule.pattern.replace('%', '.*')
        if re.search(pattern, description, re.IGNORECASE):
            return rule.category_id

    return get_category_id('Other')
```

### 6.4 Forecast Projection
```python
def generate_forecast(months=12):
    # Get historical monthly data
    history = get_monthly_totals(past_months=24)

    # Calculate weighted average (recent months weighted higher)
    avg_income = weighted_average(history.income, decay=0.9)
    avg_expense = weighted_average(history.expense, decay=0.9)

    # Apply seasonal adjustments
    seasonal = calculate_seasonal_factors(history)

    # Generate projections
    projections = []
    for month in next_12_months():
        projected_income = avg_income * seasonal[month.month]
        projected_expense = avg_expense * seasonal[month.month]
        projections.append({
            'month': month,
            'income': projected_income,
            'expense': projected_expense,
            'confidence': calculate_confidence(history)
        })

    return projections
```

---

## 7. UI Component Specifications

### 7.1 Navigation
- Collapsible side navigation
- Icons + labels when expanded
- Icons only when collapsed
- 300ms transition animation
- Active page highlighting

### 7.2 Summary Cards
- Rounded corners (12px)
- Subtle shadow
- Icon + title header
- Large value display
- Trend indicator (up/down arrow with percentage)

### 7.3 Data Tables
- Alternating row colors
- Sticky header
- Sortable columns
- Inline edit on click
- Pagination controls

### 7.4 Progress Bars
- Height: 8px
- Border radius: 4px
- Background: #e5e5ea
- Fill colors by threshold
- Label above or beside

### 7.5 Modal Dialogs
- Centered overlay
- Max-width: 500px
- Header with close button
- Body with form/content
- Footer with action buttons

---

## 8. Error Handling Strategy

### Backend
- All endpoints return consistent JSON structure
- Error responses: `{error: string, code: number, details?: object}`
- Database transactions for atomic operations
- Validation before processing

### Frontend
- Global error handler
- Toast notifications for user feedback
- Form validation with inline messages
- Loading states for async operations
- Graceful degradation

---

## 9. Testing Strategy

### Backend Tests
- Unit tests for services (parser, categorizer, etc.)
- Integration tests for API endpoints
- Balance calculation accuracy tests

### Frontend Tests
- Component rendering tests
- User interaction tests
- API integration tests

---

## 10. Acceptance Criteria Checklist

- [ ] Running balances accurate to penny from opening balance
- [ ] User can edit opening balance
- [ ] Transfer detection working both directions
- [ ] All 8 pages functional and navigable
- [ ] Inline transaction editing operational
- [ ] Monthly trends displayed as line chart
- [ ] Category click-through filters transactions
- [ ] Budget progress bars with color-coded alerts
- [ ] 12-month forecast generating from historical data
- [ ] CSV import working for both account formats
- [ ] Pure SVG charts (no external libraries)
- [ ] Sub-second response for 1000+ transactions
- [ ] No browser refresh errors

---

## 11. Implementation Order

1. **Database & Backend Foundation** → Schema, Flask app, basic routes
2. **CSV Upload** → Parser, upload endpoint, auto-categorization
3. **Running Balances** → Balance calculator, transfer detector
4. **Transactions Page** → List, filters, inline editing
5. **Overview Page** → Summary cards, account overview
6. **SVG Charts** → Line chart, pie chart, progress bars
7. **Analysis Page** → Monthly trends, category breakdown, merchants
8. **Budget Page** → Budget CRUD, progress visualization
9. **Forecast Page** → Projection engine, pace analysis
10. **Settings Page** → Upload UI, config management
11. **Subscriptions Page** → Detection, management UI
12. **Advanced Analytics** → Placeholder page
13. **Polish** → Error handling, loading states, animations

---

## Questions for Clarification

1. **Daily Spend CSV format**: You mentioned both formats but the Daily Spend format shown is `Date,Description,Money in,Money out,Balance`. Is this correct?

2. **Opening balance editing**: Should changes to opening balance recalculate all running balances?

3. **Transfer date window**: Is ±3 days acceptable for matching transfers?

4. **Budget periods**: Monthly budgets only, or support for custom periods?

5. **Data retention**: Any requirements for archiving old data?

---

*Ready for your approval to begin implementation.*
