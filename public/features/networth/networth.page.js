/**
 * Net Worth Page Module
 * Track assets, liabilities, and overall net worth with historical trends
 */

import { api } from '../../core/api.js';
import { formatCurrency, formatDate, escapeHtml } from '../../core/utils.js';

// Private state
let container = null;
let cleanupFunctions = [];

// Page data
let current = null;
let history = [];
let breakdown = null;

/**
 * Register a cleanup function to run on unmount
 * @param {function} fn - Cleanup function
 */
function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

/**
 * Mount the page
 * @param {HTMLElement} el - Container element
 * @param {URLSearchParams} params - Route parameters
 */
export function mount(el, params) {
  container = el;
  cleanupFunctions = [];

  // Reset state
  current = null;
  history = [];
  breakdown = null;

  // Load CSS
  loadStyles();

  render();
  loadData();
}

/**
 * Unmount the page and cleanup resources
 */
export function unmount() {
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];

  if (container) {
    container.innerHTML = '';
    container = null;
  }

  current = null;
  history = [];
  breakdown = null;
}

/**
 * Load page-specific CSS
 */
function loadStyles() {
  const styleId = 'networth-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/networth/networth.css';
    document.head.appendChild(link);
  }
}

/**
 * Render the page structure
 */
function render() {
  container.innerHTML = `
    <div class="page networth-page">
      <!-- Current Net Worth -->
      <div class="networth-summary" id="summary-container">
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>

      <!-- Historical Chart -->
      <div class="card chart-card">
        <div class="card-header">
          <h3 class="card-title">Net Worth Trend</h3>
          <div class="chart-period-selector">
            <button type="button" class="period-btn active" data-months="6">6M</button>
            <button type="button" class="period-btn" data-months="12">1Y</button>
            <button type="button" class="period-btn" data-months="24">2Y</button>
            <button type="button" class="period-btn" data-months="60">5Y</button>
          </div>
        </div>
        <div class="chart-container" id="chart-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading chart...</p>
          </div>
        </div>
      </div>

      <!-- Breakdown Section -->
      <div class="breakdown-grid">
        <!-- Assets Card -->
        <div class="card breakdown-card breakdown-card--assets">
          <div class="card-header">
            <h3 class="card-title">Assets</h3>
            <span class="breakdown-total" id="assets-total">-</span>
          </div>
          <div id="assets-container">
            <div class="loading">
              <div class="spinner"></div>
            </div>
          </div>
        </div>

        <!-- Liabilities Card -->
        <div class="card breakdown-card breakdown-card--liabilities">
          <div class="card-header">
            <h3 class="card-title">Liabilities</h3>
            <span class="breakdown-total" id="liabilities-total">-</span>
          </div>
          <div id="liabilities-container">
            <div class="loading">
              <div class="spinner"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- History Table -->
      <div class="card history-card">
        <div class="card-header">
          <h3 class="card-title">Snapshot History</h3>
        </div>
        <div id="history-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading history...</p>
          </div>
        </div>
      </div>
    </div>
  `;

  attachEventListeners();
}

/**
 * Handle snapshot button click
 */
async function handleSnapshot() {
  await takeSnapshot();
}

/**
 * Attach event listeners with cleanup
 */
function attachEventListeners() {
  // Period selector
  const periodBtns = container.querySelectorAll('.period-btn');
  periodBtns.forEach(btn => {
    const handler = () => {
      periodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadHistory(parseInt(btn.dataset.months, 10));
    };
    btn.addEventListener('click', handler);
    onCleanup(() => btn.removeEventListener('click', handler));
  });
}

/**
 * Load all page data
 */
async function loadData() {
  try {
    const [currentData, historyData, breakdownData] = await Promise.all([
      api.get('/networth/current'),
      api.get('/networth/history?months=12'),
      api.get('/networth/breakdown')
    ]);

    current = currentData;
    history = historyData;
    breakdown = breakdownData;

    renderSummary();
    renderChart();
    renderBreakdown();
    renderHistory();
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
  }
}

/**
 * Load history for a specific period
 */
async function loadHistory(months) {
  try {
    const chartContainer = container.querySelector('#chart-container');
    chartContainer.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading chart...</p>
      </div>
    `;

    history = await api.get(`/networth/history?months=${months}`);
    renderChart();
  } catch (err) {
    const chartContainer = container.querySelector('#chart-container');
    chartContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load chart: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Take a new snapshot
 */
async function takeSnapshot() {
  const btn = container.querySelector('#snapshot-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await api.post('/networth/snapshot');
    await loadData();
  } catch (err) {
    alert(`Failed to take snapshot: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Take Snapshot';
  }
}

/**
 * Render the net worth summary
 */
