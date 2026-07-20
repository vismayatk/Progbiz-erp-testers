'use strict';

const { BasePage } = require('../BasePage');

/**
 * /employee-remark-report — filterable remark report (HRMS Reports).
 * Pull-based: no grid renders until "View Report". Shares the deduction
 * report's id scheme (#report-assignee, #timePeriodSelect) — here only ONE
 * #report-assignee (Staff) exists.
 */
class EmployeeRemarkReportPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'employee-remark-report');

    // ── Filters ────────────────────────────────────────────────────────────
    this.staffSelect  = page.locator('select#report-assignee').first();  // "Staff", default All
    this.periodSelect = page.locator('#timePeriodSelect');               // Choose | This Week | This Month | This Year | Custom

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

module.exports = { EmployeeRemarkReportPage };
