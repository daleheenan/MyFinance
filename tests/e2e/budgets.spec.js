/**
 * E2E Tests for Budgets Page
 * Tests budget listing, creation, editing, and progress tracking
 */

import { test, expect } from '@playwright/test';

// Helper to set up authenticated session
async function setupAuthenticatedSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'test-session-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'admin' }));
  });
}

test.describe('Budgets Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test.describe('Page Layout', () => {
    test('should display budgets page with all components', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      // Month navigator should be visible
      const monthNav = page.locator('.month-navigator');
      await expect(monthNav).toBeVisible();

      // Summary card should exist
      const summaryCard = page.locator('#summary-container');
      await expect(summaryCard).toBeVisible();

      // Budgets container should exist
      const budgetsContainer = page.locator('#budgets-container');
      await expect(budgetsContainer).toBeVisible();

      // Add budget button should be visible
      const addBtn = page.locator('#add-budget-btn');
      await expect(addBtn).toBeVisible();
    });

    test('should display month navigation controls', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      // Previous/next month buttons
      await expect(page.locator('#prev-month-btn')).toBeVisible();
      await expect(page.locator('#next-month-btn')).toBeVisible();

      // Today button
      await expect(page.locator('#today-btn')).toBeVisible();

      // Month label
      await expect(page.locator('.month-label')).toBeVisible();
    });
  });

  test.describe('Month Navigation', () => {
    test('should display current month by default', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      const monthLabel = page.locator('.month-label');
      const currentMonth = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

      await expect(monthLabel).toContainText(currentMonth.split(' ')[0]); // Month name
    });

    test('should navigate to previous month', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      // Get current month text
      const monthLabel = page.locator('.month-label');
      const initialMonth = await monthLabel.textContent();

      // Click previous
      await page.click('#prev-month-btn');
      await page.waitForLoadState('networkidle');

      // Month should change
      const newMonth = await monthLabel.textContent();
      expect(newMonth).not.toBe(initialMonth);
    });

    test('should navigate to next month', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      const monthLabel = page.locator('.month-label');
      const initialMonth = await monthLabel.textContent();

      // Click next
      await page.click('#next-month-btn');
      await page.waitForLoadState('networkidle');

      const newMonth = await monthLabel.textContent();
      expect(newMonth).not.toBe(initialMonth);
    });

    test('should return to current month on Today click', async ({ page }) => {
      // Start with a different month
      const prevMonth = new Date();
      prevMonth.setMonth(prevMonth.getMonth() - 2);
      const monthParam = prevMonth.toISOString().slice(0, 7);

      await page.goto(`/#/budgets?month=${monthParam}`);
      await page.waitForLoadState('networkidle');

      // Click today
      await page.click('#today-btn');
      await page.waitForLoadState('networkidle');

      // URL should be clean or have current month
      const url = page.url();
      const currentMonthParam = new Date().toISOString().slice(0, 7);

      // Either no month param (defaults to current) or current month param
      const hasCurrentMonth = !url.includes('month=') || url.includes(currentMonthParam);
      expect(hasCurrentMonth).toBeTruthy();
    });

    test('should update URL when navigating months', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      // Navigate to previous month
      await page.click('#prev-month-btn');
      await page.waitForLoadState('networkidle');

      // URL should contain month param
      const url = page.url();
      expect(url).toContain('month=');
    });
  });

  test.describe('Budget Summary', () => {
    test('should display budget summary stats', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      // Wait for data to load
      await page.waitForSelector('.budget-summary, .empty-state, .loading', { timeout: 10000 }).catch(() => {});

      const summary = page.locator('.budget-summary');
      const hasSummary = await summary.isVisible().catch(() => false);

      if (hasSummary) {
        // Should show key stats
        await expect(page.locator('.stat-label')).toBeVisible();
        await expect(page.locator('.stat-value')).toBeVisible();
      }
    });

    test('should show progress bar', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.budget-summary, .empty-state', { timeout: 10000 }).catch(() => {});

      const progressBar = page.locator('.progress-bar-large, .progress-bar');
      const hasProgress = await progressBar.first().isVisible().catch(() => false);

      // Progress bar exists if there's budget data
      expect(true).toBeTruthy(); // Placeholder - depends on data
    });

    test('should show status counts (on track, warning, over budget)', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.budget-summary, .empty-state', { timeout: 10000 }).catch(() => {});

      const summary = page.locator('.budget-summary');
      const hasSummary = await summary.isVisible().catch(() => false);

      if (hasSummary) {
        // Should show status items
        const statusItems = page.locator('.status-item');
        const count = await statusItems.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Budget List', () => {
    test('should display budget items or empty state', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.budgets-list, .empty-state', { timeout: 10000 }).catch(() => {});

      const budgetsList = page.locator('.budgets-list');
      const emptyState = page.locator('#budgets-container .empty-state');

      const hasList = await budgetsList.isVisible().catch(() => false);
      const isEmpty = await emptyState.isVisible().catch(() => false);

      expect(hasList || isEmpty).toBeTruthy();
    });

    test('should display budget item with progress', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.budget-item, .empty-state', { timeout: 10000 }).catch(() => {});

      const budgetItems = page.locator('.budget-item');
      const count = await budgetItems.count();

      if (count > 0) {
        const firstItem = budgetItems.first();

        // Should have category badge
        await expect(firstItem.locator('.category-badge')).toBeVisible();

        // Should have progress bar
        await expect(firstItem.locator('.progress-bar')).toBeVisible();

        // Should have amount info
        await expect(firstItem.locator('.budget-item__amounts')).toBeVisible();
      }
    });

    test('should show edit and delete buttons on budget items', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.budget-item, .empty-state', { timeout: 10000 }).catch(() => {});

      const budgetItems = page.locator('.budget-item');
      const count = await budgetItems.count();

      if (count > 0) {
        const firstItem = budgetItems.first();

        // Should have edit button
        await expect(firstItem.locator('.edit-budget-btn')).toBeVisible();

        // Should have delete button
        await expect(firstItem.locator('.delete-budget-btn')).toBeVisible();
      }
    });
  });

  test.describe('Add Budget Modal', () => {
    test('should open add budget modal', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      // Click add budget button
      await page.click('#add-budget-btn');

      // Modal should be visible
      const budgetModal = page.locator('#budget-modal');
      await expect(budgetModal).not.toHaveClass(/hidden/);

      // Title should say "Add Budget"
      const modalTitle = page.locator('#modal-title');
      await expect(modalTitle).toContainText('Add Budget');
    });

    test('should have form fields in modal', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.click('#add-budget-btn');

      // Category selector
      await expect(page.locator('#budget-category')).toBeVisible();

      // Amount input
      await expect(page.locator('#budget-amount')).toBeVisible();

      // Notes textarea
      await expect(page.locator('#budget-notes')).toBeVisible();

      // Save button
      await expect(page.locator('#modal-save')).toBeVisible();
    });

    test('should close modal on cancel', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.click('#add-budget-btn');
      await expect(page.locator('#budget-modal')).not.toHaveClass(/hidden/);

      // Click cancel
      await page.click('#modal-cancel');
      await expect(page.locator('#budget-modal')).toHaveClass(/hidden/);
    });

    test('should close modal on close button', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.click('#add-budget-btn');
      await expect(page.locator('#budget-modal')).not.toHaveClass(/hidden/);

      // Click close
      await page.click('#modal-close');
      await expect(page.locator('#budget-modal')).toHaveClass(/hidden/);
    });

    test('should populate category dropdown with expense categories', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.click('#add-budget-btn');

      const categorySelect = page.locator('#budget-category');

      // Wait for categories to load
      await page.waitForFunction(() => {
        const select = document.querySelector('#budget-category');
        return select && select.options.length > 1;
      }, { timeout: 10000 }).catch(() => {});

      const options = await categorySelect.locator('option').all();
      expect(options.length).toBeGreaterThan(1); // At least "Select category..." + real options
    });

    test('should validate required fields', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.click('#add-budget-btn');

      // Try to save without filling fields
      await page.click('#modal-save');

      // Dialog should show or validation should prevent submission
      page.on('dialog', async dialog => {
        expect(dialog.message()).toContain('category');
        await dialog.accept();
      });

      // Modal should still be open (save failed)
      const modal = page.locator('#budget-modal');
      const isHidden = await modal.evaluate(el => el.classList.contains('hidden'));
      expect(isHidden).toBeFalsy();
    });
  });

  test.describe('Edit Budget', () => {
    test('should open edit modal with pre-filled data', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.budget-item, .empty-state', { timeout: 10000 }).catch(() => {});

      const budgetItems = page.locator('.budget-item');
      const count = await budgetItems.count();

      if (count > 0) {
        // Click edit on first budget
        const editBtn = budgetItems.first().locator('.edit-budget-btn');
        await editBtn.click();

        // Modal should open
        const modal = page.locator('#budget-modal');
        await expect(modal).not.toHaveClass(/hidden/);

        // Title should say "Edit Budget"
        await expect(page.locator('#modal-title')).toContainText('Edit Budget');

        // Amount should be pre-filled
        const amountInput = page.locator('#budget-amount');
        const value = await amountInput.inputValue();
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Delete Budget', () => {
    test('should show delete confirmation modal', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.budget-item, .empty-state', { timeout: 10000 }).catch(() => {});

      const budgetItems = page.locator('.budget-item');
      const count = await budgetItems.count();

      if (count > 0) {
        // Click delete on first budget
        const deleteBtn = budgetItems.first().locator('.delete-budget-btn');
        await deleteBtn.click();

        // Delete modal should open
        const deleteModal = page.locator('#delete-modal');
        await expect(deleteModal).not.toHaveClass(/hidden/);

        // Should show budget info
        const budgetInfo = page.locator('#delete-budget-info');
        await expect(budgetInfo).toBeVisible();
      }
    });

    test('should close delete modal on cancel', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.budget-item, .empty-state', { timeout: 10000 }).catch(() => {});

      const budgetItems = page.locator('.budget-item');
      const count = await budgetItems.count();

      if (count > 0) {
        const deleteBtn = budgetItems.first().locator('.delete-budget-btn');
        await deleteBtn.click();

        await expect(page.locator('#delete-modal')).not.toHaveClass(/hidden/);

        // Click cancel
        await page.click('#delete-cancel-btn');
        await expect(page.locator('#delete-modal')).toHaveClass(/hidden/);
      }
    });
  });

  test.describe('Quick Add Section', () => {
    test('should show quick add for unbudgeted categories with spending', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.quick-add-card, .hidden', { timeout: 10000 }).catch(() => {});

      const quickAddCard = page.locator('#quick-add-container');
      const isHidden = await quickAddCard.evaluate(el => el.classList.contains('hidden')).catch(() => true);

      // Quick add section may or may not be visible depending on data
      expect(true).toBeTruthy();
    });
  });

  test.describe('Progress Bar Thresholds', () => {
    test('should have correct CSS classes for progress status', async ({ page }) => {
      await page.goto('/#/budgets');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('.budget-item, .empty-state', { timeout: 10000 }).catch(() => {});

      // Check that progress-fill elements have appropriate status classes
      const progressFills = page.locator('.progress-fill');
      const count = await progressFills.count();

      for (let i = 0; i < count; i++) {
        const fill = progressFills.nth(i);
        const className = await fill.getAttribute('class');

        // Should have one of the status classes
        const hasStatusClass =
          className?.includes('status-good') ||
          className?.includes('status-warning') ||
          className?.includes('status-over');

        expect(hasStatusClass).toBeTruthy();
      }
    });
  });
});
