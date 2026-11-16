'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');

/**
 * /exit-dashboard — Exit Dashboard (SRS §11, FR-39). Scoped tiles that deep-link to filtered lists,
 * plus "Top Exit Reasons" and "Exits by Type" tables. "Reports" and "Refresh" actions.
 */
class ExitDashboardPage extends BasePage {
  constructor(page) {
    super(page, 'exit-dashboard');
    this.reportsBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*Reports\s*$/i }).first();
    this.refreshBtn = this.main.locator('button, a.btn').filter({ hasText: /Refresh/i }).first();
  }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Exit Dashboard heading').toContainText(/Exit Dashboard/i, { timeout: 30000 });
  }

  /** The tile labels + numbers shown (diagnostic coverage of the dashboard). */
  async tiles() {
    const cards = this.main.locator('.card, [class*="tile" i], [class*="stat" i]');
    const n = Math.min(await cards.count().catch(() => 0), 20);
    const out = [];
    for (let i = 0; i < n; i++) { const t = (await cards.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); if (t) out.push(t.slice(0, 60)); }
    return out;
  }

  async refresh() { if (await this.refreshBtn.count()) { await this.refreshBtn.click(); await this.page.waitForTimeout(1200); } }

  /** Click a tile and assert it deep-links to the filtered resignations list. */
  async tileDeepLinks() {
    const tile = this.main.locator('a[href*="/resignations"], .card a, [class*="tile" i] a').first();
    if (!(await tile.count())) return false;
    await tile.click();
    await this.page.waitForTimeout(1500);
    return /\/resignations/i.test(this.page.url());
  }
}

module.exports = { ExitDashboardPage };
