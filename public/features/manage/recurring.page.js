/**
 * Recurring Transactions Management Page
 * Manages detected recurring payments and subscriptions
 */

import { api } from '../../core/api.js';
import { escapeHtml, formatCurrency } from '../../core/utils.js';
import { createModal, showConfirmDialog } from '../../core/modal.js';
import { createManageBreadcrumb } from '../../core/breadcrumb.js';

let container = null;
let cleanupFunctions = [];
let categories = [];
let recurringPatterns = [];
let detectedPatterns = [];
let detectedBills = [];
let selectedBillIndexes = new Set();

function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

export function mount(el, params) {
  container = el;
  cleanupFunctions = [];

  render();
  attachEventListeners();
  loadAllData();
}

export function unmount() {
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];

  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(modal => modal.remove());

  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

function render() {
  container.innerHTML = `
    <div class="page manage-page">
      ${createManageBreadcrumb('/manage/recurring')}
      <header class="page-header">
        <div class="page-header__content">
          <h1 class="page-title">Recurring Transactions</h1>
          <p class="page-subtitle">Manage detected recurring payments and subscriptions</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn-secondary" id="detect-recurring-btn">Detect Patterns</button>
        </div>
      </header>

      <!-- Detected Bills Section (from transaction analysis) -->
      <section class="manage-section card" id="detected-bills-section" style="display: none;">
        <div class="manage-section-header">
          <div>
            <h2 class="manage-section-title">Detected Bills & Subscriptions</h2>
            <p class="manage-section-description">Recurring payments found in your transactions</p>
          </div>
          <div class="manage-section-actions" id="bulk-actions" style="display: none;">
            <span class="selected-count" id="selected-count">0 selected</span>
            <button class="btn btn-primary btn-sm" id="add-selected-btn">Add Selected</button>
            <button class="btn btn-secondary btn-sm" id="clear-selection-btn">Clear</button>
          </div>
        </div>
        <div id="detected-bills-list"></div>
      </section>

      <section class="manage-section card" id="recurring-section">
        <div class="manage-section-header">
          <div>
            <h2 class="manage-section-title">Confirmed Patterns</h2>
            <p class="manage-section-description">Recurring transactions you've confirmed</p>
          </div>
        </div>
        <div id="recurring-container" class="recurring-list">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading recurring patterns...</p>
          </div>
        </div>
      </section>

      <div id="detected-patterns-container" class="manage-section card detected-patterns-container" style="display: none;">
        <div class="manage-section-header">
          <div>
            <h2 class="manage-section-title">Detected Patterns</h2>
            <p class="manage-section-description">Review and confirm these detected recurring transactions</p>
          </div>
        </div>
        <div id="detected-patterns-list"></div>
      </div>
    </div>
  `;
}

function attachEventListeners() {
  const detectRecurringBtn = container.querySelector('#detect-recurring-btn');
  if (detectRecurringBtn) {
    const handler = () => runRecurringDetection();
    detectRecurringBtn.addEventListener('click', handler);
    onCleanup(() => detectRecurringBtn.removeEventListener('click', handler));
  }

  const managePage = container.querySelector('.manage-page');
  if (managePage) {
    const clickHandler = (e) => handleDelegatedClick(e);
    managePage.addEventListener('click', clickHandler);
    onCleanup(() => managePage.removeEventListener('click', clickHandler));

    // Handle checkbox changes for detected bills
    const changeHandler = (e) => {
      if (e.target.matches('.detected-bill-checkbox input[type="checkbox"]')) {
        const index = parseInt(e.target.dataset.index);
        toggleBillSelection(index);
      }
    };
    managePage.addEventListener('change', changeHandler);
    onCleanup(() => managePage.removeEventListener('change', changeHandler));
  }

  // Bulk action buttons
  const addSelectedBtn = container.querySelector('#add-selected-btn');
  if (addSelectedBtn) {
    const handler = () => addSelectedBills();
    addSelectedBtn.addEventListener('click', handler);
    onCleanup(() => addSelectedBtn.removeEventListener('click', handler));
  }

  const clearSelectionBtn = container.querySelector('#clear-selection-btn');
  if (clearSelectionBtn) {
    const handler = () => {
      selectedBillIndexes.clear();
      renderDetectedBills();
    };
    clearSelectionBtn.addEventListener('click', handler);
    onCleanup(() => clearSelectionBtn.removeEventListener('click', handler));
  }
}

