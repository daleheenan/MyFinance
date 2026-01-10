/**
 * Categories Routes (TASK-3.3)
 *
 * CRUD endpoints for categories and category rules.
 *
 * Endpoints:
 * - GET    /api/categories          - List all categories
 * - GET    /api/categories/:id      - Get single category
 * - POST   /api/categories          - Create category
 * - PUT    /api/categories/:id      - Update category
 * - DELETE /api/categories/:id      - Delete category
 * - POST   /api/categories/suggest  - Suggest category for description
 * - POST   /api/categories/learn    - Learn pattern from categorization
 * - GET    /api/category-rules      - List all rules
 * - POST   /api/category-rules      - Create rule
 * - PUT    /api/category-rules/:id  - Update rule
 * - DELETE /api/category-rules/:id  - Delete rule
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import {
  getCategoryRules,
  addCategoryRule,
  updateCategoryRule,
  deleteCategoryRule
} from './categories.service.js';
import {
  suggestCategory,
  learnFromCategorization,
  findSimilarTransactions,
  applyToSimilarTransactions
} from './categorization.service.js';

const router = Router();

// Valid category types
const VALID_TYPES = ['income', 'expense', 'neutral'];

// =============================================================================
// Category Endpoints
// =============================================================================

/**
 * GET /api/categories
 * Returns all categories, optionally with spending totals for current month.
 */
