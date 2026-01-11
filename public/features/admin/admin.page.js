/**
 * Admin Users Page
 * Admin-only interface for managing all user accounts
 */

import { api } from '../../core/api.js';
import { showToast } from '../../core/toast.js';
import { formatDate, formatDateTime } from '../../core/utils.js';

let users = [];
let selectedUser = null;

export async function render() {
  const container = document.getElementById('app');
  container.innerHTML = `
    <div class="admin-page">
      <header class="page-header">
        <h1>User Management</h1>
        <p class="page-subtitle">Admin-only access to manage all user accounts</p>
      </header>

      <div class="admin-actions">
        <button class="btn btn-primary" id="addUserBtn">
          <span class="icon">+</span> Add User
        </button>
        <button class="btn btn-outline" id="refreshBtn">
          <span class="icon">&#x21bb;</span> Refresh
        </button>
      </div>

      <div class="admin-content">
        <div class="users-table-container">
          <table class="users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Email</th>
                <th>Status</th>
                <th>Subscription</th>
                <th>Trial End</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="usersTableBody">
              <tr><td colspan="8" class="loading-cell">Loading users...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- User Detail Modal -->
      <div id="userDetailModal" class="modal-overlay" style="display: none;">
        <div class="modal-content modal-large">
          <button class="modal-close" data-action="close-modal">&times;</button>
          <div id="userDetailContent"></div>
        </div>
      </div>

      <!-- Add User Modal -->
      <div id="addUserModal" class="modal-overlay" style="display: none;">
        <div class="modal-content">
          <button class="modal-close" data-action="close-modal">&times;</button>
          <h2>Add New User</h2>
          <form id="addUserForm">
            <div class="form-group">
              <label for="newUsername">Username *</label>
              <input type="text" id="newUsername" name="username" required minlength="3">
            </div>
            <div class="form-group">
              <label for="newEmail">Email</label>
              <input type="email" id="newEmail" name="email">
            </div>
            <div class="form-group">
              <label for="newFullName">Full Name</label>
              <input type="text" id="newFullName" name="full_name">
            </div>
            <div class="form-group">
              <label for="newPassword">Password *</label>
              <input type="password" id="newPassword" name="password" required minlength="8">
            </div>
            <div class="form-group">
              <label for="newTrialDays">Trial Period (days)</label>
              <input type="number" id="newTrialDays" name="trial_days" value="7" min="1" max="365">
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Create User</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Confirm Delete Modal -->
      <div id="confirmDeleteModal" class="modal-overlay" style="display: none;">
        <div class="modal-content">
          <button class="modal-close" data-action="close-modal">&times;</button>
          <h2>Confirm Delete User</h2>
          <p id="deleteConfirmText"></p>
          <p class="warning-text">This action cannot be undone. All user data including accounts, transactions, and settings will be permanently deleted.</p>
          <div class="form-actions">
            <button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button>
            <button type="button" class="btn btn-danger" id="confirmDeleteBtn">Delete User</button>
          </div>
        </div>
      </div>
    </div>
  `;

  setupEventListeners();
  await loadUsers();
}

function setupEventListeners() {
  document.getElementById('addUserBtn').addEventListener('click', () => {
    document.getElementById('addUserModal').style.display = 'flex';
  });

  document.getElementById('refreshBtn').addEventListener('click', loadUsers);

  document.getElementById('addUserForm').addEventListener('submit', handleAddUser);

  // Close modals
  document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    });
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  });

  // Table row actions
  document.getElementById('usersTableBody').addEventListener('click', handleTableAction);

  // Confirm delete
  document.getElementById('confirmDeleteBtn').addEventListener('click', handleConfirmDelete);
}

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">Loading users...</td></tr>';

  try {
    users = await api.get('/admin/users');
    renderUsersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="error-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(user => {
    const statusClass = user.is_active ? 'status-active' : 'status-inactive';
    const statusText = user.locked_until && new Date(user.locked_until) > new Date()
      ? 'Locked'
      : (user.is_active ? 'Active' : 'Inactive');

    const subStatusClass = getSubscriptionStatusClass(user.subscription_status);

    return `
      <tr data-user-id="${user.id}">
        <td>${user.id}${user.is_admin ? ' <span class="admin-badge">Admin</span>' : ''}</td>
        <td>${escapeHtml(user.username)}</td>
        <td>${user.email ? escapeHtml(user.email) : '<span class="text-muted">Not set</span>'}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td><span class="subscription-badge ${subStatusClass}">${user.subscription_status || 'trial'}</span></td>
        <td>${user.trial_end_date ? formatDate(user.trial_end_date) : '-'}</td>
        <td>${user.last_login ? formatDateTime(user.last_login) : 'Never'}</td>
        <td class="actions-cell">
          <button class="btn btn-sm btn-outline" data-action="view" data-user-id="${user.id}" title="View Details">
            View
          </button>
          ${!user.is_admin ? `
            <button class="btn btn-sm btn-danger" data-action="delete" data-user-id="${user.id}" title="Delete User">
              Delete
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

function getSubscriptionStatusClass(status) {
  switch (status) {
    case 'active': return 'sub-active';
    case 'trial': return 'sub-trial';
    case 'expired': return 'sub-expired';
    case 'canceled': return 'sub-canceled';
    default: return 'sub-trial';
  }
}

async function handleTableAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const userId = parseInt(btn.dataset.userId, 10);

  if (action === 'view') {
    await showUserDetail(userId);
  } else if (action === 'delete') {
    showDeleteConfirmation(userId);
  }
}

