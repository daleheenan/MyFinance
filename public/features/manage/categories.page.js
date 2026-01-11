/**
 * Categories Management Page
 * Manages categories and category rules for auto-categorization
 */

import { api } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';
import { createModal, showConfirmDialog } from '../../core/modal.js';

let container = null;
let cleanupFunctions = [];
let categories = [];
let categoryRules = [];

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
          <h1 class="page-title">Categories</h1>
          <p class="page-subtitle">Organize your transactions with custom categories and auto-categorization rules</p>
        </div>
      </header>

      <section class="manage-section card" id="categories-section">
        <div class="manage-section-header">
          <div>
            <h2 class="manage-section-title">Categories</h2>
            <p class="manage-section-description">Custom categories for organizing transactions</p>
          </div>
          <button class="btn btn-primary btn-sm" id="add-category-btn">+ Add Category</button>
        </div>
        <div id="categories-container" class="category-list">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading categories...</p>
          </div>
        </div>
      </section>

      <section class="manage-section card" id="rules-section">
        <div class="manage-section-header">
          <div>
            <h2 class="manage-section-title">Category Rules</h2>
            <p class="manage-section-description">Auto-categorize transactions based on patterns</p>
          </div>
          <button class="btn btn-primary btn-sm" id="add-rule-btn">+ Add Rule</button>
        </div>
        <div id="rules-container" class="rules-table-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading rules...</p>
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
    </div>
  `;
}

function attachEventListeners() {
  const addCategoryBtn = container.querySelector('#add-category-btn');
  if (addCategoryBtn) {
    const handler = () => showCategoryModal();
    addCategoryBtn.addEventListener('click', handler);
    onCleanup(() => addCategoryBtn.removeEventListener('click', handler));
  }

  const addRuleBtn = container.querySelector('#add-rule-btn');
  if (addRuleBtn) {
    const handler = () => showRuleModal();
    addRuleBtn.addEventListener('click', handler);
    onCleanup(() => addRuleBtn.removeEventListener('click', handler));
  }

  const ruleTestBtn = container.querySelector('#rule-test-btn');
  if (ruleTestBtn) {
    const handler = () => testRule();
    ruleTestBtn.addEventListener('click', handler);
    onCleanup(() => ruleTestBtn.removeEventListener('click', handler));
  }

  const ruleTestInput = container.querySelector('#rule-test-input');
  if (ruleTestInput) {
    const handler = (e) => {
      if (e.key === 'Enter') testRule();
    };
    ruleTestInput.addEventListener('keypress', handler);
    onCleanup(() => ruleTestInput.removeEventListener('keypress', handler));
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

  if ((item = findItemByButtonId(target, '.category-edit-btn', categories))) {
    showCategoryModal(item);
    return;
  }
  if ((item = findItemByButtonId(target, '.category-delete-btn', categories))) {
    confirmDeleteCategory(item);
    return;
  }
  if ((item = findItemByButtonId(target, '.rule-edit-btn', categoryRules))) {
    showRuleModal(item);
    return;
  }
  if ((item = findItemByButtonId(target, '.rule-delete-btn', categoryRules))) {
    confirmDeleteRule(item);
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
    loadCategoryRules()
  ]);
}

// ============= CATEGORIES SECTION =============

async function loadCategories() {
  const categoriesContainer = document.getElementById('categories-container');
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
    categories.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
    renderCategories();
  } catch (err) {
    categoriesContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load categories: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

function renderCategories() {
  const categoriesContainer = document.getElementById('categories-container');
  if (!categories.length) {
    categoriesContainer.innerHTML = `
      <div class="empty-state empty-state--compact">
        <div class="empty-state__icon">📁</div>
        <h3 class="empty-state__title">No categories found</h3>
        <p class="empty-state__description">Create categories to organize your transactions.</p>
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

  categoriesContainer.innerHTML = '';
  categoriesContainer.appendChild(fragment);
}

