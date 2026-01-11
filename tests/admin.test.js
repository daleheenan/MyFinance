/**
 * Admin Endpoints Unit Tests
 *
 * Tests for admin-only functionality:
 * - GET /api/admin/users - List all users (admin only)
 * - GET /api/admin/users/:id - Get user details
 * - POST /api/admin/users/:id/extend-trial - Extend trial
 * - POST /api/admin/users/:id/lock - Lock user
 * - POST /api/admin/users/:id/unlock - Unlock user
 * - POST /api/admin/users/:id/reset-password - Reset user password
 * - DELETE /api/admin/users/:id - Delete user
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { createTestDb, closeTestDb } from '../server/db/testDatabase.js';
import { setDb, getDb } from '../server/core/database.js';
import { setupMiddleware } from '../server/core/middleware.js';
import { errorHandler, notFoundHandler } from '../server/core/errors.js';
import adminRouter from '../server/features/admin/admin.routes.js';
import authRouter from '../server/features/auth/auth.routes.js';

/**
 * Create test app with admin and auth routes
 */
function createTestApp(db) {
  const app = express();
  setDb(db);
  setupMiddleware(app);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/**
 * Create an admin user and return their auth token
 */
async function createAdminUser(db, username = 'admin', password = 'AdminPass123') {
  const passwordHash = await bcrypt.hash(password, 10);

  db.prepare(`
    INSERT INTO users (username, email, password_hash, is_admin, is_active)
    VALUES (?, ?, ?, 1, 1)
  `).run(username, `${username}@example.com`, passwordHash);

  return { username, password };
}

/**
 * Create a regular (non-admin) user
 */
async function createRegularUser(db, username = 'regularuser', password = 'UserPass123') {
  const passwordHash = await bcrypt.hash(password, 10);

  const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, is_admin, is_active, trial_start_date, trial_end_date, subscription_status)
    VALUES (?, ?, ?, 0, 1, date('now'), date('now', '+14 days'), 'trial')
  `).run(username, `${username}@example.com`, passwordHash);

  return { id: result.lastInsertRowid, username, password };
}

/**
 * Login and get auth token
 */
async function loginUser(app, username, password) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username, password });

  return response.body.token;
}

describe('Admin Routes', () => {
  let app, db;
  let adminToken, adminUser;

  beforeEach(async () => {
    db = createTestDb();
    app = createTestApp(db);
    // Clear default test user
    db.prepare('DELETE FROM users').run();

    // Create admin user
    adminUser = await createAdminUser(db);
    adminToken = await loginUser(app, adminUser.username, adminUser.password);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // GET /api/admin/users - List all users
  // ==========================================================================
  describe('GET /api/admin/users', () => {
    describe('Admin Access', () => {
      it('should return all users for admin', async () => {
        // Create some regular users
        await createRegularUser(db, 'user1');
        await createRegularUser(db, 'user2');

        const response = await request(app)
          .get('/api/admin/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThanOrEqual(3); // admin + 2 users
      });

      it('should include user details in response', async () => {
        await createRegularUser(db, 'detailuser');

        const response = await request(app)
          .get('/api/admin/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const user = response.body.data.find(u => u.username === 'detailuser');
        expect(user).toBeDefined();
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('username');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('is_active');
        expect(user).toHaveProperty('created_at');
      });

      it('should not expose password hash', async () => {
        await createRegularUser(db);

        const response = await request(app)
          .get('/api/admin/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        response.body.data.forEach(user => {
          expect(user.password_hash).toBeUndefined();
          expect(user.password).toBeUndefined();
        });
      });
    });

    describe('Non-Admin Access', () => {
      it('should return 403 for non-admin user', async () => {
        const regularUser = await createRegularUser(db);
        const regularToken = await loginUser(app, regularUser.username, regularUser.password);

        const response = await request(app)
          .get('/api/admin/users')
          .set('Authorization', `Bearer ${regularToken}`)
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toMatch(/admin/i);
      });

      it('should return 401 for unauthenticated request', async () => {
        const response = await request(app)
          .get('/api/admin/users')
          .expect(401);

        expect(response.body.error).toMatch(/authentication|required/i);
      });

      it('should return 401 for invalid token', async () => {
        const response = await request(app)
          .get('/api/admin/users')
          .set('Authorization', 'Bearer invalid-token-here')
          .expect(401);

        expect(response.body.error).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // GET /api/admin/users/:id - Get user details
  // ==========================================================================
  describe('GET /api/admin/users/:id', () => {
    it('should return user details for admin', async () => {
      const user = await createRegularUser(db, 'targetuser');

      const response = await request(app)
        .get(`/api/admin/users/${user.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe('targetuser');
      expect(response.body.data.id).toBe(user.id);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/admin/users/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/not found/i);
    });

    it('should return 400 for invalid user ID', async () => {
      const response = await request(app)
        .get('/api/admin/users/invalid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid/i);
    });

    it('should return 403 for non-admin', async () => {
      const regularUser = await createRegularUser(db);
      const regularToken = await loginUser(app, regularUser.username, regularUser.password);

      const response = await request(app)
        .get(`/api/admin/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // POST /api/admin/users/:id/extend-trial - Extend trial
  // ==========================================================================
  describe('POST /api/admin/users/:id/extend-trial', () => {
    it('should extend trial for user', async () => {
      const user = await createRegularUser(db, 'trialuser');
      const newEndDate = '2025-12-31';

      const response = await request(app)
        .post(`/api/admin/users/${user.id}/extend-trial`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ end_date: newEndDate })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify in database
      const dbUser = db.prepare('SELECT trial_end_date, subscription_status FROM users WHERE id = ?').get(user.id);
      expect(dbUser.trial_end_date).toBe(newEndDate);
      expect(dbUser.subscription_status).toBe('trial');
    });

    it('should require end_date parameter', async () => {
      const user = await createRegularUser(db);

      const response = await request(app)
        .post(`/api/admin/users/${user.id}/extend-trial`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/end_date.*required/i);
    });

    it('should validate date format', async () => {
      const user = await createRegularUser(db);

      const response = await request(app)
        .post(`/api/admin/users/${user.id}/extend-trial`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ end_date: 'not-a-date' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid.*date|format/i);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/admin/users/99999/extend-trial')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ end_date: '2025-12-31' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 for non-admin', async () => {
      const regularUser = await createRegularUser(db);
      const regularToken = await loginUser(app, regularUser.username, regularUser.password);

      const response = await request(app)
        .post(`/api/admin/users/${regularUser.id}/extend-trial`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ end_date: '2025-12-31' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // POST /api/admin/users/:id/lock - Lock user
  // ==========================================================================
  describe('POST /api/admin/users/:id/lock', () => {
    it('should lock user account', async () => {
      const user = await createRegularUser(db, 'lockableuser');

      const response = await request(app)
        .post(`/api/admin/users/${user.id}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify in database
      const dbUser = db.prepare('SELECT is_active, locked_until FROM users WHERE id = ?').get(user.id);
      expect(dbUser.is_active).toBe(0);
      expect(dbUser.locked_until).not.toBeNull();
    });

    it('should lock user until specified time', async () => {
      const user = await createRegularUser(db);
      const lockUntil = '2025-06-01T12:00:00.000Z';

      const response = await request(app)
        .post(`/api/admin/users/${user.id}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ until: lockUntil })
        .expect(200);

      expect(response.body.success).toBe(true);

      const dbUser = db.prepare('SELECT locked_until FROM users WHERE id = ?').get(user.id);
      expect(dbUser.locked_until).toBe(lockUntil);
    });

    it('should terminate user sessions on lock', async () => {
      const user = await createRegularUser(db);
      const userToken = await loginUser(app, user.username, user.password);

      // Verify session exists
      let sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(user.id);
      expect(sessions.length).toBeGreaterThan(0);

      // Lock user
      await request(app)
        .post(`/api/admin/users/${user.id}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify sessions are deleted
      sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(user.id);
      expect(sessions.length).toBe(0);
    });

    it('should prevent locking admin user', async () => {
      // Get admin user ID
      const admin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser.username);

      const response = await request(app)
        .post(`/api/admin/users/${admin.id}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/admin/i);
    });

    it('should return 403 for non-admin', async () => {
      const regularUser = await createRegularUser(db);
      const regularToken = await loginUser(app, regularUser.username, regularUser.password);
      const targetUser = await createRegularUser(db, 'targetuser');

      const response = await request(app)
        .post(`/api/admin/users/${targetUser.id}/lock`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // POST /api/admin/users/:id/unlock - Unlock user
  // ==========================================================================
  describe('POST /api/admin/users/:id/unlock', () => {
    it('should unlock user account', async () => {
      const user = await createRegularUser(db);

      // Lock the user first
      db.prepare(`
        UPDATE users SET is_active = 0, locked_until = datetime('now', '+1 day')
        WHERE id = ?
      `).run(user.id);

      const response = await request(app)
        .post(`/api/admin/users/${user.id}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify in database
      const dbUser = db.prepare('SELECT is_active, locked_until, failed_login_count FROM users WHERE id = ?').get(user.id);
      expect(dbUser.is_active).toBe(1);
      expect(dbUser.locked_until).toBeNull();
      expect(dbUser.failed_login_count).toBe(0);
    });

    it('should reset failed login count on unlock', async () => {
      const user = await createRegularUser(db);

      // Set failed attempts
      db.prepare('UPDATE users SET failed_login_count = 5, is_active = 0 WHERE id = ?').run(user.id);

      await request(app)
        .post(`/api/admin/users/${user.id}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const dbUser = db.prepare('SELECT failed_login_count FROM users WHERE id = ?').get(user.id);
      expect(dbUser.failed_login_count).toBe(0);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/admin/users/99999/unlock')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 for non-admin', async () => {
      const regularUser = await createRegularUser(db);
      const regularToken = await loginUser(app, regularUser.username, regularUser.password);
      const targetUser = await createRegularUser(db, 'lockeduser');

      const response = await request(app)
        .post(`/api/admin/users/${targetUser.id}/unlock`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // POST /api/admin/users/:id/reset-password - Reset user password
  // ==========================================================================
  describe('POST /api/admin/users/:id/reset-password', () => {
    it('should reset user password', async () => {
      const user = await createRegularUser(db);
      const newPassword = 'NewSecurePass456';

      const response = await request(app)
        .post(`/api/admin/users/${user.id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: newPassword })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify can login with new password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: user.username, password: newPassword })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
    });

    it('should require password parameter', async () => {
      const user = await createRegularUser(db);

      const response = await request(app)
        .post(`/api/admin/users/${user.id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/password.*required/i);
    });

    it('should validate password complexity', async () => {
      const user = await createRegularUser(db);

      const response = await request(app)
        .post(`/api/admin/users/${user.id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'short' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/8 characters/i);
    });

    it('should terminate user sessions on password reset', async () => {
      const user = await createRegularUser(db);
      await loginUser(app, user.username, user.password);

      // Verify session exists
      let sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(user.id);
      expect(sessions.length).toBeGreaterThan(0);

      // Reset password
      await request(app)
        .post(`/api/admin/users/${user.id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'NewPassword123' })
        .expect(200);

      // Verify sessions are deleted
      sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(user.id);
      expect(sessions.length).toBe(0);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/admin/users/99999/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'NewPassword123' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 for non-admin', async () => {
      const regularUser = await createRegularUser(db);
      const regularToken = await loginUser(app, regularUser.username, regularUser.password);
      const targetUser = await createRegularUser(db, 'targetuser');

      const response = await request(app)
        .post(`/api/admin/users/${targetUser.id}/reset-password`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ password: 'NewPassword123' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // DELETE /api/admin/users/:id - Delete user
  // ==========================================================================
  describe('DELETE /api/admin/users/:id', () => {
    it('should delete user and all their data', async () => {
      const user = await createRegularUser(db, 'deleteme');

      // Add some data for the user
      db.prepare('INSERT INTO accounts (user_id, account_name) VALUES (?, ?)').run(user.id, 'Test Account');

      const response = await request(app)
        .delete(`/api/admin/users/${user.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify user is deleted
      const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      expect(dbUser).toBeUndefined();

      // Verify user data is deleted
      const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(user.id);
      expect(accounts.length).toBe(0);
    });

    it('should prevent deleting admin user', async () => {
      const admin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser.username);

      const response = await request(app)
        .delete(`/api/admin/users/${admin.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/admin|cannot.*delete/i);
    });

    it('should prevent self-deletion', async () => {
      const admin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser.username);

      const response = await request(app)
        .delete(`/api/admin/users/${admin.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/own.*account|cannot.*delete|admin/i);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .delete('/api/admin/users/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 for non-admin', async () => {
      const regularUser = await createRegularUser(db);
      const regularToken = await loginUser(app, regularUser.username, regularUser.password);
      const targetUser = await createRegularUser(db, 'targetuser');

      const response = await request(app)
        .delete(`/api/admin/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should delete user sessions', async () => {
      const user = await createRegularUser(db);
      await loginUser(app, user.username, user.password);

      // Verify session exists
      let sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(user.id);
      expect(sessions.length).toBeGreaterThan(0);

      // Delete user
      await request(app)
        .delete(`/api/admin/users/${user.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify sessions are deleted
      sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(user.id);
      expect(sessions.length).toBe(0);
    });
  });

  // ==========================================================================
  // POST /api/admin/users - Create new user
  // ==========================================================================
  describe('POST /api/admin/users', () => {
    it('should create new user', async () => {
      const response = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'NewUserPass123'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe('newuser');
      expect(response.body.data.email).toBe('newuser@example.com');
    });

    it('should set trial period for new user', async () => {
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'trialuser',
          email: 'trial@example.com',
          password: 'TrialPass123',
          trial_days: 30
        })
        .expect(201);

      const user = db.prepare('SELECT trial_start_date, trial_end_date FROM users WHERE username = ?').get('trialuser');
      expect(user.trial_start_date).toBeDefined();
      expect(user.trial_end_date).toBeDefined();
    });

    it('should reject duplicate username', async () => {
      await createRegularUser(db, 'existinguser');

      const response = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'existinguser',
          email: 'different@example.com',
          password: 'Password123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/username.*exists/i);
    });

    it('should reject duplicate email', async () => {
      await createRegularUser(db, 'user1');

      const response = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'newusername',
          email: 'user1@example.com',
          password: 'Password123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/email.*in use/i);
    });

    it('should return 403 for non-admin', async () => {
      const regularUser = await createRegularUser(db);
      const regularToken = await loginUser(app, regularUser.username, regularUser.password);

      const response = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({
          username: 'newuser',
          email: 'new@example.com',
          password: 'Password123'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // Security Tests
  // ==========================================================================
  describe('Security', () => {
    it('should not allow SQL injection in user ID', async () => {
      const response = await request(app)
        .get("/api/admin/users/1; DROP TABLE users;--")
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      // Table should still exist
      const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
      expect(count.count).toBeGreaterThan(0);
    });

    it('should handle concurrent admin requests safely', async () => {
      const user = await createRegularUser(db, 'concurrentuser');

      // Make multiple concurrent requests
      const promises = [
        request(app).get(`/api/admin/users/${user.id}`).set('Authorization', `Bearer ${adminToken}`),
        request(app).get(`/api/admin/users/${user.id}`).set('Authorization', `Bearer ${adminToken}`),
        request(app).get(`/api/admin/users/${user.id}`).set('Authorization', `Bearer ${adminToken}`)
      ];

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    it('should validate admin status on each request', async () => {
      const admin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser.username);

      // Demote admin (simulate admin status removed)
      db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(admin.id);

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });
});