function handleDelegatedClick(e) {
  const target = e.target;
  let item;

  if ((item = findItemByButtonId(target, '.recurring-edit-btn', recurringPatterns))) {
    showRecurringModal(item);
    return;
  }
  if ((item = findItemByButtonId(target, '.recurring-delete-btn', recurringPatterns))) {
    confirmDeleteRecurring(item);
    return;
  }

  const confirmBtn = target.closest('.confirm-pattern-btn');
  if (confirmBtn) {
    const index = parseInt(confirmBtn.dataset.index);
    const pattern = detectedPatterns[index];
    if (pattern) confirmDetectedPattern(pattern, index);
    return;
  }

  const rejectBtn = target.closest('.reject-pattern-btn');
  if (rejectBtn) {
    const index = parseInt(rejectBtn.dataset.index);
    rejectDetectedPattern(index);
    return;
  }

  // Handle add single bill button
  const addSingleBtn = target.closest('.add-single-bill-btn');
  if (addSingleBtn) {
    const index = parseInt(addSingleBtn.dataset.index);
    addSingleBill(index);
    return;
  }

  // Handle clicking on detected bill row (toggle selection)
  const billItem = target.closest('.detected-bill-item');
  if (billItem && !target.closest('button') && !target.closest('input')) {
    const index = parseInt(billItem.dataset.index);
    toggleBillSelection(index);
    return;
  }
}

function findItemByButtonId(target, selector, array) {
  const btn = target.closest(selector);
  if (!btn) return null;
  const id = parseInt(btn.dataset.id);
  return array.find(item => item.id === id) || null;
}

async function loadAllData() {
  await Promise.all([
    loadCategories(),
    loadRecurringPatterns(),
    loadDetectedBills()
  ]);
}

