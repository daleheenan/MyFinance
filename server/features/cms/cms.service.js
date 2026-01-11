/**
 * CMS Service
 *
 * Provides CRUD operations for CMS pages and images.
 * Pages are global (not user-scoped) - admin only.
 */

import { unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../../public/uploads/cms');

// =============================================================================
// Page Operations
// =============================================================================

/**
 * Get all CMS pages (for admin listing)
 *
 * @param {Database} db - better-sqlite3 database instance
 * @returns {object[]} Array of pages
 */
export function getAllPages(db) {
  return db.prepare(`
    SELECT id, slug, title, meta_title, meta_description, is_published, created_at, updated_at
    FROM cms_pages
    ORDER BY updated_at DESC
  `).all().map(page => ({
    ...page,
    isPublished: Boolean(page.is_published)
  }));
}

/**
 * Get a single page by ID (for editing)
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} id - Page ID
 * @returns {object|null} Page object or null
 */
export function getPageById(db, id) {
  const page = db.prepare(`
    SELECT id, slug, title, content, css, meta_title, meta_description, is_published, created_at, updated_at
    FROM cms_pages
    WHERE id = ?
  `).get(id);

  if (!page) return null;

  return {
    ...page,
    isPublished: Boolean(page.is_published)
  };
}

/**
 * Get a published page by slug (for public viewing)
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} slug - Page slug
 * @returns {object|null} Page object or null
 */
export function getPublishedPageBySlug(db, slug) {
  const page = db.prepare(`
    SELECT id, slug, title, content, css, meta_title, meta_description
    FROM cms_pages
    WHERE slug = ? AND is_published = 1
  `).get(slug);

  return page || null;
}

/**
 * Create a new CMS page
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {object} data - Page data
 * @param {string} data.slug - URL slug (unique)
 * @param {string} data.title - Page title
 * @param {string} [data.content=''] - HTML content
 * @param {string} [data.css=''] - Custom CSS
 * @param {string} [data.metaTitle] - SEO title
 * @param {string} [data.metaDescription] - SEO description
 * @returns {object} Created page
 * @throws {Error} If slug is invalid or duplicate
 */
export function createPage(db, data) {
  const { slug, title, content = '', css = '', metaTitle, metaDescription } = data;

  // Validate slug
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    throw new Error('Slug is required');
  }

  // Validate title
  if (!title || !title.trim()) {
    throw new Error('Title is required');
  }

  // Check for duplicate slug
  const existing = db.prepare('SELECT id FROM cms_pages WHERE slug = ?').get(normalizedSlug);
  if (existing) {
    throw new Error('A page with this slug already exists');
  }

  const result = db.prepare(`
    INSERT INTO cms_pages (slug, title, content, css, meta_title, meta_description, is_published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
  `).run(normalizedSlug, title.trim(), content, css, metaTitle || null, metaDescription || null);

  return getPageById(db, result.lastInsertRowid);
}

/**
 * Update an existing CMS page
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} id - Page ID
 * @param {object} data - Fields to update
 * @returns {object} Updated page
 * @throws {Error} If page not found or slug conflict
 */
