/**
 * Analytics Trends Page
 * Spending trends and year-over-year comparison
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';
import { showWarning } from '../../core/toast.js';

let container = null;
let cleanupFunctions = [];
let currentRange = 'this_month';
let currentStartDate = null;
let currentEndDate = null;
let yoyData = null;
let selectedYears = [];

const YEAR_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

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
      <div class="page-header analytics-header">
        <div class="page-header__content">
          <h1 class="page-title">Spending Trends</h1>
          <p class="page-subtitle">Track spending patterns over time</p>
        </div>
        <div class="analytics-sub-nav">
          <a href="#/analytics/summary" class="analytics-sub-nav-link">Summary</a>
          <a href="#/analytics/trends" class="analytics-sub-nav-link active">Trends</a>
          <a href="#/analytics/spend" class="analytics-sub-nav-link">Spending</a>
          <a href="#/analytics/merchants" class="analytics-sub-nav-link">Merchants</a>
        </div>
      </div>

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

      <section class="trends-section">
        <div id="trends-container" class="card trends-card">
          <div class="loading"><div class="spinner"></div><p>Loading trends...</p></div>
        </div>
      </section>

      <section class="yoy-section">
        <div id="yoy-container" class="card yoy-card">
          <div class="loading"><div class="spinner"></div><p>Loading year comparison...</p></div>
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
        loadTrendsData();
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
      if (!startInput.value || !endInput.value) { showWarning('Please select both dates'); return; }
      if (startInput.value > endInput.value) { showWarning('Start date must be before end date'); return; }
      currentRange = 'custom';
      currentStartDate = startInput.value;
      currentEndDate = endInput.value;
      loadTrendsData();
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
  await Promise.all([loadTrendsData(), loadYoYData()]);
}

async function loadTrendsData() {
  const queryParams = buildQueryParams();
  try {
    const trendsData = await api.get(`/analytics/trends?${queryParams}&group_by=day`);
    renderTrends(trendsData);
  } catch (err) {
    container.querySelector('#trends-container').innerHTML = `<div class="error-state"><p>Failed to load trends</p></div>`;
  }
}

async function loadYoYData() {
  try {
    yoyData = await api.get('/analytics/year-over-year');
    if (yoyData && yoyData.years) {
      const availableYears = yoyData.years.map(y => y.year).sort((a, b) => b - a);
      selectedYears = availableYears.slice(0, 2);
    }
    renderYearOverYear();
  } catch (err) {
    container.querySelector('#yoy-container').innerHTML = `<div class="error-state"><p>Failed to load YoY data</p></div>`;
  }
}

function renderTrends(data) {
  const trendsContainer = container.querySelector('#trends-container');
  const { trends, range, group_by: groupBy } = data;

  trendsContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Spending Trends</h3>
      <span class="card-subtitle">${range.start_date} to ${range.end_date}</span>
    </div>
  `;

  if (!trends || trends.length === 0) {
    trendsContainer.innerHTML += `<div class="empty-state"><p>No spending data for this period</p></div>`;
    return;
  }

  const maxSpending = Math.max(...trends.map(t => t.spending), 1);
  const totalSpending = trends.reduce((sum, t) => sum + t.spending, 0);
  const avgSpending = trends.length > 0 ? totalSpending / trends.length : 0;

  const chartEl = document.createElement('div');
  chartEl.className = 'trend-chart';

  trends.forEach(trend => {
    const height = (trend.spending / maxSpending) * 100;
    const wrapper = document.createElement('div');
    wrapper.className = 'trend-bar-wrapper';
    wrapper.innerHTML = `
      <div class="trend-bar" style="height: ${height}%" title="${trend.period}: ${formatCurrency(trend.spending)}"></div>
    `;
    chartEl.appendChild(wrapper);
  });
  trendsContainer.appendChild(chartEl);

  const summaryEl = document.createElement('div');
  summaryEl.className = 'trend-summary';
  summaryEl.innerHTML = `
    <div class="trend-stat"><span class="trend-stat-label">Total Spending</span><span class="trend-stat-value">${formatCurrency(totalSpending)}</span></div>
    <div class="trend-stat"><span class="trend-stat-label">Avg per Day</span><span class="trend-stat-value">${formatCurrency(avgSpending)}</span></div>
    <div class="trend-stat"><span class="trend-stat-label">Days</span><span class="trend-stat-value">${trends.length}</span></div>
  `;
  trendsContainer.appendChild(summaryEl);
}

function renderYearOverYear() {
  const yoyContainer = container.querySelector('#yoy-container');

  if (!yoyData || !yoyData.years || yoyData.years.length === 0) {
    yoyContainer.innerHTML = `
      <div class="card-header"><h3 class="card-title">Year-over-Year Comparison</h3></div>
      <div class="empty-state"><p>Not enough data for comparison</p></div>
    `;
    return;
  }

  const availableYears = yoyData.years.map(y => y.year).sort((a, b) => b - a);
  const yearButtons = availableYears.map(year =>
    `<button class="yoy-year-btn ${selectedYears.includes(year) ? 'active' : ''}" data-year="${year}">${year}</button>`
  ).join('');

  yoyContainer.innerHTML = `
    <div class="card-header"><h3 class="card-title">Year-over-Year Comparison</h3><span class="card-subtitle">Monthly spending by year</span></div>
    <div class="yoy-controls">
      <span class="filter-label">Compare Years:</span>
      <div class="yoy-year-selector" id="yoy-year-selector">${yearButtons}</div>
    </div>
  `;

  const yearSelector = yoyContainer.querySelector('#yoy-year-selector');
  yearSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.yoy-year-btn');
    if (!btn) return;
    const year = parseInt(btn.dataset.year);
    if (selectedYears.includes(year)) {
      if (selectedYears.length > 1) { selectedYears = selectedYears.filter(y => y !== year); renderYearOverYear(); }
    } else {
      selectedYears.push(year);
      selectedYears.sort((a, b) => b - a);
      renderYearOverYear();
    }
  });

  const selectedData = yoyData.years.filter(y => selectedYears.includes(y.year));
  if (selectedData.length === 0) {
    yoyContainer.innerHTML += `<div class="empty-state"><p>Select years to compare</p></div>`;
    return;
  }

  const maxExpenses = Math.max(...selectedData.flatMap(y => y.months.map(m => m.expenses)), 1);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const chartEl = document.createElement('div');
  chartEl.className = 'yoy-chart-container';
  let chartHTML = '<div class="yoy-chart">';

  for (let month = 0; month < 12; month++) {
    chartHTML += `<div class="yoy-month-group"><div class="yoy-bars">`;
    selectedData.forEach((yearData, idx) => {
      const monthData = yearData.months.find(m => m.month === month + 1) || { expenses: 0 };
      const height = (monthData.expenses / maxExpenses) * 100;
      const color = YEAR_COLORS[idx % YEAR_COLORS.length];
      chartHTML += `<div class="yoy-bar" style="height: ${height}%; background-color: ${color}" title="${yearData.year} ${monthNames[month]}: ${formatCurrency(monthData.expenses)}"></div>`;
    });
    chartHTML += `</div><div class="yoy-month-label">${monthNames[month]}</div></div>`;
  }
  chartHTML += '</div>';
  chartEl.innerHTML = chartHTML;
  yoyContainer.appendChild(chartEl);

  const legendEl = document.createElement('div');
  legendEl.className = 'yoy-legend';
  legendEl.innerHTML = selectedData.map((y, idx) =>
    `<div class="yoy-legend-item"><span class="yoy-legend-color" style="background-color: ${YEAR_COLORS[idx % YEAR_COLORS.length]}"></span><span class="yoy-legend-label">${y.year}</span></div>`
  ).join('');
  yoyContainer.appendChild(legendEl);

  const summaryEl = document.createElement('div');
  summaryEl.className = 'yoy-summary';
  summaryEl.innerHTML = selectedData.map((yearData, idx) => {
    const total = yearData.months.reduce((sum, m) => sum + m.expenses, 0);
    return `<div class="yoy-summary-stat"><div class="yoy-summary-label">${yearData.year} Total</div><div class="yoy-summary-value amount-negative">${formatCurrency(total)}</div></div>`;
  }).join('');
  yoyContainer.appendChild(summaryEl);
}
