/**
 * Analytics Spend Page
 * Monthly expense breakdown by category
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';

let container = null;
let cleanupFunctions = [];
let monthsToShow = 3;

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
      <div class="page-header">
        <h1 class="page-title">Analytics</h1>
      </div>

      <!-- Sub-navigation with Date Range Filters -->
      <div class="analytics-nav-bar">
        <div class="analytics-sub-nav">
          <a href="#/analytics/summary" class="analytics-sub-nav-link">Summary</a>
          <a href="#/analytics/trends" class="analytics-sub-nav-link">Trends</a>
          <a href="#/analytics/spend" class="analytics-sub-nav-link active">Spending</a>
          <a href="#/analytics/merchants" class="analytics-sub-nav-link">Merchants</a>
        </div>
        <div class="analytics-date-filters">
          <div class="filter-buttons" id="months-selector">
            <button class="filter-btn active" data-months="3">3 Months</button>
            <button class="filter-btn" data-months="6">6 Months</button>
            <button class="filter-btn" data-months="12">12 Months</button>
          </div>
        </div>
      </div>

      <section class="spend-summary-section">
        <div id="spend-summary" class="spend-summary">
          <div class="loading"><div class="spinner"></div><p>Loading...</p></div>
        </div>
      </section>

      <section class="category-averages-section">
        <div id="category-averages" class="card category-averages-card">
          <div class="loading"><div class="spinner"></div><p>Loading category breakdown...</p></div>
        </div>
      </section>

      <section class="monthly-breakdown-section">
        <div id="monthly-breakdown" class="card monthly-breakdown-card">
          <div class="loading"><div class="spinner"></div><p>Loading monthly data...</p></div>
        </div>
      </section>
    </div>
  `;
}

function attachEventListeners() {
  const monthsSelector = container.querySelector('#months-selector');
  if (monthsSelector) {
    const monthsHandler = (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      const months = parseInt(btn.dataset.months);
      if (months === monthsToShow) return;
      monthsSelector.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      monthsToShow = months;
      loadData();
    };
    monthsSelector.addEventListener('click', monthsHandler);
    onCleanup(() => monthsSelector.removeEventListener('click', monthsHandler));
  }
}

async function loadData() {
  try {
    const data = await api.get(`/analytics/monthly-breakdown?months=${monthsToShow}`);
    renderSpendSummary(data);
    renderCategoryAverages(data);
    renderMonthlyBreakdown(data);
  } catch (err) {
    container.querySelector('#spend-summary').innerHTML = `<div class="error-state"><p>Failed to load data</p></div>`;
    container.querySelector('#category-averages').innerHTML = `<div class="error-state"><p>Failed to load data</p></div>`;
    container.querySelector('#monthly-breakdown').innerHTML = `<div class="error-state"><p>Failed to load data</p></div>`;
  }
}

function renderSpendSummary(data) {
  const summaryContainer = container.querySelector('#spend-summary');
  const { avg_monthly_expenses, avg_monthly_income, period, months_analyzed } = data;

  summaryContainer.innerHTML = `
    <div class="spend-summary-card card">
      <div class="spend-summary-stat">
        <span class="spend-summary-label">Avg Monthly Expenses</span>
        <span class="spend-summary-value amount-negative">${formatCurrency(avg_monthly_expenses)}</span>
      </div>
    </div>
    <div class="spend-summary-card card">
      <div class="spend-summary-stat">
        <span class="spend-summary-label">Avg Monthly Income</span>
        <span class="spend-summary-value amount-positive">${formatCurrency(avg_monthly_income)}</span>
      </div>
    </div>
    <div class="spend-summary-card card">
      <div class="spend-summary-stat">
        <span class="spend-summary-label">Avg Monthly Net</span>
        <span class="spend-summary-value ${avg_monthly_income - avg_monthly_expenses >= 0 ? 'amount-positive' : 'amount-negative'}">${formatCurrency(avg_monthly_income - avg_monthly_expenses)}</span>
      </div>
    </div>
    <div class="spend-summary-card card">
      <div class="spend-summary-stat">
        <span class="spend-summary-label">Period</span>
        <span class="spend-summary-value">${period.start} to ${period.end}</span>
      </div>
    </div>
  `;
}

function renderCategoryAverages(data) {
  const catContainer = container.querySelector('#category-averages');
  const { category_averages, avg_monthly_expenses } = data;

  catContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Average Monthly by Category</h3>
      <span class="card-subtitle">Based on ${data.months_analyzed} months of data</span>
    </div>
  `;

  if (!category_averages || category_averages.length === 0) {
    catContainer.innerHTML += `<div class="empty-state"><p>No expense data found</p></div>`;
    return;
  }

  const listEl = document.createElement('div');
  listEl.className = 'category-averages-list';

  category_averages.forEach(cat => {
    const percentage = avg_monthly_expenses > 0 ? (cat.avg_monthly / avg_monthly_expenses) * 100 : 0;
    const itemEl = document.createElement('div');
    itemEl.className = 'category-avg-item';
    itemEl.innerHTML = `
      <div class="category-avg-header">
        <span class="category-avg-color" style="background-color: ${cat.colour}"></span>
        <span class="category-avg-name">${escapeHtml(cat.category_name)}</span>
        <span class="category-avg-amount">${formatCurrency(cat.avg_monthly)}/mo</span>
      </div>
      <div class="category-avg-bar-container">
        <div class="category-avg-bar" style="width: ${percentage}%; background-color: ${cat.colour}"></div>
      </div>
      <div class="category-avg-details">
        <span class="category-avg-percent">${percentage.toFixed(1)}%</span>
        <span class="category-avg-total">Total: ${formatCurrency(cat.total)} (${cat.transaction_count} txns)</span>
      </div>
    `;
    listEl.appendChild(itemEl);
  });

  catContainer.appendChild(listEl);
}

function renderMonthlyBreakdown(data) {
  const breakdownContainer = container.querySelector('#monthly-breakdown');
  const { monthly_breakdown } = data;

  breakdownContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Month-by-Month Breakdown</h3>
    </div>
  `;

  if (!monthly_breakdown || monthly_breakdown.length === 0) {
    breakdownContainer.innerHTML += `<div class="empty-state"><p>No data available</p></div>`;
    return;
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const accordionEl = document.createElement('div');
  accordionEl.className = 'monthly-accordion';

  monthly_breakdown.forEach((month, idx) => {
    const [year, monthNum] = month.month.split('-');
    const monthName = monthNames[parseInt(monthNum) - 1] + ' ' + year;
    const isExpanded = idx === 0;

    const monthEl = document.createElement('div');
    monthEl.className = 'month-accordion-item';
    monthEl.innerHTML = `
      <div class="month-accordion-header ${isExpanded ? 'expanded' : ''}">
        <span class="month-accordion-title">${monthName}</span>
        <div class="month-accordion-summary">
          <span class="amount-negative">${formatCurrency(month.total_expenses)}</span>
          <span class="month-accordion-arrow">${isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>
      <div class="month-accordion-content ${isExpanded ? 'expanded' : ''}">
        ${renderMonthCategories(month.category_breakdown, month.total_expenses)}
      </div>
    `;

    const header = monthEl.querySelector('.month-accordion-header');
    header.addEventListener('click', () => {
      const content = monthEl.querySelector('.month-accordion-content');
      const arrow = monthEl.querySelector('.month-accordion-arrow');
      const isOpen = content.classList.contains('expanded');
      content.classList.toggle('expanded');
      header.classList.toggle('expanded');
      arrow.textContent = isOpen ? '▶' : '▼';
    });

    accordionEl.appendChild(monthEl);
  });

  breakdownContainer.appendChild(accordionEl);
}

function renderMonthCategories(categories, totalExpenses) {
  if (!categories || categories.length === 0) {
    return '<div class="empty-state"><p>No expenses this month</p></div>';
  }

  let html = '<div class="month-categories">';
  categories.forEach(cat => {
    const percentage = totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0;
    html += `
      <div class="month-category-item">
        <span class="month-category-color" style="background-color: ${cat.colour}"></span>
        <span class="month-category-name">${escapeHtml(cat.category_name)}</span>
        <span class="month-category-amount">${formatCurrency(cat.total)}</span>
        <span class="month-category-percent">(${percentage.toFixed(1)}%)</span>
      </div>
    `;
  });
  html += '</div>';
  return html;
}
