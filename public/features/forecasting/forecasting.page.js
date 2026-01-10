/**
 * Forecasting Page Module
 * Cash flow projections, scenarios, and seasonal patterns
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';

// Private state
let container = null;
let cleanupFunctions = [];

// Page data
let cashflow = null;
let averages = null;
let scenarios = null;
let seasonal = null;
let categories = [];

// Selected forecast period
let forecastMonths = 12;

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
  cashflow = null;
  averages = null;
  scenarios = null;
  seasonal = null;
  categories = [];
  forecastMonths = 12;

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

  cashflow = null;
  averages = null;
  scenarios = null;
  seasonal = null;
  categories = [];
}

/**
 * Load page-specific CSS
 */
function loadStyles() {
  const styleId = 'forecasting-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/forecasting/forecasting.css';
    document.head.appendChild(link);
  }
}

/**
 * Render the page structure
 */
function render() {
  container.innerHTML = `
    <div class="page forecasting-page">
      <header class="page-header">
        <div class="page-header__content">
          <h1>Cash Flow Forecast</h1>
          <p>Project your future financial position</p>
        </div>
        <div class="forecast-period-selector">
          <label>Forecast Period:</label>
          <select id="forecast-months" class="form-select">
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12" selected>12 months</option>
            <option value="24">24 months</option>
          </select>
        </div>
      </header>

      <!-- Monthly Averages Summary -->
      <div class="averages-grid" id="averages-container">
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading averages...</p>
        </div>
      </div>

      <!-- Scenarios Comparison -->
      <div class="card scenarios-card">
        <div class="card-header">
          <h3 class="card-title">Scenario Projections</h3>
          <span class="text-secondary">Based on your spending patterns</span>
        </div>
        <div id="scenarios-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Calculating scenarios...</p>
          </div>
        </div>
      </div>

      <!-- Cash Flow Chart -->
      <div class="card chart-card">
        <div class="card-header">
          <h3 class="card-title">Projected Cash Flow</h3>
        </div>
        <div class="chart-container" id="cashflow-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading forecast...</p>
          </div>
        </div>
      </div>

      <!-- Cash Flow Table -->
      <div class="card cashflow-table-card">
        <div class="card-header">
          <h3 class="card-title">Monthly Projections</h3>
        </div>
        <div id="cashflow-table-container">
          <div class="loading">
            <div class="spinner"></div>
          </div>
        </div>
      </div>

      <!-- Seasonal Patterns -->
      <div class="card seasonal-card">
        <div class="card-header">
          <h3 class="card-title">Seasonal Spending Patterns</h3>
          <select id="seasonal-category" class="form-select form-select--sm">
            <option value="">All Categories</option>
          </select>
        </div>
        <div id="seasonal-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Analyzing patterns...</p>
          </div>
        </div>
      </div>
    </div>
  `;

  attachEventListeners();
}

/**
 * Attach event listeners with cleanup
 */
function attachEventListeners() {
  // Forecast period selector
  const periodSelect = container.querySelector('#forecast-months');
  const periodHandler = async (e) => {
    forecastMonths = parseInt(e.target.value, 10);
    await loadForecastData();
  };
  periodSelect.addEventListener('change', periodHandler);
  onCleanup(() => periodSelect.removeEventListener('change', periodHandler));

  // Seasonal category selector
  const categorySelect = container.querySelector('#seasonal-category');
  const categoryHandler = async (e) => {
    await loadSeasonalData(e.target.value || null);
  };
  categorySelect.addEventListener('change', categoryHandler);
  onCleanup(() => categorySelect.removeEventListener('change', categoryHandler));
}

/**
 * Load all page data
 */
async function loadData() {
  try {
    const [averagesData, categoriesData] = await Promise.all([
      api.get('/forecasting/averages?months=6'),
      api.get('/categories')
    ]);

    averages = averagesData;
    categories = categoriesData;

    renderAverages();
    populateCategorySelect();

    // Load forecast data after averages
    await loadForecastData();
    await loadSeasonalData(null);
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
  }
}

