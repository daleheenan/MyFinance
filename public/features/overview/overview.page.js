/**
 * Overview Page - Dashboard for FinanceFlow
 * Displays enhanced account cards with sparklines, quick stats, and recent transactions
 */

import { api } from '../../core/api.js';
import { formatCurrency, formatDate, formatRelativeDate, escapeHtml } from '../../core/utils.js';
import { router } from '../../core/app.js';

// Private state
let container = null;
let cleanupFunctions = [];
let accountsList = []; // Store accounts for chart selector
let selectedChartAccountId = null; // Currently selected account for YoY chart

/**
 * Register cleanup function to be called on unmount
 * @param {function} fn - Cleanup function
 */
function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

/**
 * Mount the overview page
 * @param {HTMLElement} el - Container element
 * @param {URLSearchParams} params - URL parameters
 */
export async function mount(el, params) {
  container = el;
  cleanupFunctions = [];

  // Load CSS
  loadStyles();

  // Render initial loading state
  render();

  // Load all data
  await loadData();
}

/**
 * Unmount the overview page
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
  const styleId = 'overview-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/overview/overview.css';
    document.head.appendChild(link);
  }
}

/**
 * Render the page structure with loading states
 */
function render() {
  container.innerHTML = `
    <div class="page overview-page overview-page--compact">
      <!-- Top Row: Summary Card + 12-Month Balance Trend -->
      <section class="top-row-section">
        <div id="quick-stats-container" class="summary-card card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading stats...</p>
          </div>
        </div>
        <div id="balance-trend-container" class="balance-trend-card card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading balance trend...</p>
          </div>
        </div>
      </section>

      <!-- Account Cards Grid -->
      <section class="accounts-section">
        <div id="accounts-container" class="accounts-grid">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading accounts...</p>
          </div>
        </div>
      </section>

      <!-- Alerts Section -->
      <section class="alerts-section" id="alerts-section">
        <div id="anomalies-container" class="anomalies-card card hidden">
          <div class="loading">
            <div class="spinner"></div>
            <p>Checking for alerts...</p>
          </div>
        </div>
      </section>

      <!-- Dashboard Grid: Categories + Recent Transactions -->
      <section class="dashboard-grid">
        <div id="categories-container" class="categories-card card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading categories...</p>
          </div>
        </div>
        <div id="transactions-container" class="transactions-card card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading transactions...</p>
          </div>
        </div>
      </section>
    </div>
  `;
}

/**
 * Load all dashboard data in parallel
 */
async function loadData() {
  try {
    // Fetch initial data in parallel (excluding YoY balance which needs account selection)
    const [overviewStats, recentTransactions, categories, anomalies] = await Promise.all([
      api.get('/accounts/overview/stats'),
      api.get('/accounts/overview/recent-transactions?limit=15'),
      api.get('/categories?include_totals=true').catch(() => []),
      api.get('/analytics/anomalies?dismissed=false&limit=5').catch(() => [])
    ]);

    // Store accounts list for chart selector
    accountsList = overviewStats.accounts || [];

    // Set default selected account (first account, or null if none)
    if (accountsList.length > 0 && !selectedChartAccountId) {
      selectedChartAccountId = accountsList[0].id;
    }

    // Render quick stats first
    renderQuickStats(overviewStats.totals, overviewStats.month);

    // Render year-over-year balance trend with account selector
    await loadAndRenderYoYChart();

    // Render anomaly alerts (before accounts)
    renderAnomalies(anomalies);

    // Fetch sparkline data for each account (90 days for better trend visibility)
    const sparklinePromises = overviewStats.accounts.map(account =>
      api.get(`/accounts/${account.id}/balance-trend?days=90`).catch(() => [])
    );
    const sparklineData = await Promise.all(sparklinePromises);

    // Combine account data with sparklines
    const accountsWithSparklines = overviewStats.accounts.map((account, index) => ({
      ...account,
      sparkline: sparklineData[index] || []
    }));

    // Render each section
    renderAccounts(accountsWithSparklines);
    renderTransactions(recentTransactions);
    renderCategories(categories);

    // Attach event listeners after rendering
    attachEventListeners();
  } catch (err) {
    showGlobalError(err.message);
  }
}

/**
 * Render unified summary card (combines Total Balance, Income, Expenses, Net, Safe to Spend)
 * @param {Object} totals - Totals data
 * @param {string} month - Current month string
 */
