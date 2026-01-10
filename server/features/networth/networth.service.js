/**
 * Net Worth Service
 *
 * Handles all net worth calculations including:
 * - getCurrentNetWorth(db) - Calculate current net worth from account balances
 * - getNetWorthHistory(db, months?) - Get historical net worth snapshots
 * - getNetWorthBreakdown(db) - Get accounts grouped by type with totals
 * - takeSnapshot(db) - Create a point-in-time snapshot of net worth
 */

import { getTodayUTC, getMonthsAgo, formatDateUTC } from '../../core/dates.js';

/**
 * Apply penny precision rounding to avoid floating point errors.
 * @param {number} amount - The amount to round
 * @returns {number} Amount rounded to 2 decimal places
 */
function pennyPrecision(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Calculate current net worth from all active accounts.
 *
 * Assets = SUM of debit accounts' current_balance (including negative for overdraft)
 *        + credit accounts with positive balance (overpayment)
 * Liabilities = SUM of credit accounts' negative balance (as positive number)
 * Net Worth = Assets - Liabilities
 *
 * @param {Database} db - The database instance
 * @returns {{ totalAssets: number, totalLiabilities: number, netWorth: number, breakdown: Array }}
 */
export function getCurrentNetWorth(db) {
  // Get all active accounts with their balances
  const accounts = db.prepare(`
    SELECT id, account_name, account_number, account_type, current_balance
    FROM accounts
    WHERE is_active = 1
    ORDER BY id
  `).all();

  let totalAssets = 0;
  let totalLiabilities = 0;
  const breakdown = [];

  for (const account of accounts) {
    const balance = pennyPrecision(account.current_balance || 0);

    // Add to breakdown
    breakdown.push({
      id: account.id,
      account_name: account.account_name,
      account_number: account.account_number,
      account_type: account.account_type,
      current_balance: balance
    });

    // Determine if this account contributes to assets or liabilities
    if (account.account_type === 'debit') {
      // Debit accounts: balance contributes to assets (even if negative/overdraft)
      totalAssets += balance;
    } else if (account.account_type === 'credit') {
      // Credit accounts: negative balance is a liability, positive is an asset (overpayment)
      if (balance < 0) {
        totalLiabilities += Math.abs(balance);
      } else {
        totalAssets += balance;
      }
    }
  }

  const netWorth = pennyPrecision(totalAssets - totalLiabilities);

  // Get snapshot from approximately 1 month ago for comparison
  // This provides a meaningful month-over-month change
  const today = getTodayUTC();
  const oneMonthAgo = getMonthsAgo(1);
  const comparisonDate = formatDateUTC(oneMonthAgo);

  // Find the closest snapshot to one month ago (within 7 days)
  const previousSnapshot = db.prepare(`
    SELECT net_worth, snapshot_date
    FROM net_worth_snapshots
    WHERE snapshot_date <= ?
      AND snapshot_date != ?
    ORDER BY snapshot_date DESC
    LIMIT 1
  `).get(comparisonDate, today);

  // Fall back to most recent snapshot if no month-old snapshot exists
  const fallbackSnapshot = !previousSnapshot ? db.prepare(`
    SELECT net_worth, snapshot_date
    FROM net_worth_snapshots
    WHERE snapshot_date < ?
    ORDER BY snapshot_date DESC
    LIMIT 1
  `).get(today) : null;

  const comparisonSnapshot = previousSnapshot || fallbackSnapshot;
  const previousNetWorth = comparisonSnapshot ? pennyPrecision(comparisonSnapshot.net_worth) : netWorth;
  const change = pennyPrecision(netWorth - previousNetWorth);
  const comparisonPeriod = comparisonSnapshot ? comparisonSnapshot.snapshot_date : null;

  return {
    total_assets: pennyPrecision(totalAssets),
    total_liabilities: pennyPrecision(totalLiabilities),
    net_worth: netWorth,
    previous_net_worth: previousNetWorth,
    change: change,
    comparison_date: comparisonPeriod,
    breakdown
  };
}

/**
 * Get net worth history from snapshots table.
 *
 * @param {Database} db - The database instance
 * @param {number} months - Number of snapshots to return (default 12)
 * @returns {Array} Array of snapshots ordered by date descending
 */
export function getNetWorthHistory(db, months = 12) {
  const snapshots = db.prepare(`
    SELECT id, snapshot_date, total_assets, total_liabilities, net_worth, account_breakdown, created_at
    FROM net_worth_snapshots
    ORDER BY snapshot_date DESC
    LIMIT ?
  `).all(months);

  return snapshots;
}

/**
 * Get accounts grouped by type with totals.
 *
 * @param {Database} db - The database instance
 * @returns {{ assets: Array, liabilities: Array, totals: { assets: number, liabilities: number, netWorth: number } }}
 */
export function getNetWorthBreakdown(db) {
  // Get all active accounts with their balances
  const accounts = db.prepare(`
    SELECT id, account_name, account_number, account_type, current_balance
    FROM accounts
    WHERE is_active = 1
    ORDER BY id
  `).all();

  const assets = [];
  const liabilities = [];
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of accounts) {
    const balance = pennyPrecision(account.current_balance || 0);

    const accountInfo = {
      id: account.id,
      account_name: account.account_name,
      account_number: account.account_number,
      account_type: account.account_type,
      current_balance: balance
    };

    if (account.account_type === 'debit') {
      // All debit accounts go to assets
      assets.push(accountInfo);
      totalAssets += balance;
    } else if (account.account_type === 'credit') {
      // All credit accounts go to liabilities
      liabilities.push(accountInfo);
      if (balance < 0) {
        totalLiabilities += Math.abs(balance);
      } else {
        // Overpayment counts as asset
        totalAssets += balance;
      }
    }
  }

  totalAssets = pennyPrecision(totalAssets);
  totalLiabilities = pennyPrecision(totalLiabilities);
  const netWorth = pennyPrecision(totalAssets - totalLiabilities);

  return {
    assets,
    liabilities,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: netWorth
  };
}

/**
 * Create a snapshot of the current net worth.
 * Uses INSERT OR REPLACE to update if a snapshot for today already exists.
 *
 * @param {Database} db - The database instance
 * @returns {Object} The created/updated snapshot
 */
export function takeSnapshot(db) {
  const today = getTodayUTC();
  const current = getCurrentNetWorth(db);
  const accountBreakdown = JSON.stringify(current.breakdown);

  // UPSERT - insert or update for same date
  const stmt = db.prepare(`
    INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth, account_breakdown)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_date) DO UPDATE SET
      total_assets = excluded.total_assets,
      total_liabilities = excluded.total_liabilities,
      net_worth = excluded.net_worth,
      account_breakdown = excluded.account_breakdown,
      created_at = datetime('now')
  `);

  stmt.run(
    today,
    current.total_assets,
    current.total_liabilities,
    current.net_worth,
    accountBreakdown
  );

  // Retrieve and return the saved/updated snapshot
  const snapshot = db.prepare(`
    SELECT * FROM net_worth_snapshots WHERE snapshot_date = ?
  `).get(today);

  return snapshot;
}
