# FinanceFlow

A comprehensive personal finance management application built with vanilla JavaScript and Node.js. Track transactions, manage budgets, analyze spending patterns, and forecast your financial future.

## Features

### Core Functionality
- **Multi-Account Management** - Track checking, savings, and credit card accounts with real-time balance updates
- **Transaction Tracking** - Import from CSV bank statements or manually add transactions
- **Smart Categorization** - Automatic categorization with customizable pattern-matching rules
- **Budget Management** - Set monthly budgets by category with rollover support and overspend alerts
- **Transfer Detection** - Automatically link transfers between accounts to avoid double-counting

### Analytics & Insights
- **Spending Analytics** - Visual breakdown by category, merchant, and time period with interactive charts
- **Trend Analysis** - Track spending patterns over 12 months with comparative analysis
- **Anomaly Detection** - AI-powered detection of unusual transactions based on historical patterns
- **Merchant Analytics** - See your top merchants, frequency, and spending habits

### Financial Planning
- **Cash Flow Forecasting** - Multiple scenario projections (subscriptions-only, optimistic, expected, conservative)
- **Net Worth Tracking** - Monitor assets and liabilities over time with manual snapshots
- **Bills & Subscriptions** - Track recurring payments with auto-detection from transaction history
- **Upcoming Charges** - See what bills are due in the next 30 days

### Security
- **Multi-Tenant Architecture** - Complete user data isolation at the database level
- **Session Management** - Secure authentication with HTTP-only session cookies
- **CSRF Protection** - Double-submit cookie pattern prevents cross-site request forgery
- **Rate Limiting** - Protection against brute force attacks on login
- **Password Hashing** - bcrypt with 12 salt rounds
- **Security Headers** - Helmet.js with Content Security Policy

## Tech Stack

### Backend
- **Runtime**: Node.js 22+
- **Framework**: Express 5.0
- **Database**: SQLite with better-sqlite3 (synchronous API)
- **Authentication**: Session-based with bcrypt password hashing
- **Security**: Helmet, CORS, rate limiting, CSRF protection, cookie-parser

### Frontend
- **Framework**: Vanilla JavaScript (ES6 Modules) - No build step required
- **Routing**: Hash-based SPA router
- **Styling**: CSS3 with CSS Variables for theming
- **Charts**: Custom SVG-based visualizations
- **Dark Mode**: Automatic via `prefers-color-scheme`

### Testing
- **Unit/Integration**: Vitest with better-sqlite3 in-memory databases
- **E2E**: Playwright for browser testing
- **Coverage**: V8 coverage reports

## Getting Started

### Prerequisites
- Node.js 22 or higher
- npm 10 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/daleheenan/MyFinance.git
cd MyFinance/financeflow

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be available at `http://localhost:3000`

### First-Time Setup

1. Navigate to `http://localhost:3000`
2. You'll be prompted to create an admin account (check console for generated password on first run)
3. Log in with your credentials
4. Add your first account in Settings > Accounts
5. Import transactions via CSV or add them manually

## Project Structure

