'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { DocumentUploadModal } = require('../components/DocumentUploadModal');

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

  // ── Live upload flow (2026-10): the page header "Upload" button opens an "Upload Document" modal
  //    (Category → Document Type → Document Number → no-expiry → Authority → File → Description),
  //    and the list grid is Document | Uploaded | Expiry | Version | Verification | Actions. ──

  /** Wait until the list has loaded ("Loading your documents…" gone). */
  async waitListLoaded() {
    await expect(this.page.getByText(/Loading your documents/i), 'My Documents should finish loading').toBeHidden({ timeout: 45000 });
  }

  /** The list row for this document — matched on its number, or on its type when the list hides
   *  numbers (safe: the run employee is created per run, so its documents are only ours). */
  documentRow(doc) {
    const rows = this.main.locator('table tbody tr');
    return rows.filter({ hasText: doc.number }).or(rows.filter({ hasText: new RegExp(doc.type, 'i') })).first();
  }

  /** Signed in as the employee: Upload → fill the modal → Upload; re-run safe (skips when already listed). */
  async uploadDocument(doc) {
    await this.goto();
    await this.waitListLoaded();
    if (await this.documentRow(doc).count()) return 'already-listed';
    await this.main.locator('button, a.btn').filter({ hasText: /^\s*Upload\s*$/i }).first().click();
    const modal = new DocumentUploadModal(this.page, 'Upload Document');
    await modal.waitOpen();
    await modal.fill(doc);
    await modal.submit('Upload');
    return 'uploaded';
  }

  /** Assert the document is listed (type shown, number in the row). `fresh` reloads My Documents first;
   *  pass false right after an upload — the list updates in place. */
  async verifyListed(doc, { fresh = true } = {}) {
    if (fresh) await this.goto();
    await this.waitListLoaded();
    const row = this.documentRow(doc);
    await expect(row, `${doc.type} ${doc.number} should be listed in My Documents after reload`).toBeVisible({ timeout: 20000 });
    await expect(row, `the row should show "${doc.type}"`).toContainText(new RegExp(doc.type, 'i'));
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }
}

module.exports = { MyDocumentsPage };
