'use strict';

require('dotenv').config();

const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

/**
 * HRMS suite config — run with:  npx playwright test -c hrms/playwright.config.js
 * Own config so the root erp/ suites stay untouched.
 */
module.exports = defineConfig({
  timeout:            150_000,
  expect: { timeout:  20_000 },

  testDir:  path.join(__dirname, 'tests'),
  testMatch: '**/*.spec.js',

  // Smoke specs are read-only → light parallelism is safe on the HRMS tenant.
  workers:  Number(process.env.HRMS_WORKERS || 2),
  retries:  1,

  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, '..', 'reports', 'hrms-html'), open: 'never' }],
    ['json', { outputFile: path.join(__dirname, '..', 'reports', 'hrms-results.json') }],
  ],

  globalSetup: path.join(__dirname, 'fixtures', 'global-setup.js'),

  use: {
    headless:          process.env.HEADED ? false : true,
    slowMo:            process.env.HEADED ? 200 : 0,
    channel:           process.env.CHANNEL || undefined,
    viewport:          { width: 1600, height: 900 },
    actionTimeout:     20_000,
    navigationTimeout: 45_000,
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    trace:             'retain-on-failure',

    baseURL: process.env.HRMS_BASE_URL || 'https://hrms-erp.progbiz.in',
    // One login for the whole run (created by global-setup).
    storageState: path.join(__dirname, '.auth', 'state.json'),
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } },
  ],

  outputDir: path.join(__dirname, '..', 'test-results', 'hrms'),
});