function renderSummary() {
  const summaryContainer = container.querySelector('#summary-container');

  if (!current) {
    summaryContainer.innerHTML = `
      <div class="networth-summary-header">
        <button type="button" class="btn btn-primary" id="snapshot-btn">
          Take Snapshot
        </button>
      </div>
      <div class="empty-state">
        <p>No net worth data available</p>
      </div>
    `;

    // Attach snapshot button handler even for empty state
    const snapshotBtn = summaryContainer.querySelector('#snapshot-btn');
    if (snapshotBtn) {
      snapshotBtn.addEventListener('click', handleSnapshot);
    }
    return;
  }

  const changeClass = current.change >= 0 ? 'change--positive' : 'change--negative';
  const changeIcon = current.change >= 0 ? '↑' : '↓';
  const changePercent = current.previous_net_worth !== 0
    ? Math.abs((current.change / Math.abs(current.previous_net_worth)) * 100).toFixed(1)
    : '0.0';

  summaryContainer.innerHTML = `
    <div class="networth-summary-header">
      <button type="button" class="btn btn-primary" id="snapshot-btn">
        Take Snapshot
      </button>
    </div>
    <div class="networth-cards">
      <div class="networth-card networth-card--main">
        <span class="networth-card__label">Net Worth</span>
        <span class="networth-card__value ${current.net_worth >= 0 ? 'value--positive' : 'value--negative'}">
          ${formatCurrency(current.net_worth)}
        </span>
        <div class="networth-card__change ${changeClass}">
          <span class="change-icon">${changeIcon}</span>
          <span class="change-amount">${formatCurrency(Math.abs(current.change))}</span>
          <span class="change-percent">(${changePercent}%)</span>
          <span class="change-period">vs last month</span>
        </div>
      </div>
      <div class="networth-card networth-card--assets">
        <span class="networth-card__label">Total Assets</span>
        <span class="networth-card__value value--positive">${formatCurrency(current.total_assets)}</span>
      </div>
      <div class="networth-card networth-card--liabilities">
        <span class="networth-card__label">Total Liabilities</span>
        <span class="networth-card__value value--negative">${formatCurrency(current.total_liabilities)}</span>
      </div>
    </div>
  `;

  // Re-attach snapshot button handler
  const snapshotBtn = summaryContainer.querySelector('#snapshot-btn');
  if (snapshotBtn) {
    snapshotBtn.addEventListener('click', handleSnapshot);
  }
}

/**
 * Render the net worth trend chart
 */
