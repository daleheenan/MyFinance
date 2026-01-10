import { getDb } from '../../core/database.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 12;
const SESSION_DURATION_HOURS = 24;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Generate a secure random session token
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a random password for initial setup
 */
function generateRandomPassword() {
  return crypto.randomBytes(8).toString('base64').slice(0, 12);
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
      username: user.username
    }
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
    SELECT s.*, u.username, u.is_active
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
      username: session.username
    }
  };
}

/**
 * Change user password
 * @param {number} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function changePassword(userId, currentPassword, newPassword) {
  const db = getDb();

  // Validate new password
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters' };
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

  // Invalidate all other sessions (security measure)
  // Keep current session active

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
