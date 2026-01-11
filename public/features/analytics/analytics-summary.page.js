/**
 * Analytics Summary Page
 * Summary view with filters, totals, and year-on-year balance comparison
 */

import { api } from '../../core/api.js';
import { formatCurrency, formatDate, escapeHtml } from '../../core/utils.js';
import { showWarning } from '../../core/toast.js';

// Private state
let container = null;
let cleanupFunctions = [];

// Current filter state
let currentRange = 'this_month';
let currentStartDate = null;
let currentEndDate = null;

// Year-over-year balance data
let balanceYoyData = null;
let selectedBalanceYears = [];

// Accounts data
let accounts = [];
let mainAccountId = null;

/**
 * Register cleanup function
 */
function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

/**
 * Mount the page
 */
export async function mount(el, params) {
  container = el;
  cleanupFunctions = [];

  // Load CSS
  loadStyles();

  // Render initial structure
  render();

  // Attach event listeners
  attachEventListeners();

  // Load data
  await loadData();
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
  const styleId = 'analytics-summary-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/analytics/analytics-summary.css';
    document.head.appendChild(link);
  }
  // Also load base analytics styles
  const analyticsStyleId = 'analytics-styles';
  if (!document.getElementById(analyticsStyleId)) {
    const link = document.createElement('link');
    link.id = analyticsStyleId;
    link.rel = 'stylesheet';
    link.href = 'features/analytics/analytics.css';
    document.head.appendChild(link);
  }
}

/**
 * Render the page structure
 */
function render() {
  container.innerHTML = `
    <div class="page analytics-summary-page">
      <div class="page-header">
        <div class="page-header__content">
          <h1 class="page-title">Analytics Summary</h1>
          <p class="page-subtitle">Overview of your financial data</p>
        </div>
        <a href="#/analytics" class="btn btn-secondary">Detailed Analytics</a>
      </div>

      <!-- Date Range Selector -->
      <section class="filter-section">
        <div class="filter-bar card">
          <div class="filter-group">
            <label class="filter-label">Date Range</label>
            <div class="filter-buttons" id="range-selector">
              <button class="filter-btn active" data-range="this_month">This Month</button>
              <button class="filter-btn" data-range="last_3_months">Last 3 Months</button>
              <button class="filter-btn" data-range="last_year">Last Year</button>
              <button class="filter-btn" data-range="custom">Custom</button>
            </div>
          </div>
          <div class="custom-date-inputs hidden" id="custom-dates">
            <div class="date-input-group">
              <label for="start-date">From</label>
              <input type="date" id="start-date" class="form-input">
            </div>
            <div class="date-input-group">
              <label for="end-date">To</label>
              <input type="date" id="end-date" class="form-input">
            </div>
            <button class="btn btn-primary btn-sm" id="apply-custom-dates">Apply</button>
          </div>
        </div>
      </section>

      <!-- Summary Stats -->
      <section class="summary-section">
        <div id="summary-container" class="summary-stats">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading summary...</p>
          </div>
        </div>
      </section>

      <!-- Year-on-Year Balance Chart -->
      <section class="balance-yoy-section">
        <div id="balance-yoy-container" class="card balance-yoy-card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading balance history...</p>
          </div>
        </div>
      </section>
    </div>
  `;
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
  // Range selector buttons
  const rangeSelector = container.querySelector('#range-selector');
  if (rangeSelector) {
    const rangeHandler = (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      const range = btn.dataset.range;
      if (range === currentRange) return;

      // Update active state
      rangeSelector.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show/hide custom date inputs
      const customDates = container.querySelector('#custom-dates');
      if (range === 'custom') {
        customDates.classList.remove('hidden');
      } else {
        customDates.classList.add('hidden');
        currentRange = range;
        currentStartDate = null;
        currentEndDate = null;
        loadSummaryData();
      }
    };
    rangeSelector.addEventListener('click', rangeHandler);
    onCleanup(() => rangeSelector.removeEventListener('click', rangeHandler));
  }

  // Apply custom dates button
  const applyBtn = container.querySelector('#apply-custom-dates');
  if (applyBtn) {
    const applyHandler = () => {
      const startInput = container.querySelector('#start-date');
      const endInput = container.querySelector('#end-date');

      if (!startInput.value || !endInput.value) {
        showWarning('Please select both start and end dates');
        return;
      }

      if (startInput.value > endInput.value) {
        showWarning('Start date must be before end date');
        return;
      }

      currentRange = 'custom';
      currentStartDate = startInput.value;
      currentEndDate = endInput.value;
      loadSummaryData();
    };
    applyBtn.addEventListener('click', applyHandler);
    onCleanup(() => applyBtn.removeEventListener('click', applyHandler));
  }
}

