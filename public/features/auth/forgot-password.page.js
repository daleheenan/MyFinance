/**
 * Forgot Password Page
 * Allows users to request a password reset email
 */

/**
 * Helper functions for form UI state
 */
function showError(errorDiv, message) {
  errorDiv.textContent = message;
  errorDiv.className = 'login-error';
  errorDiv.style.display = 'block';
}

function showSuccess(errorDiv, message) {
  errorDiv.textContent = message;
  errorDiv.className = 'login-success';
  errorDiv.style.display = 'block';
}

function hideMessage(errorDiv) {
  errorDiv.style.display = 'none';
}

function setButtonLoading(btn, loading, loadingText, defaultText) {
  btn.disabled = loading;
  btn.textContent = loading ? loadingText : defaultText;
}

/**
 * Forgot Password page component
 */
export async function mount(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Reset your password</p>
        </div>

        <form id="forgot-form" class="login-form">
          <div class="form-group">
            <label for="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              required
              autocomplete="email"
              autofocus
              placeholder="Enter your account email"
            />
          </div>

          <div id="forgot-message" class="login-error" style="display: none;"></div>

          <button type="submit" id="forgot-btn" class="login-btn">
            Send Reset Link
          </button>

          <div class="login-links">
            <a href="#/login" class="login-link">Back to Sign In</a>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector('#forgot-form');
  const emailInput = container.querySelector('#email');
  const messageDiv = container.querySelector('#forgot-message');
  const submitBtn = container.querySelector('#forgot-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage(messageDiv);

    const email = emailInput.value.trim();

    if (!email) {
      showError(messageDiv, 'Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError(messageDiv, 'Please enter a valid email address');
      return;
    }

    setButtonLoading(submitBtn, true, 'Sending...', 'Send Reset Link');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(messageDiv, 'If an account with that email exists, a reset link has been sent. Check your inbox.');
        emailInput.value = '';
        setButtonLoading(submitBtn, false, 'Sending...', 'Send Reset Link');
      } else {
        showError(messageDiv, data.error || 'Failed to send reset link');
        setButtonLoading(submitBtn, false, 'Sending...', 'Send Reset Link');
      }
    } catch (err) {
      showError(messageDiv, 'Network error. Please try again.');
      setButtonLoading(submitBtn, false, 'Sending...', 'Send Reset Link');
    }
  });
}
