/**
 * Registration Success Page
 * Shown after successful registration, prompts user to verify email
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
 * Registration Success page component
 */
export async function mount(container, params) {
  // Get email from URL params if available
  const email = params.get('email') || '';

  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Registration Complete</p>
        </div>

        <div class="login-form">
          <div class="verification-status verification-pending" role="status">
            <div class="verification-icon pending-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <h2 class="verification-title">Check Your Email</h2>
            <p class="verification-message">
              We've sent a verification link to${email ? ` <strong>${escapeHtml(email)}</strong>` : ' your email address'}.
            </p>
            <p class="verification-submessage">
              Click the link in the email to verify your account and complete registration.
            </p>
          </div>

          <div class="email-tips">
            <p class="tips-title">Didn't receive the email?</p>
            <ul class="tips-list">
              <li>Check your spam or junk folder</li>
              <li>Make sure you entered the correct email address</li>
              <li>Wait a few minutes and check again</li>
            </ul>
          </div>

          <div id="resend-section" class="resend-section">
            <form id="resend-form" class="resend-form">
              <div class="form-group">
                <label for="resend-email" class="sr-only">Email Address</label>
                <input
                  type="email"
                  id="resend-email"
                  name="email"
                  required
                  placeholder="Enter your email address"
                  value="${escapeHtml(email)}"
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
            <a href="#/login" class="login-link">Go to Sign In</a>
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
