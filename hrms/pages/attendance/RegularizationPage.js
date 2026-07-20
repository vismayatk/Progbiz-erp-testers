'use strict';

const { BasePage } = require('../BasePage');

/**
 * /regularization — attendance correction requests (Attendance). Two cards:
 * "Raise A Correction" (form) and "Requests" (grid: Sl.No | Employee | Date |
 * Type | In | Out | Reason | Status | Action).
 * Mandatory form fields (*): Employee, Date, Type. In/Out Time are
 * datetime-local inputs (fill "YYYY-MM-DDTHH:mm"). The "Submit" button is
 * exposed but NEVER clicked by interaction tests; "Clear" only resets the
 * draft form and is safe.
 */
class RegularizationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'regularization');

    // ── "Raise A Correction" form (crawled input order) ────────────────────
    this.employeeSelect  = this.main.locator('select').nth(0);                    // Employee* — default "-- select --"
    this.dateInput       = this.main.locator('input[type="date"]').nth(0);        // Date*
    this.typeSelect      = this.main.locator('select').nth(1);                    // Type* — Missed Punch … Manual Entry
    this.inTimeInput     = this.main.locator('input[type="datetime-local"]').nth(0);   // In Time
    this.outTimeInput    = this.main.locator('input[type="datetime-local"]').nth(1);   // Out Time
    this.reasonTextarea  = this.main.locator('textarea').first();                 // Reason
    this.attachmentInput = this.main.locator('input[type="file"]').first();       // Attachment
    this.submitBtn       = this.button('Submit');   // exposed only — never clicked by tests
    this.clearBtn        = this.button('Clear');    // safe: resets the draft form

    // ── "Requests" grid filters ────────────────────────────────────────────
    this.searchInput    = this.main.locator('input[placeholder="Search employee or reason..."]').first();
    this.filterSelects  = this.main.locator('select');                            // nth(2)/nth(3) are the grid filters
    this.fromDateFilter = this.main.locator('input[type="date"]').nth(1);
    this.toDateFilter   = this.main.locator('input[type="date"]').nth(2);
  }

  /** Option labels of the correction Type* select. */
  typeOptions() { return this.typeSelect.locator('option').allTextContents(); }

  /** Reset the correction draft via "Clear" (no request is ever submitted). */
  async clearForm() {
    await this.clearBtn.click();
    await this.page.waitForTimeout(300);
  }

  /** Type into "Search employee or reason..." and let the Requests grid refresh. */
  async searchRequests(term) {
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Current row count — remember: 1 empty placeholder row ≠ 1 request. */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { RegularizationPage };