```
financeflow/
├── public/                 # Frontend application
│   ├── core/              # Core modules
│   │   ├── app.js         # App initialization & routing
│   │   ├── router.js      # Hash-based SPA router
│   │   ├── api.js         # HTTP client with CSRF support
│   │   ├── auth.js        # Authentication state manager
│   │   ├── toast.js       # Toast notification system
│   │   ├── modal.js       # Modal dialog utilities
│   │   └── utils.js       # Formatting & helpers
│   └── features/          # Feature modules (pages)
│       ├── overview/      # Dashboard with account summaries
│       ├── transactions/  # Transaction list, filtering, import
│       ├── budgets/       # Budget CRUD & progress tracking
│       ├── analytics/     # Spending charts & insights
│       ├── subscriptions/ # Bills & recurring payments
│       ├── networth/      # Asset/liability tracking
│       ├── forecasting/   # Cash flow projections
│       ├── settings/      # Account, category, rule management
│       └── auth/          # Login page
├── server/                # Backend application
│   ├── core/             # Core modules
│   │   ├── database.js   # SQLite initialization & migrations
│   │   ├── middleware.js # CORS, body parsing, logging
│   │   ├── security.js   # Helmet, rate limiting
│   │   ├── csrf.js       # CSRF protection middleware
│   │   └── errors.js     # Error handling
│   ├── db/
│   │   ├── schema.sql    # Database schema
│   │   └── seeds.sql     # Default categories
│   └── features/         # Feature modules
│       ├── accounts/     # Account CRUD & balance calculations
│       ├── transactions/ # Transaction CRUD & transfers
│       ├── categories/   # Category management & auto-categorization
│       ├── budgets/      # Budget CRUD & rollover logic
│       ├── analytics/    # Spending analysis & patterns
│       ├── anomalies/    # Unusual transaction detection
│       ├── forecasting/  # Cash flow projection engine
│       ├── merchants/    # Merchant extraction & stats
│       ├── networth/     # Net worth snapshots
│       ├── recurring/    # Recurring pattern detection
│       ├── subscriptions/# Subscription management
│       ├── import/       # CSV import with preview
│       └── auth/         # Authentication & sessions
├── tests/
│   └── e2e/              # Playwright E2E tests
└── data/                 # SQLite database (gitignored)
```

## API Documentation

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with credentials |
| POST | `/api/auth/logout` | Logout and invalidate session |
| GET | `/api/auth/verify` | Verify session validity |
| GET | `/api/auth/check-setup` | Check if users exist |
| POST | `/api/auth/setup` | Create first user |
| PUT | `/api/auth/password` | Change password |
| GET | `/api/auth/sessions` | List active sessions |
| DELETE | `/api/auth/sessions/:id` | Revoke a session |
| GET | `/api/auth/login-history` | View login attempts |

### Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | List all accounts |
| POST | `/api/accounts` | Create new account |
| GET | `/api/accounts/:id` | Get account with summary |
| PUT | `/api/accounts/:id` | Update account |
| DELETE | `/api/accounts/:id` | Delete account & transactions |
| DELETE | `/api/accounts/:id/transactions` | Clear transactions only |
| GET | `/api/accounts/:id/summary` | Get monthly summary |
| GET | `/api/accounts/:id/monthly` | Get 12-month history |
| GET | `/api/accounts/:id/balance-trend` | Get daily balance trend |
| GET | `/api/accounts/overview/stats` | Aggregated stats |
| GET | `/api/accounts/overview/recent-transactions` | Recent across all |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | List transactions (paginated, filtered) |
| POST | `/api/transactions` | Create transaction |
| GET | `/api/transactions/:id` | Get transaction |
| PUT | `/api/transactions/:id` | Update transaction |
| DELETE | `/api/transactions/:id` | Delete transaction |
| POST | `/api/transactions/transfer` | Create account transfer |
| PUT | `/api/transactions/:id/category` | Update category only |
| POST | `/api/transactions/:id/split` | Split transaction |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category |

### Category Rules
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/category-rules` | List rules |
| POST | `/api/category-rules` | Create rule |
| PUT | `/api/category-rules/:id` | Update rule |
| DELETE | `/api/category-rules/:id` | Delete rule |
| POST | `/api/category-rules/apply` | Apply rules to transactions |

### Budgets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/budgets` | List budgets for month |
| POST | `/api/budgets` | Create/update budget |
| DELETE | `/api/budgets/:id` | Delete budget |
| GET | `/api/budgets/summary` | Get budget summary with spending |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/summary` | Get spending summary |
| GET | `/api/analytics/by-category` | Breakdown by category |
| GET | `/api/analytics/trends` | Monthly trends (12 months) |
| GET | `/api/analytics/patterns` | Spending patterns & insights |
| GET | `/api/analytics/merchants` | Top merchants |

### Subscriptions (Bills)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/subscriptions` | List subscriptions |
| POST | `/api/subscriptions` | Create subscription |
| PUT | `/api/subscriptions/:id` | Update subscription |
| DELETE | `/api/subscriptions/:id` | Delete subscription |
| GET | `/api/subscriptions/summary` | Monthly/yearly totals |
| GET | `/api/subscriptions/upcoming` | Upcoming charges |
| GET | `/api/subscriptions/detect` | Auto-detect from transactions |

