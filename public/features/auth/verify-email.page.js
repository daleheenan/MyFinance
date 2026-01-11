/**
 * Email Verification Page
 * Verifies email using token from URL
 */

/**
 * Helper functions for form UI state
 */
function showError(messageDiv, message) {
  messageDiv.textContent = message;
  messageDiv.className = 'login-error';
  messageDiv.style.display = 'block';
}

function showSuccess(messageDiv, message) {
  messageDiv.textContent = message;
  messageDiv.className = 'login-success';
  messageDiv.style.display = 'block';
}

function setButtonLoading(btn, loading, loadingText, defaultText) {
  btn.disabled = loading;
  btn.textContent = loading ? loadingText : defaultText;
}

/**
 * Email Verification page component
 */
export async function mount(container, params) {
  // Get token from URL query params
  const token = params.get('token') || '';

  if (!token) {
    renderInvalidToken(container);
    return;
  }

  // Show loading state while verifying
  renderVerifying(container);

  // Attempt to verify the email
  try {
    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    if (data.success) {
      renderSuccess(container);
    } else {
      renderError(container, data.error || 'Verification failed');
    }
  } catch (err) {
    renderError(container, 'Network error. Please try again.');
  }
}

/**
 * Render verifying loading state
 */
function renderVerifying(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Email Verification</p>
        </div>

        <div class="login-form">
          <div class="verification-status" role="status" aria-live="polite">
            <div class="verification-spinner" aria-hidden="true"></div>
            <p class="verification-message">Verifying your email...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render success state
 */
function renderSuccess(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Email Verification</p>
        </div>

        <div class="login-form">
          <div class="verification-status verification-success" role="status" aria-live="polite">
            <div class="verification-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <p class="verification-message">Email verified successfully!</p>
            <p class="verification-submessage">Redirecting to login...</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Redirect to login after a short delay
  setTimeout(() => {
    window.location.hash = '#/login';
  }, 2000);
}

/**
 * Render error state
 */
function renderError(container, errorMessage) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Email Verification</p>
        </div>

        <div class="login-form">
          <div class="verification-status verification-error" role="alert">
            <div class="verification-icon error-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <p class="verification-message">${escapeHtml(errorMessage)}</p>
          </div>

          <div id="resend-section" class="resend-section">
            <p>Need a new verification link?</p>
            <form id="resend-form" class="resend-form">
              <div class="form-group">
                <label for="resend-email" class="sr-only">Email Address</label>
                <input
                  type="email"
                  id="resend-email"
                  name="email"
                  required
                  placeholder="Enter your email address"
                  aria-label="Email address for resending verification"
                />
              </div>
              <div id="resend-message" style="display: none;" role="alert"></div>
              <button type="submit" id="resend-btn" class="login-btn secondary-btn">
                Resend Verification Email
              </button>
            </form>
          </div>

          <div class="login-links" style="margin-top: 1.5rem;">
            <a href="#/login" class="login-link">Back to Sign In</a>
          </div>
        </div>
      </div>
    </div>
  `;

  setupResendForm(container);
}

/**
 * Render invalid token state
 */
function renderInvalidToken(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Email Verification</p>
        </div>

        <div class="login-form">
          <div class="login-error" style="display: block;" role="alert">
            Invalid verification link. The link may be missing or malformed.
          </div>

          <div id="resend-section" class="resend-section">
            <p>Need a new verification link?</p>
            <form id="resend-form" class="resend-form">
              <div class="form-group">
                <label for="resend-email" class="sr-only">Email Address</label>
                <input
                  type="email"
                  id="resend-email"
                  name="email"
                  required
                  placeholder="Enter your email address"
                  aria-label="Email address for resending verification"
                />
              </div>
              <div id="resend-message" style="display: none;" role="alert"></div>
              <button type="submit" id="resend-btn" class="login-btn secondary-btn">
                Resend Verification Email
              </button>
            </form>
          </div>

          <div class="login-links" style="margin-top: 1.5rem;">
            <a href="#/login" class="login-link">Back to Sign In</a>
          </div>
        </div>
      </div>
    </div>
  `;

  setupResendForm(container);
}

/**
 * Setup resend verification form handler
 */
function setupResendForm(container) {
  const form = container.querySelector('#resend-form');
  const emailInput = container.querySelector('#resend-email');
  const messageDiv = container.querySelector('#resend-message');
  const submitBtn = container.querySelector('#resend-btn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageDiv.style.display = 'none';

    const email = emailInput.value.trim();

    if (!email) {
      showError(messageDiv, 'Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError(messageDiv, 'Please enter a valid email address');
      return;
    }

    setButtonLoading(submitBtn, true, 'Sending...', 'Resend Verification Email');

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(messageDiv, 'Verification email sent! Check your inbox.');
        emailInput.value = '';
      } else {
        showError(messageDiv, data.error || 'Failed to send verification email');
      }
    } catch (err) {
      showError(messageDiv, 'Network error. Please try again.');
    }

    setButtonLoading(submitBtn, false, 'Sending...', 'Resend Verification Email');
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
