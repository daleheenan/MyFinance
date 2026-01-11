/**
 * Modal Accessibility Utilities
 * Provides focus trap, Escape key handling, and ARIA support for modals
 */

import { escapeHtml } from './utils.js';

/**
 * Setup modal accessibility for a modal element
 * @param {HTMLElement} modal - The modal element
 * @param {Object} options - Configuration options
 * @param {Function} options.onClose - Callback when modal should close
 * @param {HTMLElement} options.triggerElement - Element that triggered the modal (for focus return)
 * @returns {Function} Cleanup function to remove event listeners
 */
export function setupModalAccessibility(modal, options = {}) {
  const { onClose, triggerElement } = options;

  // Store the element that was focused before opening
  const previouslyFocused = triggerElement || document.activeElement;

  // Add ARIA attributes
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  // Find the modal title for aria-labelledby
  const title = modal.querySelector('.modal-header h2, .modal-header h3, [class*="modal"] h2, [class*="modal"] h3');
  if (title) {
    const titleId = title.id || `modal-title-${Date.now()}`;
    title.id = titleId;
    modal.setAttribute('aria-labelledby', titleId);
  }

  // Get all focusable elements within the modal
  const getFocusableElements = () => {
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    return Array.from(modal.querySelectorAll(focusableSelectors))
      .filter(el => {
        // Filter out hidden elements
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
  };

  // Focus the first focusable element
  const focusFirst = () => {
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  };

  // Handle Escape key
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (onClose) {
        onClose();
      }
    }

    // Handle Tab key for focus trap
    if (e.key === 'Tab') {
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift + Tab: If on first element, go to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: If on last element, go to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  // Add event listeners
  document.addEventListener('keydown', handleKeyDown);

  // Focus first element after a short delay (for animation)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      focusFirst();
    });
  });

  // Return cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyDown);

    // Return focus to trigger element
    if (previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus();
    }

    // Clean up ARIA attributes
    modal.removeAttribute('aria-labelledby');
  };
}

/**
 * Simple modal show/hide with accessibility
 * @param {HTMLElement} modal - The modal element
 * @param {boolean} show - Whether to show or hide
 * @param {Object} options - Options for setupModalAccessibility
 * @returns {Function|null} Cleanup function when showing, null when hiding
 */
export function toggleModal(modal, show, options = {}) {
  if (show) {
    modal.classList.remove('hidden');
    return setupModalAccessibility(modal, options);
  } else {
    modal.classList.add('hidden');
    return null;
  }
}

/**
 * Create a reusable modal manager
 * @param {HTMLElement} modal - The modal element
 * @param {Function} onClose - Callback when modal closes
 * @returns {Object} Modal manager with open/close methods
 */
export function createModalManager(modal, onClose) {
  let cleanup = null;
  let triggerElement = null;

  return {
    open(trigger = null) {
      triggerElement = trigger || document.activeElement;
      modal.classList.remove('hidden');
      cleanup = setupModalAccessibility(modal, {
        onClose: () => this.close(),
        triggerElement
      });
    },

    close() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      modal.classList.add('hidden');
      if (onClose) {
        onClose();
      }
    },

    isOpen() {
      return !modal.classList.contains('hidden');
    }
  };
}

/**
 * Create and show an accessible modal dialog
 * This is the recommended way to create modals with full accessibility support
 * @param {Object} options - Modal configuration
 * @param {string} options.title - Modal title
 * @param {string} options.content - Modal body HTML content
 * @param {string} [options.footer] - Modal footer HTML (buttons)
 * @param {string} [options.size] - Modal size: 'sm', 'md', 'lg' (default: 'md')
 * @param {Function} [options.onMount] - Callback after modal is mounted
 * @param {Function} [options.onSave] - Callback when save button clicked (if using #modal-save)
 * @param {Function} [options.onClose] - Callback when modal closes
 * @param {HTMLElement} [options.triggerElement] - Element that triggered the modal
 * @returns {Object} Object with close() method
 */
