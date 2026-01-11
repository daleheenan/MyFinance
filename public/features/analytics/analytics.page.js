/**
 * Analytics Hub Page
 * Central navigation to all analytics sub-pages
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';

// Private state
let container = null;
let cleanupFunctions = [];

/**
 * Register cleanup function
 */
function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

/**
 * Mount the analytics hub page
 */
export async function mount(el, params) {
  container = el;
  cleanupFunctions = [];

  // Load CSS
  loadStyles();

  // Render
  render();

  // Load quick stats
  await loadQuickStats();
}

/**
 * Unmount the page
 */
export function unmount() {
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];

  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

/**
 * Load page-specific CSS
 */
function loadStyles() {
  const styleId = 'analytics-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/analytics/analytics.css';
    document.head.appendChild(link);
  }
}

/**
 * Render the hub page
 */
function render() {
  container.innerHTML = `
    <div class="page analytics-page analytics-hub">
      <div class="page-header">
        <h1 class="page-title">Analytics</h1>
        <p class="page-subtitle">Financial insights and reports</p>
      </div>

      <!-- Quick Stats -->
      <section class="quick-stats-section">
        <div id="quick-stats" class="quick-stats">
          <div class="loading">
            <div class="spinner"></div>
          </div>
        </div>
      </section>

      <!-- Analytics Navigation Cards -->
      <section class="analytics-nav-section">
        <div class="analytics-nav-grid">
          <a href="#/analytics/summary" class="analytics-nav-card">
            <div class="nav-card-icon">📊</div>
            <div class="nav-card-content">
              <h3 class="nav-card-title">Summary</h3>
              <p class="nav-card-desc">Overview with income, expenses, net flow, and year-on-year balance comparison</p>
            </div>
          </a>

          <a href="#/analytics/trends" class="analytics-nav-card">
            <div class="nav-card-icon">📈</div>
            <div class="nav-card-content">
              <h3 class="nav-card-title">Trends</h3>
              <p class="nav-card-desc">Spending trends over time and year-over-year comparisons</p>
            </div>
          </a>

          <a href="#/analytics/spend" class="analytics-nav-card">
            <div class="nav-card-icon">💰</div>
            <div class="nav-card-content">
              <h3 class="nav-card-title">Spending</h3>
              <p class="nav-card-desc">Monthly expense breakdown by category</p>
            </div>
          </a>

          <a href="#/analytics/merchants" class="analytics-nav-card">
            <div class="nav-card-icon">🏪</div>
            <div class="nav-card-content">
              <h3 class="nav-card-title">Merchants</h3>
              <p class="nav-card-desc">Top merchants by spending amount</p>
            </div>
          </a>
        </div>
      </section>
    </div>
  `;
}

/**
 * Load quick stats for the hub
 */
async function loadQuickStats() {
  const statsContainer = container.querySelector('#quick-stats');

  try {
    const summaryData = await api.get('/analytics/summary?range=this_month');
    const { summary } = summaryData;

    const netClass = summary.net >= 0 ? 'amount-positive' : 'amount-negative';

    statsContainer.innerHTML = `
      <div class="quick-stat">
        <span class="quick-stat-label">This Month Income</span>
        <span class="quick-stat-value amount-positive">${formatCurrency(summary.totalIncome)}</span>
      </div>
      <div class="quick-stat">
        <span class="quick-stat-label">This Month Expenses</span>
        <span class="quick-stat-value amount-negative">${formatCurrency(summary.totalExpenses)}</span>
      </div>
      <div class="quick-stat">
        <span class="quick-stat-label">Net</span>
        <span class="quick-stat-value ${netClass}">${summary.net >= 0 ? '+' : ''}${formatCurrency(summary.net)}</span>
      </div>
      <div class="quick-stat">
        <span class="quick-stat-label">Transactions</span>
        <span class="quick-stat-value">${summary.transactionCount}</span>
      </div>
    `;
  } catch (err) {
    statsContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load stats</p>
      </div>
    `;
  }
}
