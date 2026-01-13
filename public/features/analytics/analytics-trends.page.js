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
      <!-- Sub-navigation with Date Range Filters -->
      <div class="analytics-nav-bar">
        <div class="analytics-sub-nav">
          <a href="#/analytics/summary" class="analytics-sub-nav-link">Summary</a>
          <a href="#/analytics/trends" class="analytics-sub-nav-link active">Trends</a>
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
      <h3 class="card-title">Spending Insights</h3>
      <span class="card-subtitle">${range.start_date} to ${range.end_date}</span>
    </div>
  `;

  if (!trends || trends.length === 0) {
    trendsContainer.innerHTML += `<div class="empty-state"><p>Add some transactions to see your spending insights here</p></div>`;
    return;
  }

  // Calculate advanced KPIs
  const totalSpending = trends.reduce((sum, t) => sum + t.spending, 0);
  const daysWithData = trends.filter(t => t.spending > 0).length;
  const totalDays = trends.length;
  const burnRate = daysWithData > 0 ? totalSpending / daysWithData : 0;

  // Peak spending day
  const peakDay = trends.reduce((max, t) => t.spending > max.spending ? t : max, trends[0]);

  // Calculate spending velocity (is spending accelerating or decelerating?)
  const midpoint = Math.floor(trends.length / 2);
  const firstHalf = trends.slice(0, midpoint);
  const secondHalf = trends.slice(midpoint);
  const firstHalfAvg = firstHalf.length > 0 ? firstHalf.reduce((s, t) => s + t.spending, 0) / firstHalf.length : 0;
  const secondHalfAvg = secondHalf.length > 0 ? secondHalf.reduce((s, t) => s + t.spending, 0) / secondHalf.length : 0;
  const velocityChange = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;
  const velocityDirection = velocityChange > 5 ? 'accelerating' : velocityChange < -5 ? 'slowing' : 'steady';

  // Projected monthly spend (extrapolate to 30 days)
  const projectedMonthly = burnRate * 30;

  // Days remaining in current period
  const today = new Date();
  const endDate = new Date(range.end_date);
  const daysRemaining = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));

  // Projected total for period
  const projectedTotal = totalSpending + (burnRate * daysRemaining);

  // Build the insights grid
  const insightsEl = document.createElement('div');
  insightsEl.className = 'spending-insights-grid';
  insightsEl.innerHTML = `
    <div class="insight-card insight-card--primary">
      <div class="insight-icon">🔥</div>
      <div class="insight-content">
        <span class="insight-label">Daily Burn Rate</span>
        <span class="insight-value">${formatCurrency(burnRate)}</span>
        <span class="insight-hint">${daysWithData} active spending days</span>
      </div>
    </div>
    <div class="insight-card insight-card--secondary">
      <div class="insight-icon">📊</div>
      <div class="insight-content">
        <span class="insight-label">Projected Monthly</span>
        <span class="insight-value">${formatCurrency(projectedMonthly)}</span>
        <span class="insight-hint">Based on current rate</span>
      </div>
    </div>
    <div class="insight-card insight-card--tertiary">
      <div class="insight-icon">${velocityDirection === 'accelerating' ? '📈' : velocityDirection === 'slowing' ? '📉' : '➡️'}</div>
      <div class="insight-content">
        <span class="insight-label">Spending Velocity</span>
        <span class="insight-value insight-value--${velocityDirection === 'slowing' ? 'positive' : velocityDirection === 'accelerating' ? 'negative' : 'neutral'}">${velocityDirection === 'steady' ? 'Steady' : (velocityChange > 0 ? '+' : '') + velocityChange.toFixed(0) + '%'}</span>
        <span class="insight-hint">${velocityDirection === 'accelerating' ? 'Spending increasing' : velocityDirection === 'slowing' ? 'Spending decreasing' : 'Consistent pattern'}</span>
      </div>
    </div>
    <div class="insight-card">
      <div class="insight-icon">⚡</div>
      <div class="insight-content">
        <span class="insight-label">Peak Spending Day</span>
        <span class="insight-value">${formatCurrency(peakDay.spending)}</span>
        <span class="insight-hint">${formatPeriodDate(peakDay.period)}</span>
      </div>
    </div>
    ${daysRemaining > 0 ? `
    <div class="insight-card insight-card--wide">
      <div class="insight-icon">🎯</div>
      <div class="insight-content">
        <span class="insight-label">Projected Period Total</span>
        <span class="insight-value">${formatCurrency(projectedTotal)}</span>
        <span class="insight-hint">${daysRemaining} days remaining at ${formatCurrency(burnRate)}/day</span>
      </div>
    </div>
    ` : ''}
  `;
  trendsContainer.appendChild(insightsEl);

  // Spending trend mini-chart (sparkline style)
  const maxSpending = Math.max(...trends.map(t => t.spending), 1);
  const chartEl = document.createElement('div');
  chartEl.className = 'spending-sparkline';
  chartEl.innerHTML = `
    <div class="sparkline-header">
      <span class="sparkline-title">Daily Spending Pattern</span>
      <span class="sparkline-total">${formatCurrency(totalSpending)} total</span>
    </div>
    <div class="sparkline-chart">
      ${trends.map(trend => {
        const height = (trend.spending / maxSpending) * 100;
        const isHighSpend = trend.spending > burnRate * 1.5;
        return `<div class="sparkline-bar${isHighSpend ? ' sparkline-bar--high' : ''}" style="height: ${Math.max(height, 2)}%" title="${formatPeriodDate(trend.period)}: ${formatCurrency(trend.spending)}"></div>`;
      }).join('')}
    </div>
    <div class="sparkline-legend">
      <span class="sparkline-avg-line" style="bottom: ${(burnRate / maxSpending) * 100}%"></span>
      <span class="sparkline-avg-label">Avg: ${formatCurrency(burnRate)}</span>
    </div>
  `;
  trendsContainer.appendChild(chartEl);
}

/**
 * Format period date for display
 */
function formatPeriodDate(period) {
  if (!period) return '';
  const date = new Date(period);
  if (isNaN(date.getTime())) return period;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function renderYearOverYear() {
  const yoyContainer = container.querySelector('#yoy-container');

  if (!yoyData || !yoyData.years || yoyData.years.length === 0) {
    yoyContainer.innerHTML = `
      <div class="card-header"><h3 class="card-title">Year-over-Year Comparison</h3></div>
      <div class="empty-state"><p>Track your spending for a full year to unlock year-over-year insights</p></div>
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
    yoyContainer.innerHTML += `<div class="empty-state"><p>Click on the years above to see how your spending compares</p></div>`;
    return;
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Create SVG line chart with smooth curves
  const svgWidth = 800;
  const svgHeight = 250;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Calculate min/max for Y axis
  const allExpenses = selectedData.flatMap(y => y.months.map(m => m.expenses));
  const maxExpenses = Math.max(...allExpenses, 1);
  const minExpenses = Math.min(...allExpenses, 0);
  const range = maxExpenses - minExpenses || 1;

  // Build data points for each year
  const yearLines = selectedData.map((yearData, idx) => {
    const points = [];
    for (let m = 0; m < 12; m++) {
      const monthData = yearData.months.find(md => md.month === m + 1);
      if (monthData) {
        const x = padding.left + (m / 11) * chartWidth;
        const y = padding.top + chartHeight - ((monthData.expenses - minExpenses) / range) * chartHeight;
        points.push({ x, y, month: m, expenses: monthData.expenses });
      }
    }
    return { year: yearData.year, color: YEAR_COLORS[idx % YEAR_COLORS.length], points };
  });

  // Create smooth path using Catmull-Rom spline
  function createSmoothPath(points) {
    if (points.length < 2) return '';

    const tension = 0.3;
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  }

  // Build SVG content
  let svgContent = `
    <svg class="yoy-line-chart" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">
      <!-- Grid lines -->
      <g class="grid-lines" stroke="var(--border-light)" stroke-dasharray="4,4">
        ${[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padding.top + chartHeight * (1 - pct);
          return `<line x1="${padding.left}" y1="${y}" x2="${svgWidth - padding.right}" y2="${y}"/>`;
        }).join('')}
      </g>

      <!-- Y-axis labels -->
      <g class="y-axis" fill="var(--text-tertiary)" font-size="11">
        ${[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padding.top + chartHeight * (1 - pct);
          const value = minExpenses + range * pct;
          return `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end">${formatCompact(value)}</text>`;
        }).join('')}
      </g>

      <!-- X-axis labels -->
      <g class="x-axis" fill="var(--text-tertiary)" font-size="11" text-anchor="middle">
        ${monthNames.map((name, i) => {
          const x = padding.left + (i / 11) * chartWidth;
          return `<text x="${x}" y="${svgHeight - 10}">${name}</text>`;
        }).join('')}
      </g>

      <!-- Lines for each year -->
      ${yearLines.map(yearLine => {
        if (yearLine.points.length < 2) return '';
        const pathD = createSmoothPath(yearLine.points);
        return `
          <path d="${pathD}" fill="none" stroke="${yearLine.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          ${yearLine.points.map(p => `
            <circle cx="${p.x}" cy="${p.y}" r="5" fill="${yearLine.color}" stroke="var(--bg-primary)" stroke-width="2">
              <title>${yearLine.year} ${monthNames[p.month]}: ${formatCurrency(p.expenses)}</title>
            </circle>
          `).join('')}
        `;
      }).join('')}
    </svg>
  `;

  const chartEl = document.createElement('div');
  chartEl.className = 'yoy-line-chart-container';
  chartEl.innerHTML = svgContent;
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

/**
 * Format currency for chart axis (compact form)
 */
function formatCompact(value) {
  if (value >= 1000) return `£${(value / 1000).toFixed(1)}K`;
  return `£${Math.round(value)}`;
}
