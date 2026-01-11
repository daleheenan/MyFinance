import { auth } from '../../core/auth.js';

/**
 * Helper functions for form UI state
 */
function showError(errorDiv, message) {
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function hideError(errorDiv) {
  errorDiv.style.display = 'none';
}

function setButtonLoading(btn, loading, loadingText, defaultText) {
  btn.disabled = loading;
  btn.textContent = loading ? loadingText : defaultText;
}

/**
 * Check if email is configured and show forgot password link if so
 */
async function checkEmailConfigured(container) {
  try {
    const response = await fetch('/api/auth/email-configured');
    const data = await response.json();
    if (data.configured) {
      const loginLinks = container.querySelector('#login-links');
      if (loginLinks) {
        loginLinks.style.display = 'block';
      }
    }
  } catch (err) {
    // If check fails, don't show the link
    console.warn('Could not check email configuration:', err);
  }
}

/**
 * Check if the system has any users set up
 */
async function checkSetupStatus() {
  try {
    const response = await fetch('/api/auth/status');
    const data = await response.json();
    return data.hasUsers;
  } catch (err) {
    console.error('Failed to check setup status:', err);
    return true;
  }
}

/**
 * Login page component
 */
export async function mount(container) {
  // Check if we need initial setup
  const hasUsers = await checkSetupStatus();

  if (!hasUsers) {
    renderSetupForm(container);
  } else {
    renderLoginForm(container);
  }
}

/**
 * Render initial setup form (create first user)
 */
function renderSetupForm(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Welcome! Create your admin account to get started.</p>
        </div>

        <form id="setup-form" class="login-form">
          <div class="form-group">
            <label for="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value="admin"
              required
              autocomplete="username"
              autofocus
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              required
              autocomplete="new-password"
              minlength="8"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div class="form-group">
            <label for="confirm-password">Confirm Password</label>
            <input
              type="password"
              id="confirm-password"
              name="confirm-password"
              required
              autocomplete="new-password"
            />
          </div>

          <div id="setup-error" class="login-error" style="display: none;"></div>

          <button type="submit" id="setup-btn" class="login-btn">
            Create Account
          </button>
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector('#setup-form');
  const usernameInput = container.querySelector('#username');
  const passwordInput = container.querySelector('#password');
  const confirmInput = container.querySelector('#confirm-password');
  const errorDiv = container.querySelector('#setup-error');
  const submitBtn = container.querySelector('#setup-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errorDiv);

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;

    if (!username || !password) {
      showError(errorDiv, 'Please enter username and password');
      return;
    }

    if (password.length < 8) {
      showError(errorDiv, 'Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      showError(errorDiv, 'Passwords do not match');
      return;
    }

    setButtonLoading(submitBtn, true, 'Creating...', 'Create Account');

    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (data.success) {
        const loginResult = await auth.login(username, password);
        if (loginResult.success) {
          window.location.hash = '#/overview';
        } else {
          renderLoginForm(container);
        }
      } else {
        showError(errorDiv, data.error || 'Failed to create account');
        setButtonLoading(submitBtn, false, 'Creating...', 'Create Account');
      }
    } catch (err) {
      showError(errorDiv, 'Network error. Please try again.');
      setButtonLoading(submitBtn, false, 'Creating...', 'Create Account');
    }
  });
}

/**
 * Render login form
 */
function renderLoginForm(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Sign in to continue</p>
        </div>

        <form id="login-form" class="login-form">
          <div class="form-group">
            <label for="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              required
              autocomplete="username"
              autofocus
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              required
              autocomplete="current-password"
            />
          </div>

          <div id="login-error" class="login-error" style="display: none;"></div>

          <button type="submit" id="login-btn" class="login-btn">
            Sign In
          </button>

          <div class="login-links" id="login-links" style="display: none;">
            <a href="#/forgot-password" class="login-link">Forgot Password?</a>
          </div>
        </form>
      </div>
    </div>
  `;

  // Check if email is configured to show forgot password link
  checkEmailConfigured(container);

  const form = container.querySelector('#login-form');
  const usernameInput = container.querySelector('#username');
  const passwordInput = container.querySelector('#password');
  const errorDiv = container.querySelector('#login-error');
  const submitBtn = container.querySelector('#login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errorDiv);

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError(errorDiv, 'Please enter both username and password');
      return;
    }

    setButtonLoading(submitBtn, true, 'Signing in...', 'Sign In');

    const result = await auth.login(username, password);

    setButtonLoading(submitBtn, false, 'Signing in...', 'Sign In');

    if (result.success) {
      window.location.hash = '#/overview';
    } else {
      showError(errorDiv, result.error);
      passwordInput.value = '';
      passwordInput.focus();
    }
  });
}
