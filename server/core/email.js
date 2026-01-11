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
  const resetUrl = `${baseUrl}/#/reset-password/${resetToken}`;

  const subject = 'Reset Your Password - Flow Finance Manager';

  const text = `
You requested a password reset for your Flow Finance Manager account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email. Your password will not be changed.

- Flow Finance Manager
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
    <h1 style="color: white; margin: 0; font-size: 24px;">Flow Finance Manager</h1>
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
