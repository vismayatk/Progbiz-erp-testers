'use strict';

require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // ── Global timeouts ───────────────────────────────────────────────────────
  timeout:            150_000,   // per-test max (site can be slow under load)
  expect: { timeout:  20_000 }, // assertion timeout

  // ── Test discovery ────────────────────────────────────────────────────────
  // Specs live under erp/<module>/tests/ (erp/crm, erp/task-management).
  testDir:  './erp',
  testMatch: '**/tests/**/*.spec.js',

  // ── Parallelism ───────────────────────────────────────────────────────────
  // Default is sequential (CRM state is shared between tests). Parallelism is
  // per-FILE, so ERP_WORKERS=2..3 is usually safe — files are largely
  // independent — but the DEV tenant slows down under load; beyond 3 workers
  // expect flaky timeouts rather than speed.
  workers:  Number(process.env.ERP_WORKERS || 1),
  retries:  1,   // one retry on failure

  // ── Reporters ─────────────────────────────────────────────────────────────
  reporter: [
    ['list'],                                       // console output
    ['html', { outputFolder: 'reports/html', open: 'never' }],  // HTML report
    ['json', { outputFile: 'reports/results.json' }],
  ],

  // ── Default browser options ───────────────────────────────────────────────
  use: {
    // Headless by default (no browser windows pop up; faster). Run headed with
    // `npm run test:headed` or HEADED=1 when you want to watch.
    headless:          process.env.HEADED ? false : true,
    slowMo:            process.env.HEADED ? 200 : 0,
    // Use a real browser channel (e.g. installed Google Chrome) via CHANNEL=chrome.
    channel:           process.env.CHANNEL || undefined,
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
