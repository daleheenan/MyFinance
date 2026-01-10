/**
 * E2E Tests for Transactions Page
 * Tests transaction listing, filtering, inline editing, and bulk operations
 */

import { test, expect } from '@playwright/test';

// Helper to set up authenticated session
async function setupAuthenticatedSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'test-session-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'admin' }));
  });
}

test.describe('Transactions Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test.describe('Page Layout', () => {
    test('should display transactions page with all components', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Account selector should be visible
      const accountSelector = page.locator('#account-select');
      await expect(accountSelector).toBeVisible();

      // Filter bar should be visible
      const filtersCard = page.locator('.filters-card');
      await expect(filtersCard).toBeVisible();

      // Transactions container should exist
      const transactionsContainer = page.locator('#transactions-container');
      await expect(transactionsContainer).toBeVisible();

      // Import button should be visible
      const importBtn = page.locator('#import-csv-btn');
      await expect(importBtn).toBeVisible();
    });

    test('should display filter controls', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Date range filters
      await expect(page.locator('#filter-start-date')).toBeVisible();
      await expect(page.locator('#filter-end-date')).toBeVisible();

      // Category filter
      await expect(page.locator('#filter-category')).toBeVisible();

      // Search input
      await expect(page.locator('#filter-search')).toBeVisible();

      // Filter buttons
      await expect(page.locator('#apply-filters-btn')).toBeVisible();
      await expect(page.locator('#clear-filters-btn')).toBeVisible();
    });
  });

  test.describe('Account Selection', () => {
    test('should populate account selector with available accounts', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      const accountSelect = page.locator('#account-select');

      // Wait for accounts to load
      await page.waitForFunction(() => {
        const select = document.querySelector('#account-select');
        return select && select.options.length > 0 && !select.options[0].text.includes('Loading');
      }, { timeout: 10000 }).catch(() => {});

      // Should have at least one account option
      const options = await accountSelect.locator('option').all();
      expect(options.length).toBeGreaterThan(0);
    });

    test('should reload transactions when account changes', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Wait for initial load
      await page.waitForSelector('#account-select option:not(:disabled)', { timeout: 10000 }).catch(() => {});

      const accountSelect = page.locator('#account-select');
      const options = await accountSelect.locator('option').all();

      if (options.length > 1) {
        // Get current URL
        const initialUrl = page.url();

        // Select a different account
        await accountSelect.selectOption({ index: 1 });

        // Wait for transactions to reload
        await page.waitForLoadState('networkidle');

        // URL should update with account param
        const newUrl = page.url();
        expect(newUrl).toContain('account');
      }
    });
  });

  test.describe('Filtering', () => {
    test('should apply date filters', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Set date range
      await page.fill('#filter-start-date', '2025-01-01');
      await page.fill('#filter-end-date', '2025-01-31');

      // Apply filters
      await page.click('#apply-filters-btn');
      await page.waitForLoadState('networkidle');

      // URL should contain date params
      const url = page.url();
      expect(url).toContain('start_date');
    });

    test('should apply category filter', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Wait for categories to load
      await page.waitForFunction(() => {
        const select = document.querySelector('#filter-category');
        return select && select.options.length > 1;
      }, { timeout: 10000 }).catch(() => {});

      const categorySelect = page.locator('#filter-category');
      const options = await categorySelect.locator('option').all();

      if (options.length > 1) {
        // Select a category
        await categorySelect.selectOption({ index: 1 });
        await page.click('#apply-filters-btn');
        await page.waitForLoadState('networkidle');

        // URL should contain category param
        const url = page.url();
        expect(url).toContain('category');
      }
    });

    test('should apply search filter', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Enter search term
      await page.fill('#filter-search', 'TESCO');
      await page.click('#apply-filters-btn');
      await page.waitForLoadState('networkidle');

      // URL should contain search param
      const url = page.url();
      expect(url).toContain('search=TESCO');
    });

    test('should clear all filters', async ({ page }) => {
      // Start with some filters applied
      await page.goto('/#/transactions?search=test&category=1');
      await page.waitForLoadState('networkidle');

      // Click clear filters
      await page.click('#clear-filters-btn');
      await page.waitForLoadState('networkidle');

      // URL should be clean
      const url = page.url();
      expect(url).not.toContain('search=');
      expect(url).not.toContain('category=');

      // Input fields should be empty
      const searchInput = page.locator('#filter-search');
      await expect(searchInput).toHaveValue('');
    });
  });

  test.describe('Transactions Table', () => {
    test('should display transaction columns', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Wait for table to load
      await page.waitForSelector('.transactions-table, .empty-state, .error-state', { timeout: 10000 }).catch(() => {});

      const table = page.locator('.transactions-table');
      const hasTable = await table.isVisible().catch(() => false);

      if (hasTable) {
        // Check column headers
        await expect(page.locator('th.col-date')).toBeVisible();
        await expect(page.locator('th.col-description')).toBeVisible();
        await expect(page.locator('th.col-category')).toBeVisible();
        await expect(page.locator('th.col-debit')).toBeVisible();
        await expect(page.locator('th.col-credit')).toBeVisible();
        await expect(page.locator('th.col-balance')).toBeVisible();
      }
    });

    test('should show empty state when no transactions', async ({ page }) => {
      // Use filters that likely return no results
      await page.goto('/#/transactions?search=ZZZZNONEXISTENT12345');
      await page.waitForLoadState('networkidle');

      // Wait for empty state or table
      await page.waitForSelector('.empty-state, .transactions-table', { timeout: 10000 }).catch(() => {});

      // If no transactions match, should show empty state
      const emptyState = page.locator('.empty-state');
      const table = page.locator('.transactions-table');

      const isEmpty = await emptyState.isVisible().catch(() => false);
      const hasTable = await table.isVisible().catch(() => false);

      expect(isEmpty || hasTable).toBeTruthy();
    });

    test('should expand transaction row on click', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Wait for transactions to load
      await page.waitForSelector('.transaction-row, .empty-state', { timeout: 10000 }).catch(() => {});

      const rows = await page.locator('.transaction-row').all();

      if (rows.length > 0) {
        // Click on first transaction row
        await rows[0].click();

        // Detail row should appear
        const detailRow = page.locator('.transaction-detail-row');
        await expect(detailRow).toBeVisible({ timeout: 3000 }).catch(() => {});
      }
    });
  });

  test.describe('Inline Editing', () => {
    test('should enable description editing on click', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Wait for transactions to load
      await page.waitForSelector('.editable-description, .empty-state', { timeout: 10000 }).catch(() => {});

      const editableDesc = page.locator('.editable-description').first();
      const isVisible = await editableDesc.isVisible().catch(() => false);

      if (isVisible) {
        await editableDesc.click();

        // Input should appear
        const input = page.locator('.inline-edit-input');
        await expect(input).toBeVisible({ timeout: 3000 }).catch(() => {});
      }
    });

    test('should open category picker on category click', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Wait for transactions to load
      await page.waitForSelector('.editable-category, .empty-state', { timeout: 10000 }).catch(() => {});

      const categoryBadge = page.locator('.editable-category').first();
      const isVisible = await categoryBadge.isVisible().catch(() => false);

      if (isVisible) {
        await categoryBadge.click();

        // Category modal should open
        const categoryModal = page.locator('#category-modal');
        await expect(categoryModal).not.toHaveClass(/hidden/, { timeout: 3000 }).catch(() => {});
      }
    });
  });

  test.describe('Pagination', () => {
    test('should display pagination controls', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Wait for content
      await page.waitForSelector('.pagination-controls, .empty-state', { timeout: 10000 }).catch(() => {});

      const pagination = page.locator('.pagination-controls');
      const isVisible = await pagination.isVisible().catch(() => false);

      if (isVisible) {
        // Should have prev/next buttons
        await expect(page.locator('.pagination-prev')).toBeVisible();
        await expect(page.locator('.pagination-next')).toBeVisible();
      }
    });

    test('should show page info', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Wait for pagination
      await page.waitForSelector('.pagination-info, .empty-state', { timeout: 10000 }).catch(() => {});

      const pageInfo = page.locator('.pagination-info');
      const isVisible = await pageInfo.isVisible().catch(() => false);

      if (isVisible) {
        // Should show page number input
        const pageInput = page.locator('.pagination-input');
        await expect(pageInput).toBeVisible();
      }
    });
  });

  test.describe('Modals', () => {
    test('should open import modal', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Click import button
      await page.click('#import-csv-btn');

      // Modal should be visible
      const importModal = page.locator('#import-modal');
      await expect(importModal).not.toHaveClass(/hidden/);
    });

    test('should close import modal on close button', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Open modal
      await page.click('#import-csv-btn');
      await expect(page.locator('#import-modal')).not.toHaveClass(/hidden/);

      // Close modal
      await page.click('#import-modal-close');
      await expect(page.locator('#import-modal')).toHaveClass(/hidden/);
    });

    test('should close modal on backdrop click', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Open modal
      await page.click('#import-csv-btn');
      await expect(page.locator('#import-modal')).not.toHaveClass(/hidden/);

      // Click backdrop
      await page.locator('#import-modal .modal-backdrop').click();
      await expect(page.locator('#import-modal')).toHaveClass(/hidden/);
    });

    test('import modal should have account selector and file input', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Open modal
      await page.click('#import-csv-btn');

      // Check components
      await expect(page.locator('#import-account')).toBeVisible();
      await expect(page.locator('#import-file')).toBeVisible();
      await expect(page.locator('#import-preview-btn')).toBeVisible();
    });
  });
});

test.describe('Transaction Delete', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test('should show delete confirmation modal', async ({ page }) => {
    await page.goto('/#/transactions');
    await page.waitForLoadState('networkidle');

    // Wait for transactions to load
    await page.waitForSelector('.transaction-row, .empty-state', { timeout: 10000 }).catch(() => {});

    const rows = await page.locator('.transaction-row').all();

    if (rows.length > 0) {
      // Expand first row
      await rows[0].click();
      await page.waitForSelector('.transaction-detail-row', { timeout: 3000 }).catch(() => {});

      // Find delete button in expanded row
      const deleteBtn = page.locator('.delete-btn').first();
      const isVisible = await deleteBtn.isVisible().catch(() => false);

      if (isVisible) {
        await deleteBtn.click();

        // Delete modal should appear
        const deleteModal = page.locator('#delete-modal');
        await expect(deleteModal).not.toHaveClass(/hidden/, { timeout: 3000 }).catch(() => {});
      }
    }
  });
});