export function createModal({
  title,
  content,
  footer,
  size = 'md',
  onMount,
  onSave,
  onClose,
  triggerElement
} = {}) {
  // Store trigger element for focus return
  const trigger = triggerElement || document.activeElement;

  // Remove any existing modal
  const existingModal = document.querySelector('.modal-overlay');
  if (existingModal) existingModal.remove();

  // Create modal element
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'presentation');

  const sizeClass = size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : '';

  overlay.innerHTML = `
    <div class="modal ${sizeClass}" role="dialog" aria-modal="true" aria-labelledby="modal-title-${Date.now()}">
      <div class="modal-header">
        <h3 class="modal-title" id="modal-title-${Date.now()}">${escapeHtml(title)}</h3>
        <button class="modal-close" id="modal-close-x" aria-label="Close modal" type="button">&times;</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);

  const modalElement = overlay.querySelector('.modal');

  // Close function
  const closeModal = () => {
    // Return focus to trigger element
    if (trigger && trigger.focus) {
      trigger.focus();
    }
    overlay.remove();
    if (onClose) {
      onClose();
    }
  };

  // Setup accessibility - focus trap
  const getFocusableElements = () => {
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    return Array.from(modalElement.querySelectorAll(focusableSelectors))
      .filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
  };

  // Keyboard handler for Escape and Tab
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }

    // Focus trap
    if (e.key === 'Tab') {
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  // Close button handler
  const closeX = overlay.querySelector('#modal-close-x');
  if (closeX) {
    closeX.addEventListener('click', closeModal);
  }

  // Cancel button handler (if exists)
  const cancelBtn = overlay.querySelector('#modal-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // Save handler
  const saveBtn = overlay.querySelector('#modal-save');
  if (saveBtn && onSave) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      const originalText = saveBtn.textContent;
      saveBtn.textContent = 'Saving...';
      try {
        const success = await onSave();
        if (success) {
          document.removeEventListener('keydown', handleKeyDown);
          closeModal();
        } else {
          saveBtn.disabled = false;
          saveBtn.textContent = originalText;
        }
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    });
  }

  // Confirm button handler (for confirm dialogs)
  const confirmBtn = overlay.querySelector('#modal-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      const confirmHandler = confirmBtn.dataset.onConfirm;
      if (confirmHandler && window[confirmHandler]) {
        await window[confirmHandler]();
      }
      document.removeEventListener('keydown', handleKeyDown);
      closeModal();
    });
  }

  // Call onMount callback
  if (onMount) {
    onMount(modalElement);
  }

  // Focus first element
  requestAnimationFrame(() => {
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  });

  // Return controller object
  return {
    close: () => {
      document.removeEventListener('keydown', handleKeyDown);
      closeModal();
    },
    element: overlay
  };
}

/**
 * Show a confirmation dialog with accessibility support
 * @param {Object} options - Confirmation dialog options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Confirmation message (can include HTML)
 * @param {string} [options.type='warning'] - Dialog type: 'warning', 'danger', 'info'
 * @param {string} [options.confirmText='Confirm'] - Text for confirm button
 * @param {string} [options.cancelText='Cancel'] - Text for cancel button
 * @param {Function} options.onConfirm - Callback when confirmed
 * @param {Function} [options.onCancel] - Callback when cancelled
 * @param {HTMLElement} [options.triggerElement] - Element that triggered the dialog
 * @returns {Object} Object with close() method
 */
export function showConfirmDialog({
  title,
  message,
  type = 'warning',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  triggerElement
} = {}) {
  const iconMap = {
    warning: '⚠️',
    danger: '🚨',
    info: 'ℹ️'
  };

  const buttonClass = type === 'danger' ? 'btn-danger' : 'btn-primary';

  return createModal({
    title,
    content: `
      <div class="confirm-dialog">
        <div class="confirm-dialog-icon ${type}">${iconMap[type] || iconMap.warning}</div>
        <div class="confirm-dialog-message">${message}</div>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" id="modal-cancel" type="button">${escapeHtml(cancelText)}</button>
      <button class="btn ${buttonClass}" id="modal-confirm-action" type="button">${escapeHtml(confirmText)}</button>
    `,
    size: 'sm',
    triggerElement,
    onMount: (modal) => {
      const confirmActionBtn = modal.querySelector('#modal-confirm-action');
      if (confirmActionBtn && onConfirm) {
        confirmActionBtn.addEventListener('click', async () => {
          confirmActionBtn.disabled = true;
          await onConfirm();
          modal.closest('.modal-overlay')?.remove();
        });
      }
    },
    onClose: onCancel
  });
}
