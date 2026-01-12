# Flow Money Manager - Development Roadmap

**Version:** 1.2.0
**Last Updated:** 2026-01-12
**Status:** Active Development

---

## Overview

Flow Money Manager is a personal finance management application with budgeting, transactions, analytics, and multi-user support. This roadmap tracks all development phases from inception to production.

### Subscription Model

**Annual Subscription with 1 Free Month:**
- New users get 1 month free access
- After free month, auto-converts to annual paid subscription
- Simple status flow: `free_month` → `active` → `cancelled`/`expired`
- No complex trial management or countdown banners

### Backlog Summary

| Category | Total Items | High Priority | Status |
|----------|-------------|---------------|--------|
| Core Phases (1-12) | 18 remaining | 4 | 80% Complete |
| UX Improvements | 55 items | 12 | In Planning |
| Feature Backlog | 53 items | 12 | In Planning |
| Language/Visual | 14 items | 2 | In Planning |
| **Total Backlog** | **140 items** | **30** | |

---

## Quick Status

| Phase | Description | Progress | Status |
|-------|-------------|----------|--------|
| 0 | Data Isolation Fixes | 14/14 | COMPLETE |
| 1 | Database Schema | 4/5 | 80% |
| 2 | Registration API | 4/6 | 65% |
| 3 | Email Templates | 3/5 | 60% |
| 4 | Registration Frontend | 5/6 | 85% |
| 5 | ~~Trial System~~ | N/A | REMOVED (replaced by annual subscription) |
| 6 | Stripe Integration | 6/8 | 75% |
| 7 | Admin Management | 19/19 | COMPLETE |
| 8 | App Rebranding | 8/8 | COMPLETE |
| 9 | Marketing & CMS | 14/14 | COMPLETE |
| 10 | Testing & Security | 4/8 | 50% |
| 11 | Dynamic Versioning | 4/4 | COMPLETE |
| 12 | Seeding Fixes | 2/2 | COMPLETE |

**Overall Progress:** ~80% Complete

---

## Completed Phases

### Phase 0: Critical Data Isolation Fixes
**Status:** COMPLETE
**Completed:** 2026-01-10

All user data properly isolated at database level:
- [x] Transfer service filters by user accounts
- [x] Categorization service uses user-specific rules
- [x] Category service verifies user ownership
- [x] All route handlers pass userId parameter
- [x] Transaction categorize endpoint secured

### Phase 7: Admin User Management
**Status:** COMPLETE
**Completed:** 2026-01-11

Full admin panel for user management:
- [x] Admin middleware with `isAdmin()` check
- [x] CRUD endpoints for users (`/api/admin/users`)
- [x] Trial extension endpoint
- [x] Account lock/unlock endpoints
- [x] Password reset endpoint
- [x] Session revocation endpoint
- [x] Login history viewing
- [x] Active sessions viewing
- [x] Admin UI page at `#/admin`
- [x] User detail modal with full history
- [x] Admin link in nav for admin users

### Phase 8: App Rebranding
**Status:** COMPLETE
**Completed:** 2026-01-11

Rebranded from "FinanceFlow" to "Flow Money Manager":
- [x] HTML title
- [x] Navigation header
- [x] Login/setup pages
- [x] Server logs
- [x] Package.json name
- [x] Marketing pages

### Phase 9: Marketing Website & CMS
**Status:** COMPLETE
**Completed:** 2026-01-10

Public marketing site with admin CMS:
- [x] Landing page (`/`)
- [x] Features page (`/features`)
- [x] Pricing page (`/pricing`)
- [x] CMS backend with CRUD
- [x] CMS admin interface with CodeMirror
- [x] Image upload gallery
- [x] Live preview

### Phase 11: Dynamic Versioning
**Status:** COMPLETE
**Completed:** 2026-01-11

Version auto-updates with git commits:
- [x] Reads base version from package.json
- [x] Appends git commit count
- [x] Appends short commit hash
- [x] Format: `1.2.0.{commits}+{hash}`

### Phase 12: Seeding Fixes
**Status:** COMPLETE
**Completed:** 2026-01-11

Sample data no longer reappears:
- [x] Seeds only run on fresh databases
- [x] Check for existing accounts before seeding

---

## In Progress Phases

### Phase 1: Database Schema & Backend Foundation
**Status:** 80% Complete

