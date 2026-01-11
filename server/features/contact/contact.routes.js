/**
 * Contact Routes
 *
 * Public contact form submission and admin message management.
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { getClientIP } from '../auth/auth.middleware.js';
import {
  saveContactMessage,
  getContactMessages,
  getUnreadCount,
  markMessageRead,
  deleteContactMessage,
  sendContactNotification
} from './contact.service.js';
import { getUserEmail } from '../auth/auth.service.js';

const router = Router();

/**
 * POST /api/contact
 * Submit a contact form message (public)
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    const db = getDb();
    const ipAddress = getClientIP(req);

    // Save the message
    const savedMessage = saveContactMessage(db, {
      name,
      email,
      subject,
      message,
      ipAddress
    });

    // Try to send notification email to admin (non-blocking)
    // Get admin user (first user) email
    const adminUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
    if (adminUser) {
      const adminEmail = getUserEmail(adminUser.id);
      if (adminEmail) {
        sendContactNotification(savedMessage, adminEmail).catch(err => {
          console.error('Failed to send contact notification:', err.message);
        });
      }
    }

    res.json({
      success: true,
      message: 'Thank you for your message. We will get back to you soon.'
    });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to submit contact form'
    });
  }
});

/**
 * GET /api/contact/messages
 * Get all contact messages (admin only)
 */
router.get('/messages', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';

    const messages = getContactMessages(db, { limit, offset, unreadOnly });
    const unreadCount = getUnreadCount(db);

    res.json({
      success: true,
      messages,
      unreadCount
    });
  } catch (error) {
    console.error('Get contact messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve messages'
    });
  }
});

/**
 * GET /api/contact/unread-count
 * Get unread message count (admin only)
 */
router.get('/unread-count', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const count = getUnreadCount(db);

    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get unread count'
    });
  }
});

/**
 * PUT /api/contact/messages/:id/read
 * Mark a message as read (admin only)
 */
router.put('/messages/:id/read', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid message ID'
      });
    }

    const success = markMessageRead(db, id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark message as read'
    });
  }
});

/**
 * DELETE /api/contact/messages/:id
 * Delete a contact message (admin only)
 */
router.delete('/messages/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid message ID'
      });
    }

    const success = deleteContactMessage(db, id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete message'
    });
  }
});

export default router;
