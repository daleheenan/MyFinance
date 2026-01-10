import { auth } from '../../core/auth.js';

/**
 * Login page component
 */
export async function render(container) {
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
