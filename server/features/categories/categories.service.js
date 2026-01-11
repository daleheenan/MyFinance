/**
 * Category Service (TASK-2.3)
 *
 * Provides category matching, auto-assignment, and rule management.
 *
 * Matching rules:
 * 1. Case insensitive: description.toUpperCase().includes(pattern.toUpperCase())
 * 2. Higher priority rules match first
 * 3. If no match, return "Other" category (id=11)
 */

// Default "Other" category ID
const OTHER_CATEGORY_ID = 11;

/**
 * Get category for a transaction description by matching against rules.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} description - Transaction description to match
 * @param {number} userId - User ID to filter rules (user's own rules only)
 * @returns {object} Category object with id and name
 */
export function getCategoryByDescription(db, description, userId) {
  // Handle empty/whitespace descriptions
  const normalizedDescription = (description || '').trim().toUpperCase();

  if (!normalizedDescription) {
    return getOtherCategory(db);
  }

  // Get active rules for this user only, ordered by priority (descending)
  const rules = db.prepare(`
    SELECT cr.id, cr.pattern, cr.category_id, cr.priority,
           c.name as category_name
    FROM category_rules cr
    JOIN categories c ON c.id = cr.category_id
    WHERE cr.is_active = 1 AND cr.user_id = ?
    ORDER BY cr.priority DESC, cr.id ASC
  `).all(userId);

  // Find first matching rule
  for (const rule of rules) {
    const pattern = rule.pattern.toUpperCase();
    if (normalizedDescription.includes(pattern)) {
      return {
        id: rule.category_id,
        name: rule.category_name
      };
    }
  }

  // No match - return Other
  return getOtherCategory(db);
}

/**
 * Get the "Other" category.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @returns {object} Other category with id and name
 */
function getOtherCategory(db) {
  const other = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(OTHER_CATEGORY_ID);
  return {
    id: other.id,
    name: other.name
  };
}

/**
 * Auto-assign category to a single transaction based on its description.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} transactionId - Transaction ID to categorize
 * @param {number} userId - User ID to verify ownership and filter rules
 * @returns {object} Result with success, categoryId, categoryName
 * @throws {Error} If transaction not found
 */
