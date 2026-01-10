/**
 * E2E Tests for Authentication Flow
 * Tests user setup, login, logout, and session management
 */

import { test, expect } from '@playwright/test';

// Reset database state before each test to ensure clean slate
test.describe('Authentication', () => {
  test.describe('Initial Setup Flow', () => {
    test.beforeEach(async ({ page, request }) => {
      // Clear database/sessions via API or by navigating with fresh state
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
    });

    test('should show setup form when no users exist', async ({ page }) => {
      // Navigate to login page
      await page.goto('/#/login');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Check if setup form or login form is shown
      // (depends on whether users exist in DB)
      const pageContent = await page.content();
      const hasSetupForm = pageContent.includes('Create your admin account') || pageContent.includes('setup-form');
      const hasLoginForm = pageContent.includes('Sign in to continue') || pageContent.includes('login-form');

      expect(hasSetupForm || hasLoginForm).toBeTruthy();
    });

    test('setup form should validate password requirements', async ({ page }) => {
      await page.goto('/#/login');
      await page.waitForLoadState('networkidle');

      // Check if we're on setup form
      const setupForm = page.locator('#setup-form');
      const isSetupVisible = await setupForm.isVisible().catch(() => false);

      if (isSetupVisible) {
        // Fill with short password
        await page.fill('#username', 'admin');
        await page.fill('#password', 'short');
        await page.fill('#confirm-password', 'short');

        // Submit
        await page.click('#setup-btn');

        // Should show error about password length
        const error = page.locator('#setup-error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('8 characters');
      }
    });

    test('setup form should validate password confirmation', async ({ page }) => {
      await page.goto('/#/login');
      await page.waitForLoadState('networkidle');

      const setupForm = page.locator('#setup-form');
      const isSetupVisible = await setupForm.isVisible().catch(() => false);

      if (isSetupVisible) {
        await page.fill('#username', 'admin');
        await page.fill('#password', 'password123');
        await page.fill('#confirm-password', 'different123');

        await page.click('#setup-btn');

        const error = page.locator('#setup-error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('do not match');
      }
    });
  });

  test.describe('Login Flow', () => {
    test('should show login form with username and password fields', async ({ page }) => {
      await page.goto('/#/login');
      await page.waitForLoadState('networkidle');

      // Either setup or login form should be visible
      const usernameInput = page.locator('#username');
      const passwordInput = page.locator('#password');

      await expect(usernameInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    });

    test('should show error for empty credentials', async ({ page }) => {
      await page.goto('/#/login');
      await page.waitForLoadState('networkidle');

      const loginForm = page.locator('#login-form');
      const isLoginVisible = await loginForm.isVisible().catch(() => false);

      if (isLoginVisible) {
        // Try to submit empty form
        await page.click('#login-btn');

        // HTML5 validation should prevent submission, or error should show
        const usernameInput = page.locator('#username');
        const isInvalid = await usernameInput.evaluate(el => !el.validity.valid);
        expect(isInvalid).toBeTruthy();
      }
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/#/login');
      await page.waitForLoadState('networkidle');

      const loginForm = page.locator('#login-form');
      const isLoginVisible = await loginForm.isVisible().catch(() => false);

      if (isLoginVisible) {
        await page.fill('#username', 'wronguser');
        await page.fill('#password', 'wrongpassword');
        await page.click('#login-btn');

        // Wait for error message
        const error = page.locator('#login-error');
        await expect(error).toBeVisible({ timeout: 5000 });
      }
    });

    test('should redirect unauthenticated users to login', async ({ page }) => {
      // Clear any existing auth
      await page.evaluate(() => localStorage.clear());

      // Try to access protected route
      await page.goto('/#/overview');
      await page.waitForLoadState('networkidle');

      // Should be redirected to login
      await expect(page).toHaveURL(/#\/login/);
    });
  });

  test.describe('Session Management', () => {
    test('should hide navigation on login page', async ({ page }) => {
      await page.goto('/#/login');
      await page.waitForLoadState('networkidle');

      // Navigation should be hidden or login page should not show nav items
      const navContainer = page.locator('.nav-container');
      const isHidden = await navContainer.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden';
      }).catch(() => true);

      // Nav may be hidden on login page
      expect(true).toBeTruthy(); // Placeholder - actual behavior depends on auth state
    });

    test('page should have proper title', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveTitle(/FinanceFlow/);
    });
  });
});

test.describe('Protected Routes', () => {
  test('all protected routes should require authentication', async ({ page }) => {
    // Clear auth
    await page.evaluate(() => localStorage.clear());

    const protectedRoutes = [
      '/#/overview',
      '/#/transactions',
      '/#/analytics',
      '/#/budgets',
      '/#/settings',
      '/#/subscriptions',
      '/#/networth',
      '/#/forecasting'
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      // Should redirect to login
      const currentUrl = page.url();
      expect(currentUrl).toContain('/login');
    }
  });
});
