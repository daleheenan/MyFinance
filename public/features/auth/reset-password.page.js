/**
 * Reset Password Page
 * Allows users to set a new password using a reset token
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
 * Reset Password page component
 */
export async function mount(container, params) {
  // Get token from URL path (e.g., #/reset-password/abc123)
  const path = window.location.hash.replace('#', '');
  const pathParts = path.split('/');
  const token = pathParts[2] || '';

  if (!token) {
    renderInvalidToken(container);
    return;
  }

  // Validate token first
  try {
    const response = await fetch(`/api/auth/reset-password/${token}`);
    const data = await response.json();

    if (!data.valid) {
      renderInvalidToken(container);
      return;
    }
  } catch (err) {
    renderInvalidToken(container);
    return;
  }

  renderResetForm(container, token);
}

/**
 * Render invalid/expired token message
 */
function renderInvalidToken(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Reset your password</p>
        </div>

        <div class="login-form">
          <div class="login-error" style="display: block;">
            This password reset link is invalid or has expired.
          </div>

          <div class="login-links" style="margin-top: 20px;">
            <a href="#/forgot-password" class="login-link">Request a new reset link</a>
            <span style="margin: 0 10px; color: #666;">|</span>
            <a href="#/login" class="login-link">Back to Sign In</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the password reset form
 */
function renderResetForm(container, token) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Set a new password</p>
        </div>

        <form id="reset-form" class="login-form">
          <div class="form-group">
            <label for="password">New Password</label>
            <input
              type="password"
              id="password"
              name="password"
              required
              autocomplete="new-password"
              autofocus
              minlength="8"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div class="form-group">
            <label for="confirm-password">Confirm New Password</label>
            <input
              type="password"
              id="confirm-password"
              name="confirm-password"
              required
              autocomplete="new-password"
            />
          </div>

          <div id="reset-message" class="login-error" style="display: none;"></div>

          <button type="submit" id="reset-btn" class="login-btn">
            Reset Password
          </button>

          <div class="login-links">
            <a href="#/login" class="login-link">Back to Sign In</a>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector('#reset-form');
  const passwordInput = container.querySelector('#password');
  const confirmInput = container.querySelector('#confirm-password');
  const messageDiv = container.querySelector('#reset-message');
  const submitBtn = container.querySelector('#reset-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage(messageDiv);

    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;

    if (!password) {
      showError(messageDiv, 'Please enter a new password');
      return;
    }

    if (password.length < 8) {
      showError(messageDiv, 'Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      showError(messageDiv, 'Passwords do not match');
      return;
    }

    setButtonLoading(submitBtn, true, 'Resetting...', 'Reset Password');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(messageDiv, 'Password reset successfully! Redirecting to login...');
        submitBtn.style.display = 'none';

        // Redirect to login after a short delay
        setTimeout(() => {
          window.location.hash = '#/login';
        }, 2000);
      } else {
        showError(messageDiv, data.error || 'Failed to reset password');
        setButtonLoading(submitBtn, false, 'Resetting...', 'Reset Password');
      }
    } catch (err) {
      showError(messageDiv, 'Network error. Please try again.');
      setButtonLoading(submitBtn, false, 'Resetting...', 'Reset Password');
    }
  });
}
