/**
 * Flow Finance Manager App Entry Point
 * Initializes the SPA shell, registers routes, and starts the router
 */

import { router } from './router.js';
import { auth } from './auth.js';
import { updateTrialBanner, hideTrialBanner } from './trial-banner.js';
import { updateExpiredModal, hideExpiredModal } from './expired-modal.js';

// Store current subscription status
let currentSubscription = null;

/**
 * Fetch and display app version in the header
 */
async function displayVersion() {
  try {
    const response = await fetch('/api/version');
    if (response.ok) {
      const data = await response.json();
      const logoElement = document.querySelector('.nav-logo');
      if (logoElement) {
        logoElement.textContent = `Flow Money Manager ${data.version}`;
      }
    }
  } catch (error) {
    console.warn('Could not fetch version:', error.message);
  }
}

// Import page modules
import * as overviewPage from '../features/overview/overview.page.js';
import * as transactionsPage from '../features/transactions/transactions.page.js';
import * as analyticsPage from '../features/analytics/analytics.page.js';
import * as analyticsSummaryPage from '../features/analytics/analytics-summary.page.js';
import * as analyticsTrendsPage from '../features/analytics/analytics-trends.page.js';
import * as analyticsSpendPage from '../features/analytics/analytics-spend.page.js';
import * as analyticsMerchantsPage from '../features/analytics/analytics-merchants.page.js';
import * as budgetsPage from '../features/budgets/budgets.page.js';
import * as settingsPage from '../features/settings/settings.page.js';
import * as subscriptionsPage from '../features/subscriptions/subscriptions.page.js';
import * as networthPage from '../features/networth/networth.page.js';
import * as forecastingPage from '../features/forecasting/forecasting.page.js';
import * as loginPage from '../features/auth/login.page.js';
import * as forgotPasswordPage from '../features/auth/forgot-password.page.js';
import * as resetPasswordPage from '../features/auth/reset-password.page.js';
import * as registerPage from '../features/auth/register.page.js';
import * as verifyEmailPage from '../features/auth/verify-email.page.js';
import * as registrationSuccessPage from '../features/auth/registration-success.page.js';
import * as cmsPage from '../features/cms/cms.page.js';
import * as adminPage from '../features/admin/admin.page.js';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password', '/register', '/verify-email', '/registration-success'];

/**
 * Setup hamburger menu toggle for mobile
 */
function setupHamburgerMenu() {
  const hamburgerBtn = document.querySelector('.hamburger-btn');
  const navLinks = document.querySelector('.nav-links');

  if (hamburgerBtn && navLinks) {
    hamburgerBtn.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      hamburgerBtn.classList.toggle('active', isOpen);
      hamburgerBtn.setAttribute('aria-expanded', isOpen);
    });

    // Close menu when a link is clicked
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburgerBtn.classList.remove('active');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }
}

/**
 * Update active states for both desktop and mobile navigation
 */
function updateActiveNavLinks(path) {
  // Desktop nav
  document.querySelectorAll('.nav-link[data-route]').forEach(link => {
    const route = link.getAttribute('data-route');
    link.classList.toggle('active', route === path);
  });

  // Mobile bottom nav
  document.querySelectorAll('.mobile-nav-link[data-route]').forEach(link => {
    const route = link.getAttribute('data-route');
    link.classList.toggle('active', route === path);
  });
}

/**
 * Setup keyboard shortcuts for navigation
 */
function setupKeyboardShortcuts() {
  const shortcuts = {
    '1': '/overview',
    '2': '/transactions',
    '3': '/budgets',
    '4': '/analytics',
    '5': '/settings'
  };

  document.addEventListener('keydown', (e) => {
    // Only trigger if Ctrl/Cmd is held and not in an input
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (!isInput && shortcuts[e.key]) {
        e.preventDefault();
        window.location.hash = '#' + shortcuts[e.key];
      }
    }
  });
}

/**
 * Register all application routes
 */