async function showUserDetail(userId) {
  const modal = document.getElementById('userDetailModal');
  const content = document.getElementById('userDetailContent');
  content.innerHTML = '<p class="loading">Loading user details...</p>';
  modal.style.display = 'flex';

  try {
    const [userResponse, historyResponse, sessionsResponse] = await Promise.all([
      api.get(`/admin/users/${userId}`),
      api.get(`/admin/users/${userId}/login-history?limit=20`),
      api.get(`/admin/users/${userId}/sessions`)
    ]);

    if (!userResponse.success) {
      content.innerHTML = `<p class="error">${userResponse.error}</p>`;
      return;
    }

    const user = userResponse.data;
    const history = historyResponse.success ? historyResponse.data : [];
    const sessions = sessionsResponse.success ? sessionsResponse.data : [];
    selectedUser = user;

    content.innerHTML = `
      <div class="user-detail">
        <div class="user-detail-header">
          <h2>${escapeHtml(user.username)}${user.is_admin ? ' <span class="admin-badge">Admin</span>' : ''}</h2>
          <p class="user-id">User ID: ${user.id}</p>
        </div>

        <div class="user-detail-grid">
          <div class="detail-section">
            <h3>Account Info</h3>
            <dl>
              <dt>Email</dt>
              <dd>${user.email ? escapeHtml(user.email) : '<span class="text-muted">Not set</span>'}</dd>
              <dt>Full Name</dt>
              <dd>${user.full_name ? escapeHtml(user.full_name) : '<span class="text-muted">Not set</span>'}</dd>
              <dt>Status</dt>
              <dd><span class="status-badge ${user.is_active ? 'status-active' : 'status-inactive'}">${user.is_active ? 'Active' : 'Inactive'}</span></dd>
              <dt>Created</dt>
              <dd>${formatDateTime(user.created_at)}</dd>
              <dt>Last Login</dt>
              <dd>${user.last_login ? formatDateTime(user.last_login) : 'Never'}</dd>
              <dt>Last Password Reset</dt>
              <dd>${user.last_password_reset ? formatDateTime(user.last_password_reset) : 'Never'}</dd>
            </dl>
          </div>

          <div class="detail-section">
            <h3>Subscription</h3>
            <dl>
              <dt>Status</dt>
              <dd><span class="subscription-badge ${getSubscriptionStatusClass(user.subscription_status)}">${user.subscription_status || 'trial'}</span></dd>
              <dt>Trial Start</dt>
              <dd>${user.trial_start_date ? formatDate(user.trial_start_date) : '-'}</dd>
              <dt>Trial End</dt>
              <dd>${user.trial_end_date ? formatDate(user.trial_end_date) : '-'}</dd>
            </dl>
            <div class="action-buttons">
              <button class="btn btn-sm btn-outline" data-action="extend-trial">Extend Trial</button>
              <button class="btn btn-sm btn-primary" data-action="activate">Activate</button>
            </div>
          </div>

          <div class="detail-section">
            <h3>Security</h3>
            <dl>
              <dt>Failed Login Attempts</dt>
              <dd>${user.failed_login_count}</dd>
              <dt>Locked Until</dt>
              <dd>${user.locked_until && new Date(user.locked_until) > new Date() ? formatDateTime(user.locked_until) : 'Not locked'}</dd>
            </dl>
            <div class="action-buttons">
              ${user.locked_until && new Date(user.locked_until) > new Date()
                ? '<button class="btn btn-sm btn-primary" data-action="unlock">Unlock Account</button>'
                : '<button class="btn btn-sm btn-outline" data-action="lock">Lock Account</button>'}
              <button class="btn btn-sm btn-outline" data-action="reset-password">Reset Password</button>
              <button class="btn btn-sm btn-outline" data-action="revoke-sessions">Revoke Sessions</button>
            </div>
          </div>

          <div class="detail-section">
            <h3>Usage Stats</h3>
            <dl>
              <dt>Accounts</dt>
              <dd>${user.account_count}</dd>
              <dt>Transactions</dt>
              <dd>${user.transaction_count}</dd>
            </dl>
          </div>
        </div>

        <div class="detail-section full-width">
          <h3>Active Sessions (${sessions.length})</h3>
          ${sessions.length > 0 ? `
            <table class="mini-table">
              <thead>
                <tr>
                  <th>IP Address</th>
                  <th>User Agent</th>
                  <th>Created</th>
                  <th>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                ${sessions.map(s => `
                  <tr>
                    <td>${escapeHtml(s.ip_address || 'Unknown')}</td>
                    <td class="truncate">${escapeHtml(s.user_agent?.slice(0, 50) || 'Unknown')}...</td>
                    <td>${formatDateTime(s.created_at)}</td>
                    <td>${formatDateTime(s.last_activity)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p class="text-muted">No active sessions</p>'}
        </div>

        <div class="detail-section full-width">
          <h3>Login History (Last 20)</h3>
          ${history.length > 0 ? `
            <table class="mini-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>IP Address</th>
                  <th>Result</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                ${history.map(h => `
                  <tr>
                    <td>${formatDateTime(h.timestamp)}</td>
                    <td>${escapeHtml(h.ip_address || 'Unknown')}</td>
                    <td><span class="status-badge ${h.success ? 'status-active' : 'status-inactive'}">${h.success ? 'Success' : 'Failed'}</span></td>
                    <td>${h.failure_reason ? escapeHtml(h.failure_reason) : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p class="text-muted">No login history</p>'}
        </div>
      </div>
    `;

    // Add event listeners for action buttons
    content.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleUserAction(btn.dataset.action, user.id));
    });

  } catch (err) {
    content.innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
}

async function handleUserAction(action, userId) {
  switch (action) {
    case 'extend-trial':
      const newDate = prompt('Enter new trial end date (YYYY-MM-DD):');
      if (newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        const result = await api.post(`/admin/users/${userId}/extend-trial`, { end_date: newDate });
        if (result.success) {
          showToast('Trial extended successfully', 'success');
          await showUserDetail(userId);
          await loadUsers();
        } else {
          showToast(result.error || 'Failed to extend trial', 'error');
        }
      } else if (newDate) {
        showToast('Invalid date format. Use YYYY-MM-DD', 'error');
      }
      break;

    case 'activate':
      if (confirm('Activate this user\'s subscription?')) {
        const result = await api.post(`/admin/users/${userId}/activate`);
        if (result.success) {
          showToast('User activated successfully', 'success');
          await showUserDetail(userId);
          await loadUsers();
        } else {
          showToast(result.error || 'Failed to activate user', 'error');
        }
      }
      break;

    case 'lock':
      if (confirm('Lock this user account?')) {
        const result = await api.post(`/admin/users/${userId}/lock`);
        if (result.success) {
          showToast('Account locked', 'success');
          await showUserDetail(userId);
          await loadUsers();
        } else {
          showToast(result.error || 'Failed to lock account', 'error');
        }
      }
      break;

    case 'unlock':
      const unlockResult = await api.post(`/admin/users/${userId}/unlock`);
      if (unlockResult.success) {
        showToast('Account unlocked', 'success');
        await showUserDetail(userId);
        await loadUsers();
      } else {
        showToast(unlockResult.error || 'Failed to unlock account', 'error');
      }
      break;

    case 'reset-password':
      const newPassword = prompt('Enter new password (min 8 characters):');
      if (newPassword && newPassword.length >= 8) {
        const result = await api.post(`/admin/users/${userId}/reset-password`, { password: newPassword });
        if (result.success) {
          showToast('Password reset successfully', 'success');
          await showUserDetail(userId);
        } else {
          showToast(result.error || 'Failed to reset password', 'error');
        }
      } else if (newPassword) {
        showToast('Password must be at least 8 characters', 'error');
      }
      break;

    case 'revoke-sessions':
      if (confirm('Revoke all sessions for this user? They will be logged out everywhere.')) {
        const result = await api.post(`/admin/users/${userId}/revoke-sessions`);
        if (result.success) {
          showToast(`Revoked ${result.data.revoked} session(s)`, 'success');
          await showUserDetail(userId);
        } else {
          showToast(result.error || 'Failed to revoke sessions', 'error');
        }
      }
      break;
  }
}

function showDeleteConfirmation(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  selectedUser = user;
  document.getElementById('deleteConfirmText').textContent =
    `Are you sure you want to delete user "${user.username}"? They have ${user.account_count} account(s) and ${user.transaction_count} transaction(s).`;
  document.getElementById('confirmDeleteModal').style.display = 'flex';
}

async function handleConfirmDelete() {
  if (!selectedUser) return;

  const result = await api.delete(`/admin/users/${selectedUser.id}`);
  if (result.success) {
    showToast(`Deleted user "${result.data.username}" with ${result.data.accounts} accounts and ${result.data.transactions} transactions`, 'success');
    document.getElementById('confirmDeleteModal').style.display = 'none';
    selectedUser = null;
    await loadUsers();
  } else {
    showToast(result.error || 'Failed to delete user', 'error');
  }
}

async function handleAddUser(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  const userData = {
    username: formData.get('username'),
    email: formData.get('email') || undefined,
    full_name: formData.get('full_name') || undefined,
    password: formData.get('password'),
    trial_days: parseInt(formData.get('trial_days'), 10) || 7
  };

  const result = await api.post('/admin/users', userData);
  if (result.success) {
    showToast(`User "${result.data.username}" created successfully`, 'success');
    document.getElementById('addUserModal').style.display = 'none';
    form.reset();
    await loadUsers();
  } else {
    showToast(result.error || 'Failed to create user', 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


export async function mount(container, params) {
  await render();
}

export function unmount() {
  destroy();
}
export function destroy() {
  users = [];
  selectedUser = null;
}
