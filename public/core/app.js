/**
 * FinanceFlow App Entry Point
 * Initializes the SPA shell, registers routes, and starts the router
 */

import { router } from './router.js';

// Import page modules
import * as overviewPage from '../features/overview/overview.page.js';
import * as transactionsPage from '../features/transactions/transactions.page.js';
import * as analyticsPage from '../features/analytics/analytics.page.js';
import * as budgetsPage from '../features/budgets/budgets.page.js';
import * as settingsPage from '../features/settings/settings.page.js';

/**
 * Register all application routes
 */
function registerRoutes() {
  router.register('/overview', overviewPage);
  router.register('/transactions', transactionsPage);
  router.register('/analytics', analyticsPage);
  router.register('/budgets', budgetsPage);
  router.register('/settings', settingsPage);
}

/**
 * Initialize the application
 */
function init() {
  // Register routes
  registerRoutes();

  // Start the router
  router.start();

  console.log('FinanceFlow initialized');
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export router for use by page modules
export { router };
