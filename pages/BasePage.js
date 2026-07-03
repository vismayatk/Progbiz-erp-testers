/**
 * BasePage.js
 * ---------------------------------------------------------------------------
 * Parent of every Page Object. Holds the Playwright `page`, the per-test
 * `logger`, and thin, reusable wrappers around common interactions with a
 * consistent explicit-wait strategy (NO hard waits / waitForTimeout).
 */

'use strict';

const { expect } = require('@playwright/test');

class BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('../utils/logger').Logger} logger
   */
  constructor(page, logger) {
    this.page = page;
    this.logger = logger;
  }

  /* --------------------------- navigation --------------------------- */

  /** Navigate to a path (relative to baseURL) and wait for the DOM to settle. */
  async goto(pathOrUrl) {
    await this.page.goto(pathOrUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForPageReady();
  }

  /** Wait until the network is idle (explicit wait, never a fixed sleep). */
  async waitForPageReady() {
    await this.page.waitForLoadState('domcontentloaded');
    // networkidle is best-effort; guard so a busy socket does not hang the test.
    await this.page
      .waitForLoadState('networkidle', { timeout: 15_000 })
      .catch(() => { /* SPA keep-alive sockets can prevent idle; safe to ignore */ });
  }

  /* --------------------------- interactions ------------------------- */

  /** Wait for a locator to be visible, then click it. */
  async click(locator, name = 'element') {
    await expect(locator, `${name} should be visible before click`).toBeVisible();
    await locator.click();
  }

  /** Clear then type into a field (waits for visibility first). */
  async fill(locator, value, name = 'field') {
    await expect(locator, `${name} should be visible before typing`).toBeVisible();
    await locator.fill(value);
  }

  /** Read the trimmed inner text of a locator. */
  async textOf(locator) {
    return (await locator.innerText()).trim();
  }

  /** Returns true if the locator is visible within `timeout` ms (no throw). */
  async isVisible(locator, timeout = 5_000) {
    return locator
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /* ----------------------------- misc ------------------------------- */

  /** Save a screenshot to an absolute path and attach it to the report. */
  async screenshot(absPath, attachName = 'screenshot') {
    await this.page.screenshot({ path: absPath, fullPage: true });
    return absPath;
  }
}

module.exports = { BasePage };
