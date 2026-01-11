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
  createUser,
  requestPasswordReset,
  validateResetToken,
  resetPassword,
  updateUserEmail,
  getUserEmail
} from './auth.service.js';
import { isEmailConfigured } from '../../core/email.js';
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

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get base URL from request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const result = await requestPasswordReset(email, baseUrl);

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process request'
    });
  }
});

/**
 * GET /api/auth/reset-password/:token
 * Validate a password reset token
 */
router.get('/reset-password/:token', (req, res) => {
  try {
    const { token } = req.params;
    const result = validateResetToken(token);

    res.json({
      success: true,
      valid: result.valid
    });
  } catch (error) {
    console.error('Validate reset token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate token'
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using a token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and password are required'
      });
    }

    const result = await resetPassword(token, password);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
});

/**
 * GET /api/auth/email
 * Get current user's email
 */
router.get('/email', requireAuth, (req, res) => {
  try {
    const email = getUserEmail(req.user.id);
    res.json({
      success: true,
      email
    });
  } catch (error) {
    console.error('Get email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get email'
    });
  }
});

/**
 * PUT /api/auth/email
 * Update current user's email
 */
router.put('/email', requireAuth, (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const result = updateUserEmail(req.user.id, email);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update email'
    });
  }
});

/**
 * GET /api/auth/email-configured
 * Check if email service is configured (for UI to show/hide forgot password)
 */
router.get('/email-configured', (req, res) => {
  res.json({
    success: true,
    configured: isEmailConfigured()
  });
});

/**
 * POST /api/auth/set-email
 * Set email for an account using username/password authentication
 * This allows users without email to set one for password recovery
 * Note: Does NOT create a session - just updates email
 */
router.post('/set-email', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and email are required'
      });
    }

    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'];

    // Verify credentials (this handles lockout, etc.)
    const loginResult = await login(username, password, ipAddress, userAgent);

    if (!loginResult.success) {
      return res.status(401).json({
        success: false,
        error: loginResult.error
      });
    }

    // Login succeeded - now update email
    const emailResult = updateUserEmail(loginResult.user.id, email);

    // Logout the temporary session we just created
    logout(loginResult.token);
    clearSessionCookie(res);
    clearCsrfCookie(res);

    if (!emailResult.success) {
      return res.status(400).json({
        success: false,
        error: emailResult.error
      });
    }

    res.json({
      success: true,
      message: 'Email updated successfully. You can now use forgot password or sign in.'
    });
  } catch (error) {
    console.error('Set email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set email'
    });
  }
});

export default router;
