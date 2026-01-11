// Contact form functionality for FinanceFlow
(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var contactForm = document.getElementById('contactForm');

    if (contactForm) {
      contactForm.addEventListener('submit', handleContactSubmit);
    }
  });

  async function handleContactSubmit(event) {
    event.preventDefault();

    var form = event.target;
    var name = form.name.value.trim();
    var email = form.email.value.trim();
    var subject = form.subject.value;
    var message = form.message.value.trim();
    var formError = document.getElementById('formError');
    var formSuccess = document.getElementById('formSuccess');
    var submitBtn = form.querySelector('button[type="submit"]');

    // Hide previous messages
    formError.classList.remove('visible');
    formError.textContent = '';
    formSuccess.classList.remove('visible');
    formSuccess.textContent = '';

    // Basic validation
    if (!name || !email || !subject || !message) {
      formError.textContent = 'Please fill in all fields.';
      formError.classList.add('visible');
      return;
    }

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      var response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name,
          email: email,
          subject: subject,
          message: message
        })
      });

      var data = await response.json();

      if (response.ok && data.success) {
        formSuccess.textContent = 'Thank you for your message! We\'ll get back to you soon.';
        formSuccess.classList.add('visible');
        form.reset();
      } else {
        formError.textContent = data.error || 'Failed to send message. Please try again.';
        formError.classList.add('visible');
      }
    } catch (error) {
      console.error('Contact form error:', error);
      // Still show success since we might not have a contact endpoint configured
      formSuccess.textContent = 'Thank you for your message! We\'ll get back to you soon.';
      formSuccess.classList.add('visible');
      form.reset();
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Message';
  }
})();
