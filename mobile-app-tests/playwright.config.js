'use strict';

/**
 * MOBILE automation config — the self-contained home for the Android + web attendance E2E.
 *
 *   npm run hrms:mobile                                            (preferred)
 *   npx playwright test -c mobile-app-tests/playwright.config.js   (direct)
 *
 * Separate from hrms/playwright.config.js so the mobile specs live in their own folder, but it
 * REUSES the HRMS web login (global-setup writes hrms/.auth/state.json) and env (Z:\HRMS\.env),
 * because the web half (create employee, verify attendance) signs in as the same admin.
 *
 * Language/tooling: pure JavaScript (Node). Playwright drives the web; the emulator is driven via
 * adb + uiautomator through mobile-app-tests/panel/emu.js (see e2e/mobileAttendance.js). No Python.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { defineConfig, devices } = require('@playwright/test');
const HRMS = path.join(__dirname, '..', 'hrms');

module.exports = defineConfig({
  testDir:  path.join(__dirname, 'e2e'),
  testMatch: '**/*.spec.js',

  timeout:  360_000,          // a run creates an employee AND drives the phone — give it room
  expect: { timeout: 30_000 },
  workers:  1,                // one emulator → strictly serial
  retries:  0,                // never blind-retry (a retry would create a second employee)

  reporter: [['list']],
  globalSetup: path.join(HRMS, 'fixtures', 'global-setup.js'),   // reuse the HRMS admin login

  use: {
    headless: process.env.HEADED ? false : true,
    baseURL:  process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in',
    storageState: path.join(HRMS, '.auth', 'state.json'),         // admin session from global-setup
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  outputDir: path.join(__dirname, '..', 'test-results', 'mobile'),
});
