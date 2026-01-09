/**
 * Balance Service (TASK-2.1)
 *
 * Handles all balance calculations for accounts including:
 * - Running balance calculation
 * - Balance verification
 * - Opening balance updates
 * - Account summaries
 */

/**
 * Apply penny precision rounding to avoid floating point errors.
 * @param {number} amount - The amount to round
 * @returns {number} Amount rounded to 2 decimal places
 */
function pennyPrecision(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Validate that an account exists.
 * @param {Database} db - The database instance
 * @param {number} accountId - The account ID to check
 * @throws {Error} If account does not exist
 */
function validateAccountExists(db, accountId) {
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId);
  if (!account) {
    throw new Error('Account not found');
  }
}

/**
 * Validate month format (YYYY-MM).
 * @param {string} month - The month string to validate
 * @throws {Error} If format is invalid
 */
function validateMonthFormat(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Invalid month format. Expected YYYY-MM');
  }
}

/**
 * Calculate and update running balances for all transactions in an account.
 * Updates the balance_after field for each transaction and the account's current_balance.
 *
 * @param {Database} db - The database instance
 * @param {number} accountId - The account ID
 * @param {string} [startDate] - Optional start date (YYYY-MM-DD) to recalculate from
 */
export function calculateRunningBalances(db, accountId, startDate = null) {
  validateAccountExists(db, accountId);

  const account = db.prepare('SELECT opening_balance FROM accounts WHERE id = ?').get(accountId);
  let runningBalance = pennyPrecision(account.opening_balance || 0);

  // Get all transactions ordered by date and id
  const transactions = db.prepare(`
    SELECT id, transaction_date, debit_amount, credit_amount, balance_after
    FROM transactions
    WHERE account_id = ?
    ORDER BY transaction_date, id
  `).all(accountId);

  // If startDate provided, find the balance just before that date
  let startIndex = 0;
  if (startDate) {
    for (let i = 0; i < transactions.length; i++) {
      if (transactions[i].transaction_date >= startDate) {
        startIndex = i;
        break;
      }
      // Use existing balance_after for transactions before startDate
      runningBalance = transactions[i].balance_after || runningBalance;
    }
  }

  // Prepare update statement
  const updateStmt = db.prepare('UPDATE transactions SET balance_after = ? WHERE id = ?');

  // Calculate running balances in a transaction
  const calculate = db.transaction(() => {
    for (let i = startIndex; i < transactions.length; i++) {
      const txn = transactions[i];
      const credit = txn.credit_amount || 0;
      const debit = txn.debit_amount || 0;

      runningBalance = pennyPrecision(runningBalance + credit - debit);
      updateStmt.run(runningBalance, txn.id);
    }

    // Update account current_balance
    const finalBalance = transactions.length > 0 ? runningBalance : pennyPrecision(account.opening_balance || 0);
    db.prepare('UPDATE accounts SET current_balance = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(finalBalance, accountId);
  });

  calculate();
}

/**
 * Verify that all running balances are accurate for an account.
 *
 * @param {Database} db - The database instance
 * @param {number} accountId - The account ID
 * @returns {boolean} True if all balances are correct
 */
export function verifyBalanceAccuracy(db, accountId) {
  validateAccountExists(db, accountId);

  const account = db.prepare('SELECT opening_balance, current_balance FROM accounts WHERE id = ?').get(accountId);
  let expectedBalance = pennyPrecision(account.opening_balance || 0);

  const transactions = db.prepare(`
    SELECT debit_amount, credit_amount, balance_after
    FROM transactions
    WHERE account_id = ?
    ORDER BY transaction_date, id
  `).all(accountId);

  // Check each transaction's balance_after
  for (const txn of transactions) {
    const credit = txn.credit_amount || 0;
    const debit = txn.debit_amount || 0;

    expectedBalance = pennyPrecision(expectedBalance + credit - debit);

    if (pennyPrecision(txn.balance_after) !== expectedBalance) {
      return false;
    }
  }

  // Check account's current_balance matches final expected balance
  const expectedCurrent = transactions.length > 0 ? expectedBalance : pennyPrecision(account.opening_balance || 0);
  if (pennyPrecision(account.current_balance) !== expectedCurrent) {
    return false;
  }

  return true;
}

/**
 * Update the opening balance for an account and recalculate all transaction balances.
 *
 * @param {Database} db - The database instance
 * @param {number} accountId - The account ID
 * @param {number} amount - The new opening balance
 */
export function updateOpeningBalance(db, accountId, amount) {
  validateAccountExists(db, accountId);

  const roundedAmount = pennyPrecision(amount);

  const update = db.transaction(() => {
    db.prepare('UPDATE accounts SET opening_balance = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(roundedAmount, accountId);

    // Recalculate all running balances
    calculateRunningBalances(db, accountId);
  });

  update();
}

/**
 * Get account summary with income, expenses, net, and current balance.
 * Excludes transfers (is_transfer=1) from income/expense calculations.
 *
 * @param {Database} db - The database instance
 * @param {number} accountId - The account ID
 * @param {string} [month] - Optional month filter (YYYY-MM)
 * @returns {{income: number, expenses: number, net: number, balance: number}}
 */
export function getAccountSummary(db, accountId, month = null) {
  validateAccountExists(db, accountId);

  const account = db.prepare('SELECT current_balance FROM accounts WHERE id = ?').get(accountId);

  // Build query with optional month filter
  let dateFilter = '';
  const params = [accountId];

  if (month) {
    validateMonthFormat(month);
    dateFilter = 'AND strftime(\'%Y-%m\', transaction_date) = ?';
    params.push(month);
  }

  // Get income (credits, excluding transfers)
  const incomeResult = db.prepare(`
    SELECT COALESCE(SUM(credit_amount), 0) as total
    FROM transactions
    WHERE account_id = ?
      AND is_transfer = 0
      ${dateFilter}
  `).get(...params);

  // Get expenses (debits, excluding transfers)
  const expenseResult = db.prepare(`
    SELECT COALESCE(SUM(debit_amount), 0) as total
    FROM transactions
    WHERE account_id = ?
      AND is_transfer = 0
      ${dateFilter}
  `).get(...params);

  const income = pennyPrecision(incomeResult.total || 0);
  const expenses = pennyPrecision(expenseResult.total || 0);
  const net = pennyPrecision(income - expenses);
  const balance = pennyPrecision(account.current_balance || 0);

  return { income, expenses, net, balance };
}

/**
 * Get monthly summary for an account excluding transfers.
 *
 * @param {Database} db - The database instance
 * @param {number} accountId - The account ID
 * @param {string} month - The month (YYYY-MM) - required
 * @returns {{income: number, expenses: number, net: number}}
 */
export function getMonthlyAccountSummary(db, accountId, month) {
  if (month === undefined) {
    throw new Error('Month parameter is required');
  }

  validateAccountExists(db, accountId);
  validateMonthFormat(month);

  // Get income (credits, excluding transfers) for the month
  const incomeResult = db.prepare(`
    SELECT COALESCE(SUM(credit_amount), 0) as total
    FROM transactions
    WHERE account_id = ?
      AND is_transfer = 0
      AND strftime('%Y-%m', transaction_date) = ?
  `).get(accountId, month);

  // Get expenses (debits, excluding transfers) for the month
  const expenseResult = db.prepare(`
    SELECT COALESCE(SUM(debit_amount), 0) as total
    FROM transactions
    WHERE account_id = ?
      AND is_transfer = 0
      AND strftime('%Y-%m', transaction_date) = ?
  `).get(accountId, month);

  const income = pennyPrecision(incomeResult.total || 0);
  const expenses = pennyPrecision(expenseResult.total || 0);
  const net = pennyPrecision(income - expenses);

  return { income, expenses, net };
}
