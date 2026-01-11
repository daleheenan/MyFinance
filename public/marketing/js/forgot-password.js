// Forgot password form functionality for FinanceFlow
(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var forgotPasswordForm = document.getElementById('forgotPasswordForm');

    if (forgotPasswordForm) {
      forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    }
  });

  async function handleForgotPassword(event) {
    event.preventDefault();

    var form = event.target;
    var email = form.email.value.trim();
    var formError = document.getElementById('formError');
    var formSuccess = document.getElementById('formSuccess');
    var submitBtn = form.querySelector('button[type="submit"]');

    // Hide previous messages
    formError.classList.remove('visible');
    formError.textContent = '';
    formSuccess.classList.remove('visible');
    formSuccess.textContent = '';

    // Basic validation
    if (!email) {
      formError.textContent = 'Please enter your email address.';
      formError.classList.add('visible');
      return;
    }

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      var response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email })
      });

      var data = await response.json();

      // Always show success message to prevent email enumeration
      formSuccess.textContent = 'If an account with that email exists, we\'ve sent you a password reset link. Please check your inbox.';
      formSuccess.classList.add('visible');
      form.reset();
    } catch (error) {
      console.error('Forgot password error:', error);
      formError.textContent = 'An error occurred. Please try again.';
      formError.classList.add('visible');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Reset Link';
  }
})();
