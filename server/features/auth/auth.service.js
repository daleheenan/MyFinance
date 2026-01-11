import { getDb } from '../../core/database.js';
import { sendPasswordResetEmail, isEmailConfigured } from '../../core/email.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 12;
const SESSION_DURATION_HOURS = 24;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const PASSWORD_RESET_EXPIRY_HOURS = 1;

// Password complexity requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = {
  minLength: PASSWORD_MIN_LENGTH,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false // Not required but allowed
};

/**
 * Validate password complexity
 * @param {string} password
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validatePassword(password) {
  const errors = [];

  if (!password || password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (PASSWORD_REQUIREMENTS.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate a secure random session token
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a random password for initial setup that meets complexity requirements
 */
function generateRandomPassword() {
  // Generate a password that meets complexity requirements
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const all = lower + upper + numbers;

  // Ensure at least one of each required type
  let password = '';
  password += lower[Math.floor(Math.random() * lower.length)];
  password += upper[Math.floor(Math.random() * upper.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];

  // Fill rest with random characters
  for (let i = 0; i < 9; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Check if account is locked
 */
function isAccountLocked(user) {
  if (!user.locked_until) return false;
  return new Date(user.locked_until) > new Date();
}

/**
 * Login user with credentials
 * @param {string} username
 * @param {string} password
 * @param {string} ipAddress
 * @param {string} userAgent
 * @returns {Promise<{success: boolean, token?: string, error?: string, user?: object}>}
 */
export async function login(username, password, ipAddress, userAgent) {
  const db = getDb();

  // Find user
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  // Log the attempt
  const logAttempt = (success, failureReason = null, userId = null) => {
    db.prepare(`
      INSERT INTO login_attempts (username_attempted, ip_address, user_agent, success, failure_reason, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(username, ipAddress, userAgent?.slice(0, 500), success ? 1 : 0, failureReason, userId);
  };

  // User not found
  if (!user) {
    logAttempt(false, 'User not found');
    return { success: false, error: 'Invalid username or password' };
  }

  // Check if account is locked
  if (isAccountLocked(user)) {
    const remainingMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    logAttempt(false, 'Account locked', user.id);
    return { success: false, error: `Account locked. Try again in ${remainingMinutes} minutes.` };
  }

  // Check if account is active
  if (!user.is_active) {
    logAttempt(false, 'Account inactive', user.id);
    return { success: false, error: 'Account is disabled' };
  }

  // Verify password
  const validPassword = await bcrypt.compare(password, user.password_hash);

  if (!validPassword) {
    // Increment failed attempts
    const newFailedCount = user.failed_login_count + 1;

    if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
      // Lock the account
      const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newFailedCount, lockUntil, user.id);
      logAttempt(false, `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts`, user.id);
      return { success: false, error: `Account locked due to too many failed attempts. Try again in ${LOCKOUT_DURATION_MINUTES} minutes.` };
    } else {
      db.prepare(`
        UPDATE users SET failed_login_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newFailedCount, user.id);
      logAttempt(false, 'Invalid password', user.id);
      return { success: false, error: 'Invalid username or password' };
    }
  }

  // Success - reset failed attempts and create session
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare(`
    UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id);

  db.prepare(`
    INSERT INTO sessions (session_token, user_id, ip_address, user_agent, expires_at, last_activity)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(sessionToken, user.id, ipAddress, userAgent?.slice(0, 500), expiresAt);

  logAttempt(true, null, user.id);

  return {
    success: true,
    token: sessionToken,
    user: {
      id: user.id,
      username: user.username,
      isAdmin: user.is_admin === 1
    },
    requiresEmail: !user.email
  };
}

/**
 * Logout user by invalidating session
 * @param {string} sessionToken
 * @returns {{success: boolean}}
 */
export function logout(sessionToken) {
  const db = getDb();
  const result = db.prepare('DELETE FROM sessions WHERE session_token = ?').run(sessionToken);
  return { success: result.changes > 0 };
}

/**
 * Verify if session is valid and update last activity
 * @param {string} sessionToken
 * @returns {{valid: boolean, user?: object}}
 */
export function verifySession(sessionToken) {
  const db = getDb();

  const session = db.prepare(`
    SELECT s.*, u.username, u.is_active, u.is_admin
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_token = ?
  `).get(sessionToken);

  if (!session) {
    return { valid: false };
  }

  // Check if expired
  if (new Date(session.expires_at) < new Date()) {
    // Clean up expired session
    db.prepare('DELETE FROM sessions WHERE session_token = ?').run(sessionToken);
    return { valid: false };
  }

  // Check if user is still active
  if (!session.is_active) {
    return { valid: false };
  }

  // Update last activity
  db.prepare(`
    UPDATE sessions SET last_activity = CURRENT_TIMESTAMP
    WHERE session_token = ?
  `).run(sessionToken);

  return {
    valid: true,
    user: {
      id: session.user_id,
      username: session.username,
      isAdmin: session.is_admin === 1
    }
  };
}

/**
 * Change user password
 * @param {number} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} [currentSessionToken] - Current session to keep active
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function changePassword(userId, currentPassword, newPassword, currentSessionToken = null) {
  const db = getDb();

  // Validate new password complexity
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return { success: false, error: passwordValidation.errors.join('. ') };
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Verify current password
  const validPassword = await bcrypt.compare(currentPassword, user.password_hash);

  if (!validPassword) {
    return { success: false, error: 'Current password is incorrect' };
  }

  // Hash new password
  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newHash, userId);

  // Invalidate all sessions except the current one (security measure)
  if (currentSessionToken) {
    db.prepare(`
      DELETE FROM sessions WHERE user_id = ? AND session_token != ?
    `).run(userId, currentSessionToken);
  } else {
    // If no current session provided, invalidate all sessions
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  }

  return { success: true };
}

/**
 * Get login history
 * @param {number} limit
 * @returns {Array}
 */
export function getLoginHistory(limit = 50) {
  const db = getDb();

  return db.prepare(`
    SELECT
      timestamp,
      username_attempted,
      ip_address,
      success,
      failure_reason
    FROM login_attempts
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get active sessions for a user
 * @param {number} userId
 * @returns {Array}
 */
export function getActiveSessions(userId) {
  const db = getDb();

  return db.prepare(`
    SELECT
      id,
      ip_address,
      user_agent,
      created_at,
      last_activity
    FROM sessions
    WHERE user_id = ? AND expires_at > datetime('now')
    ORDER BY last_activity DESC
  `).all(userId);
}

/**
 * Revoke a specific session
 * @param {number} sessionId
 * @param {number} userId
 * @returns {{success: boolean}}
 */
export function revokeSession(sessionId, userId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(sessionId, userId);
  return { success: result.changes > 0 };
}

/**
 * Create a new user (for initial setup)
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createUser(username, password) {
  const db = getDb();

  // Check if users already exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) {
    return { success: false, error: 'Setup already completed' };
  }

  // Validate username
  if (!username || username.length < 1) {
    return { success: false, error: 'Username is required' };
  }

  // Validate password complexity
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return { success: false, error: passwordValidation.errors.join('. ') };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    db.prepare(`
      INSERT INTO users (username, password_hash)
      VALUES (?, ?)
    `).run(username, passwordHash);

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to create user' };
  }
}

/**
 * Create initial admin user if no users exist
 * @returns {{created: boolean, username?: string, password?: string}}
 */
export async function createInitialUser() {
  const db = getDb();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();

  if (userCount.count > 0) {
    return { created: false };
  }

  const username = 'admin';
  const password = generateRandomPassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  db.prepare(`
    INSERT INTO users (username, password_hash)
    VALUES (?, ?)
  `).run(username, passwordHash);

  return {
    created: true,
    username,
    password
  };
}

/**
 * Clean up expired sessions
 * @returns {{cleaned: number}}
 */
export function cleanupExpiredSessions() {
  const db = getDb();
  const result = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  return { cleaned: result.changes };
}

/**
 * Check if any users exist
 * @returns {boolean}
 */
export function hasUsers() {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return result.count > 0;
}

/**
 * Update user email
 * @param {number} userId
 * @param {string} email
 * @returns {{success: boolean, error?: string}}
 */
export function updateUserEmail(userId, email) {
  const db = getDb();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: 'Invalid email format' };
  }

  // Check if email is already in use by another user
  const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
  if (existing) {
    return { success: false, error: 'Email already in use' };
  }

  try {
    db.prepare('UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(email, userId);
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to update email' };
  }
}

/**
 * Get user email
 * @param {number} userId
 * @returns {string|null}
 */
export function getUserEmail(userId) {
  const db = getDb();
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  return user?.email || null;
}

/**
 * Request password reset - sends email with reset link
 * @param {string} email
 * @param {string} baseUrl - Base URL for the app
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function requestPasswordReset(email, baseUrl) {
  const db = getDb();

  // Check if email service is configured
  if (!isEmailConfigured()) {
    return { success: false, error: 'Email service not configured' };
  }

  // Find user by email
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);

  // Always return success to prevent email enumeration
  // But only actually send email if user exists
  if (!user) {
    // Delay to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, 500));
    return { success: true };
  }

  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  // Invalidate any existing tokens for this user
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?').run(user.id);

  // Create new token
  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, token, expiresAt);

  // Send email
  const emailResult = await sendPasswordResetEmail(email, token, baseUrl);

  if (!emailResult.success) {
    console.error('Failed to send password reset email:', emailResult.error);
    // Don't expose email sending failures to prevent information disclosure
    return { success: true };
  }

  return { success: true };
}

/**
 * Validate a password reset token
 * @param {string} token
 * @returns {{valid: boolean, userId?: number}}
 */
export function validateResetToken(token) {
  const db = getDb();

  const resetToken = db.prepare(`
    SELECT user_id, expires_at, used
    FROM password_reset_tokens
    WHERE token = ?
  `).get(token);

  if (!resetToken) {
    return { valid: false };
  }

  // Check if expired
  if (new Date(resetToken.expires_at) < new Date()) {
    return { valid: false };
  }

  // Check if already used
  if (resetToken.used) {
    return { valid: false };
  }

  return { valid: true, userId: resetToken.user_id };
}

/**
 * Reset password using a reset token
 * @param {string} token
 * @param {string} newPassword
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function resetPassword(token, newPassword) {
  const db = getDb();

  // Validate token
  const tokenValidation = validateResetToken(token);
  if (!tokenValidation.valid) {
    return { success: false, error: 'Invalid or expired reset link' };
  }

  // Validate new password complexity
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return { success: false, error: passwordValidation.errors.join('. ') };
  }

  // Hash new password
  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // Update password
  db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newHash, tokenValidation.userId);

  // Mark token as used
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);

  // Invalidate all sessions for this user (security measure)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(tokenValidation.userId);

  return { success: true };
}

/**
 * Clean up expired password reset tokens
 * @returns {{cleaned: number}}
 */
export function cleanupExpiredResetTokens() {
  const db = getDb();
  const result = db.prepare("DELETE FROM password_reset_tokens WHERE expires_at < datetime('now') OR used = 1").run();
  return { cleaned: result.changes };
}
