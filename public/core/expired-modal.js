/**
 * Expired Account Modal Component
 *
 * Full-screen modal that blocks the app when trial has expired.
 * Cannot be dismissed without taking an action:
 * - "Upgrade Now" - Links to pricing page
 * - "Logout" - Logs out the user
 *
 * This modal prevents access to the app until the user upgrades or logs out.
 */

import { auth } from './auth.js';

let modalElement = null;

/**
 * Show the expired account modal
 * This modal cannot be dismissed - user must upgrade or logout
 */
export function showExpiredModal() {
  // Don't show multiple modals
  if (modalElement) {
    return;
  }

  // Create modal overlay
  modalElement = document.createElement('div');
  modalElement.id = 'expired-modal';
  modalElement.className = 'expired-modal';

  modalElement.innerHTML = `
    <div class="expired-modal__backdrop"></div>
    <div class="expired-modal__container">
      <div class="expired-modal__icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="64" height="64">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 class="expired-modal__title">Your trial has ended</h2>
      <p class="expired-modal__message">
        Your 7-day free trial of Flow Money Manager has expired.
        To continue managing your finances, please upgrade to our Pro plan.
      </p>
      <div class="expired-modal__features">
        <h3>Pro Plan includes:</h3>
        <ul>
          <li>Unlimited bank accounts</li>
          <li>Advanced auto-categorization</li>
          <li>Custom category rules</li>
          <li>Budget tracking</li>
          <li>Subscription detection</li>
          <li>Priority support</li>
        </ul>
      </div>
      <div class="expired-modal__actions">
        <a href="/pricing" class="expired-modal__btn expired-modal__btn--primary">
          Upgrade Now
        </a>
        <button type="button" class="expired-modal__btn expired-modal__btn--secondary" id="expired-modal-logout">
          Logout
        </button>
      </div>
      <p class="expired-modal__footer">
        Questions? <a href="/contact">Contact us</a>
      </p>
    </div>
  `;

  // Add to document
  document.body.appendChild(modalElement);

  // Prevent scrolling on body
  document.body.style.overflow = 'hidden';

  // Add event listener for logout button
  const logoutBtn = document.getElementById('expired-modal-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Prevent closing with Escape key
  document.addEventListener('keydown', preventEscapeClose);
}

/**
 * Hide the expired account modal
 */
export function hideExpiredModal() {
  if (modalElement) {
    modalElement.remove();
    modalElement = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', preventEscapeClose);
  }
}

/**
 * Handle logout action
 */
async function handleLogout() {
  try {
    await auth.logout();
    hideExpiredModal();
    window.location.href = '/app#/login';
    window.location.reload();
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

/**
 * Prevent closing modal with Escape key
 */
function preventEscapeClose(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
  }
}

/**
 * Check if modal is currently shown
 * @returns {boolean}
 */
export function isExpiredModalShown() {
  return modalElement !== null;
}

/**
 * Update modal visibility based on subscription status
 * @param {object} subscription - Subscription status object
 */
export function updateExpiredModal(subscription) {
  if (!subscription) {
    hideExpiredModal();
    return;
  }

  // Show modal only if trial is expired
  if (subscription.is_expired) {
    showExpiredModal();
  } else {
    hideExpiredModal();
  }
}

// Inject styles for the modal
const styles = `
  .expired-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .expired-modal__backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
  }

  .expired-modal__container {
    position: relative;
    background: #ffffff;
    border-radius: 1rem;
    padding: 2.5rem;
    max-width: 480px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    text-align: center;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    animation: expiredModalSlideIn 0.3s ease-out;
  }

  @keyframes expiredModalSlideIn {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .expired-modal__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    border-radius: 50%;
    color: #dc2626;
    margin-bottom: 1.5rem;
  }

  .expired-modal__title {
    font-size: 1.75rem;
    font-weight: 700;
    color: #111827;
    margin: 0 0 1rem 0;
  }

  .expired-modal__message {
    font-size: 1rem;
    color: #6b7280;
    line-height: 1.6;
    margin: 0 0 1.5rem 0;
  }

  .expired-modal__features {
    background: #f9fafb;
    border-radius: 0.75rem;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    text-align: left;
  }

  .expired-modal__features h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    margin: 0 0 0.75rem 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .expired-modal__features ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .expired-modal__features li {
    font-size: 0.9375rem;
    color: #4b5563;
    padding: 0.375rem 0;
    padding-left: 1.5rem;
    position: relative;
  }

  .expired-modal__features li::before {
    content: "\\2713";
    position: absolute;
    left: 0;
    color: #10b981;
    font-weight: bold;
  }

  .expired-modal__actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .expired-modal__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.875rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    border: none;
  }

  .expired-modal__btn--primary {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: #ffffff;
  }

  .expired-modal__btn--primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
  }

  .expired-modal__btn--secondary {
    background: transparent;
    color: #6b7280;
    border: 1px solid #e5e7eb;
  }

  .expired-modal__btn--secondary:hover {
    background: #f9fafb;
    color: #374151;
  }

  .expired-modal__footer {
    font-size: 0.875rem;
    color: #9ca3af;
    margin: 0;
  }

  .expired-modal__footer a {
    color: #3b82f6;
    text-decoration: none;
  }

  .expired-modal__footer a:hover {
    text-decoration: underline;
  }

  /* Mobile adjustments */
  @media (max-width: 480px) {
    .expired-modal__container {
      padding: 1.5rem;
      width: 95%;
    }

    .expired-modal__title {
      font-size: 1.5rem;
    }

    .expired-modal__icon {
      width: 64px;
      height: 64px;
    }

    .expired-modal__icon svg {
      width: 48px;
      height: 48px;
    }
  }
`;

// Inject styles into document
function injectStyles() {
  if (!document.getElementById('expired-modal-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'expired-modal-styles';
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }
}

// Inject styles when module loads
injectStyles();
