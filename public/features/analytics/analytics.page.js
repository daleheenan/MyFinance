/**
 * Analytics Page - Reports and Insights for FinanceFlow
 * Displays spending analysis, income vs expenses, and spending trends
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

// Category pagination state
let categoryData = [];
let categoryPage = 0;
const CATEGORIES_PER_PAGE = 5;

// Merchant filter state
let merchantFilter = 'all_time';
let merchantsData = [];

// Year-over-year data
let yoyData = null;
let selectedYears = [];

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

      <!-- Year-over-Year Comparison -->
      <section class="yoy-section">
        <div id="yoy-container" class="card yoy-card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading year comparison...</p>
          </div>
        </div>
      </section>

      <!-- Monthly Expense Breakdown -->
      <section class="expense-breakdown-section">
        <div id="expense-breakdown-container" class="card expense-breakdown-card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading expense breakdown...</p>
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
    const [categoryDataResp, incomeExpenseData, trendsData, summaryData, merchantsDataResp, expenseBreakdownData, yoyDataResp] = await Promise.all([
      api.get(`/analytics/spending-by-category?${queryParams}`),
      api.get('/analytics/income-vs-expenses?months=12'),
      api.get(`/analytics/trends?${queryParams}&group_by=day`),
      api.get(`/analytics/summary?${queryParams}`),
      api.get('/merchants/top?by=spend&limit=10'),
      api.get('/analytics/monthly-breakdown?months=3'),
      api.get('/analytics/year-over-year')
    ]);

    // Store data for pagination/filtering
    categoryData = categoryDataResp.categories || [];
    categoryPage = 0;
    merchantsData = merchantsDataResp;
    yoyData = yoyDataResp;

    // Determine which years to show by default (current year + previous year if available)
    if (yoyData && yoyData.years) {
      const availableYears = yoyData.years.map(y => y.year).sort((a, b) => b - a);
      selectedYears = availableYears.slice(0, 2); // Show most recent 2 years
    }

    // Render each section
    renderSummaryStats(summaryData);
    renderCategorySpending(categoryDataResp);
    renderIncomeVsExpenses(incomeExpenseData);
    renderTrends(trendsData);
    renderTopMerchants(merchantsData);
    renderYearOverYear();
    renderExpenseBreakdown(expenseBreakdownData);
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
 * Render spending by category with pagination
 * @param {Object} data - Category spending data from API
 */
