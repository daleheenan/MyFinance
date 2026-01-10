/**
 * Modal Accessibility Utilities
 * Provides focus trap, Escape key handling, and ARIA support for modals
 */

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
  const title = modal.querySelector('.modal-header h2, [class*="modal"] h2');
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
