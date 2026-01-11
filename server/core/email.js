/**
 * Email Service
 *
 * Sends emails using nodemailer with Gmail SMTP.
 * Configure via environment variables:
 *   - SMTP_HOST (default: smtp.gmail.com)
 *   - SMTP_PORT (default: 587)
 *   - SMTP_USER (email address)
 *   - SMTP_PASS (app password for Gmail)
 *   - SMTP_FROM (default: SMTP_USER)
 */

import nodemailer from 'nodemailer';

// Email configuration from environment
const config = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // Use TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
};

const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@flowfinancemanager.com';

// Create transporter (lazily initialized)
let transporter = null;

function getTransporter() {
  if (!transporter && config.auth.user && config.auth.pass) {
    transporter = nodemailer.createTransport(config);
  }
  return transporter;
}

/**
 * Check if email is configured
 * @returns {boolean}
 */
export function isEmailConfigured() {
  return !!(config.auth.user && config.auth.pass);
}

/**
 * Send an email
 * @param {object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} [options.html] - HTML body (optional)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendEmail({ to, subject, text, html }) {
  const transport = getTransporter();

  if (!transport) {
    console.warn('Email not configured - SMTP_USER and SMTP_PASS required');
    return {
      success: false,
      error: 'Email service not configured'
    };
  }

  try {
    const result = await transport.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
      html: html || text
    });

    console.log(`Email sent to ${to}: ${result.messageId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send email:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} resetToken - Password reset token
 * @param {string} baseUrl - Base URL for the app (e.g., https://flowfinancemanager.com)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendPasswordResetEmail(email, resetToken, baseUrl) {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  const subject = 'Reset Your Password - Flow Money Manager';

  const text = `
You requested a password reset for your Flow Money Manager account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email. Your password will not be changed.

- Flow Money Manager
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Flow Money Manager</h1>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none;">
    <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>

    <p>You requested a password reset for your account.</p>

    <p>Click the button below to set a new password:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
        Reset Password
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">
      This link will expire in <strong>1 hour</strong>.
    </p>

    <p style="color: #666; font-size: 14px;">
      If you didn't request this, please ignore this email. Your password will not be changed.
    </p>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin-bottom: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Send welcome email to new users
 * @param {string} email - Recipient email
 * @param {string} username - User's username
 * @param {string} baseUrl - Base URL for the app
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendWelcomeEmail(email, username, baseUrl) {
  const appUrl = `${baseUrl}/app`;
  const subject = 'Welcome to Flow Money Manager!';

  const text = `
Welcome to Flow Money Manager, ${username}!

Your account has been created successfully. You can now start managing your personal finances.

Get started: ${appUrl}

Features available to you:
- Track transactions across multiple accounts
- Import bank statements (CSV, OFX)
- Automatic transaction categorization
- Spending analytics and reports
- Budget tracking
- Subscription management

If you have any questions, please contact us.

- The Flow Money Manager Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to Flow Money Manager!</h1>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none;">
    <p style="font-size: 18px;">Hi ${username},</p>

    <p>Your account has been created successfully. You're now ready to take control of your personal finances!</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${appUrl}" style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
        Get Started
      </a>
    </div>

    <h3 style="color: #333;">What you can do:</h3>
    <ul style="color: #555;">
      <li>Track transactions across multiple accounts</li>
      <li>Import bank statements (CSV, OFX)</li>
      <li>Automatic transaction categorization</li>
      <li>Spending analytics and reports</li>
      <li>Budget tracking</li>
      <li>Subscription management</li>
    </ul>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #999; font-size: 12px;">
      Need help? Visit our <a href="${baseUrl}/contact" style="color: #14b8a6;">contact page</a>.
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Send subscription confirmation email
 * @param {string} email - Recipient email
 * @param {string} planName - Subscription plan name
 * @param {number} amount - Amount charged in pennies
 * @param {string} nextBillingDate - Next billing date ISO string
 * @param {string} baseUrl - Base URL for the app
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendSubscriptionConfirmation(email, planName, amount, nextBillingDate, baseUrl) {
  const amountFormatted = (amount / 100).toFixed(2);
  const dateFormatted = new Date(nextBillingDate).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `Your ${planName} subscription is now active - Flow Money Manager`;

  const text = `
Your ${planName} subscription is now active!

Thank you for upgrading to ${planName}. Your subscription details:

Plan: ${planName}
Amount: £${amountFormatted}/month
Next billing date: ${dateFormatted}

You now have access to all premium features including unlimited accounts, advanced analytics, and priority support.

Manage your subscription: ${baseUrl}/app/settings

- The Flow Money Manager Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Subscription Confirmed!</h1>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none;">
    <p style="font-size: 18px;">Thank you for upgrading to ${planName}!</p>

    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #333;">Subscription Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Plan:</td>
          <td style="padding: 8px 0; font-weight: 600;">${planName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Amount:</td>
          <td style="padding: 8px 0; font-weight: 600;">£${amountFormatted}/month</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Next billing:</td>
          <td style="padding: 8px 0; font-weight: 600;">${dateFormatted}</td>
        </tr>
      </table>
    </div>

    <p>You now have access to all premium features!</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${baseUrl}/app/settings" style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
        Manage Subscription
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #999; font-size: 12px;">
      Questions? <a href="${baseUrl}/contact" style="color: #14b8a6;">Contact us</a>.
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Send subscription cancellation email
 * @param {string} email - Recipient email
 * @param {string} endDate - End date ISO string
 * @param {string} baseUrl - Base URL for the app
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendSubscriptionCancellation(email, endDate, baseUrl) {
  const dateFormatted = new Date(endDate).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = 'Your subscription has been canceled - Flow Money Manager';

  const text = `
Your Flow Money Manager Pro subscription has been canceled.

You'll continue to have access to Pro features until ${dateFormatted}.

After that date, your account will revert to the free plan. Don't worry - your data will remain safe and accessible.

Changed your mind? You can resume your subscription anytime from your settings page: ${baseUrl}/app/settings

We'd love to have you back!

- The Flow Money Manager Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #6b7280; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Subscription Canceled</h1>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none;">
    <p>Your Flow Money Manager Pro subscription has been canceled.</p>

    <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border: 1px solid #fcd34d; margin: 20px 0;">
      <p style="margin: 0; color: #92400e;">
        <strong>Access until:</strong> ${dateFormatted}
      </p>
    </div>

    <p>After this date, your account will revert to the free plan. Don't worry - all your data will remain safe and accessible.</p>

    <h3>Changed your mind?</h3>
    <p>You can resume your subscription anytime from your settings page.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${baseUrl}/app/settings" style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
        Resume Subscription
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #999; font-size: 12px;">
      We'd love to hear your feedback. <a href="${baseUrl}/contact" style="color: #14b8a6;">Let us know</a> how we can improve.
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({ to: email, subject, text, html });
}