/**
 * Load forecast-specific data
 */
async function loadForecastData() {
  try {
    // Show loading states
    const scenariosContainer = container.querySelector('#scenarios-container');
    const cashflowContainer = container.querySelector('#cashflow-container');
    const tableContainer = container.querySelector('#cashflow-table-container');

    scenariosContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    cashflowContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    tableContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    const [scenariosData, cashflowData] = await Promise.all([
      api.get(`/forecasting/scenarios?months=${forecastMonths}`),
      api.get(`/forecasting/cashflow?months=${forecastMonths}`)
    ]);

    scenarios = scenariosData;
    cashflow = cashflowData;

    renderScenarios();
    renderCashFlowChart();
    renderCashFlowTable();
  } catch (err) {
    const scenariosContainer = container.querySelector('#scenarios-container');
    scenariosContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load scenarios: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Load seasonal data
 */
async function loadSeasonalData(categoryId) {
  try {
    const seasonalContainer = container.querySelector('#seasonal-container');
    seasonalContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    const url = categoryId
      ? `/forecasting/seasonal?category_id=${categoryId}`
      : '/forecasting/seasonal';

    seasonal = await api.get(url);
    renderSeasonal();
  } catch (err) {
    const seasonalContainer = container.querySelector('#seasonal-container');
    seasonalContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load patterns: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Populate category select
 */
function populateCategorySelect() {
  const select = container.querySelector('#seasonal-category');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  select.innerHTML = `
    <option value="">All Categories</option>
    ${expenseCategories.map(cat => `
      <option value="${cat.id}">${cat.icon || ''} ${escapeHtml(cat.name)}</option>
    `).join('')}
  `;
}

/**
 * Render the monthly averages
 */
function renderAverages() {
  const container_el = container.querySelector('#averages-container');

  if (!averages) {
    container_el.innerHTML = '<div class="empty-state"><p>No data available</p></div>';
    return;
  }

  // Service returns snake_case: avg_income, avg_expenses, avg_net
  const avgIncome = averages.avg_income || 0;
  const avgExpenses = averages.avg_expenses || 0;
  const netFlow = averages.avg_net || (avgIncome - avgExpenses);
  const netFlowClass = netFlow >= 0 ? 'value--positive' : 'value--negative';
  const savingsRate = avgIncome > 0
    ? ((netFlow / avgIncome) * 100).toFixed(1)
    : 0;

  container_el.innerHTML = `
    <div class="average-card average-card--income">
      <div class="average-card__icon">📈</div>
      <div class="average-card__content">
        <span class="average-card__label">Avg Monthly Income</span>
        <span class="average-card__value value--positive">${formatCurrency(avgIncome)}</span>
      </div>
    </div>
    <div class="average-card average-card--expenses">
      <div class="average-card__icon">📉</div>
      <div class="average-card__content">
        <span class="average-card__label">Avg Monthly Expenses</span>
        <span class="average-card__value value--negative">${formatCurrency(avgExpenses)}</span>
      </div>
    </div>
    <div class="average-card average-card--net">
      <div class="average-card__icon">💰</div>
      <div class="average-card__content">
        <span class="average-card__label">Avg Net Cash Flow</span>
        <span class="average-card__value ${netFlowClass}">${formatCurrency(netFlow)}</span>
      </div>
    </div>
    <div class="average-card average-card--savings">
      <div class="average-card__icon">🎯</div>
      <div class="average-card__content">
        <span class="average-card__label">Savings Rate</span>
        <span class="average-card__value">${savingsRate}%</span>
      </div>
    </div>
  `;
}

/**
 * Render scenarios comparison
 */
function renderScenarios() {
  const scenariosContainer = container.querySelector('#scenarios-container');

  // Service returns { current_balance, subscriptions_only, optimistic, expected, conservative } directly
  if (!scenarios || !scenarios.optimistic) {
    scenariosContainer.innerHTML = '<div class="empty-state"><p>No scenarios available</p></div>';
    return;
  }

  const { current_balance, subscriptions_only, optimistic, expected, conservative, subscriptions } = scenarios;

  // Calculate total saved for each scenario (projected_balance_end - current_balance)
  const subscriptionsOnlySaved = (subscriptions_only?.projected_balance_end || 0) - (current_balance || 0);
  const optimisticSaved = (optimistic.projected_balance_end || 0) - (current_balance || 0);
  const expectedSaved = (expected.projected_balance_end || 0) - (current_balance || 0);
  const conservativeSaved = (conservative.projected_balance_end || 0) - (current_balance || 0);

  scenariosContainer.innerHTML = `
    <div class="scenarios-grid scenarios-grid--four">
      <div class="scenario-card scenario-card--subscriptions">
        <div class="scenario-header">
          <span class="scenario-icon">🔄</span>
          <span class="scenario-name">Subscriptions Only</span>
        </div>
        <div class="scenario-body">
          <div class="scenario-stat">
            <span class="scenario-label">Projected Balance</span>
            <span class="scenario-value ${(subscriptions_only?.projected_balance_end || 0) >= 0 ? 'value--positive' : 'value--negative'}">
              ${formatCurrency(subscriptions_only?.projected_balance_end || 0)}
            </span>
          </div>
          <div class="scenario-stat">
            <span class="scenario-label">Total Saved</span>
            <span class="scenario-value">${formatCurrency(subscriptionsOnlySaved)}</span>
          </div>
          <div class="scenario-stat scenario-stat--small">
            <span class="scenario-label">Monthly Net</span>
            <span class="scenario-value ${(subscriptions_only?.projected_net || 0) >= 0 ? 'value--positive' : 'value--negative'}">
              ${formatCurrency(subscriptions_only?.projected_net || 0)}
            </span>
          </div>
          <div class="scenario-assumption">
            Only recurring items (${subscriptions?.count || 0} tracked)
          </div>
        </div>
      </div>

      <div class="scenario-card scenario-card--optimistic">
        <div class="scenario-header">
          <span class="scenario-icon">🌟</span>
          <span class="scenario-name">Optimistic</span>
        </div>
        <div class="scenario-body">
          <div class="scenario-stat">
            <span class="scenario-label">Projected Balance</span>
            <span class="scenario-value value--positive">${formatCurrency(optimistic.projected_balance_end || 0)}</span>
          </div>
          <div class="scenario-stat">
            <span class="scenario-label">Total Saved</span>
            <span class="scenario-value">${formatCurrency(optimisticSaved)}</span>
          </div>
          <div class="scenario-assumption">
            Income +10%, Expenses -10%
          </div>
        </div>
      </div>

      <div class="scenario-card scenario-card--expected">
        <div class="scenario-header">
          <span class="scenario-icon">📊</span>
          <span class="scenario-name">Expected</span>
        </div>
        <div class="scenario-body">
          <div class="scenario-stat">
            <span class="scenario-label">Projected Balance</span>
            <span class="scenario-value ${(expected.projected_balance_end || 0) >= 0 ? 'value--positive' : 'value--negative'}">
              ${formatCurrency(expected.projected_balance_end || 0)}
            </span>
          </div>
          <div class="scenario-stat">
            <span class="scenario-label">Total Saved</span>
            <span class="scenario-value">${formatCurrency(expectedSaved)}</span>
          </div>
          <div class="scenario-assumption">
            Based on current averages
          </div>
        </div>
      </div>

      <div class="scenario-card scenario-card--conservative">
        <div class="scenario-header">
          <span class="scenario-icon">⚠️</span>
          <span class="scenario-name">Conservative</span>
        </div>
        <div class="scenario-body">
          <div class="scenario-stat">
            <span class="scenario-label">Projected Balance</span>
            <span class="scenario-value ${(conservative.projected_balance_end || 0) >= 0 ? 'value--positive' : 'value--negative'}">
              ${formatCurrency(conservative.projected_balance_end || 0)}
            </span>
          </div>
          <div class="scenario-stat">
            <span class="scenario-label">Total Saved</span>
            <span class="scenario-value">${formatCurrency(conservativeSaved)}</span>
          </div>
          <div class="scenario-assumption">
            Income -10%, Expenses +10%
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render cash flow chart
 */
function renderCashFlowChart() {
  const chartContainer = container.querySelector('#cashflow-container');

  if (!cashflow || !cashflow.projections || cashflow.projections.length === 0) {
    chartContainer.innerHTML = '<div class="empty-state"><p>No forecast data available</p></div>';
    return;
  }

  const data = cashflow.projections;

  // Chart dimensions
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate bounds
  const allBalances = data.map(d => d.projected_balance);
  const minBalance = Math.min(...allBalances, 0);
  const maxBalance = Math.max(...allBalances);
  const balanceRange = maxBalance - minBalance || 1;

  // Scale functions
  const xScale = (index) => padding.left + (index / (data.length - 1 || 1)) * chartWidth;
  const yScale = (value) => padding.top + chartHeight - ((value - minBalance) / balanceRange) * chartHeight;

  // Generate balance path
  const balancePath = data.map((d, i) => {
    const x = xScale(i);
    const y = yScale(d.projected_balance);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  // Generate area path
  const areaPath = balancePath +
    ` L ${xScale(data.length - 1)} ${yScale(0)}` +
    ` L ${xScale(0)} ${yScale(0)} Z`;

  // Y-axis labels
  const yLabels = [];
  const labelCount = 5;
  for (let i = 0; i <= labelCount; i++) {
    const value = minBalance + (balanceRange * i / labelCount);
    yLabels.push({ y: yScale(value), label: formatCurrency(value) });
  }

  // X-axis labels
  const xLabels = [];
  const interval = Math.ceil(data.length / 6);
  data.forEach((d, i) => {
    if (i === 0 || i === data.length - 1 || i % interval === 0) {
      xLabels.push({ x: xScale(i), label: formatShortDate(d.month) });
    }
  });

  chartContainer.innerHTML = `
    <svg class="forecast-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <!-- Grid -->
      <g class="chart-grid">
        ${yLabels.map(l => `
          <line x1="${padding.left}" y1="${l.y}" x2="${width - padding.right}" y2="${l.y}" />
        `).join('')}
      </g>

      <!-- Zero line -->
      ${minBalance < 0 ? `
        <line class="zero-line" x1="${padding.left}" y1="${yScale(0)}"
              x2="${width - padding.right}" y2="${yScale(0)}" />
      ` : ''}

      <!-- Area fill -->
      <path class="chart-area" d="${areaPath}" />

      <!-- Balance line -->
      <path class="chart-line chart-line--balance" d="${balancePath}" />

      <!-- Data points -->
      ${data.map((d, i) => `
        <circle class="chart-point" cx="${xScale(i)}" cy="${yScale(d.projected_balance)}" r="4" />
      `).join('')}

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
  `;
}

/**
 * Format date for short display
 */
function formatShortDate(monthStr) {
  const [year, month] = monthStr.split('-');
  const date = new Date(year, parseInt(month, 10) - 1);
  return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

/**
 * Render cash flow table
 */
function renderCashFlowTable() {
  const tableContainer = container.querySelector('#cashflow-table-container');

  if (!cashflow || !cashflow.projections || cashflow.projections.length === 0) {
    tableContainer.innerHTML = '<div class="empty-state"><p>No projection data</p></div>';
    return;
  }

  tableContainer.innerHTML = `
    <div class="cashflow-table-wrapper">
      <table class="cashflow-table">
        <thead>
          <tr>
            <th>Month</th>
            <th class="text-right">Income</th>
            <th class="text-right">Expenses</th>
            <th class="text-right">Net Flow</th>
            <th class="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${cashflow.projections.map(row => {
            const netFlow = (row.projected_income || 0) - (row.projected_expenses || 0);
            const netClass = netFlow >= 0 ? 'value--positive' : 'value--negative';
            const balanceClass = row.projected_balance >= 0 ? 'value--positive' : 'value--negative';

            return `
              <tr>
                <td>${formatMonthLabel(row.month)}</td>
                <td class="text-right value--positive">${formatCurrency(row.projected_income || 0)}</td>
                <td class="text-right value--negative">${formatCurrency(row.projected_expenses || 0)}</td>
                <td class="text-right ${netClass}">${formatCurrency(netFlow)}</td>
                <td class="text-right ${balanceClass}">${formatCurrency(row.projected_balance)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Format month label
 */
function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-');
  const date = new Date(year, parseInt(month, 10) - 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * Render seasonal patterns
 */
function renderSeasonal() {
  const seasonalContainer = container.querySelector('#seasonal-container');

  // Service returns object like { "01": 1000, "02": 1200, ... }
  // Transform to array of patterns for all 12 months
  if (!seasonal || typeof seasonal !== 'object' || Object.keys(seasonal).length === 0) {
    seasonalContainer.innerHTML = `
      <div class="empty-state">
        <p>Not enough data to detect seasonal patterns</p>
        <p class="text-secondary">More transaction history is needed</p>
      </div>
    `;
    return;
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Create patterns array for all 12 months
  const patterns = months.map((_, index) => {
    const monthKey = String(index + 1).padStart(2, '0');
    return {
      month: monthKey,
      average_spending: seasonal[monthKey] || 0
    };
  });

  const maxAmount = Math.max(...patterns.map(p => p.average_spending), 1);

  seasonalContainer.innerHTML = `
    <div class="seasonal-chart">
      ${patterns.map((pattern, index) => {
        const height = maxAmount > 0 ? (pattern.average_spending / maxAmount) * 100 : 0;
        const isHighest = pattern.average_spending === maxAmount && pattern.average_spending > 0;

        return `
          <div class="seasonal-bar-wrapper">
            <div class="seasonal-bar ${isHighest ? 'seasonal-bar--highest' : ''}"
                 style="height: ${Math.max(height, 4)}%"
                 title="${months[index]}: ${formatCurrency(pattern.average_spending)}">
              ${pattern.average_spending > 0 ? `<span class="seasonal-bar__value">${formatCurrency(pattern.average_spending)}</span>` : ''}
            </div>
            <span class="seasonal-bar__label">${months[index]}</span>
          </div>
        `;
      }).join('')}
    </div>
    <div class="seasonal-insight">
      <p>
        <strong>Highest spending:</strong> ${getHighestMonth(patterns, months)}
        <br>
        <strong>Lowest spending:</strong> ${getLowestMonth(patterns, months)}
      </p>
    </div>
  `;
}

/**
 * Get month with highest spending
 */
function getHighestMonth(patterns, months) {
  let maxIdx = 0;
  patterns.forEach((p, i) => {
    if (p.average_spending > patterns[maxIdx].average_spending) {
      maxIdx = i;
    }
  });
  return `${months[maxIdx]} (${formatCurrency(patterns[maxIdx].average_spending)} avg)`;
}

/**
 * Get month with lowest spending
 */
function getLowestMonth(patterns, months) {
  let minIdx = 0;
  patterns.forEach((p, i) => {
    if (p.average_spending < patterns[minIdx].average_spending) {
      minIdx = i;
    }
  });
  return `${months[minIdx]} (${formatCurrency(patterns[minIdx].average_spending)} avg)`;
}

/**
 * Show error message
 */
function showError(message) {
  const averagesContainer = container.querySelector('#averages-container');
  averagesContainer.innerHTML = `
    <div class="error-state">
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn btn-secondary retry-btn">Retry</button>
    </div>
  `;

  const retryBtn = averagesContainer.querySelector('.retry-btn');
  const retryHandler = () => loadData();
  retryBtn.addEventListener('click', retryHandler);
  onCleanup(() => retryBtn.removeEventListener('click', retryHandler));
}
