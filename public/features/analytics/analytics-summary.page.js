/**
 * Analytics Summary Page
 * Overview with filters, totals, spending by category, income vs expenses, and YoY balance
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';
import { showWarning } from '../../core/toast.js';

// Private state
let container = null;
let cleanupFunctions = [];

// Current filter state
let currentRange = 'this_month';
let currentStartDate = null;
let currentEndDate = null;

// Category colors
const CATEGORY_COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
  '#82CA9D', '#FFC658', '#8DD1E1', '#A4DE6C', '#D0ED57'
];

// Data
let categoryData = [];
let balanceYoyData = null;
let selectedBalanceYears = [];
let mainAccountId = null;

function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

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
  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

function loadStyles() {
  const styleId = 'analytics-summary-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/analytics/analytics-summary.css';
    document.head.appendChild(link);
  }
  const analyticsStyleId = 'analytics-styles';
  if (!document.getElementById(analyticsStyleId)) {
    const link = document.createElement('link');
    link.id = analyticsStyleId;
    link.rel = 'stylesheet';
    link.href = 'features/analytics/analytics.css';
    document.head.appendChild(link);
  }
}

function render() {
  container.innerHTML = `
    <div class="page analytics-summary-page">
      <!-- Sub-navigation with Date Range Filters -->
      <div class="analytics-nav-bar">
        <div class="analytics-sub-nav">
          <a href="#/analytics/summary" class="analytics-sub-nav-link active">Summary</a>
          <a href="#/analytics/trends" class="analytics-sub-nav-link">Trends</a>
          <a href="#/analytics/spend" class="analytics-sub-nav-link">Spending</a>
          <a href="#/analytics/merchants" class="analytics-sub-nav-link">Merchants</a>
        </div>
        <div class="analytics-date-filters">
          <div class="filter-buttons" id="range-selector">
            <button class="filter-btn active" data-range="this_month">This Month</button>
            <button class="filter-btn" data-range="last_3_months">3 Months</button>
            <button class="filter-btn" data-range="last_year">Year</button>
            <button class="filter-btn" data-range="custom">Custom</button>
          </div>
          <div class="custom-date-inputs hidden" id="custom-dates">
            <input type="date" id="start-date" class="form-input" title="From date">
            <input type="date" id="end-date" class="form-input" title="To date">
            <button class="btn btn-primary btn-sm" id="apply-custom-dates">Apply</button>
          </div>
        </div>
      </div>

      <!-- Summary Stats -->
      <section class="summary-section">
        <div id="summary-container" class="summary-stats">
          <div class="loading"><div class="spinner"></div></div>
        </div>
      </section>

      <!-- Main Analytics Grid -->
      <section class="analytics-grid">
        <!-- Spending by Category -->
        <div id="category-spending-container" class="card category-spending-card">
          <div class="loading"><div class="spinner"></div><p>Loading categories...</p></div>
        </div>

        <!-- Income vs Expenses -->
        <div id="income-expenses-container" class="card income-expenses-card">
          <div class="loading"><div class="spinner"></div><p>Loading comparison...</p></div>
        </div>
      </section>

      <!-- Year-on-Year Balance Chart -->
      <section class="balance-yoy-section">
        <div id="balance-yoy-container" class="card balance-yoy-card">
          <div class="loading"><div class="spinner"></div><p>Loading balance history...</p></div>
        </div>
      </section>
    </div>
  `;
}

function attachEventListeners() {
  const rangeSelector = container.querySelector('#range-selector');
  if (rangeSelector) {
    const rangeHandler = (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      const range = btn.dataset.range;
      if (range === currentRange) return;
      rangeSelector.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const customDates = container.querySelector('#custom-dates');
      if (range === 'custom') {
        customDates.classList.remove('hidden');
      } else {
        customDates.classList.add('hidden');
        currentRange = range;
        currentStartDate = null;
        currentEndDate = null;
        loadFilteredData();
      }
    };
    rangeSelector.addEventListener('click', rangeHandler);
    onCleanup(() => rangeSelector.removeEventListener('click', rangeHandler));
  }

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
      loadFilteredData();
    };
    applyBtn.addEventListener('click', applyHandler);
    onCleanup(() => applyBtn.removeEventListener('click', applyHandler));
  }
}

function buildQueryParams() {
  const params = new URLSearchParams();
  params.set('range', currentRange);
  if (currentRange === 'custom' && currentStartDate && currentEndDate) {
    params.set('start_date', currentStartDate);
    params.set('end_date', currentEndDate);
  }
  return params.toString();
}

async function loadData() {
  try {
    const accounts = await api.get('/accounts');
    if (accounts.length > 0) {
      mainAccountId = accounts[0].id;
    }
    await Promise.all([
      loadFilteredData(),
      loadBalanceYoYData()
    ]);
  } catch (err) {
    showError(err.message);
  }
}

async function loadFilteredData() {
  const queryParams = buildQueryParams();
  try {
    const [summaryData, categoryDataResp, incomeExpenseData] = await Promise.all([
      api.get(`/analytics/summary?${queryParams}`),
      api.get(`/analytics/spending-by-category?${queryParams}`),
      api.get(`/analytics/income-vs-expenses?${queryParams}`)
    ]);
    categoryData = categoryDataResp.categories || [];
    renderSummaryStats(summaryData);
    renderCategorySpending(categoryDataResp);
    renderIncomeVsExpenses(incomeExpenseData);
  } catch (err) {
    console.error('Failed to load filtered data:', err);
  }
}

async function loadBalanceYoYData() {
  const balanceContainer = container.querySelector('#balance-yoy-container');
  try {
    if (!mainAccountId) {
      balanceContainer.innerHTML = `
        <div class="card-header"><h3 class="card-title">Year-on-Year Balance Comparison</h3></div>
        <div class="empty-state"><p>Add an account to start tracking your balance over time</p></div>
      `;
      return;
    }
    balanceYoyData = await api.get(`/accounts/${mainAccountId}/balance-history`);
    if (balanceYoyData && balanceYoyData.years && balanceYoyData.years.length > 0) {
      const availableYears = balanceYoyData.years.map(y => y.year).sort((a, b) => b - a);
      selectedBalanceYears = availableYears.slice(0, Math.min(3, availableYears.length));
    }
    renderBalanceYoY();
  } catch (err) {
    balanceContainer.innerHTML = `
      <div class="card-header"><h3 class="card-title">Year-on-Year Balance Comparison</h3></div>
      <div class="error-state"><p>Failed to load balance history: ${escapeHtml(err.message)}</p></div>
    `;
  }
}

function renderSummaryStats(data) {
  const summaryContainer = container.querySelector('#summary-container');
  const { summary } = data;
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

function renderCategorySpending(data) {
  const categoryContainer = container.querySelector('#category-spending-container');
  const categories = data.categories || [];
  const total = categories.reduce((sum, cat) => sum + cat.total, 0);

  categoryContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Spending by Category</h3>
      <span class="card-subtitle">${categories.length} categories</span>
    </div>
  `;

  if (categories.length === 0) {
    categoryContainer.innerHTML += `<div class="empty-state"><p>Add some transactions to see your spending breakdown</p></div>`;
    return;
  }

  const listEl = document.createElement('div');
  listEl.className = 'category-list';

  // Show top 6 categories
  const topCategories = categories.slice(0, 6);
  topCategories.forEach((cat, idx) => {
    const percentage = total > 0 ? (cat.total / total) * 100 : 0;
    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];

    const itemEl = document.createElement('div');
    itemEl.className = 'category-item';
    itemEl.innerHTML = `
      <div class="category-info">
        <div class="category-indicator" style="background-color: ${color}"></div>
        <span class="category-name">${escapeHtml(cat.name)}</span>
        <span class="category-percentage">${percentage.toFixed(1)}%</span>
      </div>
      <div class="category-bar-wrapper">
        <div class="category-bar" style="width: ${percentage}%; background-color: ${color}"></div>
      </div>
      <div class="category-amount">${formatCurrency(cat.total)}</div>
    `;
    listEl.appendChild(itemEl);
  });

  categoryContainer.appendChild(listEl);
}

function renderIncomeVsExpenses(data) {
  const incomeExpenseContainer = container.querySelector('#income-expenses-container');
  const { months, totals } = data;

  let subtitle = '';
  if (months && months.length > 0) {
    const firstMonth = months[0].month;
    const lastMonth = months[months.length - 1].month;
    subtitle = `${formatMonthLabel(firstMonth)} - ${formatMonthLabel(lastMonth)} ${lastMonth.split('-')[0]}`;
  }

  incomeExpenseContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Income vs Expenses</h3>
      <span class="card-subtitle">${subtitle}</span>
    </div>
  `;

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

  // Monthly bars chart
  const chartEl = document.createElement('div');
  chartEl.className = 'monthly-chart';
  const maxValue = Math.max(...months.map(m => Math.max(m.income, m.expenses)), 1);
  const displayMonths = months.length > 6 ? months.slice(-6) : months;

  displayMonths.forEach(month => {
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
    chartEl.appendChild(barGroup);
  });
  incomeExpenseContainer.appendChild(chartEl);

  // Legend
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

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return monthNames[parseInt(month, 10) - 1] || month;
}

function renderBalanceYoY() {
  const balanceContainer = container.querySelector('#balance-yoy-container');

  if (!balanceYoyData || !balanceYoyData.years || balanceYoyData.years.length === 0) {
    balanceContainer.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">Year-on-Year Balance Comparison</h3>
        <span class="card-subtitle">Main Account: ${escapeHtml(balanceYoyData?.account_name || 'Unknown')}</span>
      </div>
      <div class="empty-state"><p>Keep tracking your finances to see your balance trends over time</p></div>
    `;
    return;
  }

  const availableYears = balanceYoyData.years.map(y => y.year).sort((a, b) => b - a);
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
      <div class="yoy-year-selector" id="balance-year-selector">${yearButtons}</div>
    </div>
  `;

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

  const selectedData = balanceYoyData.years.filter(y => selectedBalanceYears.includes(y.year));
  if (selectedData.length === 0) {
    balanceContainer.innerHTML += `<div class="empty-state"><p>Click on the years above to compare your balance journey</p></div>`;
    return;
  }

  const yearColors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
  const chartContainer = document.createElement('div');
  chartContainer.className = 'balance-chart-container';

  const width = 800, height = 300;
  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  let minBalance = Infinity, maxBalance = -Infinity;
  selectedData.forEach(yearData => {
    yearData.months.forEach(m => {
      if (m.balance !== null && m.balance !== undefined) {
        minBalance = Math.min(minBalance, m.balance);
        maxBalance = Math.max(maxBalance, m.balance);
      }
    });
  });

  const range = maxBalance - minBalance || 1;
  minBalance = minBalance - range * 0.1;
  maxBalance = maxBalance + range * 0.1;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const xScale = (month) => padding.left + ((month - 1) / 11) * chartWidth;
  const yScale = (value) => padding.top + chartHeight - ((value - minBalance) / (maxBalance - minBalance)) * chartHeight;

  const yLabels = [];
  for (let i = 0; i <= 5; i++) {
    const value = minBalance + ((maxBalance - minBalance) * i / 5);
    yLabels.push({ y: yScale(value), label: formatCurrency(value) });
  }

  const lines = selectedData.map((yearData, idx) => {
    const color = yearColors[idx % yearColors.length];
    const points = [];
    yearData.months.forEach(m => {
      if (m.balance !== null && m.balance !== undefined) {
        points.push({ x: xScale(m.month), y: yScale(m.balance), month: m.month, balance: m.balance });
      }
    });
    // Use smooth curved path instead of straight lines
    const pathD = createSmoothPath(points);
    return { year: yearData.year, color, points, pathD };
  });

  chartContainer.innerHTML = `
    <svg class="balance-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <g class="chart-grid">
        ${yLabels.map(l => `<line x1="${padding.left}" y1="${l.y}" x2="${width - padding.right}" y2="${l.y}" stroke="#e5e7eb" stroke-opacity="0.5" />`).join('')}
      </g>
      ${minBalance < 0 && maxBalance > 0 ? `<line class="zero-line" x1="${padding.left}" y1="${yScale(0)}" x2="${width - padding.right}" y2="${yScale(0)}" stroke="#9ca3af" stroke-dasharray="4 4" />` : ''}
      ${lines.map(line => `<path class="balance-line" d="${line.pathD}" fill="none" stroke="${line.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`).join('')}
      ${lines.map(line => line.points.map(p => `<circle class="balance-point" cx="${p.x}" cy="${p.y}" r="5" fill="${line.color}" stroke="white" stroke-width="2"><title>${line.year} ${monthNames[p.month - 1]}: ${formatCurrency(p.balance)}</title></circle>`).join('')).join('')}
      <g class="chart-labels-y">${yLabels.map(l => `<text x="${padding.left - 10}" y="${l.y}" dy="4" text-anchor="end" fill="#6b7280" font-size="11">${l.label}</text>`).join('')}</g>
      <g class="chart-labels-x">${monthNames.map((name, i) => `<text x="${xScale(i + 1)}" y="${height - 15}" text-anchor="middle" fill="#6b7280" font-size="11">${name}</text>`).join('')}</g>
    </svg>
  `;
  balanceContainer.appendChild(chartContainer);

  const legendEl = document.createElement('div');
  legendEl.className = 'balance-legend';
  legendEl.innerHTML = lines.map(line => `
    <div class="balance-legend-item">
      <span class="balance-legend-color" style="background-color: ${line.color}"></span>
      <span class="balance-legend-label">${line.year}</span>
    </div>
  `).join('');
  balanceContainer.appendChild(legendEl);

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
          <span class="balance-summary-stat"><span class="stat-label">Start</span><span class="stat-value">${formatCurrency(startBalance)}</span></span>
          <span class="balance-summary-stat"><span class="stat-label">End</span><span class="stat-value">${formatCurrency(endBalance)}</span></span>
          <span class="balance-summary-stat"><span class="stat-label">Change</span><span class="stat-value ${changeClass}">${change >= 0 ? '+' : ''}${formatCurrency(change)}</span></span>
        </div>
      </div>
    `;
  }).join('');
  balanceContainer.appendChild(summaryEl);
}

/**
 * Create smooth SVG path using Catmull-Rom spline
 * @param {Array} points - Array of {x, y} points
 * @returns {string} SVG path string with smooth curves
 */
function createSmoothPath(points) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= points.length ? i + 1 : i + 2];

    // Catmull-Rom to Bezier conversion
    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

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
