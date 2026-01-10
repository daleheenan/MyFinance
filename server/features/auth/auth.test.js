/**
 * Authentication Routes & Service Tests
 *
 * Tests for:
 * - POST /api/auth/login - User login
 * - POST /api/auth/logout - User logout
 * - GET /api/auth/verify - Verify session
 * - PUT /api/auth/password - Change password
 * - GET /api/auth/login-history - Get login attempts
 * - Security: SQL injection, rate limiting, account lockout
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { createTestDb, closeTestDb } from '../../db/testDatabase.js';
import { setDb, getDb } from '../../core/database.js';
import { setupMiddleware } from '../../core/middleware.js';
import { errorHandler, notFoundHandler } from '../../core/errors.js';
import authRouter from './auth.routes.js';
import * as authService from './auth.service.js';

/**
 * Create test app with auth routes
 */
function createTestApp(db) {
  const app = express();
  setDb(db);
  setupMiddleware(app);
  app.use('/api/auth', authRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/**
 * Create a test user in the database
 */
async function createTestUser(db, username = 'testuser', password = 'password123') {
  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare(`
    INSERT INTO users (username, password_hash)
    VALUES (?, ?)
  `).run(username, passwordHash);
  return { username, password };
}

describe('Auth Routes', () => {
  let app, db;

  beforeEach(async () => {
    db = createTestDb();
    app = createTestApp(db);
    // Create test user
    await createTestUser(db, 'testuser', 'password123');
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // POST /api/auth/login - User login
  // ==========================================================================
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.token.length).toBe(64); // 32 bytes hex
      expect(response.body.user.username).toBe('testuser');
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'wrongpassword' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid username or password');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'password123' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid username or password');
    });

    it('should require username and password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Username and password are required');
    });

    it('should create session on successful login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      // Verify session was created in database
      const session = db.prepare('SELECT * FROM sessions WHERE session_token = ?')
        .get(response.body.token);

      expect(session).toBeDefined();
      expect(session.user_id).toBe(1);
    });

    it('should log successful login attempt', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      const attempt = db.prepare('SELECT * FROM login_attempts ORDER BY id DESC LIMIT 1').get();
      expect(attempt.success).toBe(1);
      expect(attempt.username_attempted).toBe('testuser');
    });

    it('should log failed login attempt', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'wrongpassword' })
        .expect(401);

      const attempt = db.prepare('SELECT * FROM login_attempts ORDER BY id DESC LIMIT 1').get();
      expect(attempt.success).toBe(0);
      expect(attempt.failure_reason).toBe('Invalid password');
    });
  });

  // ==========================================================================
  // Account Lockout Tests
  // ==========================================================================
  describe('Account Lockout', () => {
    it('should lock account after 5 failed attempts', async () => {
      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ username: 'testuser', password: 'wrongpassword' });
      }

      // 6th attempt should get lockout message
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(401);

      expect(response.body.error).toContain('Account locked');
    });

    it('should reset failed attempts after successful login', async () => {
      // Make 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ username: 'testuser', password: 'wrongpassword' });
      }

      // Successful login
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      // Check failed count reset
      const user = db.prepare('SELECT failed_login_count FROM users WHERE username = ?')
        .get('testuser');
      expect(user.failed_login_count).toBe(0);
    });
  });

  // ==========================================================================
  // POST /api/auth/logout - User logout
  // ==========================================================================
  describe('POST /api/auth/logout', () => {
    it('should logout and invalidate session', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      const token = loginResponse.body.token;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify session is deleted
      const session = db.prepare('SELECT * FROM sessions WHERE session_token = ?').get(token);
      expect(session).toBeUndefined();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  // ==========================================================================
  // GET /api/auth/verify - Verify session
  // ==========================================================================
  describe('GET /api/auth/verify', () => {
    it('should return valid: true for valid session', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.user.username).toBe('testuser');
    });

    it('should return valid: false for invalid session', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid_token')
        .expect(200);

      expect(response.body.valid).toBe(false);
    });

    it('should return valid: false for expired session', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      // Manually expire the session
      db.prepare(`
        UPDATE sessions SET expires_at = datetime('now', '-1 hour')
        WHERE session_token = ?
      `).run(loginResponse.body.token);

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      expect(response.body.valid).toBe(false);
    });
  });

  // ==========================================================================
  // PUT /api/auth/password - Change password
  // ==========================================================================
  describe('PUT /api/auth/password', () => {
    it('should change password with valid current password', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .send({ currentPassword: 'password123', newPassword: 'newpassword123' })
        .expect(200);

      // Verify can login with new password
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'newpassword123' })
        .expect(200);
    });

    it('should reject incorrect current password', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword123' })
        .expect(400);

      expect(response.body.error).toBe('Current password is incorrect');
    });

    it('should require minimum password length', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .send({ currentPassword: 'password123', newPassword: 'short' })
        .expect(400);

      expect(response.body.error).toContain('at least 8 characters');
    });
  });

  // ==========================================================================
  // GET /api/auth/login-history - Get login attempts
  // ==========================================================================
  describe('GET /api/auth/login-history', () => {
    it('should return login history', async () => {
      // Make some login attempts
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'wrongpassword' });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password123' })
        .expect(200);

      const response = await request(app)
        .get('/api/auth/login-history')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.history.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // SQL Injection Tests
  // ==========================================================================
  describe('SQL Injection Protection', () => {
    it('should not be vulnerable to SQL injection in username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: "admin'; DROP TABLE users; --", password: 'password' })
        .expect(401);

      // Table should still exist
      const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
      expect(count.count).toBeGreaterThan(0);
    });

    it('should not be vulnerable to SQL injection in password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: "' OR '1'='1" })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should not be vulnerable to SQL injection in session token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', "Bearer ' OR '1'='1")
        .expect(200);

      expect(response.body.valid).toBe(false);
    });
  });
});

// ==========================================================================
// Auth Service Unit Tests
// ==========================================================================
describe('Auth Service', () => {
  let db;

  beforeEach(async () => {
    db = createTestDb();
    setDb(db);
    await createTestUser(db, 'testuser', 'password123');
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('createInitialUser', () => {
    it('should not create user if users already exist', async () => {
      const result = await authService.createInitialUser();
      expect(result.created).toBe(false);
    });

    it('should create admin user if no users exist', async () => {
      // Clear users
      db.prepare('DELETE FROM users').run();

      const result = await authService.createInitialUser();
      expect(result.created).toBe(true);
      expect(result.username).toBe('admin');
      expect(result.password).toBeDefined();
      expect(result.password.length).toBe(12);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', async () => {
      // Create an expired session
      db.prepare(`
        INSERT INTO sessions (session_token, user_id, expires_at)
        VALUES ('expired_token', 1, datetime('now', '-1 hour'))
      `).run();

      // Create a valid session
      db.prepare(`
        INSERT INTO sessions (session_token, user_id, expires_at)
        VALUES ('valid_token', 1, datetime('now', '+1 hour'))
      `).run();

      const result = authService.cleanupExpiredSessions();
      expect(result.cleaned).toBe(1);

      // Verify expired is gone, valid remains
      const sessions = db.prepare('SELECT * FROM sessions').all();
      expect(sessions.length).toBe(1);
      expect(sessions[0].session_token).toBe('valid_token');
    });
  });

  describe('hasUsers', () => {
    it('should return true when users exist', () => {
      expect(authService.hasUsers()).toBe(true);
    });

    it('should return false when no users exist', () => {
      db.prepare('DELETE FROM users').run();
      expect(authService.hasUsers()).toBe(false);
    });
  });
});
