/**
 * Transfer Detection Service
 * Detects and links internal transfers between accounts
 *
 * Transfer Detection Criteria:
 * 1. Same absolute amount (debit in one = credit in other)
 * 2. Opposite direction (one debit, one credit)
 * 3. Within 3 calendar days
 * 4. Between any two different accounts
 */

// Category IDs - looked up dynamically, with fallbacks
const DEFAULT_TRANSFER_CATEGORY_ID = 10;
const DEFAULT_OTHER_CATEGORY_ID = 11;

/**
 * Get the Transfer category ID from the database
 * @param {Database} db - better-sqlite3 database instance
 * @returns {number} Category ID for transfers
 */
function getTransferCategoryId(db) {
  const category = db.prepare(
    "SELECT id FROM categories WHERE name = 'Transfer' LIMIT 1"
  ).get();
  return category ? category.id : DEFAULT_TRANSFER_CATEGORY_ID;
}

/**
 * Get the Other/Uncategorized category ID from the database
 * @param {Database} db - better-sqlite3 database instance
 * @returns {number} Category ID for uncategorized
 */
function getOtherCategoryId(db) {
  const category = db.prepare(
    "SELECT id FROM categories WHERE name IN ('Other', 'Uncategorized') LIMIT 1"
  ).get();
  return category ? category.id : DEFAULT_OTHER_CATEGORY_ID;
}

/**
 * Detect potential transfer pairs that haven't been linked yet
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} userId - User ID to filter transfers (only between user's own accounts)
 * @returns {{ detected: number, pairs: Array<{ debitTxnId: number, creditTxnId: number, amount: number }> }}
 */
export function detectTransfers(db, userId) {
  // Detect transfers between user's own accounts only
  // Criteria: same amount, opposite direction, within 3 days, both accounts belong to user
  const query = `
    SELECT
      t1.id AS debit_id,
      t2.id AS credit_id,
      t1.debit_amount AS amount
    FROM transactions t1
    JOIN accounts a1 ON a1.id = t1.account_id
    JOIN transactions t2 ON (
      -- Same amount (debit in t1 = credit in t2)
      t1.debit_amount = t2.credit_amount
      AND t1.debit_amount > 0
      AND t2.credit_amount > 0
      -- Within 3 days
      AND ABS(julianday(t1.transaction_date) - julianday(t2.transaction_date)) <= 3
      -- Different accounts
      AND t1.account_id != t2.account_id
      -- Neither is already marked as transfer
      AND t1.is_transfer = 0
      AND t2.is_transfer = 0
      -- Avoid duplicate pairs (only match where t1.id < t2.id for one direction)
      AND t1.id < t2.id
    )
    JOIN accounts a2 ON a2.id = t2.account_id
    -- CRITICAL: Both accounts must belong to the same user
    WHERE a1.user_id = ? AND a2.user_id = ?
    ORDER BY t1.transaction_date, t1.id
  `;

  const pairs = db.prepare(query).all(userId, userId);

  // Format the result
  const formattedPairs = pairs.map(p => ({
    debitTxnId: p.debit_id,
    creditTxnId: p.credit_id,
    amount: Math.round(p.amount * 100) / 100 // Penny precision
  }));

  return {
    detected: formattedPairs.length,
    pairs: formattedPairs
  };
}

/**
 * Link two transactions as a transfer pair
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} txn1Id - First transaction ID
 * @param {number} txn2Id - Second transaction ID
 * @param {number} userId - User ID to verify ownership of both transactions
 * @returns {{ success: boolean, linkedCount: number }}
 */
export function linkTransferPair(db, txn1Id, txn2Id, userId) {
  // Verify both transactions exist AND belong to user's accounts
  const txn1 = db.prepare(`
    SELECT t.id FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ? AND a.user_id = ?
  `).get(txn1Id, userId);

  const txn2 = db.prepare(`
    SELECT t.id FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ? AND a.user_id = ?
  `).get(txn2Id, userId);

  if (!txn1 || !txn2) {
    throw new Error('Transaction not found');
  }

  const transferCategoryId = getTransferCategoryId(db);

  // Use transaction for atomicity
  const linkTransaction = db.transaction(() => {
    const updateStmt = db.prepare(`
      UPDATE transactions
      SET is_transfer = 1,
          linked_transaction_id = ?,
          category_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `);

    // Link txn1 -> txn2
    updateStmt.run(txn2Id, transferCategoryId, txn1Id);

    // Link txn2 -> txn1
    updateStmt.run(txn1Id, transferCategoryId, txn2Id);
  });

  linkTransaction();

  return { success: true, linkedCount: 2 };
}

/**
 * Unlink a transfer pair
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} txnId - Transaction ID (either side of the pair)
 * @param {number} userId - User ID to verify ownership
 * @returns {{ success: boolean, unlinkedCount: number }}
 */
export function unlinkTransfer(db, txnId, userId) {
  // Verify transaction exists AND belongs to user's account
  const txn = db.prepare(`
    SELECT t.id, t.linked_transaction_id, t.is_transfer
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ? AND a.user_id = ?
  `).get(txnId, userId);

  if (!txn) {
    throw new Error('Transaction not found');
  }

  // If not a transfer, nothing to unlink
  if (!txn.is_transfer || !txn.linked_transaction_id) {
    return { success: true, unlinkedCount: 0 };
  }

  const linkedId = txn.linked_transaction_id;
  const otherCategoryId = getOtherCategoryId(db);

  // Use transaction for atomicity
  const unlinkTransaction = db.transaction(() => {
    const updateStmt = db.prepare(`
      UPDATE transactions
      SET is_transfer = 0,
          linked_transaction_id = NULL,
          category_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `);

    // Unlink both transactions
    updateStmt.run(otherCategoryId, txnId);
    updateStmt.run(otherCategoryId, linkedId);
  });

  unlinkTransaction();

  return { success: true, unlinkedCount: 2 };
}

/**
 * Check if a transaction is an internal transfer
 * @param {object|null|undefined} txn - Transaction object
 * @returns {boolean}
 */
export function isInternalTransfer(txn) {
  if (!txn) {
    return false;
  }

  return Boolean(txn.is_transfer);
}
