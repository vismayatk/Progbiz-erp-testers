'use strict';

const { BasePage } = require('../BasePage');

/**
 * /employee-remark — dated remark/note entry form (Core HR, no grid).
 * KNOWN BUILD BUG: header, breadcrumb and card title all read "Employee
 * Deduction" on this route — identify the page by URL + its REDUCED field set
 * (no deduction-type / pay-using / amount fields), never by title.
 * Shares the deduction form's ids: #branch, #employee, #enquiry-date,
 * #details-text-area.
 */
class EmployeeRemarkPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'employee-remark');

    // ── Form fields (all crawled ids) ──────────────────────────────────────
    this.branchSelect    = page.locator('select#branch');       // default "Choose"
    this.staffSelect     = page.locator('select#employee');     // "Staff" (single #employee here)
    this.dateInput       = page.locator('input#enquiry-date');  // "Date" (type=date)
    this.detailsTextarea = page.locator('#details-text-area');  // "Details"

    this.saveBtn   = this.button('Save');     // final submit — never clicked by tests
    this.cancelBtn = this.button('Cancel');   // discards the entry
  }

  /** Fill the plain fields WITHOUT saving. */
  async fillForm({ date, details } = {}) {
    if (date !== undefined)    await this.dateInput.fill(date);
    if (details !== undefined) await this.detailsTextarea.fill(details);
  }

  /** Discard the unsaved entry via "Cancel". */
  async cancel() {
    await this.cancelBtn.click();
    await this.waitReady();
  }
}

module.exports = { EmployeeRemarkPage };
