/**
 * Admin Service
 * Handles admin-only operations for user management
 */

import { getDb } from '../../core/database.js';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

/**
 * Check if a user is an admin
 * @param {number} userId
 * @returns {boolean}
 */
export function isAdmin(userId) {
  const db = getDb();
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
  return user?.is_admin === 1;
}

/**
 * Get all users with their details (admin only)
 * @returns {Array}
 */
export function getAllUsers() {
  const db = getDb();

  const users = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.full_name,
      u.is_active,
      u.is_admin,
      u.created_at,
      u.last_login,
      u.trial_start_date,
      u.trial_end_date,
      u.subscription_status,
      u.last_password_reset,
      u.failed_login_count,
      u.locked_until,
      (SELECT COUNT(*) FROM accounts WHERE user_id = u.id) as account_count,
      (SELECT COUNT(*) FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = u.id) as transaction_count
    FROM users u
    ORDER BY u.id
  `).all();

  return users;
}

/**
 * Get a single user by ID with full details (admin only)
 * @param {number} userId
 * @returns {Object|null}
 */
export function getUserById(userId) {
  const db = getDb();

  const user = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.full_name,
      u.is_active,
      u.is_admin,
      u.created_at,
      u.updated_at,
      u.last_login,
      u.trial_start_date,
      u.trial_end_date,
      u.subscription_status,
      u.last_password_reset,
      u.failed_login_count,
      u.locked_until,
      (SELECT COUNT(*) FROM accounts WHERE user_id = u.id) as account_count,
      (SELECT COUNT(*) FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = u.id) as transaction_count
    FROM users u
    WHERE u.id = ?
  `).get(userId);

  return user;
}

/**
 * Get login history for a specific user (admin only)
 * @param {number} userId
 * @param {number} limit
 * @returns {Array}
 */
