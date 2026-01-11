/**
 * Accounts Management Page
 * Manages bank accounts and their details
 */

import { api } from '../../core/api.js';
import { escapeHtml, formatCurrency } from '../../core/utils.js';
import { createModal, showConfirmDialog } from '../../core/modal.js';

let container = null;
let cleanupFunctions = [];
let accounts = [];

function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

export function mount(el, params) {
  container = el;
  cleanupFunctions = [];

  render();
  attachEventListeners();
  loadAccounts();
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
          <h1 class="page-title">Accounts</h1>
          <p class="page-subtitle">Manage your bank accounts and their details</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn-secondary" id="import-csv-btn">Import CSV</button>
          <button class="btn btn-primary" id="add-account-btn">+ Add Account</button>
        </div>
      </header>

      <div id="accounts-container" class="accounts-grid">
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading accounts...</p>
        </div>
      </div>
    </div>
  `;
}

function attachEventListeners() {
  const importCsvBtn = container.querySelector('#import-csv-btn');
  if (importCsvBtn) {
    const handler = () => {
      window.location.hash = '#/transactions?import=1';
    };
    importCsvBtn.addEventListener('click', handler);
    onCleanup(() => importCsvBtn.removeEventListener('click', handler));
  }

  const addAccountBtn = container.querySelector('#add-account-btn');
  if (addAccountBtn) {
    const handler = () => showAccountModal();
    addAccountBtn.addEventListener('click', handler);
    onCleanup(() => addAccountBtn.removeEventListener('click', handler));
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

  if ((item = findItemByButtonId(target, '.account-edit-btn', accounts))) {
    showAccountModal(item);
    return;
  }
  if ((item = findItemByButtonId(target, '.account-testdata-btn', accounts))) {
    showTestDataModal(item);
    return;
  }
  if ((item = findItemByButtonId(target, '.account-delete-btn', accounts))) {
    confirmDeleteAccount(item);
    return;
  }
}

function findItemByButtonId(target, selector, array) {
  const btn = target.closest(selector);
  if (!btn) return null;
  const id = parseInt(btn.dataset.id);
  return array.find(item => item.id === id) || null;
}

async function loadAccounts() {
  const accountsContainer = document.getElementById('accounts-container');
  try {
    accounts = await api.get('/accounts');
    renderAccounts();
  } catch (err) {
    accountsContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load accounts: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

function renderAccounts() {
  const accountsContainer = document.getElementById('accounts-container');
  if (!accounts.length) {
    accountsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🏦</div>
        <p>No accounts found</p>
        <p class="text-secondary">Add your first account to get started</p>
      </div>
    `;
    return;
  }

  const getAccountTypeDisplay = (type) => {
    const typeMap = {
      'current': 'Current',
      'savings': 'Savings',
      'credit': 'Credit Card',
      'debit': 'Current'
    };
    return typeMap[type] || type;
  };

  const fragment = document.createDocumentFragment();
  accounts.forEach(account => {
    const card = document.createElement('div');
    card.className = 'account-card';
    const typeClass = account.account_type === 'debit' ? 'current' : account.account_type;
    card.innerHTML = `
      <div class="account-card-header">
        <div class="account-name">${escapeHtml(account.account_name)}</div>
        <span class="account-type-badge ${typeClass}">${getAccountTypeDisplay(account.account_type)}</span>
      </div>
      <div class="account-details">
        <span class="account-detail-label">Account No:</span>
        <span class="account-detail-value">${escapeHtml(account.account_number || 'N/A')}</span>

        <span class="account-detail-label">Opening Balance:</span>
        <span class="account-detail-value">${formatCurrency(account.opening_balance || 0)}</span>

        <span class="account-detail-label">Current Balance:</span>
        <span class="account-detail-value">${formatCurrency(account.current_balance || 0)}</span>
      </div>
      <div class="account-card-actions">
        <button class="btn btn-secondary btn-sm account-edit-btn" data-id="${account.id}">Edit</button>
        <button class="btn btn-primary btn-sm account-testdata-btn" data-id="${account.id}">Test Data</button>
        <button class="btn btn-danger btn-sm account-delete-btn" data-id="${account.id}">Delete</button>
      </div>
    `;
    fragment.appendChild(card);
  });

  accountsContainer.innerHTML = '';
  accountsContainer.appendChild(fragment);
}

