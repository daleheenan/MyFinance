# Flow Finance Manager - Implementation Todo List

## Project Status
**Current Version:** 1.1.0
**Last Updated:** 2026-01-11

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-01-11 | Add version display in header, bug fixes, app rebranding |
| 1.0.0 | 2026-01-10 | Initial release with all core features |

---

## Bug Fixes (Completed)

- [x] **CSRF Token Missing on Add Account** - Fixed `/api/auth/verify` to set CSRF cookie for authenticated users without one
- [x] **Account Type Labels** - Changed "Checking/Debit" to "Current/Savings/Credit Card" across all pages
- [x] **showError duplicate declaration** - Removed dead code function that conflicted with imported function

---

## Phase 1: Database Schema & Backend Foundation
| # | Task | Status |
|---|------|--------|
| 1.1 | Add new user columns: `full_name`, `email_verified`, `verification_token`, `verification_expires`, `trial_start_date`, `trial_end_date`, `subscription_status`, `is_locked` | [ ] |
| 1.2 | Create `password_reset_tokens` table | [ ] |
| 1.3 | Create database migration script | [ ] |
| 1.4 | Update existing admin user to have `subscription_status='active'` (grandfathered) | [ ] |

---

## Phase 2: Registration API
| # | Task | Status |
|---|------|--------|
| 2.1 | Create `POST /api/auth/register` endpoint | [ ] |
| 2.2 | Implement password validation (8+ chars, 1 number, 1 special) | [ ] |
| 2.3 | Create `POST /api/auth/verify-email` endpoint | [ ] |
| 2.4 | Create `POST /api/auth/resend-verification` endpoint | [ ] |
| 2.5 | Create `POST /api/auth/forgot-password` endpoint | [ ] |
| 2.6 | Create `POST /api/auth/reset-password` endpoint | [ ] |
| 2.7 | Create `GET /api/auth/subscription-status` endpoint | [ ] |
| 2.8 | Add rate limiting for registration/password reset | [ ] |

---

## Phase 3: Email Service Integration (Gmail SMTP)
| # | Task | Status |
|---|------|--------|
| 3.1 | Set up Gmail SMTP configuration (`support@flowfinancemanager.com`) | [ ] |
| 3.2 | Create email template system | [ ] |
| 3.3 | Create email verification template | [ ] |
| 3.4 | Create password reset template | [ ] |
| 3.5 | Create welcome email template | [ ] |
| 3.6 | Create trial expiring email template (3 days, 1 day) | [ ] |
| 3.7 | Create trial expired email template | [ ] |

---

## Phase 4: Registration Frontend
| # | Task | Status |
|---|------|--------|
| 4.1 | Create registration page (`#/register`) | [ ] |
| 4.2 | Add password strength indicator | [ ] |
| 4.3 | Add form validation with error messages | [ ] |
| 4.4 | Create email verification page (`#/verify-email/:token`) | [ ] |
| 4.5 | Create forgot password page (`#/forgot-password`) | [ ] |
| 4.6 | Create reset password page (`#/reset-password/:token`) | [ ] |
| 4.7 | Add "Create Account" link to login page | [ ] |

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

## Phase 6: Stripe Payment Integration
| # | Task | Status |
|---|------|--------|
| 6.1 | Install Stripe SDK and configure API keys | [ ] |
| 6.2 | Create Stripe customer on user registration | [ ] |
| 6.3 | Create checkout session endpoint | [ ] |
| 6.4 | Create Stripe webhook handler | [ ] |
| 6.5 | Handle `checkout.session.completed` event | [ ] |
| 6.6 | Handle `customer.subscription.updated` event | [ ] |
| 6.7 | Handle `customer.subscription.deleted` event | [ ] |
| 6.8 | Create subscription management page | [ ] |
| 6.9 | Create Stripe Customer Portal integration | [ ] |

---