async function loadCategories() {
  try {
    const rawCategories = await api.get('/categories');
    const categoryMap = new Map();
    rawCategories.forEach(cat => {
      const existing = categoryMap.get(cat.name);
      if (!existing || (existing.is_default === 1 && cat.is_default === 0)) {
        categoryMap.set(cat.name, cat);
      }
    });
    categories = Array.from(categoryMap.values());
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadRecurringPatterns() {
  const recurringContainer = document.getElementById('recurring-container');
  try {
    recurringPatterns = await api.get('/recurring');
    renderRecurringPatterns();
  } catch (err) {
    recurringContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load recurring patterns: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

async function loadDetectedBills() {
  try {
    // Try to load detected subscriptions from the subscriptions API
    const [expenseBills, incomeBills] = await Promise.all([
      api.get('/subscriptions/detect?type=expense').catch(() => []),
      api.get('/subscriptions/detect?type=income').catch(() => [])
    ]);

    // Combine and filter out patterns already in recurring
    detectedBills = [...expenseBills, ...incomeBills].filter(bill => {
      const pattern = bill.pattern || bill.merchant_pattern;
      return !recurringPatterns.some(rp =>
        rp.description_pattern?.toLowerCase() === pattern?.toLowerCase() ||
        rp.merchant_name?.toLowerCase() === (bill.merchant_name || bill.source_name)?.toLowerCase()
      );
    });

    selectedBillIndexes.clear();
    renderDetectedBills();
  } catch (err) {
    console.error('Failed to load detected bills:', err);
    detectedBills = [];
  }
}

function renderDetectedBills() {
  const section = document.getElementById('detected-bills-section');
  const listContainer = document.getElementById('detected-bills-list');

  if (!detectedBills || detectedBills.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  const fragment = document.createDocumentFragment();
  detectedBills.forEach((bill, index) => {
    const displayName = bill.source_name || bill.merchant_name || bill.pattern;
    const isIncome = bill.type === 'income';
    const isSelected = selectedBillIndexes.has(index);

    const item = document.createElement('div');
    item.className = `detected-bill-item${isSelected ? ' selected' : ''}`;
    item.dataset.index = index;
    item.innerHTML = `
      <label class="detected-bill-checkbox">
        <input type="checkbox" ${isSelected ? 'checked' : ''} data-index="${index}">
        <span class="checkmark"></span>
      </label>
      <div class="detected-bill-info">
        <div class="detected-bill-name">${escapeHtml(displayName)}</div>
        <div class="detected-bill-details">
          <span class="detected-bill-frequency">${capitalizeFirst(bill.frequency || 'monthly')}</span>
          <span class="detected-bill-occurrences">${bill.occurrence_count || 0} occurrences</span>
          ${isIncome ? '<span class="detected-bill-type detected-bill-type--income">Income</span>' : ''}
        </div>
      </div>
      <div class="detected-bill-amount ${isIncome ? 'amount-positive' : 'amount-negative'}">
        ${isIncome ? '+' : ''}${formatCurrency(bill.typical_amount || 0)}
      </div>
      <div class="detected-bill-actions">
        <button class="btn btn-secondary btn-sm add-single-bill-btn" data-index="${index}">Add</button>
      </div>
    `;
    fragment.appendChild(item);
  });

  listContainer.innerHTML = '';
  listContainer.appendChild(fragment);

  updateBulkActionsVisibility();
}

function updateBulkActionsVisibility() {
  const bulkActions = document.getElementById('bulk-actions');
  const selectedCount = document.getElementById('selected-count');

  if (selectedBillIndexes.size > 0) {
    bulkActions.style.display = 'flex';
    selectedCount.textContent = `${selectedBillIndexes.size} selected`;
  } else {
    bulkActions.style.display = 'none';
  }
}

function toggleBillSelection(index) {
  if (selectedBillIndexes.has(index)) {
    selectedBillIndexes.delete(index);
  } else {
    selectedBillIndexes.add(index);
  }
  renderDetectedBills();
}

async function addSelectedBills() {
  if (selectedBillIndexes.size === 0) return;

  const billsToAdd = Array.from(selectedBillIndexes).map(i => detectedBills[i]);
  const btn = document.getElementById('add-selected-btn');
  btn.disabled = true;
  btn.textContent = 'Adding...';

  let successCount = 0;
  let failCount = 0;

  for (const bill of billsToAdd) {
    try {
      await api.post('/recurring', {
        description_pattern: bill.pattern || bill.merchant_pattern,
        merchant_name: bill.merchant_name || bill.source_name,
        typical_amount: bill.typical_amount,
        typical_day: bill.billing_day,
        frequency: bill.frequency || 'monthly',
        category_id: bill.category_id,
        is_subscription: true
      });
      successCount++;
    } catch (err) {
      failCount++;
      console.error('Failed to add bill:', err);
    }
  }

  btn.disabled = false;
  btn.textContent = 'Add Selected';

  if (successCount > 0) {
    showToast(`Added ${successCount} recurring pattern${successCount > 1 ? 's' : ''}`, 'success');
  }
  if (failCount > 0) {
    showToast(`Failed to add ${failCount} pattern${failCount > 1 ? 's' : ''}`, 'error');
  }

  // Reload data
  selectedBillIndexes.clear();
  await loadAllData();
}

async function addSingleBill(index) {
  const bill = detectedBills[index];
  if (!bill) return;

  try {
    await api.post('/recurring', {
      description_pattern: bill.pattern || bill.merchant_pattern,
      merchant_name: bill.merchant_name || bill.source_name,
      typical_amount: bill.typical_amount,
      typical_day: bill.billing_day,
      frequency: bill.frequency || 'monthly',
      category_id: bill.category_id,
      is_subscription: true
    });

    showToast(`"${bill.merchant_name || bill.source_name || bill.pattern}" added as recurring`, 'success');
    await loadAllData();
  } catch (err) {
    showToast(`Failed to add: ${err.message}`, 'error');
  }
}

function renderRecurringPatterns() {
  const recurringContainer = document.getElementById('recurring-container');
  if (!recurringPatterns || !recurringPatterns.length) {
    recurringContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🔄</div>
        <p>No recurring transactions configured yet</p>
        <p class="text-secondary">Click "Detect Patterns" to find recurring payments</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  recurringPatterns.forEach(pattern => {
    const item = document.createElement('div');
    item.className = 'recurring-item';
    item.innerHTML = `
      <div class="recurring-icon">${pattern.is_subscription ? '🔄' : '📅'}</div>
      <div class="recurring-info">
        <div class="recurring-merchant">${escapeHtml(pattern.merchant_name || pattern.description_pattern)}</div>
        <div class="recurring-details">
          <span class="recurring-frequency">${capitalizeFirst(pattern.frequency)}</span>
          ${pattern.typical_day ? `<span class="recurring-day">Day ${pattern.typical_day}</span>` : ''}
          ${pattern.category_name ? `
            <span class="category-badge" style="background-color: ${pattern.category_colour}20; color: ${pattern.category_colour}">
              ${pattern.category_icon || ''} ${escapeHtml(pattern.category_name)}
            </span>
          ` : ''}
        </div>
      </div>
      <div class="recurring-amount">${pattern.typical_amount ? formatCurrency(pattern.typical_amount) : '-'}</div>
      <div class="recurring-count">${pattern.transaction_count} txns</div>
      <div class="recurring-actions">
        <button class="btn btn-secondary btn-sm recurring-edit-btn" data-id="${pattern.id}">Edit</button>
        <button class="btn btn-danger btn-sm recurring-delete-btn" data-id="${pattern.id}">Delete</button>
      </div>
    `;
    fragment.appendChild(item);
  });

  recurringContainer.innerHTML = '';
  recurringContainer.appendChild(fragment);
}

async function runRecurringDetection() {
  const btn = document.getElementById('detect-recurring-btn');
  const detectedContainer = document.getElementById('detected-patterns-container');
  const listContainer = document.getElementById('detected-patterns-list');

  btn.disabled = true;
  btn.textContent = 'Detecting...';

  try {
    const result = await api.post('/recurring/detect', {});
    detectedPatterns = result;

    if (detectedPatterns.length === 0) {
      showToast('No new recurring patterns detected', 'info');
      detectedContainer.style.display = 'none';
    } else {
      renderDetectedPatterns();
      detectedContainer.style.display = 'block';
      showToast(`Found ${detectedPatterns.length} potential recurring pattern(s)`, 'success');
    }
  } catch (err) {
    showToast(`Detection failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Detect Patterns';
  }
}

function renderDetectedPatterns() {
  const listContainer = document.getElementById('detected-patterns-list');
  if (!detectedPatterns.length) {
    listContainer.innerHTML = '<p class="text-secondary">No patterns to review.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  detectedPatterns.forEach((pattern, index) => {
    const item = document.createElement('div');
    item.className = 'detected-pattern-item';
    item.innerHTML = `
      <div class="detected-pattern-info">
        <div class="detected-pattern-name">${escapeHtml(pattern.merchant_name || pattern.description_pattern)}</div>
        <div class="detected-pattern-details">
          <span>${capitalizeFirst(pattern.frequency)}</span>
          <span>${formatCurrency(pattern.typical_amount)}</span>
          <span>${pattern.transaction_count} occurrences</span>
        </div>
      </div>
      <div class="detected-pattern-actions">
        <button class="btn btn-primary btn-sm confirm-pattern-btn" data-index="${index}">Confirm</button>
        <button class="btn btn-secondary btn-sm reject-pattern-btn" data-index="${index}">Reject</button>
      </div>
    `;
    fragment.appendChild(item);
  });

  listContainer.innerHTML = '';
  listContainer.appendChild(fragment);
}

async function confirmDetectedPattern(pattern, index) {
  try {
    await api.post('/recurring', {
      description_pattern: pattern.description_pattern,
      merchant_name: pattern.merchant_name,
      typical_amount: pattern.typical_amount,
      typical_day: pattern.typical_day,
      frequency: pattern.frequency,
      category_id: pattern.category_id,
      is_subscription: pattern.is_subscription,
      transaction_ids: pattern.transaction_ids
    });

    showToast(`"${pattern.merchant_name || pattern.description_pattern}" confirmed as recurring`, 'success');

    detectedPatterns.splice(index, 1);
    renderDetectedPatterns();

    await loadRecurringPatterns();

    if (detectedPatterns.length === 0) {
      document.getElementById('detected-patterns-container').style.display = 'none';
    }
  } catch (err) {
    showToast(`Failed to confirm pattern: ${err.message}`, 'error');
  }
}

function rejectDetectedPattern(index) {
  detectedPatterns.splice(index, 1);
  renderDetectedPatterns();

  if (detectedPatterns.length === 0) {
    document.getElementById('detected-patterns-container').style.display = 'none';
  }
}

function showRecurringModal(pattern = null) {
  const isEdit = pattern !== null;
  const title = isEdit ? 'Edit Recurring Pattern' : 'Add Recurring Pattern';

  const frequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];

  createModal({
    title,
    content: `
      <form id="recurring-form">
        <div class="form-group">
          <label class="form-label">Merchant Name</label>
          <input type="text" class="form-input" id="recurring-merchant"
                 value="${isEdit ? escapeHtml(pattern.merchant_name || '') : ''}"
                 placeholder="e.g. Netflix, Spotify">
        </div>
        <div class="form-group">
          <label class="form-label">Description Pattern</label>
          <input type="text" class="form-input" id="recurring-pattern"
                 value="${isEdit ? escapeHtml(pattern.description_pattern || '') : ''}"
                 placeholder="e.g. NETFLIX.COM" ${isEdit ? 'readonly' : ''}>
          ${isEdit ? '<small class="text-secondary">Pattern cannot be changed after creation</small>' : ''}
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="recurring-category">
            <option value="">No category</option>
            ${categories.map(cat => `
              <option value="${cat.id}" ${isEdit && pattern.category_id === cat.id ? 'selected' : ''}>
                ${cat.icon || ''} ${escapeHtml(cat.name)} (${cat.type})
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Typical Amount</label>
            <input type="number" class="form-input" id="recurring-amount"
                   value="${isEdit && pattern.typical_amount ? pattern.typical_amount : ''}"
                   step="0.01" min="0" placeholder="0.00">
          </div>
          <div class="form-group">
            <label class="form-label">Typical Day</label>
            <input type="number" class="form-input" id="recurring-day"
                   value="${isEdit && pattern.typical_day ? pattern.typical_day : ''}"
                   min="1" max="31" placeholder="1-31">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Frequency</label>
          <select class="form-select" id="recurring-frequency">
            ${frequencies.map(freq => `
              <option value="${freq}" ${isEdit && pattern.frequency === freq ? 'selected' : freq === 'monthly' && !isEdit ? 'selected' : ''}>
                ${capitalizeFirst(freq)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">
            <input type="checkbox" id="recurring-subscription"
                   ${isEdit && pattern.is_subscription ? 'checked' : ''}>
            Mark as subscription
          </label>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Save Changes' : 'Add Pattern'}</button>
    `,
    onSave: async () => {
      const merchant_name = document.getElementById('recurring-merchant').value.trim();
      const description_pattern = document.getElementById('recurring-pattern').value.trim();
      const category_id = document.getElementById('recurring-category').value || null;
      const typical_amount = parseFloat(document.getElementById('recurring-amount').value) || null;
      const typical_day = parseInt(document.getElementById('recurring-day').value) || null;
      const frequency = document.getElementById('recurring-frequency').value;
      const is_subscription = document.getElementById('recurring-subscription').checked;

      if (!isEdit && !description_pattern) {
        showToast('Description pattern is required', 'error');
        return false;
      }

      const data = {
        merchant_name,
        typical_amount,
        typical_day,
        frequency,
        category_id: category_id ? parseInt(category_id) : null,
        is_subscription
      };

      try {
        if (isEdit) {
          await api.put(`/recurring/${pattern.id}`, data);
          showToast('Recurring pattern updated', 'success');
        } else {
          data.description_pattern = description_pattern;
          await api.post('/recurring', data);
          showToast('Recurring pattern created', 'success');
        }
        await loadRecurringPatterns();
        return true;
      } catch (err) {
        showToast(`Failed to save: ${err.message}`, 'error');
        return false;
      }
    }
  });
}

function confirmDeleteRecurring(pattern) {
  showConfirmDialog({
    title: 'Delete Recurring Pattern',
    message: `Are you sure you want to delete <strong>${escapeHtml(pattern.merchant_name || pattern.description_pattern)}</strong>?<br><br>This will unlink ${pattern.transaction_count} transaction(s) from this pattern.`,
    type: 'danger',
    confirmText: 'Delete',
    onConfirm: async () => {
      try {
        await api.delete(`/recurring/${pattern.id}`);
        showToast('Recurring pattern deleted', 'success');
        await loadRecurringPatterns();
      } catch (err) {
        showToast(`Failed to delete: ${err.message}`, 'error');
      }
    }
  });
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============= TOAST UTILITIES =============
// Modal utilities imported from ../../core/modal.js

function showToast(message, type = 'info') {
  const toastContainer = document.querySelector('.toast-container') || createToastContainer();

  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'i'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || iconMap.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  toastContainer.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => toast.remove());

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}
