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
 * Send email verification link to new users
 * @param {string} email - Recipient email
 * @param {string} token - Verification token
 * @param {string} baseUrl - Base URL for the app (e.g., https://flowfinancemanager.com)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendVerificationEmail(email, token, baseUrl) {
  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

  const subject = 'Verify your Flow Money Manager account';

  const text = `
Welcome to Flow Money Manager!

Please verify your email address to complete your account setup.

Click the link below to verify your email:
${verifyUrl}

This link will expire in 24 hours.

If you didn't create an account with Flow Money Manager, please ignore this email.

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
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Flow Money Manager</h1>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none;">
    <h2 style="color: #333; margin-top: 0;">Verify Your Email Address</h2>

    <p>Welcome to Flow Money Manager! We're excited to have you on board.</p>

    <p>Please click the button below to verify your email address and activate your account:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
        Verify Email Address
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">
      This verification link will expire in <strong>24 hours</strong>.
    </p>

    <p style="color: #666; font-size: 14px;">
      If you didn't create an account with Flow Money Manager, you can safely ignore this email.
    </p>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin-bottom: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${verifyUrl}" style="color: #667eea; word-break: break-all;">${verifyUrl}</a>
    </p>

    <p style="color: #999; font-size: 11px; margin-top: 20px;">
      You received this email because someone signed up for a Flow Money Manager account with this email address.
      If you no longer wish to receive these emails, you can <a href="${baseUrl}/unsubscribe" style="color: #667eea;">unsubscribe here</a>.
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Send welcome email after user has verified their email
 * @param {string} email - Recipient email
 * @param {string} username - User's username
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendWelcomeEmail(email, username) {
  const subject = 'Welcome to Flow Money Manager!';

  const text = `
Welcome to Flow Money Manager, ${username}!

Your email has been verified and your account is now fully activated. You're ready to take control of your personal finances!

Here are some tips to get started:

1. Add Your Accounts - Connect your bank accounts or create manual accounts to track your finances
2. Import Transactions - Upload CSV or OFX files from your bank to import historical data
3. Set Up Categories - Customize categories to match your spending habits
4. Create Budgets - Set monthly budgets to stay on track
5. Explore Analytics - View charts and insights about your spending patterns

You have a 14-day free trial to explore all premium features. Make the most of it!

If you have any questions, we're here to help.

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
    <h1 style="color: white; margin: 0; font-size: 24px;">Flow Money Manager</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Welcome aboard!</p>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none;">
    <h2 style="color: #333; margin-top: 0;">Hi ${username}, you're all set!</h2>

    <p>Your email has been verified and your account is now fully activated. You're ready to take control of your personal finances!</p>

    <div style="background: #d1fae5; padding: 15px; border-radius: 8px; border: 1px solid #6ee7b7; margin: 20px 0;">
      <p style="margin: 0; color: #065f46; font-weight: 600;">
        You have a 14-day free trial to explore all premium features!
      </p>
    </div>

    <h3 style="color: #333;">Getting Started Tips:</h3>

    <div style="margin: 20px 0;">
      <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
        <div style="background: #14b8a6; color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 12px; flex-shrink: 0;">1</div>
        <div>
          <strong style="color: #333;">Add Your Accounts</strong>
          <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Connect your bank accounts or create manual accounts to track your finances</p>
        </div>
      </div>

      <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
        <div style="background: #14b8a6; color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 12px; flex-shrink: 0;">2</div>
        <div>
          <strong style="color: #333;">Import Transactions</strong>
          <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Upload CSV or OFX files from your bank to import historical data</p>
        </div>
      </div>

      <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
        <div style="background: #14b8a6; color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 12px; flex-shrink: 0;">3</div>
        <div>
          <strong style="color: #333;">Set Up Categories</strong>
          <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Customize categories to match your spending habits</p>
        </div>
      </div>

      <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
        <div style="background: #14b8a6; color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 12px; flex-shrink: 0;">4</div>
        <div>
          <strong style="color: #333;">Create Budgets</strong>
          <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Set monthly budgets to stay on track with your spending goals</p>
        </div>
      </div>

      <div style="display: flex; align-items: flex-start;">
        <div style="background: #14b8a6; color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 12px; flex-shrink: 0;">5</div>
        <div>
          <strong style="color: #333;">Explore Analytics</strong>
          <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">View charts and insights about your spending patterns</p>
        </div>
      </div>
    </div>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #666; font-size: 14px;">
      Questions? We're here to help! Just reply to this email.
    </p>

    <p style="color: #999; font-size: 11px; margin-top: 20px;">
      You received this email because you created a Flow Money Manager account.
      <a href="#" style="color: #14b8a6;">Unsubscribe</a> from marketing emails.
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

/**
 * Send trial expiring warning email
 * @param {string} email - Recipient email
 * @param {string} username - User's username
 * @param {number} daysRemaining - Days remaining in trial
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendTrialExpiringEmail(email, username, daysRemaining) {
  const dayText = daysRemaining === 1 ? 'day' : 'days';
  const subject = `Your trial expires in ${daysRemaining} ${dayText}`;

  const text = `
Hi ${username},

Your Flow Money Manager trial expires in ${daysRemaining} ${dayText}!

Don't lose access to these premium features:
- Unlimited accounts and transactions
- Advanced analytics and reports
- Budget forecasting
- Subscription tracking
- Priority support
- Data export

Upgrade now to continue enjoying all features without interruption.

Visit your account settings to upgrade to Pro.

Thanks for trying Flow Money Manager!

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
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Flow Money Manager</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Trial Expiring Soon</p>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none;">
    <h2 style="color: #333; margin-top: 0;">Hi ${username},</h2>

    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; border: 1px solid #fcd34d; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #92400e; font-size: 18px; font-weight: 600;">
        Your trial expires in ${daysRemaining} ${dayText}!
      </p>
    </div>

    <p>Don't lose access to these premium features:</p>

    <ul style="color: #555; padding-left: 20px;">
      <li>Unlimited accounts and transactions</li>
      <li>Advanced analytics and reports</li>
      <li>Budget forecasting</li>
      <li>Subscription tracking</li>
      <li>Priority support</li>
      <li>Data export</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <a href="#" style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
        Upgrade to Pro Now
      </a>
    </div>

    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #333;">Pro Plan - Just $9.99/month</h3>
      <ul style="color: #666; margin-bottom: 0; padding-left: 20px;">
        <li>Everything in Free, plus:</li>
        <li>Unlimited accounts</li>
        <li>Advanced reports & analytics</li>
        <li>Budget forecasting</li>
        <li>Priority email support</li>
      </ul>
    </div>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #666; font-size: 14px;">
      Questions about upgrading? Just reply to this email - we're happy to help!
    </p>

    <p style="color: #999; font-size: 11px; margin-top: 20px;">
      You received this email because you signed up for a Flow Money Manager trial.
      <a href="#" style="color: #f59e0b;">Unsubscribe</a> from marketing emails.
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Send trial expired email
 * @param {string} email - Recipient email
 * @param {string} username - User's username
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendTrialExpiredEmail(email, username) {
  const subject = 'Your Flow Money Manager trial has expired';

  const text = `
Hi ${username},

Your Flow Money Manager trial has expired.

Don't worry - your account and all your data are still safe! However, you now have limited access to features.

What's changed:
- Limited to 2 accounts
- Basic analytics only
- No budget forecasting
- Standard support

What you keep:
- All your transaction history
- Basic categorization
- Core budgeting features

Ready to unlock full access? Upgrade to Pro today and pick up right where you left off.

Thanks for trying Flow Money Manager. We hope to see you back soon!

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
  <div style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Flow Money Manager</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Trial Expired</p>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none;">
    <h2 style="color: #333; margin-top: 0;">Hi ${username},</h2>

    <p>Your Flow Money Manager trial has expired.</p>

    <div style="background: #fee2e2; padding: 15px; border-radius: 8px; border: 1px solid #fca5a5; margin: 20px 0;">
      <p style="margin: 0; color: #991b1b; font-weight: 600;">
        Your account is now on the Free plan with limited features.
      </p>
    </div>

    <p><strong>Don't worry</strong> - your account and all your data are still safe!</p>

    <div style="display: flex; gap: 20px; margin: 25px 0;">
      <div style="flex: 1; background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
        <h4 style="margin-top: 0; color: #dc2626;">What's changed:</h4>
        <ul style="color: #666; padding-left: 18px; margin-bottom: 0; font-size: 14px;">
          <li>Limited to 2 accounts</li>
          <li>Basic analytics only</li>
          <li>No budget forecasting</li>
          <li>Standard support</li>
        </ul>
      </div>

      <div style="flex: 1; background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
        <h4 style="margin-top: 0; color: #059669;">What you keep:</h4>
        <ul style="color: #666; padding-left: 18px; margin-bottom: 0; font-size: 14px;">
          <li>All your transaction history</li>
          <li>Basic categorization</li>
          <li>Core budgeting features</li>
          <li>Your saved data</li>
        </ul>
      </div>
    </div>

    <p>Ready to unlock full access? Upgrade to Pro today and pick up right where you left off.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="#" style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
        Upgrade to Pro - $9.99/month
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #666; font-size: 14px;">
      We hope you enjoyed the trial! If you have feedback, just reply to this email.
    </p>

    <p style="color: #999; font-size: 11px; margin-top: 20px;">
      You received this email because your Flow Money Manager trial has ended.
      <a href="#" style="color: #6b7280;">Unsubscribe</a> from marketing emails.
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({ to: email, subject, text, html });
}

/**
 * Test email delivery - sends a test email and returns detailed status
 * Use this to verify SMTP configuration is working correctly.
 * @param {string} recipientEmail - Email address to send test to
 * @returns {Promise<{success: boolean, configured: boolean, error?: string, details?: object}>}
 */
export async function testEmailDelivery(recipientEmail) {
  // First check if email is configured
  const configured = isEmailConfigured();

  if (!configured) {
    return {
      success: false,
      configured: false,
      error: 'Email service not configured. Set SMTP_USER and SMTP_PASS environment variables.',
      details: {
        smtpHost: config.host,
        smtpPort: config.port,
        smtpUserSet: !!config.auth.user,
        smtpPassSet: !!config.auth.pass
      }
    };
  }

  const subject = 'Test Email from Flow Money Manager';
  const timestamp = new Date().toISOString();

  const text = `
This is a test email from Flow Money Manager.

If you're receiving this email, your SMTP configuration is working correctly!

Sent at: ${timestamp}
SMTP Host: ${config.host}
SMTP Port: ${config.port}

- Flow Money Manager Email System
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
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Email Test</p>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none;">
    <div style="background: #d1fae5; padding: 20px; border-radius: 8px; border: 1px solid #6ee7b7; margin-bottom: 20px; text-align: center;">
      <h2 style="margin: 0; color: #065f46;">Email Configuration Working!</h2>
    </div>

    <p>This is a test email from Flow Money Manager. If you're receiving this, your SMTP configuration is working correctly!</p>

    <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #333;">Configuration Details</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Timestamp:</td>
          <td style="padding: 8px 0; font-family: monospace;">${timestamp}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">SMTP Host:</td>
          <td style="padding: 8px 0; font-family: monospace;">${config.host}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">SMTP Port:</td>
          <td style="padding: 8px 0; font-family: monospace;">${config.port}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">From Address:</td>
          <td style="padding: 8px 0; font-family: monospace;">${fromAddress}</td>
        </tr>
      </table>
    </div>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin-bottom: 0;">
      This is an automated test email. No action is required.
    </p>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await sendEmail({ to: recipientEmail, subject, text, html });

    return {
      success: result.success,
      configured: true,
      error: result.error,
      details: {
        smtpHost: config.host,
        smtpPort: config.port,
        fromAddress: fromAddress,
        recipientEmail: recipientEmail,
        timestamp: timestamp
      }
    };
  } catch (error) {
    return {
      success: false,
      configured: true,
      error: error.message,
      details: {
        smtpHost: config.host,
        smtpPort: config.port,
        fromAddress: fromAddress
      }
    };
  }
}

/**
 * Get email configuration status (for debugging/admin)
 * @returns {object} Configuration status without sensitive data
 */
export function getEmailConfigStatus() {
  return {
    configured: isEmailConfigured(),
    smtpHost: config.host,
    smtpPort: config.port,
    smtpUserSet: !!config.auth.user,
    smtpPassSet: !!config.auth.pass,
    fromAddress: fromAddress
  };
}
