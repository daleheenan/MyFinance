# Flow Money Manager - Development Roadmap

**Version:** 1.2.0
**Last Updated:** 2026-01-11
**Status:** Active Development

---

## Overview

Flow Money Manager is a personal finance management application with budgeting, transactions, analytics, and multi-user support. This roadmap tracks all development phases from inception to production.

---

## Quick Status

| Phase | Description | Progress | Status |
|-------|-------------|----------|--------|
| 0 | Data Isolation Fixes | 14/14 | COMPLETE |
| 1 | Database Schema | 4/5 | 80% |
| 2 | Registration API | 4/8 | 50% |
| 3 | Email Templates | 3/7 | 40% |
| 4 | Registration Frontend | 5/7 | 70% |
| 5 | Trial System | 0/6 | NOT STARTED |
| 6 | Stripe Integration | 6/9 | 60% |
| 7 | Admin Management | 19/19 | COMPLETE |
| 8 | App Rebranding | 8/8 | COMPLETE |
| 9 | Marketing & CMS | 14/14 | COMPLETE |
| 10 | Testing & Security | 4/10 | 40% |
| 11 | Dynamic Versioning | 4/4 | COMPLETE |
| 12 | Seeding Fixes | 2/2 | COMPLETE |

**Overall Progress:** ~75% Complete

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
**Status:** 50% Complete

| Task | Status | Notes |
|------|--------|-------|
| `POST /api/auth/register` | TODO | Create new user with trial |
| Password validation | DONE | 8+ chars, upper, lower, number |
| `POST /api/auth/verify-email` | TODO | Verify token from email |
| `POST /api/auth/resend-verification` | TODO | Resend verification email |
| `POST /api/auth/forgot-password` | DONE | Request reset email |
| `POST /api/auth/reset-password` | DONE | Reset with token |
| `GET /api/auth/subscription-status` | TODO | Check trial/subscription |
| Rate limiting | DONE | 5 attempts / 15 min |

### Phase 3: Email Service Integration
**Status:** 40% Complete

| Task | Status | Notes |
|------|--------|-------|
| Gmail SMTP configuration | DONE | In email.js |
| Email template system | DONE | HTML templates |
| Email verification template | TODO | |
| Password reset template | DONE | |
| Welcome email template | TODO | |
| Trial expiring (3 days) | TODO | |
| Trial expiring (1 day) | TODO | |
| Trial expired | TODO | |

### Phase 4: Registration Frontend
**Status:** 70% Complete

| Task | Status | Notes |
|------|--------|-------|
| Registration page | DONE | /register |
| Password strength indicator | TODO | Visual meter |
| Form validation | DONE | Client-side |
| Email verification page | TODO | Token validation |
| Forgot password page | DONE | /forgot-password |
| Reset password page | DONE | /reset-password |
| "Create Account" link | DONE | On login page |

### Phase 5: Trial System (7 Days)
**Status:** NOT STARTED

| Task | Status | Notes |
|------|--------|-------|
| Subscription check middleware | TODO | Block expired trials |
| 7-day trial countdown | TODO | Calculate remaining |
| Trial banner component | TODO | Show days remaining |
| Expired account modal | TODO | Block access |
| Trial status in session | TODO | Include in verify |
| Scheduled expiration emails | TODO | Cron job |

### Phase 6: Stripe Payment Integration
**Status:** 60% Complete

| Task | Status | Notes |
|------|--------|-------|
| Stripe SDK installed | DONE | v17.0.0 |
| Create customer on registration | TODO | Link Stripe to user |
| Checkout session endpoint | DONE | |
| Webhook handler | DONE | |
| checkout.session.completed | DONE | |
| subscription.updated | DONE | |
| subscription.deleted | DONE | |
| Subscription management page | TODO | |
| Customer Portal integration | DONE | |

### Phase 10: Testing & Security
**Status:** 40% Complete

| Task | Status | Notes |
|------|--------|-------|
| Unit tests: registration | TODO | |
| Unit tests: trial logic | TODO | |
| Unit tests: admin endpoints | TODO | |
| E2E tests: registration | TODO | |
| E2E tests: marketing | TODO | |
| E2E tests: CMS admin | TODO | |
| Email enumeration prevention | DONE | Always return success |
| Rate limiting verification | DONE | Tested |
| Token expiration verification | DONE | Tested |
| User data isolation audit | DONE | All services verified |

---

## Remaining Work Estimate

| Phase | Remaining Tasks | Est. Tokens |
|-------|-----------------|-------------|
| Phase 1 | 1 task | 1,000 |
| Phase 2 | 4 tasks | 4,000 |
| Phase 3 | 4 tasks | 4,000 |
| Phase 4 | 2 tasks | 2,000 |
| Phase 5 | 6 tasks | 12,000 |
| Phase 6 | 3 tasks | 4,000 |
| Phase 10 | 6 tasks | 10,000 |
| **Total** | **26 tasks** | **~37,000** |

---

## Technical Stack

- **Backend:** Node.js 22, Express 5.0, SQLite
- **Frontend:** Vanilla JavaScript ES6, CSS3, SVG Charts
- **Authentication:** bcryptjs, session cookies, CSRF protection
- **Payments:** Stripe
- **Email:** Nodemailer (Gmail SMTP)
- **Testing:** Vitest, Playwright
- **Deployment:** Railway, Docker

---

## Key Configuration

| Setting | Value |
|---------|-------|
| Trial Period | 7 days |
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
| 1.2.0 | 2026-01-11 | Admin user management, data isolation fixes, dynamic versioning |
| 1.1.0 | 2026-01-11 | Version display, bug fixes, app rebranding |
| 1.0.0 | 2026-01-10 | Initial release with core features |

---

## Contributing

1. Check this roadmap for available tasks
2. Update task status when starting work
3. Mark tasks complete when done
4. Update version history for releases
