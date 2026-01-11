# Flow Money Manager - Implementation Todo List

## Project Status
**Current Version:** 1.2.0
**Last Updated:** 2026-01-11

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.0 | 2026-01-11 | Add admin user management, fix data isolation, dynamic git versioning |
| 1.1.0 | 2026-01-11 | Add version display in header, bug fixes, app rebranding |
| 1.0.0 | 2026-01-10 | Initial release with all core features |

---

## Bug Fixes (Completed)

- [x] **CSRF Token Missing on Add Account** - Fixed `/api/auth/verify` to set CSRF cookie for authenticated users without one
- [x] **Account Type Labels** - Changed "Checking/Debit" to "Current/Savings/Credit Card" across all pages
- [x] **showError duplicate declaration** - Removed dead code function that conflicted with imported function
- [x] **Theo Entertainment Reappearing** - Fixed seeds.sql running on every server restart - now only seeds fresh databases
- [x] **App Title** - Changed from "Flow Finance" to "Flow Money Manager" throughout the app
- [x] **Transaction Categorize Security** - Added user ownership verification to POST /api/transactions/:id/categorize

---

## Phase 0: Critical Data Isolation Fixes (COMPLETED)

These bugs would allow cross-user data access and MUST be fixed before multi-user support.

| # | Task | Status |
|---|------|--------|
| 0.1 | Fix `transfer.service.js` - `detectTransfers()` to filter by user's accounts only | [x] |
| 0.2 | Fix `transfer.service.js` - `linkTransferPair()` to verify user owns both transactions | [x] |
| 0.3 | Fix `transfer.service.js` - `unlinkTransfer()` to verify user ownership | [x] |
| 0.4 | Fix `categorization.service.js` - `suggestCategory()` to use user's rules only | [x] |
| 0.5 | Fix `categorization.service.js` - `learnFromCategorization()` to associate rules with user | [x] |
| 0.6 | Fix `categorization.service.js` - `autoCategorize()` to filter by user's accounts | [x] |
| 0.7 | Fix `categorization.service.js` - `findSimilarTransactions()` to filter by user's accounts | [x] |
| 0.8 | Fix `categorization.service.js` - `applyToSimilarTransactions()` to filter by user's accounts | [x] |
| 0.9 | Fix `categorization.service.js` - `getUncategorizedTransactions()` to filter by user's accounts | [x] |
| 0.10 | Fix `categories.service.js` - `getCategoryByDescription()` to use user's rules only | [x] |
| 0.11 | Fix `categories.service.js` - `autoAssignCategory()` to verify user ownership | [x] |
| 0.12 | Fix `categories.service.js` - `bulkAssignCategories()` to filter by user's accounts | [x] |
| 0.13 | Update all route callers to pass userId parameter | [x] |
| 0.14 | Fix `transactions.routes.js` - `POST /:id/categorize` to verify user ownership | [x] |

---

## Phase 1: Database Schema & Backend Foundation (PARTIALLY COMPLETE)
| # | Task | Status |
|---|------|--------|
| 1.1 | Add new user columns via migration: `full_name`, `is_admin`, `trial_start_date`, `trial_end_date`, `subscription_status`, `last_password_reset` | [x] |
| 1.2 | Create `password_reset_tokens` table | [x] |
| 1.3 | Create database migration in database.js | [x] |
| 1.4 | Set first user as admin automatically | [x] |
| 1.5 | Add `email_verified`, `verification_token`, `verification_expires` columns | [ ] |

---

## Phase 2: Registration API (PARTIALLY COMPLETE)
| # | Task | Status |
|---|------|--------|
| 2.1 | Create `POST /api/auth/register` endpoint | [ ] |
| 2.2 | Implement password validation (8+ chars, uppercase, lowercase, number) | [x] |
| 2.3 | Create `POST /api/auth/verify-email` endpoint | [ ] |
| 2.4 | Create `POST /api/auth/resend-verification` endpoint | [ ] |
| 2.5 | Create `POST /api/auth/forgot-password` endpoint | [x] |
| 2.6 | Create `POST /api/auth/reset-password` endpoint | [x] |
| 2.7 | Create `GET /api/auth/subscription-status` endpoint | [ ] |
| 2.8 | Add rate limiting for registration/password reset | [x] |

---

