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
import * as manageAccountsPage from '../features/manage/accounts.page.js';
import * as manageCategoriesPage from '../features/manage/categories.page.js';
import * as manageRecurringPage from '../features/manage/recurring.page.js';
import * as insightsPage from '../features/insights/insights.page.js';
import * as goalsPage from '../features/goals/goals.page.js';
import * as billsPage from '../features/bills/bills.page.js';
import * as incomePage from '../features/income/income.page.js';

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
 * Setup touch support for dropdown menus on mobile/tablet
 */
function setupDropdownTouchSupport() {
  const dropdowns = document.querySelectorAll('.nav-dropdown');
  
  dropdowns.forEach(dropdown => {
    const toggle = dropdown.querySelector('.nav-dropdown-toggle');
    if (!toggle) return;
    
    // Handle click/touch on dropdown toggle
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Close other dropdowns
      dropdowns.forEach(other => {
        if (other !== dropdown) {
          other.classList.remove('open');
        }
      });
      
      // Toggle this dropdown
      dropdown.classList.toggle('open');
    });
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      dropdowns.forEach(dropdown => dropdown.classList.remove('open'));
    }
  });
  
  // Close dropdowns when clicking a link inside
  document.querySelectorAll('.nav-dropdown-menu .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      dropdowns.forEach(dropdown => dropdown.classList.remove('open'));
    });
  });
}
/**
 * Update active states for both desktop and mobile navigation
 */
function updateActiveNavLinks(path) {
  // Desktop nav
  document.querySelectorAll('.nav-link[data-route]').forEach(link => {
    const route = link.getAttribute('data-route');
    // Exact match only - each nav link should only be active when on its exact route
    const isActive = route === path;
    link.classList.toggle('active', isActive);
  });

  // Mobile bottom nav - highlight appropriate section
  document.querySelectorAll('.mobile-nav-link[data-route]').forEach(link => {
    const route = link.getAttribute('data-route');
    const isActive = route === path ||
      (path.startsWith('/analytics/') && route.startsWith('/analytics/')) ||
      (path.startsWith('/manage/') && route === '/transactions') ||
      (path === '/budgets' && route === '/budgets');
    link.classList.toggle('active', isActive);
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
    '4': '/analytics/summary',
    '5': '/settings'
  };

  document.addEventListener('keydown', (e) => {
    // Ctrl+K or Cmd+K to open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openGlobalSearch();
      return;
    }

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
 * Setup global search functionality
 */
function setupGlobalSearch() {
  const searchBtn = document.getElementById('global-search-btn');
  const searchModal = document.getElementById('global-search-modal');
  const searchInput = document.getElementById('global-search-input');
  const searchResults = document.getElementById('search-results');
  const backdrop = searchModal?.querySelector('.search-modal__backdrop');

  if (!searchBtn || !searchModal) return;

  // Open search modal
  searchBtn.addEventListener('click', openGlobalSearch);

  // Close on backdrop click
  backdrop?.addEventListener('click', closeGlobalSearch);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !searchModal.classList.contains('hidden')) {
      closeGlobalSearch();
    }
  });

  // Search input handler with debounce
  let searchTimeout;
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    if (query.length < 2) {
      renderSearchPlaceholder();
      return;
    }

    searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);
  });

  // Keyboard navigation in results
  searchInput?.addEventListener('keydown', (e) => {
    const items = searchResults.querySelectorAll('.search-result-item');
    const active = searchResults.querySelector('.search-result-item.active');
    let activeIndex = Array.from(items).indexOf(active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeIndex < items.length - 1) {
        active?.classList.remove('active');
        items[activeIndex + 1]?.classList.add('active');
        items[activeIndex + 1]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeIndex > 0) {
        active?.classList.remove('active');
        items[activeIndex - 1]?.classList.add('active');
        items[activeIndex - 1]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const activeItem = searchResults.querySelector('.search-result-item.active');
      if (activeItem) {
        activeItem.click();
      }
    }
  });
}

function openGlobalSearch() {
  const searchModal = document.getElementById('global-search-modal');
  const searchInput = document.getElementById('global-search-input');

  if (searchModal) {
    searchModal.classList.remove('hidden');
    searchInput?.focus();
    searchInput.value = '';
    renderSearchPlaceholder();
  }
}

function closeGlobalSearch() {
  const searchModal = document.getElementById('global-search-modal');
  if (searchModal) {
    searchModal.classList.add('hidden');
  }
}

function renderSearchPlaceholder() {
  const searchResults = document.getElementById('search-results');
  if (searchResults) {
    searchResults.innerHTML = `
      <div class="search-placeholder">
        <p>Start typing to search...</p>
        <div class="search-shortcuts">
          <div class="search-shortcut"><kbd>↑</kbd><kbd>↓</kbd> to navigate</div>
          <div class="search-shortcut"><kbd>Enter</kbd> to select</div>
          <div class="search-shortcut"><kbd>Esc</kbd> to close</div>
        </div>
      </div>
    `;
  }
}