| Task | Status | Notes |
|------|--------|-------|
| User columns (full_name, is_admin, trial dates, subscription_status) | DONE | Via migration |
| password_reset_tokens table | DONE | In schema.sql |
| Database migration system | DONE | In database.js |
| First user as admin | DONE | Auto-set on migration |
| Email verification columns | TODO | email_verified, verification_token, verification_expires |

### Phase 2: Registration API
**Status:** 65% Complete

| Task | Status | Notes |
|------|--------|-------|
| `POST /api/auth/register` | TODO | Create user with 1-month free access |
| Password validation | DONE | 8+ chars, upper, lower, number |
| `POST /api/auth/verify-email` | TODO | Verify token from email |
| `POST /api/auth/forgot-password` | DONE | Request reset email |
| `POST /api/auth/reset-password` | DONE | Reset with token |
| `GET /api/auth/subscription-status` | DONE | Check free_month/active/expired |
| Rate limiting | DONE | 5 attempts / 15 min |

### Phase 3: Email Service Integration
**Status:** 60% Complete

| Task | Status | Notes |
|------|--------|-------|
| Gmail SMTP configuration | DONE | In email.js |
| Email template system | DONE | HTML templates |
| Email verification template | TODO | |
| Password reset template | DONE | |
| Welcome email template | TODO | With subscription details |

### Phase 4: Registration Frontend
**Status:** 85% Complete

| Task | Status | Notes |
|------|--------|-------|
| Registration page | DONE | /register |
| Form validation | DONE | Client-side |
| Email verification page | TODO | Token validation |
| Forgot password page | DONE | /forgot-password |
| Reset password page | DONE | /reset-password |
| "Create Account" link | DONE | On login page |

### Phase 5: ~~Trial System~~ (REMOVED)
**Status:** REMOVED

*Replaced by simpler annual subscription model with 1 free month. No complex trial countdown, banners, or expiration warnings needed.*

### Phase 6: Stripe Payment Integration
**Status:** 75% Complete

| Task | Status | Notes |
|------|--------|-------|
| Stripe SDK installed | DONE | v17.0.0 |
| Create customer on registration | TODO | Link Stripe to user, setup free month |
| Checkout session endpoint | DONE | Annual subscription with 1 month free |
| Webhook handler | DONE | |
| checkout.session.completed | DONE | |
| subscription.updated | DONE | |
| subscription.deleted | DONE | |
| Subscription management page | TODO | View status, cancel, update payment |
| Customer Portal integration | DONE | |

### Phase 10: Testing & Security
**Status:** 50% Complete

| Task | Status | Notes |
|------|--------|-------|
| Unit tests: registration | TODO | |
| Unit tests: subscription logic | TODO | Free month → active → expired |
| Unit tests: admin endpoints | TODO | |
| E2E tests: registration flow | TODO | |
| Email enumeration prevention | DONE | Always return success |
| Rate limiting verification | DONE | Tested |
| Token expiration verification | DONE | Tested |
| User data isolation audit | DONE | All services verified |

---

## Remaining Work Estimate

| Phase | Remaining Tasks | Est. Effort |
|-------|-----------------|-------------|
| Phase 1 | 1 task | Low |
| Phase 2 | 2 tasks | Medium |
| Phase 3 | 2 tasks | Low |
| Phase 4 | 1 task | Low |
| Phase 6 | 2 tasks | Medium |
| Phase 10 | 4 tasks | Medium |
| **Total** | **12 tasks** | |

*Simplified from 26 tasks by removing trial system complexity*

---

## Technical Stack

- **Backend:** Node.js 22, Express 5.0, SQLite
- **Frontend:** Vanilla JavaScript ES6, CSS3, SVG Charts
- **Authentication:** bcryptjs, session cookies, CSRF protection
- **Payments:** Stripe (annual subscription with 1-month free trial)
- **Email:** Nodemailer (Gmail SMTP)
- **Testing:** Vitest, Playwright
- **Deployment:** Railway, Docker

---

## Key Configuration

