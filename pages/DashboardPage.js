/**
 * DashboardPage.js
 * ---------------------------------------------------------------------------
 * Page Object for the authenticated landing page ("Home dashboard" per the doc).
 * Used to verify a successful login and to perform logout.
 *
 * The document does not describe the dashboard DOM, so the "logged-in" signal is
 * inferred (URL no longer on /login + a persistent app chrome element). Refine
 * `expectLoaded()` once the real dashboard markers are known.
 */

'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('./BasePage');

class DashboardPage extends BasePage {
  constructor(page, logger) {
    super(page, logger);

    // TODO: confirm real dashboard markers. These are reasonable defaults:
    // a user/account menu and a top navigation/header that only exist post-login.
    this.userMenu = page
      .getByRole('button', { name: /account|profile|admin|logout|sign out/i })
      .or(page.locator('[class*="user"], [class*="avatar"], [class*="profile"]').first());

    this.logoutControl = page.getByRole('menuitem', { name: /logout|sign out/i })
      .or(page.getByRole('link', { name: /logout|sign out/i }))
      .or(page.getByText(/logout|sign out/i));
  }

  /**
   * Assert we are authenticated. Primary signal: URL left /login. Secondary
   * (best-effort): an app-chrome element is visible.
   */
  async expectLoaded() {
    await expect(this.page, 'URL should no longer be the login page').not.toHaveURL(/\/login/i);
    // Best-effort secondary check; do not hard-fail if the marker guess is off.
    const chromeVisible = await this.isVisible(this.userMenu, 5_000);
    if (!chromeVisible) {
      this.logger.warn(
        'Dashboard chrome marker not found with the inferred locator — verify DashboardPage.userMenu against the live DOM.'
      );
    }
  }

  /** Reusable logout flow (best-effort until dashboard DOM is confirmed). */
  async logout() {
    await this.click(this.userMenu, 'User / account menu');
    await this.click(this.logoutControl, 'Logout control');
    await this.waitForPageReady();
  }
}

module.exports = { DashboardPage };