export function getUserLoginHistory(userId, limit = 50) {
  const db = getDb();

  return db.prepare(`
    SELECT
      timestamp,
      ip_address,
      user_agent,
      success,
      failure_reason
    FROM login_attempts
    WHERE user_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(userId, limit);
}

/**
 * Get active sessions for a user (admin only)
 * @param {number} userId
 * @returns {Array}
 */
export function getUserSessions(userId) {
  const db = getDb();

  return db.prepare(`
    SELECT
      id,
      ip_address,
      user_agent,
      created_at,
      last_activity,
      expires_at
    FROM sessions
    WHERE user_id = ? AND expires_at > datetime('now')
    ORDER BY last_activity DESC
  `).all(userId);
}

/**
 * Update user details (admin only)
 * @param {number} userId
 * @param {Object} updates
 * @returns {{success: boolean, error?: string}}
 */
export function updateUser(userId, updates) {
  const db = getDb();

  // Check user exists
  const existing = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(userId);
  if (!existing) {
    return { success: false, error: 'User not found' };
  }

  // Build dynamic update
  const allowedFields = ['full_name', 'email', 'is_active', 'trial_start_date', 'trial_end_date', 'subscription_status'];
  const sets = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(updates[field]);
    }
  }

  if (sets.length === 0) {
    return { success: false, error: 'No valid fields to update' };
  }

  sets.push("updated_at = datetime('now')");
  params.push(userId);

  try {
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return { success: true };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return { success: false, error: 'Email already in use' };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Extend a user's trial period (admin only)
 * @param {number} userId
 * @param {string} newEndDate - ISO date string (YYYY-MM-DD)
 * @returns {{success: boolean, error?: string}}
 */
export function extendTrial(userId, newEndDate) {
  const db = getDb();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newEndDate)) {
    return { success: false, error: 'Invalid date format. Use YYYY-MM-DD' };
  }

  try {
    db.prepare(`
      UPDATE users
      SET trial_end_date = ?, subscription_status = 'trial', updated_at = datetime('now')
      WHERE id = ?
    `).run(newEndDate, userId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Activate a user's subscription (admin only)
 * @param {number} userId
 * @returns {{success: boolean, error?: string}}
 */
export function activateUser(userId) {
  const db = getDb();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  try {
    db.prepare(`
      UPDATE users
      SET subscription_status = 'active', is_active = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(userId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Lock a user account (admin only)
 * @param {number} userId
 * @param {string|null} until - ISO datetime string or null for indefinite
 * @returns {{success: boolean, error?: string}}
 */
export function lockUser(userId, until = null) {
  const db = getDb();

  const user = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Prevent locking admin users
  if (user.is_admin) {
    return { success: false, error: 'Cannot lock admin user' };
  }

  try {
    // If until is null, set a far future date for indefinite lock
    const lockUntil = until || '2099-12-31T23:59:59.000Z';
    db.prepare(`
      UPDATE users
      SET locked_until = ?, is_active = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(lockUntil, userId);

    // Also terminate all sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Unlock a user account (admin only)
 * @param {number} userId
 * @returns {{success: boolean, error?: string}}
 */
export function unlockUser(userId) {
  const db = getDb();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  try {
    db.prepare(`
      UPDATE users
      SET locked_until = NULL, is_active = 1, failed_login_count = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(userId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Reset a user's password (admin only)
 * @param {number} userId
 * @param {string} newPassword
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function resetUserPassword(userId, newPassword) {
  const db = getDb();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Validate password length
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, last_password_reset = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(passwordHash, userId);

    // Terminate all sessions to force re-login
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete a user and all their data (admin only)
 * @param {number} userId
 * @returns {{success: boolean, error?: string, deleted?: Object}}
 */
export function deleteUser(userId) {
  const db = getDb();

  const user = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Prevent deleting admin users
  if (user.is_admin) {
    return { success: false, error: 'Cannot delete admin user' };
  }

  try {
    const deleteTransaction = db.transaction(() => {
      // Count what we're deleting
      const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE user_id = ?').get(userId).count;
      const transactionCount = db.prepare(`
        SELECT COUNT(*) as count FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id = ?
      `).get(userId).count;

      // Delete in order (respecting foreign keys)
      // 1. Delete anomalies for user's transactions
      db.prepare(`
        DELETE FROM anomalies WHERE transaction_id IN (
          SELECT t.id FROM transactions t
          JOIN accounts a ON t.account_id = a.id
          WHERE a.user_id = ?
        )
      `).run(userId);

      // 2. Unlink transfers
      db.prepare(`
        UPDATE transactions SET linked_transaction_id = NULL
        WHERE linked_transaction_id IN (
          SELECT t.id FROM transactions t
          JOIN accounts a ON t.account_id = a.id
          WHERE a.user_id = ?
        )
      `).run(userId);

      // 3. Delete transactions
      db.prepare(`
        DELETE FROM transactions WHERE account_id IN (
          SELECT id FROM accounts WHERE user_id = ?
        )
      `).run(userId);

      // 4. Delete import batches
      db.prepare(`
        DELETE FROM import_batches WHERE account_id IN (
          SELECT id FROM accounts WHERE user_id = ?
        )
      `).run(userId);

      // 5. Delete user-specific tables
      db.prepare('DELETE FROM accounts WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM category_rules WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM budgets WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM recurring_patterns WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM settings WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM merchants WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM net_worth_snapshots WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM anomalies WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM login_attempts WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);

      // 6. Finally delete the user
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      return { accountCount, transactionCount };
    });

    const counts = deleteTransaction();

    return {
      success: true,
      deleted: {
        username: user.username,
        accounts: counts.accountCount,
        transactions: counts.transactionCount
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Create a new user (admin only)
 * @param {Object} userData
 * @returns {Promise<{success: boolean, error?: string, user?: Object}>}
 */
export async function createUser(userData) {
  const db = getDb();
  const { username, email, password, full_name, trial_days = 7 } = userData;

  // Validate required fields
  if (!username || username.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters' };
  }
  if (!password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }

  // Check for existing username
  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUsername) {
    return { success: false, error: 'Username already exists' };
  }

  // Check for existing email if provided
  if (email) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      return { success: false, error: 'Email already in use' };
    }
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const trialStart = new Date().toISOString().slice(0, 10);
    const trialEnd = new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const result = db.prepare(`
      INSERT INTO users (username, email, full_name, password_hash, trial_start_date, trial_end_date, subscription_status)
      VALUES (?, ?, ?, ?, ?, ?, 'trial')
    `).run(username, email || null, full_name || null, passwordHash, trialStart, trialEnd);

    const newUser = db.prepare('SELECT id, username, email, full_name, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    return { success: true, user: newUser };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Revoke all sessions for a user (admin only)
 * @param {number} userId
 * @returns {{success: boolean, revoked: number}}
 */
export function revokeAllSessions(userId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return { success: true, revoked: result.changes };
}