function renderCategorySpending(data) {
  const categoryContainer = container.querySelector('#category-spending-container');
  const { range } = data;
  const categories = categoryData;

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

  // Paginate categories
  const startIdx = categoryPage * CATEGORIES_PER_PAGE;
  const endIdx = startIdx + CATEGORIES_PER_PAGE;
  const pageCategories = categories.slice(startIdx, endIdx);
  const totalPages = Math.ceil(categories.length / CATEGORIES_PER_PAGE);

  const listElement = document.createElement('div');
  listElement.className = 'category-list';
  listElement.id = 'category-list';

  const fragment = document.createDocumentFragment();
  const maxAmount = categories[0].total; // Global max for consistent bar sizing

  pageCategories.forEach(category => {
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

  // Add pagination controls if more than one page
  if (totalPages > 1) {
    const paginationEl = document.createElement('div');
    paginationEl.className = 'category-pagination';
    paginationEl.innerHTML = `
      <button class="pagination-btn" id="cat-prev-btn" ${categoryPage === 0 ? 'disabled' : ''}>&#8249;</button>
      <span class="pagination-info">${categoryPage + 1} / ${totalPages}</span>
      <button class="pagination-btn" id="cat-next-btn" ${categoryPage >= totalPages - 1 ? 'disabled' : ''}>&#8250;</button>
    `;
    categoryContainer.appendChild(paginationEl);

    // Attach pagination event listeners
    const prevBtn = paginationEl.querySelector('#cat-prev-btn');
    const nextBtn = paginationEl.querySelector('#cat-next-btn');

    prevBtn.addEventListener('click', () => {
      if (categoryPage > 0) {
        categoryPage--;
        renderCategorySpending({ range });
      }
    });

    nextBtn.addEventListener('click', () => {
      if (categoryPage < totalPages - 1) {
        categoryPage++;
        renderCategorySpending({ range });
      }
    });
  }
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
 * Render top merchants with date filter
 * @param {Array} data - Top merchants data from API
 */
function renderTopMerchants(data) {
  const merchantsContainer = container.querySelector('#merchants-container');

  // Filter labels
  const filterLabels = {
    'this_month': 'This Month',
    'last_month': 'Last Month',
    'last_3_months': 'Last 3 Months',
    'ytd': 'Year to Date',
    'last_year': 'Last Year',
    'all_time': 'All Time'
  };

  merchantsContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Top Merchants</h3>
      <span class="card-subtitle">By total spending - ${filterLabels[merchantFilter]}</span>
    </div>
    <div class="merchants-filter" id="merchants-filter">
      <button class="merchants-filter-btn ${merchantFilter === 'this_month' ? 'active' : ''}" data-filter="this_month">This Month</button>
      <button class="merchants-filter-btn ${merchantFilter === 'last_month' ? 'active' : ''}" data-filter="last_month">Last Month</button>
      <button class="merchants-filter-btn ${merchantFilter === 'last_3_months' ? 'active' : ''}" data-filter="last_3_months">Last 3 Months</button>
      <button class="merchants-filter-btn ${merchantFilter === 'ytd' ? 'active' : ''}" data-filter="ytd">YTD</button>
      <button class="merchants-filter-btn ${merchantFilter === 'last_year' ? 'active' : ''}" data-filter="last_year">Last Year</button>
      <button class="merchants-filter-btn ${merchantFilter === 'all_time' ? 'active' : ''}" data-filter="all_time">All Time</button>
    </div>
  `;

  // Attach filter event listeners
  const filterContainer = merchantsContainer.querySelector('#merchants-filter');
  filterContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('.merchants-filter-btn');
    if (!btn) return;

    const filter = btn.dataset.filter;
    if (filter === merchantFilter) return;

    merchantFilter = filter;
    await loadMerchantsWithFilter();
  });

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
  listElement.id = 'merchants-list';

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
 * Load merchants with current filter
 */
async function loadMerchantsWithFilter() {
  const merchantsContainer = container.querySelector('#merchants-container');
  const listEl = merchantsContainer.querySelector('#merchants-list');
  if (listEl) {
    listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  }

  try {
    // Build date filter params
    let params = 'by=spend&limit=10';
    const now = new Date();
    let startDate, endDate;

    switch (merchantFilter) {
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'last_3_months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        endDate = now;
        break;
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
        break;
      case 'last_year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      case 'all_time':
      default:
        startDate = null;
        endDate = null;
        break;
    }

    if (startDate && endDate) {
      params += `&start_date=${startDate.toISOString().split('T')[0]}&end_date=${endDate.toISOString().split('T')[0]}`;
    }

    merchantsData = await api.get(`/merchants/top?${params}`);
    renderTopMerchants(merchantsData);
  } catch (err) {
    console.error('Error loading merchants:', err);
  }
}

/**
 * Render year-over-year comparison
 */
function renderYearOverYear() {
  const yoyContainer = container.querySelector('#yoy-container');

  if (!yoyData || !yoyData.years || yoyData.years.length === 0) {
    yoyContainer.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">Year-over-Year Comparison</h3>
      </div>
      <div class="empty-state">
        <p>No yearly data available yet</p>
      </div>
    `;
    return;
  }

  const availableYears = yoyData.years.map(y => y.year).sort((a, b) => b - a);

  // Build year selector buttons
  const yearButtons = availableYears.map(year => {
    const isActive = selectedYears.includes(year);
    return `<button class="yoy-year-btn ${isActive ? 'active' : ''}" data-year="${year}">${year}</button>`;
  }).join('');

  yoyContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Year-over-Year Comparison</h3>
      <span class="card-subtitle">Monthly income & expenses by year</span>
    </div>
    <div class="yoy-controls">
      <span class="filter-label">Compare Years:</span>
      <div class="yoy-year-selector" id="yoy-year-selector">
        ${yearButtons}
      </div>
    </div>
  `;

  // Attach year selector event listeners
  const yearSelector = yoyContainer.querySelector('#yoy-year-selector');
  yearSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.yoy-year-btn');
    if (!btn) return;

    const year = parseInt(btn.dataset.year);
    if (selectedYears.includes(year)) {
      // Deselect (but keep at least one selected)
      if (selectedYears.length > 1) {
        selectedYears = selectedYears.filter(y => y !== year);
        renderYearOverYear();
      }
    } else {
      // Select
      selectedYears.push(year);
      selectedYears.sort((a, b) => b - a);
      renderYearOverYear();
    }
  });

  // Filter data to selected years
  const selectedData = yoyData.years.filter(y => selectedYears.includes(y.year));

  if (selectedData.length === 0) {
    yoyContainer.innerHTML += `
      <div class="empty-state">
        <p>Select years to compare</p>
      </div>
    `;
    return;
  }

  // Year colors for chart
  const yearColors = [
    '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'
  ];

  // Create chart container
  const chartContainer = document.createElement('div');
  chartContainer.className = 'yoy-chart-container';

  const chartEl = document.createElement('div');
  chartEl.className = 'yoy-chart';

  // Month names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Find max value for scaling
  let maxValue = 0;
  selectedData.forEach(yearData => {
    yearData.months.forEach(m => {
      maxValue = Math.max(maxValue, m.income || 0, m.expenses || 0);
    });
  });
  maxValue = maxValue || 1;

  // Build month groups
  for (let month = 1; month <= 12; month++) {
    const monthGroup = document.createElement('div');
    monthGroup.className = 'yoy-month-group';

    const barsEl = document.createElement('div');
    barsEl.className = 'yoy-bars';

    selectedData.forEach((yearData, yearIdx) => {
      const monthData = yearData.months.find(m => m.month === month) || { income: 0, expenses: 0 };
      const color = yearColors[yearIdx % yearColors.length];

      // Income bar
      const incomeHeight = (monthData.income / maxValue) * 150;
      const incomeBar = document.createElement('div');
      incomeBar.className = 'yoy-bar';
      incomeBar.style.height = `${Math.max(2, incomeHeight)}px`;
      incomeBar.style.backgroundColor = color;
      incomeBar.style.opacity = '0.6';
      incomeBar.title = `${yearData.year} ${monthNames[month - 1]} Income: ${formatCurrency(monthData.income)}`;

      // Expense bar
      const expenseHeight = (monthData.expenses / maxValue) * 150;
      const expenseBar = document.createElement('div');
      expenseBar.className = 'yoy-bar';
      expenseBar.style.height = `${Math.max(2, expenseHeight)}px`;
      expenseBar.style.backgroundColor = color;
      expenseBar.title = `${yearData.year} ${monthNames[month - 1]} Expenses: ${formatCurrency(monthData.expenses)}`;

      barsEl.appendChild(incomeBar);
      barsEl.appendChild(expenseBar);
    });

    const labelEl = document.createElement('div');
    labelEl.className = 'yoy-month-label';
    labelEl.textContent = monthNames[month - 1];

    monthGroup.appendChild(barsEl);
    monthGroup.appendChild(labelEl);
    chartEl.appendChild(monthGroup);
  }

  chartContainer.appendChild(chartEl);
  yoyContainer.appendChild(chartContainer);

  // Legend
  const legendEl = document.createElement('div');
  legendEl.className = 'yoy-legend';

  selectedData.forEach((yearData, idx) => {
    const color = yearColors[idx % yearColors.length];
    legendEl.innerHTML += `
      <div class="yoy-legend-item">
        <span class="yoy-legend-color" style="background-color: ${color}"></span>
        <span class="yoy-legend-label">${yearData.year} (lighter = income, solid = expenses)</span>
      </div>
    `;
  });

  yoyContainer.appendChild(legendEl);

  // Summary stats
  const summaryEl = document.createElement('div');
  summaryEl.className = 'yoy-summary';

  selectedData.forEach((yearData, idx) => {
    const totalIncome = yearData.months.reduce((sum, m) => sum + (m.income || 0), 0);
    const totalExpenses = yearData.months.reduce((sum, m) => sum + (m.expenses || 0), 0);
    const net = totalIncome - totalExpenses;
    const netClass = net >= 0 ? 'amount-positive' : 'amount-negative';

    summaryEl.innerHTML += `
      <div class="yoy-summary-stat">
        <div class="yoy-summary-label">${yearData.year} Income</div>
        <div class="yoy-summary-value amount-positive">${formatCurrency(totalIncome)}</div>
      </div>
      <div class="yoy-summary-stat">
        <div class="yoy-summary-label">${yearData.year} Expenses</div>
        <div class="yoy-summary-value amount-negative">${formatCurrency(totalExpenses)}</div>
      </div>
      <div class="yoy-summary-stat">
        <div class="yoy-summary-label">${yearData.year} Net</div>
        <div class="yoy-summary-value ${netClass}">${net >= 0 ? '+' : ''}${formatCurrency(net)}</div>
      </div>
    `;
  });

  yoyContainer.appendChild(summaryEl);
}

/**
 * Render monthly expense breakdown
 * @param {Object} data - Monthly breakdown data from API
 */
function renderExpenseBreakdown(data) {
  const breakdownContainer = container.querySelector('#expense-breakdown-container');

  const periodStr = data.period.start && data.period.end
    ? `${formatMonthName(data.period.start)} - ${formatMonthName(data.period.end)}`
    : 'Last 3 Months';

  breakdownContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Avg Monthly Expenses Breakdown</h3>
      <span class="card-subtitle">${periodStr} (${data.months_analyzed} months)</span>
    </div>
  `;

  // Summary section
  const summaryEl = document.createElement('div');
  summaryEl.className = 'expense-breakdown-summary';
  summaryEl.innerHTML = `
    <div class="breakdown-stat breakdown-stat--primary">
      <span class="breakdown-stat-label">Avg Monthly Expenses</span>
      <span class="breakdown-stat-value amount-negative">${formatCurrency(data.avg_monthly_expenses)}</span>
    </div>
    <div class="breakdown-stat">
      <span class="breakdown-stat-label">Avg Monthly Income</span>
      <span class="breakdown-stat-value amount-positive">${formatCurrency(data.avg_monthly_income)}</span>
    </div>
  `;
  breakdownContainer.appendChild(summaryEl);

  if (!data.category_averages || data.category_averages.length === 0) {
    breakdownContainer.innerHTML += `
      <div class="empty-state">
        <p>No expense data for this period</p>
      </div>
    `;
    return;
  }

  // Category breakdown
  const categoryHeader = document.createElement('div');
  categoryHeader.className = 'breakdown-section-header';
  categoryHeader.innerHTML = `
    <h4>Category Breakdown</h4>
    <span class="breakdown-hint">Click a category to view transactions</span>
  `;
  breakdownContainer.appendChild(categoryHeader);

  const listElement = document.createElement('div');
  listElement.className = 'breakdown-category-list';

  const maxAvg = data.category_averages[0]?.avg_monthly || 1;

  data.category_averages.forEach(category => {
    const row = document.createElement('div');
    row.className = 'breakdown-category-item';
    row.dataset.categoryId = category.category_id;

    const barWidth = (category.avg_monthly / maxAvg) * 100;

    row.innerHTML = `
      <div class="breakdown-category-info">
        <span class="category-indicator" style="background-color: ${category.colour}"></span>
        <span class="breakdown-category-name">${escapeHtml(category.category_name)}</span>
        <span class="breakdown-category-percentage">${category.percentage.toFixed(1)}%</span>
      </div>
      <div class="breakdown-category-bar-wrapper">
        <div class="breakdown-category-bar" style="width: ${barWidth}%; background-color: ${category.colour}"></div>
      </div>
      <div class="breakdown-category-amount">
        <span class="breakdown-avg">${formatCurrency(category.avg_monthly)}/mo</span>
        <span class="breakdown-total">(${formatCurrency(category.total)} total)</span>
      </div>
      <button class="btn btn-sm btn-secondary breakdown-view-btn" data-category-id="${category.category_id}" data-category-name="${escapeHtml(category.category_name)}">
        View
      </button>
    `;

    listElement.appendChild(row);
  });

  breakdownContainer.appendChild(listElement);

  // Add click handlers for view buttons
  listElement.querySelectorAll('.breakdown-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const categoryId = btn.dataset.categoryId;
      // Navigate to transactions filtered by category and date range
      const params = new URLSearchParams();
      params.set('category', categoryId);
      if (data.period.start) {
        params.set('start_date', data.period.start + '-01'); // First day of start month
      }
      if (data.period.end) {
        // Last day of end month
        const [year, month] = data.period.end.split('-');
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        params.set('end_date', `${data.period.end}-${lastDay}`);
      }
      window.location.hash = `/transactions?${params.toString()}`;
    });
  });

  // Monthly breakdown toggle
  const monthlyToggle = document.createElement('details');
  monthlyToggle.className = 'monthly-breakdown-details';
  monthlyToggle.innerHTML = `
    <summary class="monthly-breakdown-toggle">View Monthly Details</summary>
    <div class="monthly-breakdown-content">
      ${data.monthly_breakdown.map(month => `
        <div class="monthly-breakdown-month">
          <div class="monthly-breakdown-month-header">
            <span class="month-name">${formatMonthName(month.month)}</span>
            <span class="month-total">${formatCurrency(month.total_expenses)}</span>
          </div>
          <div class="monthly-breakdown-categories">
            ${month.category_breakdown.slice(0, 5).map(cat => `
              <div class="monthly-cat-item">
                <span class="monthly-cat-indicator" style="background-color: ${cat.colour}"></span>
                <span class="monthly-cat-name">${escapeHtml(cat.category_name)}</span>
                <span class="monthly-cat-amount">${formatCurrency(cat.total)}</span>
              </div>
            `).join('')}
            ${month.category_breakdown.length > 5 ? `
              <div class="monthly-cat-more">+${month.category_breakdown.length - 5} more categories</div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  breakdownContainer.appendChild(monthlyToggle);
}

/**
 * Format month string (YYYY-MM) to readable name
 * @param {string} monthStr - Month string in YYYY-MM format
 * @returns {string} Month name with year
 */
function formatMonthName(monthStr) {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
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
