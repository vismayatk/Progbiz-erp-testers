'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-types — leave-type master (Leave Management).
 * Single page, no modal: "Leave Types" grid + "Add LeaveType" inline form.
 * Form: "Leave Type Name*" (#leavetypename) plus checkboxes "Support HalfDay"
 * and "Need Document" — BOTH share id "checkebox-sb" (build bug), so they are
 * addressed by DOM order, never by id.
 * Grid: SlNo | Leave Type Name | Is Support Half Day | Is Need Document | Action
 * (captured with 0 rows — headers render even when empty).
 */
class LeaveTypesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-types');

    // ── "Add LeaveType" inline form ────────────────────────────────────────
    this.nameInput = page.locator('#leavetypename');              // "Leave Type Name*" (required)
    // duplicate id "checkebox-sb" → nth() by DOM order (half-day first, document second)
    this.supportHalfDayChk = this.main.locator('input#checkebox-sb').nth(0);
    this.needDocumentChk   = this.main.locator('input#checkebox-sb').nth(1);

    this.saveBtn  = this.button('Save');    // final submit — never clicked by tests
    this.clearBtn = this.button('Clear');   // resets the inline form (nothing persisted)
  }

  /** Fill the Add LeaveType form WITHOUT saving. */
  async fillCreateForm({ name, halfDay = false, needDocument = false } = {}) {
    if (name !== undefined) await this.nameInput.fill(name);
    if (halfDay)      await this.supportHalfDayChk.check().catch(() => {});
    if (needDocument) await this.needDocumentChk.check().catch(() => {});
    await this.page.waitForTimeout(200);
  }

  /** Reset the form via its own "Clear" button (nothing is persisted). */
  async clearForm() {
    await this.clearBtn.click();
    await this.page.waitForTimeout(300);
  }

  /** Current data-row count (0 is the documented baseline). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { LeaveTypesPage };
