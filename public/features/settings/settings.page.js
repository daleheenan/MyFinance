/**
 * Settings Page Module
 * Manages accounts, categories, category rules, and import history
 */

import { api } from '../../core/api.js';
import { escapeHtml, formatCurrency, formatDate } from '../../core/utils.js';

// Private state
let container = null;
let cleanupFunctions = [];

// Data state
let accounts = [];
let categories = [];
let categoryRules = [];
let importBatches = [];
let recurringPatterns = [];
let detectedPatterns = [];

// Predefined colours for category colour picker
const PRESET_COLOURS = [
  '#34c759', '#ff3b30', '#007aff', '#ff9500', '#af52de',
  '#5ac8fa', '#ff2d55', '#32ade6', '#ff6482', '#8e8e93',
  '#636366', '#00c7be', '#30d158', '#ff453a', '#0a84ff'
];

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

  render();
  attachEventListeners();
  loadAllData();
}

/**
 * Unmount the page and cleanup resources
 */
export function unmount() {
  // Run all cleanup functions
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];

  // Remove toast container if exists
  const toastContainer = document.querySelector('.toast-container');
  if (toastContainer) {
    toastContainer.remove();
  }

  // Remove any open modals
  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(modal => modal.remove());

  // Clear container reference
  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

/**
 * Render the page content
 */
function render() {
  container.innerHTML = `
    <div class="page settings-page">
      <header class="page-header">
        <h1>Settings</h1>
        <p>Manage your accounts, categories, and preferences</p>
      </header>

      <!-- Accounts Section -->
      <section class="settings-section" id="accounts-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Accounts</h2>
            <p class="settings-section-description">Manage your bank accounts and their details</p>
          </div>
        </div>
        <div id="accounts-container" class="accounts-grid">
          <div class="section-loading">
            <div class="spinner"></div>
          </div>
        </div>
      </section>

      <!-- Categories Section -->
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

      <!-- Category Rules Section -->
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

      <!-- Recurring Transactions Section -->
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

      <!-- Import History Section -->
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

      <!-- Data Export Section -->
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
}

/**
 * Handle delegated click events
 */
function handleDelegatedClick(e) {
  const target = e.target;

  // Account edit button
  if (target.closest('.account-edit-btn')) {
    const accountId = parseInt(target.closest('.account-edit-btn').dataset.id);
    const account = accounts.find(a => a.id === accountId);
    if (account) showAccountModal(account);
    return;
  }

  // Category edit button
  if (target.closest('.category-edit-btn')) {
    const categoryId = parseInt(target.closest('.category-edit-btn').dataset.id);
    const category = categories.find(c => c.id === categoryId);
    if (category) showCategoryModal(category);
    return;
  }

  // Category delete button
  if (target.closest('.category-delete-btn')) {
    const categoryId = parseInt(target.closest('.category-delete-btn').dataset.id);
    const category = categories.find(c => c.id === categoryId);
    if (category) confirmDeleteCategory(category);
    return;
  }

  // Rule edit button
  if (target.closest('.rule-edit-btn')) {
    const ruleId = parseInt(target.closest('.rule-edit-btn').dataset.id);
    const rule = categoryRules.find(r => r.id === ruleId);
    if (rule) showRuleModal(rule);
    return;
  }

  // Rule delete button
  if (target.closest('.rule-delete-btn')) {
    const ruleId = parseInt(target.closest('.rule-delete-btn').dataset.id);
    const rule = categoryRules.find(r => r.id === ruleId);
    if (rule) confirmDeleteRule(rule);
    return;
  }

  // Recurring pattern edit button
  if (target.closest('.recurring-edit-btn')) {
    const patternId = parseInt(target.closest('.recurring-edit-btn').dataset.id);
    const pattern = recurringPatterns.find(p => p.id === patternId);
    if (pattern) showRecurringModal(pattern);
    return;
  }

  // Recurring pattern delete button
  if (target.closest('.recurring-delete-btn')) {
    const patternId = parseInt(target.closest('.recurring-delete-btn').dataset.id);
    const pattern = recurringPatterns.find(p => p.id === patternId);
    if (pattern) confirmDeleteRecurring(pattern);
    return;
  }

  // Confirm detected pattern button
  if (target.closest('.confirm-pattern-btn')) {
    const index = parseInt(target.closest('.confirm-pattern-btn').dataset.index);
    const pattern = detectedPatterns[index];
    if (pattern) confirmDetectedPattern(pattern, index);
    return;
  }

  // Reject detected pattern button
  if (target.closest('.reject-pattern-btn')) {
    const index = parseInt(target.closest('.reject-pattern-btn').dataset.index);
    rejectDetectedPattern(index);
    return;
  }

  // Import row click
  if (target.closest('.import-row')) {
    const batchId = parseInt(target.closest('.import-row').dataset.id);
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
    loadRecurringPatterns()
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

  const fragment = document.createDocumentFragment();
  accounts.forEach(account => {
    const card = document.createElement('div');
    card.className = 'account-card';
    card.innerHTML = `
      <div class="account-card-header">
        <div class="account-name">${escapeHtml(account.account_name)}</div>
        <span class="account-type-badge ${account.account_type}">${account.account_type}</span>
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
      </div>
    `;
    fragment.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Show account edit modal
 */
function showAccountModal(account) {
  const accountName = account.account_name || '';
  const openingBalance = account.opening_balance || 0;
  const accountNumber = account.account_number || '';

  const modal = createModal({
    title: 'Edit Account',
    content: `
      <form id="account-form" class="account-edit-form">
        <div class="form-group">
          <label class="form-label" for="account-name">Account Name</label>
          <input type="text" class="form-input" id="account-name"
                 value="${escapeHtml(accountName)}" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="account-number">Account Number</label>
          <input type="text" class="form-input" id="account-number"
                 value="${escapeHtml(accountNumber)}">
        </div>
        <div class="form-group">
          <label class="form-label" for="account-balance">Opening Balance</label>
          <input type="number" class="form-input" id="account-balance"
                 value="${openingBalance}" step="0.01">
        </div>
        <div class="form-group" style="margin-top: var(--space-lg); padding-top: var(--space-md); border-top: var(--border-light);">
          <label class="form-label">Danger Zone</label>
          <p class="text-secondary" style="margin-bottom: var(--space-sm); font-size: var(--text-sm);">
            Clear all transactions from this account. This cannot be undone.
          </p>
          <button type="button" class="btn btn-danger btn-sm" id="clear-transactions-btn">
            Clear All Transactions
          </button>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="modal-save">Save Changes</button>
    `,
    onMount: () => {
      // Add clear transactions button handler
      const clearBtn = document.getElementById('clear-transactions-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          confirmClearTransactions(account);
        });
      }
    },
    onSave: async () => {
      const name = document.getElementById('account-name').value.trim();
      const accountNum = document.getElementById('account-number').value.trim();
      const balance = parseFloat(document.getElementById('account-balance').value) || 0;

      if (!name) {
        showToast('Please enter an account name', 'error');
        return false;
      }

      try {
        await api.put(`/accounts/${account.id}`, {
          account_name: name,
          account_number: accountNum,
          opening_balance: balance
        });
        showToast('Account updated successfully', 'success');
        await loadAccounts();
        return true;
      } catch (err) {
        showToast(`Failed to update account: ${err.message}`, 'error');
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