function showAccountModal(account = null) {
  const isNew = !account;
  const accountName = account?.account_name || '';
  const openingBalance = account?.opening_balance || 0;
  const accountNumber = account?.account_number || '';
  const accountType = account?.account_type || 'current';

  const dangerZone = isNew ? '' : `
    <div class="form-group" style="margin-top: var(--space-lg); padding-top: var(--space-md); border-top: var(--border-light);">
      <label class="form-label">Danger Zone</label>
      <p class="text-secondary" style="margin-bottom: var(--space-sm); font-size: var(--text-sm);">
        Clear all transactions from this account. This cannot be undone.
      </p>
      <button type="button" class="btn btn-danger btn-sm" id="clear-transactions-btn">
        Clear All Transactions
      </button>
    </div>
  `;

  const modal = createModal({
    title: isNew ? 'Add Account' : 'Edit Account',
    content: `
      <form id="account-form" class="account-edit-form">
        <div class="form-group">
          <label class="form-label" for="account-name">Account Name</label>
          <input type="text" class="form-input" id="account-name"
                 value="${escapeHtml(accountName)}" required placeholder="e.g., Current Account">
        </div>
        <div class="form-group">
          <label class="form-label" for="account-type">Account Type</label>
          <select class="form-select" id="account-type" ${isNew ? '' : 'disabled'}>
            <option value="current" ${accountType === 'current' || accountType === 'debit' ? 'selected' : ''}>Current</option>
            <option value="savings" ${accountType === 'savings' ? 'selected' : ''}>Savings</option>
            <option value="credit" ${accountType === 'credit' ? 'selected' : ''}>Credit Card</option>
          </select>
          ${isNew ? '' : '<small class="text-secondary">Account type cannot be changed</small>'}
        </div>
        <div class="form-group">
          <label class="form-label" for="account-number">Account Number (optional)</label>
          <input type="text" class="form-input" id="account-number"
                 value="${escapeHtml(accountNumber)}" placeholder="Last 4 digits for reference">
        </div>
        <div class="form-group">
          <label class="form-label" for="account-balance">Opening Balance</label>
          <input type="number" class="form-input" id="account-balance"
                 value="${openingBalance}" step="0.01" placeholder="0.00">
        </div>
        ${dangerZone}
      </form>
    `,
    footer: `
      <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="modal-save">${isNew ? 'Create Account' : 'Save Changes'}</button>
    `,
    onMount: () => {
      if (!isNew) {
        const clearBtn = document.getElementById('clear-transactions-btn');
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            confirmClearTransactions(account);
          });
        }
      }
    },
    onSave: async () => {
      const name = document.getElementById('account-name').value.trim();
      const type = document.getElementById('account-type').value;
      const accountNum = document.getElementById('account-number').value.trim();
      const balance = parseFloat(document.getElementById('account-balance').value) || 0;

      if (!name) {
        showToast('Please enter an account name', 'error');
        return false;
      }

      try {
        if (isNew) {
          await api.post('/accounts', {
            account_name: name,
            account_type: type,
            account_number: accountNum,
            opening_balance: balance
          });
          showToast('Account created successfully', 'success');
        } else {
          await api.put(`/accounts/${account.id}`, {
            account_name: name,
            account_number: accountNum,
            opening_balance: balance
          });
          showToast('Account updated successfully', 'success');
        }
        await loadAccounts();
        return true;
      } catch (err) {
        showToast(`Failed to ${isNew ? 'create' : 'update'} account: ${err.message}`, 'error');
        return false;
      }
    }
  });
}

