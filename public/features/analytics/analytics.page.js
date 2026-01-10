/**
 * Analytics Page - Reports and Insights for FinanceFlow
 * Displays spending analysis, income vs expenses, and spending trends
 */

import { api } from '../../core/api.js';
import { formatCurrency, formatDate, escapeHtml } from '../../core/utils.js';

// Private state
let container = null;
let cleanupFunctions = [];

// Current filter state
let currentRange = 'this_month';
let currentStartDate = null;
let currentEndDate = null;

/**
 * Register cleanup function to be called on unmount
 * @param {function} fn - Cleanup function
 */
function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

/**
 * Mount the analytics page
 * @param {HTMLElement} el - Container element
 * @param {URLSearchParams} params - URL parameters
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
 * Unmount the analytics page
 */
export function unmount() {
  // Run all cleanup functions
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];

  // Clear container
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
 * Render the page structure
 */
function render() {
  container.innerHTML = `
    <div class="page analytics-page">
      <header class="page-header">
        <h1>Analytics</h1>
        <p>Insights into your spending patterns</p>
      </header>

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

      <!-- Main Analytics Grid -->
      <section class="analytics-grid">
        <!-- Spending by Category -->
        <div id="category-spending-container" class="card category-spending-card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading categories...</p>
          </div>
        </div>

        <!-- Income vs Expenses -->
        <div id="income-expenses-container" class="card income-expenses-card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading comparison...</p>
          </div>
        </div>
      </section>

      <!-- Spending Trends -->
      <section class="trends-section">
        <div id="trends-container" class="card trends-card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading trends...</p>
          </div>
        </div>
      </section>

      <!-- Top Merchants -->
      <section class="merchants-section">
        <div id="merchants-container" class="card merchants-card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading merchants...</p>
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
        loadData();
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
        alert('Please select both start and end dates');
        return;
      }

      if (startInput.value > endInput.value) {
        alert('Start date must be before end date');
        return;
      }

      currentRange = 'custom';
      currentStartDate = startInput.value;
      currentEndDate = endInput.value;
      loadData();
    };
    applyBtn.addEventListener('click', applyHandler);
    onCleanup(() => applyBtn.removeEventListener('click', applyHandler));
  }
}

/**
 * Build query params for API requests
 * @returns {string} Query string
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
 * Load all analytics data
 */
async function loadData() {
  const queryParams = buildQueryParams();

  try {
    // Fetch all data in parallel
    const [categoryData, incomeExpenseData, trendsData, summaryData, merchantsData] = await Promise.all([
      api.get(`/analytics/spending-by-category?${queryParams}`),
      api.get('/analytics/income-vs-expenses?months=12'),
      api.get(`/analytics/trends?${queryParams}&group_by=day`),
      api.get(`/analytics/summary?${queryParams}`),
      api.get('/merchants/top?by=spend&limit=10')
    ]);

    // Render each section
    renderSummaryStats(summaryData);
    renderCategorySpending(categoryData);
    renderIncomeVsExpenses(incomeExpenseData);
    renderTrends(trendsData);
    renderTopMerchants(merchantsData);
  } catch (err) {
    showGlobalError(err.message);
  }
}

/**
 * Render summary statistics
 * @param {Object} data - Summary data from API
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
 * Render spending by category
 * @param {Object} data - Category spending data from API
 */
function renderCategorySpending(data) {
  const categoryContainer = container.querySelector('#category-spending-container');
  const { categories, range } = data;

  categoryContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Spending by Category</h3>
      <span class="card-subtitle">${formatDateRange(range.start_date, range.end_date)}</span>
    </div>
  `;

  if (!categories || categories.length === 0) {
    categoryContainer.innerHTML += `
      <div class="empty-state">
        <p>No spending data for this period</p>
      </div>
    `;
    return;
  }

  const listElement = document.createElement('div');
  listElement.className = 'category-list';

  const fragment = document.createDocumentFragment();
  const maxAmount = categories[0].total; // Already sorted by total desc

  categories.forEach(category => {
    const row = document.createElement('div');
    row.className = 'category-item';

    const percentage = maxAmount > 0 ? (category.total / maxAmount) * 100 : 0;

    row.innerHTML = `
      <div class="category-info">
        <span class="category-indicator" style="background-color: ${category.colour}"></span>
        <span class="category-name">${escapeHtml(category.category_name)}</span>
        <span class="category-percentage">${category.percentage.toFixed(1)}%</span>
      </div>
      <div class="category-bar-wrapper">
        <div class="category-bar" style="width: ${percentage}%; background-color: ${category.colour}"></div>
      </div>
      <div class="category-amount">${formatCurrency(category.total)}</div>
    `;

    fragment.appendChild(row);
  });

  listElement.appendChild(fragment);
  categoryContainer.appendChild(listElement);
}

