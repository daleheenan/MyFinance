// Registration form functionality for FinanceFlow
(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var registerForm = document.getElementById('registerForm');
    var formError = document.getElementById('formError');

    if (registerForm) {
      registerForm.addEventListener('submit', handleRegister);
    }
  });

  async function handleRegister(event) {
    event.preventDefault();

    var form = event.target;
    var username = form.username.value.trim();
    var email = form.email.value.trim();
    var password = form.password.value;
    var confirmPassword = form.confirmPassword.value;
    var formError = document.getElementById('formError');
    var submitBtn = form.querySelector('button[type="submit"]');

    // Hide previous error
    formError.classList.remove('visible');
    formError.textContent = '';

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

    // Validate username
    if (username.length < 3) {
      formError.textContent = 'Username must be at least 3 characters.';
      formError.classList.add('visible');
      return;
    }

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
      // First check if system already has users (setup only works for first user)
      var statusResponse = await fetch('/api/auth/status');
      var statusData = await statusResponse.json();

      if (statusData.hasUsers) {
        // System already set up - show error
        formError.textContent = 'Registration is currently closed. Please contact the administrator.';
        formError.classList.add('visible');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
        return;
      }

      // Create the first user account
      var response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: username,
          password: password
        })
      });

      var data = await response.json();

      if (response.ok && data.success) {
        // Account created - now update email
        // First login to get a session
        var loginResponse = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            username: username,
            password: password
          })
        });

        var loginData = await loginResponse.json();

        if (loginResponse.ok && loginData.success) {
          // Now update email if provided
          if (email) {
            await fetch('/api/auth/email', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({ email: email })
            });
          }

          // Redirect to app
          window.location.href = '/app#/overview';
        } else {
          // Account created but login failed - redirect to sign in
          window.location.href = '/?registered=true';
        }
      } else {
        formError.textContent = data.error || 'Failed to create account. Please try again.';
        formError.classList.add('visible');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    } catch (error) {
      console.error('Registration error:', error);
      formError.textContent = 'An error occurred. Please try again.';
      formError.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  }
})();
