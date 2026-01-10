# FinanceFlow

A personal finance management application built with vanilla JavaScript frontend and Express.js backend. Track transactions, manage budgets, analyze spending patterns, and forecast cash flow.

## Features

- **Transaction Management**: Import CSV bank statements, categorize transactions automatically, and track spending
- **Budget Tracking**: Set monthly budgets by category with rollover support and spending alerts
- **Analytics**: Visual spending breakdowns, monthly trends, and category analysis with 12-month charts
- **Net Worth Tracking**: Monitor assets and liabilities with historical snapshots
- **Cash Flow Forecasting**: Project future cash flow based on historical patterns
- **Subscription Detection**: Automatically detect recurring payments
- **Transfer Detection**: Identify and link internal transfers between accounts
- **Dark Mode**: Automatic dark mode support via `prefers-color-scheme`
- **Mobile-First Design**: Responsive layout with bottom navigation on mobile

## Tech Stack

- **Frontend**: Vanilla JavaScript, CSS3 with CSS Custom Properties
- **Backend**: Node.js, Express.js
- **Database**: SQLite (better-sqlite3)
- **Authentication**: Session-based with bcrypt password hashing
- **Security**: Helmet.js, rate limiting, CSP headers

## Getting Started

### Prerequisites

- Node.js 18+
- npm 8+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/daleheenan/MyFinance.git
cd MyFinance/financeflow
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open http://localhost:3000 in your browser

### Initial Setup

On first run, the application will create an admin user with a randomly generated password. Check the console output for login credentials.

## Project Structure

```
financeflow/
├── public/                 # Frontend (vanilla JS)
│   ├── core/              # Core utilities (router, API, styles)
│   └── features/          # Feature modules
│       ├── overview/      # Dashboard
│       ├── transactions/  # Transaction list & import
│       ├── budgets/       # Budget management
│       ├── analytics/     # Spending analysis
│       ├── forecasting/   # Cash flow projections
│       ├── subscriptions/ # Recurring payment tracking
│       ├── networth/      # Net worth tracking
│       ├── settings/      # Account & category settings
│       └── auth/          # Login page
├── server/
│   ├── core/              # Core utilities (database, security, middleware)
│   ├── db/                # Schema and seeds
│   └── features/          # Feature modules with routes and services
├── tests/                 # Test fixtures
└── package.json
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout and invalidate session
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/change-password` - Change password

### Accounts
- `GET /api/accounts` - List all accounts
- `GET /api/accounts/:id` - Get account details
- `GET /api/accounts/overview/summary` - Dashboard summary
- `GET /api/accounts/overview/balance-trend` - Balance history chart data

### Transactions
- `GET /api/transactions` - List transactions (with filters)
- `GET /api/transactions/:id` - Get transaction details
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

### Import
- `POST /api/import/preview` - Preview CSV before import
- `POST /api/import` - Import CSV transactions
- `GET /api/import/batches` - Import history

### Budgets
- `GET /api/budgets` - Get budgets for current month
- `POST /api/budgets` - Create/update budget
- `DELETE /api/budgets/:id` - Delete budget
- `GET /api/budgets/summary` - Monthly budget summary

### Analytics
- `GET /api/analytics/spending` - Spending by category
- `GET /api/analytics/trends` - Monthly trends
- `GET /api/analytics/monthly-breakdown` - 12-month chart data
- `GET /api/analytics/running-balance` - Daily balance history

### Categories
- `GET /api/categories` - List categories
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Category Rules
- `GET /api/category-rules` - List auto-categorization rules
- `POST /api/category-rules` - Create rule
- `PUT /api/category-rules/:id` - Update rule
- `DELETE /api/category-rules/:id` - Delete rule

### Net Worth
- `GET /api/networth` - Current net worth with breakdown
- `GET /api/networth/history` - Historical snapshots
- `POST /api/networth/snapshot` - Create snapshot

### Forecasting
- `GET /api/forecasting` - Cash flow projection

### Subscriptions
- `GET /api/subscriptions` - List detected subscriptions
- `GET /api/subscriptions/upcoming` - Upcoming payments

## Security Features

- **Password Complexity**: Minimum 8 characters with uppercase, lowercase, and number
- **Session Management**: Sessions invalidated on password change
- **Rate Limiting**: Strict limits on login attempts (5 per 15 minutes)
- **Content Security Policy**: XSS protection via CSP headers
- **CORS**: Restricted to allowed origins in production
- **File Upload Validation**: CSV files only with MIME type checking

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment (production/development) | development |
| `DATABASE_PATH` | SQLite database location | ./data/financeflow.db |

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

## Keyboard Shortcuts

- `Ctrl+1` - Go to Overview
- `Ctrl+2` - Go to Transactions
- `Ctrl+3` - Go to Budgets
- `Ctrl+4` - Go to Analytics
- `Ctrl+5` - Go to Settings

## License

Private - All rights reserved

## Author

Dale Heenan
