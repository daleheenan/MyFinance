/**
 * Registration Page
 * User registration form with password strength indicator
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
 * Calculate password strength
 * @param {string} password - Password to evaluate
 * @returns {{ score: number, label: string, class: string, feedback: string[] }}
 */
function calculatePasswordStrength(password) {
  const feedback = [];
  let score = 0;

  if (!password) {
    return { score: 0, label: '', class: '', feedback: [] };
  }

  // Length checks
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('At least 8 characters');
  }

  if (password.length >= 12) {
    score += 1;
  }

  // Character type checks
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Lowercase letter');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Uppercase letter');
  }

  if (/[0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Number');
  }

  if (/[^a-zA-Z0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Special character');
  }

  // Determine strength level
  let label, strengthClass;
  if (score <= 2) {
    label = 'Weak';
    strengthClass = 'strength-weak';
  } else if (score <= 3) {
    label = 'Fair';
    strengthClass = 'strength-fair';
  } else if (score <= 4) {
    label = 'Good';
    strengthClass = 'strength-good';
  } else {
    label = 'Strong';
    strengthClass = 'strength-strong';
  }

  return { score, label, class: strengthClass, feedback };
}

/**
 * Update password strength meter UI
 */
function updatePasswordStrengthUI(container, password) {
  const meterFill = container.querySelector('.strength-meter-fill');
  const strengthLabel = container.querySelector('.strength-label');
  const feedbackList = container.querySelector('.strength-feedback');
  const strengthContainer = container.querySelector('.password-strength');

  const strength = calculatePasswordStrength(password);

  if (!password) {
    strengthContainer.style.display = 'none';
    return;
  }

  strengthContainer.style.display = 'block';

  // Update meter fill
  const percentage = (strength.score / 6) * 100;
  meterFill.style.width = `${percentage}%`;
  meterFill.className = `strength-meter-fill ${strength.class}`;

  // Update label
  strengthLabel.textContent = strength.label;
  strengthLabel.className = `strength-label ${strength.class}`;

  // Update feedback
  if (strength.feedback.length > 0) {
    feedbackList.innerHTML = `<span class="feedback-prefix">Missing:</span> ${strength.feedback.join(', ')}`;
    feedbackList.style.display = 'block';
  } else {
    feedbackList.style.display = 'none';
  }
}

/**
 * Registration page component
 */
export async function mount(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Flow Finance Manager</h1>
          <p>Create your account</p>
        </div>

        <form id="register-form" class="login-form" novalidate>
          <div class="form-group">
            <label for="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              required
              autocomplete="username"
              autofocus
              minlength="3"
              placeholder="Choose a username"
              aria-describedby="username-hint"
            />
            <small id="username-hint" class="form-hint">Minimum 3 characters</small>
          </div>

          <div class="form-group">
            <label for="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              required
              autocomplete="email"
              placeholder="Enter your email"
              aria-describedby="email-hint"
            />
            <small id="email-hint" class="form-hint">Used for password recovery and notifications</small>
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
              placeholder="Create a password"
              aria-describedby="password-strength"
            />
            <div class="password-strength" id="password-strength" style="display: none;" role="status" aria-live="polite">
              <div class="strength-meter">
                <div class="strength-meter-fill"></div>
              </div>
              <div class="strength-info">
                <span class="strength-label"></span>
                <span class="strength-feedback"></span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="confirm-password">Confirm Password</label>
            <input
              type="password"
              id="confirm-password"
              name="confirm-password"
              required
              autocomplete="new-password"
              placeholder="Confirm your password"
            />
          </div>

          <div id="register-message" class="login-error" style="display: none;" role="alert"></div>

          <button type="submit" id="register-btn" class="login-btn">
            Create Account
          </button>

          <div class="login-links">
            <span>Already have an account?</span>
            <a href="#/login" class="login-link">Sign In</a>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector('#register-form');
  const usernameInput = container.querySelector('#username');
  const emailInput = container.querySelector('#email');
  const passwordInput = container.querySelector('#password');
  const confirmInput = container.querySelector('#confirm-password');
  const messageDiv = container.querySelector('#register-message');
  const submitBtn = container.querySelector('#register-btn');

  // Real-time password strength indicator
  passwordInput.addEventListener('input', () => {
    updatePasswordStrengthUI(container, passwordInput.value);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage(messageDiv);

    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;

    // Validate username
    if (!username || username.length < 3) {
      showError(messageDiv, 'Username must be at least 3 characters');
      usernameInput.focus();
      return;
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showError(messageDiv, 'Please enter a valid email address');
      emailInput.focus();
      return;
    }

    // Validate password
    if (!password || password.length < 8) {
      showError(messageDiv, 'Password must be at least 8 characters');
      passwordInput.focus();
      return;
    }

    // Check password strength minimum (at least Fair)
    const strength = calculatePasswordStrength(password);
    if (strength.score < 3) {
      showError(messageDiv, 'Please choose a stronger password');
      passwordInput.focus();
      return;
    }

    // Validate password match
    if (password !== confirmPassword) {
      showError(messageDiv, 'Passwords do not match');
      confirmInput.focus();
      return;
    }

    setButtonLoading(submitBtn, true, 'Creating Account...', 'Create Account');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      const data = await response.json();

      if (data.success) {
        // Redirect to registration success page
        window.location.hash = '#/registration-success?email=' + encodeURIComponent(email);
      } else {
        showError(messageDiv, data.error || 'Failed to create account');
        setButtonLoading(submitBtn, false, 'Creating Account...', 'Create Account');
      }
    } catch (err) {
      showError(messageDiv, 'Network error. Please try again.');
      setButtonLoading(submitBtn, false, 'Creating Account...', 'Create Account');
    }
  });
}
