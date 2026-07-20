'use strict';

const { BasePage } = require('../BasePage');

/**
 * /hrms/probation-report — date-ranged probation outcome report (Core HR).
 * Pull-based: set filters then "Run Report". Grid: Employee | Branch | Start |
 * End | Outcome | Reviews | Overdue | Decision. Empty-state ROW:
 * "No probations in this range." The "Details (N)" card title tracks row count.
 * "Export Excel" triggers a file download — exposed but never clicked here.
 */
class ProbationReportPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'hrms/probation-report');

    // ── Filters (two unlabelled date inputs, in visual order) ──────────────
    this.fromDateInput = this.main.locator('input[type="date"]').nth(0);  // "From (start date)"
    this.toDateInput   = this.main.locator('input[type="date"]').nth(1);  // "To (start date)"
    this.branchSelect  = this.main.locator('select').first();             // "All branches", no id

    this.runReportBtn   = this.button('Run Report');
    this.exportExcelBtn = this.button('Export Excel');   // download — never clicked by tests

    // "Details (N)" card title — doubles as a row-count assertion target
    this.detailsCardTitle = this.main.getByText(/Details \(\d+\)/).first();
  }

  /** Pull the report for a date range (read-only query). */
  async runReport({ from, to } = {}) {
    if (from) await this.fromDateInput.fill(from);
    if (to)   await this.toDateInput.fill(to);
    await this.runReportBtn.click();
    await this.waitReady();
  }

  /** Text of the first result row (data, or "No probations in this range."). */
  async firstRowText() {
    return (await this.gridRows.first().innerText()).trim();
  }
}

module.exports = { ProbationReportPage };
