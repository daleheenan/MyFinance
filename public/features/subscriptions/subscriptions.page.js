/**
 * Subscriptions Page Module
 * Manage recurring subscriptions with cost tracking and upcoming charges
 */

import { api } from '../../core/api.js';
import { formatCurrency, formatDate, escapeHtml } from '../../core/utils.js';

// Private state
let container = null;
let cleanupFunctions = [];

// Page data
let subscriptions = [];
let categories = [];
let summary = null;
let upcoming = [];
let detected = [];
let detectedIncome = [];

// Current view
let currentView = 'expense'; // 'expense' or 'income'

// Modal state
let editingSubscription = null;

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
  subscriptions = [];
  categories = [];
  summary = null;
  upcoming = [];
  detected = [];
  detectedIncome = [];
  currentView = 'expense';
  editingSubscription = null;

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

  subscriptions = [];
  categories = [];
  summary = null;
  upcoming = [];
  detected = [];
  detectedIncome = [];
  currentView = 'expense';
  editingSubscription = null;
}

/**
 * Load page-specific CSS
 */
function loadStyles() {
  const styleId = 'subscriptions-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/subscriptions/subscriptions.css';
    document.head.appendChild(link);
  }
}

/**
 * Render the page structure
 */
function render() {
  container.innerHTML = `
    <div class="page subscriptions-page">
      <!-- View Tabs -->
      <div class="view-tabs" id="view-tabs">
        <button type="button" class="view-tab active" data-view="expense">
          <span class="view-tab__icon">💸</span>
          <span class="view-tab__label">Expenses</span>
        </button>
        <button type="button" class="view-tab" data-view="income">
          <span class="view-tab__icon">💰</span>
          <span class="view-tab__label">Income</span>
        </button>
      </div>

      <!-- Summary Cards -->
      <div class="summary-grid" id="summary-container">
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading summary...</p>
        </div>
      </div>

      <!-- Upcoming Section -->
      <div class="card upcoming-card">
        <div class="card-header">
          <h3 class="card-title" id="upcoming-title">Upcoming Charges (30 days)</h3>
        </div>
        <div id="upcoming-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading upcoming...</p>
          </div>
        </div>
      </div>

      <!-- Active Items List -->
      <div class="card subscriptions-list-card">
        <div class="card-header">
          <h3 class="card-title" id="list-title">Active Subscriptions</h3>
          <button type="button" class="btn btn-primary btn-sm" id="add-subscription-btn">
            Add Subscription
          </button>
        </div>
        <div id="subscriptions-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading subscriptions...</p>
          </div>
        </div>
      </div>

      <!-- Detected Section -->
      <div class="card detected-card" id="detected-section">
        <div class="card-header">
          <h3 class="card-title" id="detected-title">Detected Subscriptions</h3>
          <span class="text-secondary" id="detected-subtitle">Patterns found in your transactions</span>
        </div>
        <div id="detected-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Scanning transactions...</p>
          </div>
        </div>
      </div>

      <!-- Subscription Modal -->
      <div id="subscription-modal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="modal-title">Add Subscription</h2>
            <button type="button" class="modal-close" id="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <form id="subscription-form">
              <div class="form-group">
                <label for="sub-name" class="form-label">Name</label>
                <input type="text" id="sub-name" class="form-input"
                       placeholder="e.g., Netflix, Spotify" required>
              </div>
              <div class="form-group">
                <label for="sub-pattern" class="form-label">Transaction Pattern</label>
                <input type="text" id="sub-pattern" class="form-input"
                       placeholder="e.g., NETFLIX, SPOTIFY" required>
                <span class="form-hint">Text to match in transaction descriptions</span>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="sub-amount" class="form-label">Amount</label>
                  <input type="number" id="sub-amount" class="form-input"
                         step="0.01" min="0" placeholder="0.00">
                </div>
                <div class="form-group">
                  <label for="sub-frequency" class="form-label">Frequency</label>
                  <select id="sub-frequency" class="form-select">
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="sub-billing-day" class="form-label">Billing Day</label>
                  <input type="number" id="sub-billing-day" class="form-input"
                         min="1" max="31" placeholder="1-31">
                </div>
                <div class="form-group">
                  <label for="sub-category" class="form-label">Category</label>
                  <select id="sub-category" class="form-select">
                    <option value="">Select category...</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="sub-next-date" class="form-label">Next Expected Date</label>
                <input type="date" id="sub-next-date" class="form-input">
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="modal-save">Save Subscription</button>
          </div>
        </div>
      </div>

      <!-- Delete Confirm Modal -->
      <div id="delete-modal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h2>Cancel Subscription</h2>
            <button type="button" class="modal-close" id="delete-modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to cancel this subscription?</p>
            <p id="delete-sub-info" class="text-secondary"></p>
            <p class="text-hint">The subscription will be marked as inactive and can be reactivated later.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="delete-cancel-btn">Keep</button>
            <button type="button" class="btn btn-danger" id="delete-confirm-btn">Cancel Subscription</button>
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
  // View tabs
  const viewTabs = container.querySelector('#view-tabs');
  const tabHandler = (e) => {
    const tab = e.target.closest('.view-tab');
    if (tab) {
      const newView = tab.dataset.view;
      if (newView !== currentView) {
        currentView = newView;
        updateViewTabs();
        updateViewLabels();
        renderSummary();
        renderUpcoming();
        renderSubscriptions();
        renderDetected();
      }
    }
  };
  viewTabs.addEventListener('click', tabHandler);
  onCleanup(() => viewTabs.removeEventListener('click', tabHandler));

  // Add subscription button
  const addBtn = container.querySelector('#add-subscription-btn');
  const addHandler = () => openModal(null);
  addBtn.addEventListener('click', addHandler);
  onCleanup(() => addBtn.removeEventListener('click', addHandler));

  // Subscriptions container event delegation
  const subsContainer = container.querySelector('#subscriptions-container');
  const subsClickHandler = (e) => handleSubscriptionsClick(e);
  subsContainer.addEventListener('click', subsClickHandler);
  onCleanup(() => subsContainer.removeEventListener('click', subsClickHandler));

  // Detected container event delegation
  const detectedContainer = container.querySelector('#detected-container');
  const detectedHandler = (e) => handleDetectedClick(e);
  detectedContainer.addEventListener('click', detectedHandler);
  onCleanup(() => detectedContainer.removeEventListener('click', detectedHandler));

  // Modal events
  setupModalEvents();
  setupDeleteModalEvents();
}

/**
 * Update view tab active state
 */
function updateViewTabs() {
  container.querySelectorAll('.view-tab').forEach(tab => {
    if (tab.dataset.view === currentView) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}

/**
 * Update labels based on current view
 */
function updateViewLabels() {
  const isIncome = currentView === 'income';

  const upcomingTitle = container.querySelector('#upcoming-title');
  const listTitle = container.querySelector('#list-title');
  const detectedTitle = container.querySelector('#detected-title');
  const detectedSubtitle = container.querySelector('#detected-subtitle');
  const addBtn = container.querySelector('#add-subscription-btn');

  if (upcomingTitle) {
    upcomingTitle.textContent = isIncome ? 'Upcoming Income (30 days)' : 'Upcoming Charges (30 days)';
  }
  if (listTitle) {
    listTitle.textContent = isIncome ? 'Active Income Sources' : 'Active Subscriptions';
  }
  if (detectedTitle) {
    detectedTitle.textContent = isIncome ? 'Detected Income' : 'Detected Subscriptions';
  }
  if (detectedSubtitle) {
    detectedSubtitle.textContent = isIncome ? 'Recurring income patterns found in your transactions' : 'Patterns found in your transactions';
  }
  if (addBtn) {
    addBtn.textContent = isIncome ? 'Add Income Source' : 'Add Subscription';
  }
}

/**
 * Load all page data
 */
async function loadData() {
  try {
    const [subsData, categoriesData, summaryData, upcomingData, detectedExpenseData, detectedIncomeData] = await Promise.all([
      api.get('/subscriptions'),
      api.get('/categories'),
      api.get('/subscriptions/summary'),
      api.get('/subscriptions/upcoming?days=30'),
      api.get('/subscriptions/detect?type=expense'),
      api.get('/subscriptions/detect?type=income')
    ]);

    subscriptions = subsData;
    categories = categoriesData;
    summary = summaryData;
    upcoming = upcomingData;
    detected = detectedExpenseData;
    detectedIncome = detectedIncomeData;

    renderSummary();
    renderUpcoming();
    renderSubscriptions();
    renderDetected();
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
  }
}

/**
 * Render the summary cards
 */
function renderSummary() {
  const summaryContainer = container.querySelector('#summary-container');

  if (!summary) {
    summaryContainer.innerHTML = `
      <div class="empty-state">
        <p>No subscription data available</p>
      </div>
    `;
    return;
  }

  const isIncome = currentView === 'income';
  const data = isIncome ? summary.income : summary.expenses;

  if (!data) {
    // Fallback for older API responses without breakdown
    summaryContainer.innerHTML = `
      <div class="summary-card summary-card--primary">
        <div class="summary-card__icon">${isIncome ? '💰' : '🔄'}</div>
        <div class="summary-card__content">
          <span class="summary-card__label">${isIncome ? 'Monthly Income' : 'Monthly Cost'}</span>
          <span class="summary-card__value">${formatCurrency(summary.monthly_total || 0)}</span>
        </div>
      </div>
    `;
    return;
  }

  summaryContainer.innerHTML = `
    <div class="summary-card summary-card--primary">
      <div class="summary-card__icon">${isIncome ? '💰' : '🔄'}</div>
      <div class="summary-card__content">
        <span class="summary-card__label">${isIncome ? 'Monthly Income' : 'Monthly Cost'}</span>
        <span class="summary-card__value">${formatCurrency(data.monthly || 0)}</span>
      </div>
    </div>
    <div class="summary-card summary-card--secondary">
      <div class="summary-card__icon">📅</div>
      <div class="summary-card__content">
        <span class="summary-card__label">${isIncome ? 'Yearly Income' : 'Yearly Cost'}</span>
        <span class="summary-card__value">${formatCurrency(data.yearly || 0)}</span>
      </div>
    </div>
    <div class="summary-card summary-card--tertiary">
      <div class="summary-card__icon">📊</div>
      <div class="summary-card__content">
        <span class="summary-card__label">${isIncome ? 'Income Sources' : 'Active Subscriptions'}</span>
        <span class="summary-card__value">${data.count || 0}</span>
      </div>
    </div>
    <div class="summary-card summary-card--quaternary">
      <div class="summary-card__icon">⏰</div>
      <div class="summary-card__content">
        <span class="summary-card__label">${isIncome ? 'Expected This Week' : 'Due This Week'}</span>
        <span class="summary-card__value">${formatCurrency(data.upcoming_7_days || 0)}</span>
      </div>
    </div>
    ${!isIncome && summary.net ? `
    <div class="summary-card summary-card--net ${summary.net.monthly >= 0 ? 'summary-card--positive' : 'summary-card--negative'}">
      <div class="summary-card__icon">${summary.net.monthly >= 0 ? '📈' : '📉'}</div>
      <div class="summary-card__content">
        <span class="summary-card__label">Net Monthly (Income - Expenses)</span>
        <span class="summary-card__value">${formatCurrency(summary.net.monthly || 0)}</span>
      </div>
    </div>
    ` : ''}
  `;
}

/**
 * Render upcoming charges
 */
function renderUpcoming() {
  const upcomingContainer = container.querySelector('#upcoming-container');
  const isIncome = currentView === 'income';

  // Filter by current type
  const filteredUpcoming = (upcoming || []).filter(item =>
    isIncome ? item.type === 'income' : item.type !== 'income'
  );

  if (filteredUpcoming.length === 0) {
    upcomingContainer.innerHTML = `
      <div class="empty-state">
        <p>No upcoming ${isIncome ? 'income' : 'charges'} in the next 30 days</p>
      </div>
    `;
    return;
  }

  upcomingContainer.innerHTML = `
    <div class="upcoming-list">
      ${filteredUpcoming.map(item => `
        <div class="upcoming-item">
          <div class="upcoming-item__info">
            <span class="upcoming-item__name">${escapeHtml(item.display_name)}</span>
            <span class="upcoming-item__date">${formatDate(item.next_expected_date)}</span>
          </div>
          <span class="upcoming-item__amount ${isIncome ? 'text-green' : ''}">${isIncome ? '+' : ''}${formatCurrency(item.expected_amount || 0)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render the subscriptions list
 */
function renderSubscriptions() {
  const subsContainer = container.querySelector('#subscriptions-container');
  const isIncome = currentView === 'income';

  // Filter by current type
  const filteredSubs = subscriptions.filter(sub =>
    isIncome ? sub.type === 'income' : sub.type !== 'income'
  );

  if (filteredSubs.length === 0) {
    subsContainer.innerHTML = `
      <div class="empty-state">
        <p>No ${isIncome ? 'recurring income' : 'subscriptions'} yet</p>
        <p class="text-secondary">Add your first ${isIncome ? 'income source' : 'subscription'} or check detected patterns below</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  const list = document.createElement('div');
  list.className = 'subscriptions-list';

  filteredSubs.forEach(sub => {
    const item = document.createElement('div');
    item.className = 'subscription-item';
    item.dataset.id = sub.id;

    const frequencyLabel = getFrequencyLabel(sub.frequency);
    const categoryName = sub.category_name || 'Uncategorized';
    const categoryColour = sub.category_colour || '#8e8e93';

    item.innerHTML = `
      <div class="subscription-item__main">
        <div class="subscription-item__info">
          <span class="subscription-item__name">${escapeHtml(sub.display_name)}</span>
          <div class="subscription-item__meta">
            <span class="category-badge" style="background-color: ${categoryColour}20; color: ${categoryColour}">
              ${escapeHtml(categoryName)}
            </span>
            <span class="subscription-item__frequency">${frequencyLabel}</span>
          </div>
        </div>
        <div class="subscription-item__amount">
          <span class="amount-value">${formatCurrency(sub.expected_amount || 0)}</span>
          <span class="amount-period">/ ${sub.frequency || 'month'}</span>
        </div>
      </div>
      <div class="subscription-item__details">
        <div class="detail-item">
          <span class="detail-label">Next charge</span>
          <span class="detail-value">${sub.next_expected_date ? formatDate(sub.next_expected_date) : 'Not set'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Last charged</span>
          <span class="detail-value">${sub.last_charged_date ? formatDate(sub.last_charged_date) : 'Never'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Pattern</span>
          <span class="detail-value detail-value--pattern">${escapeHtml(sub.merchant_pattern)}</span>
        </div>
      </div>
      <div class="subscription-item__actions">
        <button type="button" class="btn btn-icon btn-ghost edit-btn" data-id="${sub.id}" title="Edit">
          <span class="icon-edit"></span>
        </button>
        <button type="button" class="btn btn-icon btn-ghost delete-btn" data-id="${sub.id}" title="Cancel">
          <span class="icon-delete"></span>
        </button>
      </div>
    `;

    list.appendChild(item);
  });

  fragment.appendChild(list);
  subsContainer.innerHTML = '';
  subsContainer.appendChild(fragment);
}

/**
 * Check if a detected pattern matches an existing subscription
 * @param {string} pattern - The detected pattern to check
 * @param {string} type - The type to check against ('expense' or 'income')
 * @returns {boolean} True if already added
 */
function isPatternAlreadyAdded(pattern, type = 'expense') {
  if (!pattern || !subscriptions || subscriptions.length === 0) return false;

  const normalizedPattern = pattern.toLowerCase().trim();

  return subscriptions.some(sub => {
    // Only match against same type
    const subType = sub.type || 'expense';
    if (subType !== type) return false;

    if (!sub.merchant_pattern) return false;
    const subPattern = sub.merchant_pattern.toLowerCase().trim();
    // Check if patterns match (exact or contains)
    return subPattern === normalizedPattern ||
           subPattern.includes(normalizedPattern) ||
           normalizedPattern.includes(subPattern);
  });
}

/**
 * Render detected subscriptions
 */
function renderDetected() {
  const detectedContainer = container.querySelector('#detected-container');
  const detectedSection = container.querySelector('#detected-section');
  const isIncome = currentView === 'income';

  // Use the correct detected list based on view
  const detectedList = isIncome ? detectedIncome : detected;

  if (!detectedList || detectedList.length === 0) {
    detectedSection.classList.add('hidden');
    return;
  }

  detectedSection.classList.remove('hidden');

  detectedContainer.innerHTML = `
    <div class="detected-list">
      ${detectedList.map(item => {
        const alreadyAdded = isPatternAlreadyAdded(item.pattern, isIncome ? 'income' : 'expense');
        const displayName = item.source_name || item.merchant_name || item.pattern;
        return `
        <div class="detected-item${alreadyAdded ? ' detected-item--added' : ''}" data-pattern="${escapeHtml(item.pattern)}">
          <div class="detected-item__info">
            <span class="detected-item__name">${escapeHtml(displayName)}</span>
            <div class="detected-item__meta">
              <span class="detected-item__frequency">${getFrequencyLabel(item.frequency)}</span>
              <span class="detected-item__occurrences">${item.occurrence_count} ${isIncome ? 'payments' : 'charges'}</span>
            </div>
          </div>
          <div class="detected-item__amount ${isIncome ? 'text-green' : ''}">
            ${isIncome ? '+' : ''}${formatCurrency(item.typical_amount || 0)}
          </div>
          ${alreadyAdded ? `
            <span class="detected-item__added-badge">Added</span>
          ` : `
            <button type="button" class="btn btn-secondary btn-sm add-detected-btn"
                    data-pattern="${escapeHtml(item.pattern)}"
                    data-name="${escapeHtml(displayName)}"
                    data-amount="${item.typical_amount || 0}"
                    data-frequency="${item.frequency || 'monthly'}"
                    data-billing-day="${item.billing_day || ''}"
                    data-last-date="${item.last_date || ''}"
                    data-type="${isIncome ? 'income' : 'expense'}">
              Add
            </button>
          `}
        </div>
      `;}).join('')}
    </div>
  `;
}

/**
 * Get human-readable frequency label
 */
function getFrequencyLabel(frequency) {
  const labels = {
    weekly: 'Weekly',
    fortnightly: 'Fortnightly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly'
  };
  return labels[frequency] || 'Monthly';
}

/**
 * Handle clicks in subscriptions container
 */
function handleSubscriptionsClick(e) {
  const editBtn = e.target.closest('.edit-btn');
  if (editBtn) {
    const subId = parseInt(editBtn.dataset.id, 10);
    const sub = subscriptions.find(s => s.id === subId);
    if (sub) {
      openModal(sub);
    }
    return;
  }

  const deleteBtn = e.target.closest('.delete-btn');
  if (deleteBtn) {
    const subId = parseInt(deleteBtn.dataset.id, 10);
    const sub = subscriptions.find(s => s.id === subId);
    if (sub) {
      openDeleteModal(sub);
    }
    return;
  }
}

/**
 * Handle clicks in detected container
 */
function handleDetectedClick(e) {
  const addBtn = e.target.closest('.add-detected-btn');
  if (addBtn) {
    const frequency = addBtn.dataset.frequency || 'monthly';
    const billingDay = addBtn.dataset.billingDay ? parseInt(addBtn.dataset.billingDay, 10) : null;
    const lastDate = addBtn.dataset.lastDate || null;
    const type = addBtn.dataset.type || 'expense';

    // Calculate next expected date based on last date and frequency
    const nextExpectedDate = calculateNextExpectedDate(lastDate, frequency, billingDay);

    const data = {
      merchant_pattern: addBtn.dataset.pattern,
      display_name: addBtn.dataset.name,
      expected_amount: parseFloat(addBtn.dataset.amount) || 0,
      frequency: frequency,
      billing_day: billingDay,
      next_expected_date: nextExpectedDate,
      type: type
    };
    openModal(null, data);
  }
}

/**
 * Calculate the next expected date for a subscription
 * @param {string} lastDate - Last charge date (YYYY-MM-DD)
 * @param {string} frequency - Frequency: weekly, fortnightly, monthly, quarterly, yearly
 * @param {number} billingDay - Typical billing day of month (1-31)
 * @returns {string|null} Next expected date in YYYY-MM-DD format
 */
function calculateNextExpectedDate(lastDate, frequency, billingDay) {
  if (!lastDate) return null;

  const last = new Date(lastDate);
  if (isNaN(last.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let next = new Date(last);

  // Add the appropriate interval based on frequency
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'fortnightly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      // If billing day is known, use it
      if (billingDay) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(billingDay, maxDay));
      }
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      if (billingDay) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(billingDay, maxDay));
      }
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }

  // If the calculated date is in the past, keep adding intervals until it's in the future
  while (next < today) {
    switch (frequency) {
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'fortnightly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        if (billingDay) {
          const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          next.setDate(Math.min(billingDay, maxDay));
        }
        break;
      case 'quarterly':
        next.setMonth(next.getMonth() + 3);
        if (billingDay) {
          const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          next.setDate(Math.min(billingDay, maxDay));
        }
        break;
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        next.setMonth(next.getMonth() + 1);
    }
  }

  // Format as YYYY-MM-DD
  return next.toISOString().split('T')[0];
}

