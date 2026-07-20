'use strict';

const { BasePage } = require('../BasePage');

/**
 * /my-handover — "ESS Handover" (My Duty Handover): the employee hands their
 * HRMS approvals and HRMS/recruitment tasks to a colleague for a date window
 * (Sales/CRM duties are never handed over). ESS-side twin of admin
 * /employee-handover — here only an Assignee is picked (no From employee).
 * Card "Set Up Handover" (crawled input order: assignee select
 * "-- Select assignee --", From date, To date, #ca "Cover my approvals",
 * #ct "Cover my HRMS tasks", Note textarea) + card "My Handovers" grid:
 * # | Assignee | From | To | Covers | Active | Action (captured empty —
 * "No handovers set up.").
 * "Save" is the final submit — never clicked by tests; "Clear" only resets
 * the draft form and is safe.
 */
class MyHandoverPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'my-handover');

    // ── "Set Up Handover" inline form ──────────────────────────────────────
    this.assigneeSelect    = this.main.locator('select').first();   // "-- Select assignee --"
    this.fromDateInput     = this.main.locator('input[type="date"]').nth(0);
    this.toDateInput       = this.main.locator('input[type="date"]').nth(1);
    this.coverApprovalsChk = page.locator('#ca');                   // stable crawled ids
    this.coverTasksChk     = page.locator('#ct');
    this.noteInput         = this.main.locator('textarea').first(); // "Note (optional)"

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

  /** True when the documented empty state ("No handovers set up.") is showing. */
  hasNoHandovers() { return this.containsText('No handovers set up.'); }

  /** "My Handovers" row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { MyHandoverPage };
