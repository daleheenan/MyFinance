/**
 * Breadcrumb Navigation Utility
 * Provides reusable breadcrumb generation for filtered/detail pages
 */

import { escapeHtml } from './utils.js';

/**
 * Route configuration for breadcrumb labels
 */
const ROUTE_LABELS = {
  '/overview': 'Overview',
  '/transactions': 'Transactions',
  '/budgets': 'Budgets',
  '/analytics': 'Insights',
  '/analytics/summary': 'Summary',
  '/analytics/trends': 'Trends',
  '/analytics/spend': 'Spending',
  '/analytics/merchants': 'Merchants',
  '/subscriptions': 'Bills & Subscriptions',
  '/networth': 'Net Worth',
  '/forecasting': 'Forecasting',
  '/settings': 'Settings',
  '/manage/accounts': 'Accounts',
  '/manage/categories': 'Categories',
  '/manage/recurring': 'Recurring',
  '/admin': 'Admin',
  '/cms': 'CMS'
};

/**
 * Parent route mapping for hierarchical navigation
 */
const PARENT_ROUTES = {
  '/analytics/summary': '/overview',
  '/analytics/trends': '/overview',
  '/analytics/spend': '/overview',
  '/analytics/merchants': '/overview',
  '/manage/accounts': '/transactions',
  '/manage/categories': '/transactions',
  '/manage/recurring': '/transactions',
  '/subscriptions': '/overview',
  '/networth': '/overview',
  '/forecasting': '/overview'
};

/**
 * Get label for a route
 * @param {string} route - Route path
 * @returns {string} Human-readable label
 */
export function getRouteLabel(route) {
  return ROUTE_LABELS[route] || route.split('/').pop() || 'Page';
}

/**
 * Get parent route for a given route
 * @param {string} route - Current route
 * @returns {string|null} Parent route or null
 */
export function getParentRoute(route) {
  return PARENT_ROUTES[route] || null;
}

/**
 * Build breadcrumb trail for a route
 * @param {string} currentRoute - Current route path
 * @param {Object} options - Additional options
 * @param {Array<{label: string, href: string}>} options.additional - Additional crumbs to append
 * @param {string} options.currentLabel - Override label for current page
 * @returns {Array<{label: string, href: string|null}>} Array of breadcrumb items
 */
export function buildBreadcrumbTrail(currentRoute, options = {}) {
  const trail = [];

  // Always start with Overview (home)
  if (currentRoute !== '/overview') {
    trail.push({ label: 'Overview', href: '#/overview' });
  }

  // Add parent route if exists
  const parentRoute = getParentRoute(currentRoute);
  if (parentRoute && parentRoute !== '/overview') {
    trail.push({ label: getRouteLabel(parentRoute), href: `#${parentRoute}` });
  }

  // Add current page (no href - it's the current location)
  trail.push({
    label: options.currentLabel || getRouteLabel(currentRoute),
    href: null
  });

  // Add any additional crumbs (e.g., filter context)
  if (options.additional && options.additional.length > 0) {
    // The last item becomes clickable, and we add the new items
    const lastItem = trail[trail.length - 1];
    lastItem.href = `#${currentRoute}`;

    options.additional.forEach((item, index) => {
      trail.push({
        label: item.label,
        href: index < options.additional.length - 1 ? item.href : null
      });
    });
  }

  return trail;
}

/**
 * Render breadcrumb HTML
 * @param {Array<{label: string, href: string|null}>} trail - Breadcrumb trail
 * @param {Object} options - Rendering options
 * @param {boolean} options.showBackButton - Show back button
 * @param {string} options.backHref - Custom back href (default: previous in trail)
 * @returns {string} HTML string
 */
export function renderBreadcrumb(trail, options = {}) {
  if (!trail || trail.length === 0) return '';

  const showBack = options.showBackButton && trail.length > 1;
  const backHref = options.backHref || (trail.length > 1 ? trail[trail.length - 2].href : null);

  const backButton = showBack ? `
    <button type="button" class="breadcrumb__back-btn" onclick="window.location.hash='${backHref?.replace('#', '')}'" aria-label="Go back">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m15 18-6-6 6-6"/>
      </svg>
    </button>
  ` : '';

  const items = trail.map((item, index) => {
    const isLast = index === trail.length - 1;
    const separator = !isLast ? '<span class="breadcrumb-separator">›</span>' : '';

    if (item.href && !isLast) {
      return `
        <span class="breadcrumb-item">
          <a href="${item.href}" class="breadcrumb-link">${escapeHtml(item.label)}</a>
          ${separator}
        </span>
      `;
    } else {
      return `
        <span class="breadcrumb-item">
          <span class="breadcrumb-current">${escapeHtml(item.label)}</span>
        </span>
      `;
    }
  }).join('');

  const className = showBack ? 'breadcrumb breadcrumb--with-back' : 'breadcrumb';

  return `
    <nav class="${className}" aria-label="Breadcrumb">
      ${backButton}
      ${items}
    </nav>
  `;
}

/**
 * Create breadcrumb for a filtered view
 * @param {string} basePage - Base page route (e.g., '/transactions')
 * @param {Object} filterContext - Filter context to show
 * @param {string} filterContext.label - Filter description (e.g., "Groceries", "January 2024")
 * @param {string} filterContext.type - Filter type for styling (e.g., "category", "date", "account")
 * @returns {string} HTML string
 */
export function createFilteredBreadcrumb(basePage, filterContext) {
  const trail = buildBreadcrumbTrail(basePage, {
    additional: filterContext ? [{ label: filterContext.label, href: null }] : []
  });

  return renderBreadcrumb(trail, { showBackButton: true });
}

/**
 * Create breadcrumb for analytics sub-pages
 * @param {string} currentPage - Current analytics page
 * @returns {string} HTML string
 */
export function createAnalyticsBreadcrumb(currentPage) {
  const trail = buildBreadcrumbTrail(currentPage);
  return renderBreadcrumb(trail, { showBackButton: false });
}

/**
 * Create breadcrumb for manage sub-pages
 * @param {string} currentPage - Current manage page
 * @returns {string} HTML string
 */
export function createManageBreadcrumb(currentPage) {
  const trail = [
    { label: 'Overview', href: '#/overview' },
    { label: 'Transactions', href: '#/transactions' },
    { label: getRouteLabel(currentPage), href: null }
  ];
  return renderBreadcrumb(trail, { showBackButton: true });
}
