'use strict';

const { getAlertText } = require('../../common/helpers');

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

    // ── Create-Quotation form (/quotation/0/{id}, reached via enquiry convert) ──
    this.qBranch    = page.locator('#branch');
    this.qDate      = page.locator('#date');
    this.qNumber    = page.locator('#quotation-no');         // QUO-### auto
    this.qCustomer  = page.locator('#customerNameInput');
    this.qAgent     = page.locator('#agent');                // Sales Executive*
    this.qQuality   = page.locator('#quotation-quality');    // Lead Quality*
    this.qCurrency  = page.locator('#currency');
    this.qValidUpto = page.locator('#expdate');              // Quotation Valid Upto (the one NOT auto-filled)
    this.qTerms     = page.locator('#terms-and-condition');
    this.qGross     = page.locator('#gross-total');
    this.qPayable   = page.locator('#payable-total');
    this.qSave      = page.locator('#btn-save-quotation');
    this.qItemRows  = page.locator('table tbody tr');
  }

  /** Whether we're on the create-quotation form. */
  onForm() { return /\/quotation\//.test(this.page.url()); }

  /** Snapshot of auto-fill state (QT-010): which fields are prefilled vs empty. */
  async autoFillState() {
    const val = async (loc) => (await loc.inputValue().catch(() => '')) || '';
    return {
      number:    await val(this.qNumber),
      customer:  await val(this.qCustomer),
      date:      await val(this.qDate),
      validUpto: await val(this.qValidUpto),
      itemRows:  await this.qItemRows.count().catch(() => 0),
      gross:     await val(this.qGross),
      payable:   await val(this.qPayable),
    };
  }

  /** Set the Quotation Valid Upto date (the field left blank by auto-fill). */
  async setValidUpto(dateStr) {
    await this.qValidUpto.fill(dateStr).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /** Lead Quality is REQUIRED and never prefilled — the save is blocked by a
   *  "Please select lead quality" swal without it. */
  async setLeadQuality(index = 1) {
    await this.qQuality.selectOption({ index }).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /** Save the quotation. Returns the alert/redirect outcome. */
  async save() {
    await this.qSave.click().catch(() => {});
    await this.page.waitForTimeout(2500);
    return this.getSuccessMessage();
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

  /** Open /leads filtered to Type = Quotation (rows then show QUO-x numbers).
   *  The unfiltered master lists enquiries (ENQ-x) — quotations only surface
   *  behind the filter panel: #btn-toggle-filter → Type select → #btn-apply-filter. */
  async gotoQuotationList() {
    await this.gotoList();
    await this.page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(3000);                                // AJAX list settles
    await this.page.locator('#btn-toggle-filter').click();
    await this.page.waitForTimeout(800);
    const typeSel = this.page.locator('select')
      .filter({ has: this.page.locator('option', { hasText: /^Quotation$/ }) }).first();
    await typeSel.selectOption({ label: 'Quotation' });
    await this.page.locator('#btn-apply-filter').click();
    await this.page.waitForTimeout(4000);                                // filtered reload
    console.log('  📋 Leads filtered to Type=Quotation');
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