/**
 * Open the subscription modal for add/edit
 */
function openModal(subscription, prefillData = null) {
  editingSubscription = subscription;

  const modal = container.querySelector('#subscription-modal');
  const title = container.querySelector('#modal-title');
  const nameInput = container.querySelector('#sub-name');
  const patternInput = container.querySelector('#sub-pattern');
  const amountInput = container.querySelector('#sub-amount');
  const frequencySelect = container.querySelector('#sub-frequency');
  const billingDayInput = container.querySelector('#sub-billing-day');
  const categorySelect = container.querySelector('#sub-category');
  const nextDateInput = container.querySelector('#sub-next-date');

  // Determine the type for this modal
  const data = subscription || prefillData || {};
  const isIncome = data.type === 'income' || currentView === 'income';

  // Set title
  if (subscription) {
    title.textContent = isIncome ? 'Edit Income Source' : 'Edit Subscription';
  } else {
    title.textContent = isIncome ? 'Add Income Source' : 'Add Subscription';
  }

  // Populate category select based on type
  const relevantCategories = categories.filter(c => isIncome ? c.type === 'income' : c.type === 'expense');
  categorySelect.innerHTML = `
    <option value="">Select category...</option>
    ${relevantCategories.map(cat => `
      <option value="${cat.id}">${cat.icon || ''} ${escapeHtml(cat.name)}</option>
    `).join('')}
  `;

  // Store type in modal for save handler
  modal.dataset.type = isIncome ? 'income' : 'expense';

  // Update placeholder based on type
  nameInput.placeholder = isIncome ? 'e.g., Salary, Dividends' : 'e.g., Netflix, Spotify';
  patternInput.placeholder = isIncome ? 'e.g., SALARY, DIVIDEND' : 'e.g., NETFLIX, SPOTIFY';

  // Set values from subscription or prefill data
  nameInput.value = data.display_name || '';
  patternInput.value = data.merchant_pattern || '';
  amountInput.value = data.expected_amount || '';
  frequencySelect.value = data.frequency || 'monthly';
  billingDayInput.value = data.billing_day || '';
  categorySelect.value = data.category_id || '';

  if (data.next_expected_date) {
    nextDateInput.value = data.next_expected_date.split('T')[0];
  } else {
    nextDateInput.value = '';
  }

  modal.classList.remove('hidden');
  nameInput.focus();
}