router.get('/', (req, res) => {
  const db = getDb();
  const includeTotals = req.query.include_totals === 'true';

  let categories;

  if (includeTotals) {
    // Get current month in YYYY-MM format
    const currentMonth = new Date().toISOString().slice(0, 7);

    categories = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.type,
        c.colour,
        c.icon,
        c.parent_group,
        c.is_default,
        c.sort_order,
        COALESCE(SUM(t.debit_amount), 0) as spending_total
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id
        AND strftime('%Y-%m', t.transaction_date) = ?
      GROUP BY c.id
      ORDER BY c.sort_order, c.id
    `).all(currentMonth);
  } else {
    categories = db.prepare(`
      SELECT id, name, type, colour, icon, parent_group, is_default, sort_order
      FROM categories
      ORDER BY sort_order, id
    `).all();
  }

  res.json({ success: true, data: categories });
});

/**
 * POST /api/categories/suggest
 * Suggests a category for a transaction description.
 * Body: { description: string }
 * Returns: { category_id, categoryName, confidence, matched_rule } or null
 */
router.post('/suggest', (req, res) => {
  const db = getDb();
  const { description } = req.body;

  if (!description || typeof description !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Description is required'
    });
  }

  const suggestion = suggestCategory(db, description);

  res.json({
    success: true,
    data: suggestion
  });
});

/**
 * POST /api/categories/learn
 * Learns a categorization pattern from a description.
 * Body: { description: string, category_id: number }
 * Returns: Created or existing rule
 */
router.post('/learn', (req, res) => {
  const db = getDb();
  const { description, category_id } = req.body;

  if (!description || typeof description !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Description is required'
    });
  }

  if (category_id === undefined || category_id === null) {
    return res.status(400).json({
      success: false,
      error: 'category_id is required'
    });
  }

  try {
    const result = learnFromCategorization(db, description, category_id);
    res.status(result.existing ? 200 : 201).json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/categories/find-similar
 * Finds transactions with similar descriptions.
 * Body: { description: string, exclude_id?: number }
 * Returns: { pattern, count, transactions[] }
 */
router.post('/find-similar', (req, res) => {
  const db = getDb();
  const { description, exclude_id } = req.body;

  if (!description || typeof description !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Description is required'
    });
  }

  try {
    const result = findSimilarTransactions(db, description, exclude_id || null);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/categories/apply-to-similar
 * Applies a category to all transactions matching a similar pattern.
 * Body: { description: string, category_id: number, only_uncategorized?: boolean, exclude_id?: number }
 * Returns: { pattern, updated, message }
 */
router.post('/apply-to-similar', (req, res) => {
  const db = getDb();
  const { description, category_id, only_uncategorized, exclude_id } = req.body;

  if (!description || typeof description !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Description is required'
    });
  }

  if (category_id === undefined || category_id === null) {
    return res.status(400).json({
      success: false,
      error: 'category_id is required'
    });
  }

  try {
    const result = applyToSimilarTransactions(db, description, category_id, {
      onlyUncategorized: Boolean(only_uncategorized),
      excludeId: exclude_id || null
    });
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/categories/:id
 * Returns single category by ID.
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid category ID'
    });
  }

  const category = db.prepare(`
    SELECT id, name, type, colour, icon, parent_group, is_default, sort_order
    FROM categories
    WHERE id = ?
  `).get(id);

  if (!category) {
    return res.status(404).json({
      success: false,
      error: 'Category not found'
    });
  }

  res.json({ success: true, data: category });
});

/**
 * POST /api/categories
 * Creates a new category.
 * Body: { name, type, colour, icon?, parent_group? }
 */
router.post('/', (req, res) => {
  const db = getDb();
  const { name, type, colour, icon, parent_group } = req.body;

  // Validation
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Category name is required'
    });
  }

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      success: false,
      error: 'Category type must be one of: income, expense, neutral'
    });
  }

  if (!colour || typeof colour !== 'string' || !colour.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Category colour is required'
    });
  }

  // Check for duplicate name
  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name.trim());
  if (existing) {
    return res.status(400).json({
      success: false,
      error: 'Category name already exists'
    });
  }

  // Get next sort_order
  const maxSort = db.prepare('SELECT MAX(sort_order) as max FROM categories').get();
  const sortOrder = (maxSort.max || 0) + 1;

  try {
    const result = db.prepare(`
      INSERT INTO categories (name, type, colour, icon, parent_group, is_default, sort_order)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(name.trim(), type, colour.trim(), icon || null, parent_group || null, sortOrder);

    const newCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ success: true, data: newCategory });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PUT /api/categories/:id
 * Updates an existing category.
 * Cannot update default categories (is_default=1).
 */
router.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid category ID'
    });
  }

  // Check category exists
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) {
    return res.status(404).json({
      success: false,
      error: 'Category not found'
    });
  }

  // Check if default category
  if (category.is_default === 1) {
    return res.status(400).json({
      success: false,
      error: 'Cannot modify default categories'
    });
  }

  const { name, type, colour, icon, parent_group } = req.body;

  // Validate type if provided
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      success: false,
      error: 'Category type must be one of: income, expense, neutral'
    });
  }

  // Build dynamic update
  const updates = [];
  const values = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name.trim());
  }
  if (type !== undefined) {
    updates.push('type = ?');
    values.push(type);
  }
  if (colour !== undefined) {
    updates.push('colour = ?');
    values.push(colour.trim());
  }
  if (icon !== undefined) {
    updates.push('icon = ?');
    values.push(icon);
  }
  if (parent_group !== undefined) {
    updates.push('parent_group = ?');
    values.push(parent_group);
  }

  if (updates.length === 0) {
    return res.json({ success: true, data: category });
  }

  values.push(id);

  try {
    db.prepare(`
      UPDATE categories
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * DELETE /api/categories/:id
 * Deletes a category.
 * Cannot delete default categories or categories with transactions.
 */
router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid category ID'
    });
  }

  // Check category exists
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) {
    return res.status(404).json({
      success: false,
      error: 'Category not found'
    });
  }

  // Check if default category
  if (category.is_default === 1) {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete default categories'
    });
  }

  // Check for transactions using this category
  const txnCount = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?').get(id);
  if (txnCount.count > 0) {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete category with existing transactions'
    });
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);

  res.json({
    success: true,
    data: {
      deleted: true,
      id: category.id,
      name: category.name
    }
  });
});

// =============================================================================
// Category Rules Endpoints - mounted at /api/category-rules via parent router
// =============================================================================

// Create a sub-router for category-rules
const rulesRouter = Router();

/**
 * GET /api/category-rules
 * Returns all category rules.
 */
rulesRouter.get('/', (req, res) => {
  const db = getDb();
  const rules = getCategoryRules(db);
  res.json({ success: true, data: rules });
});

/**
 * POST /api/category-rules
 * Creates a new category rule.
 * Body: { pattern, categoryId, priority? }
 */
rulesRouter.post('/', (req, res) => {
  const db = getDb();
  const { pattern, categoryId, priority } = req.body;

  // Validation
  if (!pattern || typeof pattern !== 'string' || !pattern.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Rule pattern is required'
    });
  }

  if (categoryId === undefined || categoryId === null) {
    return res.status(400).json({
      success: false,
      error: 'Rule categoryId is required'
    });
  }

  try {
    const rule = addCategoryRule(db, pattern, categoryId, priority || 0);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * PUT /api/category-rules/:id
 * Updates an existing category rule.
 */
rulesRouter.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid rule ID'
    });
  }

  const { pattern, categoryId, priority, isActive } = req.body;

  const updates = {};
  if (pattern !== undefined) updates.pattern = pattern;
  if (categoryId !== undefined) updates.categoryId = categoryId;
  if (priority !== undefined) updates.priority = priority;
  if (isActive !== undefined) updates.isActive = isActive;

  try {
    const rule = updateCategoryRule(db, id, updates);
    res.json({ success: true, data: rule });
  } catch (err) {
    if (err.message === 'Rule not found') {
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
 * DELETE /api/category-rules/:id
 * Deletes a category rule.
 */
rulesRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid rule ID'
    });
  }

  try {
    const result = deleteCategoryRule(db, id);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'Rule not found') {
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

// Export both routers - main router handles /api/categories
// We need to export rules router separately and mount it in index.js
router.rulesRouter = rulesRouter;

export default router;
