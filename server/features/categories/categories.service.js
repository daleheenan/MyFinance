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
 * @returns {object} Category object with id and name
 */
export function getCategoryByDescription(db, description) {
  // Handle empty/whitespace descriptions
  const normalizedDescription = (description || '').trim().toUpperCase();

  if (!normalizedDescription) {
    return getOtherCategory(db);
  }

  // Get all active rules ordered by priority (descending)
  const rules = db.prepare(`
    SELECT cr.id, cr.pattern, cr.category_id, cr.priority,
           c.name as category_name
    FROM category_rules cr
    JOIN categories c ON c.id = cr.category_id
    WHERE cr.is_active = 1
    ORDER BY cr.priority DESC, cr.id ASC
  `).all();

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
 * @returns {object} Result with success, categoryId, categoryName
 * @throws {Error} If transaction not found
 */
export function autoAssignCategory(db, transactionId) {
  if (transactionId == null) {
    throw new Error('Transaction ID is required');
  }

  // Get transaction
  const txn = db.prepare('SELECT id, description FROM transactions WHERE id = ?').get(transactionId);

  if (!txn) {
    throw new Error('Transaction not found');
  }

  // Get matching category
  const category = getCategoryByDescription(db, txn.description);

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
 * @param {number[]?} transactionIds - Optional array of transaction IDs
 * @returns {object} Summary with totalProcessed, updated, unchanged, skipped
 */
export function bulkAssignCategories(db, transactionIds = null) {
  // Handle empty array
  if (transactionIds && transactionIds.length === 0) {
    return { totalProcessed: 0, updated: 0, unchanged: 0, skipped: 0 };
  }

  let transactions;

  if (transactionIds && transactionIds.length > 0) {
    // Get specific transactions
    const placeholders = transactionIds.map(() => '?').join(',');
    transactions = db.prepare(`
      SELECT id, description, category_id
      FROM transactions
      WHERE id IN (${placeholders})
    `).all(...transactionIds);
  } else {
    // Get all uncategorized transactions (category_id = OTHER_CATEGORY_ID)
    transactions = db.prepare(`
      SELECT id, description, category_id
      FROM transactions
      WHERE category_id = ?
    `).all(OTHER_CATEGORY_ID);
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

      const category = getCategoryByDescription(db, txn.description);

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
 * Add a new category rule.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} pattern - Pattern to match (case insensitive)
 * @param {number} categoryId - Category ID to assign when matched
 * @param {number} [priority=0] - Rule priority (higher = matched first)
 * @returns {object} Created rule with id, pattern, categoryId, priority
 * @throws {Error} If pattern is empty or category doesn't exist
 */
export function addCategoryRule(db, pattern, categoryId, priority = 0) {
  // Validate pattern
  const trimmedPattern = (pattern || '').trim();
  if (!trimmedPattern) {
    throw new Error('Pattern cannot be empty');
  }

  // Validate category exists (foreign key will also enforce this)
  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
  if (!category) {
    throw new Error('Category not found');
  }

  const result = db.prepare(`
    INSERT INTO category_rules (pattern, category_id, priority, is_active)
    VALUES (?, ?, ?, 1)
  `).run(trimmedPattern, categoryId, priority);

  return {
    id: result.lastInsertRowid,
    pattern: trimmedPattern,
    categoryId,
    priority
  };
}

/**
 * Get all category rules.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {object} [options={}] - Query options
 * @param {boolean} [options.includeInactive=false] - Include inactive rules
 * @returns {object[]} Array of rules with category information
 */
export function getCategoryRules(db, options = {}) {
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
  `;

  if (!includeInactive) {
    query += ' WHERE cr.is_active = 1';
  }

  query += ' ORDER BY cr.priority DESC, cr.id ASC';

  const rules = db.prepare(query).all();

  // Convert is_active to boolean
  return rules.map(rule => ({
    ...rule,
    isActive: Boolean(rule.isActive)
  }));
}

/**
 * Update a category rule.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} ruleId - Rule ID to update
 * @param {object} updates - Fields to update
 * @param {string} [updates.pattern] - New pattern
 * @param {number} [updates.categoryId] - New category ID
 * @param {number} [updates.priority] - New priority
 * @param {boolean} [updates.isActive] - New active status
 * @returns {object} Updated rule
 * @throws {Error} If rule not found or validation fails
 */
export function updateCategoryRule(db, ruleId, updates) {
  // Check rule exists
  const existingRule = db.prepare('SELECT * FROM category_rules WHERE id = ?').get(ruleId);
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

  // Validate category if provided
  if ('categoryId' in updates) {
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(updates.categoryId);
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
    return getRuleById(db, ruleId);
  }

  values.push(ruleId);

  db.prepare(`
    UPDATE category_rules
    SET ${setClauses.join(', ')}
    WHERE id = ?
  `).run(...values);

  return getRuleById(db, ruleId);
}

/**
 * Get a rule by ID with category information.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} ruleId - Rule ID
 * @returns {object} Rule with category information
 */
function getRuleById(db, ruleId) {
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
    WHERE cr.id = ?
  `).get(ruleId);

  return {
    ...rule,
    isActive: Boolean(rule.isActive)
  };
}

/**
 * Delete a category rule.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} ruleId - Rule ID to delete
 * @returns {object} Deleted rule information
 * @throws {Error} If rule not found
 */
export function deleteCategoryRule(db, ruleId) {
  if (ruleId == null) {
    throw new Error('Rule ID is required');
  }

  // Get rule before deleting
  const rule = db.prepare(`
    SELECT id, pattern, category_id as categoryId, priority
    FROM category_rules
    WHERE id = ?
  `).get(ruleId);

  if (!rule) {
    throw new Error('Rule not found');
  }

  db.prepare('DELETE FROM category_rules WHERE id = ?').run(ruleId);

  return {
    deleted: true,
    id: rule.id,
    pattern: rule.pattern,
    categoryId: rule.categoryId,
    priority: rule.priority
  };
}