/**
 * Build query params for API requests
 */
function buildQueryParams() {
  const params = new URLSearchParams();
  params.set('range', currentRange);

  if (currentRange === 'custom' && currentStartDate && currentEndDate) {
    params.set('start_date', currentStartDate);
    params.set('end_date', currentEndDate);
  }

  return params.toString();
}

/**
 * Load all data
 */
async function loadData() {
  try {
    // First load accounts to find main account
    accounts = await api.get('/accounts');

    // Find the main/primary account (first one or one with most transactions)
    if (accounts.length > 0) {
      mainAccountId = accounts[0].id;
    }

    // Load summary and balance history in parallel
    await Promise.all([
      loadSummaryData(),
      loadBalanceYoYData()
    ]);
  } catch (err) {
    showError(err.message);
  }
}

/**
 * Load summary data based on filters
 */
async function loadSummaryData() {
  const queryParams = buildQueryParams();
  const summaryContainer = container.querySelector('#summary-container');

  summaryContainer.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const summaryData = await api.get(`/analytics/summary?${queryParams}`);
    renderSummaryStats(summaryData);
  } catch (err) {
    summaryContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load summary: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Load year-over-year balance data
 */
async function loadBalanceYoYData() {
  const balanceContainer = container.querySelector('#balance-yoy-container');

  try {
    if (!mainAccountId) {
      balanceContainer.innerHTML = `
        <div class="card-header">
          <h3 class="card-title">Year-on-Year Balance Comparison</h3>
        </div>
        <div class="empty-state">
          <p>No accounts found</p>
        </div>
      `;
      return;
    }

    balanceYoyData = await api.get(`/accounts/${mainAccountId}/balance-history`);

    // Determine which years to show by default
    if (balanceYoyData && balanceYoyData.years && balanceYoyData.years.length > 0) {
      const availableYears = balanceYoyData.years.map(y => y.year).sort((a, b) => b - a);
      selectedBalanceYears = availableYears.slice(0, Math.min(3, availableYears.length));
    }

    renderBalanceYoY();
  } catch (err) {
    balanceContainer.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">Year-on-Year Balance Comparison</h3>
      </div>
      <div class="error-state">
        <p>Failed to load balance history: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Render summary statistics
 */
function renderSummaryStats(data) {
  const summaryContainer = container.querySelector('#summary-container');
  const { summary, range } = data;

  const netClass = summary.net >= 0 ? 'amount-positive' : 'amount-negative';
  const netSign = summary.net >= 0 ? '+' : '';

  summaryContainer.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Income</div>
      <div class="stat-value amount-positive">${formatCurrency(summary.totalIncome)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Expenses</div>
      <div class="stat-value amount-negative">${formatCurrency(summary.totalExpenses)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Net</div>
      <div class="stat-value ${netClass}">${netSign}${formatCurrency(summary.net)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Daily Spending</div>
      <div class="stat-value">${formatCurrency(summary.avgDailySpending)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Transactions</div>
      <div class="stat-value">${summary.transactionCount}</div>
    </div>
  `;
}

/**
 * Render year-over-year balance chart
 */
function renderBalanceYoY() {
  const balanceContainer = container.querySelector('#balance-yoy-container');

  if (!balanceYoyData || !balanceYoyData.years || balanceYoyData.years.length === 0) {
    balanceContainer.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">Year-on-Year Balance Comparison</h3>
        <span class="card-subtitle">Main Account: ${escapeHtml(balanceYoyData?.account_name || 'Unknown')}</span>
      </div>
      <div class="empty-state">
        <p>No balance history available yet</p>
      </div>
    `;
    return;
  }

  const availableYears = balanceYoyData.years.map(y => y.year).sort((a, b) => b - a);

  // Build year selector buttons
  const yearButtons = availableYears.map(year => {
    const isActive = selectedBalanceYears.includes(year);
    return `<button class="yoy-year-btn ${isActive ? 'active' : ''}" data-year="${year}">${year}</button>`;
  }).join('');

  balanceContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Year-on-Year Balance Comparison</h3>
      <span class="card-subtitle">Main Account: ${escapeHtml(balanceYoyData.account_name || 'Primary')}</span>
    </div>
    <div class="yoy-controls">
      <span class="filter-label">Compare Years:</span>
      <div class="yoy-year-selector" id="balance-year-selector">
        ${yearButtons}
      </div>
    </div>
  `;

  // Attach year selector event listeners
  const yearSelector = balanceContainer.querySelector('#balance-year-selector');
  yearSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.yoy-year-btn');
    if (!btn) return;

    const year = parseInt(btn.dataset.year);
    if (selectedBalanceYears.includes(year)) {
      if (selectedBalanceYears.length > 1) {
        selectedBalanceYears = selectedBalanceYears.filter(y => y !== year);
        renderBalanceYoY();
      }
    } else {
      selectedBalanceYears.push(year);
      selectedBalanceYears.sort((a, b) => b - a);
      renderBalanceYoY();
    }
  });

  // Filter data to selected years
  const selectedData = balanceYoyData.years.filter(y => selectedBalanceYears.includes(y.year));

  if (selectedData.length === 0) {
    balanceContainer.innerHTML += `
      <div class="empty-state">
        <p>Select years to compare</p>
      </div>
    `;
    return;
  }

  // Year colors for chart
  const yearColors = [
    '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'
  ];

  // Create SVG line chart
  const chartContainer = document.createElement('div');
  chartContainer.className = 'balance-chart-container';

  // Chart dimensions
  const width = 800;
  const height = 300;
  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find min/max values across all selected years
  let minBalance = Infinity;
  let maxBalance = -Infinity;
  selectedData.forEach(yearData => {
    yearData.months.forEach(m => {
      if (m.balance !== null && m.balance !== undefined) {
        minBalance = Math.min(minBalance, m.balance);
        maxBalance = Math.max(maxBalance, m.balance);
      }
    });
  });

  // Add some padding to the range
  const range = maxBalance - minBalance || 1;
  minBalance = minBalance - range * 0.1;
  maxBalance = maxBalance + range * 0.1;

  // Month names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Scale functions
  const xScale = (month) => padding.left + ((month - 1) / 11) * chartWidth;
  const yScale = (value) => padding.top + chartHeight - ((value - minBalance) / (maxBalance - minBalance)) * chartHeight;

  // Generate Y-axis labels
  const yLabels = [];
  const labelCount = 5;
  for (let i = 0; i <= labelCount; i++) {
    const value = minBalance + ((maxBalance - minBalance) * i / labelCount);
    yLabels.push({ y: yScale(value), label: formatCurrency(value) });
  }

  // Generate lines for each year
  const lines = selectedData.map((yearData, idx) => {
    const color = yearColors[idx % yearColors.length];
    const points = [];

    yearData.months.forEach(m => {
      if (m.balance !== null && m.balance !== undefined) {
        points.push({ x: xScale(m.month), y: yScale(m.balance), month: m.month, balance: m.balance });
      }
    });

    // Generate path
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return { year: yearData.year, color, points, pathD };
  });

  chartContainer.innerHTML = `
    <svg class="balance-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <!-- Grid lines -->
      <g class="chart-grid">
        ${yLabels.map(l => `
          <line x1="${padding.left}" y1="${l.y}" x2="${width - padding.right}" y2="${l.y}" stroke="#e5e7eb" stroke-opacity="0.5" />
        `).join('')}
      </g>

      <!-- Zero line if applicable -->
      ${minBalance < 0 && maxBalance > 0 ? `
        <line class="zero-line" x1="${padding.left}" y1="${yScale(0)}"
              x2="${width - padding.right}" y2="${yScale(0)}" stroke="#9ca3af" stroke-dasharray="4 4" />
      ` : ''}

      <!-- Lines -->
      ${lines.map(line => `
        <path class="balance-line" d="${line.pathD}" fill="none" stroke="${line.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      `).join('')}

      <!-- Data points -->
      ${lines.map(line => line.points.map(p => `
        <circle class="balance-point" cx="${p.x}" cy="${p.y}" r="5" fill="${line.color}" stroke="white" stroke-width="2">
          <title>${line.year} ${monthNames[p.month - 1]}: ${formatCurrency(p.balance)}</title>
        </circle>
      `).join('')).join('')}

      <!-- Y-axis labels -->
      <g class="chart-labels-y">
        ${yLabels.map(l => `
          <text x="${padding.left - 10}" y="${l.y}" dy="4" text-anchor="end" fill="#6b7280" font-size="11">${l.label}</text>
        `).join('')}
      </g>

      <!-- X-axis labels -->
      <g class="chart-labels-x">
        ${monthNames.map((name, i) => `
          <text x="${xScale(i + 1)}" y="${height - 15}" text-anchor="middle" fill="#6b7280" font-size="11">${name}</text>
        `).join('')}
      </g>
    </svg>
  `;

  balanceContainer.appendChild(chartContainer);

  // Legend
  const legendEl = document.createElement('div');
  legendEl.className = 'balance-legend';
  legendEl.innerHTML = lines.map(line => `
    <div class="balance-legend-item">
      <span class="balance-legend-color" style="background-color: ${line.color}"></span>
      <span class="balance-legend-label">${line.year}</span>
    </div>
  `).join('');
  balanceContainer.appendChild(legendEl);

  // Summary stats per year
  const summaryEl = document.createElement('div');
  summaryEl.className = 'balance-summary';
  summaryEl.innerHTML = selectedData.map((yearData, idx) => {
    const color = yearColors[idx % yearColors.length];
    const startBalance = yearData.months.find(m => m.balance !== null)?.balance || 0;
    const endBalance = yearData.months.filter(m => m.balance !== null).pop()?.balance || 0;
    const change = endBalance - startBalance;
    const changeClass = change >= 0 ? 'amount-positive' : 'amount-negative';

    return `
      <div class="balance-summary-year" style="border-left-color: ${color}">
        <div class="balance-summary-label">${yearData.year}</div>
        <div class="balance-summary-stats">
          <span class="balance-summary-stat">
            <span class="stat-label">Start</span>
            <span class="stat-value">${formatCurrency(startBalance)}</span>
          </span>
          <span class="balance-summary-stat">
            <span class="stat-label">End</span>
            <span class="stat-value">${formatCurrency(endBalance)}</span>
          </span>
          <span class="balance-summary-stat">
            <span class="stat-label">Change</span>
            <span class="stat-value ${changeClass}">${change >= 0 ? '+' : ''}${formatCurrency(change)}</span>
          </span>
        </div>
      </div>
    `;
  }).join('');
  balanceContainer.appendChild(summaryEl);
}

/**
 * Show error state
 */
function showError(message) {
  container.innerHTML = `
    <div class="page analytics-summary-page">
      <div class="error-state">
        <h1>Error</h1>
        <p>${escapeHtml(message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    </div>
  `;
}
