/**
 * Trial Banner Component
 *
 * Displays a notification banner at the top of the app when user is in trial.
 * Shows days remaining or "Trial expired" message.
 * Includes upgrade CTA button linking to pricing page.
 *
 * Style:
 * - Yellow warning bar for active trial
 * - Red bar for expired trial
 */

/**
 * Create and inject the trial banner into the DOM
 * @param {object} subscription - Subscription status object
 * @param {string} subscription.subscription_status - Current status ('trial', 'active', etc.)
 * @param {number} subscription.days_remaining - Days left in trial
 * @param {boolean} subscription.is_expired - Whether trial has expired
 */
export function showTrialBanner(subscription) {
  // Don't show banner if no subscription info or if user has active subscription
  if (!subscription || subscription.subscription_status === 'active') {
    hideTrialBanner();
    return;
  }

  // Remove existing banner if present
  hideTrialBanner();

  const banner = document.createElement('div');
  banner.id = 'trial-banner';
  banner.className = 'trial-banner';

  if (subscription.is_expired) {
    // Expired trial - red banner
    banner.classList.add('trial-banner--expired');
    banner.innerHTML = `
      <div class="trial-banner__content">
        <span class="trial-banner__icon">!</span>
        <span class="trial-banner__message">
          <strong>Trial expired</strong> - Your free trial has ended. Upgrade now to continue using Flow Money Manager.
        </span>
      </div>
      <a href="/pricing" class="trial-banner__cta">Upgrade Now</a>
    `;
  } else {
    // Active trial - yellow warning banner
    banner.classList.add('trial-banner--active');
    const daysText = subscription.days_remaining === 1 ? 'day' : 'days';
    banner.innerHTML = `
      <div class="trial-banner__content">
        <span class="trial-banner__icon">i</span>
        <span class="trial-banner__message">
          <strong>Trial: ${subscription.days_remaining} ${daysText} remaining</strong> - Upgrade to Pro for unlimited access.
        </span>
      </div>
      <a href="/pricing" class="trial-banner__cta">Upgrade Now</a>
    `;
  }

  // Insert banner at the top of the body, before the header
  const mainNav = document.querySelector('.main-nav');
  if (mainNav) {
    document.body.insertBefore(banner, mainNav);
  } else {
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // Add body class to adjust layout
  document.body.classList.add('has-trial-banner');
}

/**
 * Hide and remove the trial banner from the DOM
 */
export function hideTrialBanner() {
  const existingBanner = document.getElementById('trial-banner');
  if (existingBanner) {
    existingBanner.remove();
    document.body.classList.remove('has-trial-banner');
  }
}

/**
 * Update the trial banner based on current subscription status
 * @param {object} subscription - Subscription status object
 */
export function updateTrialBanner(subscription) {
  if (!subscription) {
    hideTrialBanner();
    return;
  }

  // Only show banner for trial users (not expired and not active subscribers)
  if (subscription.subscription_status === 'active') {
    hideTrialBanner();
    return;
  }

  // Show banner for trial users or expired users
  if (subscription.subscription_status === 'trial' || subscription.is_expired) {
    showTrialBanner(subscription);
  } else {
    hideTrialBanner();
  }
}

// Inject styles for the banner
const styles = `
  .trial-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.5rem;
    font-size: 0.875rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .trial-banner--active {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f;
  }

  .trial-banner--expired {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: #ffffff;
  }

  .trial-banner__content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .trial-banner__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    font-weight: bold;
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .trial-banner--active .trial-banner__icon {
    background: rgba(120, 53, 15, 0.2);
    color: #78350f;
  }

  .trial-banner--expired .trial-banner__icon {
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }

  .trial-banner__message {
    line-height: 1.4;
  }

  .trial-banner__message strong {
    font-weight: 600;
  }

  .trial-banner__cta {
    flex-shrink: 0;
    padding: 0.5rem 1.25rem;
    border-radius: 0.375rem;
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .trial-banner--active .trial-banner__cta {
    background: #78350f;
    color: #ffffff;
  }

  .trial-banner--active .trial-banner__cta:hover {
    background: #92400e;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .trial-banner--expired .trial-banner__cta {
    background: #ffffff;
    color: #dc2626;
  }

  .trial-banner--expired .trial-banner__cta:hover {
    background: #f9fafb;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  /* Adjust body layout when banner is shown */
  body.has-trial-banner .main-nav {
    top: 46px;
  }

  body.has-trial-banner .app-container {
    padding-top: 46px;
  }

  /* Mobile adjustments */
  @media (max-width: 768px) {
    .trial-banner {
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      text-align: center;
    }

    .trial-banner__content {
      flex-direction: column;
      gap: 0.5rem;
    }

    .trial-banner__cta {
      width: 100%;
      text-align: center;
    }

    body.has-trial-banner .main-nav {
      top: 100px;
    }

    body.has-trial-banner .app-container {
      padding-top: 100px;
    }
  }
`;

// Inject styles into document
function injectStyles() {
  if (!document.getElementById('trial-banner-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'trial-banner-styles';
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }
}

// Inject styles when module loads
injectStyles();
