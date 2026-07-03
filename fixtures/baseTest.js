/**
 * baseTest.js
 * ---------------------------------------------------------------------------
 * Custom Playwright test fixture used by every spec (`require('../fixtures/baseTest')`).
 *
 * It provides ready-made Page Objects and a per-test `logger`, and it centralises:
 *   - the TEST STARTED banner (on setup)
 *   - the TEST PASSED / TEST FAILED banner + execution time (on teardown)
 *   - a meaningfully-named failure screenshot saved to ./screenshots and
 *     attached to the HTML report
 *
 * Specs therefore stay focused on steps + assertions only.
 */

'use strict';

const base = require('@playwright/test');
const { Logger } = require('../utils/logger');
const helper = require('../utils/helper');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardPage } = require('../pages/DashboardPage');
const { CommonPage } = require('../pages/CommonPage');

/** Derive a friendly module name from the top-level describe title. */
function deriveModule(testInfo) {
  const top = (testInfo.titlePath && testInfo.titlePath[0]) || 'ERP';
  return top.replace(/\s*module$/i, '').trim() || 'ERP';
}

const test = base.test.extend({
  // Per-test logger; prints the TEST STARTED banner as soon as it is created.
  logger: async ({}, use, testInfo) => {
    const logger = new Logger(deriveModule(testInfo), testInfo.title);
    logger.start();
    await use(logger);
  },

  loginPage: async ({ page, logger }, use) => {
    await use(new LoginPage(page, logger));
  },
  dashboardPage: async ({ page, logger }, use) => {
    await use(new DashboardPage(page, logger));
  },
  commonPage: async ({ page, logger }, use) => {
    await use(new CommonPage(page, logger));
  },
});

/**
 * After every test: emit the closing banner. On failure, capture a named
 * screenshot and populate the failure banner with step/expected/actual/error.
 */
test.afterEach(async ({ page, logger }, testInfo) => {
  if (testInfo.status === 'skipped') return;

  const seconds = helper.msToSeconds(testInfo.duration);
  const failed = testInfo.status !== testInfo.expectedStatus;

  if (!failed) {
    logger.pass(seconds);
    return;
  }

  // --- failure path ---
  let shotPath = '(not captured)';
  try {
    if (page && !page.isClosed()) {
      shotPath = helper.screenshotPath(testInfo.title, 'failed');
      await page.screenshot({ path: shotPath, fullPage: true });
      await testInfo.attach('failure-screenshot', {
        path: shotPath,
        contentType: 'image/png',
      });
    }
  } catch {
    // Never let screenshot capture mask the real failure.
  }

  const info = helper.describeError(testInfo.error);
  logger.failure({
    stepFailed: logger.lastStep,
    expected: info.expected,
    actual: info.actual,
    screenshot: shotPath,
    error: info.message,
  });
});

module.exports = { test, expect: base.expect };
