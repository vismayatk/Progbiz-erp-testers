'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');

/**
 * /exit-watch — Exit Watch (SRS §6 FR-36). Tabs: Approaching Retirement, Absconding Watch,
 * Contract Expiry, Internship Ending. A window select (6 / 12 / 24 months) and "Initiate
 * Retirement" which pre-fills Initiate Exit. Read-only coverage + tab switching here.
 */
class ExitWatchPage extends BasePage {
  constructor(page) {
    super(page, 'exit-watch');
  }

  tabBtn(name) { return this.main.locator('button, a, [role="tab"], .nav-link').filter({ hasText: new RegExp(name, 'i') }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Exit Watch heading').toContainText(/Exit Watch/i, { timeout: 30000 });
  }

  /** Switch to a watchlist tab and return its visible row count. */
  async openTab(name) {
    const t = this.tabBtn(name);
    await expect(t, `the "${name}" tab`).toBeVisible({ timeout: 15000 });
    await t.click();
    await this.page.waitForTimeout(1300);
    return this.gridRows.filter({ hasText: /\S/ }).count();
  }

  /** The window selector (6/12/24 months) applies and the grid re-renders. */
  async setWindow(label) {
    const sel = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /months/i }) }).first();
    if (await sel.count()) { await sel.selectOption({ label }).catch(() => {}); await this.page.waitForTimeout(1200); }
  }
}

module.exports = { ExitWatchPage };
