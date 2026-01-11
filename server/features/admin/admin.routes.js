/**
 * Admin Routes
 * Admin-only endpoints for user management
 *
 * All routes require authentication AND admin privileges
 */

import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  isAdmin,
  getAllUsers,
  getUserById,
  getUserLoginHistory,
  getUserSessions,
  updateUser,
  extendTrial,
  activateUser,
  lockUser,
  unlockUser,
  resetUserPassword,
  deleteUser,
  createUser,
  revokeAllSessions
} from './admin.service.js';

const router = Router();

/**
 * Admin middleware - checks if user is admin
 */
function requireAdmin(req, res, next) {
  if (!req.user || !isAdmin(req.user.id)) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
}

// Apply auth and admin check to all routes
router.use(requireAuth);
router.use(requireAdmin);

// ==========================================================================
// GET /api/admin/users - List all users
// ==========================================================================
router.get('/users', (req, res, next) => {
  try {
    const users = getAllUsers();
    res.json({
      success: true,
      data: users
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/admin/users - Create a new user
// ==========================================================================
router.post('/users', async (req, res, next) => {
  try {
    const { username, email, password, full_name, trial_days } = req.body;

    const result = await createUser({ username, email, password, full_name, trial_days });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.status(201).json({
      success: true,
      data: result.user
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/admin/users/:id - Get single user details
// ==========================================================================
router.get('/users/:id', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// PUT /api/admin/users/:id - Update user details
// ==========================================================================
router.put('/users/:id', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const result = updateUser(userId, req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    // Return updated user
    const user = getUserById(userId);
    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/admin/users/:id/login-history - Get user's login history
// ==========================================================================
router.get('/users/:id/login-history', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const limit = parseInt(req.query.limit, 10) || 50;
    const history = getUserLoginHistory(userId, limit);

    res.json({
      success: true,
      data: history
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/admin/users/:id/sessions - Get user's active sessions
// ==========================================================================
router.get('/users/:id/sessions', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const sessions = getUserSessions(userId);

    res.json({
      success: true,
      data: sessions
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/admin/users/:id/extend-trial - Extend user's trial period
// ==========================================================================
router.post('/users/:id/extend-trial', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const { end_date } = req.body;
    if (!end_date) {
      return res.status(400).json({
        success: false,
        error: 'end_date is required'
      });
    }

    const result = extendTrial(userId, end_date);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    const user = getUserById(userId);
    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/admin/users/:id/activate - Activate user's subscription
// ==========================================================================
router.post('/users/:id/activate', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const result = activateUser(userId);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    const user = getUserById(userId);
    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/admin/users/:id/lock - Lock user account
// ==========================================================================
router.post('/users/:id/lock', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const { until } = req.body; // Optional datetime string

    const result = lockUser(userId, until || null);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    const user = getUserById(userId);
    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/admin/users/:id/unlock - Unlock user account
// ==========================================================================
router.post('/users/:id/unlock', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const result = unlockUser(userId);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    const user = getUserById(userId);
    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/admin/users/:id/reset-password - Reset user's password
// ==========================================================================
router.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'password is required'
      });
    }

    const result = await resetUserPassword(userId, password);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/admin/users/:id/revoke-sessions - Revoke all user sessions
// ==========================================================================
router.post('/users/:id/revoke-sessions', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const result = revokeAllSessions(userId);

    res.json({
      success: true,
      data: {
        revoked: result.revoked
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// DELETE /api/admin/users/:id - Delete user and all their data
// ==========================================================================
router.delete('/users/:id', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    const result = deleteUser(userId);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: result.deleted
    });
  } catch (err) {
    next(err);
  }
});

export default router;