async function performSearch(query) {
  const searchResults = document.getElementById('search-results');
  if (!searchResults) return;

  // Show loading state
  searchResults.innerHTML = `
    <div class="search-placeholder">
      <p>Searching...</p>
    </div>
  `;

  try {
    const { api } = await import('./api.js');
    const { escapeHtml, formatCurrency, formatDate } = await import('./utils.js');

    // Search transactions
    const transactions = await api.get(`/transactions/search?q=${encodeURIComponent(query)}&limit=5`).catch(() => []);

    // Search categories
    const categories = await api.get('/categories').catch(() => []);
    const matchingCategories = categories.filter(c =>
      c.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 3);

    // Build results HTML
    let html = '';

    // Transactions section
    if (transactions.length > 0) {
      html += `
        <div class="search-result-group">
          <div class="search-result-group__title">Transactions</div>
          ${transactions.map((txn, i) => `
            <div class="search-result-item ${i === 0 ? 'active' : ''}" data-type="transaction" data-id="${txn.id}" data-account="${txn.account_id}">
              <div class="search-result-item__icon">💳</div>
              <div class="search-result-item__content">
                <div class="search-result-item__title">${escapeHtml(txn.description || txn.original_description)}</div>
                <div class="search-result-item__subtitle">${formatDate(txn.transaction_date)} • ${escapeHtml(txn.category_name || 'Uncategorised')}</div>
              </div>
              <div class="search-result-item__amount ${txn.credit_amount > 0 ? 'amount-positive' : 'amount-negative'}">
                ${txn.credit_amount > 0 ? '+' : '-'}${formatCurrency(txn.credit_amount > 0 ? txn.credit_amount : txn.debit_amount)}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Categories section
    if (matchingCategories.length > 0) {
      html += `
        <div class="search-result-group">
          <div class="search-result-group__title">Categories</div>
          ${matchingCategories.map(cat => `
            <div class="search-result-item" data-type="category" data-id="${cat.id}">
              <div class="search-result-item__icon" style="background-color: ${cat.colour}20; color: ${cat.colour}">${cat.icon || '📁'}</div>
              <div class="search-result-item__content">
                <div class="search-result-item__title">${escapeHtml(cat.name)}</div>
                <div class="search-result-item__subtitle">${cat.type === 'expense' ? 'Expense' : 'Income'} category</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Quick actions
    html += `
      <div class="search-result-group">
        <div class="search-result-group__title">Quick Actions</div>
        <div class="search-result-item" data-type="action" data-action="transactions-search" data-query="${escapeHtml(query)}">
          <div class="search-result-item__icon">🔍</div>
          <div class="search-result-item__content">
            <div class="search-result-item__title">Search all transactions for "${escapeHtml(query)}"</div>
            <div class="search-result-item__subtitle">View full search results</div>
          </div>
        </div>
      </div>
    `;

    if (transactions.length === 0 && matchingCategories.length === 0) {
      html = `
        <div class="search-no-results">
          <div class="search-no-results__icon">🔍</div>
          <p>No results found for "${escapeHtml(query)}"</p>
        </div>
        ${html}
      `;
    }

    searchResults.innerHTML = html;

    // Add click handlers
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => handleSearchResultClick(item));
    });
  } catch (err) {
    searchResults.innerHTML = `
      <div class="search-no-results">
        <div class="search-no-results__icon">⚠️</div>
        <p>Search failed. Please try again.</p>
      </div>
    `;
  }
}

function handleSearchResultClick(item) {
  const type = item.dataset.type;
  const id = item.dataset.id;

  closeGlobalSearch();

  switch (type) {
    case 'transaction':
      const accountId = item.dataset.account;
      window.location.hash = `#/transactions?account=${accountId}`;
      break;
    case 'category':
      window.location.hash = `#/transactions?category=${id}`;
      break;
    case 'action':
      if (item.dataset.action === 'transactions-search') {
        const query = item.dataset.query;
        window.location.hash = `#/transactions?search=${encodeURIComponent(query)}`;
      }
      break;
  }
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
  router.register('/insights', insightsPage);
  router.register('/goals', goalsPage);
  router.register('/bills', billsPage);
  router.register('/income', incomePage);
  router.register('/settings', settingsPage);

  // Manage routes
  router.register('/manage/accounts', manageAccountsPage);
  router.register('/manage/categories', manageCategoriesPage);
  router.register('/manage/recurring', manageRecurringPage);

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
  setupDropdownTouchSupport();
  setupKeyboardShortcuts();
  setupGlobalSearch();

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