## Phase 3: Email Service Integration (Gmail SMTP) (PARTIALLY COMPLETE)
| # | Task | Status |
|---|------|--------|
| 3.1 | Set up Gmail SMTP configuration | [x] |
| 3.2 | Create email template system | [x] |
| 3.3 | Create email verification template | [ ] |
| 3.4 | Create password reset template | [x] |
| 3.5 | Create welcome email template | [ ] |
| 3.6 | Create trial expiring email template (3 days, 1 day) | [ ] |
| 3.7 | Create trial expired email template | [ ] |

---

## Phase 4: Registration Frontend (PARTIALLY COMPLETE)
| # | Task | Status |
|---|------|--------|
| 4.1 | Create registration page (`/register`) | [x] |
| 4.2 | Add password strength indicator | [ ] |
| 4.3 | Add form validation with error messages | [x] |
| 4.4 | Create email verification page | [ ] |
| 4.5 | Create forgot password page (`/forgot-password`) | [x] |
| 4.6 | Create reset password page (`/reset-password`) | [x] |
| 4.7 | Add "Create Account" link to login page | [x] |

---

## Phase 5: Trial System (7 Days)
| # | Task | Status |
|---|------|--------|
| 5.1 | Create subscription check middleware | [ ] |
| 5.2 | Implement 7-day trial countdown logic | [ ] |
| 5.3 | Create trial banner component (shows days remaining) | [ ] |
| 5.4 | Create expired account modal (blocks access) | [ ] |
| 5.5 | Add trial status to user session/context | [ ] |
| 5.6 | Create scheduled job for trial expiration emails | [ ] |

---

## Phase 6: Stripe Payment Integration (PARTIALLY COMPLETE)
| # | Task | Status |
|---|------|--------|
| 6.1 | Install Stripe SDK and configure API keys | [x] |
| 6.2 | Create Stripe customer on user registration | [ ] |
| 6.3 | Create checkout session endpoint | [x] |
| 6.4 | Create Stripe webhook handler | [x] |
| 6.5 | Handle `checkout.session.completed` event | [x] |
| 6.6 | Handle `customer.subscription.updated` event | [x] |
| 6.7 | Handle `customer.subscription.deleted` event | [x] |
| 6.8 | Create subscription management page | [ ] |
| 6.9 | Create Stripe Customer Portal integration | [x] |

---

## Phase 7: Admin User Management (COMPLETED)
| # | Task | Status |
|---|------|--------|
| 7.1 | Create admin-only middleware (`isAdmin()`) | [x] |
| 7.2 | Create `GET /api/admin/users` endpoint | [x] |
| 7.3 | Create `GET /api/admin/users/:id` endpoint | [x] |
| 7.4 | Create `PUT /api/admin/users/:id` endpoint | [x] |
| 7.5 | Create `POST /api/admin/users/:id/extend-trial` endpoint | [x] |
| 7.6 | Create `POST /api/admin/users/:id/activate` endpoint | [x] |
| 7.7 | Create `POST /api/admin/users/:id/lock` endpoint | [x] |
| 7.8 | Create `POST /api/admin/users/:id/unlock` endpoint | [x] |
| 7.9 | Create `DELETE /api/admin/users/:id` endpoint | [x] |
| 7.10 | Create `POST /api/admin/users` endpoint (create user) | [x] |
| 7.11 | Create `POST /api/admin/users/:id/reset-password` endpoint | [x] |
| 7.12 | Create `POST /api/admin/users/:id/revoke-sessions` endpoint | [x] |
| 7.13 | Create `GET /api/admin/users/:id/login-history` endpoint | [x] |
| 7.14 | Create `GET /api/admin/users/:id/sessions` endpoint | [x] |
| 7.15 | Create admin users page (`#/admin`) | [x] |
| 7.16 | Create user list table | [x] |
| 7.17 | Create user detail modal with login history | [x] |
| 7.18 | Add Admin link to navigation for admin users | [x] |
| 7.19 | Return `isAdmin` flag in auth verify/login responses | [x] |

---

## Phase 8: App Renaming to "Flow Money Manager" (COMPLETED)
| # | Task | Status |
|---|------|--------|
| 8.1 | Update `public/index.html` title | [x] |
| 8.2 | Update login page branding | [x] |
| 8.3 | Update setup page branding | [x] |
| 8.4 | Update navigation/header branding | [x] |
| 8.5 | Update package.json name | [x] |
| 8.6 | Update README.md | [x] |
| 8.7 | Update server console logs | [x] |
| 8.8 | Update marketing pages to "Flow Money Manager" | [x] |