export function autoAssignCategory(db, transactionId, userId) {
  if (transactionId == null) {
    throw new Error('Transaction ID is required');
  }

  // Get transaction - only if it belongs to user's account
  const txn = db.prepare(`
    SELECT t.id, t.description
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ? AND a.user_id = ?
  `).get(transactionId, userId);

  if (!txn) {
    throw new Error('Transaction not found');
  }

  // Get matching category using user's rules
  const category = getCategoryByDescription(db, txn.description, userId);

  // Update transaction
  db.prepare('UPDATE transactions SET category_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(category.id, transactionId);

  return {
    success: true,
    categoryId: category.id,
    categoryName: category.name
  };
}

/**
 * Bulk assign categories to transactions.
 * If transactionIds is provided, only those transactions are processed.
 * If not provided, all uncategorized (Other) transactions are processed.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} userId - User ID to filter transactions and rules
 * @param {number[]?} transactionIds - Optional array of transaction IDs
 * @returns {object} Summary with totalProcessed, updated, unchanged, skipped
 */
export function bulkAssignCategories(db, userId, transactionIds = null) {
  // Handle empty array
  if (transactionIds && transactionIds.length === 0) {
    return { totalProcessed: 0, updated: 0, unchanged: 0, skipped: 0 };
  }

  let transactions;

  if (transactionIds && transactionIds.length > 0) {
    // Get specific transactions - only if they belong to user's accounts
    const placeholders = transactionIds.map(() => '?').join(',');
    transactions = db.prepare(`
      SELECT t.id, t.description, t.category_id
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.id IN (${placeholders}) AND a.user_id = ?
    `).all(...transactionIds, userId);
  } else {
    // Get all uncategorized transactions for user's accounts only
    transactions = db.prepare(`
      SELECT t.id, t.description, t.category_id
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.category_id = ? AND a.user_id = ?
    `).all(OTHER_CATEGORY_ID, userId);
  }

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  const updateStmt = db.prepare(`
    UPDATE transactions
    SET category_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  // Process in a transaction for performance
  const processAll = db.transaction(() => {
    for (const txn of transactions) {
      // Skip if already categorized (not Other) - only for bulk where IDs provided
      if (transactionIds && txn.category_id !== OTHER_CATEGORY_ID) {
        skipped++;
        continue;
      }

      const category = getCategoryByDescription(db, txn.description, userId);

      if (category.id !== txn.category_id) {
        updateStmt.run(category.id, txn.id);
        updated++;
      } else {
        unchanged++;
      }
    }
  });

  processAll();

  return {
    totalProcessed: transactions.length,
    updated,
    unchanged,
    skipped
  };
}

/**
 * Add a new category rule for a user.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} userId - User ID who owns the rule
 * @param {string} pattern - Pattern to match (case insensitive)
 * @param {number} categoryId - Category ID to assign when matched
 * @param {number} [priority=0] - Rule priority (higher = matched first)
 * @returns {object} Created rule with id, pattern, categoryId, priority
 * @throws {Error} If pattern is empty or category doesn't exist
 */
export function addCategoryRule(db, userId, pattern, categoryId, priority = 0) {
  // Validate pattern
  const trimmedPattern = (pattern || '').trim();
  if (!trimmedPattern) {
    throw new Error('Pattern cannot be empty');
  }

  // Validate category exists and is accessible to user (user's own or global)
  const category = db.prepare('SELECT id FROM categories WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(categoryId, userId);
  if (!category) {
    throw new Error('Category not found');
  }

  const result = db.prepare(`
    INSERT INTO category_rules (user_id, pattern, category_id, priority, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(userId, trimmedPattern, categoryId, priority);

  return {
    id: result.lastInsertRowid,
    pattern: trimmedPattern,
    categoryId,
    priority
  };
}

/**
 * Get all category rules for a user.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} userId - User ID to filter by
 * @param {object} [options={}] - Query options
 * @param {boolean} [options.includeInactive=false] - Include inactive rules
 * @returns {object[]} Array of rules with category information
 */
export function getCategoryRules(db, userId, options = {}) {
  const { includeInactive = false } = options;

  let query = `
    SELECT
      cr.id,
      cr.pattern,
      cr.category_id as categoryId,
      c.name as categoryName,
      cr.priority,
      cr.is_active as isActive,
      cr.created_at as createdAt
    FROM category_rules cr
    JOIN categories c ON c.id = cr.category_id
    WHERE cr.user_id = ?
  `;

  if (!includeInactive) {
    query += ' AND cr.is_active = 1';
  }

  query += ' ORDER BY cr.priority DESC, cr.id ASC';

  const rules = db.prepare(query).all(userId);

  // Convert is_active to boolean
  return rules.map(rule => ({
    ...rule,
    isActive: Boolean(rule.isActive)
  }));
}

/**
 * Update a category rule belonging to a user.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} ruleId - Rule ID to update
 * @param {number} userId - User ID to verify ownership
 * @param {object} updates - Fields to update
 * @param {string} [updates.pattern] - New pattern
 * @param {number} [updates.categoryId] - New category ID
 * @param {number} [updates.priority] - New priority
 * @param {boolean} [updates.isActive] - New active status
 * @returns {object} Updated rule
 * @throws {Error} If rule not found or validation fails
 */
export function updateCategoryRule(db, ruleId, userId, updates) {
  // Check rule exists and belongs to user
  const existingRule = db.prepare('SELECT * FROM category_rules WHERE id = ? AND user_id = ?').get(ruleId, userId);
  if (!existingRule) {
    throw new Error('Rule not found');
  }

  // Validate pattern if provided
  if ('pattern' in updates) {
    const trimmedPattern = (updates.pattern || '').trim();
    if (!trimmedPattern) {
      throw new Error('Pattern cannot be empty');
    }
    updates.pattern = trimmedPattern;
  }

  // Validate category if provided (must be accessible to user)
  if ('categoryId' in updates) {
    const category = db.prepare('SELECT id FROM categories WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(updates.categoryId, userId);
    if (!category) {
      throw new Error('Category not found');
    }
  }

  // Build dynamic update query
  const setClauses = [];
  const values = [];

  if ('pattern' in updates) {
    setClauses.push('pattern = ?');
    values.push(updates.pattern);
  }

  if ('categoryId' in updates) {
    setClauses.push('category_id = ?');
    values.push(updates.categoryId);
  }

  if ('priority' in updates) {
    setClauses.push('priority = ?');
    values.push(updates.priority);
  }

  if ('isActive' in updates) {
    setClauses.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }

  if (setClauses.length === 0) {
    // No updates - return existing
    return getRuleById(db, ruleId, userId);
  }

  values.push(ruleId);
  values.push(userId);

  db.prepare(`
    UPDATE category_rules
    SET ${setClauses.join(', ')}
    WHERE id = ? AND user_id = ?
  `).run(...values);

  return getRuleById(db, ruleId, userId);
}

/**
 * Get a rule by ID with category information.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} ruleId - Rule ID
 * @param {number} userId - User ID to verify ownership
 * @returns {object} Rule with category information
 */
function getRuleById(db, ruleId, userId) {
  const rule = db.prepare(`
    SELECT
      cr.id,
      cr.pattern,
      cr.category_id as categoryId,
      c.name as categoryName,
      cr.priority,
      cr.is_active as isActive,
      cr.created_at as createdAt
    FROM category_rules cr
    JOIN categories c ON c.id = cr.category_id
    WHERE cr.id = ? AND cr.user_id = ?
  `).get(ruleId, userId);

  return {
    ...rule,
    isActive: Boolean(rule.isActive)
  };
}

/**
 * Delete a category rule belonging to a user.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} ruleId - Rule ID to delete
 * @param {number} userId - User ID to verify ownership
 * @returns {object} Deleted rule information
 * @throws {Error} If rule not found
 */
export function deleteCategoryRule(db, ruleId, userId) {
  if (ruleId == null) {
    throw new Error('Rule ID is required');
  }

  // Get rule before deleting - verify ownership
  const rule = db.prepare(`
    SELECT id, pattern, category_id as categoryId, priority
    FROM category_rules
    WHERE id = ? AND user_id = ?
  `).get(ruleId, userId);

  if (!rule) {
    throw new Error('Rule not found');
  }

  db.prepare('DELETE FROM category_rules WHERE id = ? AND user_id = ?').run(ruleId, userId);

  return {
    deleted: true,
    id: rule.id,
    pattern: rule.pattern,
    categoryId: rule.categoryId,
    priority: rule.priority
  };
}
