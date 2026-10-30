'use strict';

const { test, expect } = require('@playwright/test');

/**
 * The document upload modal — the same form behind two buttons:
 *   • Core HR → Employee edit form → Documents tab → "Capture"   (modal "Capture Document", submit "Save")
 *   • My Workspace → Documents → "Upload"                       (modal "Upload Document",  submit "Upload")
 *
 * Fields (no ids): Category* → Type* (cascading; types load after the category) → Number (required
 * for ID types — we only use non-ID types) → Expiry / "This document has no expiry" (ESS only) →
 * Issuing Authority → Scan/File (front)* → back (optional) → Remarks/Description.
 */
class DocumentUploadModal {
  /** @param {import('@playwright/test').Page} page  @param {string} title e.g. "Capture Document" */
  constructor(page, title) {
    this.page = page;
    this.title = title;
    this.root = page.locator('.modal.show, .offcanvas.show').filter({ hasText: new RegExp(title, 'i') }).first();
  }

  async waitOpen() {
    await expect(this.root, `the "${this.title}" form should open`).toBeVisible({ timeout: 15000 });
  }

  /** A <select> in the modal identified by an option it always offers. */
  _select(anchor) {
    return this.root.locator('select').filter({ has: this.page.locator('option', { hasText: anchor }) }).first();
  }

  /**
   * Fill the form. `doc` = { category, type, number, authority, file, remarks }.
   */
  async fill(doc) {
    await test.step(`Category = "${doc.category}"`, async () => {
      const cat = this._select('ID Proof');
      await cat.selectOption({ label: doc.category });
    });
    await test.step(`Type = "${doc.type}"`, async () => {
      const type = this.root.locator('select').nth(1);
      // Types load after the category — "Graduation", or "Aadhar card (required)" style labels.
      await expect.poll(async () => (await type.locator('option').allTextContents()).some(t => t.trim().startsWith(doc.type)),
        { timeout: 15000, message: `type "${doc.type}" should load for category "${doc.category}"` }).toBe(true);
      const label = (await type.locator('option').allTextContents()).map(t => t.trim()).find(t => t.startsWith(doc.type));
      await type.selectOption({ label });
    });
    await test.step(`Number = "${doc.number}"`, async () => {
      // Found by its LABEL ("Number" / "Document Number", "*" once the type makes it required) — the
      // placeholder changes with the type ("e.g. PAN / passport number" → "e.g. 123456").
      const num = this.root.locator('label').filter({ hasText: /^\s*(Document\s+)?Number\s*\*?\s*$/i }).first()
        .locator('xpath=following::input[@type="text"][1]');
      await expect(num, 'the document number field should be visible').toBeVisible();
      await num.fill(doc.number);
      await expect(num, 'the document number should hold the value entered').toHaveValue(doc.number);
    });
    // ESS only: the type decides expiry — for some types (e.g. SSLC CERTIFICATE) the box is disabled.
    const noExpiry = this.root.locator('#ess-no-expiry');
    if (await noExpiry.count() && await noExpiry.isEnabled()) await test.step('Tick "This document has no expiry"', async () => {
      await noExpiry.check();
      await expect(noExpiry, '"no expiry" should be ticked').toBeChecked();
    });
    if (doc.authority) await test.step(`Issuing Authority = "${doc.authority}"`, async () => {
      await this._select('Income Tax Department').selectOption({ label: doc.authority });
    });
    await test.step(`Attach "${require('path').basename(doc.file)}" (front)`, async () => {
      await this.root.locator('input[type="file"]').first().setInputFiles(doc.file);
    });
    if (doc.remarks) await test.step('Remarks / description', async () => {
      await this.root.locator('input[placeholder="Optional note" i]').first().fill(doc.remarks);
    });
  }

  /** Click the submit button (`Save` / `Upload`), dismiss any confirmation, and wait for the form to close. */
  async submit(buttonText) {
    await test.step(`${buttonText} the document`, async () => {
      // VISIBLE submit only — the Core HR modal also holds a hidden inline "add new option" Save (#cf-new-option-save).
      await this.root.locator('button').filter({ hasText: new RegExp(`^\\s*${buttonText}\\s*$`, 'i') })
        .filter({ visible: true }).last().click();
      const swal = this.page.locator('.swal2-popup').first();
      const closed = await this.root.waitFor({ state: 'hidden', timeout: 30000 }).then(() => true).catch(() => false);
      if (await swal.isVisible().catch(() => false)) {
        const msg = (await swal.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (/error|failed|invalid|required|already|unique/i.test(msg)) throw new Error(`Document ${buttonText.toLowerCase()} was refused: "${msg}"`);
        await swal.locator('button').filter({ hasText: /^\s*(OK|Close|Done)\s*$/i }).first().click().catch(() => {});
      }
      if (!closed) {
        const errs = (await this.root.locator('.invalid-feedback:visible, .text-danger:visible, .validation-message:visible').allInnerTexts().catch(() => []))
          .map(s => s.trim()).filter(Boolean).join(' | ');
        throw new Error(`The "${this.title}" form did not close after ${buttonText}. Visible errors: ${errs || '(none captured)'}`);
      }
    });
  }
}

module.exports = { DocumentUploadModal };