| Setting | Value |
|---------|-------|
| Subscription Model | Annual with 1 free month |
| Free Period | 30 days (1 month) |
| Annual Price | TBD |
| Password Min Length | 8 characters |
| Password Requirements | Uppercase, lowercase, number |
| Session Duration | 24 hours |
| Rate Limit (Login) | 5 attempts / 15 min |
| Account Lockout | After 5 failed attempts |
| Lockout Duration | 15 minutes |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.2 | 2026-01-12 | UX improvements: breadcrumbs, mobile card view, collapsible filters, quick filter chips, filter badges, budget status labels with days remaining, projected spending, import status indicators, 44px touch targets, aria-labels, YoY balance chart with multi-year support and shaded comparison areas |
| 1.2.1 | 2026-01-12 | Renamed Analytics to Insights, YoY chart dynamic account selector, modal styling, submenu highlighting fix, warmer microcopy |
| 1.2.0 | 2026-01-11 | Admin user management, data isolation fixes, dynamic versioning |
| 1.1.0 | 2026-01-11 | Version display, bug fixes, app rebranding |
| 1.0.0 | 2026-01-10 | Initial release with core features |

---

## UX Improvements Backlog

### Navigation Improvements

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-NAV-01 | Add breadcrumb navigation on filtered/detail pages | HIGH | DONE |
| UX-NAV-02 | Create dedicated "More" / Discover page for secondary features | MEDIUM | TODO |
| UX-NAV-03 | Implement favorites/customizable mobile bottom nav | LOW | TODO |
| UX-NAV-04 | Add explicit back button in page headers for secondary views | MEDIUM | TODO |
| UX-NAV-05 | Preserve scroll position when navigating back to previous pages | LOW | TODO |
| UX-NAV-06 | Standardize URL parameter naming (account_id, category_id) | LOW | TODO |
| UX-NAV-07 | Create Analytics landing page instead of redirect to Summary | LOW | TODO |
| UX-NAV-08 | Fix submenu active state highlighting (exact match only) | HIGH | DONE |

### Mobile Experience

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-MOB-01 | Implement card view for transactions on mobile (<768px) | HIGH | DONE |
| UX-MOB-02 | Add collapsible filter panel on mobile (slide-out drawer) | HIGH | DONE |
| UX-MOB-03 | Add swipe-to-action gestures on transaction cards (edit/delete) | MEDIUM | TODO |
| UX-MOB-04 | Ensure all touch targets are 44x44px minimum | MEDIUM | DONE |
| UX-MOB-05 | Add swipe navigation between Analytics tabs | LOW | TODO |
| UX-MOB-06 | Full-screen modals on small screens | LOW | TODO |
| UX-MOB-07 | Slide bottom nav down when modals open | LOW | TODO |

### Transactions Page

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-TXN-01 | Add multi-select mode for bulk categorization | HIGH | DONE |
| UX-TXN-02 | Save and reuse filter presets | MEDIUM | TODO |
| UX-TXN-03 | Show badge count for active filters | MEDIUM | DONE |
| UX-TXN-04 | Add quick filter chips (Today, This Month, This Year) | MEDIUM | DONE |
| UX-TXN-05 | Implement infinite scroll / "Load more" option | LOW | TODO |
| UX-TXN-06 | Show preview of similar transactions when categorizing | MEDIUM | TODO |
| UX-TXN-07 | Add categorization suggestions based on learned patterns | MEDIUM | TODO |
| UX-TXN-08 | Add undo button after bulk operations | LOW | TODO |

### Budgets Page

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-BUD-01 | Show empty state with CTA for new users | HIGH | DONE |
| UX-BUD-02 | Show suggested budgets based on historical spending | MEDIUM | TODO |
| UX-BUD-03 | Improve status labels: "On Track", "Approaching Limit", "Over Budget" | MEDIUM | DONE |
| UX-BUD-04 | Show days remaining and projected spending | MEDIUM | DONE |
| UX-BUD-05 | Make edit/delete buttons always visible on mobile | LOW | TODO |
| UX-BUD-06 | Add quick-fix actions on exceeded budgets | LOW | TODO |

### Analytics Pages

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-ANA-01 | Add sticky tab bar for switching between analytics pages | DONE | COMPLETE |
| UX-ANA-02 | Add time range selector (7D, 30D, 90D, YTD, Custom) | PARTIAL | IN PROGRESS |
| UX-ANA-03 | Add interactive legends to charts | MEDIUM | TODO |
| UX-ANA-04 | Add "What is this?" tooltips to chart titles | LOW | TODO |
| UX-ANA-05 | Save user's preferred time range in localStorage | LOW | TODO |

### Overview Dashboard

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-DASH-01 | Implement collapsible sections | MEDIUM | TODO |
| UX-DASH-02 | Add dashboard customization (show/hide sections) | LOW | TODO |
| UX-DASH-03 | Add persistent "Alerts" count in top bar | MEDIUM | TODO |
| UX-DASH-04 | Add tooltips to sparklines (30-day trend explanation) | LOW | TODO |

