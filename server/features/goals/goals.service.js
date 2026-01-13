/**
 * Savings Goals Service
 *
 * Provides CRUD operations and analytics for savings goals.
 */

import { getDb } from '../../core/database.js';

/**
 * Get all savings goals for a user
 * @param {number} userId - User ID
 * @returns {Array} List of savings goals
 */
export function getSavingsGoals(userId) {
  const db = getDb();
  const goals = db.prepare(`
    SELECT sg.*, a.account_name as linked_account_name
    FROM savings_goals sg
    LEFT JOIN accounts a ON sg.linked_account_id = a.id
    WHERE sg.user_id = ? AND sg.is_active = 1
    ORDER BY sg.is_completed ASC, sg.target_date ASC
  `).all(userId);

  return goals.map(goal => ({
    ...goal,
    progress: goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0,
    remaining: Math.max(0, goal.target_amount - goal.current_amount)
  }));
}

/**
 * Get a single savings goal by ID
 * @param {number} goalId - Goal ID
 * @param {number} userId - User ID
 * @returns {Object|null} The goal or null
 */
export function getSavingsGoalById(goalId, userId) {
  const db = getDb();
  const goal = db.prepare(`
    SELECT sg.*, a.account_name as linked_account_name
    FROM savings_goals sg
    LEFT JOIN accounts a ON sg.linked_account_id = a.id
    WHERE sg.id = ? AND sg.user_id = ?
  `).get(goalId, userId);

  if (!goal) return null;

  // Get contributions
  const contributions = db.prepare(`
    SELECT sc.*, t.description as transaction_description
    FROM savings_contributions sc
    LEFT JOIN transactions t ON sc.transaction_id = t.id
    WHERE sc.goal_id = ?
    ORDER BY sc.contribution_date DESC
    LIMIT 20
  `).all(goalId);

  return {
    ...goal,
    progress: goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0,
    remaining: Math.max(0, goal.target_amount - goal.current_amount),
    contributions
  };
}

/**
 * Create a new savings goal
 * @param {Object} data - Goal data
 * @returns {Object} Created goal
 */
export function createSavingsGoal(data) {
  const db = getDb();
  const { userId, name, targetAmount, targetDate, linkedAccountId, colour, icon } = data;

  const result = db.prepare(`
    INSERT INTO savings_goals (user_id, name, target_amount, target_date, linked_account_id, colour, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, name, targetAmount, targetDate || null, linkedAccountId || null, colour || '#10B981', icon || '🎯');

  return getSavingsGoalById(result.lastInsertRowid, userId);
}

/**
 * Update a savings goal
 * @param {number} goalId - Goal ID
 * @param {number} userId - User ID
 * @param {Object} data - Updated data
 * @returns {Object} Updated goal
 */
export function updateSavingsGoal(goalId, userId, data) {
  const db = getDb();
  const { name, targetAmount, targetDate, linkedAccountId, colour, icon, isCompleted } = data;

  // Check ownership
  const existing = db.prepare('SELECT id FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, userId);
  if (!existing) {
    throw new Error('Goal not found');
  }

  db.prepare(`
    UPDATE savings_goals
    SET name = COALESCE(?, name),
        target_amount = COALESCE(?, target_amount),
        target_date = COALESCE(?, target_date),
        linked_account_id = ?,
        colour = COALESCE(?, colour),
        icon = COALESCE(?, icon),
        is_completed = COALESCE(?, is_completed),
        updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(name, targetAmount, targetDate, linkedAccountId, colour, icon, isCompleted, goalId, userId);

  return getSavingsGoalById(goalId, userId);
}

/**
 * Delete a savings goal (soft delete)
 * @param {number} goalId - Goal ID
 * @param {number} userId - User ID
 */
export function deleteSavingsGoal(goalId, userId) {
  const db = getDb();

  const result = db.prepare(`
    UPDATE savings_goals SET is_active = 0, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(goalId, userId);

  if (result.changes === 0) {
    throw new Error('Goal not found');
  }

  return { success: true };
}

/**
 * Add a contribution to a goal
 * @param {number} goalId - Goal ID
 * @param {number} userId - User ID
 * @param {Object} data - Contribution data
 * @returns {Object} Updated goal
 */
export function addContribution(goalId, userId, data) {
  const db = getDb();
  const { amount, contributionDate, notes, transactionId } = data;

  // Check ownership
  const goal = db.prepare('SELECT id, current_amount FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, userId);
  if (!goal) {
    throw new Error('Goal not found');
  }

  // Add contribution
  db.prepare(`
    INSERT INTO savings_contributions (goal_id, amount, contribution_date, notes, transaction_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(goalId, amount, contributionDate || new Date().toISOString().slice(0, 10), notes || null, transactionId || null);

  // Update current amount
  const newAmount = goal.current_amount + amount;
  db.prepare(`
    UPDATE savings_goals SET current_amount = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(newAmount, goalId);

  // Auto-complete if target reached
  const updatedGoal = db.prepare('SELECT target_amount, current_amount FROM savings_goals WHERE id = ?').get(goalId);
  if (updatedGoal.current_amount >= updatedGoal.target_amount) {
    db.prepare('UPDATE savings_goals SET is_completed = 1 WHERE id = ?').run(goalId);
  }

  return getSavingsGoalById(goalId, userId);
}

/**
 * Get savings goals summary for dashboard
 * @param {number} userId - User ID
 * @returns {Object} Summary data
 */
export function getSavingsGoalsSummary(userId) {
  const db = getDb();

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_goals,
      SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed_goals,
      COALESCE(SUM(target_amount), 0) as total_target,
      COALESCE(SUM(current_amount), 0) as total_saved,
      COALESCE(SUM(target_amount - current_amount), 0) as total_remaining
    FROM savings_goals
    WHERE user_id = ? AND is_active = 1
  `).get(userId);

  // Get upcoming goals (due within 90 days)
  const upcomingGoals = db.prepare(`
    SELECT id, name, target_amount, current_amount, target_date, colour, icon
    FROM savings_goals
    WHERE user_id = ? AND is_active = 1 AND is_completed = 0
      AND target_date IS NOT NULL
      AND target_date <= date('now', '+90 days')
    ORDER BY target_date ASC
    LIMIT 3
  `).all(userId);

  // Calculate days until each upcoming goal
  const today = new Date();
  const goalsWithDays = upcomingGoals.map(goal => {
    const targetDate = new Date(goal.target_date);
    const daysRemaining = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
    const remaining = goal.target_amount - goal.current_amount;
    const dailyNeeded = daysRemaining > 0 ? remaining / daysRemaining : remaining;
    return {
      ...goal,
      progress: goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0,
      remaining,
      daysRemaining,
      dailyNeeded
    };
  });

  return {
    stats: {
      totalGoals: stats.total_goals,
      completedGoals: stats.completed_goals,
      activeGoals: stats.total_goals - stats.completed_goals,
      totalTarget: stats.total_target,
      totalSaved: stats.total_saved,
      totalRemaining: stats.total_remaining,
      overallProgress: stats.total_target > 0 ? (stats.total_saved / stats.total_target) * 100 : 0
    },
    upcomingGoals: goalsWithDays
  };
}
