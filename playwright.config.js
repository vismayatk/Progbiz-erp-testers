'use strict';

require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // ── Global timeouts ───────────────────────────────────────────────────────
  timeout:             90_000,   // per-test max
  expect: { timeout:  15_000 }, // assertion timeout

  // ── Test discovery ────────────────────────────────────────────────────────
  testDir:  './tests',
  testMatch: '**/*.spec.js',

  // ── Parallelism ───────────────────────────────────────────────────────────
  workers:  1,   // run sequentially (CRM state is shared)
  retries:  1,   // one retry on failure

  // ── Reporters ─────────────────────────────────────────────────────────────
  reporter: [
    ['list'],                                       // console output
    ['html', { outputFolder: 'reports/html', open: 'never' }],  // HTML report
    ['json', { outputFile: 'reports/results.json' }],
  ],

  // ── Default browser options ───────────────────────────────────────────────
  use: {
    headless:          false,
    slowMo:            200,
    viewport:          { width: 1280, height: 800 },
    actionTimeout:     20_000,
    navigationTimeout: 30_000,
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    trace:             'retain-on-failure',

    // Base URL — override with BASE_URL env var
    baseURL: process.env.BASE_URL || 'https://erptest.progbiz.in',
  },

  // ── Projects (browsers) ───────────────────────────────────────────────────
  projects: [
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
  ],

  // ── Artifacts output dir ──────────────────────────────────────────────────
  outputDir: 'test-results',
});