---

## Phase 9: Public Marketing Website & CMS (COMPLETED)

### 9.1 Backend CMS API
| # | Task | Status |
|---|------|--------|
| 9.1.1 | Create `cms.service.js` with CRUD operations | [x] |
| 9.1.2 | Create `cms.routes.js` with public/admin endpoints | [x] |
| 9.1.3 | Create admin middleware | [x] |
| 9.1.4 | Configure multer for image uploads | [x] |

### 9.2 Server Routing
| # | Task | Status |
|---|------|--------|
| 9.2.1 | Add marketing routes (`/`, `/features`, `/pricing`) | [x] |
| 9.2.2 | Add app routes (`/app`, `/app/*`) | [x] |
| 9.2.3 | Add dynamic CMS page route (`/page/:slug`) | [x] |

### 9.3 Marketing Static Pages
| # | Task | Status |
|---|------|--------|
| 9.3.1 | Create `public/marketing/css/marketing.css` | [x] |
| 9.3.2 | Create `public/marketing/index.html` (landing page) | [x] |
| 9.3.3 | Create `public/marketing/features.html` | [x] |
| 9.3.4 | Create `public/marketing/pricing.html` | [x] |

### 9.4 CMS Admin Interface
| # | Task | Status |
|---|------|--------|
| 9.4.1 | Create `public/features/cms/cms.page.js` | [x] |
| 9.4.2 | Create `public/features/cms/cms.css` | [x] |
| 9.4.3 | Add CodeMirror for HTML/CSS editing | [x] |
| 9.4.4 | Create image gallery with upload | [x] |
| 9.4.5 | Add live preview functionality | [x] |
| 9.4.6 | Register CMS route in app.js | [x] |

---

## Phase 10: Testing & Security
| # | Task | Status |
|---|------|--------|
| 10.1 | Write unit tests for registration flow | [ ] |
| 10.2 | Write unit tests for trial logic | [ ] |
| 10.3 | Write unit tests for admin endpoints | [ ] |
| 10.4 | Write E2E tests for registration | [ ] |
| 10.5 | Write E2E tests for marketing pages | [ ] |
| 10.6 | Write E2E tests for CMS admin | [ ] |
| 10.7 | Security audit: email enumeration prevention | [x] |
| 10.8 | Security audit: rate limiting verification | [x] |
| 10.9 | Security audit: token expiration verification | [x] |
| 10.10 | Security audit: user data isolation verification | [x] |

---

## Phase 11: Dynamic Versioning (COMPLETED)
| # | Task | Status |
|---|------|--------|
| 11.1 | Read version from package.json | [x] |
| 11.2 | Append git commit count and hash to version | [x] |
| 11.3 | Display version in app header | [x] |
| 11.4 | Version auto-updates on git commit | [x] |

---

## Phase 12: Seeding & Sample Data (COMPLETED)
| # | Task | Status |
|---|------|--------|
| 12.1 | Only run seeds on fresh databases (no accounts) | [x] |
| 12.2 | Prevent sample accounts from reappearing after deletion | [x] |

---

## User Decisions (Confirmed)

| Decision | Answer |
|----------|--------|
| Email Service | Gmail SMTP |
| Payment Integration | Stripe |
| Trial Extension | No limits - admin discretion |
| Password Policy | 8+ chars, 1 uppercase, 1 lowercase, 1 number |
| Admin Detection | First user (id=1) automatically admin, or `is_admin` flag |
| Version Format | `{major}.{minor}.{patch}.{commit_count}+{commit_hash}` |

---

## Implementation Priority (Updated)

### Completed
1. **Phase 0** - Critical data isolation fixes
2. **Phase 7** - Admin user management (full implementation)
3. **Phase 8** - App rebranding to "Flow Money Manager"
4. **Phase 9** - Marketing website & CMS
5. **Phase 11** - Dynamic versioning
6. **Phase 12** - Seeding fixes

### Remaining (In Order)
1. **Phase 1.5** - Email verification columns
2. **Phase 2** - Complete registration API
3. **Phase 3** - Complete email templates
4. **Phase 4** - Complete registration frontend
5. **Phase 5** - Trial system enforcement
6. **Phase 6** - Complete Stripe integration
7. **Phase 10** - Testing & security audit
