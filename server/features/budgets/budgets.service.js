/**
 * Budgets Service
 *
 * Provides budget management and spending calculations.
 *
 * Budget features:
 * - CRUD operations for budgets per category/month
 * - Spent amount calculation from transactions
 * - Remaining and percentage calculations
 */

/**
 * Get all budgets for a specific month with spending calculations.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} month - Month in YYYY-MM format
 * @param {number} userId - User ID to filter by
 * @returns {Array} Array of budgets with spending data
 */
export function getBudgetsForMonth(db, month, userId) {
  // Validate month format
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Invalid month format. Use YYYY-MM');
  }

  // Get budgets with category info and spent amounts (only for user's accounts)
  const budgets = db.prepare(`
    SELECT
      b.id,
      b.category_id,
      b.month,
      b.budgeted_amount,
      b.rollover_amount,
      b.notes,
      b.created_at,
      b.updated_at,
      c.name as category_name,
      c.colour as category_colour,
      c.icon as category_icon,
      c.type as category_type,
      COALESCE(
        (SELECT SUM(t.debit_amount) - SUM(COALESCE(t.credit_amount, 0))
         FROM transactions t
         JOIN accounts a ON t.account_id = a.id
         WHERE t.category_id = b.category_id
           AND strftime('%Y-%m', t.transaction_date) = b.month
           AND t.is_transfer = 0
           AND a.user_id = ?),
        0
      ) as spent_amount
    FROM budgets b
    JOIN categories c ON c.id = b.category_id
    WHERE b.month = ? AND b.user_id = ?
    ORDER BY c.sort_order, c.name
  `).all(userId, month, userId);

  // Calculate remaining and percentage for each budget
  return budgets.map(budget => {
    const totalBudget = budget.budgeted_amount + budget.rollover_amount;
    const remaining = totalBudget - budget.spent_amount;
    const percentUsed = totalBudget > 0
      ? Math.round((budget.spent_amount / totalBudget) * 100)
      : 0;

    return {
      ...budget,
      remaining_amount: Math.round(remaining * 100) / 100,
      percent_used: percentUsed
    };
  });
}

/**
 * Get a single budget by ID with spending calculations.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} budgetId - Budget ID
 * @param {number} userId - User ID to verify ownership
 * @returns {Object|null} Budget with spending data or null if not found
 */
export function getBudgetById(db, budgetId, userId) {
  if (budgetId == null) {
    throw new Error('Budget ID is required');
  }

  const budget = db.prepare(`
    SELECT
      b.id,
      b.category_id,
      b.month,
      b.budgeted_amount,
      b.rollover_amount,
      b.notes,
      b.created_at,
      b.updated_at,
      c.name as category_name,
      c.colour as category_colour,
      c.icon as category_icon,
      c.type as category_type,
      COALESCE(
        (SELECT SUM(t.debit_amount) - SUM(COALESCE(t.credit_amount, 0))
         FROM transactions t
         JOIN accounts a ON t.account_id = a.id
         WHERE t.category_id = b.category_id
           AND strftime('%Y-%m', t.transaction_date) = b.month
           AND t.is_transfer = 0
           AND a.user_id = ?),
        0
      ) as spent_amount
    FROM budgets b
    JOIN categories c ON c.id = b.category_id
    WHERE b.id = ? AND b.user_id = ?
  `).get(userId, budgetId, userId);

  if (!budget) {
    return null;
  }

  const totalBudget = budget.budgeted_amount + budget.rollover_amount;
  const remaining = totalBudget - budget.spent_amount;
  const percentUsed = totalBudget > 0
    ? Math.round((budget.spent_amount / totalBudget) * 100)
    : 0;

  return {
    ...budget,
    remaining_amount: Math.round(remaining * 100) / 100,
    percent_used: percentUsed
  };
}

/**
 * Create or update a budget (upsert).
 * If a budget exists for the category+month, it updates it.
 * Otherwise, creates a new budget.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {Object} data - Budget data
 * @param {number} data.userId - User ID
 * @param {number} data.categoryId - Category ID
 * @param {string} data.month - Month in YYYY-MM format
 * @param {number} data.budgetedAmount - Budgeted amount
 * @param {number} [data.rolloverAmount=0] - Rollover amount from previous month
 * @param {string} [data.notes] - Optional notes
 * @returns {Object} Created/updated budget
 */
