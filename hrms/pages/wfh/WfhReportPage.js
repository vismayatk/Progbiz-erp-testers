'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');

/**
 * /wfh-report — "Work From Home Report" (role WfhManagement). Read-only.
 * Filters: Month (input[type=month]), Branch / Department / Employee selects. One row per visible
 * employee with any WFH or requested day: Employee | Department | Policy | Work From Home Days |
 * Office days | Requested | Monthly limit. No export control.
 */
class WfhReportPage extends BasePage {
  constructor(page) {
    super(page, 'wfh-report');
    this.monthInput = this.main.locator('input[type="month"]').first();
  }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Work From Home Report heading').toContainText(/Work From Home Report/i, { timeout: 30000 });
  }

  /** Set the report month (YYYY-MM). */
  async setMonth(yyyymm) {
    if (await this.monthInput.count()) { await this.monthInput.fill(yyyymm); await this.page.waitForTimeout(1200); }
  }

  /** Pick a filter select (Branch / Department / Employee) by a visible option substring. */
  async filterEmployee(substr) {
    const sel = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: substr }) }).first();
    if (await sel.count()) {
      const label = (await sel.locator('option').allTextContents()).map(t => t.trim()).find(t => t.includes(substr));
      if (label) { await sel.selectOption({ label }); await this.page.waitForTimeout(1500); }
    }
  }

  /** Grid header texts. */
  headers() { return this.gridHeaderTexts(); }

  /** The report row for an employee (substring), or '' if none. */
  async rowFor(substr) {
    const row = this.gridRows.filter({ hasText: substr }).first();
    if (!(await row.count())) return '';
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }
}

module.exports = { WfhReportPage };
