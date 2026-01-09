/**
 * Categorization Service
 *
 * AI-like transaction categorization using rule-based pattern matching.
 * Features:
 * - Confidence scoring based on match type (exact vs partial)
 * - Pattern learning from user categorizations
 * - Fuzzy matching with Levenshtein distance
 * - Batch auto-categorization
 */

/**
 * Extract a pattern from a transaction description.
 * Removes numbers, takes first significant word (>3 chars, not numeric).
 *
 * @param {string} description - Transaction description
 * @returns {string|null} Pattern in format "%WORD%" or null if no pattern found
 */
export function extractPattern(description) {
  if (!description || typeof description !== 'string') {
    return null;
  }

  const trimmed = description.trim();
  if (!trimmed) {
    return null;
  }

  // Split on whitespace and special characters (including asterisks)
  const words = trimmed.toUpperCase().split(/[\s*#!@$%^&()_+=\[\]{};:'",.<>?/\\|-]+/);

  // Find first significant word (length > 3 and not purely numeric)
  const significant = words.find(word => {
    if (!word || word.length <= 3) return false;
    if (/^\d+$/.test(word)) return false;
    return true;
  });

  return significant ? `%${significant}%` : null;
}

/**
 * Calculate Levenshtein distance between two strings.
 * Standard dynamic programming implementation.
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
export function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Create matrix
  const matrix = [];

  // Initialize first column
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Suggest a category for a transaction description.
 * Checks rules for matches and calculates confidence based on match type.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} description - Transaction description
 * @returns {object|null} Suggestion with category_id, categoryName, confidence, matched_rule or null
 */
export function suggestCategory(db, description) {
  // Handle empty/whitespace descriptions
  const normalizedDescription = (description || '').trim().toUpperCase();

  if (!normalizedDescription) {
    return null;
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

  // Track best match for confidence calculation
  let bestMatch = null;
  let bestConfidence = 0;

  for (const rule of rules) {
    const pattern = rule.pattern.toUpperCase();
    // Strip % wildcards for matching (patterns stored as %WORD%)
    const cleanPattern = pattern.replace(/%/g, '');

    // Check for exact containment (high confidence)
    if (normalizedDescription.includes(cleanPattern)) {
      // Calculate confidence based on pattern length ratio
      const lengthRatio = cleanPattern.length / normalizedDescription.length;
      const priorityBonus = Math.min(rule.priority / 100, 0.1); // Max 10% bonus
      const confidence = Math.min(0.9 + lengthRatio * 0.05 + priorityBonus, 1.0);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = {
          category_id: rule.category_id,
          categoryName: rule.category_name,
          confidence: Math.round(confidence * 100) / 100,
          matched_rule: rule.pattern
        };
      }
    }
  }

  // Return best match if found
  if (bestMatch) {
    return bestMatch;
  }

  // No exact match - try fuzzy matching (lower confidence)
  const descWords = normalizedDescription.split(/\s+/);

  for (const rule of rules) {
    const pattern = rule.pattern.toUpperCase();
    // Strip % wildcards for fuzzy matching
    const cleanPattern = pattern.replace(/%/g, '');

    for (const word of descWords) {
      if (word.length < 3) continue;

      const distance = levenshteinDistance(word, cleanPattern);
      const maxLen = Math.max(word.length, cleanPattern.length);
      const similarity = 1 - (distance / maxLen);

      // Require at least 70% similarity for fuzzy match
      if (similarity >= 0.7) {
        const confidence = similarity * 0.7; // Cap fuzzy matches at 70% confidence

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = {
            category_id: rule.category_id,
            categoryName: rule.category_name,
            confidence: Math.round(confidence * 100) / 100,
            matched_rule: rule.pattern
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Learn a categorization pattern from a description.
 * Extracts pattern and creates a new rule.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} description - Transaction description to learn from
 * @param {number} categoryId - Category ID to associate with pattern
 * @returns {object} Created or existing rule
 * @throws {Error} If pattern cannot be extracted or category doesn't exist
 */
export function learnFromCategorization(db, description, categoryId) {
  // Validate category exists
  const category = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(categoryId);
  if (!category) {
    throw new Error('Category not found');
  }

  // Extract pattern from description
  const pattern = extractPattern(description);
  if (!pattern) {
    throw new Error('Could not extract pattern from description');
  }

  // Check if rule already exists for this pattern and category
  const existingRule = db.prepare(`
    SELECT id, pattern, category_id, priority
    FROM category_rules
    WHERE pattern = ? AND category_id = ?
  `).get(pattern, categoryId);

  if (existingRule) {
    return {
      id: existingRule.id,
      pattern: existingRule.pattern,
      category_id: existingRule.category_id,
      priority: existingRule.priority,
      existing: true
    };
  }

  // Calculate priority based on pattern specificity
  // Extract the word from pattern (remove % signs)
  const word = pattern.replace(/%/g, '');
  const priority = Math.min(word.length * 2, 20); // Longer words = higher priority, max 20

  // Insert new rule
  const result = db.prepare(`
    INSERT INTO category_rules (pattern, category_id, priority, is_active)
    VALUES (?, ?, ?, 1)
  `).run(pattern, categoryId, priority);

  return {
    id: result.lastInsertRowid,
    pattern,
    category_id: categoryId,
    priority,
    existing: false
  };
}

/**
 * Auto-categorize transactions without a category.
 * Only categorizes with high confidence matches.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number[]} transactionIds - Optional array of specific transaction IDs. If not provided, processes all uncategorized.
 * @returns {object} Result with categorized count, skipped count, and details
 */
export function autoCategorize(db, transactionIds = null) {
  // Handle explicitly empty array (user wants to process nothing)
  if (Array.isArray(transactionIds) && transactionIds.length === 0) {
    return { categorized: 0, skipped: 0, details: [] };
  }

  let transactions;

  if (Array.isArray(transactionIds) && transactionIds.length > 0) {
    // Get specific transactions
    const placeholders = transactionIds.map(() => '?').join(',');
    transactions = db.prepare(`
      SELECT id, description, category_id
      FROM transactions
      WHERE id IN (${placeholders})
    `).all(...transactionIds);
  } else {
    // Get all uncategorized transactions (category_id IS NULL)
    transactions = db.prepare(`
      SELECT id, description, category_id
      FROM transactions
      WHERE category_id IS NULL
    `).all();
  }

  let categorized = 0;
  let skipped = 0;
  const details = [];

  const updateStmt = db.prepare(`
    UPDATE transactions
    SET category_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  // Process in a transaction for performance
  const processAll = db.transaction(() => {
    for (const txn of transactions) {
      // Skip if already has a category
      if (txn.category_id !== null) {
        skipped++;
        details.push({
          transactionId: txn.id,
          description: txn.description,
          categoryId: null,
          categoryName: null,
          confidence: 0,
          status: 'skipped_has_category'
        });
        continue;
      }

      const suggestion = suggestCategory(db, txn.description);

      if (suggestion && suggestion.confidence >= 0.7) {
        // High confidence - apply categorization
        updateStmt.run(suggestion.category_id, txn.id);
        categorized++;
        details.push({
          transactionId: txn.id,
          description: txn.description,
          categoryId: suggestion.category_id,
          categoryName: suggestion.categoryName,
          confidence: suggestion.confidence,
          status: 'categorized'
        });
      } else {
        // Low confidence or no match - skip
        skipped++;
        details.push({
          transactionId: txn.id,
          description: txn.description,
          categoryId: suggestion?.category_id || null,
          categoryName: suggestion?.categoryName || null,
          confidence: suggestion?.confidence || 0,
          status: suggestion ? 'skipped_low_confidence' : 'skipped_no_match'
        });
      }
    }
  });

  processAll();

  return {
    categorized,
    skipped,
    details
  };
}

/**
 * Get uncategorized transactions with suggestions.
 *
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} limit - Maximum number of transactions to return (default 50)
 * @returns {object[]} Array of transactions with suggestion property
 */
export function getUncategorizedTransactions(db, limit = 50) {
  const transactions = db.prepare(`
    SELECT
      t.id,
      t.description,
      t.original_description,
      t.debit_amount,
      t.credit_amount,
      t.transaction_date,
      t.account_id,
      a.account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.category_id IS NULL
    ORDER BY t.transaction_date DESC, t.id DESC
    LIMIT ?
  `).all(limit);

  // Add suggestion to each transaction
  return transactions.map(txn => ({
    ...txn,
    suggestion: suggestCategory(db, txn.description)
  }));
}
