'use strict';

const { getAlertText } = require('../utils/helpers');

class QuotationPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    // ── Quotation listing ──────────────────────────────────────────────────
    this.quotationRows = page.locator(
      'table tbody tr, .list-row, .quotation-row'
    );

    // ── Success indicators after conversion ───────────────────────────────
    this.quotationNumberEl = page.locator(
      '[data-field="quotation_no"], .quotation-number, span.quot-no, h4.quot-no, td.quot-no'
    ).first();
  }

  /** Navigate to the quotation listing page. */
  async gotoList() {
    const paths = ['/quotation', '/quotations', '/crm/quotation', '/sales/quotation'];
    for (const p of paths) {
      await this.page.goto(`${this.baseUrl}${p}`, { waitUntil: 'domcontentloaded' });
      if (!this.page.url().includes('/login')) {
        console.log(`  📋 Quotation list loaded: ${this.page.url()}`);
        return;
      }
    }
    throw new Error('Could not reach quotation listing page');
  }

  /** Return the success/alert text shown after conversion. */
  async getSuccessMessage() {
    const msg = await getAlertText(this.page, 12000);
    console.log(`  💬 Quotation alert: "${msg}"`);
    return msg;
  }

  /** Return the quotation number displayed on the current page (if any). */
  async getQuotationNumber() {
    try {
      await this.quotationNumberEl.waitFor({ state: 'visible', timeout: 8000 });
      return (await this.quotationNumberEl.textContent()).trim();
    } catch {
      return null;
    }
  }

  /** Count rows in the quotation listing. */
  async getListingCount() {
    await this.page.waitForLoadState('domcontentloaded');
    const count = await this.quotationRows.count();
    console.log(`  📊 Quotation listing rows: ${count}`);
    return count;
  }
}

module.exports = { QuotationPage };
