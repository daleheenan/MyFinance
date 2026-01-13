/**
 * Savings Goals Page
 * View and manage savings goals
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';
import { showSuccess, showError } from '../../core/toast.js';
import { createModal, showConfirmDialog } from '../../core/modal.js';

// Private state
let container = null;
let cleanupFunctions = [];
let goals = [];

function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

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
  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

function loadStyles() {
  const styleId = 'goals-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/goals/goals.css';
    document.head.appendChild(link);
  }
}

function render() {
  container.innerHTML = `
    <div class="page goals-page">
      <header class="page-header">
        <div class="page-header__content">
          <h1>Savings Goals</h1>
          <p class="page-header__subtitle">Track your progress towards your financial goals</p>
        </div>
        <button class="btn btn-primary" id="add-goal-btn">+ New Goal</button>
      </header>

      <section id="summary-container" class="goals-summary">
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      </section>

      <section id="goals-container" class="goals-grid">
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading goals...</p>
        </div>
      </section>
    </div>
  `;
}

function attachEventListeners() {
  container.addEventListener('click', handleClick);
  onCleanup(() => container.removeEventListener('click', handleClick));
}

async function handleClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  const goalId = target.dataset.goalId;

  switch (action) {
    case 'add-goal':
    case 'create-first-goal':
      showGoalModal();
      break;
    case 'edit-goal':
      showGoalModal(goalId);
      break;
    case 'contribute':
      showContributeModal(goalId);
      break;
    case 'delete-goal':
      await deleteGoal(goalId);
      break;
  }

  // Handle add button
  if (e.target.id === 'add-goal-btn' || e.target.closest('#add-goal-btn')) {
    showGoalModal();
  }
}

async function loadData() {
  try {
    const [goalsResponse, summaryResponse] = await Promise.all([
      api.get('/goals'),
      api.get('/goals/summary')
    ]);

    goals = (goalsResponse.data || goalsResponse) || [];
    renderSummary(summaryResponse.data || summaryResponse);
    renderGoals();
  } catch (err) {
    console.error('Failed to load goals:', err);
    showError('Failed to load savings goals');
  }
}

function renderSummary(summary) {
  const el = document.getElementById('summary-container');
  if (!el || !summary) return;

  const { stats, upcomingGoals } = summary;

  el.innerHTML = `
    <div class="summary-stats">
      <div class="summary-stat">
        <span class="summary-stat__value">${stats.activeGoals}</span>
        <span class="summary-stat__label">Active Goals</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat__value">${formatCurrency(stats.totalSaved)}</span>
        <span class="summary-stat__label">Total Saved</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat__value">${formatCurrency(stats.totalTarget)}</span>
        <span class="summary-stat__label">Total Target</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat__value">${Math.round(stats.overallProgress)}%</span>
        <span class="summary-stat__label">Overall Progress</span>
      </div>
    </div>
    ${upcomingGoals.length > 0 ? `
      <div class="upcoming-goals">
        <h3>Upcoming Deadlines</h3>
        <div class="upcoming-goals__list">
          ${upcomingGoals.map(goal => `
            <div class="upcoming-goal">
              <span class="upcoming-goal__icon">${goal.icon || '🎯'}</span>
              <div class="upcoming-goal__details">
                <span class="upcoming-goal__name">${escapeHtml(goal.name)}</span>
                <span class="upcoming-goal__days">${goal.daysRemaining} days left</span>
              </div>
              <div class="upcoming-goal__amount">
                <span class="upcoming-goal__daily">${formatCurrency(goal.dailyNeeded)}/day needed</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function renderGoals() {
  const el = document.getElementById('goals-container');
  if (!el) return;

  if (goals.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🎯</div>
        <h3 class="empty-state__title">No savings goals yet</h3>
        <p class="empty-state__description">Create your first goal to start tracking your savings progress</p>
        <button class="btn btn-primary" data-action="create-first-goal">Create Goal</button>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="goals-list">
      ${goals.map(goal => renderGoalCard(goal)).join('')}
    </div>
  `;
}

function renderGoalCard(goal) {
  const progress = Math.min(100, Math.round(goal.progress));
  const isCompleted = goal.is_completed === 1;
  const daysRemaining = goal.target_date
    ? Math.ceil((new Date(goal.target_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return `
    <div class="goal-card ${isCompleted ? 'goal-card--completed' : ''}" style="--goal-color: ${goal.colour || '#10B981'}">
      <div class="goal-card__header">
        <span class="goal-card__icon">${goal.icon || '🎯'}</span>
        <div class="goal-card__title">
          <h3>${escapeHtml(goal.name)}</h3>
          ${isCompleted ? '<span class="goal-badge goal-badge--completed">Completed!</span>' : ''}
          ${!isCompleted && daysRemaining !== null && daysRemaining <= 30 ? `<span class="goal-badge goal-badge--urgent">${daysRemaining} days left</span>` : ''}
        </div>
        <div class="goal-card__actions">
          <button class="btn btn-sm btn-ghost" data-action="edit-goal" data-goal-id="${goal.id}" title="Edit">✏️</button>
          <button class="btn btn-sm btn-ghost" data-action="delete-goal" data-goal-id="${goal.id}" title="Delete">🗑️</button>
        </div>
      </div>

      <div class="goal-card__progress">
        <div class="progress-bar">
          <div class="progress-bar__fill" style="width: ${progress}%"></div>
        </div>
        <div class="progress-labels">
          <span class="progress-label">${formatCurrency(goal.current_amount)} saved</span>
          <span class="progress-label">${progress}%</span>
        </div>
      </div>

      <div class="goal-card__details">
        <div class="goal-detail">
          <span class="goal-detail__label">Target</span>
          <span class="goal-detail__value">${formatCurrency(goal.target_amount)}</span>
        </div>
        <div class="goal-detail">
          <span class="goal-detail__label">Remaining</span>
          <span class="goal-detail__value">${formatCurrency(goal.remaining)}</span>
        </div>
        ${goal.target_date ? `
          <div class="goal-detail">
            <span class="goal-detail__label">Target Date</span>
            <span class="goal-detail__value">${new Date(goal.target_date).toLocaleDateString()}</span>
          </div>
        ` : ''}
      </div>

      ${!isCompleted ? `
        <div class="goal-card__footer">
          <button class="btn btn-primary btn-sm" data-action="contribute" data-goal-id="${goal.id}">
            + Add Contribution
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

async function showGoalModal(goalId = null) {
  const isEdit = !!goalId;
  let goal = null;

  if (isEdit) {
    try {
      const response = await api.get(`/goals/${goalId}`);
      goal = response.data || response;
    } catch (err) {
      showError('Failed to load goal');
      return;
    }
  }

  const modal = createModal({
    title: isEdit ? 'Edit Goal' : 'New Savings Goal',
    content: `
      <form id="goal-form" class="modal-form">
        <div class="form-group">
          <label for="goal-name">Goal Name</label>
          <input type="text" id="goal-name" name="name" class="form-input"
            value="${goal ? escapeHtml(goal.name) : ''}" required placeholder="e.g., Emergency Fund">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="goal-target">Target Amount (£)</label>
            <input type="number" id="goal-target" name="targetAmount" class="form-input"
              value="${goal ? goal.target_amount : ''}" required min="1" step="0.01" placeholder="1000">
          </div>
          <div class="form-group">
            <label for="goal-date">Target Date (optional)</label>
            <input type="date" id="goal-date" name="targetDate" class="form-input"
              value="${goal?.target_date || ''}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="goal-icon">Icon</label>
            <select id="goal-icon" name="icon" class="form-input">
              <option value="🎯" ${goal?.icon === '🎯' ? 'selected' : ''}>🎯 Target</option>
              <option value="🏠" ${goal?.icon === '🏠' ? 'selected' : ''}>🏠 Home</option>
              <option value="🚗" ${goal?.icon === '🚗' ? 'selected' : ''}>🚗 Car</option>
              <option value="✈️" ${goal?.icon === '✈️' ? 'selected' : ''}>✈️ Travel</option>
              <option value="💍" ${goal?.icon === '💍' ? 'selected' : ''}>💍 Wedding</option>
              <option value="🎓" ${goal?.icon === '🎓' ? 'selected' : ''}>🎓 Education</option>
              <option value="💰" ${goal?.icon === '💰' ? 'selected' : ''}>💰 Savings</option>
              <option value="🛡️" ${goal?.icon === '🛡️' ? 'selected' : ''}>🛡️ Emergency</option>
              <option value="📱" ${goal?.icon === '📱' ? 'selected' : ''}>📱 Tech</option>
              <option value="🎁" ${goal?.icon === '🎁' ? 'selected' : ''}>🎁 Gift</option>
            </select>
          </div>
          <div class="form-group">
            <label for="goal-colour">Colour</label>
            <input type="color" id="goal-colour" name="colour" class="form-input form-input--color"
              value="${goal?.colour || '#10B981'}">
          </div>
        </div>
        ${isEdit ? `
          <div class="form-group">
            <label for="goal-current">Current Amount (£)</label>
            <input type="number" id="goal-current" name="currentAmount" class="form-input"
              value="${goal.current_amount}" min="0" step="0.01" disabled>
            <small class="form-hint">Use contributions to update saved amount</small>
          </div>
        ` : ''}
      </form>
    `,
    buttons: [
      { label: 'Cancel', variant: 'secondary', action: 'close' },
      { label: isEdit ? 'Save Changes' : 'Create Goal', variant: 'primary', action: 'save' }
    ],
    onAction: async (action) => {
      if (action === 'save') {
        await saveGoal(goalId, modal);
      }
    }
  });
}

async function saveGoal(goalId, modal) {
  const form = document.getElementById('goal-form');
  const formData = new FormData(form);

  const data = {
    name: formData.get('name'),
    targetAmount: parseFloat(formData.get('targetAmount')),
    targetDate: formData.get('targetDate') || null,
    icon: formData.get('icon'),
    colour: formData.get('colour')
  };

  try {
    if (goalId) {
      await api.put(`/goals/${goalId}`, data);
      showSuccess('Goal updated');
    } else {
      await api.post('/goals', data);
      showSuccess('Goal created');
    }
    modal.close();
    await loadData();
  } catch (err) {
    showError(err.message || 'Failed to save goal');
  }
}

async function showContributeModal(goalId) {
  const goal = goals.find(g => g.id === parseInt(goalId, 10));
  if (!goal) return;

  const modal = createModal({
    title: `Add Contribution to "${escapeHtml(goal.name)}"`,
    content: `
      <form id="contribute-form" class="modal-form">
        <div class="contribute-current">
          <span>Current: ${formatCurrency(goal.current_amount)}</span>
          <span>Remaining: ${formatCurrency(goal.remaining)}</span>
        </div>
        <div class="form-group">
          <label for="contrib-amount">Amount (£)</label>
          <input type="number" id="contrib-amount" name="amount" class="form-input"
            required min="0.01" step="0.01" placeholder="100">
        </div>
        <div class="form-group">
          <label for="contrib-date">Date</label>
          <input type="date" id="contrib-date" name="contributionDate" class="form-input"
            value="${new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label for="contrib-notes">Notes (optional)</label>
          <input type="text" id="contrib-notes" name="notes" class="form-input"
            placeholder="e.g., Monthly contribution">
        </div>
      </form>
    `,
    buttons: [
      { label: 'Cancel', variant: 'secondary', action: 'close' },
      { label: 'Add Contribution', variant: 'primary', action: 'contribute' }
    ],
    onAction: async (action) => {
      if (action === 'contribute') {
        const form = document.getElementById('contribute-form');
        const formData = new FormData(form);

        try {
          await api.post(`/goals/${goalId}/contribute`, {
            amount: parseFloat(formData.get('amount')),
            contributionDate: formData.get('contributionDate'),
            notes: formData.get('notes')
          });
          showSuccess('Contribution added!');
          modal.close();
          await loadData();
        } catch (err) {
          showError(err.message || 'Failed to add contribution');
        }
      }
    }
  });
}

async function deleteGoal(goalId) {
  const confirmed = await showConfirmDialog({
    title: 'Delete Goal',
    message: 'Are you sure you want to delete this savings goal? This action cannot be undone.',
    confirmLabel: 'Delete',
    confirmVariant: 'danger'
  });

  if (confirmed) {
    try {
      await api.delete(`/goals/${goalId}`);
      showSuccess('Goal deleted');
      await loadData();
    } catch (err) {
      showError(err.message || 'Failed to delete goal');
    }
  }
}