function registerRoutes() {
  // Public routes
  router.register('/login', loginPage);
  router.register('/forgot-password', forgotPasswordPage);
  router.register('/reset-password', resetPasswordPage);
  router.register('/register', registerPage);
  router.register('/verify-email', verifyEmailPage);
  router.register('/registration-success', registrationSuccessPage);

  // Protected routes
  router.register('/overview', overviewPage);
  router.register('/transactions', transactionsPage);
  router.register('/analytics', analyticsPage);
  router.register('/analytics/summary', analyticsSummaryPage);
  router.register('/analytics/trends', analyticsTrendsPage);
  router.register('/analytics/spend', analyticsSpendPage);
  router.register('/analytics/merchants', analyticsMerchantsPage);
  router.register('/budgets', budgetsPage);
  router.register('/subscriptions', subscriptionsPage);
  router.register('/networth', networthPage);
  router.register('/forecasting', forecastingPage);
  router.register('/settings', settingsPage);

  // Admin routes
  router.register('/cms', cmsPage);
  router.register('/admin', adminPage);
}

/**
 * Update subscription UI (banner and modal)
 * @param {object|null} subscription - Subscription status object
 */
function updateSubscriptionUI(subscription) {
  currentSubscription = subscription;

  const user = auth.getUser();

  // Admin users don't see trial/subscription UI
  if (user?.isAdmin) {
    hideTrialBanner();
    hideExpiredModal();
    return;
  }

  if (!subscription) {
    hideTrialBanner();
    hideExpiredModal();
    return;
  }

  // Update trial banner (shows for trial users)
  updateTrialBanner(subscription);

  // Update expired modal (blocks app if expired)
  updateExpiredModal(subscription);
}

/**
 * Update UI based on auth state
 */
function updateAuthUI() {
  const nav = document.querySelector('.nav-container');
  const logoutBtn = document.getElementById('logout-btn');

  if (auth.isAuthenticated()) {
    // Show logout button
    if (!logoutBtn) {
      const logoutLi = document.createElement('li');
      logoutLi.innerHTML = `<button id="logout-btn" class="nav-link logout-btn">Logout</button>`;
      const navLinks = nav.querySelector('.nav-links');
      navLinks.appendChild(logoutLi);

      logoutLi.querySelector('#logout-btn').addEventListener('click', async () => {
        await auth.logout();
        hideTrialBanner();
        hideExpiredModal();
        window.location.hash = '#/login';
        updateAuthUI();
      });
    }

    // Show nav
    nav.style.display = '';
  } else {
    // Remove logout button if it exists
    if (logoutBtn) {
      logoutBtn.closest('li').remove();
    }

    // Hide nav on login page
    const currentPath = window.location.hash.replace('#', '') || '/overview';
    if (PUBLIC_ROUTES.includes(currentPath)) {
      nav.style.display = 'none';
    }
  }
}

/**
 * Initialize the application
 */
async function init() {
  // Register routes
  registerRoutes();

  // Setup mobile navigation
  setupHamburgerMenu();
  setupKeyboardShortcuts();

  // Display version in header
  displayVersion();

  // Check auth status
  auth.init();

  // Verify session if we have a token
  if (auth.getToken()) {
    const verifyResult = await auth.verify();
    if (!verifyResult.valid) {
      // Token invalid, redirect to login
      window.location.hash = '#/login';
      hideTrialBanner();
      hideExpiredModal();
    } else {
      // Update subscription UI
      updateSubscriptionUI(verifyResult.subscription);
    }
  }

  // Add auth check before navigation
  router.setAuthCheck(async (path) => {
    // Allow public routes
    if (PUBLIC_ROUTES.includes(path)) {
      return true;
    }

    // Check if authenticated
    if (!auth.isAuthenticated()) {
      window.location.hash = '#/login';
      return false;
    }

    return true;
  });

  // Update UI based on auth state
  updateAuthUI();

  // Start the router (await to ensure first page renders)
  await router.start();

  // Update UI after navigation
  window.addEventListener('hashchange', () => {
    updateAuthUI();
    const path = window.location.hash.replace('#', '') || '/overview';
    updateActiveNavLinks(path);

    // Hide trial/subscription UI on public routes
    if (PUBLIC_ROUTES.includes(path)) {
      hideTrialBanner();
      hideExpiredModal();
    } else if (auth.isAuthenticated()) {
      // Re-apply subscription UI on protected routes
      updateSubscriptionUI(auth.getSubscription());
    }
  });

  // Set initial active state
  const initialPath = window.location.hash.replace('#', '') || '/overview';
  updateActiveNavLinks(initialPath);

  console.log('Flow Money Manager initialized');
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export router for use by page modules
export { router };