function renderQuickStats(totals, month) {
  const quickStatsContainer = container.querySelector('#quick-stats-container');

  // Get current month name
  const [year, monthNum] = month.split('-');
  const monthDate = new Date(year, parseInt(monthNum) - 1);
  const monthName = monthDate.toLocaleDateString('en-GB', { month: 'long' });

  const totalClass = totals.balance >= 0 ? 'amount-positive' : 'amount-negative';
  const netClass = totals.net >= 0 ? 'amount-positive' : 'amount-negative';
  const netSign = totals.net >= 0 ? '+' : '';

  // Calculate "Safe to Spend" - balance minus committed expenses (bills, subscriptions)
  // For now, estimate as 70% of balance minus remaining month expenses projection
  const daysInMonth = new Date(year, parseInt(monthNum), 0).getDate();
  const today = new Date().getDate();
  const daysRemaining = Math.max(0, daysInMonth - today);
  const avgDailyExpense = totals.expenses / Math.max(today, 1);
  const projectedRemaining = avgDailyExpense * daysRemaining;
  const safeToSpend = Math.max(0, totals.balance - projectedRemaining);
  const safeToSpendClass = safeToSpend > 100 ? 'amount-positive' : safeToSpend > 0 ? 'amount-warning' : 'amount-negative';

  // Trend arrow for net change
  const netTrendArrow = totals.net >= 0
    ? '<span class="trend-arrow trend-arrow--up">↑</span>'
    : '<span class="trend-arrow trend-arrow--down">↓</span>';

  quickStatsContainer.innerHTML = `
    <div class="summary-card__header">
      <h3 class="summary-card__title">Your Financial Summary</h3>
      <span class="summary-card__month">${monthName} ${year}</span>
    </div>
    <div class="summary-card__balance">
      <span class="summary-card__balance-label">Total Balance</span>
      <span class="summary-card__balance-value ${totalClass}">${formatCurrency(totals.balance)}</span>
    </div>
    <div class="summary-card__safe-to-spend">
      <div class="safe-to-spend">
        <span class="safe-to-spend__label">Safe to Spend</span>
        <span class="safe-to-spend__value ${safeToSpendClass}">${formatCurrency(safeToSpend)}</span>
        <span class="safe-to-spend__hint">${daysRemaining} days left this month</span>
      </div>
    </div>
    <div class="summary-card__metrics">
      <div class="summary-metric summary-metric--income">
        <div class="summary-metric__icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 7l-5-5-5 5"/>
          </svg>
        </div>
        <div class="summary-metric__content">
          <span class="summary-metric__label">Your Income</span>
          <span class="summary-metric__value amount-positive">+${formatCurrency(totals.income)}</span>
        </div>
      </div>
      <div class="summary-metric summary-metric--expenses">
        <div class="summary-metric__icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22V2M7 17l5 5 5-5"/>
          </svg>
        </div>
        <div class="summary-metric__content">
          <span class="summary-metric__label">Your Spending</span>
          <span class="summary-metric__value amount-negative">-${formatCurrency(totals.expenses)}</span>
        </div>
      </div>
      <div class="summary-metric summary-metric--net">
        <div class="summary-metric__icon">
          ${netTrendArrow}
        </div>
        <div class="summary-metric__content">
          <span class="summary-metric__label">Net Change</span>
          <span class="summary-metric__value ${netClass}">${netSign}${formatCurrency(Math.abs(totals.net))}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the 12-month balance trend chart for Main Account
 * Enhanced with Y-axis scale, smooth curves, and all 12 month labels
 * @param {Array} data - Array of {date, balance} objects for 365 days
 */
function renderBalanceTrend(data) {
  const trendContainer = container.querySelector('#balance-trend-container');

  if (!data || data.length === 0) {
    trendContainer.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">Main Account - 12 Month Balance</h3>
      </div>
      <div class="empty-state">
        <p>No balance data available</p>
      </div>
    `;
    return;
  }

  // Sample data to ~12 points (monthly) for cleaner visualization
  const monthlyData = sampleMonthlyData(data);

  // Calculate min/max for scaling with nice round numbers for Y-axis
  const balances = monthlyData.map(d => d.balance);
  const rawMin = Math.min(...balances);
  const rawMax = Math.max(...balances);

  // Calculate nice axis bounds (round to nearest significant value)
  const { minBal, maxBal, yAxisLabels } = calculateYAxisScale(rawMin, rawMax);
  const range = maxBal - minBal || 1;

  // Chart dimensions (in SVG units)
  const svgWidth = 800;
  const svgHeight = 200;
  const padding = { top: 20, right: 30, bottom: 40, left: 70 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Generate SVG path points
  const points = monthlyData.map((d, i) => {
    const x = padding.left + (i / (monthlyData.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.balance - minBal) / range) * chartHeight;
    return { x, y, date: d.date, balance: d.balance };
  });

  // Create smooth curved line using Catmull-Rom spline converted to Bezier
  const smoothPath = createSmoothPath(points);

  // Create smooth area path (filled under the curve)
  const areaPath = `M ${padding.left} ${padding.top + chartHeight} ` +
    `L ${points[0].x} ${points[0].y} ` +
    smoothPath.substring(smoothPath.indexOf('C')) +
    ` L ${points[points.length - 1].x} ${padding.top + chartHeight} Z`;

  // Determine color based on trend
  const firstBalance = balances[0];
  const lastBalance = balances[balances.length - 1];
  const trendColor = lastBalance >= firstBalance ? 'var(--green)' : 'var(--red)';
  const changeAmount = lastBalance - firstBalance;
  const changePercent = firstBalance !== 0 ? ((changeAmount / Math.abs(firstBalance)) * 100).toFixed(1) : 0;
  const changeSign = changeAmount >= 0 ? '+' : '';

  // Generate Y-axis grid lines and labels
  const yAxisElements = yAxisLabels.map(val => {
    const y = padding.top + chartHeight - ((val - minBal) / range) * chartHeight;
    return {
      y,
      label: formatCompactCurrency(val),
      gridLine: `M ${padding.left} ${y} L ${svgWidth - padding.right} ${y}`
    };
  });

  // Format month labels - show ALL 12 months
  const monthLabels = monthlyData.map((d, i) => {
    const date = new Date(d.date);
    const x = padding.left + (i / (monthlyData.length - 1 || 1)) * chartWidth;
    return {
      x,
      label: date.toLocaleDateString('en-GB', { month: 'short' })
    };
  });

  trendContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Main Account - 12 Month Balance</h3>
      <div class="trend-change ${changeAmount >= 0 ? 'trend-positive' : 'trend-negative'}">
        ${changeSign}${formatCurrency(changeAmount)} (${changeSign}${changePercent}%)
      </div>
    </div>
    <div class="balance-trend-chart">
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" class="trend-svg">
        <defs>
          <linearGradient id="trend-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${trendColor};stop-opacity:0.25"/>
            <stop offset="100%" style="stop-color:${trendColor};stop-opacity:0.02"/>
          </linearGradient>
        </defs>

        <!-- Y-axis grid lines -->
        ${yAxisElements.map(el => `
          <line x1="${padding.left}" y1="${el.y}" x2="${svgWidth - padding.right}" y2="${el.y}"
                stroke="var(--border-color, #e5e5e5)" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>
        `).join('')}

        <!-- Y-axis labels -->
        ${yAxisElements.map(el => `
          <text x="${padding.left - 10}" y="${el.y + 4}"
                text-anchor="end" font-size="12" fill="var(--text-secondary)">${el.label}</text>
        `).join('')}

        <!-- X-axis labels (all 12 months) -->
        ${monthLabels.map(ml => `
          <text x="${ml.x}" y="${svgHeight - 10}"
                text-anchor="middle" font-size="12" fill="var(--text-secondary)">${ml.label}</text>
        `).join('')}

        <!-- Filled area under curve -->
        <path d="${areaPath}" fill="url(#trend-gradient)" />

        <!-- Smooth curve line -->
        <path d="${smoothPath}" fill="none" stroke="${trendColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- Data points -->
        ${points.map((p, i) => `
          <circle cx="${p.x}" cy="${p.y}" r="${i === points.length - 1 ? 6 : 4}"
                  fill="${trendColor}" stroke="var(--bg-secondary)" stroke-width="2"/>
        `).join('')}

        <!-- Current value highlight -->
        <circle cx="${points[points.length - 1].x}" cy="${points[points.length - 1].y}" r="8"
                fill="${trendColor}" opacity="0.2"/>
      </svg>
    </div>
    <div class="balance-trend-footer">
      <span class="trend-min">Low: ${formatCurrency(rawMin)}</span>
      <span class="trend-current">Current: ${formatCurrency(lastBalance)}</span>
      <span class="trend-max">High: ${formatCurrency(rawMax)}</span>
    </div>
  `;
}

/**
 * Load and render the YoY balance chart for the selected account
 */
async function loadAndRenderYoYChart() {
  const trendContainer = container.querySelector('#balance-trend-container');

  if (!selectedChartAccountId || accountsList.length === 0) {
    trendContainer.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">Year-over-Year Balance</h3>
      </div>
      <div class="empty-state">
        <p>Add an account to see your balance trends</p>
      </div>
    `;
    return;
  }

  // Show loading state
  trendContainer.innerHTML = `
    <div class="card-header card-header--with-select">
      <h3 class="card-title">Year-over-Year Balance</h3>
      ${renderAccountSelector()}
    </div>
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading chart...</p>
    </div>
  `;

  // Attach selector event listener
  attachChartSelectorListener();

  // Fetch balance data for selected account
  try {
    const balanceYoY = await api.get(`/accounts/${selectedChartAccountId}/balance-yoy`).catch(() => ({ years: [], months: [] }));
    renderBalanceTrendYoY(balanceYoY);
  } catch (err) {
    trendContainer.innerHTML = `
      <div class="card-header card-header--with-select">
        <h3 class="card-title">Year-over-Year Balance</h3>
        ${renderAccountSelector()}
      </div>
      <div class="empty-state">
        <p>Unable to load balance data</p>
      </div>
    `;
    attachChartSelectorListener();
  }
}