/**
 * Render income vs expenses comparison
 * @param {Object} data - Income vs expenses data from API
 */
function renderIncomeVsExpenses(data) {
  const incomeExpenseContainer = container.querySelector('#income-expenses-container');
  const { months, totals } = data;

  incomeExpenseContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Income vs Expenses</h3>
      <span class="card-subtitle">Last 12 Months</span>
    </div>
  `;

  // Create totals summary
  const summaryEl = document.createElement('div');
  summaryEl.className = 'income-expense-summary';

  const netClass = totals.net >= 0 ? 'amount-positive' : 'amount-negative';
  summaryEl.innerHTML = `
    <div class="ie-stat">
      <span class="ie-label">Total Income</span>
      <span class="ie-value amount-positive">${formatCurrency(totals.income)}</span>
    </div>
    <div class="ie-stat">
      <span class="ie-label">Total Expenses</span>
      <span class="ie-value amount-negative">${formatCurrency(totals.expenses)}</span>
    </div>
    <div class="ie-stat ie-stat--net">
      <span class="ie-label">Net</span>
      <span class="ie-value ${netClass}">${totals.net >= 0 ? '+' : ''}${formatCurrency(totals.net)}</span>
    </div>
  `;
  incomeExpenseContainer.appendChild(summaryEl);

  // Create monthly bars chart
  const chartEl = document.createElement('div');
  chartEl.className = 'monthly-chart';

  // Find max value for scaling
  const maxValue = Math.max(
    ...months.map(m => Math.max(m.income, m.expenses)),
    1 // Avoid division by zero
  );

  const fragment = document.createDocumentFragment();

  // Show last 6 months for better visibility
  const recentMonths = months.slice(-6);

  recentMonths.forEach(month => {
    const barGroup = document.createElement('div');
    barGroup.className = 'bar-group';

    const incomeHeight = (month.income / maxValue) * 100;
    const expenseHeight = (month.expenses / maxValue) * 100;

    barGroup.innerHTML = `
      <div class="bars">
        <div class="bar bar--income" style="height: ${incomeHeight}%" title="Income: ${formatCurrency(month.income)}"></div>
        <div class="bar bar--expense" style="height: ${expenseHeight}%" title="Expenses: ${formatCurrency(month.expenses)}"></div>
      </div>
      <div class="bar-label">${formatMonthLabel(month.month)}</div>
    `;

    fragment.appendChild(barGroup);
  });

  chartEl.appendChild(fragment);
  incomeExpenseContainer.appendChild(chartEl);

  // Add legend
  const legendEl = document.createElement('div');
  legendEl.className = 'chart-legend';
  legendEl.innerHTML = `
    <div class="legend-item">
      <span class="legend-color legend-color--income"></span>
      <span class="legend-label">Income</span>
    </div>
    <div class="legend-item">
      <span class="legend-color legend-color--expense"></span>
      <span class="legend-label">Expenses</span>
    </div>
  `;
  incomeExpenseContainer.appendChild(legendEl);
}

/**
 * Render spending trends
 * @param {Object} data - Trends data from API
 */
function renderTrends(data) {
  const trendsContainer = container.querySelector('#trends-container');
  const { trends, range, group_by: groupBy } = data;

  trendsContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Spending Trends</h3>
      <span class="card-subtitle">${formatDateRange(range.start_date, range.end_date)}</span>
    </div>
  `;

  if (!trends || trends.length === 0) {
    trendsContainer.innerHTML += `
      <div class="empty-state">
        <p>No trend data for this period</p>
      </div>
    `;
    return;
  }

  // Create trend bars
  const chartEl = document.createElement('div');
  chartEl.className = 'trend-chart';

  const maxSpending = Math.max(...trends.map(t => t.spending), 1);
  const fragment = document.createDocumentFragment();

  // Show at most 14 days for readability
  const displayTrends = trends.slice(-14);

  // Max bar height in pixels (chart is 120px, need room for labels)
  const maxBarHeight = 90;

  displayTrends.forEach(trend => {
    const barWrapper = document.createElement('div');
    barWrapper.className = 'trend-bar-wrapper';

    // Calculate height in pixels for reliable rendering
    const heightPx = Math.max(4, (trend.spending / maxSpending) * maxBarHeight);
    const dayLabel = formatTrendLabel(trend.period, groupBy);

    barWrapper.innerHTML = `
      <div class="trend-bar" style="height: ${heightPx}px" title="${formatCurrency(trend.spending)}"></div>
      <div class="trend-label">${dayLabel}</div>
    `;

    fragment.appendChild(barWrapper);
  });

  chartEl.appendChild(fragment);
  trendsContainer.appendChild(chartEl);

  // Add trend summary
  const totalSpending = trends.reduce((sum, t) => sum + t.spending, 0);
  const avgSpending = totalSpending / trends.length;

  const summaryEl = document.createElement('div');
  summaryEl.className = 'trend-summary';
  summaryEl.innerHTML = `
    <div class="trend-stat">
      <span class="trend-stat-label">Total Spending</span>
      <span class="trend-stat-value">${formatCurrency(totalSpending)}</span>
    </div>
    <div class="trend-stat">
      <span class="trend-stat-label">Average per Day</span>
      <span class="trend-stat-value">${formatCurrency(avgSpending)}</span>
    </div>
    <div class="trend-stat">
      <span class="trend-stat-label">Days with Spending</span>
      <span class="trend-stat-value">${trends.length}</span>
    </div>
  `;
  trendsContainer.appendChild(summaryEl);
}

