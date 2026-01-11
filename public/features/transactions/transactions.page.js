/**
 * Transactions Page Module
 * List and manage transactions with filtering, inline editing, and CSV import
 */

import { api } from '../../core/api.js';
import { formatCurrency, formatDate, escapeHtml, debounce } from '../../core/utils.js';
import { router } from '../../core/app.js';
import { showError } from '../../core/toast.js';

const DEFAULT_ICONS = {
  salary: '💰', income: '💰', wages: '💰',
  bills: '📄', utilities: '💡',
  groceries: '🛒', food: '🛒', supermarket: '🛒',
  shopping: '🛍️', retail: '🛍️',
  entertainment: '🎬', streaming: '🎬',
  transport: '🚗', travel: '✈️', fuel: '⛽',
  dining: '🍽️', restaurant: '🍽️', cafe: '☕', coffee: '☕',
  healthcare: '⚕️', medical: '⚕️', pharmacy: '💊',
  transfer: '↔️',
  other: '📌',
  banking: '🏦', bank: '🏦', finance: '💳',
  political: '🗳️',
  dog: '🐕', pet: '🐾',
  house: '🏠', home: '🏠', rent: '🏠', mortgage: '🏠',
  cleaner: '🧹', cleaning: '🧹',
  ai: '🤖', tech: '💻', software: '💻',
  tv: '📺', television: '📺',
  subscription: '📅', subscriptions: '📅'
};

/**
 * Get default icon for a category name
 * @param {string} name - Category name
 * @returns {string} Emoji icon
 */
function getDefaultIcon(name) {
  const lowerName = (name || '').toLowerCase();

  // Check for exact match first
  if (DEFAULT_ICONS[lowerName]) {
    return DEFAULT_ICONS[lowerName];
  }

  // Check if any key is contained in the name
  for (const [key, icon] of Object.entries(DEFAULT_ICONS)) {
    if (lowerName.includes(key)) {
      return icon;
    }
  }

  // Default fallback
  return '📁';
}

let container = null;
let cleanupFunctions = [];

let accounts = [];
let categories = [];
let transactions = [];
let pagination = { page: 1, limit: 50, total: 0, pages: 0 };

let filters = {
  accountId: null,
  startDate: '',
  endDate: '',
  categoryId: '',
  search: ''
};

let expandedRowId = null;
let editingCell = null;
let isLoading = false;
let scrollPosition = 0;

// Multi-select mode state
let isSelectMode = false;
let selectedTransactionIds = new Set();

function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

export function mount(el, params) {
  container = el;
  cleanupFunctions = [];

  // Reset state
  transactions = [];
  expandedRowId = null;
  editingCell = null;
  isLoading = false;
  scrollPosition = 0;
  isSelectMode = false;
  selectedTransactionIds = new Set();

  // Parse route params
  filters.accountId = params.get('account') || null;
  pagination.page = parseInt(params.get('page'), 10) || 1;
  filters.startDate = params.get('start_date') || '';
  filters.endDate = params.get('end_date') || '';
  filters.categoryId = params.get('category') || '';
  filters.search = params.get('search') || '';
  const shouldOpenImport = params.get('import') === '1';

  render();
  loadInitialData().then(() => {
    // Auto-open import modal if requested via query param
    if (shouldOpenImport) {
      openImportModal();
      // Clear the import param from URL to prevent re-opening on refresh
      const newHash = window.location.hash.replace(/[?&]import=1/, '');
      if (newHash !== window.location.hash) {
        history.replaceState(null, '', newHash);
      }
    }
  });
}

export function unmount() {
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];

  if (container) {
    container.innerHTML = '';
    container = null;
  }

  accounts = [];
  categories = [];
  transactions = [];
  expandedRowId = null;
  editingCell = null;
  isSelectMode = false;
  selectedTransactionIds = new Set();
}

