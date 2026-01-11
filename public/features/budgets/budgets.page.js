/**
 * Budgets Page Module
 * Manage monthly budgets with progress tracking and category assignments
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';
import { showError, showWarning } from '../../core/toast.js';

let container = null;
let cleanupFunctions = [];
let budgets = [];
let categories = [];
let unbudgetedCategories = [];
let summary = null;
let currentMonth = new Date().toISOString().slice(0, 7);
let editingBudget = null;

function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

export function mount(el, params) {
  container = el;
  cleanupFunctions = [];

  // Reset state
  budgets = [];
  categories = [];
  unbudgetedCategories = [];
  summary = null;
  editingBudget = null;

  // Parse month from params if provided
  const monthParam = params.get('month');
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    currentMonth = monthParam;
  } else {
    currentMonth = new Date().toISOString().slice(0, 7);
  }

  // Load CSS
  loadStyles();

  render();
  loadData();
}

export function unmount() {
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];

  if (container) {
    container.innerHTML = '';
    container = null;
  }

  budgets = [];
  categories = [];
  unbudgetedCategories = [];
  summary = null;
  editingBudget = null;
}

function loadStyles() {
  const styleId = 'budgets-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/budgets/budgets.css';
    document.head.appendChild(link);
  }
}

function render() {
  const monthDisplay = formatMonthDisplay(currentMonth);

  container.innerHTML = `
    <div class="page budgets-page">
      <!-- Month Navigator -->
      <div class="card month-navigator-card">
        <div class="month-navigator">
          <button type="button" class="btn btn-secondary btn-icon" id="prev-month-btn" title="Previous month">
            <span class="icon-chevron-left"></span>
          </button>
          <div class="month-display">
            <span class="month-label">${monthDisplay}</span>
          </div>
          <button type="button" class="btn btn-secondary btn-icon" id="next-month-btn" title="Next month">
            <span class="icon-chevron-right"></span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="today-btn">Today</button>
        </div>
      </div>

      <!-- Summary Card -->
      <div class="card summary-card" id="summary-container">
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading summary...</p>
        </div>
      </div>

      <!-- Budgets List -->
      <div class="card budgets-list-card">
        <div class="card-header">
          <h3 class="card-title">Budget Progress</h3>
          <button type="button" class="btn btn-primary btn-sm" id="add-budget-btn">
            Add Budget
          </button>
        </div>
        <div id="budgets-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading budgets...</p>
          </div>
        </div>
      </div>

      <!-- Quick Add Section -->
      <div class="card quick-add-card" id="quick-add-container">
        <!-- Populated dynamically -->
      </div>

      <!-- Budget Modal -->
      <div id="budget-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="modal-title">Add Budget</h2>
            <button type="button" class="modal-close" id="modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <form id="budget-form">
              <div class="form-group">
                <label for="budget-category" class="form-label">Category</label>
                <select id="budget-category" class="form-select" required>
                  <option value="">Select category...</option>
                </select>
              </div>
              <div class="form-group">
                <label for="budget-amount" class="form-label">Budget Amount</label>
                <input type="number" id="budget-amount" class="form-input"
                       step="0.01" min="0" placeholder="0.00" required>
              </div>
              <div class="form-group">
                <label for="budget-notes" class="form-label">Notes (optional)</label>
                <textarea id="budget-notes" class="form-input" rows="2"
                          placeholder="Add notes about this budget..."></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="modal-save">Save Budget</button>
          </div>
        </div>
      </div>

      <!-- Delete Confirm Modal -->
      <div id="delete-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <div class="modal-backdrop"></div>
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h2 id="delete-modal-title">Delete Budget</h2>
            <button type="button" class="modal-close" id="delete-modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete this budget?</p>
            <p id="delete-budget-info" class="text-secondary"></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="delete-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-danger" id="delete-confirm-btn">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;

  attachEventListeners();
}

function attachEventListeners() {
  const prevBtn = container.querySelector('#prev-month-btn');
  const nextBtn = container.querySelector('#next-month-btn');
  const todayBtn = container.querySelector('#today-btn');

  const prevHandler = () => navigateMonth(-1);
  const nextHandler = () => navigateMonth(1);
  const todayHandler = () => {
    currentMonth = new Date().toISOString().slice(0, 7);
    updateMonthDisplay();
    loadData();
  };

  prevBtn.addEventListener('click', prevHandler);
  nextBtn.addEventListener('click', nextHandler);
  todayBtn.addEventListener('click', todayHandler);
  onCleanup(() => prevBtn.removeEventListener('click', prevHandler));
  onCleanup(() => nextBtn.removeEventListener('click', nextHandler));
  onCleanup(() => todayBtn.removeEventListener('click', todayHandler));

  const addBtn = container.querySelector('#add-budget-btn');
  const addHandler = () => openBudgetModal(null);
  addBtn.addEventListener('click', addHandler);
  onCleanup(() => addBtn.removeEventListener('click', addHandler));

  const budgetsContainer = container.querySelector('#budgets-container');
  const budgetsClickHandler = (e) => handleBudgetsClick(e);
  budgetsContainer.addEventListener('click', budgetsClickHandler);
  onCleanup(() => budgetsContainer.removeEventListener('click', budgetsClickHandler));

  const quickAddContainer = container.querySelector('#quick-add-container');
  const quickAddHandler = (e) => handleQuickAddClick(e);
  quickAddContainer.addEventListener('click', quickAddHandler);
  onCleanup(() => quickAddContainer.removeEventListener('click', quickAddHandler));

  setupBudgetModalEvents();
  setupDeleteModalEvents();

  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      const budgetModal = container.querySelector('#budget-modal');
      const deleteModal = container.querySelector('#delete-modal');

      if (!budgetModal.classList.contains('hidden')) {
        budgetModal.classList.add('hidden');
        editingBudget = null;
      } else if (!deleteModal.classList.contains('hidden')) {
        deleteModal.classList.add('hidden');
        deletingBudget = null;
      }
    }
  };
  document.addEventListener('keydown', escapeHandler);
  onCleanup(() => document.removeEventListener('keydown', escapeHandler));
}

async function loadData() {
  try {
    const [budgetsData, categoriesData, unbudgetedData, summaryData] = await Promise.all([
      api.get(`/budgets?month=${currentMonth}`),
      api.get('/categories'),
      api.get(`/budgets/unbudgeted?month=${currentMonth}`),
      api.get(`/budgets/summary?month=${currentMonth}`)
    ]);

    budgets = budgetsData;
    categories = categoriesData;
    unbudgetedCategories = unbudgetedData;
    summary = summaryData;

    renderSummary();
    renderBudgets();
    renderQuickAdd();
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
  }
}

function navigateMonth(delta) {
  const [year, month] = currentMonth.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  currentMonth = date.toISOString().slice(0, 7);
  updateMonthDisplay();
  loadData();
}

function updateMonthDisplay() {
  const monthLabel = container.querySelector('.month-label');
  if (monthLabel) {
    monthLabel.textContent = formatMonthDisplay(currentMonth);
  }

  // Update URL without reload
  const params = new URLSearchParams();
  const today = new Date().toISOString().slice(0, 7);
  if (currentMonth !== today) {
    params.set('month', currentMonth);
  }
  const queryString = params.toString();
  const newHash = `/budgets${queryString ? '?' + queryString : ''}`;
  history.replaceState(null, '', `#${newHash}`);
}

function formatMonthDisplay(month) {
  const [year, monthNum] = month.split('-');
  const date = new Date(year, parseInt(monthNum, 10) - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function renderSummary() {
  const summaryContainer = container.querySelector('#summary-container');

  if (!summary) {
    summaryContainer.innerHTML = `
      <div class="empty-state">
        <p>No budget data available</p>
      </div>
    `;
    return;
  }

  const overallClass = summary.overallPercent >= 100 ? 'status-over'
    : summary.overallPercent >= 80 ? 'status-warning'
    : 'status-good';

  summaryContainer.innerHTML = `
    <div class="budget-summary">
      <div class="summary-main">
        <div class="summary-stat">
          <span class="stat-label">Total Budgeted</span>
          <span class="stat-value">${formatCurrency(summary.totalBudgeted)}</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Total Spent</span>
          <span class="stat-value">${formatCurrency(summary.totalSpent)}</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Remaining</span>
          <span class="stat-value ${summary.totalRemaining >= 0 ? 'amount-positive' : 'amount-negative'}">
            ${formatCurrency(summary.totalRemaining)}
          </span>
        </div>
      </div>
      <div class="summary-progress">
        <div class="progress-bar-large">
          <div class="progress-track">
            <div class="progress-fill ${overallClass}" style="width: ${Math.min(summary.overallPercent, 100)}%"></div>
          </div>
          <span class="progress-label">${summary.overallPercent}% used</span>
        </div>
      </div>
      <div class="summary-status">
        <div class="status-item status-good">
          <span class="status-count">${summary.status.onTrack}</span>
          <span class="status-label">On Track</span>
        </div>
        <div class="status-item status-warning">
          <span class="status-count">${summary.status.warning}</span>
          <span class="status-label">Near Limit</span>
        </div>
        <div class="status-item status-over">
          <span class="status-count">${summary.status.overBudget}</span>
          <span class="status-label">Over Budget</span>
        </div>
      </div>
    </div>
  `;
}

function renderBudgets() {
  const budgetsContainer = container.querySelector('#budgets-container');

  if (budgets.length === 0) {
    budgetsContainer.innerHTML = `
      <div class="empty-state empty-state--budgets">
        <div class="empty-state__icon">📊</div>
        <h3 class="empty-state__title">No budgets set for ${formatMonthDisplay(currentMonth)}</h3>
        <p class="empty-state__description">
          Start tracking your spending by creating a budget for each category.
          You'll see progress bars and alerts when you're close to your limits.
        </p>
        <button type="button" class="btn btn-primary empty-state__cta" id="empty-add-budget-btn">
          Create Your First Budget
        </button>
      </div>
    `;

    // Add event listener for the CTA button
    const ctaBtn = budgetsContainer.querySelector('#empty-add-budget-btn');
    if (ctaBtn) {
      const ctaHandler = () => openBudgetModal(null);
      ctaBtn.addEventListener('click', ctaHandler);
      onCleanup(() => ctaBtn.removeEventListener('click', ctaHandler));
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  const list = document.createElement('div');
  list.className = 'budgets-list';

  budgets.forEach(budget => {
    const item = document.createElement('div');
    item.className = 'budget-item';
    item.dataset.id = budget.id;

    const statusClass = budget.percent_used > 100 ? 'status-over'
      : budget.percent_used >= 80 ? 'status-warning'
      : 'status-good';

    const progressWidth = Math.min(budget.percent_used, 100);

    item.innerHTML = `
      <div class="budget-item__header">
        <div class="budget-item__category">
          <span class="category-badge" style="background-color: ${budget.category_colour}20; color: ${budget.category_colour}">
            ${budget.category_icon || ''} ${escapeHtml(budget.category_name)}
          </span>
        </div>
        <div class="budget-item__actions">
          <button type="button" class="btn btn-icon btn-ghost edit-budget-btn" data-id="${budget.id}" title="Edit">
            <span class="icon-edit"></span>
          </button>
          <button type="button" class="btn btn-icon btn-ghost delete-budget-btn" data-id="${budget.id}" title="Delete">
            <span class="icon-delete"></span>
          </button>
        </div>
      </div>
      <div class="budget-item__progress">
        <div class="progress-bar">
          <div class="progress-track">
            <div class="progress-fill ${statusClass}" style="width: ${progressWidth}%"></div>
          </div>
        </div>
        <span class="progress-percent ${statusClass}">${budget.percent_used}%</span>
      </div>
      <div class="budget-item__amounts">
        <div class="amount-item">
          <span class="amount-label">Spent</span>
          <span class="amount-value">${formatCurrency(budget.spent_amount)}</span>
        </div>
        <div class="amount-item">
          <span class="amount-label">Budgeted</span>
          <span class="amount-value">${formatCurrency(budget.budgeted_amount)}</span>
        </div>
        <div class="amount-item">
          <span class="amount-label">Remaining</span>
          <span class="amount-value ${budget.remaining_amount >= 0 ? 'amount-positive' : 'amount-negative'}">
            ${formatCurrency(budget.remaining_amount)}
          </span>
        </div>
      </div>
    `;

    list.appendChild(item);
  });

  fragment.appendChild(list);
  budgetsContainer.innerHTML = '';
  budgetsContainer.appendChild(fragment);
}

function renderQuickAdd() {
  const quickAddContainer = container.querySelector('#quick-add-container');

  if (unbudgetedCategories.length === 0) {
    quickAddContainer.innerHTML = '';
    quickAddContainer.classList.add('hidden');
    return;
  }

  quickAddContainer.classList.remove('hidden');

  const categoriesWithSpending = unbudgetedCategories.filter(c => c.spent_this_month > 0);

  if (categoriesWithSpending.length === 0) {
    quickAddContainer.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">Categories Without Budgets</h3>
      </div>
      <div class="quick-add-list">
        <p class="text-secondary">No spending in unbudgeted categories this month</p>
      </div>
    `;
    return;
  }

  quickAddContainer.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">Quick Add</h3>
      <span class="text-secondary">Categories with spending but no budget</span>
    </div>
    <div class="quick-add-list">
      ${categoriesWithSpending.map(cat => `
        <div class="quick-add-item" data-category-id="${cat.id}">
          <div class="quick-add-info">
            <span class="category-badge" style="background-color: ${cat.colour}20; color: ${cat.colour}">
              ${cat.icon || ''} ${escapeHtml(cat.name)}
            </span>
            <span class="quick-add-spent">${formatCurrency(cat.spent_this_month)} spent</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm quick-add-btn" data-category-id="${cat.id}">
            Add Budget
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function handleBudgetsClick(e) {
  const editBtn = e.target.closest('.edit-budget-btn');
  if (editBtn) {
    const budgetId = parseInt(editBtn.dataset.id, 10);
    const budget = budgets.find(b => b.id === budgetId);
    if (budget) {
      openBudgetModal(budget);
    }
    return;
  }

  const deleteBtn = e.target.closest('.delete-budget-btn');
  if (deleteBtn) {
    const budgetId = parseInt(deleteBtn.dataset.id, 10);
    const budget = budgets.find(b => b.id === budgetId);
    if (budget) {
      openDeleteModal(budget);
    }
    return;
  }
}

function handleQuickAddClick(e) {
  const addBtn = e.target.closest('.quick-add-btn');
  if (addBtn) {
    const categoryId = parseInt(addBtn.dataset.categoryId, 10);
    const category = unbudgetedCategories.find(c => c.id === categoryId);
    if (category) {
      openBudgetModal(null, category);
    }
  }
}

function openBudgetModal(budget, preselectedCategory = null) {
  editingBudget = budget;

  const modal = container.querySelector('#budget-modal');
  const title = container.querySelector('#modal-title');
  const categorySelect = container.querySelector('#budget-category');
  const amountInput = container.querySelector('#budget-amount');
  const notesInput = container.querySelector('#budget-notes');

  // Set title
  title.textContent = budget ? 'Edit Budget' : 'Add Budget';

  // Populate category select
  // For expense categories only
  const expenseCategories = categories.filter(c => c.type === 'expense');

  categorySelect.innerHTML = `
    <option value="">Select category...</option>
    ${expenseCategories.map(cat => `
      <option value="${cat.id}" ${(budget?.category_id === cat.id || preselectedCategory?.id === cat.id) ? 'selected' : ''}>
        ${cat.icon || ''} ${escapeHtml(cat.name)}
      </option>
    `).join('')}
  `;

  // Disable category select when editing
  categorySelect.disabled = !!budget;

  // Set values
  amountInput.value = budget ? budget.budgeted_amount : '';
  notesInput.value = budget ? (budget.notes || '') : '';

  modal.classList.remove('hidden');
  amountInput.focus();
}

function setupBudgetModalEvents() {
  const modal = container.querySelector('#budget-modal');
  const closeBtn = container.querySelector('#modal-close');
  const cancelBtn = container.querySelector('#modal-cancel');
  const saveBtn = container.querySelector('#modal-save');
  const backdrop = modal.querySelector('.modal-backdrop');

  const closeModal = () => {
    modal.classList.add('hidden');
    editingBudget = null;
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  onCleanup(() => closeBtn.removeEventListener('click', closeModal));
  onCleanup(() => cancelBtn.removeEventListener('click', closeModal));
  onCleanup(() => backdrop.removeEventListener('click', closeModal));

  const saveHandler = async () => {
    const categoryId = container.querySelector('#budget-category').value;
    const amount = container.querySelector('#budget-amount').value;
    const notes = container.querySelector('#budget-notes').value;

    if (!categoryId) {
      showWarning('Please select a category');
      return;
    }

    if (!amount || parseFloat(amount) < 0) {
      showWarning('Please enter a valid budget amount');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await api.post('/budgets', {
        categoryId: editingBudget ? editingBudget.category_id : parseInt(categoryId, 10),
        month: currentMonth,
        budgetedAmount: parseFloat(amount),
        notes: notes || null
      });

      closeModal();
      await loadData();
    } catch (err) {
      showError(`Failed to save budget: ${err.message}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Budget';
    }
  };

  saveBtn.addEventListener('click', saveHandler);
  onCleanup(() => saveBtn.removeEventListener('click', saveHandler));

  // Form submission
  const form = container.querySelector('#budget-form');
  const formHandler = (e) => {
    e.preventDefault();
    saveHandler();
  };
  form.addEventListener('submit', formHandler);
  onCleanup(() => form.removeEventListener('submit', formHandler));
}

let deletingBudget = null;

function openDeleteModal(budget) {
  deletingBudget = budget;

  const modal = container.querySelector('#delete-modal');
  const infoEl = container.querySelector('#delete-budget-info');

  infoEl.textContent = `${budget.category_name} - ${formatCurrency(budget.budgeted_amount)}`;
  modal.classList.remove('hidden');
}

function setupDeleteModalEvents() {
  const modal = container.querySelector('#delete-modal');
  const closeBtn = container.querySelector('#delete-modal-close');
  const cancelBtn = container.querySelector('#delete-cancel-btn');
  const confirmBtn = container.querySelector('#delete-confirm-btn');
  const backdrop = modal.querySelector('.modal-backdrop');

  const closeModal = () => {
    modal.classList.add('hidden');
    deletingBudget = null;
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  onCleanup(() => closeBtn.removeEventListener('click', closeModal));
  onCleanup(() => cancelBtn.removeEventListener('click', closeModal));
  onCleanup(() => backdrop.removeEventListener('click', closeModal));

  const confirmHandler = async () => {
    if (!deletingBudget) return;

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';

    try {
      await api.delete(`/budgets/${deletingBudget.id}`);
      closeModal();
      await loadData();
    } catch (err) {
      showError(`Failed to delete budget: ${err.message}`);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete';
    }
  };

  confirmBtn.addEventListener('click', confirmHandler);
  onCleanup(() => confirmBtn.removeEventListener('click', confirmHandler));
}

function renderErrorState(message) {
  const budgetsContainer = container.querySelector('#budgets-container');
  budgetsContainer.innerHTML = `
    <div class="error-state">
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn btn-secondary retry-btn">Retry</button>
    </div>
  `;

  const retryBtn = budgetsContainer.querySelector('.retry-btn');
  const retryHandler = () => loadData();
  retryBtn.addEventListener('click', retryHandler);
  onCleanup(() => retryBtn.removeEventListener('click', retryHandler));
}