export function updatePage(db, id, data) {
  const existing = db.prepare('SELECT id FROM cms_pages WHERE id = ?').get(id);
  if (!existing) {
    throw new Error('Page not found');
  }

  const updates = [];
  const values = [];

  if ('slug' in data) {
    const normalizedSlug = normalizeSlug(data.slug);
    if (!normalizedSlug) {
      throw new Error('Slug is required');
    }
    // Check for duplicate (excluding current page)
    const duplicate = db.prepare('SELECT id FROM cms_pages WHERE slug = ? AND id != ?').get(normalizedSlug, id);
    if (duplicate) {
      throw new Error('A page with this slug already exists');
    }
    updates.push('slug = ?');
    values.push(normalizedSlug);
  }

  if ('title' in data) {
    if (!data.title || !data.title.trim()) {
      throw new Error('Title is required');
    }
    updates.push('title = ?');
    values.push(data.title.trim());
  }

  if ('content' in data) {
    updates.push('content = ?');
    values.push(data.content || '');
  }

  if ('css' in data) {
    updates.push('css = ?');
    values.push(data.css || '');
  }

  if ('metaTitle' in data) {
    updates.push('meta_title = ?');
    values.push(data.metaTitle || null);
  }

  if ('metaDescription' in data) {
    updates.push('meta_description = ?');
    values.push(data.metaDescription || null);
  }

  if (updates.length === 0) {
    return getPageById(db, id);
  }

  updates.push('updated_at = datetime(\'now\')');
  values.push(id);

  db.prepare(`
    UPDATE cms_pages
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...values);

  return getPageById(db, id);
}

/**
 * Delete a CMS page
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} id - Page ID
 * @returns {object} Deleted page info
 * @throws {Error} If page not found
 */
export function deletePage(db, id) {
  const page = db.prepare('SELECT id, slug, title FROM cms_pages WHERE id = ?').get(id);
  if (!page) {
    throw new Error('Page not found');
  }

  db.prepare('DELETE FROM cms_pages WHERE id = ?').run(id);

  return {
    deleted: true,
    id: page.id,
    slug: page.slug,
    title: page.title
  };
}

/**
 * Publish a CMS page
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} id - Page ID
 * @returns {object} Updated page
 * @throws {Error} If page not found
 */
export function publishPage(db, id) {
  const existing = db.prepare('SELECT id FROM cms_pages WHERE id = ?').get(id);
  if (!existing) {
    throw new Error('Page not found');
  }

  db.prepare(`
    UPDATE cms_pages
    SET is_published = 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(id);

  return getPageById(db, id);
}

/**
 * Unpublish a CMS page
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} id - Page ID
 * @returns {object} Updated page
 * @throws {Error} If page not found
 */
export function unpublishPage(db, id) {
  const existing = db.prepare('SELECT id FROM cms_pages WHERE id = ?').get(id);
  if (!existing) {
    throw new Error('Page not found');
  }

  db.prepare(`
    UPDATE cms_pages
    SET is_published = 0, updated_at = datetime('now')
    WHERE id = ?
  `).run(id);

  return getPageById(db, id);
}

// =============================================================================
// Image Operations
// =============================================================================

/**
 * Get all uploaded images
 *
 * @param {Database} db - better-sqlite3 database instance
 * @returns {object[]} Array of images
 */
export function getAllImages(db) {
  return db.prepare(`
    SELECT id, filename, original_name, mime_type, file_size, alt_text, created_at
    FROM cms_images
    ORDER BY created_at DESC
  `).all().map(img => ({
    ...img,
    url: `/uploads/cms/${img.filename}`
  }));
}

/**
 * Create an image record after upload
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {object} data - Image data
 * @param {string} data.filename - Stored filename
 * @param {string} data.originalName - Original filename
 * @param {string} data.mimeType - MIME type
 * @param {number} data.fileSize - File size in bytes
 * @param {string} [data.altText] - Alt text
 * @param {number} data.uploadedBy - User ID who uploaded
 * @returns {object} Created image record
 */
export function createImage(db, data) {
  const { filename, originalName, mimeType, fileSize, altText, uploadedBy } = data;

  const result = db.prepare(`
    INSERT INTO cms_images (filename, original_name, mime_type, file_size, alt_text, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(filename, originalName, mimeType, fileSize, altText || null, uploadedBy);

  const image = db.prepare('SELECT * FROM cms_images WHERE id = ?').get(result.lastInsertRowid);

  return {
    ...image,
    url: `/uploads/cms/${image.filename}`
  };
}

/**
 * Delete an image record and file
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} id - Image ID
 * @returns {object} Deleted image info
 * @throws {Error} If image not found
 */
export function deleteImage(db, id) {
  const image = db.prepare('SELECT id, filename, original_name FROM cms_images WHERE id = ?').get(id);
  if (!image) {
    throw new Error('Image not found');
  }

  // Delete file from disk
  const filePath = join(UPLOADS_DIR, image.filename);
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch (err) {
      console.error('Failed to delete image file:', err.message);
    }
  }

  // Delete record
  db.prepare('DELETE FROM cms_images WHERE id = ?').run(id);

  return {
    deleted: true,
    id: image.id,
    filename: image.filename,
    originalName: image.original_name
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Normalize a slug (lowercase, alphanumeric and hyphens only)
 *
 * @param {string} slug - Raw slug
 * @returns {string} Normalized slug
 */
function normalizeSlug(slug) {
  if (!slug) return '';
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
