/**
 * authedTest.js
 * ---------------------------------------------------------------------------
 * Extends the base test (fixtures/baseTest.js) with an overridden, worker-scoped
 * `storageState` so every test that imports from here starts ALREADY AUTHENTICATED
 * as admin. The UI login runs once per worker (fast, less flaky) and the result
 * is reused for all tests in that worker.
 *
 * The Login module (tests/login.spec.js) intentionally imports from baseTest (not
 * this file) so it keeps running logged-out.
 *
 * If the (inferred) login locators need adjustment, the worker login fails softly:
 * it saves a logged-out state and warns, so individual tests fail with clear
 * assertions instead of the whole worker erroring in setup.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const base = require('./baseTest'); // { test, expect }
const { LoginPage } = require('../pages/LoginPage');
const { Logger } = require('../utils/logger');
const { credentials } = require('../utils/testData');

const AUTH_DIR = path.resolve(__dirname, '..', '.auth');

const test = base.test.extend({
  // Worker-scoped: log in once per worker and cache the resulting storage state.
  workerStorageState: [
    async ({ browser }, use, workerInfo) => {
      if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
      const file = path.join(AUTH_DIR, `admin-w${workerInfo.workerIndex}.json`);

      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        const lp = new LoginPage(page, new Logger('Auth', `worker ${workerInfo.workerIndex} login`));
        await lp.open();
        await lp.login({
          companyCode: credentials.companyCode,
          username: credentials.admin.username,
          password: credentials.admin.password,
        });
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
        await context.storageState({ path: file });
      } catch (err) {
        // Soft-fail: keep the worker alive, run tests logged-out.
        // eslint-disable-next-line no-console
        console.log(
          `\x1b[33m⚠ Worker auth login failed: ${err.message}\n` +
            `  Confirm the Login locators (see pages/LoginPage.js) — tests will run logged-out until then.\x1b[0m`
        );
        fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
      } finally {
        await context.close();
      }

      await use(file);
    },
    { scope: 'worker' },
  ],

  // Override the built-in (test-scoped) storageState to delegate to the cached
  // worker state, so every test starts authenticated without re-logging-in.
  storageState: async ({ workerStorageState }, use) => {
    await use(workerStorageState);
  },
});

module.exports = { test, expect: base.expect };
