/**
 * Recurring Transactions Management Page
 * Manages detected recurring payments and subscriptions
 */

import { api } from '../../core/api.js';
import { escapeHtml, formatCurrency } from '../../core/utils.js';

let container = null;
let cleanupFunctions = [];
let categories = [];
let recurringPatterns = [];
let detectedPatterns = [];

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
      <header class="page-header">
        <div class="page-header__content">
          <h1 class="page-title">Recurring Transactions</h1>
          <p class="page-subtitle">Manage detected recurring payments and subscriptions</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn-secondary" id="detect-recurring-btn">Detect Patterns</button>
        </div>
      </header>

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
    loadRecurringPatterns()
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

// ============= MODAL UTILITIES =============

function createModal({ title, content, footer, onMount, onSave }) {
  const existingModal = document.querySelector('.modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        <button class="modal-close" id="modal-close-x" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();

  const closeX = overlay.querySelector('#modal-close-x');
  if (closeX) closeX.addEventListener('click', closeModal);

  const cancelBtn = overlay.querySelector('#modal-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  const saveBtn = overlay.querySelector('#modal-save');
  if (saveBtn && onSave) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      const success = await onSave();
      if (success) {
        closeModal();
      } else {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });
  }

  if (onMount) onMount();

  const firstInput = overlay.querySelector('input:not([disabled]), select:not([disabled])');
  if (firstInput) firstInput.focus();

  return overlay;
}

function showConfirmDialog({ title, message, type = 'warning', confirmText = 'Confirm', onConfirm }) {
  const iconMap = {
    warning: '!',
    danger: '!',
    info: 'i'
  };

  createModal({
    title,
    content: `
      <div class="confirm-dialog">
        <div class="confirm-dialog-icon ${type}">${iconMap[type] || iconMap.warning}</div>
        <div class="confirm-dialog-message">${message}</div>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${confirmText}</button>
    `,
    onMount: () => {
      const confirmBtn = document.getElementById('modal-confirm');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          confirmBtn.disabled = true;
          await onConfirm();
          const overlay = document.querySelector('.modal-overlay');
          if (overlay) overlay.remove();
        });
      }
    }
  });
}

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
