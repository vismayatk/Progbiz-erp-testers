'use strict';

const { BasePage } = require('../BasePage');

/**
 * /upload-employee — bulk employee Excel import (Core HR, no grid).
 * KNOWN BUILD BUG: the page card is titled "Leave Request" — never assert on it.
 * "Upload" performs the import — exposed but never clicked by tests.
 */
class UploadEmployeePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'upload-employee');

    // ── Import controls ────────────────────────────────────────────────────
    this.fileInput  = this.main.locator('input[type="file"]').first();  // "Upload Recipient Excel File"
    this.sampleLink = this.main.locator('a[href="/assets/images/EmployeeExcelImport.xlsx"]').first();

    this.excelRulesBtn = this.button('Excel Rules');   // info dialog with the required columns
    this.uploadBtn     = this.button('Upload');        // performs the import — never clicked by tests
  }

  /**
   * Open the "Excel Rules" info dialog (read-only).
   * @returns {Promise<boolean>} true when a dialog actually appeared
   */
  async openExcelRules() {
    await this.excelRulesBtn.click();
    const shown = await this.modal.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.page.waitForTimeout(300);
    return shown;
  }

  /** Dismiss the info dialog. */
  async closeModal() {
    if (await this.modal.isVisible().catch(() => false)) {
      const dismiss = this.modal
        .locator('.btn-close, [aria-label="Close"], button:has-text("Close"), button:has-text("OK")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    }
    await this.page.waitForTimeout(300);
  }

  /** href of the "Download Sample Excel" link (asserted, not downloaded). */
  sampleHref() {
    return this.sampleLink.getAttribute('href');
  }
}

module.exports = { UploadEmployeePage };
