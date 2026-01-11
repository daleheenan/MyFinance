/**
 * Accounts Routes (TASK-3.1)
 *
 * API endpoints for account management:
 * - GET /api/accounts - List all accounts
 * - GET /api/accounts/:id - Get single account with current month summary
 * - PUT /api/accounts/:id - Update account name and/or opening balance
 * - GET /api/accounts/:id/summary - Get account summary for a month
 * - GET /api/accounts/:id/monthly - Get month-by-month summary for last 12 months
 */

import { Router } from 'express';
import { getDb } from '../../core/database.js';
import {
  getAccountSummary,
  getMonthlyAccountSummary,
  calculateRunningBalances
} from './balance.service.js';

const router = Router();

/**
 * Validate that the ID parameter is a valid positive integer.
 * @param {string} id - The ID from request params
 * @returns {number|null} The parsed ID or null if invalid
 */
function parseAccountId(id) {
  const parsed = parseInt(id, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/**
 * Validate month format (YYYY-MM).
 * @param {string} month - The month string to validate
 * @returns {boolean} True if valid
 */
function isValidMonthFormat(month) {
  return /^\d{4}-\d{2}$/.test(month);
}

/**
 * Get current month in YYYY-MM format.
 * @returns {string}
 */
function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Get last N months including current month.
 * @param {number} count - Number of months to get
 * @returns {string[]} Array of month strings in YYYY-MM format
 */
function getLastNMonths(count) {
  const months = [];
  const today = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const month = date.toISOString().slice(0, 7);
    months.push(month);
  }

  return months;
}

// ==========================================================================
// GET /api/accounts - List all accounts for current user
// ==========================================================================
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const accounts = db.prepare(`
      SELECT id, account_number, account_name, sort_code, account_type,
             opening_balance, current_balance, credit_limit, is_active,
             created_at, updated_at
      FROM accounts
      WHERE user_id = ?
      ORDER BY id
    `).all(userId);

    res.json({
      success: true,
      data: accounts
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/accounts - Create new account for current user
// ==========================================================================
router.post('/', (req, res, next) => {
  try {
    const { account_name, account_type, account_number, opening_balance } = req.body;
    const userId = req.user.id;

    if (!account_name || !account_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Account name is required'
      });
    }

    const validTypes = ['debit', 'credit'];
    const type = validTypes.includes(account_type) ? account_type : 'debit';

    const db = getDb();

    const result = db.prepare(`
      INSERT INTO accounts (user_id, account_name, account_type, account_number, opening_balance, current_balance)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      account_name.trim(),
      type,
      account_number?.trim() || null,
      opening_balance || 0,
      opening_balance || 0
    );

    const newAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: newAccount
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/accounts/:id - Get single account with current month summary
// ==========================================================================
router.get('/:id', (req, res, next) => {
  try {
    const accountId = parseAccountId(req.params.id);
    const userId = req.user.id;

    if (accountId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID'
      });
    }

    const db = getDb();

    const account = db.prepare(`
      SELECT id, account_number, account_name, sort_code, account_type,
             opening_balance, current_balance, credit_limit, is_active,
             created_at, updated_at
      FROM accounts
      WHERE id = ? AND user_id = ?
    `).get(accountId, userId);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Get current month summary
    const currentMonth = getCurrentMonth();
    const summary = getAccountSummary(db, accountId, currentMonth);

    res.json({
      success: true,
      data: {
        ...account,
        summary: {
          income: summary.income,
          expenses: summary.expenses,
          net: summary.net
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// PUT /api/accounts/:id - Update account
// ==========================================================================
router.put('/:id', (req, res, next) => {
  try {
    const accountId = parseAccountId(req.params.id);
    const userId = req.user.id;

    if (accountId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID'
      });
    }

    const db = getDb();

    // Check if account exists and belongs to user
    const existing = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const { account_name, account_number, opening_balance } = req.body;

    // Validate input
    const hasAccountName = account_name !== undefined;
    const hasAccountNumber = account_number !== undefined;
    const hasOpeningBalance = opening_balance !== undefined;

    if (!hasAccountName && !hasAccountNumber && !hasOpeningBalance) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields provided. Provide account_name, account_number, and/or opening_balance.'
      });
    }

    // Validate account_name if provided
    if (hasAccountName) {
      if (typeof account_name !== 'string' || account_name.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'account_name cannot be empty'
        });
      }
    }

    // Validate account_number if provided
    if (hasAccountNumber) {
      if (typeof account_number !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'account_number must be a string'
        });
      }
      // Check for uniqueness within user's accounts if account_number is being changed
      if (account_number.trim() !== '') {
        const existingWithNumber = db.prepare(
          'SELECT id FROM accounts WHERE account_number = ? AND id != ? AND user_id = ?'
        ).get(account_number.trim(), accountId, userId);
        if (existingWithNumber) {
          return res.status(400).json({
            success: false,
            error: 'An account with this number already exists'
          });
        }
      }
    }

    // Validate opening_balance if provided
    if (hasOpeningBalance) {
      if (typeof opening_balance !== 'number' || isNaN(opening_balance)) {
        return res.status(400).json({
          success: false,
          error: 'opening_balance must be a number'
        });
      }
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (hasAccountName) {
      updates.push('account_name = ?');
      params.push(account_name.trim());
    }

    if (hasAccountNumber) {
      updates.push('account_number = ?');
      params.push(account_number.trim());
    }

    if (hasOpeningBalance) {
      updates.push('opening_balance = ?');
      params.push(Math.round(opening_balance * 100) / 100);
    }

    updates.push("updated_at = datetime('now')");
    params.push(accountId);

    // Execute update
    const updateQuery = `UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(updateQuery).run(...params);

    // If opening_balance changed, recalculate all balances
    if (hasOpeningBalance) {
      calculateRunningBalances(db, accountId);
    }

    // Fetch and return updated account
    const updatedAccount = db.prepare(`
      SELECT id, account_number, account_name, sort_code, account_type,
             opening_balance, current_balance, credit_limit, is_active,
             created_at, updated_at
      FROM accounts
      WHERE id = ?
    `).get(accountId);

    res.json({
      success: true,
      data: updatedAccount
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/accounts/:id/summary - Get account summary for a month
// ==========================================================================
router.get('/:id/summary', (req, res, next) => {
  try {
    const accountId = parseAccountId(req.params.id);
    const userId = req.user.id;

    if (accountId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID'
      });
    }

    const db = getDb();

    // Check if account exists and belongs to user
    const account = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Get month from query param or use current month
    let month = req.query.month;

    if (month) {
      if (!isValidMonthFormat(month)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid month format. Expected YYYY-MM'
        });
      }
    } else {
      month = getCurrentMonth();
    }

    const summary = getAccountSummary(db, accountId, month);

    res.json({
      success: true,
      data: summary
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// DELETE /api/accounts/:id - Delete an account and all its transactions
// ==========================================================================
router.delete('/:id', (req, res, next) => {
  try {
    const accountId = parseAccountId(req.params.id);
    const userId = req.user.id;

    if (accountId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID'
      });
    }

    const db = getDb();

    // Check if account exists and belongs to user
    const account = db.prepare('SELECT id, account_name FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Use transaction to ensure atomicity
    const deleteAccount = db.transaction(() => {
      // 1. Delete anomalies that reference transactions in this account
      db.prepare(`
        DELETE FROM anomalies
        WHERE transaction_id IN (SELECT id FROM transactions WHERE account_id = ?)
      `).run(accountId);

      // 2. Clear linked_transaction_id references (for transfers)
      db.prepare(`
        UPDATE transactions
        SET linked_transaction_id = NULL
        WHERE linked_transaction_id IN (SELECT id FROM transactions WHERE account_id = ?)
      `).run(accountId);

      // 3. Delete all transactions for this account
      const txnResult = db.prepare('DELETE FROM transactions WHERE account_id = ?').run(accountId);

      // 4. Delete import batches for this account
      db.prepare('DELETE FROM import_batches WHERE account_id = ?').run(accountId);

      // 5. Delete the account itself
      db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);

      return txnResult;
    });

    const result = deleteAccount();

    res.json({
      success: true,
      data: {
        deleted_transactions: result.changes,
        message: `Deleted account "${account.account_name}" and ${result.changes} transactions`
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// DELETE /api/accounts/:id/transactions - Clear all transactions from an account
// ==========================================================================
router.delete('/:id/transactions', (req, res, next) => {
  try {
    const accountId = parseAccountId(req.params.id);
    const userId = req.user.id;

    if (accountId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID'
      });
    }

    const db = getDb();

    // Check if account exists and belongs to user
    const account = db.prepare('SELECT id, account_name FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Use transaction to ensure atomicity
    const clearTransactions = db.transaction(() => {
      // 1. Delete anomalies that reference transactions in this account
      db.prepare(`
        DELETE FROM anomalies
        WHERE transaction_id IN (SELECT id FROM transactions WHERE account_id = ?)
      `).run(accountId);

      // 2. Clear linked_transaction_id references (for transfers)
      db.prepare(`
        UPDATE transactions
        SET linked_transaction_id = NULL
        WHERE linked_transaction_id IN (SELECT id FROM transactions WHERE account_id = ?)
      `).run(accountId);

      // 3. Delete all transactions for this account
      const result = db.prepare('DELETE FROM transactions WHERE account_id = ?').run(accountId);

      // 4. Reset current balance to opening balance
      db.prepare(`
        UPDATE accounts
        SET current_balance = opening_balance, updated_at = datetime('now')
        WHERE id = ?
      `).run(accountId);

      return result;
    });

    const result = clearTransactions();

    res.json({
      success: true,
      data: {
        deleted: result.changes,
        message: `Cleared ${result.changes} transactions from ${account.account_name}`
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/accounts/overview/stats - Aggregated stats across all user's accounts
// ==========================================================================
router.get('/overview/stats', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const currentMonth = getCurrentMonth();

    // Get all accounts for this user
    const accounts = db.prepare(`
      SELECT id, account_number, account_name, account_type, current_balance
      FROM accounts
      WHERE is_active = 1 AND user_id = ?
      ORDER BY id
    `).all(userId);

    // Calculate total across all accounts
    let totalBalance = 0;
    let totalIncome = 0;
    let totalExpenses = 0;

    const accountSummaries = accounts.map(account => {
      // For total calculations, exclude transfers to avoid double-counting
      const summary = getAccountSummary(db, account.id, currentMonth);
      totalBalance += account.current_balance;
      totalIncome += summary.income;
      totalExpenses += summary.expenses;

      // For individual account display, include ALL transactions (including transfers)
      // so users see actual money movement in/out of each account
      const allActivityResult = db.prepare(`
        SELECT
          COALESCE(SUM(credit_amount), 0) as total_in,
          COALESCE(SUM(debit_amount), 0) as total_out
        FROM transactions
        WHERE account_id = ?
          AND strftime('%Y-%m', transaction_date) = ?
      `).get(account.id, currentMonth);

      const monthIn = Math.round((allActivityResult?.total_in || 0) * 100) / 100;
      const monthOut = Math.round((allActivityResult?.total_out || 0) * 100) / 100;

      return {
        id: account.id,
        account_name: account.account_name,
        account_number: account.account_number,
        account_type: account.account_type,
        current_balance: account.current_balance,
        month_income: monthIn,
        month_expenses: monthOut,
        month_net: Math.round((monthIn - monthOut) * 100) / 100
      };
    });

    // Round totals
    totalBalance = Math.round(totalBalance * 100) / 100;
    totalIncome = Math.round(totalIncome * 100) / 100;
    totalExpenses = Math.round(totalExpenses * 100) / 100;
    const netChange = Math.round((totalIncome - totalExpenses) * 100) / 100;

    res.json({
      success: true,
      data: {
        month: currentMonth,
        totals: {
          balance: totalBalance,
          income: totalIncome,
          expenses: totalExpenses,
          net: netChange
        },
        accounts: accountSummaries
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/accounts/overview/recent-transactions - Recent transactions across all user's accounts
// ==========================================================================
router.get('/overview/recent-transactions', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 10;

    const transactions = db.prepare(`
      SELECT
        t.id,
        t.transaction_date,
        t.description,
        t.original_description,
        t.debit_amount,
        t.credit_amount,
        t.is_transfer,
        a.id as account_id,
        a.account_name,
        c.name as category_name,
        c.colour as category_colour,
        c.icon as category_icon
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE a.is_active = 1 AND a.user_id = ?
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ?
    `).all(userId, limit);

    res.json({
      success: true,
      data: transactions
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/accounts/:id/balance-trend - Get last N days balance trend for sparkline
// ==========================================================================
router.get('/:id/balance-trend', (req, res, next) => {
  try {
    const accountId = parseAccountId(req.params.id);
    const userId = req.user.id;

    if (accountId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID'
      });
    }

    const db = getDb();

    // Check if account exists and belongs to user
    const account = db.prepare('SELECT id, opening_balance, current_balance FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const days = parseInt(req.query.days, 10) || 7;

    // Get the date N days ago
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days + 1);
    const startDateStr = startDate.toISOString().slice(0, 10);

    // Get the balance just before the start date (last transaction before startDate)
    const lastTxnBefore = db.prepare(`
      SELECT balance_after
      FROM transactions
      WHERE account_id = ?
        AND transaction_date < ?
      ORDER BY transaction_date DESC, id DESC
      LIMIT 1
    `).get(accountId, startDateStr);

    const startingBalance = lastTxnBefore ? lastTxnBefore.balance_after : account.opening_balance;

    // Get all transactions in the date range
    const transactions = db.prepare(`
      SELECT transaction_date, balance_after
      FROM transactions
      WHERE account_id = ?
        AND transaction_date >= ?
      ORDER BY transaction_date ASC, id ASC
    `).all(accountId, startDateStr);

    // Build daily balance array
    const dailyBalances = [];
    let currentBalance = startingBalance;

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().slice(0, 10);

      // Find all transactions for this date and get the last balance
      const dayTxns = transactions.filter(t => t.transaction_date === dateStr);
      if (dayTxns.length > 0) {
        currentBalance = dayTxns[dayTxns.length - 1].balance_after;
      }

      dailyBalances.push({
        date: dateStr,
        balance: currentBalance
      });
    }

    res.json({
      success: true,
      data: dailyBalances
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// POST /api/accounts/:id/test-data - Generate test transaction data
// ==========================================================================
router.post('/:id/test-data', (req, res, next) => {
  try {
    const accountId = parseAccountId(req.params.id);
    const userId = req.user.id;

    if (accountId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID'
      });
    }

    const db = getDb();

    // Check if account exists and belongs to user
    const account = db.prepare('SELECT id, account_name, account_type FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const {
      months = 3,
      transactionsPerMonth = 20,
      includeIncome = true,
      includeBills = true,
      includeShopping = true,
      includeDining = true
    } = req.body;

    // Validate inputs
    if (months < 1 || months > 24) {
      return res.status(400).json({
        success: false,
        error: 'Months must be between 1 and 24'
      });
    }
    if (transactionsPerMonth < 1 || transactionsPerMonth > 100) {
      return res.status(400).json({
        success: false,
        error: 'Transactions per month must be between 1 and 100'
      });
    }

    // Get categories for the user (or defaults)
    const categories = db.prepare(`
      SELECT id, name, type FROM categories
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY user_id DESC, id
    `).all(userId);

    // Build category pools based on selections
    const incomeCategories = categories.filter(c => c.type === 'income');
    const expenseCategories = categories.filter(c => c.type === 'expense');

    // Transaction templates
    const incomeTemplates = [
      { desc: 'SALARY PAYMENT', min: 2000, max: 5000 },
      { desc: 'FREELANCE WORK', min: 200, max: 1500 },
      { desc: 'DIVIDEND PAYMENT', min: 50, max: 500 },
      { desc: 'REFUND', min: 10, max: 200 },
      { desc: 'BANK INTEREST', min: 1, max: 50 }
    ];

    const billTemplates = [
      { desc: 'BRITISH GAS', min: 50, max: 150 },
      { desc: 'VIRGIN MEDIA', min: 30, max: 80 },
      { desc: 'COUNCIL TAX', min: 100, max: 200 },
      { desc: 'WATER BILL', min: 20, max: 60 },
      { desc: 'ELECTRICITY', min: 40, max: 120 },
      { desc: 'MOBILE PHONE', min: 15, max: 50 },
      { desc: 'CAR INSURANCE', min: 30, max: 80 },
      { desc: 'HOME INSURANCE', min: 20, max: 60 },
      { desc: 'NETFLIX', min: 8, max: 16 },
      { desc: 'SPOTIFY', min: 10, max: 15 },
      { desc: 'GYM MEMBERSHIP', min: 20, max: 50 }
    ];

    const shoppingTemplates = [
      { desc: 'TESCO STORES', min: 20, max: 150 },
      { desc: 'SAINSBURYS', min: 15, max: 120 },
      { desc: 'ASDA', min: 25, max: 100 },
      { desc: 'AMAZON UK', min: 10, max: 200 },
      { desc: 'PRIMARK', min: 15, max: 80 },
      { desc: 'BOOTS', min: 5, max: 50 },
      { desc: 'JOHN LEWIS', min: 20, max: 300 },
      { desc: 'NEXT RETAIL', min: 20, max: 150 },
      { desc: 'ARGOS', min: 15, max: 100 },
      { desc: 'WILKO', min: 5, max: 40 }
    ];

    const diningTemplates = [
      { desc: 'COSTA COFFEE', min: 3, max: 8 },
      { desc: 'STARBUCKS', min: 4, max: 10 },
      { desc: 'MCDONALDS', min: 5, max: 15 },
      { desc: 'NANDOS', min: 15, max: 40 },
      { desc: 'PIZZA EXPRESS', min: 20, max: 50 },
      { desc: 'DELIVEROO', min: 15, max: 40 },
      { desc: 'UBER EATS', min: 12, max: 35 },
      { desc: 'GREGGS', min: 3, max: 10 },
      { desc: 'WETHERSPOONS', min: 10, max: 30 },
      { desc: 'PRET A MANGER', min: 5, max: 15 }
    ];

    // Build active templates
    const activeExpenseTemplates = [];
    if (includeBills) activeExpenseTemplates.push(...billTemplates);
    if (includeShopping) activeExpenseTemplates.push(...shoppingTemplates);
    if (includeDining) activeExpenseTemplates.push(...diningTemplates);

    if (!includeIncome && activeExpenseTemplates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one transaction type must be selected'
      });
    }

    // Helper to get random item from array
    const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Helper to get random amount in range
    const randomAmount = (min, max) => {
      const amount = min + Math.random() * (max - min);
      return Math.round(amount * 100) / 100;
    };

    // Helper to get random date in month
    const randomDateInMonth = (year, month) => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const day = Math.floor(Math.random() * daysInMonth) + 1;
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    // Generate transactions
    const transactions = [];
    const today = new Date();

    for (let m = 0; m < months; m++) {
      const targetDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();

      // Generate income transactions (1-3 per month if enabled)
      if (includeIncome && incomeCategories.length > 0) {
        const incomeCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < incomeCount; i++) {
          const template = randomItem(incomeTemplates);
          const category = randomItem(incomeCategories);
          transactions.push({
            date: randomDateInMonth(year, month),
            description: template.desc,
            credit: randomAmount(template.min, template.max),
            debit: 0,
            categoryId: category.id
          });
        }
      }

      // Generate expense transactions
      if (activeExpenseTemplates.length > 0 && expenseCategories.length > 0) {
        const expenseCount = transactionsPerMonth - (includeIncome ? 2 : 0);
        for (let i = 0; i < expenseCount; i++) {
          const template = randomItem(activeExpenseTemplates);
          const category = randomItem(expenseCategories);
          transactions.push({
            date: randomDateInMonth(year, month),
            description: template.desc,
            credit: 0,
            debit: randomAmount(template.min, template.max),
            categoryId: category.id
          });
        }
      }
    }

    // Sort by date
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    // Insert transactions in a single transaction
    const insertTransaction = db.prepare(`
      INSERT INTO transactions (account_id, transaction_date, description, original_description,
                                debit_amount, credit_amount, category_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const insertAll = db.transaction(() => {
      for (const txn of transactions) {
        insertTransaction.run(
          accountId,
          txn.date,
          txn.description,
          txn.description,
          txn.debit,
          txn.credit,
          txn.categoryId
        );
      }
    });

    insertAll();

    // Recalculate running balances
    calculateRunningBalances(db, accountId);

    res.json({
      success: true,
      data: {
        count: transactions.length,
        message: `Generated ${transactions.length} test transactions for ${account.account_name}`
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/accounts/:id/monthly - Get month-by-month summary for last 12 months
// ==========================================================================
router.get('/:id/monthly', (req, res, next) => {
  try {
    const accountId = parseAccountId(req.params.id);
    const userId = req.user.id;

    if (accountId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID'
      });
    }

    const db = getDb();

    // Check if account exists and belongs to user
    const account = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Get last 12 months
    const months = getLastNMonths(12);

    // Get summary for each month
    const monthlySummaries = months.map(month => {
      const summary = getMonthlyAccountSummary(db, accountId, month);
      return {
        month,
        income: summary.income,
        expenses: summary.expenses,
        net: summary.net
      };
    });

    res.json({
      success: true,
      data: monthlySummaries
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// GET /api/accounts/:id/balance-history - Get year-on-year balance history for line chart
// ==========================================================================
router.get('/:id/balance-history', (req, res, next) => {
  try {
    const accountId = parseAccountId(req.params.id);
    const userId = req.user.id;

    if (accountId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account ID'
      });
    }

    const db = getDb();

    // Check if account exists and belongs to user
    const account = db.prepare('SELECT id, account_name, opening_balance FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Get all distinct years from transactions
    const yearsResult = db.prepare(`
      SELECT DISTINCT strftime('%Y', transaction_date) as year
      FROM transactions
      WHERE account_id = ?
      ORDER BY year ASC
    `).all(accountId);

    if (yearsResult.length === 0) {
      return res.json({
        success: true,
        data: {
          account_name: account.account_name,
          years: []
        }
      });
    }

    const years = yearsResult.map(r => parseInt(r.year));

    // For each year, get the end-of-month balance for each month
    const yearData = years.map(year => {
      const months = [];

      for (let month = 1; month <= 12; month++) {
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;

        // Get the last transaction balance for this month
        const lastTxn = db.prepare(`
          SELECT balance_after
          FROM transactions
          WHERE account_id = ?
            AND strftime('%Y-%m', transaction_date) = ?
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `).get(accountId, monthStr);

        // If no transactions in this month, try to get the last known balance before this month
        let balance = null;
        if (lastTxn) {
          balance = lastTxn.balance_after;
        } else {
          // Get the last balance before this month
          const lastEndOfMonth = new Date(year, month, 0); // Last day of this month
          const lastBefore = db.prepare(`
            SELECT balance_after
            FROM transactions
            WHERE account_id = ?
              AND transaction_date <= ?
            ORDER BY transaction_date DESC, id DESC
            LIMIT 1
          `).get(accountId, lastEndOfMonth.toISOString().slice(0, 10));

          if (lastBefore) {
            balance = lastBefore.balance_after;
          }
        }

        months.push({
          month,
          balance
        });
      }

      return {
        year,
        months
      };
    });

    res.json({
      success: true,
      data: {
        account_name: account.account_name,
        years: yearData
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
