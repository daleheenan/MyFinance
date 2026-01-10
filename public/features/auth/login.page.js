import { auth } from '../../core/auth.js';

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
    return true; // Assume has users on error
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
          <h1>FinanceFlow</h1>
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

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  function hideError() {
    errorDiv.style.display = 'none';
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Creating...' : 'Create Account';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;

    if (!username || !password) {
      showError('Please enter username and password');
      return;
    }

    if (password.length < 8) {
      showError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (data.success) {
        // Auto-login after setup
        const loginResult = await auth.login(username, password);
        if (loginResult.success) {
          window.location.hash = '#/overview';
        } else {
          // Setup worked but login failed - show login form
          renderLoginForm(container);
        }
      } else {
        showError(data.error || 'Failed to create account');
        setLoading(false);
      }
    } catch (err) {
      showError('Network error. Please try again.');
      setLoading(false);
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
          <h1>FinanceFlow</h1>
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
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector('#login-form');
  const usernameInput = container.querySelector('#username');
  const passwordInput = container.querySelector('#password');
  const errorDiv = container.querySelector('#login-error');
  const submitBtn = container.querySelector('#login-btn');

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  function hideError() {
    errorDiv.style.display = 'none';
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Signing in...' : 'Sign In';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError('Please enter both username and password');
      return;
    }

    setLoading(true);

    const result = await auth.login(username, password);

    setLoading(false);

    if (result.success) {
      // Redirect to overview
      window.location.hash = '#/overview';
    } else {
      showError(result.error);
      // Focus password field for retry
      passwordInput.value = '';
      passwordInput.focus();
    }
  });
}
