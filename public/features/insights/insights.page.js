/**
 * Insights Page - Financial Health Dashboard
 * Displays health score, spending comparisons, trend alerts, and subscription summary
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';

// Private state
let container = null;
let cleanupFunctions = [];

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
  const styleId = 'insights-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/insights/insights.css';
    document.head.appendChild(link);
  }
}

function render() {
  container.innerHTML = `
    <div class="page insights-page">
      <!-- Health Score Card -->
      <section class="insights-section">
        <div class="insights-hero">
          <div id="health-score-container" class="health-score-card card">
            <div class="loading">
              <div class="spinner"></div>
              <p>Calculating your financial health...</p>
            </div>
          </div>
          <div id="safe-to-spend-container" class="safe-to-spend-card card">
            <div class="loading">
              <div class="spinner"></div>
              <p>Loading...</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Insights Grid -->
      <section class="insights-grid">
        <div id="spending-comparison-container" class="insights-card card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Analyzing spending...</p>
          </div>
        </div>
        <div id="trend-alerts-container" class="insights-card card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Checking trends...</p>
          </div>
        </div>
      </section>

      <!-- Subscriptions Section -->
      <section class="subscriptions-section">
        <div id="subscriptions-container" class="subscriptions-card card">
          <div class="loading">
            <div class="spinner"></div>
            <p>Analyzing subscriptions...</p>
          </div>
        </div>
      </section>
    </div>
  `;
}

async function loadData() {
  try {
    const [healthScore, safeToSpend, comparisons, alerts, subscriptions] = await Promise.all([
      api.get('/insights/health-score').catch(err => ({ error: err.message })),
      api.get('/insights/safe-to-spend').catch(err => ({ error: err.message })),
      api.get('/insights/spending-comparison').catch(err => ({ error: err.message })),
      api.get('/insights/trend-alerts').catch(err => ({ error: err.message })),
      api.get('/insights/subscriptions').catch(err => ({ error: err.message }))
    ]);

    renderHealthScore(healthScore.data || healthScore);
    renderSafeToSpend(safeToSpend.data || safeToSpend);
    renderSpendingComparisons(comparisons.data || comparisons);
    renderTrendAlerts(alerts.data || alerts);
    renderSubscriptions(subscriptions.data || subscriptions);
  } catch (err) {
    console.error('Failed to load insights:', err);
  }
}

function renderHealthScore(data) {
  const el = document.getElementById('health-score-container');
  if (!el) return;

  if (data.error) {
    el.innerHTML = `<div class="error-state"><p>Unable to calculate health score</p></div>`;
    return;
  }

  const scoreColor = data.color || 'teal';
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (data.score / 100) * circumference;

  el.innerHTML = `
    <div class="health-score">
      <div class="health-score__gauge">
        <svg viewBox="0 0 100 100" class="health-score__svg">
          <circle cx="50" cy="50" r="45" class="health-score__bg" />
          <circle cx="50" cy="50" r="45" class="health-score__progress health-score__progress--${scoreColor}"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}"
            transform="rotate(-90 50 50)" />
        </svg>
        <div class="health-score__value">
          <span class="health-score__number">${data.score}</span>
          <span class="health-score__grade">${data.grade}</span>
        </div>
      </div>
      <div class="health-score__details">
        <h2 class="health-score__title">Financial Health</h2>
        <p class="health-score__status health-score__status--${scoreColor}">${data.status}</p>
        <div class="health-score__breakdown">
          ${renderBreakdownItem('Budget', data.breakdown.budget)}
          ${renderBreakdownItem('Savings', data.breakdown.savings)}
          ${renderBreakdownItem('Stability', data.breakdown.stability)}
          ${renderBreakdownItem('Trend', data.breakdown.trend)}
          ${renderBreakdownItem('Bills', data.breakdown.bills)}
        </div>
        ${data.tips && data.tips.length > 0 ? `
          <div class="health-score__tips">
            ${data.tips.map(tip => `
              <div class="health-tip">
                <span class="health-tip__icon">${tip.icon}</span>
                <span class="health-tip__text">${escapeHtml(tip.text)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderBreakdownItem(label, item) {
  const percentage = Math.round((item.score / item.maxPoints) * 100);
  return `
    <div class="breakdown-item">
      <div class="breakdown-item__header">
        <span class="breakdown-item__label">${label}</span>
        <span class="breakdown-item__value">${item.score}/${item.maxPoints}</span>
      </div>
      <div class="breakdown-item__bar">
        <div class="breakdown-item__fill" style="width: ${percentage}%"></div>
      </div>
      <span class="breakdown-item__detail">${escapeHtml(item.label)}</span>
    </div>
  `;
}

function renderSafeToSpend(data) {
  const el = document.getElementById('safe-to-spend-container');
  if (!el) return;

  if (data.error) {
    el.innerHTML = `<div class="error-state"><p>Unable to calculate</p></div>`;
    return;
  }

  const color = data.color || 'teal';

  el.innerHTML = `
    <div class="safe-to-spend">
      <h3 class="safe-to-spend__title">Safe to Spend</h3>
      <div class="safe-to-spend__amount safe-to-spend__amount--${color}">
        ${formatCurrency(data.safeToSpend)}
      </div>
      <div class="safe-to-spend__daily">
        <span class="safe-to-spend__daily-amount">${formatCurrency(data.dailyAllowance)}</span>
        <span class="safe-to-spend__daily-label">/day for ${data.daysRemaining} days</span>
      </div>
      <p class="safe-to-spend__message">${escapeHtml(data.message)}</p>
      ${data.upcomingBills.count > 0 ? `
        <div class="safe-to-spend__bills">
          <span class="safe-to-spend__bills-label">Upcoming bills:</span>
          <span class="safe-to-spend__bills-amount">${formatCurrency(data.upcomingBills.total)}</span>
          <span class="safe-to-spend__bills-count">(${data.upcomingBills.count} bills)</span>
        </div>
      ` : ''}
    </div>
  `;
}

function renderSpendingComparisons(data) {
  const el = document.getElementById('spending-comparison-container');
  if (!el) return;

  if (data.error || !data.insights) {
    el.innerHTML = `
      <div class="insights-card__header">
        <h3>Spending Comparison</h3>
      </div>
      <div class="empty-state empty-state--compact">
        <p>Not enough data to compare</p>
      </div>
    `;
    return;
  }

  const totalSentiment = data.totals.sentiment;
  const totalIcon = totalSentiment === 'positive' ? '&darr;' : totalSentiment === 'negative' ? '&uarr;' : '&rarr;';
  const totalColor = totalSentiment === 'positive' ? 'green' : totalSentiment === 'negative' ? 'red' : 'yellow';

  el.innerHTML = `
    <div class="insights-card__header">
      <h3>Spending Comparison</h3>
      <span class="comparison-badge comparison-badge--${totalColor}">
        <span class="comparison-badge__icon">${totalIcon}</span>
        ${Math.abs(data.totals.change)}%
      </span>
    </div>
    <div class="comparison-total">
      <div class="comparison-total__amounts">
        <div class="comparison-total__current">
          <span class="comparison-total__label">This month</span>
          <span class="comparison-total__value">${formatCurrency(data.totals.current)}</span>
        </div>
        <div class="comparison-total__vs">vs</div>
        <div class="comparison-total__previous">
          <span class="comparison-total__label">Last month</span>
          <span class="comparison-total__value">${formatCurrency(data.totals.previous)}</span>
        </div>
      </div>
    </div>
    ${data.insights.length > 0 ? `
      <div class="comparison-insights">
        ${data.insights.map(insight => {
          const icon = insight.sentiment === 'positive' ? '&darr;' : insight.sentiment === 'negative' ? '&uarr;' : '&rarr;';
          const color = insight.sentiment === 'positive' ? 'green' : insight.sentiment === 'negative' ? 'red' : 'yellow';
          return `
            <div class="comparison-insight">
              <span class="comparison-insight__category" style="color: ${insight.colour || '#888'}">${escapeHtml(insight.category)}</span>
              <span class="comparison-insight__change comparison-insight__change--${color}">
                <span class="comparison-insight__icon">${icon}</span>
                ${Math.abs(insight.change)}%
              </span>
              <span class="comparison-insight__amounts">
                ${formatCurrency(insight.currentAmount)} vs ${formatCurrency(insight.previousAmount)}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    ` : '<p class="no-changes">Spending is consistent with last month</p>'}
  `;
}

function renderTrendAlerts(data) {
  const el = document.getElementById('trend-alerts-container');
  if (!el) return;

  if (data.error || !Array.isArray(data) || data.length === 0) {
    el.innerHTML = `
      <div class="insights-card__header">
        <h3>Category Trends</h3>
      </div>
      <div class="empty-state empty-state--compact">
        <div class="empty-state__icon">&#10004;</div>
        <p>No significant trend changes</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="insights-card__header">
      <h3>Category Trends</h3>
      <span class="trend-count">${data.length} alerts</span>
    </div>
    <div class="trend-alerts">
      ${data.map(alert => {
        const icon = alert.type === 'positive' ? '&#9660;' : alert.type === 'warning' ? '&#9650;' : '&#8226;';
        return `
          <div class="trend-alert trend-alert--${alert.type}">
            <span class="trend-alert__icon">${icon}</span>
            <div class="trend-alert__content">
              <span class="trend-alert__category" style="color: ${alert.colour || '#888'}">${escapeHtml(alert.categoryName)}</span>
              <span class="trend-alert__message">${escapeHtml(alert.message)}</span>
            </div>
            <span class="trend-alert__change trend-alert__change--${alert.type}">
              ${alert.change >= 0 ? '+' : ''}${alert.change}%
            </span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSubscriptions(data) {
  const el = document.getElementById('subscriptions-container');
  if (!el) return;

  if (data.error) {
    el.innerHTML = `
      <div class="insights-card__header">
        <h3>Subscription Summary</h3>
      </div>
      <div class="error-state"><p>Unable to load subscriptions</p></div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="subscriptions-summary">
      <div class="subscriptions-header">
        <h3>Subscription Summary</h3>
        <a href="#/subscriptions" class="subscriptions-link">Manage &rarr;</a>
      </div>

      <div class="subscriptions-totals">
        <div class="subscriptions-total">
          <span class="subscriptions-total__label">Monthly</span>
          <span class="subscriptions-total__value">${formatCurrency(data.totals.monthly)}</span>
        </div>
        <div class="subscriptions-total">
          <span class="subscriptions-total__label">Yearly</span>
          <span class="subscriptions-total__value">${formatCurrency(data.totals.yearly)}</span>
        </div>
        <div class="subscriptions-total">
          <span class="subscriptions-total__label">% of Income</span>
          <span class="subscriptions-total__value">${data.totals.percentOfIncome}%</span>
        </div>
        <div class="subscriptions-total">
          <span class="subscriptions-total__label">Count</span>
          <span class="subscriptions-total__value">${data.totals.count}</span>
        </div>
      </div>

      ${data.insights && data.insights.length > 0 ? `
        <div class="subscriptions-insights">
          ${data.insights.map(insight => `
            <div class="subscription-insight subscription-insight--${insight.type}">
              <span class="subscription-insight__icon">${insight.icon}</span>
              <span class="subscription-insight__message">${escapeHtml(insight.message)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${data.byCategory && data.byCategory.length > 0 ? `
        <div class="subscriptions-by-category">
          <h4>By Category</h4>
          <div class="category-breakdown">
            ${data.byCategory.slice(0, 5).map(cat => `
              <div class="category-item">
                <span class="category-item__dot" style="background: ${cat.colour || '#888'}"></span>
                <span class="category-item__name">${escapeHtml(cat.name)}</span>
                <span class="category-item__count">${cat.count}</span>
                <span class="category-item__total">${formatCurrency(cat.total)}/mo</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${data.potentiallyUnused && data.potentiallyUnused.length > 0 ? `
        <div class="subscriptions-unused">
          <h4>Potentially Unused</h4>
          <p class="subscriptions-unused__hint">No charge in 45+ days</p>
          <div class="unused-list">
            ${data.potentiallyUnused.map(sub => `
              <div class="unused-item">
                <span class="unused-item__name">${escapeHtml(sub.name)}</span>
                <span class="unused-item__amount">${formatCurrency(sub.monthlyAmount)}/mo</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
