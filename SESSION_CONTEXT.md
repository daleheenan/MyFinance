# Flow Money Manager - Session Context

**Purpose:** This file provides context for AI assistants starting new development sessions on this project.

---

## Project Overview

Flow Money Manager is a personal finance web application for UK households. It helps users track transactions, manage budgets, analyze spending patterns, and forecast finances.

### Key Files to Read First

1. **ROADMAP.md** - Development backlog with 148+ tasks organized by priority
2. **server/db/schema.sql** - Database schema (users, accounts, transactions, budgets, etc.)
3. **public/index.html** - Main navigation structure and page organization
4. **public/core/app.js** - SPA router configuration and page registration
5. **version.json** - Current version and changelog (auto-generated)

---

## Architecture Quick Reference

### Frontend
- **Type:** Vanilla JavaScript ES6 Single Page Application (SPA)
- **Routing:** Hash-based (`#/page`) with custom router in `public/core/router.js`
- **Styling:** CSS3 with CSS variables in `public/core/styles.css`
- **Charts:** SVG-based, rendered in JavaScript (no external charting libraries)

### Backend
- **Runtime:** Node.js 22 with ES modules
- **Framework:** Express 5.0
- **Database:** SQLite via better-sqlite3
- **Auth:** Session-based with bcryptjs password hashing

### File Structure
```
financeflow/
├── public/                    # Frontend SPA
│   ├── core/                  # Shared modules (api, auth, router, utils)
│   ├── features/              # Page modules (overview, transactions, etc.)
│   └── marketing/             # Public marketing pages
├── server/                    # Backend API
│   ├── features/              # Route handlers by domain
│   ├── db/                    # Database schema and utilities
│   └── index.js               # Express app entry point
├── data/                      # SQLite database files
├── scripts/                   # Build and utility scripts
├── ROADMAP.md                 # Development backlog
├── SESSION_CONTEXT.md         # This file
└── version.json               # Auto-generated version info
```

---

## Page Module Pattern

Each frontend page follows this pattern in `public/features/{name}/{name}.page.js`:

```javascript
export async function mount(container, params) {
  // Initialize page state
  // Render initial HTML
  // Attach event listeners
  // Load data from API
}

export function unmount() {
  // Cleanup event listeners
  // Clear intervals/timeouts
  // Reset state
}
```

---

## Current Navigation Structure

### Main Navigation (Desktop)
- **Overview** - Dashboard with account cards, balance chart, alerts
- **Manage** (dropdown) - Transactions, Budgets, Accounts, Categories, Recurring
- **Analytics** (dropdown) - Summary, Trends, Spending, Merchants, Bills & Subscriptions, Forecasting, Net Worth
- **Settings** - Import history, profile, security, subscription, version

### Mobile Bottom Nav
- Overview, Transactions, Budgets, Analytics, More (→ Settings)

---

## API Patterns

### Authentication
- All protected endpoints require `Authorization: Bearer <token>` header
- Token obtained from `POST /api/auth/login`
- Session verification via `GET /api/auth/verify`

### Response Format
```javascript
// Success
{ success: true, data: {...} }
// or just the data object directly

// Error
{ success: false, error: "Error message" }
```

### Common Endpoints
- `GET /api/accounts` - List user's accounts
- `GET /api/transactions?account_id=1&page=1` - Paginated transactions
- `GET /api/categories` - User's categories
- `GET /api/budgets` - User's budgets
- `GET /api/analytics/*` - Various analytics endpoints

---

## User System

### User Types
1. **Admin** - `is_admin = 1`, full access including `/admin` and `/cms`
2. **Pro** - Paid subscription, all features
3. **Trial** - Free 7-day trial, limited features
4. **Expired** - Trial ended, needs to subscribe

### Authentication
- Default admin: `admin` / `FinanceFlow2025!`
- Session cookies with 24-hour expiry
- 5 login attempts before 15-minute lockout

---

## Common Development Tasks

### Adding a New Page
1. Create `public/features/{name}/{name}.page.js` with mount/unmount exports
2. Create `public/features/{name}/{name}.css`
3. Add CSS link in `public/index.html`
4. Import and register in `public/core/app.js`
5. Add navigation link in `public/index.html`

### Adding a New API Endpoint
1. Create or update route file in `server/features/{domain}/{domain}.routes.js`
2. Routes auto-register if they export a Router
3. Use `requireAuth` middleware for protected endpoints

### Database Changes
1. Modify `server/db/schema.sql` for schema changes
2. The migration system in `database.js` handles upgrades

---

## Recent Changes (Last Session)

1. **Year-over-Year Balance Chart** - Overview page now shows multi-year balance comparison with colored lines
2. **Navigation Restructure** - Moved Bills, Forecasting, Net Worth from "More" to "Analytics" dropdown
3. **Changelog in Version History** - Versions now include commit messages as changelog descriptions
4. **ROADMAP.md** - Contains 148+ backlog items from UX review and competitor analysis

---

## What's Helpful at Session Start

1. **Read ROADMAP.md** - Check current task status and priorities
2. **Read recent git log** - `git log --oneline -10` for recent changes
3. **Check version.json** - Current version and last changelog
4. **Review any open TODOs** in code - `grep -r "TODO" server/ public/`

---

## Environment Variables

Required for full functionality (set in `.env`):
```
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Flow Money Manager <your-email@gmail.com>
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

---

## Git Workflow

- Main branch: `master`
- Commit format: Clear description, followed by footer:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
  ```
- Generate version before commit: `node scripts/generate-version.js`

---

## Questions to Ask User

When starting a session, consider asking:
1. "Should I review the ROADMAP.md for the next priority task?"
2. "Are there any specific features or bugs you'd like to focus on?"
3. "Should I commit and push changes when completing tasks?"
