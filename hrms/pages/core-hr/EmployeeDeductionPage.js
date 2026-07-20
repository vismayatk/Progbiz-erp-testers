'use strict';

const { BasePage } = require('../BasePage');

/**
 * /employee-deduction — ad-hoc salary-deduction entry form (Core HR, no grid).
 * Quirks: DUPLICATE id "#employee" on both the Staff and "Pay Using" selects
 * (disambiguated by position); non-semantic ids reused from other modules
 * (#enquiry-date, #building-type) — stable but misleading.
 */
class EmployeeDeductionPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'employee-deduction');

    // ── Form fields (all crawled ids) ──────────────────────────────────────
    this.branchSelect      = page.locator('select#branch');            // default "Choose"
    this.staffSelect       = page.locator('select#employee').nth(0);   // "Staff" (branch-filtered)
    this.payUsingSelect    = page.locator('select#employee').nth(1);   // "Pay Using" — duplicate id!
    this.dateInput         = page.locator('input#enquiry-date');       // "Date" (type=date)
    this.deductionTypeInput = page.locator('#building-type');          // "Deduction Type *" typeahead
    this.amountInput       = page.locator('input#amount');             // "Amount :"
    this.detailsTextarea   = page.locator('#details-text-area');       // "Details"

    this.saveBtn   = this.button('Save');     // final submit — never clicked by tests
    this.cancelBtn = this.button('Cancel');   // discards the entry
  }

  /** Fill the plain (non-lookup) fields WITHOUT saving. */
  async fillForm({ date, deductionType, amount, details } = {}) {
    if (date !== undefined)          await this.dateInput.fill(date);
    if (deductionType !== undefined) await this.deductionTypeInput.fill(deductionType);
    if (amount !== undefined)        await this.amountInput.fill(String(amount));
    if (details !== undefined)       await this.detailsTextarea.fill(details);
  }

  /** Discard the unsaved entry via "Cancel". */
  async cancel() {
    await this.cancelBtn.click();
    await this.waitReady();
  }
}

module.exports = { EmployeeDeductionPage };
