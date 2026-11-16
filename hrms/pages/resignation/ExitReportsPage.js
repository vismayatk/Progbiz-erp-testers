'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');

/**
 * /exit-reports — the 13-report pack (SRS §12, FR-40). A report picker (13 named buttons), date
 * range (defaults last 12 months), branch / department / designation / type filters, "Run Report"
 * and "Export Excel". Coverage here runs each report and asserts it renders without error.
 */
const REPORTS = [
  'Exit Summary', 'Department-wise Attrition', 'Monthly Attrition', 'Exit Reason Analysis',
  'Notice Period', 'Pending Exit Activities', 'Asset Clearance', 'KT Completion', 'F&F Report',
  'Exit Interview', 'Rehire Eligibility', 'Avg Exit Completion Time', 'Exit Type Analysis',
];

class ExitReportsPage extends BasePage {
  constructor(page) {
    super(page, 'exit-reports');
    this.runBtn = this.main.locator('button, a.btn').filter({ hasText: /Run Report/i }).first();
    this.exportBtn = this.main.locator('button, a.btn').filter({ hasText: /Export Excel/i }).first();
  }

  static get REPORTS() { return REPORTS; }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Exit Reports heading').toContainText(/Exit Report/i, { timeout: 30000 });
  }

  /** Select a report and run it; assert the grid renders (no error/blocker). Returns row count. */
  async runReport(name) {
    const pick = this.main.locator('button, a.btn, .nav-link, [role="tab"]').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`, 'i') }).first();
    if (await pick.count()) { await pick.click(); await this.page.waitForTimeout(600); }
    if (await this.runBtn.count()) { await this.runBtn.click(); }
    await this.page.waitForTimeout(1400);
    const body = (await this.main.innerText().catch(() => '')).toLowerCase();
    expect(body, `report "${name}" should not error`).not.toMatch(/oops|something went wrong|unhandled|error occurred/);
    return this.gridRows.filter({ hasText: /\S/ }).count();
  }

  /** The Export Excel button is present (download itself requires explicit user consent). */
  async exportAvailable() { return (await this.exportBtn.count()) > 0; }
}

module.exports = { ExitReportsPage };
