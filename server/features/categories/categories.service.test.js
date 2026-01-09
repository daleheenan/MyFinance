/**
 * Category Service Tests (TASK-2.3)
 *
 * TDD: Tests written FIRST, implementation follows.
 * Tests category matching, auto-assignment, bulk operations, and CRUD for rules.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import {
  getCategoryByDescription,
  autoAssignCategory,
  bulkAssignCategories,
  addCategoryRule,
  getCategoryRules,
  updateCategoryRule,
  deleteCategoryRule
} from './categories.service.js';

describe('CategoriesService', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // getCategoryByDescription
  // ==========================================================================
  describe('getCategoryByDescription', () => {
    describe('Groceries matching (category_id=3)', () => {
      it('should match TESCO to Groceries', () => {
        const result = getCategoryByDescription(db, 'TESCO STORES 1234');
        expect(result.id).toBe(3);
        expect(result.name).toBe('Groceries');
      });

      it('should match SAINSBURY to Groceries', () => {
        const result = getCategoryByDescription(db, "SAINSBURY'S SUPERMARKET");
        expect(result.id).toBe(3);
        expect(result.name).toBe('Groceries');
      });

      it('should match ASDA to Groceries', () => {
        const result = getCategoryByDescription(db, 'ASDA SUPERSTORE LONDON');
        expect(result.id).toBe(3);
        expect(result.name).toBe('Groceries');
      });

      it('should match MORRISONS to Groceries', () => {
        const result = getCategoryByDescription(db, 'WM MORRISONS STORE');
        expect(result.id).toBe(3);
        expect(result.name).toBe('Groceries');
      });

      it('should match LIDL to Groceries', () => {
        const result = getCategoryByDescription(db, 'LIDL GB MANCHESTER');
        expect(result.id).toBe(3);
        expect(result.name).toBe('Groceries');
      });

      it('should match ALDI to Groceries', () => {
        const result = getCategoryByDescription(db, 'ALDI STORES LTD');
        expect(result.id).toBe(3);
        expect(result.name).toBe('Groceries');
      });
    });

    describe('Shopping matching (category_id=4)', () => {
      it('should match AMAZON to Shopping', () => {
        const result = getCategoryByDescription(db, 'AMAZON.CO.UK*AB12CD34E');
        expect(result.id).toBe(4);
        expect(result.name).toBe('Shopping');
      });

      it('should match AMAZON PRIME to Shopping', () => {
        const result = getCategoryByDescription(db, 'AMAZON PRIME MEMBERSHIP');
        expect(result.id).toBe(4);
        expect(result.name).toBe('Shopping');
      });

      it('should match AMZN MKTP to Shopping (AMAZON pattern)', () => {
        // Note: This tests that AMAZON pattern is in description
        const result = getCategoryByDescription(db, 'AMZN AMAZON MARKETPLACE');
        expect(result.id).toBe(4);
        expect(result.name).toBe('Shopping');
      });
    });

    describe('Transport matching (category_id=6)', () => {
      it('should match UBER to Transport', () => {
        const result = getCategoryByDescription(db, 'UBER *TRIP LONDON');
        expect(result.id).toBe(6);
        expect(result.name).toBe('Transport');
      });

      it('should match UBER EATS to Transport', () => {
        const result = getCategoryByDescription(db, 'UBER EATS PENDING');
        expect(result.id).toBe(6);
        expect(result.name).toBe('Transport');
      });

      it('should match TRAINLINE to Transport', () => {
        const result = getCategoryByDescription(db, 'TRAINLINE.COM LONDON');
        expect(result.id).toBe(6);
        expect(result.name).toBe('Transport');
      });
    });

    describe('Entertainment matching (category_id=5)', () => {
      it('should match NETFLIX to Entertainment', () => {
        const result = getCategoryByDescription(db, 'NETFLIX.COM');
        expect(result.id).toBe(5);
        expect(result.name).toBe('Entertainment');
      });

      it('should match SPOTIFY to Entertainment', () => {
        const result = getCategoryByDescription(db, 'SPOTIFY PREMIUM');
        expect(result.id).toBe(5);
        expect(result.name).toBe('Entertainment');
      });

      it('should match PLAYSTATION to Entertainment', () => {
        const result = getCategoryByDescription(db, 'PLAYSTATION NETWORK');
        expect(result.id).toBe(5);
        expect(result.name).toBe('Entertainment');
      });

      it('should match XBOX to Entertainment', () => {
        const result = getCategoryByDescription(db, 'XBOX GAME PASS');
        expect(result.id).toBe(5);
        expect(result.name).toBe('Entertainment');
      });
    });

    describe('Dining matching (category_id=7)', () => {
      it('should match COSTA to Dining', () => {
        const result = getCategoryByDescription(db, 'COSTA COFFEE EUSTON');
        expect(result.id).toBe(7);
        expect(result.name).toBe('Dining');
      });

      it('should match STARBUCKS to Dining', () => {
        const result = getCategoryByDescription(db, 'STARBUCKS LONDON BRIDGE');
        expect(result.id).toBe(7);
        expect(result.name).toBe('Dining');
      });

      it('should match PRET to Dining', () => {
        const result = getCategoryByDescription(db, 'PRET A MANGER PADDINGTON');
        expect(result.id).toBe(7);
        expect(result.name).toBe('Dining');
      });

      it('should match RESTAURANT to Dining', () => {
        const result = getCategoryByDescription(db, 'THE ITALIAN RESTAURANT');
        expect(result.id).toBe(7);
        expect(result.name).toBe('Dining');
      });

      it('should match CAFE to Dining', () => {
        const result = getCategoryByDescription(db, 'VILLAGE CAFE OXFORD');
        expect(result.id).toBe(7);
        expect(result.name).toBe('Dining');
      });

      it('should match COFFEE to Dining', () => {
        const result = getCategoryByDescription(db, 'COFFEE REPUBLIC LTD');
        expect(result.id).toBe(7);
        expect(result.name).toBe('Dining');
      });
    });

    describe('Case insensitivity', () => {
      it('should match lowercase tesco to Groceries', () => {
        const result = getCategoryByDescription(db, 'tesco stores 1234');
        expect(result.id).toBe(3);
        expect(result.name).toBe('Groceries');
      });

      it('should match mixed case TeSCo to Groceries', () => {
        const result = getCategoryByDescription(db, 'TeSCo ExTrA');
        expect(result.id).toBe(3);
        expect(result.name).toBe('Groceries');
      });

      it('should match lowercase netflix to Entertainment', () => {
        const result = getCategoryByDescription(db, 'netflix monthly subscription');
        expect(result.id).toBe(5);
        expect(result.name).toBe('Entertainment');
      });

      it('should match UPPERCASE AMAZON to Shopping', () => {
        const result = getCategoryByDescription(db, 'AMAZON MARKETPLACE GB');
        expect(result.id).toBe(4);
        expect(result.name).toBe('Shopping');
      });
    });

    describe('Priority handling', () => {
      it('should return higher priority match when multiple rules could match', () => {
        // Add a high-priority rule for specific coffee shop
        addCategoryRule(db, 'COSTA COFFEE SPECIAL', 4, 100); // Shopping with high priority

        const result = getCategoryByDescription(db, 'COSTA COFFEE SPECIAL EDITION');
        expect(result.id).toBe(4); // Should be Shopping, not Dining
        expect(result.name).toBe('Shopping');
      });

      it('should use lower priority when high priority does not match', () => {
        // Standard COSTA still matches Dining
        const result = getCategoryByDescription(db, 'COSTA COFFEE EUSTON');
        expect(result.id).toBe(7);
        expect(result.name).toBe('Dining');
      });
    });

    describe('Default to Other (category_id=11)', () => {
      it('should return Other for unmatched description', () => {
        const result = getCategoryByDescription(db, 'RANDOM PAYMENT XYZ123');
        expect(result.id).toBe(11);
        expect(result.name).toBe('Other');
      });

      it('should return Other for empty description', () => {
        const result = getCategoryByDescription(db, '');
        expect(result.id).toBe(11);
        expect(result.name).toBe('Other');
      });

      it('should return Other for whitespace-only description', () => {
        const result = getCategoryByDescription(db, '   ');
        expect(result.id).toBe(11);
        expect(result.name).toBe('Other');
      });

      it('should return Other for partial non-matching patterns', () => {
        const result = getCategoryByDescription(db, 'TES'); // Not TESCO
        expect(result.id).toBe(11);
        expect(result.name).toBe('Other');
      });
    });

    describe('Edge cases', () => {
      it('should handle description with special characters', () => {
        const result = getCategoryByDescription(db, 'TESCO*STORE#123!');
        expect(result.id).toBe(3);
        expect(result.name).toBe('Groceries');
      });

      it('should handle description with numbers', () => {
        const result = getCategoryByDescription(db, 'UBER 123456 TRIP');
        expect(result.id).toBe(6);
        expect(result.name).toBe('Transport');
      });

      it('should only match active rules', () => {
        // Deactivate all TESCO rules
        db.prepare('UPDATE category_rules SET is_active = 0 WHERE pattern = ?').run('TESCO');

        const result = getCategoryByDescription(db, 'TESCO STORES 1234');
        expect(result.id).toBe(11); // Should fall through to Other
        expect(result.name).toBe('Other');
      });
    });
  });

  // ==========================================================================
  // autoAssignCategory
  // ==========================================================================
  describe('autoAssignCategory', () => {
    it('should assign category to transaction based on description', () => {
      const txnId = insertTestTransaction(db, {
        description: 'TESCO STORES 1234',
        category_id: 11 // Initially Other
      });

      const result = autoAssignCategory(db, txnId);

      expect(result.success).toBe(true);
      expect(result.categoryId).toBe(3);
      expect(result.categoryName).toBe('Groceries');

      // Verify database was updated
      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(txnId);
      expect(txn.category_id).toBe(3);
    });

    it('should assign Shopping category for AMAZON transactions', () => {
      const txnId = insertTestTransaction(db, {
        description: 'AMAZON.CO.UK ORDER',
        category_id: 11
      });

      const result = autoAssignCategory(db, txnId);

      expect(result.success).toBe(true);
      expect(result.categoryId).toBe(4);
      expect(result.categoryName).toBe('Shopping');
    });

    it('should assign Entertainment for NETFLIX', () => {
      const txnId = insertTestTransaction(db, {
        description: 'NETFLIX.COM SUBSCRIPTION',
        category_id: 11
      });

      const result = autoAssignCategory(db, txnId);

      expect(result.success).toBe(true);
      expect(result.categoryId).toBe(5);
    });

    it('should return Other if no rules match', () => {
      const txnId = insertTestTransaction(db, {
        description: 'UNKNOWN PAYMENT REF123',
        category_id: 11
      });

      const result = autoAssignCategory(db, txnId);

      expect(result.success).toBe(true);
      expect(result.categoryId).toBe(11);
      expect(result.categoryName).toBe('Other');
    });

    it('should throw error for non-existent transaction', () => {
      expect(() => autoAssignCategory(db, 99999)).toThrow('Transaction not found');
    });

    it('should throw error for invalid transaction ID', () => {
      expect(() => autoAssignCategory(db, null)).toThrow();
      expect(() => autoAssignCategory(db, undefined)).toThrow();
    });
  });

  // ==========================================================================
  // bulkAssignCategories
  // ==========================================================================
  describe('bulkAssignCategories', () => {
    it('should assign categories to all uncategorized transactions when no IDs provided', () => {
      // Insert multiple uncategorized transactions
      insertTestTransaction(db, { description: 'TESCO STORES 1', category_id: 11 });
      insertTestTransaction(db, { description: 'AMAZON ORDER 1', category_id: 11 });
      insertTestTransaction(db, { description: 'NETFLIX MONTHLY', category_id: 11 });
      insertTestTransaction(db, { description: 'UNKNOWN PAYMENT', category_id: 11 });

      const result = bulkAssignCategories(db);

      expect(result.totalProcessed).toBe(4);
      expect(result.updated).toBeGreaterThan(0);
      expect(result.unchanged).toBeGreaterThanOrEqual(0);

      // Verify TESCO was assigned to Groceries
      const tescoTxn = db.prepare("SELECT category_id FROM transactions WHERE description LIKE '%TESCO%'").get();
      expect(tescoTxn.category_id).toBe(3);

      // Verify AMAZON was assigned to Shopping
      const amazonTxn = db.prepare("SELECT category_id FROM transactions WHERE description LIKE '%AMAZON%'").get();
      expect(amazonTxn.category_id).toBe(4);
    });

    it('should assign categories to specific transaction IDs when provided', () => {
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES 1', category_id: 11 });
      const id2 = insertTestTransaction(db, { description: 'AMAZON ORDER 1', category_id: 11 });
      const id3 = insertTestTransaction(db, { description: 'UBER TRIP', category_id: 11 });

      // Only assign to id1 and id2
      const result = bulkAssignCategories(db, [id1, id2]);

      expect(result.totalProcessed).toBe(2);

      // Verify id1 and id2 were updated
      const txn1 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id1);
      const txn2 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id2);
      const txn3 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id3);

      expect(txn1.category_id).toBe(3); // Groceries
      expect(txn2.category_id).toBe(4); // Shopping
      expect(txn3.category_id).toBe(11); // Still Other (not processed)
    });

    it('should not overwrite already categorized transactions (not Other)', () => {
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES', category_id: 2 }); // Already Bills

      const result = bulkAssignCategories(db, [id1]);

      // Should not update since it is not "Other"
      expect(result.skipped).toBe(1);

      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id1);
      expect(txn.category_id).toBe(2); // Still Bills
    });

    it('should return summary of bulk operation', () => {
      insertTestTransaction(db, { description: 'TESCO', category_id: 11 });
      insertTestTransaction(db, { description: 'UNKNOWN XYZ', category_id: 11 });
      insertTestTransaction(db, { description: 'ALREADY BILLS', category_id: 2 });

      const result = bulkAssignCategories(db);

      expect(result).toHaveProperty('totalProcessed');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('unchanged');
      expect(result).toHaveProperty('skipped');
    });

    it('should handle empty array of IDs', () => {
      const result = bulkAssignCategories(db, []);
      expect(result.totalProcessed).toBe(0);
    });

    it('should handle when no uncategorized transactions exist', () => {
      // Insert only categorized transactions
      insertTestTransaction(db, { description: 'TESCO', category_id: 3 });

      const result = bulkAssignCategories(db);

      expect(result.totalProcessed).toBe(0);
    });
  });

  // ==========================================================================
  // addCategoryRule
  // ==========================================================================
  describe('addCategoryRule', () => {
    it('should add a new category rule', () => {
      const result = addCategoryRule(db, 'WAITROSE', 3, 10);

      expect(result.id).toBeDefined();
      expect(result.pattern).toBe('WAITROSE');
      expect(result.categoryId).toBe(3);
      expect(result.priority).toBe(10);
    });

    it('should use default priority of 0 if not provided', () => {
      const result = addCategoryRule(db, 'M&S FOOD', 3);

      expect(result.priority).toBe(0);
    });

    it('should make new rule immediately usable for matching', () => {
      addCategoryRule(db, 'WAITROSE', 3, 10);

      const category = getCategoryByDescription(db, 'WAITROSE SUPERMARKET');
      expect(category.id).toBe(3);
      expect(category.name).toBe('Groceries');
    });

    it('should throw error for invalid category ID', () => {
      expect(() => addCategoryRule(db, 'PATTERN', 999, 10)).toThrow();
    });

    it('should throw error for empty pattern', () => {
      expect(() => addCategoryRule(db, '', 3, 10)).toThrow('Pattern cannot be empty');
    });

    it('should throw error for whitespace-only pattern', () => {
      expect(() => addCategoryRule(db, '   ', 3, 10)).toThrow('Pattern cannot be empty');
    });

    it('should allow duplicate patterns with different priorities', () => {
      addCategoryRule(db, 'COFFEE SHOP', 7, 5);
      const result = addCategoryRule(db, 'COFFEE SHOP', 4, 15);

      expect(result.id).toBeDefined();

      // Higher priority should match Shopping (4) instead of Dining (7)
      const category = getCategoryByDescription(db, 'COFFEE SHOP DOWNTOWN');
      expect(category.id).toBe(4);
    });
  });

  // ==========================================================================
  // getCategoryRules
  // ==========================================================================
  describe('getCategoryRules', () => {
    it('should return all category rules ordered by priority descending', () => {
      const rules = getCategoryRules(db);

      expect(rules.length).toBeGreaterThan(0);

      // Verify ordering by priority (descending)
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });

    it('should include category information with each rule', () => {
      const rules = getCategoryRules(db);

      expect(rules[0]).toHaveProperty('id');
      expect(rules[0]).toHaveProperty('pattern');
      expect(rules[0]).toHaveProperty('categoryId');
      expect(rules[0]).toHaveProperty('categoryName');
      expect(rules[0]).toHaveProperty('priority');
      expect(rules[0]).toHaveProperty('isActive');
    });

    it('should return seeded rules', () => {
      const rules = getCategoryRules(db);

      // Check for known seeded patterns
      const patterns = rules.map(r => r.pattern);
      expect(patterns).toContain('TESCO');
      expect(patterns).toContain('AMAZON');
      expect(patterns).toContain('NETFLIX');
    });

    it('should include newly added rules', () => {
      addCategoryRule(db, 'NEWPATTERN', 3, 50);

      const rules = getCategoryRules(db);
      const newRule = rules.find(r => r.pattern === 'NEWPATTERN');

      expect(newRule).toBeDefined();
      expect(newRule.priority).toBe(50);
    });

    it('should only return active rules by default', () => {
      // Deactivate a rule
      db.prepare('UPDATE category_rules SET is_active = 0 WHERE pattern = ?').run('TESCO');

      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      expect(tescoRule).toBeUndefined();
    });

    it('should return all rules including inactive when includeInactive is true', () => {
      db.prepare('UPDATE category_rules SET is_active = 0 WHERE pattern = ?').run('TESCO');

      const rules = getCategoryRules(db, { includeInactive: true });
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      expect(tescoRule).toBeDefined();
      expect(tescoRule.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // updateCategoryRule
  // ==========================================================================
  describe('updateCategoryRule', () => {
    it('should update rule pattern', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      const result = updateCategoryRule(db, tescoRule.id, { pattern: 'TESCO STORES' });

      expect(result.pattern).toBe('TESCO STORES');
    });

    it('should update rule priority', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      const result = updateCategoryRule(db, tescoRule.id, { priority: 100 });

      expect(result.priority).toBe(100);
    });

    it('should update rule category', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      const result = updateCategoryRule(db, tescoRule.id, { categoryId: 4 });

      expect(result.categoryId).toBe(4);
    });

    it('should update rule is_active status', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      const result = updateCategoryRule(db, tescoRule.id, { isActive: false });

      expect(result.isActive).toBe(false);
    });

    it('should update multiple fields at once', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      const result = updateCategoryRule(db, tescoRule.id, {
        pattern: 'TESCO EXPRESS',
        priority: 50,
        categoryId: 4
      });

      expect(result.pattern).toBe('TESCO EXPRESS');
      expect(result.priority).toBe(50);
      expect(result.categoryId).toBe(4);
    });

    it('should throw error for non-existent rule', () => {
      expect(() => updateCategoryRule(db, 99999, { pattern: 'NEW' })).toThrow('Rule not found');
    });

    it('should throw error for invalid category ID', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      expect(() => updateCategoryRule(db, tescoRule.id, { categoryId: 999 })).toThrow();
    });

    it('should throw error for empty pattern', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      expect(() => updateCategoryRule(db, tescoRule.id, { pattern: '' })).toThrow('Pattern cannot be empty');
    });

    it('should apply updates immediately for matching', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      // Change TESCO to Shopping
      updateCategoryRule(db, tescoRule.id, { categoryId: 4 });

      const category = getCategoryByDescription(db, 'TESCO STORES');
      expect(category.id).toBe(4);
      expect(category.name).toBe('Shopping');
    });
  });

  // ==========================================================================
  // deleteCategoryRule
  // ==========================================================================
  describe('deleteCategoryRule', () => {
    it('should delete an existing rule', () => {
      const rulesBefore = getCategoryRules(db);
      const tescoRule = rulesBefore.find(r => r.pattern === 'TESCO');

      const result = deleteCategoryRule(db, tescoRule.id);

      expect(result.deleted).toBe(true);

      const rulesAfter = getCategoryRules(db, { includeInactive: true });
      const deletedRule = rulesAfter.find(r => r.id === tescoRule.id);
      expect(deletedRule).toBeUndefined();
    });

    it('should return deleted rule information', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      const result = deleteCategoryRule(db, tescoRule.id);

      expect(result.id).toBe(tescoRule.id);
      expect(result.pattern).toBe('TESCO');
    });

    it('should throw error for non-existent rule', () => {
      expect(() => deleteCategoryRule(db, 99999)).toThrow('Rule not found');
    });

    it('should no longer match deleted pattern', () => {
      const rules = getCategoryRules(db);
      const tescoRule = rules.find(r => r.pattern === 'TESCO');

      deleteCategoryRule(db, tescoRule.id);

      // TESCO should now fall through to Other (unless matched by another rule)
      const category = getCategoryByDescription(db, 'TESCO STORES');
      // It should be Other since the TESCO rule was deleted
      expect(category.id).toBe(11);
    });

    it('should throw error for null rule ID', () => {
      expect(() => deleteCategoryRule(db, null)).toThrow();
    });
  });

  // ==========================================================================
  // Integration tests
  // ==========================================================================
  describe('Integration', () => {
    it('should handle complete workflow: add rule, match, update, delete', () => {
      // Add a new rule
      const newRule = addCategoryRule(db, 'GREGGS', 7, 10);
      expect(newRule.id).toBeDefined();

      // Verify matching works
      let category = getCategoryByDescription(db, 'GREGGS BAKERY SAUSAGE ROLL');
      expect(category.id).toBe(7);
      expect(category.name).toBe('Dining');

      // Update the rule to point to Entertainment
      updateCategoryRule(db, newRule.id, { categoryId: 5 });
      category = getCategoryByDescription(db, 'GREGGS BAKERY');
      expect(category.id).toBe(5);
      expect(category.name).toBe('Entertainment');

      // Delete the rule
      deleteCategoryRule(db, newRule.id);
      category = getCategoryByDescription(db, 'GREGGS BAKERY');
      expect(category.id).toBe(11); // Falls back to Other
    });

    it('should correctly bulk assign with newly added rules', () => {
      // Add new rule
      addCategoryRule(db, 'GREGGS', 7, 10);

      // Insert transaction
      insertTestTransaction(db, { description: 'GREGGS BAKERY', category_id: 11 });

      // Bulk assign
      const result = bulkAssignCategories(db);

      expect(result.updated).toBeGreaterThan(0);

      // Verify transaction was categorized
      const txn = db.prepare("SELECT category_id FROM transactions WHERE description LIKE '%GREGGS%'").get();
      expect(txn.category_id).toBe(7);
    });

    it('should respect priority when bulk assigning', () => {
      // Add competing rules
      addCategoryRule(db, 'SPECIAL', 3, 5);  // Low priority - Groceries
      addCategoryRule(db, 'SPECIAL', 4, 15); // High priority - Shopping

      insertTestTransaction(db, { description: 'SPECIAL SHOP', category_id: 11 });

      bulkAssignCategories(db);

      const txn = db.prepare("SELECT category_id FROM transactions WHERE description LIKE '%SPECIAL%'").get();
      expect(txn.category_id).toBe(4); // Shopping wins due to higher priority
    });
  });
});
