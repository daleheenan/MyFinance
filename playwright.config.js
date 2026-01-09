import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true
  },
  webServer: {
    command: 'npm start',
    port: 3000,
    reuseExistingServer: true
  }
});