### Net Worth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/networth` | Current net worth breakdown |
| GET | `/api/networth/history` | Historical snapshots |
| POST | `/api/networth/snapshot` | Create manual snapshot |

### Forecasting
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forecasting` | Get cash flow projections |
| GET | `/api/forecasting/scenarios` | Multiple scenario analysis |

### Import
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/import/csv` | Import CSV file |
| POST | `/api/import/preview` | Preview before import |
| GET | `/api/import/history` | Import batch history |
| POST | `/api/import/:batchId/undo` | Undo import batch |

### Anomalies
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/anomalies` | List detected anomalies |
| PUT | `/api/anomalies/:id/dismiss` | Dismiss anomaly |
| POST | `/api/anomalies/scan` | Trigger anomaly scan |

### Merchants
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/merchants` | List all merchants |
| GET | `/api/merchants/top` | Top merchants by spend |
| GET | `/api/merchants/:id/stats` | Merchant statistics |
| GET | `/api/merchants/:id/history` | Transaction history |

### Recurring Patterns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recurring` | List detected patterns |
| GET | `/api/recurring/income` | Recurring income patterns |

## Scripts

```bash
# Start production server
npm start

# Start development server with hot reload
npm run dev

# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `DATABASE_PATH` | `./data/financeflow.db` | SQLite database path |

## CSV Import Format

FinanceFlow supports CSV imports with flexible column mapping. The importer auto-detects columns.

**Required columns:**
- **Date**: Transaction date (various formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)
- **Description**: Transaction description
- **Amount**: Transaction amount (or separate Debit/Credit columns)

**Example CSV:**
```csv
Date,Description,Debit,Credit,Balance
2024-01-15,GROCERY STORE,45.67,,1234.56
2024-01-16,SALARY PAYMENT,,2500.00,3734.56
2024-01-17,NETFLIX.COM,15.99,,3718.57
```

## Security Features

### Authentication
- Passwords hashed with bcrypt (12 salt rounds)
- Session tokens in HTTP-only cookies (prevents XSS token theft)
- Session expiry after 24 hours of inactivity
- Login history tracking with IP addresses
- Active session management (view & revoke)

### CSRF Protection
- Double-submit cookie pattern
- CSRF token required for all state-changing requests (POST, PUT, DELETE)
- Tokens validated with timing-safe comparison

### Rate Limiting
- Login: 5 attempts per 15 minutes per IP
- API: 100 requests per minute per IP

### Headers
- Helmet.js security headers
- Content Security Policy
- X-Frame-Options: DENY
- Strict Transport Security (production)

### Data Isolation
- Multi-tenant architecture with user_id filtering
- All database queries scoped to authenticated user
- Foreign key constraints enforce data integrity

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` | Go to Overview |
| `Ctrl+2` | Go to Transactions |
| `Ctrl+3` | Go to Budgets |
| `Ctrl+4` | Go to Analytics |
| `Ctrl+5` | Go to Settings |

## Development

### Adding a New Feature

1. Create feature folder in `server/features/newfeature/`
2. Add routes file (`newfeature.routes.js`)
3. Add service file (`newfeature.service.js`)
4. Add tests (`newfeature.test.js`)
5. Create frontend page in `public/features/newfeature/`
6. Register route in `public/core/app.js`
7. Add navigation link in `public/index.html`

### Database Migrations

Migrations are handled automatically in `server/core/database.js`. Use the `addColumnIfNotExists` helper to safely add columns to existing databases:

```javascript
addColumnIfNotExists(database, 'tablename', 'columnname', 'TYPE DEFAULT value');
```

### Running Tests

```bash
# Unit tests with Vitest
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# E2E tests with Playwright
npm run test:e2e
```

## Deployment

### Railway (Recommended)

1. Connect your GitHub repository to Railway
2. Set environment variables:
   - `NODE_ENV=production`
   - `DATABASE_PATH=/data/financeflow.db`
3. Add a persistent volume mounted at `/data`
4. Deploy

### Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## License

Private - All rights reserved

## Author

Dale Heenan

---

Built with vanilla JavaScript - no framework, no build step, just clean code.