### Settings Page

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-SET-01 | Add sidebar navigation on desktop | MEDIUM | TODO |
| UX-SET-02 | Add tabs or accordion on mobile | MEDIUM | TODO |
| UX-SET-03 | Show import status indicators (Success/Partial/Failed) | MEDIUM | DONE |
| UX-SET-04 | Add "Download import report" option | LOW | TODO |

### CSV Import

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-IMP-01 | Show detected column mapping with dropdowns | MEDIUM | TODO |
| UX-IMP-02 | Save column mappings per account type | MEDIUM | TODO |
| UX-IMP-03 | Add "Download template CSV" button | LOW | TODO |
| UX-IMP-04 | Show "View skipped duplicates" in results | LOW | TODO |

### Accessibility (a11y)

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-A11Y-01 | Implement modal focus trap | HIGH | DONE |
| UX-A11Y-02 | Return focus to trigger button on modal close | HIGH | DONE |
| UX-A11Y-03 | Add aria-labels to all icon-only buttons | MEDIUM | DONE |
| UX-A11Y-04 | Link error messages with aria-describedby | MEDIUM | TODO |
| UX-A11Y-05 | Add aria-invalid to form fields with errors | MEDIUM | TODO |
| UX-A11Y-06 | Add scope="col" to table headers | LOW | TODO |
| UX-A11Y-07 | Announce loading states with aria-live="polite" | LOW | TODO |
| UX-A11Y-08 | Pair status colors with text labels/icons | MEDIUM | TODO |

### Visual Consistency

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-VIS-01 | Create button style guide documentation | LOW | TODO |
| UX-VIS-02 | Standardize empty state component across all pages | MEDIUM | TODO |
| UX-VIS-03 | Review category color contrast for WCAG AA | LOW | TODO |
| UX-VIS-04 | Allow users to customize category colors | LOW | TODO |

### Quick Wins (< 2 hours each)

| ID | Task | Priority | Status |
|----|------|----------|--------|
| UX-QW-01 | Add empty state illustrations to all pages | MEDIUM | TODO |
| UX-QW-02 | Add "Apply to similar transactions" preview in category picker | MEDIUM | TODO |
| UX-QW-03 | Add skeleton loaders for tables and lists | LOW | TODO |

---

## Feature Backlog (From Competitor Analysis)

*Based on analysis of Xero, Sage, QuickBooks, FreeAgent, YNAB, Mint, Emma, Money Dashboard, Moneybox, Plum*

### Priority 1: Critical Gaps (High Impact)

| ID | Task | Priority | Status | Inspiration |
|----|------|----------|--------|-------------|
| FEAT-BANK-01 | Open Banking API integration (TrueLayer/Plaid/Yapily) | CRITICAL | TODO | Emma, Money Dashboard |
| FEAT-BANK-02 | Automatic transaction import from banks | CRITICAL | TODO | All competitors |
| FEAT-BANK-03 | Real-time balance sync | HIGH | TODO | Emma, Plum |
| FEAT-MOB-03 | Native Android app | HIGH | TODO | All competitors |
| FEAT-GOAL-01 | Savings goals with target amounts and dates | HIGH | TODO | YNAB, Moneybox |
| FEAT-GOAL-02 | Visual progress circles/bars for goals | HIGH | TODO | Moneybox, Plum |
| FEAT-NOTIF-02 | Budget warning notifications | HIGH | TODO | YNAB, Emma |
| FEAT-NOTIF-03 | Bill reminder notifications | HIGH | TODO | Mint, Emma |
| FEAT-NOTIF-04 | Unusual spending alerts | HIGH | TODO | Emma, Plum |

### Priority 2: Competitive Differentiators

| ID | Task | Priority | Status | Inspiration |
|----|------|----------|--------|-------------|
| FEAT-INSIGHT-01 | AI-powered insights feed on dashboard | MEDIUM | TODO | Emma, Plum |
| FEAT-INSIGHT-02 | "You spent X% more this month" insights | MEDIUM | TODO | Emma |
| FEAT-INSIGHT-03 | Subscription price increase detection | MEDIUM | TODO | Emma |
| FEAT-INSIGHT-04 | "Could save X by switching" suggestions | LOW | TODO | Emma |
| FEAT-TAG-01 | Custom transaction tags (multi-label) | MEDIUM | TODO | Money Dashboard, Mint |
| FEAT-TAG-02 | Filter and report by tags | MEDIUM | TODO | Money Dashboard |
| FEAT-DEBT-01 | Debt paydown tracker | MEDIUM | TODO | YNAB |
| FEAT-DEBT-02 | Avalanche/snowball debt strategies | MEDIUM | TODO | YNAB |
| FEAT-DEBT-03 | Debt freedom date calculator | MEDIUM | TODO | YNAB |


