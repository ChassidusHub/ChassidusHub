import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests: the page budgets, accessibility and a smoke test of every
 * page in e2e/pages.ts, on a phone and on a desktop. They run against the
 * built site on Node (`npm run build` first), or against a deployed site when
 * BASE_URL is set (for example https://new.chassidushub.org). CHROMIUM_PATH
 * points at a Chromium already on the machine instead of Playwright's own.
 */
const baseURL = process.env.BASE_URL ?? 'http://localhost:3001';
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL, launchOptions: { executablePath } },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, launchOptions: { executablePath } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions: { executablePath } } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run start', url: baseURL, reuseExistingServer: !process.env.CI, env: { PORT: '3001' } },
});
