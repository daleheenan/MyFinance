/**
 * Settings Page Module
 * Manages accounts, categories, category rules, and import history
 */

import { api } from '../../core/api.js';
import { escapeHtml, formatCurrency, formatDate } from '../../core/utils.js';
import { auth } from '../../core/auth.js';

let container = null;
let billingConfig = null;
let subscriptionStatus = null;
let userEmail = null;
let cleanupFunctions = [];
let accounts = [];
let categories = [];
let categoryRules = [];
let importBatches = [];
let recurringPatterns = [];
let detectedPatterns = [];

const PRESET_COLOURS = [
  '#34c759', '#ff3b30', '#007aff', '#ff9500', '#af52de',
  '#5ac8fa', '#ff2d55', '#32ade6', '#ff6482', '#8e8e93',
  '#636366', '#00c7be', '#30d158', '#ff453a', '#0a84ff'
];

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

  const toastContainer = document.querySelector('.toast-container');
  if (toastContainer) {
    toastContainer.remove();
  }

  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(modal => modal.remove());

  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

function render() {
  container.innerHTML = `
    <div class="page settings-page">
      <section class="settings-section" id="accounts-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Accounts</h2>
            <p class="settings-section-description">Manage your bank accounts and their details</p>
          </div>
          <div class="settings-section-actions">
            <button class="btn btn-secondary btn-sm" id="import-csv-btn">Import CSV</button>
            <button class="btn btn-primary btn-sm" id="add-account-btn">+ Add Account</button>
          </div>
        </div>
        <div id="accounts-container" class="accounts-grid">
          <div class="section-loading">
            <div class="spinner"></div>
          </div>
        </div>
      </section>

      <section class="settings-section" id="categories-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Categories</h2>
            <p class="settings-section-description">Organize your transactions with custom categories</p>
          </div>
          <button class="btn btn-primary btn-sm" id="add-category-btn">+ Add Category</button>
        </div>
        <div id="categories-container" class="category-list">
          <div class="section-loading">
            <div class="spinner"></div>
          </div>
        </div>
      </section>

      <section class="settings-section" id="rules-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Category Rules</h2>
            <p class="settings-section-description">Auto-categorize transactions based on patterns</p>
          </div>
          <button class="btn btn-primary btn-sm" id="add-rule-btn">+ Add Rule</button>
        </div>
        <div id="rules-container" class="rules-table-container">
          <div class="section-loading">
            <div class="spinner"></div>
          </div>
        </div>
        <div class="rule-tester" id="rule-tester">
          <div class="rule-tester-title">Test Pattern Matching</div>
          <div class="rule-tester-form">
            <input type="text" class="form-input rule-tester-input" id="rule-test-input"
                   placeholder="Enter a description to test...">
            <button class="btn btn-secondary btn-sm" id="rule-test-btn">Test</button>
          </div>
          <div id="rule-test-result"></div>
        </div>
      </section>

      <section class="settings-section" id="recurring-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Recurring Transactions</h2>
            <p class="settings-section-description">Manage detected recurring payments and subscriptions</p>
          </div>
          <button class="btn btn-secondary btn-sm" id="detect-recurring-btn">Detect Patterns</button>
        </div>
        <div id="recurring-container" class="recurring-list">
          <div class="section-loading">
            <div class="spinner"></div>
          </div>
        </div>
        <div id="detected-patterns-container" class="detected-patterns-container" style="display: none;">
          <div class="detected-patterns-header">
            <h3>Detected Patterns</h3>
            <p class="text-secondary">Review and confirm these detected recurring transactions</p>
          </div>
          <div id="detected-patterns-list"></div>
        </div>
      </section>

      <section class="settings-section" id="import-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Import History</h2>
            <p class="settings-section-description">View past CSV imports and their results</p>
          </div>
        </div>
        <div id="import-container" class="import-table-container">
          <div class="section-loading">
            <div class="spinner"></div>
          </div>
        </div>
      </section>

      <section class="settings-section" id="export-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Data Export</h2>
            <p class="settings-section-description">Export your financial data</p>
          </div>
        </div>
        <div class="export-placeholder">
          <div class="export-placeholder-icon">📦</div>
          <p>Export functionality allows you to download your transactions and data.</p>
          <button class="btn btn-secondary btn-disabled" disabled>
            Export Data
            <span class="tooltip">Coming Soon</span>
          </button>
        </div>
      </section>

      <section class="settings-section" id="profile-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Profile</h2>
            <p class="settings-section-description">Manage your account details and email</p>
          </div>
        </div>

        <div class="user-management-card">
          <div class="user-management-header">
            <span class="user-management-icon">📧</span>
            <div>
              <h3 class="user-management-title">Email Address</h3>
              <p class="user-management-description">Used for password recovery and notifications</p>
            </div>
          </div>
          <form id="email-form" class="email-form">
            <div class="form-group">
              <label class="form-label" for="user-email">Email</label>
              <input type="email" class="form-input" id="user-email" placeholder="your@email.com">
              <small class="text-secondary">Required for password reset functionality</small>
            </div>
            <div id="email-error" class="form-error" style="display: none;"></div>
            <div id="email-success" class="form-success" style="display: none;"></div>
            <button type="submit" class="btn btn-primary" id="save-email-btn">Save Email</button>
          </form>
        </div>
      </section>

      <section class="settings-section" id="subscription-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Subscription</h2>
            <p class="settings-section-description">Manage your FinanceFlow subscription</p>
          </div>
        </div>

        <div id="subscription-container" class="subscription-container">
          <div class="section-loading">
            <div class="spinner"></div>
          </div>
        </div>
      </section>

      <section class="settings-section" id="user-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Security</h2>
            <p class="settings-section-description">Manage your account security and view login activity</p>
          </div>
        </div>

        <div class="user-management-card">
          <div class="user-management-header">
            <span class="user-management-icon">🔒</span>
            <div>
              <h3 class="user-management-title">Change Password</h3>
              <p class="user-management-description">Update your login password</p>
            </div>
          </div>
          <form id="change-password-form" class="change-password-form">
            <div class="form-group">
              <label class="form-label" for="current-password">Current Password</label>
              <input type="password" class="form-input" id="current-password" required autocomplete="current-password">
            </div>
            <div class="form-group">
              <label class="form-label" for="new-password">New Password</label>
              <input type="password" class="form-input" id="new-password" required autocomplete="new-password" minlength="8">
              <small class="text-secondary">Minimum 8 characters</small>
            </div>
            <div class="form-group">
              <label class="form-label" for="confirm-password">Confirm New Password</label>
              <input type="password" class="form-input" id="confirm-password" required autocomplete="new-password">
            </div>
            <div id="password-error" class="form-error" style="display: none;"></div>
            <button type="submit" class="btn btn-primary" id="change-password-btn">Change Password</button>
          </form>
        </div>

        <div class="user-management-card">
          <div class="user-management-header">
            <span class="user-management-icon">📋</span>
            <div>
              <h3 class="user-management-title">Login History</h3>
              <p class="user-management-description">Recent login attempts to your account</p>
            </div>
            <button class="btn btn-secondary btn-sm" id="refresh-login-history">Refresh</button>
          </div>
          <div id="login-history-container" class="login-history-container">
            <div class="section-loading">
              <div class="spinner"></div>
            </div>
          </div>
        </div>

        <div class="user-management-card">
          <div class="user-management-header">
            <span class="user-management-icon">💻</span>
            <div>
              <h3 class="user-management-title">Active Sessions</h3>
              <p class="user-management-description">Devices currently logged into your account</p>
            </div>
            <button class="btn btn-secondary btn-sm" id="refresh-sessions">Refresh</button>
          </div>
          <div id="sessions-container" class="sessions-container">
            <div class="section-loading">
              <div class="spinner"></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  // Create toast container
  if (!document.querySelector('.toast-container')) {
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}

/**
 * Attach event listeners with delegation
 */
function attachEventListeners() {
  // Import CSV button - navigates to transactions page with import modal
  const importCsvBtn = container.querySelector('#import-csv-btn');
  if (importCsvBtn) {
    const handler = () => {
      window.location.hash = '#/transactions?import=1';
    };
    importCsvBtn.addEventListener('click', handler);
    onCleanup(() => importCsvBtn.removeEventListener('click', handler));
  }

  // Add Account button
  const addAccountBtn = container.querySelector('#add-account-btn');
  if (addAccountBtn) {
    const handler = () => showAccountModal();
    addAccountBtn.addEventListener('click', handler);
    onCleanup(() => addAccountBtn.removeEventListener('click', handler));
  }

  // Add Category button
  const addCategoryBtn = container.querySelector('#add-category-btn');
  if (addCategoryBtn) {
    const handler = () => showCategoryModal();
    addCategoryBtn.addEventListener('click', handler);
    onCleanup(() => addCategoryBtn.removeEventListener('click', handler));
  }

  // Add Rule button
  const addRuleBtn = container.querySelector('#add-rule-btn');
  if (addRuleBtn) {
    const handler = () => showRuleModal();
    addRuleBtn.addEventListener('click', handler);
    onCleanup(() => addRuleBtn.removeEventListener('click', handler));
  }

  // Rule test button
  const ruleTestBtn = container.querySelector('#rule-test-btn');
  if (ruleTestBtn) {
    const handler = () => testRule();
    ruleTestBtn.addEventListener('click', handler);
    onCleanup(() => ruleTestBtn.removeEventListener('click', handler));
  }

  // Rule test input enter key
  const ruleTestInput = container.querySelector('#rule-test-input');
  if (ruleTestInput) {
    const handler = (e) => {
      if (e.key === 'Enter') testRule();
    };
    ruleTestInput.addEventListener('keypress', handler);
    onCleanup(() => ruleTestInput.removeEventListener('keypress', handler));
  }

  // Detect recurring button
  const detectRecurringBtn = container.querySelector('#detect-recurring-btn');
  if (detectRecurringBtn) {
    const handler = () => runRecurringDetection();
    detectRecurringBtn.addEventListener('click', handler);
    onCleanup(() => detectRecurringBtn.removeEventListener('click', handler));
  }

  // Delegated click handlers for dynamic content
  const settingsPage = container.querySelector('.settings-page');
  if (settingsPage) {
    const clickHandler = (e) => handleDelegatedClick(e);
    settingsPage.addEventListener('click', clickHandler);
    onCleanup(() => settingsPage.removeEventListener('click', clickHandler));
  }

  // Change password form
  const changePasswordForm = container.querySelector('#change-password-form');
  if (changePasswordForm) {
    const handler = (e) => handleChangePassword(e);
    changePasswordForm.addEventListener('submit', handler);
    onCleanup(() => changePasswordForm.removeEventListener('submit', handler));
  }

  // Refresh login history button
  const refreshHistoryBtn = container.querySelector('#refresh-login-history');
  if (refreshHistoryBtn) {
    const handler = () => loadLoginHistory();
    refreshHistoryBtn.addEventListener('click', handler);
    onCleanup(() => refreshHistoryBtn.removeEventListener('click', handler));
  }

  // Refresh sessions button
  const refreshSessionsBtn = container.querySelector('#refresh-sessions');
  if (refreshSessionsBtn) {
    const handler = () => loadActiveSessions();
    refreshSessionsBtn.addEventListener('click', handler);
    onCleanup(() => refreshSessionsBtn.removeEventListener('click', handler));
  }

  // Email form
  const emailForm = container.querySelector('#email-form');
  if (emailForm) {
    const handler = (e) => handleSaveEmail(e);
    emailForm.addEventListener('submit', handler);
    onCleanup(() => emailForm.removeEventListener('submit', handler));
  }
}

/**
 * Find item from array by button's data-id attribute
 */
function findItemByButtonId(target, selector, array) {
  const btn = target.closest(selector);
  if (!btn) return null;
  const id = parseInt(btn.dataset.id);
  return array.find(item => item.id === id) || null;
}

/**
 * Handle delegated click events
 */
function handleDelegatedClick(e) {
  const target = e.target;
  let item;

  // Account buttons
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

  // Category buttons
  if ((item = findItemByButtonId(target, '.category-edit-btn', categories))) {
    showCategoryModal(item);
    return;
  }
  if ((item = findItemByButtonId(target, '.category-delete-btn', categories))) {
    confirmDeleteCategory(item);
    return;
  }

  // Rule buttons
  if ((item = findItemByButtonId(target, '.rule-edit-btn', categoryRules))) {
    showRuleModal(item);
    return;
  }
  if ((item = findItemByButtonId(target, '.rule-delete-btn', categoryRules))) {
    confirmDeleteRule(item);
    return;
  }

  // Recurring pattern buttons
  if ((item = findItemByButtonId(target, '.recurring-edit-btn', recurringPatterns))) {
    showRecurringModal(item);
    return;
  }
  if ((item = findItemByButtonId(target, '.recurring-delete-btn', recurringPatterns))) {
    confirmDeleteRecurring(item);
    return;
  }

  // Detected pattern buttons (use index instead of id)
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

  // Import row click
  const importRow = target.closest('.import-row');
  if (importRow) {
    const batchId = parseInt(importRow.dataset.id);
    showImportDetails(batchId);
    return;
  }
}

/**
 * Load all data from API
 */
async function loadAllData() {
  await Promise.all([
    loadAccounts(),
    loadCategories(),
    loadCategoryRules(),
    loadImportBatches(),
    loadRecurringPatterns(),
    loadLoginHistory(),
    loadActiveSessions(),
    loadUserEmail(),
    loadBillingConfig(),
    loadSubscriptionStatus()
  ]);
}

// ============= ACCOUNTS SECTION =============

/**
 * Load accounts from API
 */
async function loadAccounts() {
  const container = document.getElementById('accounts-container');
  try {
    accounts = await api.get('/accounts');
    renderAccounts();
  } catch (err) {
    container.innerHTML = `
      <div class="section-error">
        <p>Failed to load accounts: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm mt-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

/**
 * Render accounts grid
 */
function renderAccounts() {
  const container = document.getElementById('accounts-container');
  if (!accounts.length) {
    container.innerHTML = `
      <div class="section-empty">
        <p>No accounts found</p>
      </div>
    `;
    return;
  }

  // Helper to get display name for account type
  const getAccountTypeDisplay = (type) => {
    const typeMap = {
      'current': 'Current',
      'savings': 'Savings',
      'credit': 'Credit Card',
      'debit': 'Current'  // Map legacy 'debit' to 'Current'
    };
    return typeMap[type] || type;
  };

  const fragment = document.createDocumentFragment();
  accounts.forEach(account => {
    const card = document.createElement('div');
    card.className = 'account-card';
    // Normalize legacy 'debit' to 'current' for CSS class
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

  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Show account add/edit modal
 */
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
      // Add clear transactions button handler (edit mode only)
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

/**
 * Confirm clearing all transactions from an account
 */
function confirmClearTransactions(account) {
  // Close the edit modal first
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

/**
 * Confirm deletion of an account
 */
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

/**
 * Show test data generation modal for an account
 */
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

// ============= CATEGORIES SECTION =============

/**
 * Load categories from API
 */
async function loadCategories() {
  const container = document.getElementById('categories-container');
  try {
    categories = await api.get('/categories');
    renderCategories();
  } catch (err) {
    container.innerHTML = `
      <div class="section-error">
        <p>Failed to load categories: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm mt-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

/**
 * Render categories list
 */
function renderCategories() {
  const container = document.getElementById('categories-container');
  if (!categories.length) {
    container.innerHTML = `
      <div class="section-empty">
        <p>No categories found</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  categories.forEach(category => {
    const isDefault = category.is_default === 1;
    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
      <div class="category-colour-swatch" style="background-color: ${escapeHtml(category.colour)}"></div>
      <div class="category-icon">${category.icon || ''}</div>
      <div class="category-info">
        <div class="category-name">${escapeHtml(category.name)}</div>
        <div class="category-type">${escapeHtml(category.type)}</div>
      </div>
      ${isDefault ? '<span class="category-badge-default">Default</span>' : ''}
      <div class="category-actions">
        ${isDefault ? `
          <button class="btn btn-secondary btn-sm btn-disabled" title="Cannot edit default categories" disabled>Edit</button>
          <button class="btn btn-secondary btn-sm btn-disabled" title="Cannot delete default categories" disabled>Delete</button>
        ` : `
          <button class="btn btn-secondary btn-sm category-edit-btn" data-id="${category.id}">Edit</button>
          <button class="btn btn-danger btn-sm category-delete-btn" data-id="${category.id}">Delete</button>
        `}
      </div>
    `;
    fragment.appendChild(item);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Show category add/edit modal
 */
function showCategoryModal(category = null) {
  const isEdit = category !== null;
  const title = isEdit ? 'Edit Category' : 'Add Category';

  const modal = createModal({
    title,
    content: `
      <form id="category-form">
        <div class="form-group">
          <label class="form-label">Category Name</label>
          <input type="text" class="form-input" id="category-name"
                 value="${isEdit ? escapeHtml(category.name) : ''}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="category-type">
            <option value="expense" ${isEdit && category.type === 'expense' ? 'selected' : ''}>Expense</option>
            <option value="income" ${isEdit && category.type === 'income' ? 'selected' : ''}>Income</option>
            <option value="neutral" ${isEdit && category.type === 'neutral' ? 'selected' : ''}>Neutral</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Colour</label>
          <div class="colour-picker" id="colour-picker">
            ${PRESET_COLOURS.map(colour => `
              <button type="button" class="colour-option ${isEdit && category.colour === colour ? 'selected' : ''}"
                      data-colour="${colour}" style="background-color: ${colour}"></button>
            `).join('')}
          </div>
          <div class="colour-custom">
            <input type="color" id="colour-custom-picker" value="${isEdit ? category.colour : '#007aff'}">
            <input type="text" class="form-input" id="colour-custom-hex"
                   value="${isEdit ? category.colour : '#007aff'}" placeholder="#007aff">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Icon (emoji)</label>
          <input type="text" class="form-input" id="category-icon"
                 value="${isEdit ? (category.icon || '') : ''}" placeholder="e.g. 🛒" maxlength="4">
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Save Changes' : 'Add Category'}</button>
    `,
    onMount: () => {
      // Colour picker handlers
      const colourPicker = document.getElementById('colour-picker');
      const customPicker = document.getElementById('colour-custom-picker');
      const customHex = document.getElementById('colour-custom-hex');

      colourPicker.addEventListener('click', (e) => {
        const option = e.target.closest('.colour-option');
        if (option) {
          document.querySelectorAll('.colour-option').forEach(o => o.classList.remove('selected'));
          option.classList.add('selected');
          customPicker.value = option.dataset.colour;
          customHex.value = option.dataset.colour;
        }
      });

      customPicker.addEventListener('input', (e) => {
        customHex.value = e.target.value;
        document.querySelectorAll('.colour-option').forEach(o => o.classList.remove('selected'));
      });

      customHex.addEventListener('input', (e) => {
        const hex = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          customPicker.value = hex;
          document.querySelectorAll('.colour-option').forEach(o => {
            o.classList.toggle('selected', o.dataset.colour.toLowerCase() === hex.toLowerCase());
          });
        }
      });
    },
    onSave: async () => {
      const name = document.getElementById('category-name').value.trim();
      const type = document.getElementById('category-type').value;
      const colour = document.getElementById('colour-custom-hex').value;
      const icon = document.getElementById('category-icon').value.trim();

      if (!name) {
        showToast('Please enter a category name', 'error');
        return false;
      }

      if (!/^#[0-9A-Fa-f]{6}$/.test(colour)) {
        showToast('Please enter a valid colour (e.g. #007aff)', 'error');
        return false;
      }

      const data = { name, type, colour, icon };

      try {
        if (isEdit) {
          await api.put(`/categories/${category.id}`, data);
          showToast('Category updated successfully', 'success');
        } else {
          await api.post('/categories', data);
          showToast('Category created successfully', 'success');
        }
        await loadCategories();
        return true;
      } catch (err) {
        showToast(`Failed to save category: ${err.message}`, 'error');
        return false;
      }
    }
  });
}

/**
 * Confirm category deletion
 */
function confirmDeleteCategory(category) {
  showConfirmDialog({
    title: 'Delete Category',
    message: `Are you sure you want to delete <strong>${escapeHtml(category.name)}</strong>?<br><br>This cannot be undone. Categories with existing transactions cannot be deleted.`,
    type: 'danger',
    confirmText: 'Delete',
    onConfirm: async () => {
      try {
        await api.delete(`/categories/${category.id}`);
        showToast('Category deleted successfully', 'success');
        await loadCategories();
      } catch (err) {
        showToast(`Failed to delete category: ${err.message}`, 'error');
      }
    }
  });
}

// ============= CATEGORY RULES SECTION =============

/**
 * Load category rules from API
 */
async function loadCategoryRules() {
  const container = document.getElementById('rules-container');
  try {
    categoryRules = await api.get('/category-rules');
    renderCategoryRules();
  } catch (err) {
    container.innerHTML = `
      <div class="section-error">
        <p>Failed to load rules: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm mt-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

/**
 * Render category rules table
 */
function renderCategoryRules() {
  const container = document.getElementById('rules-container');
  if (!categoryRules.length) {
    container.innerHTML = `
      <div class="section-empty">
        <p>No category rules configured</p>
      </div>
    `;
    return;
  }

  // Sort by priority
  const sortedRules = [...categoryRules].sort((a, b) => (a.priority || 0) - (b.priority || 0));

  container.innerHTML = `
    <table class="rules-table">
      <thead>
        <tr>
          <th>Pattern</th>
          <th>Category</th>
          <th>Priority</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRules.map(rule => {
          const category = categories.find(c => c.id === rule.category_id);
          return `
            <tr>
              <td><span class="rule-pattern">${escapeHtml(rule.pattern)}</span></td>
              <td>
                ${category ? `
                  <span class="category-badge" style="background-color: ${category.colour}20; color: ${category.colour}">
                    ${category.icon || ''} ${escapeHtml(category.name)}
                  </span>
                ` : '<span class="text-tertiary">Unknown</span>'}
              </td>
              <td class="rule-priority">${rule.priority || 0}</td>
              <td class="rule-actions">
                <button class="btn btn-secondary btn-sm rule-edit-btn" data-id="${rule.id}">Edit</button>
                <button class="btn btn-danger btn-sm rule-delete-btn" data-id="${rule.id}">Delete</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Show rule add/edit modal
 */
function showRuleModal(rule = null) {
  const isEdit = rule !== null;
  const title = isEdit ? 'Edit Rule' : 'Add Rule';

  const modal = createModal({
    title,
    content: `
      <form id="rule-form">
        <div class="form-group">
          <label class="form-label">Pattern</label>
          <input type="text" class="form-input" id="rule-pattern"
                 value="${isEdit ? escapeHtml(rule.pattern) : ''}"
                 placeholder="e.g. %TESCO%, %SAINSBURY%" required>
          <small class="text-secondary">Use % as wildcard. Multiple patterns separated by comma.</small>
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="rule-category" required>
            <option value="">Select a category...</option>
            ${categories.map(cat => `
              <option value="${cat.id}" ${isEdit && rule.category_id === cat.id ? 'selected' : ''}>
                ${cat.icon || ''} ${escapeHtml(cat.name)} (${cat.type})
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Priority</label>
          <input type="number" class="form-input" id="rule-priority"
                 value="${isEdit ? (rule.priority || 0) : 0}" min="0" max="100">
          <small class="text-secondary">Lower numbers = higher priority. Rules are matched in priority order.</small>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Save Changes' : 'Add Rule'}</button>
    `,
    onSave: async () => {
      const pattern = document.getElementById('rule-pattern').value.trim();
      const categoryId = parseInt(document.getElementById('rule-category').value);
      const priority = parseInt(document.getElementById('rule-priority').value) || 0;

      if (!pattern) {
        showToast('Please enter a pattern', 'error');
        return false;
      }

      if (!categoryId) {
        showToast('Please select a category', 'error');
        return false;
      }

      const data = { pattern, category_id: categoryId, priority };

      try {
        if (isEdit) {
          await api.put(`/category-rules/${rule.id}`, data);
          showToast('Rule updated successfully', 'success');
        } else {
          await api.post('/category-rules', data);
          showToast('Rule created successfully', 'success');
        }
        await loadCategoryRules();
        return true;
      } catch (err) {
        showToast(`Failed to save rule: ${err.message}`, 'error');
        return false;
      }
    }
  });
}

/**
 * Confirm rule deletion
 */
function confirmDeleteRule(rule) {
  showConfirmDialog({
    title: 'Delete Rule',
    message: `Are you sure you want to delete this rule?<br><br><strong>${escapeHtml(rule.pattern)}</strong>`,
    type: 'warning',
    confirmText: 'Delete',
    onConfirm: async () => {
      try {
        await api.delete(`/category-rules/${rule.id}`);
        showToast('Rule deleted successfully', 'success');
        await loadCategoryRules();
      } catch (err) {
        showToast(`Failed to delete rule: ${err.message}`, 'error');
      }
    }
  });
}

/**
 * Test a pattern against the rules
 */
function testRule() {
  const input = document.getElementById('rule-test-input');
  const resultContainer = document.getElementById('rule-test-result');
  const testValue = input.value.trim().toUpperCase();

  if (!testValue) {
    resultContainer.innerHTML = '';
    return;
  }

  // Find matching rule
  const sortedRules = [...categoryRules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  let matchedRule = null;
  let matchedCategory = null;

  for (const rule of sortedRules) {
    // Convert SQL LIKE pattern to regex
    const patterns = rule.pattern.split(',').map(p => p.trim());
    for (const pattern of patterns) {
      const regexPattern = pattern
        .replace(/%/g, '.*')
        .replace(/_/g, '.');
      const regex = new RegExp(regexPattern, 'i');

      if (regex.test(testValue)) {
        matchedRule = rule;
        matchedCategory = categories.find(c => c.id === rule.category_id);
        break;
      }
    }
    if (matchedRule) break;
  }

  if (matchedRule && matchedCategory) {
    resultContainer.innerHTML = `
      <div class="rule-tester-result match">
        Matches: <strong>${escapeHtml(matchedRule.pattern)}</strong> →
        <span class="category-badge" style="background-color: ${matchedCategory.colour}20; color: ${matchedCategory.colour}">
          ${matchedCategory.icon || ''} ${escapeHtml(matchedCategory.name)}
        </span>
      </div>
    `;
  } else {
    resultContainer.innerHTML = `
      <div class="rule-tester-result no-match">
        No matching rule found for "${escapeHtml(testValue)}"
      </div>
    `;
  }
}

// ============= IMPORT HISTORY SECTION =============

/**
 * Load import batches from API
 */
async function loadImportBatches() {
  const container = document.getElementById('import-container');
  try {
    importBatches = await api.get('/import/batches');
    renderImportBatches();
  } catch (err) {
    container.innerHTML = `
      <div class="section-error">
        <p>Failed to load import history: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm mt-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

/**
 * Render import history table
 */
function renderImportBatches() {
  const container = document.getElementById('import-container');
  if (!importBatches || !importBatches.length) {
    container.innerHTML = `
      <div class="section-empty">
        <p>No imports yet. Import transactions from the Transactions page.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="import-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Filename</th>
          <th>Account</th>
          <th>Rows</th>
          <th>Success</th>
          <th>Errors</th>
        </tr>
      </thead>
      <tbody>
        ${importBatches.map(batch => {
          const account = accounts.find(a => a.id === batch.account_id);
          return `
            <tr class="import-row" data-id="${batch.id}">
              <td>${formatDate(batch.imported_at)}</td>
              <td><span class="import-filename">${escapeHtml(batch.filename || 'Unknown')}</span></td>
              <td>${account ? escapeHtml(account.account_name) : 'Unknown'}</td>
              <td class="import-count">${batch.row_count || 0}</td>
              <td class="import-count success">${batch.success_count || batch.row_count || 0}</td>
              <td class="import-count ${batch.error_count > 0 ? 'error' : ''}">${batch.error_count || 0}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Show import batch details modal
 */
function showImportDetails(batchId) {
  const batch = importBatches.find(b => b.id === batchId);
  if (!batch) return;

  const account = accounts.find(a => a.id === batch.account_id);

  createModal({
    title: 'Import Details',
    content: `
      <div class="form-group">
        <label class="form-label">Date</label>
        <p>${formatDate(batch.imported_at)}</p>
      </div>
      <div class="form-group">
        <label class="form-label">Filename</label>
        <p><code>${escapeHtml(batch.filename || 'Unknown')}</code></p>
      </div>
      <div class="form-group">
        <label class="form-label">Account</label>
        <p>${account ? escapeHtml(account.account_name) : 'Unknown'}</p>
      </div>
      <div class="form-group">
        <label class="form-label">Statistics</label>
        <div class="account-details" style="margin-top: var(--space-sm)">
          <span class="account-detail-label">Total Rows:</span>
          <span class="account-detail-value">${batch.row_count || 0}</span>
          <span class="account-detail-label">Imported:</span>
          <span class="account-detail-value amount-positive">${batch.success_count || batch.row_count || 0}</span>
          <span class="account-detail-label">Duplicates:</span>
          <span class="account-detail-value">${batch.duplicate_count || 0}</span>
          <span class="account-detail-label">Errors:</span>
          <span class="account-detail-value ${batch.error_count > 0 ? 'amount-negative' : ''}">${batch.error_count || 0}</span>
        </div>
      </div>
      ${batch.errors && batch.errors.length > 0 ? `
        <div class="form-group">
          <label class="form-label">Errors</label>
          <div class="section-error" style="padding: var(--space-sm)">
            ${batch.errors.map(err => `<p>${escapeHtml(err)}</p>`).join('')}
          </div>
        </div>
      ` : ''}
    `,
    footer: `
      <button class="btn btn-primary" id="modal-cancel">Close</button>
    `
  });
}

// ============= RECURRING TRANSACTIONS SECTION =============

/**
 * Load recurring patterns from API
 */
async function loadRecurringPatterns() {
  const container = document.getElementById('recurring-container');
  try {
    recurringPatterns = await api.get('/recurring');
    renderRecurringPatterns();
  } catch (err) {
    container.innerHTML = `
      <div class="section-error">
        <p>Failed to load recurring patterns: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm mt-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

/**
 * Render recurring patterns list
 */
function renderRecurringPatterns() {
  const container = document.getElementById('recurring-container');
  if (!recurringPatterns || !recurringPatterns.length) {
    container.innerHTML = `
      <div class="section-empty">
        <p>No recurring transactions configured yet. Click "Detect Patterns" to find recurring payments.</p>
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

  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Run recurring pattern detection
 */
async function runRecurringDetection() {
  const btn = document.getElementById('detect-recurring-btn');
  const container = document.getElementById('detected-patterns-container');
  const listContainer = document.getElementById('detected-patterns-list');

  btn.disabled = true;
  btn.textContent = 'Detecting...';

  try {
    const result = await api.post('/recurring/detect', {});
    detectedPatterns = result;

    if (detectedPatterns.length === 0) {
      showToast('No new recurring patterns detected', 'info');
      container.style.display = 'none';
    } else {
      renderDetectedPatterns();
      container.style.display = 'block';
      showToast(`Found ${detectedPatterns.length} potential recurring pattern(s)`, 'success');
    }
  } catch (err) {
    showToast(`Detection failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Detect Patterns';
  }
}

/**
 * Render detected patterns for review
 */
function renderDetectedPatterns() {
  const container = document.getElementById('detected-patterns-list');
  if (!detectedPatterns.length) {
    container.innerHTML = '<p class="text-secondary">No patterns to review.</p>';
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

  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Confirm a detected pattern (save it to the database)
 */
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

    // Remove from detected list
    detectedPatterns.splice(index, 1);
    renderDetectedPatterns();

    // Reload confirmed patterns
    await loadRecurringPatterns();

    // Hide detected container if empty
    if (detectedPatterns.length === 0) {
      document.getElementById('detected-patterns-container').style.display = 'none';
    }
  } catch (err) {
    showToast(`Failed to confirm pattern: ${err.message}`, 'error');
  }
}

/**
 * Reject a detected pattern (just remove from the list)
 */
function rejectDetectedPattern(index) {
  detectedPatterns.splice(index, 1);
  renderDetectedPatterns();

  if (detectedPatterns.length === 0) {
    document.getElementById('detected-patterns-container').style.display = 'none';
  }
}

/**
 * Show recurring pattern add/edit modal
 */
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

/**
 * Confirm deletion of a recurring pattern
 */
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

/**
 * Capitalize first letter of string
 */
function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============= MODAL UTILITIES =============

/**
 * Create and show a modal
 */
function createModal({ title, content, footer, onMount, onSave }) {
  // Remove any existing modal
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

  // Close handlers
  const closeModal = () => overlay.remove();

  const closeX = overlay.querySelector('#modal-close-x');
  if (closeX) closeX.addEventListener('click', closeModal);

  const cancelBtn = overlay.querySelector('#modal-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Escape key to close
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Save handler
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

  // Run onMount callback
  if (onMount) onMount();

  // Focus first input
  const firstInput = overlay.querySelector('input:not([disabled]), select:not([disabled])');
  if (firstInput) firstInput.focus();

  return overlay;
}

/**
 * Show a confirmation dialog
 */
function showConfirmDialog({ title, message, type = 'warning', confirmText = 'Confirm', onConfirm }) {
  const iconMap = {
    warning: '⚠️',
    danger: '🗑️',
    info: 'ℹ️'
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

// ============= TOAST NOTIFICATIONS =============

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  const container = document.querySelector('.toast-container');
  if (!container) return;

  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || iconMap.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  container.appendChild(toast);

  // Close button
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => toast.remove());

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

// ============= USER MANAGEMENT SECTION =============

/**
 * Handle password change form submission
 */
async function handleChangePassword(e) {
  e.preventDefault();

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const errorDiv = document.getElementById('password-error');
  const submitBtn = document.getElementById('change-password-btn');

  // Clear previous error
  errorDiv.style.display = 'none';

  // Validate
  if (newPassword.length < 8) {
    errorDiv.textContent = 'New password must be at least 8 characters';
    errorDiv.style.display = 'block';
    return;
  }

  if (newPassword !== confirmPassword) {
    errorDiv.textContent = 'New passwords do not match';
    errorDiv.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Changing...';

  const result = await auth.changePassword(currentPassword, newPassword);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Change Password';

  if (result.success) {
    showToast('Password changed successfully', 'success');
    // Clear form
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
  } else {
    errorDiv.textContent = result.error || 'Failed to change password';
    errorDiv.style.display = 'block';
  }
}

/**
 * Load login history
 */
async function loadLoginHistory() {
  const container = document.getElementById('login-history-container');
  if (!container) return;

  try {
    const history = await auth.getLoginHistory(20);
    renderLoginHistory(history);
  } catch (err) {
    container.innerHTML = `
      <div class="section-error">
        <p>Failed to load login history: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Render login history table
 */
function renderLoginHistory(history) {
  const container = document.getElementById('login-history-container');
  if (!history || !history.length) {
    container.innerHTML = `
      <div class="section-empty">
        <p>No login history available</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="login-history-table">
      <thead>
        <tr>
          <th>Date & Time</th>
          <th>Status</th>
          <th>IP Address</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${history.map(entry => `
          <tr class="${entry.success ? 'success' : 'failed'}">
            <td>${formatDate(entry.timestamp)}</td>
            <td>
              <span class="login-status ${entry.success ? 'success' : 'failed'}">
                ${entry.success ? '✓ Success' : '✕ Failed'}
              </span>
            </td>
            <td><code>${escapeHtml(entry.ip_address || 'Unknown')}</code></td>
            <td>${entry.failure_reason ? escapeHtml(entry.failure_reason) : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Load active sessions
 */
async function loadActiveSessions() {
  const container = document.getElementById('sessions-container');
  if (!container) return;

  try {
    const sessions = await auth.getActiveSessions();
    renderActiveSessions(sessions);
  } catch (err) {
    container.innerHTML = `
      <div class="section-error">
        <p>Failed to load sessions: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Render active sessions list
 */
function renderActiveSessions(sessions) {
  const container = document.getElementById('sessions-container');
  if (!sessions || !sessions.length) {
    container.innerHTML = `
      <div class="section-empty">
        <p>No active sessions</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'session-item';
    item.innerHTML = `
      <div class="session-info">
        <div class="session-device">
          ${getDeviceIcon(session.user_agent)} ${getDeviceName(session.user_agent)}
        </div>
        <div class="session-details">
          <span>IP: <code>${escapeHtml(session.ip_address || 'Unknown')}</code></span>
          <span>Last active: ${formatDate(session.last_activity)}</span>
        </div>
      </div>
      <button class="btn btn-danger btn-sm session-revoke-btn" data-id="${session.id}">Revoke</button>
    `;

    // Add revoke handler
    const revokeBtn = item.querySelector('.session-revoke-btn');
    revokeBtn.addEventListener('click', async () => {
      revokeBtn.disabled = true;
      const success = await auth.revokeSession(session.id);
      if (success) {
        showToast('Session revoked', 'success');
        await loadActiveSessions();
      } else {
        showToast('Failed to revoke session', 'error');
        revokeBtn.disabled = false;
      }
    });

    fragment.appendChild(item);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Get device icon from user agent
 */
function getDeviceIcon(userAgent) {
  if (!userAgent) return '💻';
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return '📱';
  if (ua.includes('tablet') || ua.includes('ipad')) return '📱';
  if (ua.includes('mac')) return '🖥️';
  if (ua.includes('windows')) return '💻';
  if (ua.includes('linux')) return '🐧';
  return '💻';
}

/**
 * Get device name from user agent
 */
function getDeviceName(userAgent) {
  if (!userAgent) return 'Unknown Device';
  const ua = userAgent.toLowerCase();

  // Browser detection
  let browser = 'Unknown Browser';
  if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';

  // OS detection
  let os = '';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  return os ? `${browser} on ${os}` : browser;
}

// ============= PROFILE SECTION =============

/**
 * Load user email
 */
async function loadUserEmail() {
  try {
    const response = await api.get('/auth/email');
    userEmail = response.email || '';
    const emailInput = document.getElementById('user-email');
    if (emailInput) {
      emailInput.value = userEmail;
    }
  } catch (err) {
    console.error('Failed to load email:', err);
  }
}

/**
 * Handle save email form submission
 */
async function handleSaveEmail(e) {
  e.preventDefault();

  const emailInput = document.getElementById('user-email');
  const errorDiv = document.getElementById('email-error');
  const successDiv = document.getElementById('email-success');
  const submitBtn = document.getElementById('save-email-btn');
  const email = emailInput.value.trim();

  // Clear previous messages
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';

  if (!email) {
    errorDiv.textContent = 'Please enter an email address';
    errorDiv.style.display = 'block';
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errorDiv.textContent = 'Please enter a valid email address';
    errorDiv.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    await api.put('/auth/email', { email });
    userEmail = email;
    successDiv.textContent = 'Email saved successfully';
    successDiv.style.display = 'block';
    showToast('Email updated successfully', 'success');
  } catch (err) {
    errorDiv.textContent = err.message || 'Failed to save email';
    errorDiv.style.display = 'block';
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Save Email';
}

// ============= SUBSCRIPTION SECTION =============

/**
 * Load billing configuration
 */
async function loadBillingConfig() {
  try {
    const response = await api.get('/billing/config');
    billingConfig = response;
  } catch (err) {
    console.error('Failed to load billing config:', err);
    billingConfig = { configured: false };
  }
}

/**
 * Load subscription status
 */
async function loadSubscriptionStatus() {
  try {
    const response = await api.get('/billing/status');
    subscriptionStatus = response.subscription;
    renderSubscription();
  } catch (err) {
    console.error('Failed to load subscription status:', err);
    subscriptionStatus = { plan: 'free', isActive: false, isPro: false };
    renderSubscription();
  }
}

/**
 * Render subscription section
 */
function renderSubscription() {
  const container = document.getElementById('subscription-container');
  if (!container) return;

  if (!billingConfig || !billingConfig.configured) {
    container.innerHTML = `
      <div class="subscription-card">
        <div class="subscription-plan">
          <span class="subscription-plan-name">Free Plan</span>
          <span class="subscription-plan-badge free">Current Plan</span>
        </div>
        <p class="subscription-description">
          You're currently on the free plan with basic features.
        </p>
        <div class="subscription-note">
          <p>Premium subscriptions are not yet available. All features are currently free!</p>
        </div>
      </div>
    `;
    return;
  }

  const isPro = subscriptionStatus?.isPro;
  const isCanceled = subscriptionStatus?.cancelAtPeriodEnd;
  const periodEnd = subscriptionStatus?.currentPeriodEnd;

  if (isPro) {
    container.innerHTML = `
      <div class="subscription-card pro">
        <div class="subscription-plan">
          <span class="subscription-plan-name">Pro Plan</span>
          <span class="subscription-plan-badge pro">Active</span>
          ${isCanceled ? '<span class="subscription-plan-badge canceled">Cancels at period end</span>' : ''}
        </div>
        <div class="subscription-price">
          <span class="subscription-amount">${billingConfig.plans.pro.price.toFixed(2)}</span>
          <span class="subscription-interval">/ ${billingConfig.plans.pro.interval}</span>
        </div>
        ${periodEnd ? `
          <p class="subscription-period">
            ${isCanceled ? 'Access until' : 'Next billing date'}: ${formatDate(periodEnd)}
          </p>
        ` : ''}
        <div class="subscription-features">
          <h4>Your Pro features:</h4>
          <ul>
            ${billingConfig.plans.pro.features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
          </ul>
        </div>
        <div class="subscription-actions">
          ${isCanceled ? `
            <button class="btn btn-primary" id="resume-subscription-btn">Resume Subscription</button>
          ` : `
            <button class="btn btn-secondary" id="manage-subscription-btn">Manage Subscription</button>
            <button class="btn btn-danger" id="cancel-subscription-btn">Cancel Subscription</button>
          `}
        </div>
      </div>
    `;

    // Attach event listeners
    const manageBtn = container.querySelector('#manage-subscription-btn');
    if (manageBtn) {
      manageBtn.addEventListener('click', handleManageSubscription);
    }

    const cancelBtn = container.querySelector('#cancel-subscription-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', handleCancelSubscription);
    }

    const resumeBtn = container.querySelector('#resume-subscription-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', handleResumeSubscription);
    }
  } else {
    // Free plan
    container.innerHTML = `
      <div class="subscription-card">
        <div class="subscription-plan">
          <span class="subscription-plan-name">Free Plan</span>
          <span class="subscription-plan-badge free">Current Plan</span>
        </div>
        <p class="subscription-description">
          Upgrade to Pro to unlock all features
        </p>
        <div class="subscription-comparison">
          <div class="plan-column free">
            <h4>Free</h4>
            <ul>
              ${billingConfig.plans.free.features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
            </ul>
          </div>
          <div class="plan-column pro">
            <h4>Pro - ${billingConfig.plans.pro.price.toFixed(2)}/month</h4>
            <ul>
              ${billingConfig.plans.pro.features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
            </ul>
          </div>
        </div>
        <div class="subscription-actions">
          <button class="btn btn-primary btn-lg" id="upgrade-btn">Upgrade to Pro</button>
        </div>
      </div>
    `;

    // Attach upgrade button listener
    const upgradeBtn = container.querySelector('#upgrade-btn');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', handleUpgrade);
    }
  }
}

/**
 * Handle upgrade to Pro
 */
async function handleUpgrade() {
  const upgradeBtn = document.getElementById('upgrade-btn');
  if (!upgradeBtn) return;

  // Check if user has email set
  if (!userEmail) {
    showToast('Please set your email address before upgrading', 'warning');
    const emailInput = document.getElementById('user-email');
    if (emailInput) emailInput.focus();
    return;
  }

  upgradeBtn.disabled = true;
  upgradeBtn.textContent = 'Loading...';

  try {
    const response = await api.post('/billing/checkout', {});
    if (response.url) {
      window.location.href = response.url;
    }
  } catch (err) {
    showToast(err.message || 'Failed to start checkout', 'error');
    upgradeBtn.disabled = false;
    upgradeBtn.textContent = 'Upgrade to Pro';
  }
}

/**
 * Handle manage subscription (open Stripe portal)
 */
async function handleManageSubscription() {
  const manageBtn = document.getElementById('manage-subscription-btn');
  if (!manageBtn) return;

  manageBtn.disabled = true;
  manageBtn.textContent = 'Loading...';

  try {
    const response = await api.post('/billing/portal', {});
    if (response.url) {
      window.location.href = response.url;
    }
  } catch (err) {
    showToast(err.message || 'Failed to open billing portal', 'error');
    manageBtn.disabled = false;
    manageBtn.textContent = 'Manage Subscription';
  }
}

/**
 * Handle cancel subscription
 */
async function handleCancelSubscription() {
  showConfirmDialog({
    title: 'Cancel Subscription',
    message: 'Are you sure you want to cancel your Pro subscription?<br><br>You will continue to have access until the end of your current billing period.',
    type: 'warning',
    confirmText: 'Cancel Subscription',
    onConfirm: async () => {
      try {
        await api.post('/billing/cancel', {});
        showToast('Subscription will be canceled at the end of the billing period', 'success');
        await loadSubscriptionStatus();
      } catch (err) {
        showToast(err.message || 'Failed to cancel subscription', 'error');
      }
    }
  });
}

/**
 * Handle resume subscription
 */
async function handleResumeSubscription() {
  const resumeBtn = document.getElementById('resume-subscription-btn');
  if (!resumeBtn) return;

  resumeBtn.disabled = true;
  resumeBtn.textContent = 'Resuming...';

  try {
    await api.post('/billing/resume', {});
    showToast('Subscription resumed successfully', 'success');
    await loadSubscriptionStatus();
  } catch (err) {
    showToast(err.message || 'Failed to resume subscription', 'error');
    resumeBtn.disabled = false;
    resumeBtn.textContent = 'Resume Subscription';
  }
}
