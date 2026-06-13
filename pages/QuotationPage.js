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

  /**
   * Quotations are listed in the Leads master (Type = Quotation). `/quotation`
   * is the *create* form, not a listing — so the listing is `/leads`.
   */
  async gotoList() {
    await this.page.goto(`${this.baseUrl}/leads`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(1500);
    console.log(`  📋 Leads/Quotation listing loaded: ${this.page.url()}`);
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