### Priority 3: Engagement & Retention

| ID | Task | Priority | Status | Inspiration |
|----|------|----------|--------|-------------|
| FEAT-GAME-01 | 7-day no-spend streak challenge | MEDIUM | TODO | Plum |
| FEAT-GAME-02 | 52-week savings challenge | MEDIUM | TODO | Plum |
| FEAT-GAME-03 | Achievement badges for budget targets | MEDIUM | TODO | Plum |
| FEAT-GAME-04 | Celebration animations on milestones | LOW | TODO | Plum, YNAB |
| FEAT-BILL-01 | Dedicated upcoming bills calendar view | MEDIUM | TODO | Mint, Emma |
| FEAT-BILL-02 | Bill due date tracking | MEDIUM | TODO | Mint |
| FEAT-INVEST-01 | Investment portfolio tracking | MEDIUM | TODO | Mint, Emma |
| FEAT-INVEST-02 | Crypto holdings tracking | LOW | TODO | Emma |
| FEAT-INVEST-03 | Property value tracking | LOW | TODO | Emma |
| FEAT-PROG-01 | Progress visualizations with milestones | MEDIUM | TODO | Moneybox |
| FEAT-PROG-02 | Monthly spending progress bar | LOW | TODO | Emma |

### Priority 4: Nice-to-Have Features

| ID | Task | Priority | Status | Inspiration |
|----|------|----------|--------|-------------|
| FEAT-PAYDAY-01 | Payday-based budget cycles | LOW | TODO | Emma |
| FEAT-SUB-01 | Subscription cancellation assistance links | LOW | TODO | Emma |
| FEAT-FAMILY-01 | Family/shared account access | MEDIUM | TODO | - |
| FEAT-FAMILY-02 | Household budget collaboration | MEDIUM | TODO | - |
| FEAT-EXPORT-01 | PDF export of reports | MEDIUM | TODO | Xero, Sage |
| FEAT-EXPORT-02 | Scheduled email reports | LOW | TODO | Xero |
| FEAT-TAX-01 | Tax summary report for self-assessment | MEDIUM | TODO | FreeAgent |
| FEAT-ROUND-01 | Round-up savings feature | LOW | TODO | Moneybox, Plum |
| FEAT-AUTO-01 | AI auto-savings based on spending patterns | LOW | TODO | Plum |

### Terminology & Language Improvements

| ID | Task | Priority | Status |
|----|------|----------|--------|
| LANG-01 | Rename "Analytics" to "Insights" | LOW | DONE |
| LANG-02 | Add "Safe to Spend" / "Ready to Spend" metric | MEDIUM | TODO |
| LANG-03 | Rename "Subscriptions" to "Committed Spending" option | LOW | TODO |
| LANG-04 | Add warmer microcopy to empty states | MEDIUM | DONE |
| LANG-05 | Add encouraging messages on achievements | LOW | TODO |
| LANG-06 | Optional emoji in notifications (user toggle) | LOW | TODO |

### Visual & Branding Improvements

| ID | Task | Priority | Status |
|----|------|----------|--------|
| VIS-01 | Add progress circles for budget visualization | MEDIUM | TODO |
| VIS-02 | Add "spending wheel" donut chart visualization | LOW | TODO |
| VIS-03 | Add celebration animations for goals | LOW | TODO |
| VIS-04 | Add trend arrows (up/down) indicators | MEDIUM | TODO |
| VIS-05 | Develop custom illustration style | LOW | TODO |
| VIS-06 | Add subtle micro-animations for delight | LOW | TODO |
| VIS-07 | Global search functionality | MEDIUM | DONE |
| VIS-08 | Setup progress tracker for onboarding | MEDIUM | TODO |
| VIS-09 | Dynamic account selector for YoY Balance chart | LOW | DONE |
| VIS-10 | Modal styling with border and reduced backdrop opacity | LOW | DONE |

---

## Contributing

1. Check this roadmap for available tasks
2. Update task status when starting work
3. Mark tasks complete when done
4. Update version history for releases
