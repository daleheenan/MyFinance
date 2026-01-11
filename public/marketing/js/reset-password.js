// Reset password form functionality for FinanceFlow
(function() {
  'use strict';

  var resetToken = null;

  document.addEventListener('DOMContentLoaded', function() {
    // Get token from URL
    var urlParams = new URLSearchParams(window.location.search);
    resetToken = urlParams.get('token');

    if (!resetToken) {
      showInvalidToken();
      return;
    }

    // Validate token
    validateToken(resetToken);

    var resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
      resetPasswordForm.addEventListener('submit', handleResetPassword);
    }
  });

  async function validateToken(token) {
    var tokenValidating = document.getElementById('tokenValidating');
    var tokenInvalid = document.getElementById('tokenInvalid');
    var resetPasswordForm = document.getElementById('resetPasswordForm');

    try {
      var response = await fetch('/api/auth/reset-password/' + encodeURIComponent(token));
      var data = await response.json();

      tokenValidating.style.display = 'none';

      if (data.valid) {
        resetPasswordForm.style.display = 'block';
      } else {
        showInvalidToken();
      }
    } catch (error) {
      console.error('Token validation error:', error);
      showInvalidToken();
    }
  }

  function showInvalidToken() {
    var tokenValidating = document.getElementById('tokenValidating');
    var tokenInvalid = document.getElementById('tokenInvalid');
    var resetPasswordForm = document.getElementById('resetPasswordForm');

    tokenValidating.style.display = 'none';
    tokenInvalid.style.display = 'block';
    resetPasswordForm.style.display = 'none';
  }

  async function handleResetPassword(event) {
    event.preventDefault();

    var form = event.target;
    var password = form.password.value;
    var confirmPassword = form.confirmPassword.value;
    var formError = document.getElementById('formError');
    var formSuccess = document.getElementById('formSuccess');
    var submitBtn = form.querySelector('button[type="submit"]');

    // Hide previous messages
    formError.classList.remove('visible');
    formError.textContent = '';
    formSuccess.classList.remove('visible');
    formSuccess.textContent = '';

    // Validate passwords match
    if (password !== confirmPassword) {
      formError.textContent = 'Passwords do not match.';
      formError.classList.add('visible');
      return;
    }

    // Validate password length
    if (password.length < 8) {
      formError.textContent = 'Password must be at least 8 characters.';
      formError.classList.add('visible');
      return;
    }

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Resetting...';

    try {
      var response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: resetToken,
          password: password
        })
      });

      var data = await response.json();

      if (response.ok && data.success) {
        formSuccess.textContent = 'Your password has been reset successfully! Redirecting to sign in...';
        formSuccess.classList.add('visible');
        form.style.display = 'none';

        // Redirect to home page after a short delay
        setTimeout(function() {
          window.location.href = '/?reset=success';
        }, 2000);
      } else {
        formError.textContent = data.error || 'Failed to reset password. The link may have expired.';
        formError.classList.add('visible');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reset Password';
      }
    } catch (error) {
      console.error('Reset password error:', error);
      formError.textContent = 'An error occurred. Please try again.';
      formError.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset Password';
    }
  }
})();
