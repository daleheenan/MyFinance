/**
 * CMS Routes
 *
 * Public endpoints:
 * - GET /api/cms/pages/:slug - Get published page content
 *
 * Admin endpoints (requireAuth + isAdmin):
 * - GET    /api/cms/admin/pages          - List all pages
 * - GET    /api/cms/admin/pages/:id      - Get page for editing
 * - POST   /api/cms/admin/pages          - Create page
 * - PUT    /api/cms/admin/pages/:id      - Update page
 * - DELETE /api/cms/admin/pages/:id      - Delete page
 * - PUT    /api/cms/admin/pages/:id/publish   - Publish page
 * - PUT    /api/cms/admin/pages/:id/unpublish - Unpublish page
 * - GET    /api/cms/admin/images         - List uploaded images
 * - POST   /api/cms/admin/images         - Upload image
 * - DELETE /api/cms/admin/images/:id     - Delete image
 */

import { Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'crypto';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { getDb } from '../../core/database.js';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  getAllPages,
  getPageById,
  getPublishedPageBySlug,
  createPage,
  updatePage,
  deletePage,
  publishPage,
  unpublishPage,
  getAllImages,
  createImage,
  deleteImage
} from './cms.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../../public/uploads/cms');

// Ensure uploads directory exists
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

const router = Router();

// =============================================================================
// Multer Configuration for Image Uploads
// =============================================================================

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${randomBytes(8).toString('hex')}`;
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

// =============================================================================
// Admin Middleware
// =============================================================================

/**
 * Check if the authenticated user is an admin (user.id === 1)
 * Must be used AFTER requireAuth middleware
 */
function isAdmin(req, res, next) {
  if (req.user?.id !== 1) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
}

/**
 * Combined middleware for admin routes: requireAuth + isAdmin
 */
const adminAuth = [requireAuth, isAdmin];

// =============================================================================
// Public Endpoints
// =============================================================================

/**
 * GET /api/cms/pages/:slug
 * Get a published page by slug (public, no auth required)
 */
router.get('/pages/:slug', (req, res) => {
  const db = getDb();
  const { slug } = req.params;

  const page = getPublishedPageBySlug(db, slug);

  if (!page) {
    return res.status(404).json({
      success: false,
      error: 'Page not found'
    });
  }

  res.json({
    success: true,
    data: page
  });
});

// =============================================================================
// Admin Endpoints - All require auth + admin check
// =============================================================================

/**
 * GET /api/cms/admin/pages
 * List all CMS pages (admin only)
 */
router.get('/admin/pages', adminAuth, (req, res) => {
  const db = getDb();
  const pages = getAllPages(db);

  res.json({
    success: true,
    data: pages
  });
});

/**
 * GET /api/cms/admin/pages/:id
 * Get a single page for editing (admin only)
 */
router.get('/admin/pages/:id', adminAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid page ID'
    });
  }

  const page = getPageById(db, id);

  if (!page) {
    return res.status(404).json({
      success: false,
      error: 'Page not found'
    });
  }

  res.json({
    success: true,
    data: page
  });
});

/**
 * POST /api/cms/admin/pages
 * Create a new CMS page (admin only)
 */
router.post('/admin/pages', adminAuth, (req, res) => {
  const db = getDb();
  const { slug, title, content, css, metaTitle, metaDescription } = req.body;

  try {
    const page = createPage(db, { slug, title, content, css, metaTitle, metaDescription });
    res.status(201).json({
      success: true,
      data: page
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PUT /api/cms/admin/pages/:id
 * Update an existing CMS page (admin only)
 */
router.put('/admin/pages/:id', adminAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid page ID'
    });
  }

  const { slug, title, content, css, metaTitle, metaDescription } = req.body;

  try {
    const page = updatePage(db, id, { slug, title, content, css, metaTitle, metaDescription });
    res.json({
      success: true,
      data: page
    });
  } catch (err) {
    if (err.message === 'Page not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * DELETE /api/cms/admin/pages/:id
 * Delete a CMS page (admin only)
 */
router.delete('/admin/pages/:id', adminAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid page ID'
    });
  }

  try {
    const result = deletePage(db, id);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.message === 'Page not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PUT /api/cms/admin/pages/:id/publish
 * Publish a CMS page (admin only)
 */
router.put('/admin/pages/:id/publish', adminAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid page ID'
    });
  }

  try {
    const page = publishPage(db, id);
    res.json({
      success: true,
      data: page
    });
  } catch (err) {
    if (err.message === 'Page not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PUT /api/cms/admin/pages/:id/unpublish
 * Unpublish a CMS page (admin only)
 */
router.put('/admin/pages/:id/unpublish', adminAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid page ID'
    });
  }

  try {
    const page = unpublishPage(db, id);
    res.json({
      success: true,
      data: page
    });
  } catch (err) {
    if (err.message === 'Page not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// =============================================================================
// Image Endpoints
// =============================================================================

/**
 * GET /api/cms/admin/images
 * List all uploaded images (admin only)
 */
router.get('/admin/images', adminAuth, (req, res) => {
  const db = getDb();
  const images = getAllImages(db);

  res.json({
    success: true,
    data: images
  });
});

/**
 * POST /api/cms/admin/images
 * Upload an image (admin only)
 */
router.post('/admin/images', adminAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No image file provided'
    });
  }

  const db = getDb();

  try {
    const image = createImage(db, {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      altText: req.body.altText || null,
      uploadedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: image
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * DELETE /api/cms/admin/images/:id
 * Delete an image (admin only)
 */
router.delete('/admin/images/:id', adminAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid image ID'
    });
  }

  try {
    const result = deleteImage(db, id);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err.message === 'Image not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// =============================================================================
// Error Handler for Multer
// =============================================================================

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 5MB.'
      });
    }
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
  next(err);
});

export default router;
