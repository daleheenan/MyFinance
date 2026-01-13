/**
 * Income Analysis Page
 * View income trends, sources, and analytics
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';

// Private state
let container = null;
let cleanupFunctions = [];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

export async function mount(el, params) {
  container = el;
  cleanupFunctions = [];
  loadStyles();
  render();
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
  const styleId = 'income-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/income/income.css';
    document.head.appendChild(link);
  }
}

function render() {
  container.innerHTML = `
    <div class="page income-page">
      <header class="page-header">
        <div class="page-header__content">
          <h1>Income Analysis</h1>
          <p class="page-header__subtitle">Track and understand your income sources</p>
        </div>
      </header>

      <section id="summary-container" class="income-summary">
        <div class="loading">
          <div class="spinner"></div>
        </div>
      </section>

      <section class="income-grid">
        <div id="trend-container" class="income-card card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading trend...</p>
          </div>
        </div>
        <div id="sources-container" class="income-card card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading sources...</p>
          </div>
        </div>
      </section>

      <section class="income-details">
        <div id="recurring-container" class="recurring-card card">
          <div class="loading">
            <div class="spinner"></div>
          </div>
        </div>
        <div id="comparison-container" class="comparison-card card">
          <div class="loading">
            <div class="spinner"></div>
          </div>
        </div>
      </section>
    </div>
  `;
}

async function loadData() {
  try {
    const [summary, trend, sources, recurring, comparison] = await Promise.all([
      api.get('/income/summary').catch(() => ({})),
      api.get('/income/trend?months=12').catch(() => ({ data: [] })),
      api.get('/income/sources?months=6').catch(() => ({ data: [] })),
      api.get('/income/recurring').catch(() => ({ data: [] })),
      api.get('/income/vs-expenses?months=6').catch(() => ({ data: [] }))
    ]);

    renderSummary(summary.data || summary);
    renderTrend(trend.data || trend);
    renderSources(sources.data || sources);
    renderRecurring(recurring.data || recurring);
    renderComparison(comparison.data || comparison);
  } catch (err) {
    console.error('Failed to load income data:', err);
  }
}

function renderSummary(summary) {
  const el = document.getElementById('summary-container');
  if (!el || !summary) return;

  const trendIcon = summary.trend === 'up' ? '&uarr;' : summary.trend === 'down' ? '&darr;' : '&rarr;';
  const trendColor = summary.trend === 'up' ? 'green' : summary.trend === 'down' ? 'red' : 'yellow';

  el.innerHTML = `
    <div class="summary-cards">
      <div class="summary-card summary-card--primary">
        <span class="summary-card__label">This Month</span>
        <span class="summary-card__value">${formatCurrency(summary.thisMonth?.total || 0)}</span>
        <span class="summary-card__detail">${summary.thisMonth?.count || 0} transactions</span>
      </div>
      <div class="summary-card">
        <span class="summary-card__label">Last Month</span>
        <span class="summary-card__value">${formatCurrency(summary.lastMonth?.total || 0)}</span>
      </div>
      <div class="summary-card">
        <span class="summary-card__label">6-Month Average</span>
        <span class="summary-card__value">${formatCurrency(summary.average || 0)}</span>
      </div>
      <div class="summary-card">
        <span class="summary-card__label">vs Last Month</span>
        <span class="summary-card__value summary-card__value--${trendColor}">
          <span class="trend-icon">${trendIcon}</span>
          ${Math.abs(summary.change || 0)}%
        </span>
      </div>
    </div>
  `;
}

function renderTrend(trend) {
  const el = document.getElementById('trend-container');
  if (!el) return;

  if (!trend || trend.length === 0) {
    el.innerHTML = `
      <h3>Income Trend</h3>
      <div class="empty-state empty-state--compact">
        <p>Not enough data for trend analysis</p>
      </div>
    `;
    return;
  }

  const maxValue = Math.max(...trend.map(t => t.total));
  const chartHeight = 200;

  el.innerHTML = `
    <h3>Income Trend (12 Months)</h3>
    <div class="trend-chart">
      <div class="chart-bars">
        ${trend.map((t, i) => {
          const height = maxValue > 0 ? (t.total / maxValue) * chartHeight : 0;
          const monthLabel = MONTH_NAMES[parseInt(t.month.split('-')[1], 10) - 1];
          return `
            <div class="chart-bar-group">
              <div class="chart-bar" style="height: ${height}px" title="${monthLabel}: ${formatCurrency(t.total)}">
                ${height > 40 ? `<span class="chart-bar__value">${formatCurrency(t.total, true)}</span>` : ''}
              </div>
              <span class="chart-label">${monthLabel}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderSources(sources) {
  const el = document.getElementById('sources-container');
  if (!el) return;

  if (!sources || sources.length === 0) {
    el.innerHTML = `
      <h3>Income Sources</h3>
      <div class="empty-state empty-state--compact">
        <p>No income sources found</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <h3>Income Sources (6 Months)</h3>
    <div class="sources-list">
      ${sources.slice(0, 8).map(s => `
        <div class="source-item">
          <div class="source-item__color" style="background: ${s.colour || '#888'}"></div>
          <div class="source-item__details">
            <span class="source-item__name">${escapeHtml(s.source)}</span>
            <span class="source-item__count">${s.transaction_count} transactions</span>
          </div>
          <div class="source-item__amounts">
            <span class="source-item__total">${formatCurrency(s.total)}</span>
            <span class="source-item__percent">${Math.round(s.percentage)}%</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecurring(recurring) {
  const el = document.getElementById('recurring-container');
  if (!el) return;

  if (!recurring || recurring.length === 0) {
    el.innerHTML = `
      <h3>Recurring Income</h3>
      <div class="empty-state empty-state--compact">
        <p>No regular income patterns detected</p>
      </div>
    `;
    return;
  }

  const totalMonthly = recurring.reduce((sum, r) => sum + (r.monthlyAmount || 0), 0);

  el.innerHTML = `
    <div class="recurring-header">
      <h3>Recurring Income</h3>
      <span class="recurring-total">${formatCurrency(totalMonthly)}/month</span>
    </div>
    <div class="recurring-list">
      ${recurring.slice(0, 6).map(r => `
        <div class="recurring-item">
          <div class="recurring-item__details">
            <span class="recurring-item__name">${escapeHtml(r.description || r.merchant_name || 'Unknown')}</span>
            ${r.category_name ? `<span class="recurring-item__category" style="color: ${r.colour || '#888'}">${escapeHtml(r.category_name)}</span>` : ''}
          </div>
          <div class="recurring-item__amounts">
            <span class="recurring-item__amount">${formatCurrency(r.avg_amount || 0)}</span>
            ${r.frequency ? `<span class="recurring-item__frequency">${r.frequency}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderComparison(comparison) {
  const el = document.getElementById('comparison-container');
  if (!el) return;

  if (!comparison || comparison.length === 0) {
    el.innerHTML = `
      <h3>Income vs Expenses</h3>
      <div class="empty-state empty-state--compact">
        <p>Not enough data for comparison</p>
      </div>
    `;
    return;
  }

  const avgSavingsRate = comparison.reduce((sum, c) => sum + c.savingsRate, 0) / comparison.length;

  el.innerHTML = `
    <h3>Income vs Expenses (6 Months)</h3>
    <div class="comparison-summary">
      <span class="comparison-avg">Average Savings Rate: <strong class="${avgSavingsRate >= 0 ? 'positive' : 'negative'}">${Math.round(avgSavingsRate)}%</strong></span>
    </div>
    <div class="comparison-list">
      ${comparison.map(c => {
        const monthLabel = MONTH_NAMES[parseInt(c.month.split('-')[1], 10) - 1];
        const rateColor = c.savingsRate > 10 ? 'green' : c.savingsRate > 0 ? 'yellow' : 'red';
        return `
          <div class="comparison-row">
            <span class="comparison-row__month">${monthLabel}</span>
            <div class="comparison-row__bar">
              <div class="comparison-bar comparison-bar--income" style="width: ${c.income > c.expenses ? 100 : (c.income / c.expenses) * 100}%">
                <span class="comparison-bar__label">In: ${formatCurrency(c.income, true)}</span>
              </div>
              <div class="comparison-bar comparison-bar--expenses" style="width: ${c.expenses > c.income ? 100 : (c.expenses / c.income) * 100}%">
                <span class="comparison-bar__label">Out: ${formatCurrency(c.expenses, true)}</span>
              </div>
            </div>
            <span class="comparison-row__net ${c.net >= 0 ? 'positive' : 'negative'}">
              ${c.net >= 0 ? '+' : ''}${formatCurrency(c.net, true)}
            </span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
