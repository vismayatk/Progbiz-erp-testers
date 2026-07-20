'use strict';

const { BasePage } = require('../BasePage');

/**
 * /employee-deduction-report — filterable deduction report (HRMS Reports).
 * Pull-based: no grid renders until "View Report".
 * Quirk: DUPLICATE id "#report-assignee" on BOTH the Deduction Type and Staff
 * selects — disambiguated by position, never by id alone.
 */
class EmployeeDeductionReportPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'employee-deduction-report');

    // ── Filters ────────────────────────────────────────────────────────────
    this.deductionTypeSelect = page.locator('select#report-assignee').nth(0);  // "Deduction Type", default All
    this.staffSelect         = page.locator('select#report-assignee').nth(1);  // "Staff", default All
    this.periodSelect        = page.locator('#timePeriodSelect');              // Choose | This Week | This Month | This Year | Custom

    this.viewReportBtn = this.button('View Report');
  }

  /** Choose a reporting period by label. */
  async selectPeriod(label) {
    await this.periodSelect.selectOption({ label });
    await this.page.waitForTimeout(400);   // "Custom" may reveal date inputs
  }

  /** Pull the report (read-only query). */
  async viewReport() {
    await this.viewReportBtn.click();
    await this.waitReady();
  }
}

module.exports = { EmployeeDeductionReportPage };