function render() {
  container.innerHTML = `
    <div class="page transactions-page">
      <div class="card account-selector-card">
        <div class="account-selector">
          <label for="account-select" class="form-label">Account</label>
          <select id="account-select" class="form-select">
            <option value="">Loading accounts...</option>
          </select>
        </div>
      </div>

      <div class="card filters-card">
        <div class="filters-bar">
          <div class="filter-group">
            <label for="filter-start-date" class="form-label">From</label>
            <input type="date" id="filter-start-date" class="form-input" value="${filters.startDate}">
          </div>
          <div class="filter-group">
            <label for="filter-end-date" class="form-label">To</label>
            <input type="date" id="filter-end-date" class="form-input" value="${filters.endDate}">
          </div>
          <div class="filter-group">
            <label for="filter-category" class="form-label">Category</label>
            <select id="filter-category" class="form-select">
              <option value="">All Categories</option>
            </select>
          </div>
          <div class="filter-group filter-search">
            <label for="filter-search" class="form-label">Search</label>
            <input type="text" id="filter-search" class="form-input" placeholder="Search description..." value="${escapeHtml(filters.search)}">
          </div>
          <div class="filter-group filter-actions">
            <button type="button" id="apply-filters-btn" class="btn btn-primary">Apply</button>
            <button type="button" id="clear-filters-btn" class="btn btn-secondary">
              Clear
              <span id="active-filter-badge" class="filter-badge hidden">0</span>
            </button>
            <button type="button" id="select-mode-btn" class="btn btn-secondary" title="Select multiple transactions">Select</button>
          </div>
        </div>
      </div>

      <div id="bulk-action-bar" class="bulk-action-bar hidden">
        <div class="bulk-action-info">
          <span id="bulk-selected-count">0</span> selected
        </div>
        <div class="bulk-action-buttons">
          <button type="button" id="bulk-select-all-btn" class="btn btn-secondary btn-sm">Select All</button>
          <button type="button" id="bulk-categorize-btn" class="btn btn-primary btn-sm">Categorize</button>
          <button type="button" id="bulk-cancel-btn" class="btn btn-secondary btn-sm">Cancel</button>
        </div>
      </div>

      <div class="card transactions-table-card">
        <div id="transactions-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading transactions...</p>
          </div>
        </div>
      </div>

      <div class="card pagination-card">
        <div id="pagination-container" class="pagination-controls"></div>
      </div>

      
      <div id="import-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="import-modal-title">Import CSV</h2>
            <button type="button" class="modal-close" id="import-modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <div id="import-step-upload" class="import-step">
              <div class="form-group">
                <label for="import-account" class="form-label">Import to Account</label>
                <select id="import-account" class="form-select">
                  <option value="">Select account...</option>
                </select>
              </div>
              <div class="form-group">
                <label for="import-file" class="form-label">CSV File</label>
                <input type="file" id="import-file" class="form-input" accept=".csv">
              </div>
              <button type="button" id="import-preview-btn" class="btn btn-primary" disabled>
                Preview Import
              </button>
            </div>
            <div id="import-step-preview" class="import-step hidden">
              <div id="import-preview-container"></div>
              <div class="import-actions">
                <button type="button" id="import-back-btn" class="btn btn-secondary">Back</button>
                <button type="button" id="import-confirm-btn" class="btn btn-primary">Confirm Import</button>
              </div>
            </div>
            <div id="import-step-result" class="import-step hidden">
              <div id="import-result-container"></div>
              <button type="button" id="import-done-btn" class="btn btn-primary">Done</button>
            </div>
          </div>
        </div>
      </div>

      <div id="category-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        <div class="modal-backdrop"></div>
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h2 id="category-modal-title">Select Category</h2>
            <button type="button" class="modal-close" id="category-modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <div id="category-picker-list" class="category-picker"></div>
            <div id="similar-transactions-section" class="similar-section hidden">
              <div class="similar-header">
                <label class="checkbox-label">
                  <input type="checkbox" id="apply-to-similar-checkbox" checked>
                  <span id="similar-count-label">Apply to similar transactions</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="delete-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <div class="modal-backdrop"></div>
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h2 id="delete-modal-title">Delete Transaction</h2>
            <button type="button" class="modal-close" id="delete-modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete this transaction?</p>
            <p id="delete-transaction-desc" class="text-secondary"></p>
          </div>
          <div class="modal-footer">
            <button type="button" id="delete-cancel-btn" class="btn btn-secondary">Cancel</button>
            <button type="button" id="delete-confirm-btn" class="btn btn-danger">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;

  attachEventListeners();
}

function attachEventListeners() {
  const accountSelect = container.querySelector('#account-select');
  const accountHandler = (e) => {
    filters.accountId = e.target.value || null;
    pagination.page = 1;
    updateUrl();
    loadTransactions();
  };
  accountSelect.addEventListener('change', accountHandler);
  onCleanup(() => accountSelect.removeEventListener('change', accountHandler));

  const startDateInput = container.querySelector('#filter-start-date');
  const endDateInput = container.querySelector('#filter-end-date');
  const categorySelect = container.querySelector('#filter-category');
  const searchInput = container.querySelector('#filter-search');

  const startDateHandler = (e) => { filters.startDate = e.target.value; };
  const endDateHandler = (e) => { filters.endDate = e.target.value; };
  startDateInput.addEventListener('change', startDateHandler);
  endDateInput.addEventListener('change', endDateHandler);
  onCleanup(() => startDateInput.removeEventListener('change', startDateHandler));
  onCleanup(() => endDateInput.removeEventListener('change', endDateHandler));

  const categoryHandler = (e) => { filters.categoryId = e.target.value; };
  categorySelect.addEventListener('change', categoryHandler);
  onCleanup(() => categorySelect.removeEventListener('change', categoryHandler));

  const debouncedSearch = debounce((value) => {
    filters.search = value;
  }, 300);
  const searchHandler = (e) => debouncedSearch(e.target.value);
  searchInput.addEventListener('input', searchHandler);
  onCleanup(() => searchInput.removeEventListener('input', searchHandler));

  const applyBtn = container.querySelector('#apply-filters-btn');
  const applyHandler = () => {
    pagination.page = 1;
    updateUrl();
    loadTransactions();
  };
  applyBtn.addEventListener('click', applyHandler);
  onCleanup(() => applyBtn.removeEventListener('click', applyHandler));

  const clearBtn = container.querySelector('#clear-filters-btn');
  const clearHandler = () => {
    filters.startDate = '';
    filters.endDate = '';
    filters.categoryId = '';
    filters.search = '';
    startDateInput.value = '';
    endDateInput.value = '';
    categorySelect.value = '';
    searchInput.value = '';
    pagination.page = 1;
    updateUrl();
    loadTransactions();
  };
  clearBtn.addEventListener('click', clearHandler);
  onCleanup(() => clearBtn.removeEventListener('click', clearHandler));

  const txnContainer = container.querySelector('#transactions-container');
  const tableHandler = (e) => handleTableClick(e);
  txnContainer.addEventListener('click', tableHandler);
  onCleanup(() => txnContainer.removeEventListener('click', tableHandler));

  const paginationContainer = container.querySelector('#pagination-container');
  const paginationHandler = (e) => handlePaginationClick(e);
  const paginationKeypressHandler = (e) => handlePaginationKeypress(e);
  paginationContainer.addEventListener('click', paginationHandler);
  paginationContainer.addEventListener('keypress', paginationKeypressHandler);
  onCleanup(() => paginationContainer.removeEventListener('click', paginationHandler));
  onCleanup(() => paginationContainer.removeEventListener('keypress', paginationKeypressHandler));

  // Import modal events
  setupImportModalEvents();

  // Category modal events
  setupCategoryModalEvents();

  // Delete modal events
  setupDeleteModalEvents();

  // Select mode events
  setupSelectModeEvents();

  // Global Escape key handler for modals
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      // Close any open modal
      const importModal = container.querySelector('#import-modal');
      const categoryModal = container.querySelector('#category-modal');
      const deleteModal = container.querySelector('#delete-modal');

      if (!importModal.classList.contains('hidden')) {
        importModal.classList.add('hidden');
        importPreviewData = null;
      } else if (!categoryModal.classList.contains('hidden')) {
        categoryModal.classList.add('hidden');
        categoryPickerTxnId = null;
      } else if (!deleteModal.classList.contains('hidden')) {
        deleteModal.classList.add('hidden');
        deleteTransactionId = null;
      }
    }
  };
  document.addEventListener('keydown', escapeHandler);
  onCleanup(() => document.removeEventListener('keydown', escapeHandler));
}

/**
 * Load initial data (accounts and categories)
 */
async function loadInitialData() {
  try {
    // Load accounts and categories in parallel
    const [accountsData, categoriesData] = await Promise.all([
      api.get('/accounts'),
      api.get('/categories')
    ]);

    accounts = accountsData;
    categories = categoriesData;

    // Populate account selector
    populateAccountSelector();
    populateCategoryFilter();
    populateImportAccountSelector();

    // Set default account if none selected
    if (!filters.accountId && accounts.length > 0) {
      filters.accountId = accounts[0].id.toString();
      container.querySelector('#account-select').value = filters.accountId;
    }

    // Load transactions
    await loadTransactions();

    // Update filter badge on initial load
    updateFilterBadge();
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
  }
}

/**
 * Populate account selector dropdown
 */
function populateAccountSelector() {
  const select = container.querySelector('#account-select');
  select.innerHTML = accounts.map(acc => `
    <option value="${acc.id}" ${filters.accountId == acc.id ? 'selected' : ''}>
      ${escapeHtml(acc.account_name)} (${escapeHtml(acc.account_number)})
    </option>
  `).join('');
}

/**
 * Populate category filter dropdown
 */
function populateCategoryFilter() {
  const select = container.querySelector('#filter-category');
  select.innerHTML = `
    <option value="">All Categories</option>
    ${categories.map(cat => `
      <option value="${cat.id}" ${filters.categoryId == cat.id ? 'selected' : ''}>
        ${cat.icon} ${escapeHtml(cat.name)}
      </option>
    `).join('')}
  `;
}

/**
 * Populate import modal account selector
 */
function populateImportAccountSelector() {
  const select = container.querySelector('#import-account');
  select.innerHTML = `
    <option value="">Select account...</option>
    ${accounts.map(acc => `
      <option value="${acc.id}">
        ${escapeHtml(acc.account_name)} (${escapeHtml(acc.account_number)})
      </option>
    `).join('')}
  `;
}

/**
 * Load transactions with current filters
 */
async function loadTransactions() {
  if (isLoading) return;
  isLoading = true;

  // Save scroll position
  scrollPosition = window.scrollY;

  const txnContainer = container.querySelector('#transactions-container');
  txnContainer.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading transactions...</p>
    </div>
  `;

  try {
    // Build query params
    const params = new URLSearchParams();
    if (filters.accountId) params.append('account_id', filters.accountId);
    if (filters.startDate) params.append('from_date', filters.startDate);
    if (filters.endDate) params.append('to_date', filters.endDate);
    if (filters.categoryId) params.append('category_id', filters.categoryId);
    if (filters.search) params.append('search', filters.search);
    params.append('page', pagination.page.toString());
    params.append('limit', pagination.limit.toString());

    const response = await fetch(`/api/transactions?${params.toString()}`);
    const json = await response.json();

    if (!json.success) {
      throw new Error(json.error || 'Failed to load transactions');
    }

    transactions = json.data;
    pagination = json.pagination || { page: 1, limit: 50, total: transactions.length, pages: 1 };

    renderTransactionsTable();
    renderPagination();

    // Restore scroll position
    window.scrollTo(0, scrollPosition);
  } catch (err) {
    txnContainer.innerHTML = `
      <div class="error-state">
        <p>${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn-secondary retry-btn">Retry</button>
      </div>
    `;
  } finally {
    isLoading = false;
  }
}

