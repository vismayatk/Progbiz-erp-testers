'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess/documents — "Self Service Documents": the employee uploads personal
 * documents (IDs, certificates) with expiry tracking; docs attach to the
 * employee master and drive compliance reminders.
 * Card "Upload A Document" (crawled input order: Document Type select
 * "-- Select --", Number text, Expiry date, File file-input) + card
 * "Documents" grid: Type | Number | Category | Expiry | Status (captured
 * empty — "No documents on file.").
 * "Upload" persists a real document — exposed but NEVER clicked by tests
 * (the file input is likewise never fed a fixture in interaction tests).
 */
class MyDocumentsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/documents');

    // ── "Upload A Document" form (crawled input order) ─────────────────────
    this.documentTypeSelect = this.main.locator('select').first();               // "-- Select --"
    this.numberInput        = this.main.locator('input[type="text"]').first();   // Number
    this.expiryInput        = this.main.locator('input[type="date"]').first();   // Expiry
    this.fileInput          = this.main.locator('input[type="file"]').first();   // File
    this.uploadBtn          = this.button('Upload');   // final submit — never clicked by tests
  }

  /** Option labels of the Document Type select. */
  documentTypeOptions() { return this.documentTypeSelect.locator('option').allTextContents(); }

  /**
   * Draft the document metadata WITHOUT uploading — form state only.
   * No file is attached and "Upload" is never clicked here.
   */
  async fillDocumentDraft({ number, expiry } = {}) {
    if (number !== undefined) await this.numberInput.fill(number);
    if (expiry !== undefined) await this.expiryInput.fill(expiry);
    await this.page.waitForTimeout(200);
  }

  /** True when the documented empty state ("No documents on file.") is showing. */
  hasNoDocuments() { return this.containsText('No documents on file.'); }

  /** "Documents" row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { MyDocumentsPage };
