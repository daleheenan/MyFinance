import { Router } from 'express';
import { getDb } from '../../core/database.js';
import { ApiError } from '../../core/errors.js';
import {
  autoCategorize,
  getUncategorizedTransactions
} from '../categories/categorization.service.js';

const router = Router();

/**
 * GET /api/transactions
 * List transactions with pagination and filters
 * Query params: account_id (required), page, limit, from_date, to_date, category_id, search
 */
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const {
      account_id,
      page = 1,
      limit = 50,
      from_date,
      to_date,
      category_id,
      search
    } = req.query;

    // Validate required param
    if (!account_id) {
      throw new ApiError('account_id is required', 400);
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // Build dynamic query with filters
    let whereClause = 'WHERE t.account_id = ?';
    const params = [account_id];

    if (from_date) {
      whereClause += ' AND t.transaction_date >= ?';
      params.push(from_date);
    }

    if (to_date) {
      whereClause += ' AND t.transaction_date <= ?';
      params.push(to_date);
    }

    if (category_id) {
      whereClause += ' AND t.category_id = ?';
      params.push(category_id);
    }

    if (search) {
      whereClause += ' AND t.description LIKE ?';
      params.push(`%${search}%`);
    }

    // Get total count for pagination
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total
      FROM transactions t
      ${whereClause}
    `);
    const { total } = countStmt.get(...params);

    // Get paginated data with category info
    const dataStmt = db.prepare(`
      SELECT
        t.*,
        c.name AS category_name,
        c.colour AS category_colour,
        c.icon AS category_icon,
        c.type AS category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ${whereClause}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ? OFFSET ?
    `);

    const data = dataStmt.all(...params, limitNum, offset);

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: total > 0 ? Math.ceil(total / limitNum) : 0
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/uncategorized
 * Returns uncategorized transactions with category suggestions.
 * Query params: limit (default 50)
 */
router.get('/uncategorized', (req, res, next) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit, 10) || 50;

    const transactions = getUncategorizedTransactions(db, limit);

    res.json({
      success: true,
      data: transactions,
      count: transactions.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/transactions/auto-categorize
 * Auto-categorize transactions without a category.
 * Body: { transaction_ids?: number[] }
 * If transaction_ids not provided, processes all uncategorized.
 */
router.post('/auto-categorize', (req, res, next) => {
  try {
    const db = getDb();
    const { transaction_ids } = req.body;

    // Pass null if not provided, otherwise pass the array
    const ids = transaction_ids !== undefined ? transaction_ids : null;
    const result = autoCategorize(db, ids);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/:id
 * Get single transaction with category info
 */
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const stmt = db.prepare(`
      SELECT
        t.*,
        c.name AS category_name,
        c.colour AS category_colour,
        c.icon AS category_icon,
        c.type AS category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `);

    const transaction = stmt.get(id);

    if (!transaction) {
      throw new ApiError('Transaction not found', 404);
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/transactions/:id
 * Update transaction (description, category_id, notes only)
 * Cannot update amounts or dates (immutable from import)
 */
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { description, category_id, notes } = req.body;

    // Check if transaction exists
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError('Transaction not found', 404);
    }

    // Build update query with only allowed fields
    const updates = [];
    const params = [];

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (category_id !== undefined) {
      updates.push('category_id = ?');
      params.push(category_id);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const updateStmt = db.prepare(`
        UPDATE transactions
        SET ${updates.join(', ')}
        WHERE id = ?
      `);
      updateStmt.run(...params);
    }

    // Return updated transaction with category info
    const stmt = db.prepare(`
      SELECT
        t.*,
        c.name AS category_name,
        c.colour AS category_colour,
        c.icon AS category_icon,
        c.type AS category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `);

    const transaction = stmt.get(id);

    res.json({
      success: true,
      data: transaction
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/transactions/:id
 * Delete transaction and recalculate running balances
 */
router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;

    // Check if transaction exists and get account_id
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError('Transaction not found', 404);
    }

    const accountId = existing.account_id;

    // Delete the transaction
    db.prepare('DELETE FROM transactions WHERE id = ?').run(id);

    // Recalculate running balances for the account
    recalculateRunningBalances(db, accountId);

    res.json({
      success: true,
      data: { message: 'Transaction deleted' }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/transactions/:id/categorize
 * Auto-assign or manually assign category
 * Body: empty for auto, { categoryId: number } for manual
 */
router.post('/:id/categorize', (req, res, next) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { categoryId } = req.body;

    // Check if transaction exists
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError('Transaction not found', 404);
    }

    let newCategoryId;

    if (categoryId !== undefined) {
      // Manual categorization - verify category exists
      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
      if (!category) {
        throw new ApiError('Category not found', 400);
      }
      newCategoryId = categoryId;
    } else {
      // Auto-categorize using rules
      newCategoryId = findMatchingCategory(db, existing.description) || existing.category_id;
    }

    // Update the transaction
    db.prepare(`
      UPDATE transactions
      SET category_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newCategoryId, id);

    // Return updated transaction with category info
    const stmt = db.prepare(`
      SELECT
        t.*,
        c.name AS category_name,
        c.colour AS category_colour,
        c.icon AS category_icon,
        c.type AS category_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `);

    const transaction = stmt.get(id);

    res.json({
      success: true,
      data: transaction
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Find matching category based on category_rules
 * @param {Database} db - Database instance
 * @param {string} description - Transaction description
 * @returns {number|null} - Matching category_id or null
 */
function findMatchingCategory(db, description) {
  if (!description) return null;

  const descUpper = description.toUpperCase();

  // Get all active rules ordered by priority (highest first)
  const rules = db.prepare(`
    SELECT pattern, category_id
    FROM category_rules
    WHERE is_active = 1
    ORDER BY priority DESC, id ASC
  `).all();

  for (const rule of rules) {
    // Simple pattern matching (pattern is just a substring to match)
    if (descUpper.includes(rule.pattern.toUpperCase())) {
      return rule.category_id;
    }
  }

  return null;
}

/**
 * Recalculate running balances for an account
 * @param {Database} db - Database instance
 * @param {number} accountId - Account ID
 */
function recalculateRunningBalances(db, accountId) {
  // Get account opening balance
  const account = db.prepare('SELECT opening_balance FROM accounts WHERE id = ?').get(accountId);
  const openingBalance = account?.opening_balance || 0;

  // Get all transactions ordered by date and id
  const transactions = db.prepare(`
    SELECT id, credit_amount, debit_amount
    FROM transactions
    WHERE account_id = ?
    ORDER BY transaction_date ASC, id ASC
  `).all(accountId);

  // Recalculate running balance
  let runningBalance = openingBalance;
  const updateStmt = db.prepare('UPDATE transactions SET balance_after = ? WHERE id = ?');

  for (const txn of transactions) {
    // Penny precision: round to 2 decimal places
    runningBalance = Math.round((runningBalance + txn.credit_amount - txn.debit_amount) * 100) / 100;
    updateStmt.run(runningBalance, txn.id);
  }

  // Update account current balance
  db.prepare('UPDATE accounts SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(runningBalance, accountId);
}

export default router;