function confirmClearTransactions(account) {
  const existingModal = document.querySelector('.modal-overlay');
  if (existingModal) existingModal.remove();

  showConfirmDialog({
    title: 'Clear All Transactions',
    message: `Are you sure you want to delete <strong>ALL transactions</strong> from <strong>${escapeHtml(account.account_name)}</strong>?<br><br>This action cannot be undone.`,
    type: 'danger',
    confirmText: 'Clear All',
    onConfirm: async () => {
      try {
        await api.delete(`/accounts/${account.id}/transactions`);
        showToast(`All transactions cleared from ${account.account_name}`, 'success');
        await loadAccounts();
      } catch (err) {
        showToast(`Failed to clear transactions: ${err.message}`, 'error');
      }
    }
  });
}

function confirmDeleteAccount(account) {
  showConfirmDialog({
    title: 'Delete Account',
    message: `Are you sure you want to delete <strong>${escapeHtml(account.account_name)}</strong>?<br><br>This will permanently delete the account and ALL its transactions. This action cannot be undone.`,
    type: 'danger',
    confirmText: 'Delete Account',
    onConfirm: async () => {
      try {
        await api.delete(`/accounts/${account.id}`);
        showToast(`Account "${account.account_name}" deleted successfully`, 'success');
        await loadAccounts();
      } catch (err) {
        showToast(`Failed to delete account: ${err.message}`, 'error');
      }
    }
  });
}

function showTestDataModal(account) {
  createModal({
    title: `Generate Test Data - ${escapeHtml(account.account_name)}`,
    content: `
      <form id="testdata-form">
        <div class="form-group">
          <label class="form-label" for="testdata-months">Number of Months</label>
          <input type="number" class="form-input" id="testdata-months"
                 value="3" min="1" max="24" required>
          <small class="text-secondary">Generate transactions for this many months back from today</small>
        </div>
        <div class="form-group">
          <label class="form-label" for="testdata-txn-count">Transactions per Month</label>
          <input type="number" class="form-input" id="testdata-txn-count"
                 value="30" min="5" max="100" required>
        </div>
        <div class="form-group">
          <label class="form-label">Transaction Types</label>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="testdata-income" checked>
              Include income (salary, transfers in)
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="testdata-bills" checked>
              Include bills (utilities, subscriptions)
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="testdata-shopping" checked>
              Include shopping (groceries, retail)
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="testdata-dining" checked>
              Include dining & entertainment
            </label>
          </div>
        </div>
        <div class="form-group" style="margin-top: var(--space-md); padding: var(--space-md); background: var(--warning-bg); border-radius: var(--radius-md);">
          <p style="margin: 0; color: var(--warning-text); font-size: var(--text-sm);">
            <strong>Warning:</strong> This will add test transactions to your account.
            Use the "Clear Transactions" option in Edit to remove them later.
          </p>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="modal-save">Generate Test Data</button>
    `,
    onSave: async () => {
      const months = parseInt(document.getElementById('testdata-months').value);
      const txnCount = parseInt(document.getElementById('testdata-txn-count').value);
      const includeIncome = document.getElementById('testdata-income').checked;
      const includeBills = document.getElementById('testdata-bills').checked;
      const includeShopping = document.getElementById('testdata-shopping').checked;
      const includeDining = document.getElementById('testdata-dining').checked;

      try {
        const result = await api.post(`/accounts/${account.id}/test-data`, {
          months,
          transactionsPerMonth: txnCount,
          includeIncome,
          includeBills,
          includeShopping,
          includeDining
        });
        showToast(`Generated ${result.count} test transactions`, 'success');
        await loadAccounts();
        return true;
      } catch (err) {
        showToast(`Failed to generate test data: ${err.message}`, 'error');
        return false;
      }
    }
  });
}

// ============= MODAL UTILITIES =============
// Using shared modal utilities from '../../core/modal.js' with full accessibility support

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
