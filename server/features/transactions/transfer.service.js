/**
 * Transfer Detection Service
 * Detects and links internal transfers between accounts
 *
 * Transfer Detection Criteria:
 * 1. Same absolute amount (debit in one = credit in other)
 * 2. Opposite direction (one debit, one credit)
 * 3. Within 3 calendar days
 * 4. Between valid account pairs: Main <-> Daily Spend, Main <-> Theo
 */

// Account numbers for transfer detection
const MAIN_ACCOUNT_NUMBER = '17570762';
const DAILY_SPEND_NUMBER = '00393366';
const THEO_ACCOUNT_NUMBER = '55128841';

// Category IDs
const TRANSFER_CATEGORY_ID = 10;
const OTHER_CATEGORY_ID = 11;

/**
 * Detect potential transfer pairs that haven't been linked yet
 * @param {Database} db - better-sqlite3 database instance
 * @returns {{ detected: number, pairs: Array<{ debitTxnId: number, creditTxnId: number, amount: number }> }}
 */
export function detectTransfers(db) {
  // Get valid account IDs for transfer detection
  const mainAccount = db.prepare(
    'SELECT id FROM accounts WHERE account_number = ?'
  ).get(MAIN_ACCOUNT_NUMBER);

  const dailySpendAccount = db.prepare(
    'SELECT id FROM accounts WHERE account_number = ?'
  ).get(DAILY_SPEND_NUMBER);

  const theoAccount = db.prepare(
    'SELECT id FROM accounts WHERE account_number = ?'
  ).get(THEO_ACCOUNT_NUMBER);

  if (!mainAccount || !dailySpendAccount || !theoAccount) {
    return { detected: 0, pairs: [] };
  }

  const mainId = mainAccount.id;
  const dailyId = dailySpendAccount.id;
  const theoId = theoAccount.id;

  // Build valid account pairs (Main <-> Daily, Main <-> Theo)
  // We need to find debit transactions in one account matching credit transactions in another
  const query = `
    SELECT
      t1.id AS debit_id,
      t2.id AS credit_id,
      t1.debit_amount AS amount
    FROM transactions t1
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
    )
    WHERE (
      -- Valid pairs: Main <-> Daily OR Main <-> Theo
      (t1.account_id = ? AND t2.account_id = ?)
      OR (t1.account_id = ? AND t2.account_id = ?)
      OR (t1.account_id = ? AND t2.account_id = ?)
      OR (t1.account_id = ? AND t2.account_id = ?)
    )
    ORDER BY t1.transaction_date, t1.id
  `;

  const pairs = db.prepare(query).all(
    // Main -> Daily
    mainId, dailyId,
    // Daily -> Main
    dailyId, mainId,
    // Main -> Theo
    mainId, theoId,
    // Theo -> Main
    theoId, mainId
  );

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
 * @returns {{ success: boolean, linkedCount: number }}
 */
export function linkTransferPair(db, txn1Id, txn2Id) {
  // Verify both transactions exist
  const txn1 = db.prepare('SELECT id FROM transactions WHERE id = ?').get(txn1Id);
  const txn2 = db.prepare('SELECT id FROM transactions WHERE id = ?').get(txn2Id);

  if (!txn1 || !txn2) {
    throw new Error('Transaction not found');
  }

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
    updateStmt.run(txn2Id, TRANSFER_CATEGORY_ID, txn1Id);

    // Link txn2 -> txn1
    updateStmt.run(txn1Id, TRANSFER_CATEGORY_ID, txn2Id);
  });

  linkTransaction();

  return { success: true, linkedCount: 2 };
}

/**
 * Unlink a transfer pair
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} txnId - Transaction ID (either side of the pair)
 * @returns {{ success: boolean, unlinkedCount: number }}
 */
export function unlinkTransfer(db, txnId) {
  // Verify transaction exists
  const txn = db.prepare('SELECT id, linked_transaction_id, is_transfer FROM transactions WHERE id = ?').get(txnId);

  if (!txn) {
    throw new Error('Transaction not found');
  }

  // If not a transfer, nothing to unlink
  if (!txn.is_transfer || !txn.linked_transaction_id) {
    return { success: true, unlinkedCount: 0 };
  }

  const linkedId = txn.linked_transaction_id;

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
    updateStmt.run(OTHER_CATEGORY_ID, txnId);
    updateStmt.run(OTHER_CATEGORY_ID, linkedId);
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
