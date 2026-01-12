/**
 * Analytics Merchants Page
 * Top merchants by spending amount
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';

let container = null;
let cleanupFunctions = [];
let sortBy = 'spend';
let limit = 10;

function onCleanup(fn) { cleanupFunctions.push(fn); }

export async function mount(el, params) {
  container = el;
  cleanupFunctions = [];
  loadStyles();
  render();
  attachEventListeners();
  await loadData();
}

export function unmount() {
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];
  if (container) { container.innerHTML = ''; container = null; }
}

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

function render() {
  container.innerHTML = `
    <div class="page analytics-page">
      <div class="page-header">
        <h1 class="page-title">Insights</h1>
      </div>

      <!-- Sub-navigation with Filters -->
      <div class="analytics-nav-bar">
        <div class="analytics-sub-nav">
          <a href="#/analytics/summary" class="analytics-sub-nav-link">Summary</a>
          <a href="#/analytics/trends" class="analytics-sub-nav-link">Trends</a>
          <a href="#/analytics/spend" class="analytics-sub-nav-link">Spending</a>
          <a href="#/analytics/merchants" class="analytics-sub-nav-link active">Merchants</a>
        </div>
        <div class="analytics-date-filters">
          <div class="filter-buttons" id="sort-selector">
            <button class="filter-btn active" data-sort="spend">By Spend</button>
            <button class="filter-btn" data-sort="frequency">By Frequency</button>
          </div>
          <div class="filter-buttons" id="limit-selector">
            <button class="filter-btn active" data-limit="10">Top 10</button>
            <button class="filter-btn" data-limit="25">Top 25</button>
            <button class="filter-btn" data-limit="50">Top 50</button>
          </div>
        </div>
      </div>

      <section class="merchants-section">
        <div id="merchants-container" class="card merchants-card">
          <div class="loading"><div class="spinner"></div><p>Loading merchants...</p></div>
        </div>
      </section>
    </div>
  `;
}

function attachEventListeners() {
  const sortSelector = container.querySelector('#sort-selector');
  if (sortSelector) {
    const sortHandler = (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      const newSort = btn.dataset.sort;
      if (newSort === sortBy) return;
      sortSelector.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortBy = newSort;
      loadData();
    };
    sortSelector.addEventListener('click', sortHandler);
    onCleanup(() => sortSelector.removeEventListener('click', sortHandler));
  }

  const limitSelector = container.querySelector('#limit-selector');
  if (limitSelector) {
    const limitHandler = (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      const newLimit = parseInt(btn.dataset.limit);
      if (newLimit === limit) return;
      limitSelector.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      limit = newLimit;
      loadData();
    };
    limitSelector.addEventListener('click', limitHandler);
    onCleanup(() => limitSelector.removeEventListener('click', limitHandler));
  }
}

async function loadData() {
  const merchantsContainer = container.querySelector('#merchants-container');
  merchantsContainer.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading merchants...</p></div>`;

  try {
    const data = await api.get(`/merchants/top?by=${sortBy}&limit=${limit}`);
    renderMerchants(data);
  } catch (err) {
    merchantsContainer.innerHTML = `<div class="error-state"><p>Failed to load merchants</p></div>`;
  }
}

function renderMerchants(merchants) {
  const merchantsContainer = container.querySelector('#merchants-container');

  merchantsContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Top Merchants</h3>
      <span class="card-subtitle">${sortBy === 'spend' ? 'Sorted by total spend' : 'Sorted by transaction count'}</span>
    </div>
  `;

  if (!merchants || merchants.length === 0) {
    merchantsContainer.innerHTML += `<div class="empty-state"><p>Add transactions with merchant info to see your top spending spots</p></div>`;
    return;
  }

  // Calculate max for bar widths
  const maxValue = sortBy === 'spend'
    ? Math.max(...merchants.map(m => m.totalSpend || m.total_spent || 0))
    : Math.max(...merchants.map(m => m.transactionCount || m.transaction_count || 0));

  const listEl = document.createElement('div');
  listEl.className = 'merchants-list';

  merchants.forEach((merchant, idx) => {
    const name = merchant.name || merchant.merchant_name || 'Unknown';
    const totalSpend = merchant.totalSpend || merchant.total_spent || 0;
    const transactionCount = merchant.transactionCount || merchant.transaction_count || 0;
    const lastTransaction = merchant.lastTransaction || merchant.last_transaction;

    const barValue = sortBy === 'spend' ? totalSpend : transactionCount;
    const barWidth = maxValue > 0 ? (barValue / maxValue) * 100 : 0;

    const itemEl = document.createElement('div');
    itemEl.className = 'merchant-item';
    itemEl.innerHTML = `
      <div class="merchant-rank">${idx + 1}</div>
      <div class="merchant-details">
        <div class="merchant-header">
          <span class="merchant-name">${escapeHtml(name)}</span>
          <span class="merchant-amount amount-negative">${formatCurrency(totalSpend)}</span>
        </div>
        <div class="merchant-bar-container">
          <div class="merchant-bar" style="width: ${barWidth}%"></div>
        </div>
        <div class="merchant-meta">
          <span class="merchant-count">${transactionCount} transaction${transactionCount !== 1 ? 's' : ''}</span>
          ${lastTransaction ? `<span class="merchant-last">Last: ${formatDate(lastTransaction)}</span>` : ''}
        </div>
      </div>
    `;

    // Add click to view history
    itemEl.addEventListener('click', () => showMerchantHistory(name));
    itemEl.style.cursor = 'pointer';

    listEl.appendChild(itemEl);
  });

  merchantsContainer.appendChild(listEl);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function showMerchantHistory(merchantName) {
  const merchantsContainer = container.querySelector('#merchants-container');
  const existingHistory = merchantsContainer.querySelector('.merchant-history-modal');
  if (existingHistory) existingHistory.remove();

  try {
    const history = await api.get(`/merchants/${encodeURIComponent(merchantName)}/history?months=12`);

    const modalEl = document.createElement('div');
    modalEl.className = 'merchant-history-modal';
    modalEl.innerHTML = `
      <div class="merchant-history-header">
        <h4 class="merchant-history-title">${escapeHtml(merchantName)} - Monthly History</h4>
        <button class="merchant-history-close">&times;</button>
      </div>
      <div class="merchant-history-content">
        ${renderMerchantHistoryChart(history)}
      </div>
    `;

    const closeBtn = modalEl.querySelector('.merchant-history-close');
    closeBtn.addEventListener('click', () => modalEl.remove());

    merchantsContainer.appendChild(modalEl);
  } catch (err) {
    // Silently fail - history is optional
  }
}

function renderMerchantHistoryChart(history) {
  if (!history || history.length === 0) {
    return '<p class="empty-state">Purchase history will appear after a few transactions</p>';
  }

  const maxSpend = Math.max(...history.map(h => h.total || h.totalSpend || 0), 1);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let html = '<div class="merchant-history-chart">';
  history.forEach(h => {
    const spend = h.total || h.totalSpend || 0;
    const height = (spend / maxSpend) * 100;
    const [year, month] = h.month.split('-');
    const monthLabel = monthNames[parseInt(month) - 1];

    html += `
      <div class="history-bar-wrapper">
        <div class="history-bar" style="height: ${height}%" title="${monthLabel} ${year}: ${formatCurrency(spend)}"></div>
        <span class="history-bar-label">${monthLabel}</span>
      </div>
    `;
  });
  html += '</div>';

  return html;
}