## Phase 7: Admin User Management
| # | Task | Status |
|---|------|--------|
| 7.1 | Create admin-only middleware (user.id === 1) | [ ] |
| 7.2 | Create `GET /api/admin/users` endpoint | [ ] |
| 7.3 | Create `GET /api/admin/users/:id` endpoint | [ ] |
| 7.4 | Create `PUT /api/admin/users/:id` endpoint | [ ] |
| 7.5 | Create `PUT /api/admin/users/:id/extend-trial` endpoint (any future date) | [ ] |
| 7.6 | Create `PUT /api/admin/users/:id/activate` endpoint | [ ] |
| 7.7 | Create `POST /api/admin/users/:id/lock` endpoint | [ ] |
| 7.8 | Create `POST /api/admin/users/:id/unlock` endpoint | [ ] |
| 7.9 | Create `DELETE /api/admin/users/:id` endpoint | [ ] |
| 7.10 | Create admin users page (`#/admin/users`) | [ ] |
| 7.11 | Create user list table with filters | [ ] |
| 7.12 | Create user edit modal with trial date picker | [ ] |
| 7.13 | Add bulk actions (extend trial, send email) | [ ] |

---

## Phase 8: App Renaming to "Flow Finance Manager"
| # | Task | Status |
|---|------|--------|
| 8.1 | Update `public/index.html` title | [x] |
| 8.2 | Update login page branding | [x] |
| 8.3 | Update setup page branding | [x] |
| 8.4 | Update navigation/header branding | [x] |
| 8.5 | Update package.json name | [x] |
| 8.6 | Update README.md | [x] |
| 8.7 | Update server console logs | [x] |

---

## Phase 9: Public Marketing Website & CMS (From CMS_IMPLEMENTATION_TASKS.md)

### 9.1 Backend CMS API
| # | Task | Status |
|---|------|--------|
| 9.1.1 | Create `cms.service.js` with CRUD operations | [ ] |
| 9.1.2 | Create `cms.routes.js` with public/admin endpoints | [ ] |
| 9.1.3 | Create admin middleware (user.id === 1) | [ ] |
| 9.1.4 | Configure multer for image uploads | [ ] |

### 9.2 Server Routing
| # | Task | Status |
|---|------|--------|
| 9.2.1 | Add marketing routes (`/`, `/features`, `/pricing`) | [ ] |
| 9.2.2 | Add app routes (`/app`, `/app/*`) | [ ] |
| 9.2.3 | Add dynamic CMS page route (`/page/:slug`) | [ ] |

### 9.3 Marketing Static Pages
| # | Task | Status |
|---|------|--------|
| 9.3.1 | Create `public/marketing/css/marketing.css` | [ ] |
| 9.3.2 | Create `public/marketing/index.html` (landing page) | [ ] |
| 9.3.3 | Create `public/marketing/features.html` | [ ] |
| 9.3.4 | Create `public/marketing/pricing.html` | [ ] |

### 9.4 CMS Admin Interface
| # | Task | Status |
|---|------|--------|
| 9.4.1 | Create `public/features/cms/cms.page.js` | [ ] |
| 9.4.2 | Create `public/features/cms/cms.css` | [ ] |
| 9.4.3 | Add CodeMirror for HTML/CSS editing | [ ] |
| 9.4.4 | Create image gallery with upload | [ ] |
| 9.4.5 | Add live preview functionality | [ ] |
| 9.4.6 | Register CMS route in app.js | [ ] |

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
| 10.7 | Security audit: email enumeration prevention | [ ] |
| 10.8 | Security audit: rate limiting verification | [ ] |
| 10.9 | Security audit: token expiration verification | [ ] |

---

## User Decisions (Confirmed)

| Decision | Answer |
|----------|--------|
| Email Service | Gmail SMTP (`support@flowfinancemanager.com`) |
| Payment Integration | Stripe |
| Trial Extension | No limits - admin discretion |
| Password Policy | 8+ chars, 1 number, 1 special character |
| Database Name | Keep existing `command_center.db` |

---

## Implementation Priority

1. **Phase 8** - App renaming (quick win, establishes branding)
2. **Phase 1** - Database schema (foundation)
3. **Phase 2-4** - Registration flow (core functionality)
4. **Phase 5** - Trial system
5. **Phase 6** - Stripe payments
6. **Phase 7** - Admin user management
7. **Phase 9** - Marketing website & CMS
8. **Phase 10** - Testing & security audit
