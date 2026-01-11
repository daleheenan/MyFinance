# FinanceFlow Test Plan

## Overview

This document provides a comprehensive test plan for the FinanceFlow personal finance management application. It summarizes existing test coverage, identifies gaps, and proposes new tests to ensure robust functionality across all features.

**Last Updated:** 2026-01-11

---

## Table of Contents

1. [Existing Test Coverage Summary](#existing-test-coverage-summary)
2. [Identified Gaps](#identified-gaps)
3. [Proposed New Tests](#proposed-new-tests)
4. [Test Priority Matrix](#test-priority-matrix)
5. [Test Categories](#test-categories)
6. [Running Tests](#running-tests)

---

## Existing Test Coverage Summary

### Server-Side Tests (Vitest + Supertest)

#### Authentication (`server/features/auth/auth.test.js`)
**Coverage: GOOD**
- Login with valid/invalid credentials
- Session creation and validation
- Logout and session invalidation
- Password change with validation
- Login history retrieval
- Account lockout after 5 failed attempts
- SQL injection protection
- Session expiration handling
- Initial admin user creation
- Expired session cleanup

#### Accounts (`server/features/accounts/`)
**Coverage: GOOD**
- `accounts.routes.test.js`: Full CRUD coverage
  - GET /api/accounts (list with current_balance)
  - GET /api/accounts/:id (single account with summary)
  - PUT /api/accounts/:id (update name, opening_balance)
  - GET /api/accounts/:id/summary (monthly summary)
  - GET /api/accounts/:id/monthly (12-month summary)
  - Transfer exclusion from summaries
  - Error handling (404, 400, database errors)

- `balance.service.test.js`: Comprehensive unit tests
  - Running balance calculations
  - Opening balance updates
  - Penny precision handling
  - Floating point edge cases
  - Credit card account handling

#### Transactions (`server/features/transactions/`)
**Coverage: GOOD**
- `transactions.routes.test.js`:
  - GET /api/transactions (pagination, filtering, search)
  - GET /api/transactions/:id (with category info)
  - PUT /api/transactions/:id (description, category, notes)
  - DELETE /api/transactions/:id (with balance recalculation)
  - POST /api/transactions/:id/categorize (manual and auto)
  - Immutability of amounts and dates

- `transfer.service.test.js`: Comprehensive transfer detection
  - Detect transfers between accounts
  - 3-day window matching
  - Link/unlink transfer pairs
  - Penny amount handling
  - Multiple transfer pairs detection
  - Invalid pair rejection

#### Import (`server/features/import/import.routes.test.js`)
**Coverage: GOOD**
- POST /api/import/preview (CSV parsing, column detection)
- POST /api/import (full import with mapping)
- GET /api/import/batches (import history)
- GET /api/import/batches/:id (batch details)
- Auto-categorization after import
- Running balance calculation
- Date format parsing (DD/MM/YYYY)
- Error handling for invalid data
- Transfer detection integration

#### Categories (`server/features/categories/categories.routes.test.js`)
**Coverage: GOOD**
- GET /api/categories (list with optional totals)
- GET /api/categories/:id (single category)
- POST /api/categories (create with validation)
- PUT /api/categories/:id (update non-default only)
- DELETE /api/categories/:id (with transaction check)
- Category rules CRUD operations
- Default category protection

#### Analytics (`server/features/analytics/analytics.routes.test.js`)
**Coverage: EXCELLENT**
- GET /api/analytics/spending-by-category
- GET /api/analytics/income-vs-expenses
- GET /api/analytics/trends (daily, weekly)
- GET /api/analytics/summary
- GET /api/analytics/yoy (year-over-year)
- GET /api/analytics/yoy/monthly
- Date range filtering
- Account filtering
- Transfer exclusion
- Edge cases and error handling

#### Budgets (`server/features/budgets/budgets.routes.test.js`)
**Coverage: GOOD**
- GET /api/budgets (list with calculations)
- GET /api/budgets/summary (totals and status)
- GET /api/budgets/unbudgeted (categories without budgets)
- GET /api/budgets/:id (single budget)
- POST /api/budgets (create/update with upsert)
- DELETE /api/budgets/:id
- Spent amount calculations
- Rollover handling
- Transfer exclusion
- Status counts (on-track, warning, over-budget)

#### Recurring Patterns (`server/features/recurring/`)
**Coverage: GOOD**
- `recurring.routes.test.js`: Full CRUD coverage
- `recurring.service.test.js`: Pattern detection algorithms
- Frequency detection (weekly, monthly, quarterly)
- Transaction linking/unlinking
- Category inference

### E2E Tests (Playwright)

#### Authentication (`tests/e2e/auth.spec.js`)
**Coverage: MODERATE**
- Initial setup flow
- Login form validation
- Login with valid credentials
- Session persistence
- Logout functionality
- Protected route access
- Session expiration handling

#### Navigation (`tests/e2e/navigation.spec.js`)
**Coverage: GOOD**
- Main navigation links visibility
- Active state highlighting
- Page routing for all routes
- Browser back/forward navigation
- 404 handling
- Logo navigation
- Responsive behavior

#### Transactions (`tests/e2e/transactions.spec.js`)
**Coverage: MODERATE**
- Page layout and components
- Account selection
- Date, category, and search filters
- Transactions table columns
- Empty state handling
- Row expansion
- Inline editing (description, category)
- Pagination controls
- Import and delete modals

#### Budgets (`tests/e2e/budgets.spec.js`)
**Coverage: GOOD**
- Month navigation
- Budget summary display
- Budget list with progress bars
- Add/edit/delete modals
- Form validation
- Quick add section

#### Import (`tests/e2e/import.spec.js`)
**Coverage: MODERATE**
- Import modal from transactions page
- File selection
- Account selector
- Preview step
- Back/confirm buttons
- Error handling for invalid files

#### Settings (`tests/e2e/settings.spec.js`)
**Coverage: MODERATE**
- Account management section
- Category management
- Category rules
- Import history
- Recurring patterns
- User account settings
- Form validation
- Error handling

---

## Identified Gaps

### Critical Priority

| Gap | Description | Impact |
|-----|-------------|--------|
| **Multi-user data isolation** | No tests verifying users cannot access other users' data | Security vulnerability |
| **Session token security** | No tests for token entropy, storage security | Security vulnerability |
| **Concurrent access** | No tests for race conditions in balance updates | Data integrity |
| **API rate limiting** | No tests for rate limiting on auth endpoints | DoS vulnerability |

### High Priority

| Gap | Description | Impact |
|-----|-------------|--------|
| **Password reset flow** | No tests for password reset functionality | User experience |
| **Account creation** | No tests for creating new accounts | Core functionality |
| **Account deletion** | No tests for deleting accounts with transactions | Data integrity |
| **Bulk operations** | No tests for bulk transaction updates/deletes | Feature coverage |
| **E2E analytics page** | No E2E tests for analytics dashboard | UI verification |
| **E2E networth page** | No E2E tests for networth tracking | UI verification |
| **E2E subscriptions page** | No E2E tests for subscriptions management | UI verification |
| **E2E forecasting page** | No E2E tests for forecasting features | UI verification |

### Medium Priority

| Gap | Description | Impact |
|-----|-------------|--------|
| **CSV format variations** | Limited testing of different bank CSV formats | Import reliability |
| **Large dataset performance** | No performance tests for 10K+ transactions | Scalability |
| **Duplicate transaction detection** | No tests for import duplicate detection | Data quality |
| **Category merge/split** | No tests for merging or splitting categories | Feature coverage |
| **Export functionality** | No tests for data export features | Feature coverage |
| **Date timezone handling** | No tests for timezone edge cases | Data accuracy |
| **Mobile responsiveness** | Limited E2E tests for mobile viewports | UI/UX |

### Low Priority

| Gap | Description | Impact |
|-----|-------------|--------|
| **Accessibility (a11y)** | No accessibility tests | Compliance |
| **Browser compatibility** | No cross-browser E2E tests | Compatibility |
| **Offline handling** | No tests for offline/network error scenarios | UX |
| **Keyboard navigation** | No tests for keyboard-only navigation | Accessibility |

---

## Proposed New Tests

### 1. Multi-User Data Isolation Tests
**Priority: CRITICAL | Type: Integration**

```javascript
// server/features/auth/isolation.test.js
describe('Multi-User Data Isolation', () => {
  it('should not return transactions from other users');
  it('should not return accounts from other users');
  it('should not return budgets from other users');
  it('should not return categories from other users');
  it('should not allow updating other users transactions');
  it('should not allow deleting other users data');
  it('should filter analytics by user');
  it('should prevent cross-user import batches access');
});
```

### 2. Account CRUD Extended Tests
**Priority: HIGH | Type: Integration**

```javascript
// server/features/accounts/accounts.crud.test.js
describe('Account CRUD Operations', () => {
  describe('POST /api/accounts', () => {
    it('should create a new debit account');
    it('should create a new credit card account');
    it('should validate required fields');
    it('should prevent duplicate account numbers');
    it('should set default opening balance to 0');
  });

  describe('DELETE /api/accounts/:id', () => {
    it('should delete account with no transactions');
    it('should prevent deletion with existing transactions');
    it('should cascade delete related budgets');
    it('should handle linked transfers on deletion');
  });
});
```

### 3. API Rate Limiting Tests
**Priority: CRITICAL | Type: Integration**

```javascript
// server/features/auth/ratelimit.test.js
describe('API Rate Limiting', () => {
  it('should limit login attempts per IP');
  it('should return 429 after exceeding limit');
  it('should reset limit after window expires');
  it('should not rate limit verified sessions');
  it('should include retry-after header');
});
```

### 4. Password Reset Flow Tests
**Priority: HIGH | Type: Integration + E2E**

```javascript
// server/features/auth/password-reset.test.js
describe('Password Reset', () => {
  it('should generate reset token');
  it('should expire reset token after 1 hour');
  it('should validate new password requirements');
  it('should invalidate token after use');
  it('should log password reset in login_attempts');
});

// tests/e2e/password-reset.spec.js
describe('Password Reset E2E', () => {
  it('should show forgot password link');
  it('should display reset form');
  it('should show success message');
  it('should allow login with new password');
});
```

### 5. Bulk Operations Tests
**Priority: HIGH | Type: Integration**

```javascript
// server/features/transactions/bulk.test.js
describe('Bulk Transaction Operations', () => {
  describe('POST /api/transactions/bulk-categorize', () => {
    it('should categorize multiple transactions');
    it('should validate all transaction IDs exist');
    it('should rollback on partial failure');
  });

  describe('DELETE /api/transactions/bulk-delete', () => {
    it('should delete multiple transactions');
    it('should recalculate balances once after all deletes');
    it('should handle linked transfers');
  });
});
```

### 6. E2E Analytics Page Tests
**Priority: HIGH | Type: E2E**

```javascript
// tests/e2e/analytics.spec.js
describe('Analytics Page', () => {
  it('should display spending by category chart');
  it('should display income vs expenses chart');
  it('should allow date range selection');
  it('should filter by account');
  it('should show year-over-year comparison');
  it('should export analytics data');
  it('should handle empty data gracefully');
});
```

### 7. E2E Networth Page Tests
**Priority: HIGH | Type: E2E**

```javascript
// tests/e2e/networth.spec.js
describe('Networth Page', () => {
  it('should display total networth');
  it('should list all accounts with balances');
  it('should show networth trend chart');
  it('should handle negative balances');
  it('should update on account balance changes');
});
```

### 8. E2E Subscriptions Page Tests
**Priority: HIGH | Type: E2E**

```javascript
// tests/e2e/subscriptions.spec.js
describe('Subscriptions Page', () => {
  it('should display detected subscriptions');
  it('should show subscription costs');
  it('should allow marking as cancelled');
  it('should calculate total monthly cost');
  it('should detect new subscriptions');
});
```

### 9. E2E Forecasting Page Tests
**Priority: HIGH | Type: E2E**

```javascript
// tests/e2e/forecasting.spec.js
describe('Forecasting Page', () => {
  it('should display balance forecast');
  it('should show recurring transactions');
  it('should allow adding projected expenses');
  it('should update forecast on changes');
  it('should warn about potential overdrafts');
});
```

### 10. CSV Import Format Tests
**Priority: MEDIUM | Type: Integration**

```javascript
// server/features/import/csv-formats.test.js
describe('CSV Format Handling', () => {
  it('should parse Lloyds bank format');
  it('should parse Barclays bank format');
  it('should parse Monzo CSV format');
  it('should parse Starling CSV format');
  it('should handle quoted fields with commas');
  it('should handle UTF-8 characters');
  it('should detect and skip duplicate transactions');
  it('should handle negative amounts in single column');
});
```

### 11. Performance Tests
**Priority: MEDIUM | Type: Performance**

```javascript
// tests/performance/large-dataset.test.js
describe('Large Dataset Performance', () => {
  it('should load 10,000 transactions under 2 seconds');
  it('should paginate efficiently');
  it('should calculate analytics for large datasets');
  it('should handle 5 years of historical data');
  it('should import 1,000 row CSV under 5 seconds');
});
```

### 12. Concurrent Access Tests
**Priority: CRITICAL | Type: Integration**

```javascript
// server/features/transactions/concurrent.test.js
describe('Concurrent Access', () => {
  it('should handle concurrent balance updates');
  it('should prevent double-spending scenarios');
  it('should lock account during recalculation');
  it('should handle simultaneous imports');
});
```

### 13. Session Security Tests
**Priority: CRITICAL | Type: Unit**

```javascript
// server/features/auth/session-security.test.js
describe('Session Security', () => {
  it('should generate cryptographically secure tokens');
  it('should invalidate all sessions on password change');
  it('should track session IP addresses');
  it('should detect session hijacking attempts');
  it('should enforce session timeout');
  it('should limit concurrent sessions');
});
```

### 14. Accessibility Tests
**Priority: LOW | Type: E2E**

```javascript
// tests/e2e/accessibility.spec.js
describe('Accessibility', () => {
  it('should have no critical accessibility violations');
  it('should support keyboard navigation');
  it('should have proper ARIA labels');
  it('should support screen readers');
  it('should have sufficient color contrast');
});
```

---

## Test Priority Matrix

| Priority | Description | Timeline |
|----------|-------------|----------|
| **CRITICAL** | Security vulnerabilities, data integrity issues | Immediate |
| **HIGH** | Core functionality gaps, user-facing features | Next sprint |
| **MEDIUM** | Edge cases, performance, additional formats | Next month |
| **LOW** | Nice-to-have improvements, accessibility | Backlog |

### Critical Tests (Implement Immediately)
1. Multi-user data isolation
2. Session security tests
3. API rate limiting
4. Concurrent access handling

### High Priority Tests (Next Sprint)
1. Account creation/deletion
2. Password reset flow
3. Bulk operations
4. E2E analytics page
5. E2E networth page
6. E2E subscriptions page
7. E2E forecasting page

### Medium Priority Tests (Next Month)
1. CSV format variations
2. Performance tests
3. Duplicate detection
4. Export functionality

### Low Priority Tests (Backlog)
1. Accessibility tests
2. Cross-browser tests
3. Offline handling
4. Mobile responsiveness

---

## Test Categories

### Unit Tests
- Balance calculations
- Date parsing
- Category rule matching
- Transfer detection algorithms
- Session token generation

### Integration Tests
- API endpoint behavior
- Database operations
- Authentication flows
- Import processing
- Multi-user isolation

### E2E Tests
- User workflows
- Page navigation
- Form submissions
- Modal interactions
- Error handling

### Performance Tests
- Large dataset operations
- Concurrent access
- Import speed
- Page load times

---

## Running Tests

### Server Tests (Vitest)
```bash
# Run all server tests
npm run test

# Run specific feature tests
npm run test -- server/features/auth

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### E2E Tests (Playwright)
```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/auth.spec.js

# Run with UI mode
npx playwright test --ui

# Run headed (visible browser)
npx playwright test --headed

# Generate report
npx playwright show-report
```

### Test Database
Tests use an in-memory SQLite database created via `createTestDb()`. This ensures:
- Test isolation
- Fast execution
- No cleanup required
- Consistent seed data

---

## Maintenance Notes

1. **Update this document** when adding new tests or identifying new gaps
2. **Run full test suite** before each release
3. **Monitor test coverage** trends over time
4. **Review flaky tests** quarterly and fix or remove them
5. **Add regression tests** for each bug fix

---

## References

- Test files: `server/features/**/**.test.js`
- E2E tests: `tests/e2e/*.spec.js`
- Test utilities: `server/db/testDatabase.js`
- Playwright config: `playwright.config.js`
- Vitest config: `vitest.config.js`
