import { Router } from 'express';
import {
  login,
  logout,
  verifySession,
  changePassword,
  getLoginHistory,
  getActiveSessions,
  revokeSession,
  hasUsers,
  createUser
} from './auth.service.js';
import { requireAuth, getClientIP } from './auth.middleware.js';
import {
  setSessionCookie,
  clearSessionCookie,
  setCsrfCookie,
  clearCsrfCookie,
  generateCsrfToken,
  getSessionFromCookie
} from '../../core/csrf.js';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'];

    const result = await login(username, password, ipAddress, userAgent);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: result.error
      });
    }

    // Set HTTP-only session cookie
    setSessionCookie(res, result.token);

    // Set CSRF token cookie (readable by JavaScript)
    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);

    res.json({
      success: true,
      token: result.token, // Still return token for backwards compatibility
      user: result.user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate current session
 */
router.post('/logout', requireAuth, (req, res) => {
  try {
    const result = logout(req.sessionToken);

    // Clear session and CSRF cookies
    clearSessionCookie(res);
    clearCsrfCookie(res);

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

/**
 * GET /api/auth/verify
 * Check if current session is valid
 * Supports both HTTP-only cookie and Bearer token
 * Also ensures CSRF cookie is set for authenticated users
 */
router.get('/verify', (req, res) => {
  try {
    // First try session cookie
    let token = getSessionFromCookie(req);

    // Fallback to Bearer token
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        token = authHeader.replace('Bearer ', '');
      }
    }

    if (!token) {
      return res.json({ valid: false });
    }

    const result = verifySession(token);

    // If valid session but no CSRF cookie, set one
    // This handles users who logged in before CSRF was implemented
    // or whose CSRF cookie expired while session is still valid
    if (result.valid && !req.cookies?.csrf_token) {
      const csrfToken = generateCsrfToken();
      setCsrfCookie(res, csrfToken);
    }

    res.json({
      valid: result.valid,
      user: result.user || null
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.json({ valid: false });
  }
});

/**
 * PUT /api/auth/password
 * Change user password
 */
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current and new password are required'
      });
    }

    const result = await changePassword(req.user.id, currentPassword, newPassword);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

/**
 * GET /api/auth/login-history
 * Get login attempt history (for security auditing)
 */
router.get('/login-history', requireAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = getLoginHistory(Math.min(limit, 100));

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Login history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve login history'
    });
  }
});

/**
 * GET /api/auth/sessions
 * Get active sessions for current user
 */
router.get('/sessions', requireAuth, (req, res) => {
  try {
    const sessions = getActiveSessions(req.user.id);

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sessions'
    });
  }
});

/**
 * DELETE /api/auth/sessions/:id
 * Revoke a specific session
 */
router.delete('/sessions/:id', requireAuth, (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);

    if (isNaN(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID'
      });
    }

    const result = revokeSession(sessionId, req.user.id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke session'
    });
  }
});

/**
 * GET /api/auth/status
 * Check if the system has been set up (has users)
 */
router.get('/status', (req, res) => {
  try {
    const hasSetup = hasUsers();
    res.json({
      success: true,
      hasUsers: hasSetup
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check status'
    });
  }
});

/**
 * POST /api/auth/setup
 * Initial setup - create first user (only works if no users exist)
 */
router.post('/setup', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const result = await createUser(username, password);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create account'
    });
  }
});

export default router;