function showCategoryModal(category = null) {
  const isEdit = category !== null;
  const title = isEdit ? 'Edit Category' : 'Add Category';

  createModal({
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

async function loadCategoryRules() {
  const rulesContainer = document.getElementById('rules-container');
  try {
    const rawRules = await api.get('/category-rules');
    const ruleMap = new Map();
    rawRules.forEach(rule => {
      const existing = ruleMap.get(rule.pattern);
      if (!existing || rule.priority > existing.priority) {
        ruleMap.set(rule.pattern, rule);
      }
    });
    categoryRules = Array.from(ruleMap.values());
    renderCategoryRules();
  } catch (err) {
    rulesContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load rules: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

function renderCategoryRules() {
  const rulesContainer = document.getElementById('rules-container');
  if (!categoryRules.length) {
    rulesContainer.innerHTML = `
      <div class="empty-state empty-state--compact">
        <div class="empty-state__icon">⚙️</div>
        <h3 class="empty-state__title">No category rules configured</h3>
        <p class="empty-state__description">Add rules to auto-categorize transactions based on patterns in descriptions.</p>
      </div>
    `;
    return;
  }

  const sortedRules = [...categoryRules].sort((a, b) => (a.priority || 0) - (b.priority || 0));

  function suggestCategory(pattern) {
    const patternLower = pattern.toLowerCase();
    const suggestions = {
      'restaurant': 'Dining Out',
      'cafe': 'Dining Out',
      'coffee': 'Dining Out',
      'food': 'Groceries',
      'grocery': 'Groceries',
      'supermarket': 'Groceries',
      'tesco': 'Groceries',
      'sainsbury': 'Groceries',
      'amazon': 'Shopping',
      'ebay': 'Shopping',
      'shop': 'Shopping',
      'store': 'Shopping',
      'uber': 'Transport',
      'taxi': 'Transport',
      'bus': 'Transport',
      'train': 'Transport',
      'fuel': 'Transport',
      'petrol': 'Transport',
      'netflix': 'Subscriptions',
      'spotify': 'Subscriptions',
      'subscription': 'Subscriptions',
      'salary': 'Salary Income',
      'wage': 'Salary Income',
      'payroll': 'Salary Income',
      'transfer': 'Transfers'
    };

    for (const [keyword, categoryName] of Object.entries(suggestions)) {
      if (patternLower.includes(keyword)) {
        const match = categories.find(c => c.name === categoryName);
        if (match) return match;
      }
    }

    return categories.find(c => c.name === 'Other') || categories.find(c => c.type === 'expense');
  }

  rulesContainer.innerHTML = `
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
          let category = categories.find(c => c.id === rule.category_id);
          const isUnknown = !category;
          const suggestedCategory = isUnknown ? suggestCategory(rule.pattern) : null;

          return `
            <tr class="${isUnknown ? 'rule-needs-update' : ''}">
              <td><span class="rule-pattern">${escapeHtml(rule.pattern)}</span></td>
              <td>
                ${category ? `
                  <span class="category-badge" style="background-color: ${category.colour}20; color: ${category.colour}">
                    ${category.icon || ''} ${escapeHtml(category.name)}
                  </span>
                ` : `
                  <span class="text-warning">Unassigned</span>
                  ${suggestedCategory ? `
                    <span class="suggested-category">→ ${escapeHtml(suggestedCategory.name)}</span>
                  ` : ''}
                `}
              </td>
              <td class="rule-priority">${rule.priority || 0}</td>
              <td class="rule-actions">
                <button class="btn btn-secondary btn-sm rule-edit-btn" data-id="${rule.id}">${isUnknown ? 'Fix' : 'Edit'}</button>
                <button class="btn btn-danger btn-sm rule-delete-btn" data-id="${rule.id}">Delete</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function showRuleModal(rule = null) {
  const isEdit = rule !== null;
  const title = isEdit ? 'Edit Rule' : 'Add Rule';

  createModal({
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

function testRule() {
  const input = document.getElementById('rule-test-input');
  const resultContainer = document.getElementById('rule-test-result');
  const testValue = input.value.trim().toUpperCase();

  if (!testValue) {
    resultContainer.innerHTML = '';
    return;
  }

  const sortedRules = [...categoryRules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  let matchedRule = null;
  let matchedCategory = null;

  for (const rule of sortedRules) {
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
