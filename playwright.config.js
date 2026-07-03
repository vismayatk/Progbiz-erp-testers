// @ts-check
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config();

/**
 * Central Playwright configuration.
 *
 * Cross-browser projects are provided so the "Browser Compatibility" test cases
 * (e.g. TC_LOGIN_41..43) can run on Chrome / Edge / Firefox without duplicating specs:
 *   npm run test:chromium | test:firefox | test:chrome | test:edge
 *
 * Base URL, credentials and timeouts are read from environment variables (see .env.example)
 * so no secrets are hard-coded in the scripts.
 */
module.exports = defineConfig({
  testDir: './tests',

  // Fail the build on CI if test.only is accidentally committed.
  forbidOnly: !!process.env.CI,

  // Retries help absorb transient network flakiness against the live ERP.
  retries: process.env.CI ? 2 : 0,

  // Undefined lets Playwright pick an optimal worker count locally; single worker on CI.
  workers: process.env.CI ? 1 : undefined,

  // Per-test timeout and assertion timeout.
  timeout: Number(process.env.TEST_TIMEOUT || 60_000),
  expect: {
    timeout: Number(process.env.EXPECT_TIMEOUT || 10_000),
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  // Artifacts (traces/videos) land here; custom screenshots go to ./screenshots.
  outputDir: 'test-results',

  use: {
    baseURL: process.env.BASE_URL || 'https://erp.progbiz.io',
    headless: process.env.HEADLESS ? process.env.HEADLESS === 'true' : true,

    actionTimeout: Number(process.env.ACTION_TIMEOUT || 15_000),
    navigationTimeout: Number(process.env.NAV_TIMEOUT || 30_000),

    // Built-in capture; the framework additionally saves named screenshots to ./screenshots.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',

    // ERP login uses HTTPS with a valid cert; keep strict unless the env says otherwise.
    ignoreHTTPSErrors: process.env.IGNORE_HTTPS === 'true',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    // Real branded browsers for the compatibility test cases.
    // Requires the browsers installed locally + `npx playwright install msedge chrome`.
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],
});
