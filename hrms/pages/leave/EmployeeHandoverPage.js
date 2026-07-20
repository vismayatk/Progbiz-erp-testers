'use strict';

const { BasePage } = require('../BasePage');

/**
 * /employee-handover — HR tool: hand an away employee's HRMS approvals and
 * HRMS/recruitment tasks to an assignee for a date window (Sales/CRM duties
 * are never handed over).
 * Card "Set Up Handover" (inline form, stable checkbox ids ca/ct/active) +
 * card "All Handovers" grid: # | From | To | From Date | To Date | Covers |
 * Active | Action (captured empty — "No handovers.").
 * "Save" is the final submit — never clicked by tests; "Clear" resets the form.
 */
class EmployeeHandoverPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'employee-handover');

    // ── "Set Up Handover" inline form ──────────────────────────────────────
    this.employeeAwaySelect = this.main.locator('select').nth(0);   // "-- Select employee --"
    this.assignToSelect     = this.main.locator('select').nth(1);   // "-- Select assignee --"
    this.fromDateInput      = this.main.locator('input[type="date"]').nth(0);
    this.toDateInput        = this.main.locator('input[type="date"]').nth(1);
    this.coverApprovalsChk  = page.locator('#ca');                  // stable crawled ids
    this.coverTasksChk      = page.locator('#ct');
    this.activeChk          = page.locator('#active');
    this.noteInput          = this.main.locator('textarea').first();  // "Note (optional)"

    this.saveBtn  = this.button('Save');    // final submit — never clicked by tests
    this.clearBtn = this.button('Clear');   // resets the form (nothing persisted)
  }

  /** Fill the Set Up Handover form WITHOUT saving. Dates are ISO yyyy-mm-dd. */
  async fillHandoverForm({ from, to, coverApprovals = false, coverTasks = false, note } = {}) {
    if (from) await this.fromDateInput.fill(from);
    if (to)   await this.toDateInput.fill(to);
    if (coverApprovals) await this.coverApprovalsChk.check().catch(() => {});
    if (coverTasks)     await this.coverTasksChk.check().catch(() => {});
    if (note !== undefined) await this.noteInput.fill(note);
    await this.page.waitForTimeout(200);
  }

  /** Reset the form via its own "Clear" button (nothing is persisted). */
  async clearForm() {
    await this.clearBtn.click();
    await this.page.waitForTimeout(300);
  }

  /** True when the documented empty state ("No handovers.") is showing. */
  hasNoHandovers() { return this.containsText('No handovers.'); }

  /** "All Handovers" row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { EmployeeHandoverPage };