/**
 * Render the account selector dropdown for the chart
 */
function renderAccountSelector() {
  if (accountsList.length === 0) return '';

  const options = accountsList.map(acc =>
    `<option value="${acc.id}" ${acc.id === selectedChartAccountId ? 'selected' : ''}>${escapeHtml(acc.account_name)}</option>`
  ).join('');

  return `
    <select id="chart-account-selector" class="chart-account-selector">
      ${options}
    </select>
  `;
}

/**
 * Attach event listener to chart account selector
 */
function attachChartSelectorListener() {
  const selector = container.querySelector('#chart-account-selector');
  if (selector) {
    const handler = async (e) => {
      selectedChartAccountId = parseInt(e.target.value);
      await loadAndRenderYoYChart();
    };
    selector.addEventListener('change', handler);
    onCleanup(() => selector.removeEventListener('change', handler));
  }
}

/**
 * Render year-over-year balance comparison chart
 * Shows ALL available years with different colors and shaded difference area
 * @param {Object} data - { years: [{year, balances: [12 values]}], months: ['Jan',...] }
 */
function renderBalanceTrendYoY(data) {
  const trendContainer = container.querySelector('#balance-trend-container');

  if (!data || !data.years || data.years.length === 0) {
    trendContainer.innerHTML = `
      <div class="card-header card-header--with-select">
        <h3 class="card-title">Year-over-Year Balance</h3>
        ${renderAccountSelector()}
      </div>
      <div class="empty-state">
        <p>Keep tracking your finances to see balance trends over time</p>
      </div>
    `;
    attachChartSelectorListener();
    return;
  }

  const { months } = data;
  // Use ALL available years (data is already sorted with current year first)
  const years = data.years;

  // Color palette for multiple years (current year is first and most prominent)
  const yearColors = [
    'var(--blue)',      // Current year - primary blue
    'var(--purple)',    // Previous year - purple
    'var(--orange)',    // 2 years ago - orange
    'var(--cyan)',      // 3 years ago - cyan
    'var(--pink)',      // 4 years ago - pink
    'var(--teal)',      // 5 years ago - teal
    '#636366'           // Older years - grey
  ];

  // Get all balances to calculate min/max across ALL years
  const allBalances = years.flatMap(y => y.balances.filter(b => b !== null));
  if (allBalances.length === 0) {
    trendContainer.innerHTML = `
      <div class="card-header card-header--with-select">
        <h3 class="card-title">Year-over-Year Balance</h3>
        ${renderAccountSelector()}
      </div>
      <div class="empty-state">
        <p>Keep tracking your finances to see balance trends over time</p>
      </div>
    `;
    attachChartSelectorListener();
    return;
  }

  const rawMin = Math.min(...allBalances);
  const rawMax = Math.max(...allBalances);
  const { minBal, maxBal, yAxisLabels } = calculateYAxisScale(rawMin, rawMax);
  const range = maxBal - minBal || 1;

  // Chart dimensions
  const svgWidth = 800;
  const svgHeight = 280;
  const padding = { top: 20, right: 30, bottom: 35, left: 70 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Generate Y-axis grid lines and labels
  const yAxisElements = yAxisLabels.map(val => {
    const y = padding.top + chartHeight - ((val - minBal) / range) * chartHeight;
    return {
      y,
      label: formatCompactCurrency(val),
      gridLine: `M ${padding.left} ${y} L ${svgWidth - padding.right} ${y}`
    };
  });

  // Generate X-axis labels for all 12 months
  const monthLabels = months.map((month, i) => {
    const x = padding.left + (i / (months.length - 1 || 1)) * chartWidth;
    return { x, label: month };
  });

  // Generate points and paths for ALL years
  const yearData = years.map((yearInfo, yearIndex) => {
    const points = [];
    yearInfo.balances.forEach((balance, monthIndex) => {
      if (balance !== null) {
        const x = padding.left + (monthIndex / (months.length - 1 || 1)) * chartWidth;
        const y = padding.top + chartHeight - ((balance - minBal) / range) * chartHeight;
        points.push({ x, y, balance, month: months[monthIndex], monthIndex });
      }
    });
    const path = points.length >= 2 ? createSmoothPath(points) : '';
    const color = yearColors[Math.min(yearIndex, yearColors.length - 1)];
    return { year: yearInfo.year, balances: yearInfo.balances, points, path, color };
  });

  // Current year data
  const currentYearData = yearData[0];
  const currentYearBalances = currentYearData.balances;

  // Get the current month (0-indexed)
  const currentMonth = new Date().getMonth();

  // Previous year data (if available)
  const prevYearData = yearData.length > 1 ? yearData[1] : null;

  // Generate shaded difference areas between current year and previous year
  // The shading follows the smooth bezier curves of both lines
  let shadedAreas = '';
  if (prevYearData && currentYearData.points.length >= 2 && prevYearData.points.length >= 2) {
    // Find overlapping points (months where both years have data, up to current month)
    const currentPoints = currentYearData.points.filter(p => p.monthIndex <= currentMonth);
    const prevPoints = prevYearData.points.filter(p => p.monthIndex <= currentMonth);

    if (currentPoints.length >= 2 && prevPoints.length >= 2) {
      // Create the filled area path that follows both curves
      // We need to segment by crossover points to color green/red correctly
      shadedAreas = createShadedAreaBetweenCurves(currentPoints, prevPoints);
    }
  }

  // Calculate YTD comparison with previous year
  const currentYearLatestMonth = currentMonth;
  const currentYearLatestBalance = currentYearBalances[currentYearLatestMonth];

  let yoyDifference = null;
  let yoyPercent = null;
  let isAheadOfLastYear = null;
  let prevYearSameMonthBalance = null;

  if (prevYearData && prevYearData.balances[currentYearLatestMonth] !== null && currentYearLatestBalance !== null) {
    prevYearSameMonthBalance = prevYearData.balances[currentYearLatestMonth];
    yoyDifference = currentYearLatestBalance - prevYearSameMonthBalance;
    yoyPercent = prevYearSameMonthBalance !== 0
      ? ((yoyDifference / Math.abs(prevYearSameMonthBalance)) * 100).toFixed(1)
      : 0;
    isAheadOfLastYear = yoyDifference >= 0;
  }

  // Build header with YoY comparison
  const yoySign = yoyDifference !== null && yoyDifference >= 0 ? '+' : '';
  const yoyClass = yoyDifference !== null ? (isAheadOfLastYear ? 'trend-positive' : 'trend-negative') : '';
  const yoyText = yoyDifference !== null && prevYearData
    ? `${yoySign}${formatCurrency(yoyDifference)} (${yoySign}${yoyPercent}%) vs ${prevYearData.year}`
    : '';

  // Render all year lines (oldest first so current year is on top)
  const yearLines = yearData.slice().reverse().map((yd, idx) => {
    const isCurrentYear = idx === yearData.length - 1;
    const strokeWidth = isCurrentYear ? 3 : 2;
    const opacity = isCurrentYear ? 1 : 0.6 - (idx * 0.1);
    return yd.path ? `
      <path d="${yd.path}" fill="none" stroke="${yd.color}" stroke-width="${strokeWidth}"
            stroke-linecap="round" stroke-linejoin="round" opacity="${Math.max(opacity, 0.3)}"/>
    ` : '';
  }).join('');

  // Build legend entries for all years
  const legendEntries = yearData.slice(0, 4).map(yd => {
    const latestBalance = yd.balances.reduce((last, b, i) => b !== null && i <= currentMonth ? b : last, null);
    return `
      <span class="trend-stat">
        <span class="legend-color-inline" style="background-color: ${yd.color}"></span>
        ${yd.year}: ${latestBalance !== null ? formatCurrency(latestBalance) : 'N/A'}
      </span>
    `;
  }).join('');

  trendContainer.innerHTML = `
    <div class="card-header card-header--with-select">
      <div class="card-header__left">
        <h3 class="card-title">Year-over-Year Balance</h3>
        ${yoyText ? `<div class="trend-change ${yoyClass}">${yoyText}</div>` : ''}
      </div>
      ${renderAccountSelector()}
    </div>
    <div class="balance-trend-chart balance-trend-chart--compact">
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" class="trend-svg">
        <!-- Y-axis grid lines -->
        ${yAxisElements.map(el => `
          <line x1="${padding.left}" y1="${el.y}" x2="${svgWidth - padding.right}" y2="${el.y}"
                stroke="var(--border-color, #e5e5e5)" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>
        `).join('')}

        <!-- Y-axis labels -->
        ${yAxisElements.map(el => `
          <text x="${padding.left - 10}" y="${el.y + 4}"
                text-anchor="end" font-size="12" fill="var(--text-secondary)">${el.label}</text>
        `).join('')}

        <!-- X-axis labels (all 12 months) -->
        ${monthLabels.map(ml => `
          <text x="${ml.x}" y="${svgHeight - 8}"
                text-anchor="middle" font-size="11" fill="var(--text-secondary)">${ml.label}</text>
        `).join('')}

        <!-- Shaded difference areas (green/red) -->
        ${shadedAreas}

        <!-- Year lines (oldest first, current year on top) -->
        ${yearLines}
      </svg>
    </div>
    <div class="balance-trend-footer balance-trend-footer--with-legend">
      ${legendEntries}
      ${yoyDifference !== null ? `
        <span class="trend-stat ${yoyClass}">
          Diff: ${yoySign}${formatCurrency(Math.abs(yoyDifference))}
        </span>
      ` : ''}
    </div>
  `;

  // Attach event listener for account selector
  attachChartSelectorListener();
}

/**
 * Calculate nice Y-axis scale values
 * @param {number} min - Minimum data value
 * @param {number} max - Maximum data value
 * @returns {{minBal: number, maxBal: number, yAxisLabels: number[]}}
 */
function calculateYAxisScale(min, max) {
  const range = max - min;

  // Calculate step size for ~5 grid lines
  const rawStep = range / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalizedStep = rawStep / magnitude;

  let step;
  if (normalizedStep <= 1) step = magnitude;
  else if (normalizedStep <= 2) step = 2 * magnitude;
  else if (normalizedStep <= 5) step = 5 * magnitude;
  else step = 10 * magnitude;

  // Round min down and max up to step boundaries
  const minBal = Math.floor(min / step) * step;
  const maxBal = Math.ceil(max / step) * step;

  // Generate label values
  const yAxisLabels = [];
  for (let val = minBal; val <= maxBal; val += step) {
    yAxisLabels.push(val);
  }

  return { minBal, maxBal, yAxisLabels };
}

/**
 * Format currency in compact form for axis labels
 * @param {number} value - Currency value
 * @returns {string} Formatted string like "£5K" or "£-2K"
 */
function formatCompactCurrency(value) {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1000) {
    return `${sign}£${(absValue / 1000).toFixed(absValue % 1000 === 0 ? 0 : 1)}K`;
  }
  return `${sign}£${absValue.toFixed(0)}`;
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

/**
 * Create shaded area segments between two curved lines (current vs previous year)
 * Each segment between consecutive months forms a closed shape following both curves
 * @param {Array} currentPoints - Points for current year line
 * @param {Array} prevPoints - Points for previous year line
 * @returns {string} SVG path elements for shaded areas
 */
function createShadedAreaBetweenCurves(currentPoints, prevPoints) {
  if (currentPoints.length < 2 || prevPoints.length < 2) return '';

  // Align points by monthIndex - only use months where both have data
  const alignedMonths = [];
  const currByMonth = new Map(currentPoints.map(p => [p.monthIndex, p]));
  const prevByMonth = new Map(prevPoints.map(p => [p.monthIndex, p]));

  for (let m = 0; m < 12; m++) {
    if (currByMonth.has(m) && prevByMonth.has(m)) {
      alignedMonths.push({
        monthIndex: m,
        curr: currByMonth.get(m),
        prev: prevByMonth.get(m)
      });
    }
  }

  if (alignedMonths.length < 2) return '';

  let paths = '';

  // Create a segment for each pair of consecutive months
  for (let i = 0; i < alignedMonths.length - 1; i++) {
    const m1 = alignedMonths[i];
    const m2 = alignedMonths[i + 1];

    // Get bezier control points for this segment (using Catmull-Rom)
    const tension = 0.3;

    // For current year curve segment
    const c0 = i > 0 ? alignedMonths[i - 1].curr : m1.curr;
    const c1 = m1.curr;
    const c2 = m2.curr;
    const c3 = i + 2 < alignedMonths.length ? alignedMonths[i + 2].curr : m2.curr;

    const ccp1x = c1.x + (c2.x - c0.x) * tension;
    const ccp1y = c1.y + (c2.y - c0.y) * tension;
    const ccp2x = c2.x - (c3.x - c1.x) * tension;
    const ccp2y = c2.y - (c3.y - c1.y) * tension;

    // For previous year curve segment
    const p0 = i > 0 ? alignedMonths[i - 1].prev : m1.prev;
    const p1 = m1.prev;
    const p2 = m2.prev;
    const p3 = i + 2 < alignedMonths.length ? alignedMonths[i + 2].prev : m2.prev;

    const pcp1x = p1.x + (p2.x - p0.x) * tension;
    const pcp1y = p1.y + (p2.y - p0.y) * tension;
    const pcp2x = p2.x - (p3.x - p1.x) * tension;
    const pcp2y = p2.y - (p3.y - p1.y) * tension;

    // Determine color based on midpoint comparison (average of segment)
    const avgCurrY = (c1.y + c2.y) / 2;
    const avgPrevY = (p1.y + p2.y) / 2;
    const isCurrentAbove = avgCurrY <= avgPrevY; // Lower Y = higher value in SVG
    const fillColor = isCurrentAbove ? 'var(--green)' : 'var(--red)';

    // Build closed path:
    // 1. Start at curr point 1
    // 2. Bezier curve to curr point 2
    // 3. Line to prev point 2
    // 4. Reverse bezier curve to prev point 1
    // 5. Close back to start
    const segmentPath = `
      M ${c1.x} ${c1.y}
      C ${ccp1x} ${ccp1y}, ${ccp2x} ${ccp2y}, ${c2.x} ${c2.y}
      L ${p2.x} ${p2.y}
      C ${pcp2x} ${pcp2y}, ${pcp1x} ${pcp1y}, ${p1.x} ${p1.y}
      Z
    `;

    paths += `<path d="${segmentPath}" fill="${fillColor}" opacity="0.2" stroke="none"/>`;
  }

  return paths;
}

/**
 * Sample daily data to monthly points for cleaner chart
 * @param {Array} data - Daily balance data
 * @returns {Array} Monthly sampled data
 */
function sampleMonthlyData(data) {
  if (!data || data.length === 0) return [];

  // Group by month and take the last balance of each month
  const monthlyMap = new Map();

  data.forEach(d => {
    const monthKey = d.date.substring(0, 7); // YYYY-MM
    monthlyMap.set(monthKey, d);
  });

  // Convert to array and sort
  const monthly = Array.from(monthlyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date));

  return monthly;
}

