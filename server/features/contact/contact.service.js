/**
 * Contact Service
 *
 * Handles contact form submissions - stores messages and optionally emails them.
 */

import { sendEmail, isEmailConfigured } from '../../core/email.js';

/**
 * Save a contact message to the database
 * @param {Database} db - better-sqlite3 database instance
 * @param {object} data - Contact form data
 * @param {string} data.name - Sender name
 * @param {string} data.email - Sender email
 * @param {string} data.subject - Message subject
 * @param {string} data.message - Message content
 * @param {string} [data.ipAddress] - Sender IP address
 * @returns {object} Created message record
 */
export function saveContactMessage(db, data) {
  const { name, email, subject, message, ipAddress } = data;

  // Validate required fields
  if (!name || !name.trim()) {
    throw new Error('Name is required');
  }
  if (!email || !email.trim()) {
    throw new Error('Email is required');
  }
  if (!subject || !subject.trim()) {
    throw new Error('Subject is required');
  }
  if (!message || !message.trim()) {
    throw new Error('Message is required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }

  const result = db.prepare(`
    INSERT INTO contact_messages (name, email, subject, message, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(name.trim(), email.trim().toLowerCase(), subject.trim(), message.trim(), ipAddress || null);

  return {
    id: result.lastInsertRowid,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    subject: subject.trim(),
    message: message.trim()
  };
}

/**
 * Get all contact messages (for admin)
 * @param {Database} db - better-sqlite3 database instance
 * @param {object} [options] - Query options
 * @param {number} [options.limit=50] - Max messages to return
 * @param {number} [options.offset=0] - Offset for pagination
 * @param {boolean} [options.unreadOnly=false] - Only return unread messages
 * @returns {object[]} Array of contact messages
 */
export function getContactMessages(db, options = {}) {
  const { limit = 50, offset = 0, unreadOnly = false } = options;

  let query = `
    SELECT id, name, email, subject, message, ip_address, is_read, created_at
    FROM contact_messages
  `;

  if (unreadOnly) {
    query += ' WHERE is_read = 0';
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  return db.prepare(query).all(limit, offset).map(msg => ({
    ...msg,
    isRead: Boolean(msg.is_read)
  }));
}

/**
 * Get unread message count
 * @param {Database} db - better-sqlite3 database instance
 * @returns {number} Count of unread messages
 */
export function getUnreadCount(db) {
  const result = db.prepare('SELECT COUNT(*) as count FROM contact_messages WHERE is_read = 0').get();
  return result.count;
}

/**
 * Mark a message as read
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} id - Message ID
 * @returns {boolean} Success
 */
export function markMessageRead(db, id) {
  const result = db.prepare('UPDATE contact_messages SET is_read = 1 WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Delete a contact message
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} id - Message ID
 * @returns {boolean} Success
 */
export function deleteContactMessage(db, id) {
  const result = db.prepare('DELETE FROM contact_messages WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Send notification email for new contact message
 * @param {object} message - Contact message data
 * @param {string} adminEmail - Admin email to notify
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendContactNotification(message, adminEmail) {
  if (!isEmailConfigured()) {
    return { success: false, error: 'Email not configured' };
  }

  const subject = `New Contact Message: ${message.subject}`;

  const text = `
New contact form submission on FinanceFlow:

From: ${message.name} <${message.email}>
Subject: ${message.subject}

Message:
${message.message}

---
Sent from FinanceFlow Contact Form
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); padding: 20px; border-radius: 10px 10px 0 0;">
    <h2 style="color: white; margin: 0;">New Contact Message</h2>
  </div>
  <div style="background: #f9f9f9; padding: 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 10px 10px;">
    <p><strong>From:</strong> ${message.name} &lt;${message.email}&gt;</p>
    <p><strong>Subject:</strong> ${message.subject}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <div style="background: white; padding: 15px; border-radius: 6px; border: 1px solid #e5e7eb;">
      <p style="white-space: pre-wrap; margin: 0;">${message.message}</p>
    </div>
    <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
      Reply directly to this email to respond to the sender.
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    to: adminEmail,
    subject,
    text,
    html
  });
}