/**
 * Setup modal events
 */
function setupModalEvents() {
  const modal = container.querySelector('#subscription-modal');
  const closeBtn = container.querySelector('#modal-close');
  const cancelBtn = container.querySelector('#modal-cancel');
  const saveBtn = container.querySelector('#modal-save');
  const backdrop = modal.querySelector('.modal-backdrop');

  const closeModal = () => {
    modal.classList.add('hidden');
    editingSubscription = null;
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  onCleanup(() => closeBtn.removeEventListener('click', closeModal));
  onCleanup(() => cancelBtn.removeEventListener('click', closeModal));
  onCleanup(() => backdrop.removeEventListener('click', closeModal));

  const saveHandler = async () => {
    const name = container.querySelector('#sub-name').value.trim();
    const pattern = container.querySelector('#sub-pattern').value.trim();
    const amount = container.querySelector('#sub-amount').value;
    const frequency = container.querySelector('#sub-frequency').value;
    const billingDay = container.querySelector('#sub-billing-day').value;
    const categoryId = container.querySelector('#sub-category').value;
    const nextDate = container.querySelector('#sub-next-date').value;
    const type = modal.dataset.type || 'expense';
    const isIncome = type === 'income';

    if (!name) {
      alert(`Please enter a ${isIncome ? 'name' : 'subscription name'}`);
      return;
    }
    if (!pattern) {
      alert('Please enter a transaction pattern');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const payload = {
        display_name: name,
        merchant_pattern: pattern,
        expected_amount: amount ? parseFloat(amount) : null,
        frequency: frequency,
        billing_day: billingDay ? parseInt(billingDay, 10) : null,
        category_id: categoryId ? parseInt(categoryId, 10) : null,
        next_expected_date: nextDate || null,
        type: type
      };

      if (editingSubscription) {
        await api.put(`/subscriptions/${editingSubscription.id}`, payload);
      } else {
        await api.post('/subscriptions', payload);
      }

      closeModal();
      await loadData();
    } catch (err) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  };

  saveBtn.addEventListener('click', saveHandler);
  onCleanup(() => saveBtn.removeEventListener('click', saveHandler));

  // Form submission
  const form = container.querySelector('#subscription-form');
  const formHandler = (e) => {
    e.preventDefault();
    saveHandler();
  };
  form.addEventListener('submit', formHandler);
  onCleanup(() => form.removeEventListener('submit', formHandler));
}

// Delete modal state
let deletingSubscription = null;

/**
 * Open delete confirmation modal
 */
function openDeleteModal(subscription) {
  deletingSubscription = subscription;

  const modal = container.querySelector('#delete-modal');
  const infoEl = container.querySelector('#delete-sub-info');

  infoEl.textContent = `${subscription.display_name} - ${formatCurrency(subscription.expected_amount || 0)}/${subscription.frequency || 'month'}`;
  modal.classList.remove('hidden');
}

/**
 * Setup delete modal events
 */
function setupDeleteModalEvents() {
  const modal = container.querySelector('#delete-modal');
  const closeBtn = container.querySelector('#delete-modal-close');
  const cancelBtn = container.querySelector('#delete-cancel-btn');
  const confirmBtn = container.querySelector('#delete-confirm-btn');
  const backdrop = modal.querySelector('.modal-backdrop');

  const closeModal = () => {
    modal.classList.add('hidden');
    deletingSubscription = null;
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  onCleanup(() => closeBtn.removeEventListener('click', closeModal));
  onCleanup(() => cancelBtn.removeEventListener('click', closeModal));
  onCleanup(() => backdrop.removeEventListener('click', closeModal));

  const confirmHandler = async () => {
    if (!deletingSubscription) return;

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Cancelling...';

    try {
      await api.delete(`/subscriptions/${deletingSubscription.id}`);
      closeModal();
      await loadData();
    } catch (err) {
      alert(`Failed to cancel subscription: ${err.message}`);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Cancel Subscription';
    }
  };

  confirmBtn.addEventListener('click', confirmHandler);
  onCleanup(() => confirmBtn.removeEventListener('click', confirmHandler));
}

/**
 * Show error message
 */
function showError(message) {
  const subsContainer = container.querySelector('#subscriptions-container');
  subsContainer.innerHTML = `
    <div class="error-state">
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn btn-secondary retry-btn">Retry</button>
    </div>
  `;

  const retryBtn = subsContainer.querySelector('.retry-btn');
  const retryHandler = () => loadData();
  retryBtn.addEventListener('click', retryHandler);
  onCleanup(() => retryBtn.removeEventListener('click', retryHandler));
}