/**
 * Format date range for display
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {string} Formatted range
 */
function formatDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return `${startStr} - ${endStr}`;
}

/**
 * Format month label (YYYY-MM to abbreviated month)
 * @param {string} monthStr - Month string in YYYY-MM format
 * @returns {string} Abbreviated month name
 */
function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'short' });
}

/**
 * Format trend label based on period type
 * @param {string} period - Period string
 * @param {string} groupBy - Grouping type (day/week)
 * @returns {string} Formatted label
 */
function formatTrendLabel(period, groupBy) {
  if (groupBy === 'week') {
    return period.split('-')[1]; // Just show W01, W02, etc.
  }
  // Day format: show just day number
  const date = new Date(period);
  return date.getDate().toString();
}

/**
 * Render top merchants
 * @param {Array} data - Top merchants data from API
 */
function renderTopMerchants(data) {
  const merchantsContainer = container.querySelector('#merchants-container');

  merchantsContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Top Merchants</h3>
      <span class="card-subtitle">By total spending</span>
    </div>
  `;

  if (!data || data.length === 0) {
    merchantsContainer.innerHTML += `
      <div class="empty-state">
        <p>No merchant data available</p>
      </div>
    `;
    return;
  }

  const listElement = document.createElement('div');
  listElement.className = 'merchants-list';

  const maxSpend = data[0].totalSpend || data[0].total_spent || 1;

  data.forEach((merchant, index) => {
    const row = document.createElement('div');
    row.className = 'merchant-item';

    const name = merchant.name || merchant.merchant_name;
    const totalSpend = merchant.totalSpend || merchant.total_spent || 0;
    const txCount = merchant.transactionCount || merchant.transaction_count || 0;
    const barWidth = (totalSpend / maxSpend) * 100;

    row.innerHTML = `
      <div class="merchant-rank">${index + 1}</div>
      <div class="merchant-info">
        <span class="merchant-name">${escapeHtml(name)}</span>
        <span class="merchant-count">${txCount} transaction${txCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="merchant-bar-wrapper">
        <div class="merchant-bar" style="width: ${barWidth}%"></div>
      </div>
      <div class="merchant-amount">${formatCurrency(totalSpend)}</div>
    `;

    listElement.appendChild(row);
  });

  merchantsContainer.appendChild(listElement);
}

/**
 * Show global error state
 * @param {string} message - Error message
 */
function showGlobalError(message) {
  container.innerHTML = `
    <div class="page analytics-page">
      <div class="error-state">
        <h1>Error</h1>
        <p>${escapeHtml(message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    </div>
  `;
}
