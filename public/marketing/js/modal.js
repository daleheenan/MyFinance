// Sign-In Modal functionality for FinanceFlow marketing pages
(function() {
  'use strict';

  // DOM Elements
  let signInModal = null;
  let signInForm = null;
  let emailInput = null;
  let formError = null;

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    signInModal = document.getElementById('signInModal');
    signInForm = document.getElementById('signInForm');
    emailInput = document.getElementById('email');
    formError = document.getElementById('formError');

    // Attach event listeners to all sign-in buttons
    document.querySelectorAll('[data-action="sign-in"]').forEach(function(btn) {
      btn.addEventListener('click', openSignInModal);
    });

    // Attach event listeners to nav toggle buttons
    document.querySelectorAll('[data-action="nav-toggle"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var navLinks = this.nextElementSibling;
        if (navLinks) {
          navLinks.classList.toggle('open');
        }
      });
    });

    // Close modal on overlay click
    if (signInModal) {
      signInModal.addEventListener('click', function(event) {
        if (event.target === signInModal) {
          closeSignInModal();
        }
      });
    }

    // Close button
    const closeBtn = document.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeSignInModal);
    }

    // Form submission
    if (signInForm) {
      signInForm.addEventListener('submit', handleSignIn);
    }

    // Close on Escape key
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        closeSignInModal();
      }
    });
  });

  // Open Sign In Modal
  function openSignInModal(event) {
    if (event) event.preventDefault();
    if (!signInModal) return;

    signInModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Focus on email field
    setTimeout(function() {
      if (emailInput) emailInput.focus();
    }, 100);
  }

  // Close Sign In Modal
  function closeSignInModal() {
    if (!signInModal) return;

    signInModal.classList.remove('active');
    document.body.style.overflow = '';

    // Reset form
    if (signInForm) signInForm.reset();
    if (formError) formError.classList.remove('visible');
  }

  // Handle Sign In Form Submission
  async function handleSignIn(event) {
    event.preventDefault();

    const form = event.target;
    const email = form.email.value;
    const password = form.password.value;
    const submitBtn = form.querySelector('button[type="submit"]');

    // Hide previous error
    if (formError) formError.classList.remove('visible');

    // Disable button during request
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
    }

    try {
      // Get CSRF token if available
      let csrfToken = '';
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      if (csrfMeta) {
        csrfToken = csrfMeta.getAttribute('content');
      }

      const headers = {
        'Content-Type': 'application/json'
      };
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: JSON.stringify({
          email: email,
          password: password
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Redirect to app on success
        window.location.href = '/app#/overview';
      } else {
        // Show error message
        if (formError) {
          formError.textContent = data.message || 'Invalid email or password. Please try again.';
          formError.classList.add('visible');
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      if (formError) {
        formError.textContent = 'An error occurred. Please try again.';
        formError.classList.add('visible');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    }
  }

  // Expose functions globally for backwards compatibility
  window.openSignInModal = openSignInModal;
  window.closeSignInModal = closeSignInModal;
})();
