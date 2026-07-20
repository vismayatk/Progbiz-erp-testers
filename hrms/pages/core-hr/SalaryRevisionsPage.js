'use strict';

const { BasePage } = require('../BasePage');

/**
 * /salary-revisions — raise gross-salary revisions + history (Core HR).
 * "Raise A Revision" form card + "Revision History" grid card.
 * Grid: Employee | Branch | Effective | Old | New | % | Status.
 * Empty state renders as a single ROW: "No revisions yet."
 */
class SalaryRevisionsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'salary-revisions');

    // ── "Raise A Revision" form (the only two selects on the page, in form order;
    //    Branch gates the Employee options — cascading dropdowns) ────────────
    this.branchSelect       = this.main.locator('select').nth(0);  // "-- Select branch --"
    this.employeeSelect     = this.main.locator('select').nth(1);  // "-- Select employee --"
    this.newGrossInput      = this.main.locator('input[type="number"]').first();
    this.effectiveDateInput = this.main.locator('input[type="date"]').first();
    this.reasonTextarea     = this.main.locator('textarea').first();

    this.raiseRevisionBtn = this.button('Raise Revision');  // final submit — never clicked by tests

    // "Revision History" grid = inherited this.grid / this.gridRows
  }

  /** Fill the Raise-A-Revision form WITHOUT submitting (no branch/employee lookup). */
  async fillRevision({ gross, effectiveDate, reason } = {}) {
    if (gross !== undefined)         await this.newGrossInput.fill(String(gross));
    if (effectiveDate !== undefined) await this.effectiveDateInput.fill(effectiveDate);
    if (reason !== undefined)        await this.reasonTextarea.fill(reason);
  }

  /** Branch option labels of the revision form. */
  branchOptions() {
    return this.branchSelect.locator('option').allTextContents();
  }

  /** Text of the first history row (a data row, or "No revisions yet."). */
  async firstHistoryRowText() {
    return (await this.gridRows.first().innerText()).trim();
  }
}

module.exports = { SalaryRevisionsPage };