export function upsertBudget(db, data) {
  const { userId, categoryId, month, budgetedAmount, rolloverAmount = 0, notes = null } = data;

  // Validation
  if (userId == null) {
    throw new Error('User ID is required');
  }

  if (categoryId == null) {
    throw new Error('Category ID is required');
  }

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Invalid month format. Use YYYY-MM');
  }

  if (budgetedAmount == null || typeof budgetedAmount !== 'number' || budgetedAmount < 0) {
    throw new Error('Budgeted amount must be a positive number');
  }

  // Verify category exists and belongs to user (or is a global category)
  const category = db.prepare('SELECT id FROM categories WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(categoryId, userId);
  if (!category) {
    throw new Error('Category not found');
  }

  // Upsert the budget
  const result = db.prepare(`
    INSERT INTO budgets (user_id, category_id, month, budgeted_amount, rollover_amount, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, category_id, month)
    DO UPDATE SET
      budgeted_amount = excluded.budgeted_amount,
      rollover_amount = excluded.rollover_amount,
      notes = excluded.notes,
      updated_at = datetime('now')
  `).run(userId, categoryId, month, budgetedAmount, rolloverAmount, notes);

  // Get the budget ID (either new or existing)
  let budgetId;
  if (result.changes === 1 && result.lastInsertRowid) {
    budgetId = result.lastInsertRowid;
  } else {
    // It was an update, get the existing ID
    const existing = db.prepare(
      'SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month = ?'
    ).get(userId, categoryId, month);
    budgetId = existing.id;
  }

  return getBudgetById(db, budgetId, userId);
}

/**
 * Delete a budget.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} budgetId - Budget ID to delete
 * @param {number} userId - User ID to verify ownership
 * @returns {Object} Result with deleted budget info
 */
export function deleteBudget(db, budgetId, userId) {
  if (budgetId == null) {
    throw new Error('Budget ID is required');
  }

  // Get budget before deleting - verify ownership
  const budget = db.prepare(`
    SELECT b.id, b.category_id, b.month, b.budgeted_amount, c.name as category_name
    FROM budgets b
    JOIN categories c ON c.id = b.category_id
    WHERE b.id = ? AND b.user_id = ?
  `).get(budgetId, userId);

  if (!budget) {
    throw new Error('Budget not found');
  }

  db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(budgetId, userId);

  return {
    deleted: true,
    id: budget.id,
    categoryId: budget.category_id,
    categoryName: budget.category_name,
    month: budget.month
  };
}

/**
 * Get categories that don't have a budget for a specific month.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} month - Month in YYYY-MM format
 * @param {number} userId - User ID to filter by
 * @returns {Array} Categories without budgets
 */
export function getCategoriesWithoutBudget(db, month, userId) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Invalid month format. Use YYYY-MM');
  }

  // Get expense categories that don't have a budget for this month
  // Include both user's categories and global categories (user_id IS NULL)
  const categories = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.colour,
      c.icon,
      c.type,
      COALESCE(
        (SELECT SUM(t.debit_amount) - SUM(COALESCE(t.credit_amount, 0))
         FROM transactions t
         JOIN accounts a ON t.account_id = a.id
         WHERE t.category_id = c.id
           AND strftime('%Y-%m', t.transaction_date) = ?
           AND t.is_transfer = 0
           AND a.user_id = ?),
        0
      ) as spent_this_month
    FROM categories c
    WHERE c.type = 'expense'
      AND (c.user_id = ? OR c.user_id IS NULL)
      AND c.id NOT IN (
        SELECT category_id FROM budgets WHERE month = ? AND user_id = ?
      )
    ORDER BY c.sort_order, c.name
  `).all(month, userId, userId, month, userId);

  return categories;
}

/**
 * Get budget summary for a month.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} month - Month in YYYY-MM format
 * @param {number} userId - User ID to filter by
 * @returns {Object} Summary with totals
 */
export function getBudgetSummary(db, month, userId) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Invalid month format. Use YYYY-MM');
  }

  const budgets = getBudgetsForMonth(db, month, userId);

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.budgeted_amount + b.rollover_amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent_amount, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const overallPercent = totalBudgeted > 0
    ? Math.round((totalSpent / totalBudgeted) * 100)
    : 0;

  // Count budgets by status
  const onTrack = budgets.filter(b => b.percent_used < 80).length;
  const warning = budgets.filter(b => b.percent_used >= 80 && b.percent_used <= 100).length;
  const overBudget = budgets.filter(b => b.percent_used > 100).length;

  return {
    month,
    budgetCount: budgets.length,
    totalBudgeted: Math.round(totalBudgeted * 100) / 100,
    totalSpent: Math.round(totalSpent * 100) / 100,
    totalRemaining: Math.round(totalRemaining * 100) / 100,
    overallPercent,
    status: {
      onTrack,
      warning,
      overBudget
    }
  };
}
