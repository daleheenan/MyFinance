/**
 * Settings Page Module
 * Manages import history, export, profile, subscription, and security settings
 */

import { api } from '../../core/api.js';
import { escapeHtml, formatCurrency, formatDate } from '../../core/utils.js';
import { auth } from '../../core/auth.js';
import { createModal, showConfirmDialog } from '../../core/modal.js';

let container = null;
let billingConfig = null;
let subscriptionStatus = null;
let userEmail = null;
let cleanupFunctions = [];
let accounts = [];
let importBatches = [];

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
  const user = auth.getUser();
  const isAdmin = user?.isAdmin;

  container.innerHTML = `
    <div class="page settings-page">
      ${isAdmin ? `
      <section class="settings-section admin-section" id="admin-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Administration</h2>
            <p class="settings-section-description">Manage users, system settings, and view admin controls</p>
          </div>
          <a href="#/admin" class="btn btn-primary btn-sm">Open Admin Panel</a>
        </div>
        <div class="admin-quick-links">
          <a href="#/admin" class="admin-link-card">
            <span class="admin-link-icon">👥</span>
            <span class="admin-link-text">User Management</span>
          </a>
          <a href="#/cms" class="admin-link-card">
            <span class="admin-link-icon">📝</span>
            <span class="admin-link-text">CMS Editor</span>
          </a>
        </div>
      </section>
      ` : ''}

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

      <section class="settings-section" id="version-section">
        <div class="settings-section-header">
          <div>
            <h2 class="settings-section-title">Version History</h2>
            <p class="settings-section-description">Application version and recent updates</p>
          </div>
        </div>

        <div id="version-container" class="version-container">
          <div class="section-loading">
            <div class="spinner"></div>
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
 * Handle delegated click events
 */
function handleDelegatedClick(e) {
  const target = e.target;

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
    loadImportBatches(),
    loadLoginHistory(),
    loadActiveSessions(),
    loadUserEmail(),
    loadBillingConfig(),
    loadSubscriptionStatus(),
    loadVersionHistory()
  ]);
}

// ============= ACCOUNTS (for import history display) =============

/**
 * Load accounts from API (needed for import history display)
 */
async function loadAccounts() {
  try {
    accounts = await api.get('/accounts');
  } catch (err) {
    console.error('Failed to load accounts:', err);
    accounts = [];
  }
}

// ============= IMPORT HISTORY SECTION =============

/**
 * Load import batches from API
 */
async function loadImportBatches() {
  const importContainer = document.getElementById('import-container');
  try {
    importBatches = await api.get('/import/batches');
    renderImportBatches();
  } catch (err) {
    importContainer.innerHTML = `
      <div class="section-error">
        <p>Failed to load import history: ${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm mt-sm" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

/**
 * Get import status based on results
 * @param {Object} batch - Import batch object
 * @returns {Object} { status: string, label: string, class: string, icon: string }
 */
function getImportStatus(batch) {
  const errorCount = batch.error_count || 0;
  const successCount = batch.success_count || batch.row_count || 0;
  const rowCount = batch.row_count || 0;

  if (errorCount === 0 && successCount === rowCount) {
    return { status: 'success', label: 'Success', class: 'import-status--success', icon: '✓' };
  }
  if (errorCount > 0 && successCount > 0) {
    return { status: 'partial', label: 'Partial', class: 'import-status--partial', icon: '⚠' };
  }
  if (errorCount === rowCount || successCount === 0) {
    return { status: 'failed', label: 'Failed', class: 'import-status--failed', icon: '✕' };
  }
  return { status: 'success', label: 'Success', class: 'import-status--success', icon: '✓' };
}

/**
 * Render import history table
 */
function renderImportBatches() {
  const importContainer = document.getElementById('import-container');
  if (!importBatches || !importBatches.length) {
    importContainer.innerHTML = `
      <div class="section-empty">
        <p>No imports yet. Import transactions from the Transactions page.</p>
      </div>
    `;
    return;
  }

  importContainer.innerHTML = `
    <table class="import-table">
      <thead>
        <tr>
          <th>Status</th>
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
          const status = getImportStatus(batch);
          return `
            <tr class="import-row" data-id="${batch.id}">
              <td>
                <span class="import-status ${status.class}" title="${status.label}">
                  <span class="import-status__icon">${status.icon}</span>
                  <span class="import-status__label">${status.label}</span>
                </span>
              </td>
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

// ============= MODAL UTILITIES =============
// Using shared modal utilities from '../../core/modal.js' with full accessibility support
// (focus trap, focus return, ARIA attributes, Escape key handling)

// ============= TOAST NOTIFICATIONS =============

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) return;

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
  const historyContainer = document.getElementById('login-history-container');
  if (!historyContainer) return;

  try {
    const history = await auth.getLoginHistory(20);
    renderLoginHistory(history);
  } catch (err) {
    historyContainer.innerHTML = `
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
  const historyContainer = document.getElementById('login-history-container');
  if (!history || !history.length) {
    historyContainer.innerHTML = `
      <div class="section-empty">
        <p>No login history available</p>
      </div>
    `;
    return;
  }

  historyContainer.innerHTML = `
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
  const sessionsContainer = document.getElementById('sessions-container');
  if (!sessionsContainer) return;

  try {
    const sessions = await auth.getActiveSessions();
    renderActiveSessions(sessions);
  } catch (err) {
    sessionsContainer.innerHTML = `
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
  const sessionsContainer = document.getElementById('sessions-container');
  if (!sessions || !sessions.length) {
    sessionsContainer.innerHTML = `
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

  sessionsContainer.innerHTML = '';
  sessionsContainer.appendChild(fragment);
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
  const subContainer = document.getElementById('subscription-container');
  if (!subContainer) return;

  if (!billingConfig || !billingConfig.configured) {
    subContainer.innerHTML = `
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
    subContainer.innerHTML = `
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
    const manageBtn = subContainer.querySelector('#manage-subscription-btn');
    if (manageBtn) {
      manageBtn.addEventListener('click', handleManageSubscription);
    }

    const cancelBtn = subContainer.querySelector('#cancel-subscription-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', handleCancelSubscription);
    }

    const resumeBtn = subContainer.querySelector('#resume-subscription-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', handleResumeSubscription);
    }
  } else {
    // Free plan
    subContainer.innerHTML = `
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
    const upgradeBtn = subContainer.querySelector('#upgrade-btn');
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

// ============= VERSION HISTORY SECTION =============

let versionHistory = [];
let currentVersion = null;

/**
 * Load version and version history from API
 */
async function loadVersionHistory() {
  try {
    // Load current version
    const versionRes = await fetch('/api/version');
    if (versionRes.ok) {
      const versionData = await versionRes.json();
      currentVersion = versionData.version;
    }

    // Load version history
    const historyRes = await fetch('/api/version/history');
    if (historyRes.ok) {
      const historyData = await historyRes.json();
      versionHistory = historyData.history || [];
    }

    renderVersionHistory();
  } catch (err) {
    console.error('Failed to load version history:', err);
    renderVersionHistory();
  }
}

/**
 * Render version history section
 */
function renderVersionHistory() {
  const versionContainer = document.getElementById('version-container');
  if (!versionContainer) return;

  versionContainer.innerHTML = `
    <div class="version-current">
      <div class="version-current-header">
        <span class="version-current-label">Current Version</span>
        <span class="version-current-number">${escapeHtml(currentVersion || 'Unknown')}</span>
      </div>
      <p class="version-current-name">Flow Money Manager</p>
    </div>

    ${versionHistory.length > 0 ? `
      <div class="version-history-list">
        <h4 class="version-history-title">Recent Updates</h4>
        ${versionHistory.map((entry, index) => `
          <div class="version-history-item ${index === 0 ? 'latest' : ''}">
            <div class="version-history-item-header">
              <span class="version-history-version">${escapeHtml(entry.version)}</span>
              <span class="version-history-date">${formatDate(entry.released_at)}</span>
            </div>
            ${entry.changelog ? `
              <p class="version-history-changelog">${escapeHtml(entry.changelog)}</p>
            ` : ''}
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="version-history-empty">
        <p>No version history available yet.</p>
      </div>
    `}
  `;
}