function renderChart() {
  const chartContainer = container.querySelector('#chart-container');

  if (!history || history.length === 0) {
    chartContainer.innerHTML = `
      <div class="empty-state">
        <p>No historical data available</p>
        <p class="text-secondary">Take a snapshot to start tracking</p>
      </div>
    `;
    return;
  }

  // Chart dimensions
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate data bounds
  const allValues = history.flatMap(d => [d.net_worth, d.total_assets, -d.total_liabilities]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const valueRange = maxValue - minValue || 1;

  // Scale functions
  const xScale = (index) => padding.left + (index / (history.length - 1 || 1)) * chartWidth;
  const yScale = (value) => padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

  // Generate path for a data series
  const generatePath = (data, accessor) => {
    if (data.length === 0) return '';
    const points = data.map((d, i) => ({
      x: xScale(i),
      y: yScale(accessor(d))
    }));

    // Simple line path
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  // Generate Y-axis labels
  const yLabels = [];
  const labelCount = 5;
  for (let i = 0; i <= labelCount; i++) {
    const value = minValue + (valueRange * i / labelCount);
    yLabels.push({
      y: yScale(value),
      label: formatCurrency(value)
    });
  }

  // Generate X-axis labels (show every nth label based on data size)
  const xLabels = [];
  const labelInterval = Math.ceil(history.length / 6);
  history.forEach((d, i) => {
    if (i === 0 || i === history.length - 1 || i % labelInterval === 0) {
      xLabels.push({
        x: xScale(i),
        label: formatShortDate(d.snapshot_date)
      });
    }
  });

  const netWorthPath = generatePath(history, d => d.net_worth);
  const assetsPath = generatePath(history, d => d.total_assets);
  const liabilitiesPath = generatePath(history, d => -d.total_liabilities);

  chartContainer.innerHTML = `
    <svg class="networth-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <!-- Grid lines -->
      <g class="chart-grid">
        ${yLabels.map(l => `
          <line x1="${padding.left}" y1="${l.y}" x2="${width - padding.right}" y2="${l.y}" />
        `).join('')}
      </g>

      <!-- Zero line if visible -->
      ${minValue < 0 && maxValue > 0 ? `
        <line class="zero-line" x1="${padding.left}" y1="${yScale(0)}"
              x2="${width - padding.right}" y2="${yScale(0)}" />
      ` : ''}

      <!-- Data lines -->
      <path class="chart-line chart-line--assets" d="${assetsPath}" />
      <path class="chart-line chart-line--liabilities" d="${liabilitiesPath}" />
      <path class="chart-line chart-line--networth" d="${netWorthPath}" />

      <!-- Y-axis labels -->
      <g class="chart-labels-y">
        ${yLabels.map(l => `
          <text x="${padding.left - 10}" y="${l.y}" dy="4">${l.label}</text>
        `).join('')}
      </g>

      <!-- X-axis labels -->
      <g class="chart-labels-x">
        ${xLabels.map(l => `
          <text x="${l.x}" y="${height - 10}">${l.label}</text>
        `).join('')}
      </g>
    </svg>

    <div class="chart-legend">
      <div class="legend-item legend-item--networth">
        <span class="legend-dot"></span>
        Net Worth
      </div>
      <div class="legend-item legend-item--assets">
        <span class="legend-dot"></span>
        Assets
      </div>
      <div class="legend-item legend-item--liabilities">
        <span class="legend-dot"></span>
        Liabilities
      </div>
    </div>
  `;
}

/**
 * Format date for chart labels
 */
function formatShortDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

/**
 * Render the breakdown section
 */
function renderBreakdown() {
  const assetsContainer = container.querySelector('#assets-container');
  const liabilitiesContainer = container.querySelector('#liabilities-container');
  const assetsTotal = container.querySelector('#assets-total');
  const liabilitiesTotal = container.querySelector('#liabilities-total');

  if (!breakdown) {
    assetsContainer.innerHTML = '<div class="empty-state"><p>No data</p></div>';
    liabilitiesContainer.innerHTML = '<div class="empty-state"><p>No data</p></div>';
    return;
  }

  // Update totals
  assetsTotal.textContent = formatCurrency(breakdown.total_assets || 0);
  assetsTotal.classList.add('value--positive');
  liabilitiesTotal.textContent = formatCurrency(breakdown.total_liabilities || 0);
  liabilitiesTotal.classList.add('value--negative');

  // Render assets
  const assets = breakdown.assets || [];
  if (assets.length === 0) {
    assetsContainer.innerHTML = '<div class="empty-state"><p>No assets</p></div>';
  } else {
    assetsContainer.innerHTML = `
      <div class="breakdown-list">
        ${assets.map(account => `
          <div class="breakdown-item">
            <div class="breakdown-item__info">
              <span class="breakdown-item__name">${escapeHtml(account.account_name)}</span>
              <span class="breakdown-item__type">${account.account_type}</span>
            </div>
            <span class="breakdown-item__balance value--positive">
              ${formatCurrency(account.current_balance)}
            </span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Render liabilities
  const liabilities = breakdown.liabilities || [];
  if (liabilities.length === 0) {
    liabilitiesContainer.innerHTML = '<div class="empty-state"><p>No liabilities</p></div>';
  } else {
    liabilitiesContainer.innerHTML = `
      <div class="breakdown-list">
        ${liabilities.map(account => `
          <div class="breakdown-item">
            <div class="breakdown-item__info">
              <span class="breakdown-item__name">${escapeHtml(account.account_name)}</span>
              <span class="breakdown-item__type">${account.account_type}</span>
            </div>
            <span class="breakdown-item__balance value--negative">
              ${formatCurrency(Math.abs(account.current_balance))}
            </span>
          </div>
        `).join('')}
      </div>
    `;
  }
}

/**
 * Render the history table
 */
function renderHistory() {
  const historyContainer = container.querySelector('#history-container');

  if (!history || history.length === 0) {
    historyContainer.innerHTML = `
      <div class="empty-state">
        <p>No snapshots taken yet</p>
        <p class="text-secondary">Click "Take Snapshot" to record your current net worth</p>
      </div>
    `;
    return;
  }

  historyContainer.innerHTML = `
    <div class="history-table-wrapper">
      <table class="history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th class="text-right">Assets</th>
            <th class="text-right">Liabilities</th>
            <th class="text-right">Net Worth</th>
            <th class="text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          ${history.map((snapshot, index) => {
            const prevSnapshot = history[index + 1];
            const change = prevSnapshot ? snapshot.net_worth - prevSnapshot.net_worth : 0;
            const changeClass = change >= 0 ? 'value--positive' : 'value--negative';
            const changeIcon = change >= 0 ? '↑' : '↓';

            return `
              <tr>
                <td>${formatDate(snapshot.snapshot_date)}</td>
                <td class="text-right value--positive">${formatCurrency(snapshot.total_assets)}</td>
                <td class="text-right value--negative">${formatCurrency(snapshot.total_liabilities)}</td>
                <td class="text-right ${snapshot.net_worth >= 0 ? 'value--positive' : 'value--negative'}">
                  ${formatCurrency(snapshot.net_worth)}
                </td>
                <td class="text-right ${changeClass}">
                  ${change !== 0 ? `${changeIcon} ${formatCurrency(Math.abs(change))}` : '-'}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Show error message
 */
function showError(message) {
  const summaryContainer = container.querySelector('#summary-container');
  summaryContainer.innerHTML = `
    <div class="error-state">
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn btn-secondary retry-btn">Retry</button>
    </div>
  `;

  const retryBtn = summaryContainer.querySelector('.retry-btn');
  const retryHandler = () => loadData();
  retryBtn.addEventListener('click', retryHandler);
  onCleanup(() => retryBtn.removeEventListener('click', retryHandler));
}
