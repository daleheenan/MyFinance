// Account recovery form functionality for FinanceFlow
(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var accountRecoveryForm = document.getElementById('accountRecoveryForm');

    if (accountRecoveryForm) {
      accountRecoveryForm.addEventListener('submit', handleAccountRecovery);
    }
  });

  async function handleAccountRecovery(event) {
    event.preventDefault();

    var form = event.target;
    var username = form.username.value.trim();
    var password = form.password.value;
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
    if (!username || !password || !email) {
      formError.textContent = 'Please fill in all fields.';
      formError.classList.add('visible');
      return;
    }

    // Email format validation
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      formError.textContent = 'Please enter a valid email address.';
      formError.classList.add('visible');
      return;
    }

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Setting up...';

    try {
      var response = await fetch('/api/auth/set-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: username,
          password: password,
          email: email
        })
      });

      var data = await response.json();

      if (response.ok && data.success) {
        formSuccess.innerHTML = 'Email set successfully! You can now <a href="#" data-action="sign-in">sign in</a> or use <a href="/forgot-password">forgot password</a> if needed.';
        formSuccess.classList.add('visible');
        form.reset();

        // Re-attach sign-in modal handler
        var signInLink = formSuccess.querySelector('[data-action="sign-in"]');
        if (signInLink) {
          signInLink.addEventListener('click', function(e) {
            e.preventDefault();
            var modal = document.getElementById('signInModal');
            if (modal) modal.classList.add('active');
          });
        }
      } else {
        formError.textContent = data.error || 'Failed to set email. Please check your credentials.';
        formError.classList.add('visible');
      }
    } catch (error) {
      console.error('Account recovery error:', error);
      formError.textContent = 'An error occurred. Please try again.';
      formError.classList.add('visible');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Set Email Address';
  }
})();
