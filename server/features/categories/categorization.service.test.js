/**
 * Categorization Service Tests
 *
 * TDD: Tests written FIRST, implementation follows.
 * Tests AI-like transaction categorization with confidence scoring,
 * pattern learning, and fuzzy matching.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, insertTestTransaction } from '../../db/testDatabase.js';
import {
  suggestCategory,
  learnFromCategorization,
  autoCategorize,
  getUncategorizedTransactions,
  extractPattern,
  levenshteinDistance,
  findSimilarTransactions,
  applyToSimilarTransactions
} from './categorization.service.js';

describe('CategorizationService', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  // ==========================================================================
  // extractPattern - Helper function
  // ==========================================================================
  describe('extractPattern', () => {
    it('should extract first significant word from description', () => {
      const result = extractPattern('TESCO STORES 1234 LONDON');
      expect(result).toBe('%TESCO%');
    });

    it('should handle descriptions with only numbers at start', () => {
      const result = extractPattern('123 AMAZON MARKETPLACE');
      expect(result).toBe('%AMAZON%');
    });

    it('should return null for description with only short words', () => {
      const result = extractPattern('A B C 123');
      expect(result).toBeNull();
    });

    it('should return null for empty description', () => {
      const result = extractPattern('');
      expect(result).toBeNull();
    });

    it('should return null for whitespace-only description', () => {
      const result = extractPattern('   ');
      expect(result).toBeNull();
    });

    it('should handle special characters in description', () => {
      const result = extractPattern('COSTA*COFFEE#123');
      expect(result).toBe('%COSTA%');
    });

    it('should skip numeric-only words', () => {
      const result = extractPattern('12345 67890 SAINSBURY');
      expect(result).toBe('%SAINSBURY%');
    });

    it('should convert to uppercase', () => {
      const result = extractPattern('netflix subscription monthly');
      expect(result).toBe('%NETFLIX%');
    });

    it('should skip words 3 characters or less', () => {
      const result = extractPattern('THE BIG SHOP');
      expect(result).toBe('%SHOP%');
    });

    it('should handle asterisks as word separators', () => {
      const result = extractPattern('UBER*TRIP*LONDON');
      expect(result).toBe('%UBER%');
    });
  });

  // ==========================================================================
  // levenshteinDistance - Helper function for fuzzy matching
  // ==========================================================================
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('TESCO', 'TESCO')).toBe(0);
    });

    it('should return correct distance for single character difference', () => {
      expect(levenshteinDistance('TESCO', 'TESCI')).toBe(1);
    });

    it('should return correct distance for insertions', () => {
      expect(levenshteinDistance('TESCO', 'TESCOS')).toBe(1);
    });

    it('should return correct distance for deletions', () => {
      expect(levenshteinDistance('AMAZON', 'AMAZN')).toBe(1);
    });

    it('should return length of string when compared to empty', () => {
      expect(levenshteinDistance('HELLO', '')).toBe(5);
      expect(levenshteinDistance('', 'HELLO')).toBe(5);
    });

    it('should return 0 for two empty strings', () => {
      expect(levenshteinDistance('', '')).toBe(0);
    });

    it('should handle different length strings', () => {
      expect(levenshteinDistance('CAT', 'CATEGORY')).toBe(5);
    });

    it('should be case sensitive', () => {
      expect(levenshteinDistance('tesco', 'TESCO')).toBe(5);
    });
  });

  // ==========================================================================
  // suggestCategory
  // ==========================================================================
  describe('suggestCategory', () => {
    describe('Exact match (high confidence)', () => {
      it('should return high confidence for exact pattern match', () => {
        const result = suggestCategory(db, 'TESCO STORES 1234');

        expect(result).not.toBeNull();
        expect(result.category_id).toBe(3); // Groceries
        expect(result.categoryName).toBe('Groceries');
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
        expect(result.matched_rule).toBeDefined();
      });

      it('should return high confidence for AMAZON', () => {
        const result = suggestCategory(db, 'AMAZON.CO.UK ORDER');

        expect(result.category_id).toBe(4); // Shopping
        expect(result.categoryName).toBe('Shopping');
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should return high confidence for NETFLIX', () => {
        const result = suggestCategory(db, 'NETFLIX.COM SUBSCRIPTION');

        expect(result.category_id).toBe(5); // Entertainment
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    describe('Partial match (medium confidence)', () => {
      it('should return medium confidence for partial pattern match', () => {
        // Add a specific rule for ALDI STORES
        db.prepare(`
          INSERT INTO category_rules (pattern, category_id, priority)
          VALUES ('ALDI STORES', 3, 15)
        `).run();

        // Test with slight variation
        const result = suggestCategory(db, 'ALDI EXPRESS');

        expect(result).not.toBeNull();
        expect(result.category_id).toBe(3); // Groceries (matches ALDI)
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    describe('No match (null return)', () => {
      it('should return null for completely unknown description', () => {
        const result = suggestCategory(db, 'RANDOM UNKNOWN MERCHANT XYZ123');

        expect(result).toBeNull();
      });

      it('should return null for empty description', () => {
        const result = suggestCategory(db, '');

        expect(result).toBeNull();
      });

      it('should return null for whitespace description', () => {
        const result = suggestCategory(db, '   ');

        expect(result).toBeNull();
      });
    });

    describe('Case insensitivity', () => {
      it('should match regardless of case', () => {
        const upperResult = suggestCategory(db, 'TESCO STORES');
        const lowerResult = suggestCategory(db, 'tesco stores');
        const mixedResult = suggestCategory(db, 'TeSCo StOrEs');

        expect(upperResult.category_id).toBe(lowerResult.category_id);
        expect(lowerResult.category_id).toBe(mixedResult.category_id);
      });
    });

    describe('Priority handling', () => {
      it('should prefer higher priority rules', () => {
        // Add competing rules
        db.prepare(`
          INSERT INTO category_rules (pattern, category_id, priority)
          VALUES ('SPECIAL SHOP', 4, 100)
        `).run(); // High priority - Shopping

        db.prepare(`
          INSERT INTO category_rules (pattern, category_id, priority)
          VALUES ('SPECIAL', 3, 5)
        `).run(); // Low priority - Groceries

        const result = suggestCategory(db, 'SPECIAL SHOP LONDON');

        expect(result.category_id).toBe(4); // Shopping wins
      });
    });

    describe('Inactive rules', () => {
      it('should not match inactive rules', () => {
        // Deactivate TESCO rule
        db.prepare('UPDATE category_rules SET is_active = 0 WHERE pattern = ?').run('TESCO');

        const result = suggestCategory(db, 'TESCO STORES 1234');

        expect(result).toBeNull();
      });
    });
  });

  // ==========================================================================
  // learnFromCategorization
  // ==========================================================================
  describe('learnFromCategorization', () => {
    it('should create a new rule from description', () => {
      const result = learnFromCategorization(db, 'WAITROSE SUPERMARKET 1234', 3);

      expect(result.pattern).toBe('%WAITROSE%');
      expect(result.category_id).toBe(3);
      expect(result.id).toBeDefined();
    });

    it('should make learned pattern immediately usable', () => {
      learnFromCategorization(db, 'GREGGS BAKERY 5678', 7);

      const suggestion = suggestCategory(db, 'GREGGS SAUSAGE ROLL');

      expect(suggestion).not.toBeNull();
      expect(suggestion.category_id).toBe(7);
    });

    it('should set priority based on pattern specificity', () => {
      const shortResult = learnFromCategorization(db, 'ASDA 123', 3);
      const longResult = learnFromCategorization(db, 'MORRISONS SUPERMARKET', 3);

      // Longer patterns should get higher priority
      expect(longResult.priority).toBeGreaterThanOrEqual(shortResult.priority);
    });

    it('should throw error for invalid category ID', () => {
      expect(() => learnFromCategorization(db, 'TEST MERCHANT', 999)).toThrow();
    });

    it('should throw error when pattern cannot be extracted', () => {
      expect(() => learnFromCategorization(db, '123 456', 3)).toThrow('Could not extract pattern');
    });

    it('should not create duplicate patterns for same category', () => {
      learnFromCategorization(db, 'WAITROSE SHOP', 3);

      // Try to learn again for same category
      const secondResult = learnFromCategorization(db, 'WAITROSE MARKET', 3);

      // Should either update existing or skip
      const rules = db.prepare(`
        SELECT COUNT(*) as count FROM category_rules
        WHERE pattern = '%WAITROSE%' AND category_id = 3
      `).get();

      expect(rules.count).toBe(1);
      expect(secondResult.existing).toBe(true);
    });

    it('should allow same pattern for different categories', () => {
      learnFromCategorization(db, 'MULTI PURPOSE SHOP', 3);
      learnFromCategorization(db, 'MULTI PURPOSE STORE', 4);

      const rules = db.prepare(`
        SELECT COUNT(*) as count FROM category_rules
        WHERE pattern = '%MULTI%'
      `).get();

      expect(rules.count).toBe(2);
    });
  });

  // ==========================================================================
  // autoCategorize
  // ==========================================================================
  describe('autoCategorize', () => {
    it('should categorize transactions without category', () => {
      // Insert uncategorized transactions (category_id NULL)
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES 1234', category_id: null });
      const id2 = insertTestTransaction(db, { description: 'AMAZON ORDER 5678', category_id: null });

      const result = autoCategorize(db);

      expect(result.categorized).toBeGreaterThan(0);
      expect(result.skipped).toBeGreaterThanOrEqual(0);
      expect(result.details).toBeDefined();
      expect(Array.isArray(result.details)).toBe(true);

      // Verify transactions were updated
      const txn1 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id1);
      const txn2 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id2);

      expect(txn1.category_id).toBe(3); // Groceries
      expect(txn2.category_id).toBe(4); // Shopping
    });

    it('should categorize specific transaction IDs when provided', () => {
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES', category_id: null });
      const id2 = insertTestTransaction(db, { description: 'AMAZON ORDER', category_id: null });
      const id3 = insertTestTransaction(db, { description: 'NETFLIX SUB', category_id: null });

      // Only categorize id1 and id2
      const result = autoCategorize(db, [id1, id2]);

      expect(result.categorized).toBe(2);

      // id3 should remain uncategorized
      const txn3 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id3);
      expect(txn3.category_id).toBeNull();
    });

    it('should skip transactions that already have a category', () => {
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES', category_id: 2 }); // Already Bills

      const result = autoCategorize(db, [id1]);

      expect(result.skipped).toBe(1);

      // Should not have changed
      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id1);
      expect(txn.category_id).toBe(2);
    });

    it('should return details with category name and confidence', () => {
      insertTestTransaction(db, { description: 'TESCO STORES', category_id: null });

      const result = autoCategorize(db);

      expect(result.details.length).toBeGreaterThan(0);
      expect(result.details[0]).toHaveProperty('transactionId');
      expect(result.details[0]).toHaveProperty('description');
      expect(result.details[0]).toHaveProperty('categoryId');
      expect(result.details[0]).toHaveProperty('categoryName');
      expect(result.details[0]).toHaveProperty('confidence');
    });

    it('should handle transactions with no matching rules', () => {
      const id = insertTestTransaction(db, { description: 'RANDOM UNKNOWN MERCHANT', category_id: null });

      const result = autoCategorize(db, [id]);

      expect(result.skipped).toBe(1);

      // Should remain uncategorized
      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id);
      expect(txn.category_id).toBeNull();
    });

    it('should handle empty transaction IDs array', () => {
      const result = autoCategorize(db, []);

      expect(result.categorized).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.details).toEqual([]);
    });

    it('should only categorize with high confidence by default', () => {
      insertTestTransaction(db, { description: 'TESCO STORES', category_id: null });

      const result = autoCategorize(db);

      // All categorized items should have high confidence
      result.details.forEach(detail => {
        if (detail.categoryId) {
          expect(detail.confidence).toBeGreaterThanOrEqual(0.7);
        }
      });
    });
  });

  // ==========================================================================
  // getUncategorizedTransactions
  // ==========================================================================
  describe('getUncategorizedTransactions', () => {
    it('should return transactions with null category_id', () => {
      insertTestTransaction(db, { description: 'TESCO STORES', category_id: null });
      insertTestTransaction(db, { description: 'AMAZON ORDER', category_id: null });
      insertTestTransaction(db, { description: 'ALREADY CAT', category_id: 3 });

      const result = getUncategorizedTransactions(db);

      expect(result.length).toBe(2);
    });

    it('should include suggested category for each transaction', () => {
      insertTestTransaction(db, { description: 'TESCO STORES 1234', category_id: null });

      const result = getUncategorizedTransactions(db);

      expect(result[0].suggestion).toBeDefined();
      expect(result[0].suggestion.category_id).toBe(3); // Groceries
      expect(result[0].suggestion.categoryName).toBe('Groceries');
      expect(result[0].suggestion.confidence).toBeDefined();
    });

    it('should set suggestion to null for unknown descriptions', () => {
      insertTestTransaction(db, { description: 'RANDOM UNKNOWN XYZ', category_id: null });

      const result = getUncategorizedTransactions(db);

      expect(result[0].suggestion).toBeNull();
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        insertTestTransaction(db, { description: `MERCHANT ${i}`, category_id: null });
      }

      const result = getUncategorizedTransactions(db, 5);

      expect(result.length).toBe(5);
    });

    it('should default to 50 results', () => {
      for (let i = 0; i < 60; i++) {
        insertTestTransaction(db, { description: `MERCHANT ${i}`, category_id: null });
      }

      const result = getUncategorizedTransactions(db);

      expect(result.length).toBe(50);
    });

    it('should include transaction details', () => {
      insertTestTransaction(db, {
        description: 'TESCO STORES',
        category_id: null,
        debit_amount: 50.00,
        transaction_date: '2025-01-15'
      });

      const result = getUncategorizedTransactions(db);

      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('debit_amount');
      expect(result[0]).toHaveProperty('credit_amount');
      expect(result[0]).toHaveProperty('transaction_date');
      expect(result[0]).toHaveProperty('account_id');
    });

    it('should order by transaction_date descending', () => {
      insertTestTransaction(db, { description: 'OLD', category_id: null, transaction_date: '2025-01-01' });
      insertTestTransaction(db, { description: 'NEW', category_id: null, transaction_date: '2025-01-15' });
      insertTestTransaction(db, { description: 'MID', category_id: null, transaction_date: '2025-01-10' });

      const result = getUncategorizedTransactions(db);

      expect(result[0].description).toBe('NEW');
      expect(result[1].description).toBe('MID');
      expect(result[2].description).toBe('OLD');
    });
  });

  // ==========================================================================
  // findSimilarTransactions
  // ==========================================================================
  describe('findSimilarTransactions', () => {
    it('should find transactions with similar descriptions', () => {
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES 1234', category_id: 3 });
      const id2 = insertTestTransaction(db, { description: 'TESCO EXPRESS 5678', category_id: 3 });
      const id3 = insertTestTransaction(db, { description: 'TESCO METRO LONDON', category_id: null });
      const id4 = insertTestTransaction(db, { description: 'AMAZON ORDER', category_id: 4 });

      const result = findSimilarTransactions(db, 'TESCO STORES 9999');

      expect(result.pattern).toBe('%TESCO%');
      expect(result.count).toBe(3); // id1, id2, id3
      expect(result.transactions.map(t => t.id)).toEqual(expect.arrayContaining([id1, id2, id3]));
      expect(result.transactions.map(t => t.id)).not.toContain(id4);
    });

    it('should exclude specific transaction ID when provided', () => {
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES 1234', category_id: 3 });
      const id2 = insertTestTransaction(db, { description: 'TESCO EXPRESS 5678', category_id: 3 });

      const result = findSimilarTransactions(db, 'TESCO STORES 1234', id1);

      expect(result.count).toBe(1);
      expect(result.transactions[0].id).toBe(id2);
    });

    it('should return empty for descriptions with no extractable pattern', () => {
      insertTestTransaction(db, { description: 'TESCO STORES', category_id: 3 });

      const result = findSimilarTransactions(db, '123 456');

      expect(result.pattern).toBeNull();
      expect(result.count).toBe(0);
      expect(result.transactions).toEqual([]);
    });

    it('should be case insensitive', () => {
      insertTestTransaction(db, { description: 'TESCO STORES', category_id: 3 });
      insertTestTransaction(db, { description: 'tesco express', category_id: 3 });

      const result = findSimilarTransactions(db, 'Tesco Metro');

      expect(result.count).toBe(2);
    });

    it('should return count of 0 when no similar transactions exist', () => {
      insertTestTransaction(db, { description: 'AMAZON ORDER', category_id: 4 });

      const result = findSimilarTransactions(db, 'TESCO STORES');

      expect(result.count).toBe(0);
    });
  });

  // ==========================================================================
  // applyToSimilarTransactions
  // ==========================================================================
  describe('applyToSimilarTransactions', () => {
    it('should apply category to all similar transactions', () => {
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES 1234', category_id: 11 }); // Other
      const id2 = insertTestTransaction(db, { description: 'TESCO EXPRESS 5678', category_id: 11 }); // Other
      const id3 = insertTestTransaction(db, { description: 'AMAZON ORDER', category_id: 4 });

      const result = applyToSimilarTransactions(db, 'TESCO METRO', 3); // Groceries

      expect(result.updated).toBe(2);
      expect(result.categoryName).toBe('Groceries');

      // Verify updates
      const txn1 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id1);
      const txn2 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id2);
      const txn3 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id3);

      expect(txn1.category_id).toBe(3);
      expect(txn2.category_id).toBe(3);
      expect(txn3.category_id).toBe(4); // Unchanged
    });

    it('should only update uncategorized when onlyUncategorized is true', () => {
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES 1234', category_id: 11 }); // Other
      const id2 = insertTestTransaction(db, { description: 'TESCO EXPRESS 5678', category_id: 4 }); // Shopping

      const result = applyToSimilarTransactions(db, 'TESCO METRO', 3, { onlyUncategorized: true });

      expect(result.updated).toBe(1);

      const txn1 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id1);
      const txn2 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id2);

      expect(txn1.category_id).toBe(3);
      expect(txn2.category_id).toBe(4); // Unchanged
    });

    it('should exclude specific transaction ID', () => {
      const id1 = insertTestTransaction(db, { description: 'TESCO STORES 1234', category_id: 11 });
      const id2 = insertTestTransaction(db, { description: 'TESCO EXPRESS 5678', category_id: 11 });

      const result = applyToSimilarTransactions(db, 'TESCO METRO', 3, { excludeId: id1 });

      expect(result.updated).toBe(1);

      const txn1 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id1);
      const txn2 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id2);

      expect(txn1.category_id).toBe(11); // Unchanged
      expect(txn2.category_id).toBe(3);
    });

    it('should return 0 updated when no similar transactions found', () => {
      insertTestTransaction(db, { description: 'AMAZON ORDER', category_id: 4 });

      const result = applyToSimilarTransactions(db, 'TESCO STORES', 3);

      expect(result.updated).toBe(0);
      expect(result.message).toContain('No similar transactions');
    });

    it('should throw error for invalid category ID', () => {
      insertTestTransaction(db, { description: 'TESCO STORES', category_id: 11 });

      expect(() => applyToSimilarTransactions(db, 'TESCO METRO', 999)).toThrow('Category not found');
    });

    it('should throw error when pattern cannot be extracted', () => {
      insertTestTransaction(db, { description: 'TESCO STORES', category_id: 11 });

      expect(() => applyToSimilarTransactions(db, '123 456', 3)).toThrow('Could not extract pattern');
    });

    it('should learn the pattern as a rule for future imports', () => {
      insertTestTransaction(db, { description: 'WAITROSE STORE 1234', category_id: 11 });

      applyToSimilarTransactions(db, 'WAITROSE MARKET', 3);

      // Verify rule was created
      const rule = db.prepare(`
        SELECT * FROM category_rules WHERE pattern = '%WAITROSE%' AND category_id = 3
      `).get();

      expect(rule).toBeDefined();
      expect(rule.is_active).toBe(1);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================
  describe('Integration', () => {
    it('should complete learning and suggestion workflow', () => {
      // User manually categorizes a transaction
      insertTestTransaction(db, { description: 'GREGGS BAKERY LONDON', category_id: null });

      // System learns from the categorization
      learnFromCategorization(db, 'GREGGS BAKERY LONDON', 7); // Dining

      // New similar transaction comes in
      const newId = insertTestTransaction(db, { description: 'GREGGS SAUSAGE ROLL', category_id: null });

      // System suggests based on learned pattern
      const uncategorized = getUncategorizedTransactions(db);
      const greggsTxn = uncategorized.find(t => t.id === newId);

      expect(greggsTxn.suggestion).not.toBeNull();
      expect(greggsTxn.suggestion.category_id).toBe(7);
    });

    it('should auto-categorize using learned patterns', () => {
      // Learn pattern
      learnFromCategorization(db, 'WAITROSE FOOD HALL', 3);

      // Insert uncategorized transaction
      const id = insertTestTransaction(db, { description: 'WAITROSE EXPRESS', category_id: null });

      // Auto-categorize
      autoCategorize(db, [id]);

      // Verify
      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id);
      expect(txn.category_id).toBe(3);
    });

    it('should handle competing learned patterns with priority', () => {
      // Learn two patterns - one more specific
      learnFromCategorization(db, 'SHOP A', 3);
      learnFromCategorization(db, 'SHOP', 4);

      const id = insertTestTransaction(db, { description: 'SHOP A LONDON', category_id: null });
      autoCategorize(db, [id]);

      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id);
      // Should match the more specific pattern
      expect(txn.category_id).toBe(3);
    });
  });
});
