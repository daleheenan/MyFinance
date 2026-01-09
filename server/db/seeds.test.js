import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from './testDatabase.js';

describe('Seed Data', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('Accounts', () => {
    it('should seed 4 accounts', () => {
      const accounts = db.prepare('SELECT * FROM accounts').all();
      expect(accounts).toHaveLength(4);
    });

    it('should seed Main Account with correct details', () => {
      const main = db.prepare("SELECT * FROM accounts WHERE account_number = '17570762'").get();

      expect(main).toBeDefined();
      expect(main.account_name).toBe('Main Account');
      expect(main.account_type).toBe('debit');
      expect(main.opening_balance).toBe(0);
    });

    it('should seed Daily Spend account', () => {
      const daily = db.prepare("SELECT * FROM accounts WHERE account_number = '00393366'").get();

      expect(daily).toBeDefined();
      expect(daily.account_name).toBe('Daily Spend');
      expect(daily.account_type).toBe('debit');
    });

    it('should seed Theo Entertainment account', () => {
      const theo = db.prepare("SELECT * FROM accounts WHERE account_number = '55128841'").get();

      expect(theo).toBeDefined();
      expect(theo.account_name).toBe('Theo Entertainment');
      expect(theo.account_type).toBe('debit');
    });

    it('should seed Credit Card account', () => {
      const card = db.prepare("SELECT * FROM accounts WHERE account_number LIKE '4521%'").get();

      expect(card).toBeDefined();
      expect(card.account_name).toBe('Credit Card');
      expect(card.account_type).toBe('credit');
    });
  });

  describe('Categories', () => {
    it('should seed 11 categories', () => {
      const categories = db.prepare('SELECT * FROM categories').all();
      expect(categories).toHaveLength(11);
    });

    it('should seed Salary as income type', () => {
      const salary = db.prepare("SELECT * FROM categories WHERE name = 'Salary'").get();

      expect(salary).toBeDefined();
      expect(salary.type).toBe('income');
      expect(salary.colour).toBe('#34c759');
      expect(salary.icon).toBe('💰');
    });

    it('should seed expense categories with correct colours', () => {
      const groceries = db.prepare("SELECT * FROM categories WHERE name = 'Groceries'").get();
      const bills = db.prepare("SELECT * FROM categories WHERE name = 'Bills'").get();

      expect(groceries.type).toBe('expense');
      expect(groceries.colour).toBe('#007aff');
      expect(bills.colour).toBe('#ff3b30');
    });

    it('should seed Transfer as neutral type', () => {
      const transfer = db.prepare("SELECT * FROM categories WHERE name = 'Transfer'").get();

      expect(transfer).toBeDefined();
      expect(transfer.type).toBe('neutral');
      expect(transfer.icon).toBe('↔️');
    });

    it('should seed Other as neutral type', () => {
      const other = db.prepare("SELECT * FROM categories WHERE name = 'Other'").get();

      expect(other).toBeDefined();
      expect(other.type).toBe('neutral');
    });
  });

  describe('Category Rules', () => {
    it('should seed category rules', () => {
      const rules = db.prepare('SELECT * FROM category_rules').all();
      expect(rules.length).toBeGreaterThanOrEqual(5);
    });

    it('should have rule for TESCO → Groceries', () => {
      const groceriesId = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get().id;
      const tescoRule = db.prepare("SELECT * FROM category_rules WHERE pattern LIKE '%TESCO%'").get();

      expect(tescoRule).toBeDefined();
      expect(tescoRule.category_id).toBe(groceriesId);
    });

    it('should have rule for AMAZON → Shopping', () => {
      const shoppingId = db.prepare("SELECT id FROM categories WHERE name = 'Shopping'").get().id;
      const amazonRule = db.prepare("SELECT * FROM category_rules WHERE pattern LIKE '%AMAZON%'").get();

      expect(amazonRule).toBeDefined();
      expect(amazonRule.category_id).toBe(shoppingId);
    });

    it('should have rule for NETFLIX → Entertainment', () => {
      const entId = db.prepare("SELECT id FROM categories WHERE name = 'Entertainment'").get().id;
      const netflixRule = db.prepare("SELECT * FROM category_rules WHERE pattern LIKE '%NETFLIX%'").get();

      expect(netflixRule).toBeDefined();
      expect(netflixRule.category_id).toBe(entId);
    });
  });
});
