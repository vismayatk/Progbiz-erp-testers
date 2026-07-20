'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-reports — report hub: pick a report type (Register / Balance /
 * Utilization), set filters, then run. Two-step interaction: click a
 * report-type button, then "Filter" runs the (read-only) query.
 * No grid on initial load — the placeholder "Choose a report type and click
 * Run Report." shows until a report is run; the card title changes with the
 * selected report (default "Leave Register").
 * QUIRK: the Department select includes the misspelled option
 * "DigitalMarkrting" — copy it exactly when selecting.
 */
class LeaveReportsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-reports');

    // ── Report-type pickers + run ──────────────────────────────────────────
    this.registerBtn    = this.button('Register');
    this.balanceBtn     = this.button('Balance');
    this.utilizationBtn = this.button('Utilization');
    this.runFilterBtn   = this.button('Filter');   // runs the selected (read-only) report

    // ── Filters (number year + three selects, in DOM order) ────────────────
    this.yearInput        = this.main.locator('input[type="number"]').first();
    this.branchSelect     = this.main.locator('select').nth(0);   // All Branches | Main Branch | Chennai
    this.departmentSelect = this.main.locator('select').nth(1);   // incl. "DigitalMarkrting" (sic)
    this.leaveTypeSelect  = this.main.locator('select').nth(2);   // mirrors /leave-types masters
  }

  /** Pick a report type by its button label ("Register" | "Balance" | "Utilization"). */
  async pickReport(name) {
    await this.button(name).click();
    await this.waitReady();
  }

  /** Run the selected report via "Filter" (read-only aggregation query). */
  async runReport() {
    await this.runFilterBtn.click();
    await this.waitReady();
  }

  /** True while the initial "Choose a report type and click Run Report." placeholder shows. */
  hasRunPlaceholder() { return this.containsText('Choose a report type and click Run Report.'); }

  /** Option labels of the Leave Type filter (mirrors the leave-type masters). */
  leaveTypeOptions() { return this.leaveTypeSelect.locator('option').allTextContents(); }
}

module.exports = { LeaveReportsPage };
