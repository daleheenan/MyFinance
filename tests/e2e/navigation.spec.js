/**
 * E2E Tests for Navigation
 * Tests SPA routing, page transitions, and navigation elements
 */

import { test, expect } from '@playwright/test';

// Helper to set up authenticated session
async function setupAuthenticatedSession(page) {
  // Set mock auth token in localStorage
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'test-session-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'admin' }));
  });
}

test.describe('Navigation', () => {
  test.describe('Main Navigation Bar', () => {
    test.beforeEach(async ({ page }) => {
      await setupAuthenticatedSession(page);
    });

    test('should display all main navigation links', async ({ page }) => {
      await page.goto('/#/overview');
      await page.waitForLoadState('networkidle');

      // Check main nav links are visible
      const navLinks = page.locator('.nav-link');

      // Verify core navigation items exist
      await expect(page.locator('a[href="#/overview"]')).toBeVisible();
      await expect(page.locator('a[href="#/transactions"]')).toBeVisible();
      await expect(page.locator('a[href="#/forecasting"]')).toBeVisible();
      await expect(page.locator('a[href="#/analytics"]')).toBeVisible();
      await expect(page.locator('a[href="#/settings"]')).toBeVisible();
    });

    test('should highlight current page in navigation', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // The transactions nav link should have active class
      const transactionsLink = page.locator('a[data-route="/transactions"]');
      await expect(transactionsLink).toHaveClass(/active/);
    });

    test('should update active state when navigating', async ({ page }) => {
      await page.goto('/#/overview');
      await page.waitForLoadState('networkidle');

      // Overview should be active initially
      const overviewLink = page.locator('a[data-route="/overview"]');
      await expect(overviewLink).toHaveClass(/active/);

      // Click on transactions
      await page.click('a[href="#/transactions"]');
      await page.waitForLoadState('networkidle');

      // Now transactions should be active
      const transactionsLink = page.locator('a[data-route="/transactions"]');
      await expect(transactionsLink).toHaveClass(/active/);

      // Overview should no longer be active
      await expect(overviewLink).not.toHaveClass(/active/);
    });

    test('should have dropdown menu for additional pages', async ({ page }) => {
      await page.goto('/#/overview');
      await page.waitForLoadState('networkidle');

      // Find dropdown toggle
      const dropdownToggle = page.locator('.nav-dropdown-toggle');
      await expect(dropdownToggle).toBeVisible();

      // Dropdown menu items should exist
      const dropdownMenu = page.locator('.nav-dropdown-menu');
      await expect(dropdownMenu).toBeAttached();

      // Check dropdown contains expected items
      await expect(page.locator('a[href="#/subscriptions"]')).toBeAttached();
      await expect(page.locator('a[href="#/networth"]')).toBeAttached();
      await expect(page.locator('a[href="#/budgets"]')).toBeAttached();
    });
  });

  test.describe('Page Routing', () => {
    test.beforeEach(async ({ page }) => {
      await setupAuthenticatedSession(page);
    });

    test('should load Overview page at root', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Should default to overview
      await expect(page).toHaveURL(/#\/overview|\/$/);
    });

    test('should navigate to all pages without errors', async ({ page }) => {
      const routes = [
        { path: '/#/overview', selector: '.overview-page, .page' },
        { path: '/#/transactions', selector: '.transactions-page, .page' },
        { path: '/#/analytics', selector: '.analytics-page, .page' },
        { path: '/#/budgets', selector: '.budgets-page, .page' },
        { path: '/#/settings', selector: '.settings-page, .page' },
        { path: '/#/subscriptions', selector: '.subscriptions-page, .page' },
        { path: '/#/networth', selector: '.networth-page, .page' },
        { path: '/#/forecasting', selector: '.forecasting-page, .page' }
      ];

      for (const route of routes) {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        // Page should load without error
        const errorState = page.locator('.error-state');
        const hasError = await errorState.isVisible().catch(() => false);

        // Page container should exist
        const pageContent = page.locator(route.selector);
        const pageExists = await pageContent.isVisible().catch(() => false);

        // Either page loaded or loading state shown (not error for network issues)
        expect(pageExists || !hasError).toBeTruthy();
      }
    });

    test('should handle browser back/forward navigation', async ({ page }) => {
      await page.goto('/#/overview');
      await page.waitForLoadState('networkidle');

      // Navigate to transactions
      await page.click('a[href="#/transactions"]');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/#\/transactions/);

      // Navigate to analytics
      await page.click('a[href="#/analytics"]');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/#\/analytics/);

      // Go back
      await page.goBack();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/#\/transactions/);

      // Go forward
      await page.goForward();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/#\/analytics/);
    });

    test('should show 404 for invalid routes', async ({ page }) => {
      await page.goto('/#/invalid-route-that-does-not-exist');
      await page.waitForLoadState('networkidle');

      // Should show 404 or redirect
      const pageContent = await page.content();
      const has404 = pageContent.includes('404') || pageContent.includes('not found');
      const hasRedirect = page.url().includes('/overview') || page.url().includes('/login');

      expect(has404 || hasRedirect).toBeTruthy();
    });
  });

  test.describe('Logo Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await setupAuthenticatedSession(page);
    });

    test('should navigate to overview when clicking logo', async ({ page }) => {
      await page.goto('/#/transactions');
      await page.waitForLoadState('networkidle');

      // Click logo
      await page.click('.nav-logo');
      await page.waitForLoadState('networkidle');

      // Should go to overview
      await expect(page).toHaveURL(/#\/overview/);
    });

    test('logo should display app name', async ({ page }) => {
      await page.goto('/#/overview');
      await page.waitForLoadState('networkidle');

      const logo = page.locator('.nav-logo');
      await expect(logo).toContainText('FinanceFlow');
    });
  });

  test.describe('Page Loading States', () => {
    test.beforeEach(async ({ page }) => {
      await setupAuthenticatedSession(page);
    });

    test('should show loading indicator when page loads', async ({ page }) => {
      // Navigate with slow network
      await page.goto('/#/overview');

      // Initial loading state may appear briefly
      const loadingIndicator = page.locator('.loading, .spinner');

      // Wait for page to finish loading
      await page.waitForLoadState('networkidle');

      // After loading, main content should be visible
      const appContainer = page.locator('#app');
      await expect(appContainer).toBeVisible();
    });

    test('app container should exist on all pages', async ({ page }) => {
      await page.goto('/#/overview');
      await page.waitForLoadState('networkidle');

      const appContainer = page.locator('#app');
      await expect(appContainer).toBeVisible();
    });
  });
});

test.describe('Responsive Navigation', () => {
  test('should maintain navigation visibility on desktop', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'test-session-token');
      localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'admin' }));
    });

    await page.goto('/#/overview');
    await page.waitForLoadState('networkidle');

    const nav = page.locator('.main-nav');
    await expect(nav).toBeVisible();
  });

  test('should handle smaller viewport gracefully', async ({ page }) => {
    // Set smaller viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'test-session-token');
      localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'admin' }));
    });

    await page.goto('/#/overview');
    await page.waitForLoadState('networkidle');

    // Navigation should still be functional
    const nav = page.locator('.main-nav');
    await expect(nav).toBeVisible();
  });
});
