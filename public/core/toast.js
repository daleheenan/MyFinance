/**
 * Toast Notification System
 * Provides a global toast notification system to replace alert() dialogs
 */

// Ensure toast container exists
function ensureContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {Object} options - Optional configuration
 * @param {number} options.duration - Auto-dismiss duration in ms (default: 5000, 0 for no auto-dismiss)
 * @param {Function} options.onUndo - If provided, shows an Undo button that calls this function
 */
export function showToast(message, type = 'info', options = {}) {
  const container = ensureContainer();
  const { duration = 5000, onUndo = null } = options;

  const iconMap = {
    success: '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
    error: '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>',
    warning: '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
    info: '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  toast.innerHTML = `
    ${iconMap[type] || iconMap.info}
    <span class="toast-message">${escapeHtml(message)}</span>
    ${onUndo ? '<button type="button" class="toast-undo">Undo</button>' : ''}
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  container.appendChild(toast);

  // Close button handler
  const closeBtn = toast.querySelector('.toast-close');
  const dismiss = () => {
    toast.style.animation = 'fadeOut 0.2s ease forwards';
    setTimeout(() => toast.remove(), 200);
  };
  closeBtn.addEventListener('click', dismiss);

  // Undo button handler
  if (onUndo) {
    const undoBtn = toast.querySelector('.toast-undo');
    undoBtn.addEventListener('click', () => {
      onUndo();
      dismiss();
    });
  }

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  return { dismiss };
}

/**
 * Show a success toast
 */
export function showSuccess(message, options = {}) {
  return showToast(message, 'success', options);
}

/**
 * Show an error toast
 */
export function showError(message, options = {}) {
  return showToast(message, 'error', { duration: 7000, ...options });
}

/**
 * Show a warning toast
 */
export function showWarning(message, options = {}) {
  return showToast(message, 'warning', options);
}

/**
 * Show an info toast
 */
export function showInfo(message, options = {}) {
  return showToast(message, 'info', options);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// Add fadeOut animation if not exists
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; transform: translateX(0); }
    to { opacity: 0; transform: translateX(100%); }
  }
  .toast-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
  .toast-success .toast-icon { color: var(--green); }
  .toast-error .toast-icon { color: var(--red); }
  .toast-warning .toast-icon { color: var(--orange); }
  .toast-info .toast-icon { color: var(--blue); }
  .toast-message {
    flex: 1;
    font-size: var(--text-sm);
    color: var(--text-primary);
  }
  .toast-close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: var(--text-tertiary);
    padding: 0;
    line-height: 1;
  }
  .toast-close:hover {
    color: var(--text-primary);
  }
`;
document.head.appendChild(style);