/**
 * Render enhanced account cards grid with sparklines
 * @param {Array} accounts - List of accounts with sparkline data
 */
function renderAccounts(accounts) {
  const accountsContainer = container.querySelector('#accounts-container');

  if (!accounts || accounts.length === 0) {
    accountsContainer.innerHTML = `
      <div class="empty-state">
        <p>Add your bank accounts to see balances at a glance</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  accounts.forEach(account => {
    const card = document.createElement('div');
    // Normalize legacy 'debit' to 'current' for CSS class
    const typeClass = account.account_type === 'debit' ? 'current' : account.account_type;
    card.className = `account-card account-card--${typeClass}`;
    card.dataset.accountId = account.id;

    const balanceClass = account.current_balance >= 0 ? 'amount-positive' : 'amount-negative';
    // Map account types to display names
    const typeDisplayMap = {
      'current': 'Current',
      'savings': 'Savings',
      'credit': 'Credit',
      'debit': 'Current'  // Legacy mapping
    };
    const accountType = typeDisplayMap[account.account_type] || account.account_type;

    // Format month-to-date income/expenses
    const incomeClass = account.month_income > 0 ? 'mtd-positive' : '';
    const expenseClass = account.month_expenses > 0 ? 'mtd-negative' : '';

    // Generate sparkline SVG
    const sparklineSvg = generateSparkline(account.sparkline);

    card.innerHTML = `
      <div class="account-card__accent"></div>
      <div class="account-card__content">
        <div class="account-card__header">
          <span class="account-card__name">${escapeHtml(account.account_name)}</span>
          <span class="account-card__type-badge account-card__type-badge--${typeClass}">
            ${accountType}
          </span>
        </div>
        <div class="account-card__balance ${balanceClass}">
          ${formatCurrency(account.current_balance)}
        </div>
        <div class="account-card__mtd">
          <span class="mtd-item ${incomeClass}">
            <span class="mtd-label">In:</span>
            <span class="mtd-value">+${formatCurrency(account.month_income)}</span>
          </span>
          <span class="mtd-item ${expenseClass}">
            <span class="mtd-label">Out:</span>
            <span class="mtd-value">-${formatCurrency(account.month_expenses)}</span>
          </span>
        </div>
        <div class="account-card__sparkline">
          ${sparklineSvg}
        </div>
      </div>
    `;

    fragment.appendChild(card);
  });

  accountsContainer.innerHTML = '';
  accountsContainer.appendChild(fragment);
}

/**
 * Generate SVG sparkline from balance data
 * @param {Array} data - Array of {date, balance} objects
 * @returns {string} SVG element as string
 */
function generateSparkline(data) {
  if (!data || data.length === 0) {
    return '<div class="sparkline-empty">No data</div>';
  }

  const width = 120;
  const height = 32;
  const padding = 2;

  const balances = data.map(d => d.balance);
  const minBal = Math.min(...balances);
  const maxBal = Math.max(...balances);
  const range = maxBal - minBal || 1; // Avoid division by zero

  // Calculate points
  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * (width - 2 * padding);
    const y = height - padding - ((d.balance - minBal) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  // Determine color based on trend (first vs last balance)
  const firstBalance = balances[0];
  const lastBalance = balances[balances.length - 1];
  const trendColor = lastBalance >= firstBalance ? 'var(--green)' : 'var(--red)';

  // Create filled area path
  const areaPath = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * (width - 2 * padding);
    const y = height - padding - ((d.balance - minBal) / range) * (height - 2 * padding);
    return i === 0 ? `M ${x},${height - padding} L ${x},${y}` : `L ${x},${y}`;
  }).join(' ') + ` L ${width - padding},${height - padding} Z`;

  return `
    <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkline-gradient-${data[0]?.balance || 0}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${trendColor};stop-opacity:0.3"/>
          <stop offset="100%" style="stop-color:${trendColor};stop-opacity:0.05"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#sparkline-gradient-${data[0]?.balance || 0})" />
      <polyline
        points="${points}"
        fill="none"
        stroke="${trendColor}"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="${width - padding}" cy="${height - padding - ((lastBalance - minBal) / range) * (height - 2 * padding)}" r="3" fill="${trendColor}" />
    </svg>
  `;
}

/**
 * Render recent transactions list with account names
 * @param {Array} transactions - List of transactions
 */
function renderTransactions(transactions) {
  const transactionsContainer = container.querySelector('#transactions-container');

  transactionsContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Recent Transactions</h3>
      <a href="#/transactions" class="view-all-link">View All</a>
    </div>
  `;

  if (!transactions || transactions.length === 0) {
    transactionsContainer.innerHTML += `
      <div class="empty-state">
        <p>No recent transactions</p>
      </div>
    `;
    return;
  }

  const listElement = document.createElement('div');
  listElement.className = 'transactions-list';
  listElement.id = 'transactions-list';

  const fragment = document.createDocumentFragment();

  transactions.forEach(txn => {
    const row = document.createElement('div');
    row.className = 'transaction-row';
    row.dataset.transactionId = txn.id;
    row.dataset.accountId = txn.account_id;

    // Determine amount and class
    const amount = txn.credit_amount > 0 ? txn.credit_amount : -txn.debit_amount;
    const amountClass = txn.credit_amount > 0 ? 'amount-positive' : 'amount-negative';
    const amountPrefix = txn.credit_amount > 0 ? '+' : '';

    row.innerHTML = `
      <div class="transaction-row__date">
        ${formatRelativeDate(txn.transaction_date)}
      </div>
      <div class="transaction-row__main">
        <div class="transaction-row__description">
          ${escapeHtml(txn.description || txn.original_description)}
        </div>
        <div class="transaction-row__account">
          ${escapeHtml(txn.account_name)}
        </div>
      </div>
      <div class="transaction-row__amount ${amountClass}">
        ${amountPrefix}${formatCurrency(Math.abs(amount))}
      </div>
    `;

    fragment.appendChild(row);
  });

  listElement.appendChild(fragment);
  transactionsContainer.appendChild(listElement);
}

/**
 * Render category breakdown (top 5 by spending)
 * @param {Array} categories - List of categories with totals
 */
function renderCategories(categories) {
  const categoriesContainer = container.querySelector('#categories-container');

  categoriesContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Top Spending Categories</h3>
    </div>
  `;

  if (!categories || categories.length === 0) {
    categoriesContainer.innerHTML += `
      <div class="empty-state">
        <p>No category data available</p>
      </div>
    `;
    return;
  }

  // Filter expense categories and sort by total spent (descending)
  const expenseCategories = categories
    .filter(cat => cat.type === 'expense' && cat.total_amount > 0)
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 5);

  if (expenseCategories.length === 0) {
    categoriesContainer.innerHTML += `
      <div class="empty-state">
        <p>Your spending breakdown will appear here once you add transactions</p>
      </div>
    `;
    return;
  }

  const listElement = document.createElement('div');
  listElement.className = 'categories-list';

  const fragment = document.createDocumentFragment();
  const maxAmount = expenseCategories[0].total_amount;

  expenseCategories.forEach(category => {
    const row = document.createElement('div');
    row.className = 'category-row';

    const percentage = maxAmount > 0 ? (category.total_amount / maxAmount) * 100 : 0;

    row.innerHTML = `
      <div class="category-row__info">
        <span class="category-row__indicator" style="background-color: ${category.colour || '#636366'}"></span>
        <span class="category-row__name">${escapeHtml(category.name)}</span>
      </div>
      <div class="category-row__bar-container">
        <div class="category-row__bar" style="width: ${percentage}%; background-color: ${category.colour || '#636366'}"></div>
      </div>
      <div class="category-row__amount">
        ${formatCurrency(category.total_amount)}
      </div>
    `;

    fragment.appendChild(row);
  });

  listElement.appendChild(fragment);
  categoriesContainer.appendChild(listElement);
}

/**
 * Attach event listeners using delegation
 */
function attachEventListeners() {
  // Account card click - navigate to transactions filtered by account
  const accountsContainer = container.querySelector('#accounts-container');
  if (accountsContainer) {
    const accountClickHandler = (e) => {
      const card = e.target.closest('.account-card');
      if (card) {
        const accountId = card.dataset.accountId;
        router.go(`/transactions?account_id=${accountId}`);
      }
    };
    accountsContainer.addEventListener('click', accountClickHandler);
    onCleanup(() => accountsContainer.removeEventListener('click', accountClickHandler));
  }

  // Transaction row click - navigate to transactions page for that account
  const transactionsList = container.querySelector('#transactions-list');
  if (transactionsList) {
    const transactionClickHandler = (e) => {
      const row = e.target.closest('.transaction-row');
      if (row) {
        const accountId = row.dataset.accountId;
        router.go(`/transactions?account_id=${accountId}`);
      }
    };
    transactionsList.addEventListener('click', transactionClickHandler);
    onCleanup(() => transactionsList.removeEventListener('click', transactionClickHandler));
  }
}

/**
 * Render anomaly alerts section
 * @param {Array} anomalies - List of undismissed anomalies
 */
function renderAnomalies(anomalies) {
  const anomaliesContainer = container.querySelector('#anomalies-container');

  if (!anomalies || anomalies.length === 0) {
    anomaliesContainer.classList.add('hidden');
    return;
  }

  anomaliesContainer.classList.remove('hidden');

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high': return '🚨';
      case 'medium': return '⚠️';
      case 'low': return 'ℹ️';
      default: return '⚠️';
    }
  };

  const getAnomalyTypeLabel = (type) => {
    switch (type) {
      case 'unusual_amount': return 'Unusual Amount';
      case 'duplicate': return 'Possible Duplicate';
      case 'unusual_merchant': return 'Unusual Merchant';
      case 'unusual_time': return 'Unusual Timing';
      case 'large_transaction': return 'Large Transaction';
      default: return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  anomaliesContainer.innerHTML = `
    <div class="card-header anomalies-header">
      <div class="anomalies-title-group">
        <span class="anomalies-icon">🔔</span>
        <h3 class="card-title">Alerts</h3>
        <span class="anomalies-count">${anomalies.length}</span>
      </div>
      <a href="#/analytics" class="view-all-link">View All</a>
    </div>
    <div class="anomalies-list">
      ${anomalies.map(anomaly => `
        <div class="anomaly-item anomaly-item--${anomaly.severity}" data-id="${anomaly.id}">
          <div class="anomaly-item__icon">${getSeverityIcon(anomaly.severity)}</div>
          <div class="anomaly-item__content">
            <div class="anomaly-item__type">${getAnomalyTypeLabel(anomaly.anomaly_type)}</div>
            <div class="anomaly-item__description">${escapeHtml(anomaly.description)}</div>
            ${anomaly.transaction_date ? `
              <div class="anomaly-item__date">${formatRelativeDate(anomaly.transaction_date)}</div>
            ` : ''}
          </div>
          <button type="button" class="anomaly-dismiss-btn" data-id="${anomaly.id}" title="Dismiss">×</button>
        </div>
      `).join('')}
    </div>
  `;

  // Attach dismiss handlers
  const dismissBtns = anomaliesContainer.querySelectorAll('.anomaly-dismiss-btn');
  dismissBtns.forEach(btn => {
    const dismissHandler = async (e) => {
      e.stopPropagation();
      const anomalyId = btn.dataset.id;
      try {
        await api.put(`/analytics/anomalies/${anomalyId}/dismiss`);
        const item = btn.closest('.anomaly-item');
        item.remove();
        // Check if any anomalies left
        const remainingItems = anomaliesContainer.querySelectorAll('.anomaly-item');
        if (remainingItems.length === 0) {
          anomaliesContainer.classList.add('hidden');
        } else {
          // Update count
          const countEl = anomaliesContainer.querySelector('.anomalies-count');
          if (countEl) {
            countEl.textContent = remainingItems.length;
          }
        }
      } catch (err) {
        console.error('Failed to dismiss anomaly:', err);
      }
    };
    btn.addEventListener('click', dismissHandler);
    onCleanup(() => btn.removeEventListener('click', dismissHandler));
  });
}

/**
 * Show global error state
 * @param {string} message - Error message
 */
function showGlobalError(message) {
  container.innerHTML = `
    <div class="page overview-page">
      <div class="error-state">
        <h1>Error</h1>
        <p>${escapeHtml(message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    </div>
  `;
}
