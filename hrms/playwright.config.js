'use strict';

require('dotenv').config();

const path = require('path');
const { defineConfig, devices } = require('@playwright/test');
const { HEADED, LAUNCH_ARGS, VIEWPORT } = require('./fixtures/window');

// Evidence: failures always keep a screen recording, screenshots and a trace, collected per run
// into reports/hrms-evidence/<run time>/index.html by the evidence reporter.
// HRMS_EVIDENCE=all records and keeps EVERY step (a full evidence run of a module).
const EVIDENCE_ALL = process.env.HRMS_EVIDENCE === 'all';

/**
 * HRMS suite config — run with:  npx playwright test -c hrms/playwright.config.js
 * Own config so the root erp/ suites stay untouched.
 */
module.exports = defineConfig({
  // Generous global timeouts — the HRMS Blazor tenant can be slow to render/respond,
  // so give every navigation/action/assertion room before it is treated as a failure.
  timeout:            210_000,
  expect: { timeout:  30_000 },

  testDir:  path.join(__dirname, 'tests'),
  testMatch: '**/*.spec.js',

  // Smoke specs are read-only → light parallelism is safe on the HRMS tenant.
  workers:  Number(process.env.HRMS_WORKERS || 2),
  retries:  1,

  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, '..', 'reports', 'hrms-html'), open: 'never' }],
    ['json', { outputFile: path.join(__dirname, '..', 'reports', 'hrms-results.json') }],
    [path.join(__dirname, 'reporters', 'evidenceReporter.js'), { outputDir: path.join(__dirname, '..', 'reports', 'hrms-evidence') }],
  ],

  globalSetup: path.join(__dirname, 'fixtures', 'global-setup.js'),

  use: {
    headless:          process.env.HEADED ? false : true,
    // Pause before every click/keystroke so a headed run is watchable. HRMS_SLOWMO=0 for full speed.
    slowMo:            Number(process.env.HRMS_SLOWMO ?? (process.env.HEADED ? 200 : 0)),
    channel:           process.env.CHANNEL || undefined,
    // Headed: maximized at the top-left of the primary screen, page fills the window (fixtures/window.js).
    viewport:          VIEWPORT,
    launchOptions:     { args: LAUNCH_ARGS },
    actionTimeout:     30_000,
    navigationTimeout: 90_000,
    screenshot:        EVIDENCE_ALL ? 'on' : 'only-on-failure',
    video:             EVIDENCE_ALL ? 'on' : 'retain-on-failure',
    trace:             EVIDENCE_ALL ? 'on' : 'retain-on-failure',

    baseURL: process.env.HRMS_BASE_URL || 'https://hrms-erp.progbiz.in',
    // One login for the whole run (created by global-setup).
    storageState: path.join(__dirname, '.auth', 'state.json'),
  },

  projects: [
    // Headed: no device preset — its fixed viewport / scale factor would fight the maximized window.
    { name: 'chromium', use: HEADED ? { viewport: null, launchOptions: { args: LAUNCH_ARGS } } : { ...devices['Desktop Chrome'], viewport: VIEWPORT } },
  ],

  outputDir: path.join(__dirname, '..', 'test-results', 'hrms'),
});