/**
 * Render transactions table
 */
function renderTransactionsTable() {
  const txnContainer = container.querySelector('#transactions-container');

  if (transactions.length === 0) {
    const hasFilters = filters.startDate || filters.endDate || filters.categoryId || filters.search;
    txnContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${hasFilters ? '🔍' : '📋'}</div>
        <h3 class="empty-state__title">${hasFilters ? 'No matching transactions' : 'No transactions yet'}</h3>
        <p class="empty-state__description">
          ${hasFilters
            ? 'Try adjusting your filters or search criteria to find what you\'re looking for.'
            : 'Import transactions from your bank statement or add them manually.'}
        </p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  const table = document.createElement('table');
  table.className = `transactions-table ${isSelectMode ? 'select-mode' : ''}`;
  table.innerHTML = `
    <thead>
      <tr>
        ${isSelectMode ? '<th class="col-select"><input type="checkbox" id="select-all-checkbox" title="Select all"></th>' : ''}
        <th class="col-date">Date</th>
        <th class="col-description">Description</th>
        <th class="col-category">Category</th>
        <th class="col-debit">Debit</th>
        <th class="col-credit">Credit</th>
        <th class="col-balance">Balance</th>
      </tr>
    </thead>
    <tbody id="transactions-tbody"></tbody>
  `;

  const tbody = table.querySelector('#transactions-tbody');

  transactions.forEach(txn => {
    // Main row
    const row = document.createElement('tr');
    const isSelected = selectedTransactionIds.has(txn.id);
    row.className = `transaction-row ${expandedRowId === txn.id ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`;
    row.dataset.id = txn.id;
    row.innerHTML = `
      ${isSelectMode ? `<td class="col-select"><input type="checkbox" class="txn-checkbox" data-id="${txn.id}" ${isSelected ? 'checked' : ''}></td>` : ''}
      <td class="col-date">${formatDate(txn.transaction_date)}</td>
      <td class="col-description">
        <span class="editable-description" data-field="description" data-id="${txn.id}">
          ${escapeHtml(txn.description || txn.original_description)}
        </span>
      </td>
      <td class="col-category">
        <span class="category-badge editable-category" data-id="${txn.id}" style="background-color: ${txn.category_colour}20; color: ${txn.category_colour}">
          ${txn.category_icon || getDefaultIcon(txn.category_name)} ${escapeHtml(txn.category_name || 'Uncategorised')}
        </span>
      </td>
      <td class="col-debit ${txn.debit_amount > 0 ? 'amount-negative' : ''}">
        ${txn.debit_amount > 0 ? formatCurrency(txn.debit_amount) : ''}
      </td>
      <td class="col-credit ${txn.credit_amount > 0 ? 'amount-positive' : ''}">
        ${txn.credit_amount > 0 ? formatCurrency(txn.credit_amount) : ''}
      </td>
      <td class="col-balance">${formatCurrency(txn.balance_after)}</td>
    `;
    tbody.appendChild(row);

    // Expanded details row
    if (expandedRowId === txn.id) {
      const detailRow = document.createElement('tr');
      detailRow.className = 'transaction-detail-row';
      detailRow.innerHTML = `
        <td colspan="${isSelectMode ? 7 : 6}">
          <div class="transaction-details">
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Original Description</span>
                <span class="detail-value">${escapeHtml(txn.original_description || txn.description)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Account</span>
                <span class="detail-value">${escapeHtml(getAccountName(txn.account_id))}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Transfer</span>
                <span class="detail-value">${txn.is_transfer ? 'Yes' : 'No'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Recurring</span>
                <span class="detail-value">${txn.is_recurring ? 'Yes' : 'No'}</span>
              </div>
            </div>
            <div class="detail-actions">
              <button type="button" class="btn btn-secondary btn-sm recategorise-btn" data-id="${txn.id}">
                Recategorise
              </button>
              <button type="button" class="btn btn-danger btn-sm delete-btn" data-id="${txn.id}">
                Delete
              </button>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(detailRow);
    }
  });

  fragment.appendChild(table);
  txnContainer.innerHTML = '';
  txnContainer.appendChild(fragment);
}

/**
 * Get account name by ID
 */
function getAccountName(accountId) {
  const account = accounts.find(a => a.id === accountId);
  return account ? account.account_name : 'Unknown';
}

/**
 * Render pagination controls
 */
function renderPagination() {
  const paginationContainer = container.querySelector('#pagination-container');
  const { page, pages, total, limit } = pagination;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  paginationContainer.innerHTML = `
    <div class="pagination-nav">
      <button type="button" class="btn btn-secondary btn-sm pagination-prev" ${page <= 1 ? 'disabled' : ''}>
        Previous
      </button>
      <span class="pagination-info">
        Page <input type="number" class="pagination-input" value="${page}" min="1" max="${pages}"> of ${pages}
      </span>
      <button type="button" class="btn btn-secondary btn-sm pagination-next" ${page >= pages ? 'disabled' : ''}>
        Next
      </button>
    </div>
    <div class="pagination-count">
      Showing ${start}-${end} of ${total}
    </div>
  `;
}

/**
 * Handle pagination button clicks
 */
function handlePaginationClick(e) {
  if (e.target.classList.contains('pagination-prev') && pagination.page > 1) {
    pagination.page--;
    updateUrl();
    loadTransactions();
  } else if (e.target.classList.contains('pagination-next') && pagination.page < pagination.pages) {
    pagination.page++;
    updateUrl();
    loadTransactions();
  }
}

/**
 * Handle pagination input keypress (event delegation)
 */
function handlePaginationKeypress(e) {
  if (e.target.classList.contains('pagination-input') && e.key === 'Enter') {
    const newPage = parseInt(e.target.value, 10);
    if (newPage >= 1 && newPage <= pagination.pages && newPage !== pagination.page) {
      pagination.page = newPage;
      updateUrl();
      loadTransactions();
    }
  }
}

/**
 * Handle table click events (event delegation)
 */
function handleTableClick(e) {
  const target = e.target;

  // Retry button
  if (target.classList.contains('retry-btn')) {
    loadTransactions();
    return;
  }

  // Row click to expand/collapse (but not when clicking checkbox or in select mode)
  const row = target.closest('.transaction-row');
  if (row && !target.closest('.editable-description') && !target.closest('.editable-category') && !target.closest('.txn-checkbox') && !target.closest('.col-select')) {
    // In select mode, clicking the row toggles selection
    if (isSelectMode) {
      const id = parseInt(row.dataset.id, 10);
      if (selectedTransactionIds.has(id)) {
        selectedTransactionIds.delete(id);
      } else {
        selectedTransactionIds.add(id);
      }
      updateBulkSelectionCount();
      row.classList.toggle('selected', selectedTransactionIds.has(id));
      const checkbox = row.querySelector('.txn-checkbox');
      if (checkbox) checkbox.checked = selectedTransactionIds.has(id);
      return;
    }
    // Normal mode: expand/collapse
    const id = parseInt(row.dataset.id, 10);
    expandedRowId = expandedRowId === id ? null : id;
    renderTransactionsTable();
    return;
  }

  // Description inline edit
  if (target.classList.contains('editable-description')) {
    startInlineEdit(target);
    return;
  }

  // Category click - open category picker
  if (target.closest('.editable-category')) {
    const categoryEl = target.closest('.editable-category');
    const txnId = parseInt(categoryEl.dataset.id, 10);
    openCategoryPicker(txnId);
    return;
  }

  // Recategorise button
  if (target.classList.contains('recategorise-btn')) {
    const txnId = parseInt(target.dataset.id, 10);
    openCategoryPicker(txnId);
    return;
  }

  // Delete button
  if (target.classList.contains('delete-btn')) {
    const txnId = parseInt(target.dataset.id, 10);
    openDeleteConfirm(txnId);
    return;
  }
}

/**
 * Start inline editing for description
 */
function startInlineEdit(element) {
  if (editingCell) return; // Already editing

  const txnId = parseInt(element.dataset.id, 10);
  const currentValue = element.textContent.trim();

  editingCell = { element, txnId };

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit-input';
  input.value = currentValue;

  element.innerHTML = '';
  element.appendChild(input);
  input.focus();
  input.select();

  const saveEdit = async () => {
    const newValue = input.value.trim();
    if (newValue && newValue !== currentValue) {
      try {
        await api.put(`/transactions/${txnId}`, { description: newValue });
        // Update local data
        const txn = transactions.find(t => t.id === txnId);
        if (txn) txn.description = newValue;
        element.textContent = newValue;
      } catch (err) {
        element.textContent = currentValue;
        showError(`Failed to save: ${err.message}`);
      }
    } else {
      element.textContent = currentValue;
    }
    editingCell = null;
  };

  const cancelEdit = () => {
    element.textContent = currentValue;
    editingCell = null;
  };

  input.addEventListener('blur', saveEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', saveEdit);
      cancelEdit();
    }
  });
}

/**
 * Open category picker modal
 */
let categoryPickerTxnId = null;
let similarTransactionsCount = 0;
let currentTxnDescription = '';

async function openCategoryPicker(txnId) {
  categoryPickerTxnId = txnId;
  similarTransactionsCount = 0;
  currentTxnDescription = '';

  const modal = container.querySelector('#category-modal');
  const list = container.querySelector('#category-picker-list');
  const similarSection = container.querySelector('#similar-transactions-section');
  const similarLabel = container.querySelector('#similar-count-label');
  const applyCheckbox = container.querySelector('#apply-to-similar-checkbox');

  // Get the transaction description
  const txn = transactions.find(t => t.id === txnId);
  if (txn) {
    currentTxnDescription = txn.description || txn.original_description;
  }

  list.innerHTML = categories.map(cat => `
    <button type="button" class="category-option" data-category-id="${cat.id}">
      <span class="category-badge" style="background-color: ${cat.colour}20; color: ${cat.colour}">
        ${cat.icon || getDefaultIcon(cat.name)} ${escapeHtml(cat.name)}
      </span>
    </button>
  `).join('');

  // Find similar transactions
  if (currentTxnDescription) {
    try {
      const response = await fetch('/api/categories/find-similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: currentTxnDescription,
          exclude_id: txnId
        })
      });
      const json = await response.json();

      if (json.success && json.data.count > 0) {
        similarTransactionsCount = json.data.count;
        similarLabel.textContent = `Also apply to ${similarTransactionsCount} similar transaction${similarTransactionsCount !== 1 ? 's' : ''}`;
        applyCheckbox.checked = true;
        similarSection.classList.remove('hidden');
      } else {
        similarSection.classList.add('hidden');
      }
    } catch {
      similarSection.classList.add('hidden');
    }
  } else {
    similarSection.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

/**
 * Setup category modal events
 */
function setupCategoryModalEvents() {
  const modal = container.querySelector('#category-modal');
  const closeBtn = container.querySelector('#category-modal-close');
  const backdrop = modal.querySelector('.modal-backdrop');
  const list = container.querySelector('#category-picker-list');

  const closeModal = () => {
    modal.classList.add('hidden');
    categoryPickerTxnId = null;
  };

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  onCleanup(() => closeBtn.removeEventListener('click', closeModal));
  onCleanup(() => backdrop.removeEventListener('click', closeModal));

  // Category selection
  const selectHandler = async (e) => {
    const option = e.target.closest('.category-option');
    if (!option || !categoryPickerTxnId) return;

    const categoryId = parseInt(option.dataset.categoryId, 10);
    const applyToSimilar = container.querySelector('#apply-to-similar-checkbox')?.checked;

    try {
      // Update the current transaction
      await api.put(`/transactions/${categoryPickerTxnId}`, { category_id: categoryId });

      // Update local data
      const txn = transactions.find(t => t.id === categoryPickerTxnId);
      if (txn) {
        const cat = categories.find(c => c.id === categoryId);
        txn.category_id = categoryId;
        txn.category_name = cat?.name || '';
        txn.category_colour = cat?.colour || '#636366';
        txn.category_icon = cat?.icon || '';
      }

      // Apply to similar transactions if checkbox is checked
      if (applyToSimilar && similarTransactionsCount > 0 && currentTxnDescription) {
        try {
          const response = await fetch('/api/categories/apply-to-similar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: currentTxnDescription,
              category_id: categoryId,
              exclude_id: categoryPickerTxnId
            })
          });
          const json = await response.json();
          if (json.success && json.data.updated > 0) {
            // Reload transactions to show updated categories
            await loadTransactions();
          } else {
            renderTransactionsTable();
          }
        } catch {
          // Still render even if apply-to-similar fails
          renderTransactionsTable();
        }
      } else {
        renderTransactionsTable();
      }

      closeModal();
    } catch (err) {
      showError(`Failed to update category: ${err.message}`);
    }
  };
  list.addEventListener('click', selectHandler);
  onCleanup(() => list.removeEventListener('click', selectHandler));
}

/**
 * Open delete confirmation modal
 */
let deleteTransactionId = null;

function openDeleteConfirm(txnId) {
  deleteTransactionId = txnId;
  const modal = container.querySelector('#delete-modal');
  const descEl = container.querySelector('#delete-transaction-desc');

  const txn = transactions.find(t => t.id === txnId);
  if (txn) {
    const amount = txn.debit_amount > 0 ? formatCurrency(txn.debit_amount) : formatCurrency(txn.credit_amount);
    descEl.textContent = `${txn.description || txn.original_description} - ${amount}`;
  }

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
    deleteTransactionId = null;
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  onCleanup(() => closeBtn.removeEventListener('click', closeModal));
  onCleanup(() => cancelBtn.removeEventListener('click', closeModal));
  onCleanup(() => backdrop.removeEventListener('click', closeModal));

  const confirmHandler = async () => {
    if (!deleteTransactionId) return;

    try {
      await api.delete(`/transactions/${deleteTransactionId}`);
      // Remove from local data
      transactions = transactions.filter(t => t.id !== deleteTransactionId);
      expandedRowId = null;
      renderTransactionsTable();
      closeModal();
    } catch (err) {
      showError(`Failed to delete: ${err.message}`);
    }
  };
  confirmBtn.addEventListener('click', confirmHandler);
  onCleanup(() => confirmBtn.removeEventListener('click', confirmHandler));
}

/**
 * Open import modal
 */
function openImportModal() {
  const modal = container.querySelector('#import-modal');
  const uploadStep = container.querySelector('#import-step-upload');
  const previewStep = container.querySelector('#import-step-preview');
  const resultStep = container.querySelector('#import-step-result');

  // Reset to upload step
  uploadStep.classList.remove('hidden');
  previewStep.classList.add('hidden');
  resultStep.classList.add('hidden');

  // Reset form
  container.querySelector('#import-account').value = filters.accountId || '';
  container.querySelector('#import-file').value = '';
  container.querySelector('#import-preview-btn').disabled = true;

  modal.classList.remove('hidden');
}

/**
 * Setup import modal events
 */
let importPreviewData = null;

function setupImportModalEvents() {
  const modal = container.querySelector('#import-modal');
  const closeBtn = container.querySelector('#import-modal-close');
  const backdrop = modal.querySelector('.modal-backdrop');
  const accountSelect = container.querySelector('#import-account');
  const fileInput = container.querySelector('#import-file');
  const previewBtn = container.querySelector('#import-preview-btn');
  const backBtn = container.querySelector('#import-back-btn');
  const confirmBtn = container.querySelector('#import-confirm-btn');
  const doneBtn = container.querySelector('#import-done-btn');

  const closeModal = () => {
    modal.classList.add('hidden');
    importPreviewData = null;
  };

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  onCleanup(() => closeBtn.removeEventListener('click', closeModal));
  onCleanup(() => backdrop.removeEventListener('click', closeModal));

  // Enable preview button when both account and file selected
  const checkPreviewEnabled = () => {
    previewBtn.disabled = !accountSelect.value || !fileInput.files.length;
  };

  accountSelect.addEventListener('change', checkPreviewEnabled);
  fileInput.addEventListener('change', checkPreviewEnabled);
  onCleanup(() => accountSelect.removeEventListener('change', checkPreviewEnabled));
  onCleanup(() => fileInput.removeEventListener('change', checkPreviewEnabled));

  // Preview button
  const previewHandler = async () => {
    const accountId = accountSelect.value;
    const file = fileInput.files[0];
    if (!accountId || !file) return;

    previewBtn.disabled = true;
    previewBtn.textContent = 'Loading...';

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('account_id', accountId);

      const response = await fetch('/api/import/preview', {
        method: 'POST',
        body: formData
      });
      const json = await response.json();

      if (!json.success) {
        throw new Error(json.error || 'Preview failed');
      }

      importPreviewData = { ...json.data, accountId };
      renderImportPreview();

      container.querySelector('#import-step-upload').classList.add('hidden');
      container.querySelector('#import-step-preview').classList.remove('hidden');
    } catch (err) {
      showError(`Preview failed: ${err.message}`);
    } finally {
      previewBtn.disabled = false;
      previewBtn.textContent = 'Preview Import';
    }
  };
  previewBtn.addEventListener('click', previewHandler);
  onCleanup(() => previewBtn.removeEventListener('click', previewHandler));

  // Back button
  const backHandler = () => {
    container.querySelector('#import-step-preview').classList.add('hidden');
    container.querySelector('#import-step-upload').classList.remove('hidden');
  };
  backBtn.addEventListener('click', backHandler);
  onCleanup(() => backBtn.removeEventListener('click', backHandler));

  // Confirm import button
  const confirmHandler = async () => {
    if (!importPreviewData) return;

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Importing...';

    try {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('accountId', importPreviewData.accountId);
      // Include the column mapping from the preview response
      formData.append('mapping', JSON.stringify(importPreviewData.suggestedMapping));

      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData
      });
      const json = await response.json();

      if (!json.success) {
        throw new Error(json.error || 'Import failed');
      }

      renderImportResult(json.data);
      container.querySelector('#import-step-preview').classList.add('hidden');
      container.querySelector('#import-step-result').classList.remove('hidden');
    } catch (err) {
      showError(`Import failed: ${err.message}`);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Import';
    }
  };
  confirmBtn.addEventListener('click', confirmHandler);
  onCleanup(() => confirmBtn.removeEventListener('click', confirmHandler));

  // Done button
  const doneHandler = () => {
    closeModal();
    loadTransactions(); // Refresh data
  };
  doneBtn.addEventListener('click', doneHandler);
  onCleanup(() => doneBtn.removeEventListener('click', doneHandler));
}

/**
 * Render import preview table
 */
function renderImportPreview() {
  const previewContainer = container.querySelector('#import-preview-container');

  // API returns 'preview' array, not 'rows'
  const previewRows = importPreviewData?.preview || [];
  const totalRows = importPreviewData?.totalRows || 0;
  const mapping = importPreviewData?.suggestedMapping || {};

  if (!previewRows.length) {
    previewContainer.innerHTML = '<p class="text-secondary">No transactions found in CSV</p>';
    return;
  }

  // Show column mapping info
  const mappingInfo = [];
  if (mapping.date) mappingInfo.push(`Date: ${mapping.date}`);
  if (mapping.description) mappingInfo.push(`Description: ${mapping.description}`);
  if (mapping.debit) mappingInfo.push(`Debit: ${mapping.debit}`);
  if (mapping.credit) mappingInfo.push(`Credit: ${mapping.credit}`);
  if (mapping.amount) mappingInfo.push(`Amount: ${mapping.amount}`);

  previewContainer.innerHTML = `
    <p class="preview-summary">Found <strong>${totalRows}</strong> transactions to import</p>
    <p class="preview-mapping text-secondary" style="font-size: 0.875rem; margin-bottom: 1rem;">
      Column mapping: ${mappingInfo.join(', ') || 'Auto-detected'}
    </p>
    <table class="import-preview-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Debit</th>
          <th>Credit</th>
        </tr>
      </thead>
      <tbody>
        ${previewRows.map(row => {
          // Use detected mapping to show values
          const dateVal = mapping.date ? row[mapping.date] : '';
          const descVal = mapping.description ? row[mapping.description] : '';
          const debitVal = mapping.debit ? row[mapping.debit] : '';
          const creditVal = mapping.credit ? row[mapping.credit] : '';
          const amountVal = mapping.amount ? row[mapping.amount] : '';

          return `
            <tr>
              <td>${escapeHtml(dateVal || '')}</td>
              <td>${escapeHtml(descVal || '')}</td>
              <td>${escapeHtml(debitVal || amountVal || '')}</td>
              <td>${escapeHtml(creditVal || '')}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    ${totalRows > 10 ? `<p class="preview-more">...and ${totalRows - 10} more</p>` : ''}
  `;
}

/**
 * Render import result
 */
function renderImportResult(result) {
  const resultContainer = container.querySelector('#import-result-container');

  // Backend returns: { batchId, imported, duplicatesSkipped, errors: [{row, message, data}] }
  const imported = result.imported || 0;
  const duplicatesSkipped = result.duplicatesSkipped || 0;
  const errors = result.errors || [];

  resultContainer.innerHTML = `
    <div class="import-result">
      <div class="result-success">
        <h3>Import Complete</h3>
        <p><strong>${imported}</strong> transactions imported</p>
        ${duplicatesSkipped > 0 ? `<p><strong>${duplicatesSkipped}</strong> duplicate${duplicatesSkipped > 1 ? 's' : ''} skipped</p>` : ''}
      </div>
      ${errors.length > 0 ? `
        <div class="result-errors">
          <h4>${errors.length} Error${errors.length > 1 ? 's' : ''}</h4>
          <ul>
            ${errors.slice(0, 10).map(err => `
              <li>Row ${err.row}: ${escapeHtml(err.message)}</li>
            `).join('')}
            ${errors.length > 10 ? `<li>...and ${errors.length - 10} more errors</li>` : ''}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Setup select mode event handlers
 */
function setupSelectModeEvents() {
  const selectModeBtn = container.querySelector('#select-mode-btn');
  const bulkActionBar = container.querySelector('#bulk-action-bar');
  const bulkSelectAllBtn = container.querySelector('#bulk-select-all-btn');
  const bulkCategorizeBtn = container.querySelector('#bulk-categorize-btn');
  const bulkCancelBtn = container.querySelector('#bulk-cancel-btn');

  // Toggle select mode
  const toggleHandler = () => {
    isSelectMode = !isSelectMode;
    selectedTransactionIds.clear();
    selectModeBtn.textContent = isSelectMode ? 'Done' : 'Select';
    selectModeBtn.classList.toggle('btn-primary', isSelectMode);
    selectModeBtn.classList.toggle('btn-secondary', !isSelectMode);
    bulkActionBar.classList.toggle('hidden', !isSelectMode);
    updateBulkSelectionCount();
    renderTransactionsTable();
  };
  selectModeBtn.addEventListener('click', toggleHandler);
  onCleanup(() => selectModeBtn.removeEventListener('click', toggleHandler));

  // Select all on current page
  const selectAllHandler = () => {
    const allSelected = transactions.every(txn => selectedTransactionIds.has(txn.id));
    if (allSelected) {
      // Deselect all
      transactions.forEach(txn => selectedTransactionIds.delete(txn.id));
    } else {
      // Select all on current page
      transactions.forEach(txn => selectedTransactionIds.add(txn.id));
    }
    updateBulkSelectionCount();
    renderTransactionsTable();
  };
  bulkSelectAllBtn.addEventListener('click', selectAllHandler);
  onCleanup(() => bulkSelectAllBtn.removeEventListener('click', selectAllHandler));

  // Cancel select mode
  const cancelHandler = () => {
    isSelectMode = false;
    selectedTransactionIds.clear();
    selectModeBtn.textContent = 'Select';
    selectModeBtn.classList.remove('btn-primary');
    selectModeBtn.classList.add('btn-secondary');
    bulkActionBar.classList.add('hidden');
    renderTransactionsTable();
  };
  bulkCancelBtn.addEventListener('click', cancelHandler);
  onCleanup(() => bulkCancelBtn.removeEventListener('click', cancelHandler));

  // Open bulk categorize modal
  const categorizeHandler = () => {
    if (selectedTransactionIds.size === 0) {
      showError('Please select at least one transaction');
      return;
    }
    openBulkCategoryPicker();
  };
  bulkCategorizeBtn.addEventListener('click', categorizeHandler);
  onCleanup(() => bulkCategorizeBtn.removeEventListener('click', categorizeHandler));

  // Handle checkbox clicks via event delegation (on transactions container)
  const txnContainer = container.querySelector('#transactions-container');
  const checkboxHandler = (e) => {
    // Individual checkbox
    if (e.target.classList.contains('txn-checkbox')) {
      const txnId = parseInt(e.target.dataset.id, 10);
      if (e.target.checked) {
        selectedTransactionIds.add(txnId);
      } else {
        selectedTransactionIds.delete(txnId);
      }
      updateBulkSelectionCount();
      // Update row selected state
      const row = e.target.closest('.transaction-row');
      if (row) {
        row.classList.toggle('selected', e.target.checked);
      }
      return;
    }

    // Select all checkbox in header
    if (e.target.id === 'select-all-checkbox') {
      if (e.target.checked) {
        transactions.forEach(txn => selectedTransactionIds.add(txn.id));
      } else {
        transactions.forEach(txn => selectedTransactionIds.delete(txn.id));
      }
      updateBulkSelectionCount();
      renderTransactionsTable();
    }
  };
  txnContainer.addEventListener('change', checkboxHandler);
  onCleanup(() => txnContainer.removeEventListener('change', checkboxHandler));
}

/**
 * Update the bulk selection count display
 */
function updateBulkSelectionCount() {
  const countEl = container.querySelector('#bulk-selected-count');
  if (countEl) {
    countEl.textContent = selectedTransactionIds.size;
  }

  // Update select all button text
  const selectAllBtn = container.querySelector('#bulk-select-all-btn');
  if (selectAllBtn) {
    const allSelected = transactions.length > 0 && transactions.every(txn => selectedTransactionIds.has(txn.id));
    selectAllBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
  }

  // Update header checkbox state
  const headerCheckbox = container.querySelector('#select-all-checkbox');
  if (headerCheckbox) {
    const allSelected = transactions.length > 0 && transactions.every(txn => selectedTransactionIds.has(txn.id));
    const someSelected = transactions.some(txn => selectedTransactionIds.has(txn.id));
    headerCheckbox.checked = allSelected;
    headerCheckbox.indeterminate = someSelected && !allSelected;
  }
}

/**
 * Open bulk category picker modal
 */
function openBulkCategoryPicker() {
  const modal = container.querySelector('#category-modal');
  const list = container.querySelector('#category-picker-list');
  const similarSection = container.querySelector('#similar-transactions-section');
  const modalTitle = container.querySelector('#category-modal-title');

  // Update modal title for bulk mode
  modalTitle.textContent = `Categorize ${selectedTransactionIds.size} Transaction${selectedTransactionIds.size !== 1 ? 's' : ''}`;

  // Hide similar transactions section for bulk mode
  similarSection.classList.add('hidden');

  list.innerHTML = categories.map(cat => `
    <button type="button" class="category-option bulk-category-option" data-category-id="${cat.id}">
      <span class="category-badge" style="background-color: ${cat.colour}20; color: ${cat.colour}">
        ${cat.icon || getDefaultIcon(cat.name)} ${escapeHtml(cat.name)}
      </span>
    </button>
  `).join('');

  // Add bulk category selection handler
  const selectHandler = async (e) => {
    const option = e.target.closest('.bulk-category-option');
    if (!option) return;

    const categoryId = parseInt(option.dataset.categoryId, 10);

    try {
      // Bulk update all selected transactions
      const updatePromises = Array.from(selectedTransactionIds).map(txnId =>
        api.put(`/transactions/${txnId}`, { category_id: categoryId })
      );

      await Promise.all(updatePromises);

      // Update local data
      const cat = categories.find(c => c.id === categoryId);
      transactions.forEach(txn => {
        if (selectedTransactionIds.has(txn.id)) {
          txn.category_id = categoryId;
          txn.category_name = cat?.name || '';
          txn.category_colour = cat?.colour || '#636366';
          txn.category_icon = cat?.icon || '';
        }
      });

      // Clear selection and exit select mode
      selectedTransactionIds.clear();
      isSelectMode = false;
      const selectModeBtn = container.querySelector('#select-mode-btn');
      selectModeBtn.textContent = 'Select';
      selectModeBtn.classList.remove('btn-primary');
      selectModeBtn.classList.add('btn-secondary');
      container.querySelector('#bulk-action-bar').classList.add('hidden');

      renderTransactionsTable();
      modal.classList.add('hidden');
      modalTitle.textContent = 'Select Category';

      // Remove this handler after use
      list.removeEventListener('click', selectHandler);
    } catch (err) {
      showError(`Failed to update categories: ${err.message}`);
    }
  };
  list.addEventListener('click', selectHandler);

  // Remove handler when modal closes
  const closeHandler = () => {
    list.removeEventListener('click', selectHandler);
    modalTitle.textContent = 'Select Category';
  };
  modal.querySelector('#category-modal-close').addEventListener('click', closeHandler, { once: true });
  modal.querySelector('.modal-backdrop').addEventListener('click', closeHandler, { once: true });

  modal.classList.remove('hidden');
}

/**
 * Update the active filter count badge
 */
function updateFilterBadge() {
  const badge = container.querySelector('#active-filter-badge');
  if (!badge) return;

  let count = 0;
  if (filters.startDate) count++;
  if (filters.endDate) count++;
  if (filters.categoryId) count++;
  if (filters.search) count++;

  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/**
 * Update URL with current filters (without page reload)
 */
function updateUrl() {
  const params = new URLSearchParams();

  if (filters.accountId) params.set('account', filters.accountId);
  if (pagination.page > 1) params.set('page', pagination.page.toString());
  if (filters.startDate) params.set('start_date', filters.startDate);
  if (filters.endDate) params.set('end_date', filters.endDate);
  if (filters.categoryId) params.set('category', filters.categoryId);
  if (filters.search) params.set('search', filters.search);

  const queryString = params.toString();
  const newHash = `/transactions${queryString ? '?' + queryString : ''}`;

  // Update without triggering navigation
  history.replaceState(null, '', `#${newHash}`);

  // Update filter badge
  updateFilterBadge();
}

