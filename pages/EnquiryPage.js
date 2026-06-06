'use strict';

const { getAlertText, screenshot, selectOption } = require('../utils/helpers');

class EnquiryPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    // ── List page ──────────────────────────────────────────────────────────
    this.addNewBtn = page.getByRole('link', { name: /add new|new enquiry|\+ new/i }).or(
                     page.getByRole('button', { name: /add new|new enquiry|\+ new/i })).first();

    // ── Form fields ────────────────────────────────────────────────────────
    this.customerNameInput = page.locator(
      'input[name*="customer" i], input[id*="customer" i], input[placeholder*="customer" i]'
    ).first();
    this.mobileInput = page.locator(
      'input[name*="mobile" i], input[name*="phone" i], input[id*="mobile" i]'
    ).first();
    this.emailInput = page.locator(
      'input[type="email"], input[name*="email" i], input[id*="email" i]'
    ).first();
    this.sourceSelect = page.locator(
      'select[name*="source" i], select[id*="source" i]'
    ).first();
    this.productInput = page.locator(
      'input[name*="product" i], input[id*="product" i], input[placeholder*="product" i]'
    ).first();
    this.descriptionInput = page.locator(
      'textarea[name*="desc" i], textarea[id*="desc" i], textarea[name*="remark" i], textarea[name*="note" i]'
    ).first();
    this.quantityInput = page.locator(
      'input[name*="qty" i], input[name*="quantity" i], input[id*="qty" i]'
    ).first();
    this.unitPriceInput = page.locator(
      'input[name*="price" i], input[name*="amount" i], input[id*="price" i]'
    ).first();

    this.saveBtn = page.getByRole('button', { name: /save|submit|create/i }).first();

    // ── Detail / action buttons ────────────────────────────────────────────
    this.convertToQuotationBtn = page.getByRole('button', { name: /convert.*quot|to quotation/i }).or(
                                  page.getByRole('link',   { name: /convert.*quot|to quotation/i })).first();

    this.statusDropdown = page.locator(
      'select[name*="status" i], select[id*="status" i]'
    ).first();
    this.statusSaveBtn = page.getByRole('button', { name: /save|update/i }).first();
  }

  /** Navigate to the enquiry listing page. */
  async gotoList() {
    const paths = ['/enquiry', '/enquiries', '/crm/enquiry', '/crm/enquiries', '/sales/enquiry'];
    for (const p of paths) {
      await this.page.goto(`${this.baseUrl}${p}`, { waitUntil: 'domcontentloaded' });
      if (!this.page.url().includes('/login')) {
        console.log(`  📋 Enquiry list loaded: ${this.page.url()}`);
        return;
      }
    }
    throw new Error('Could not reach enquiry listing page — check BASE_URL / route');
  }

  /** Click "Add New" to open the creation form. */
  async clickAddNew() {
    await this.addNewBtn.waitFor({ state: 'visible', timeout: 10000 });
    await this.addNewBtn.click();
    await this.page.waitForLoadState('domcontentloaded');
    console.log('  ➕ Opened "Add New Enquiry" form');
  }

  /**
   * Fill and submit the enquiry creation form.
   * @param {object} data - from testData.enquiry
   */
  async fillAndCreate(data) {
    console.log(`  ✍️  Filling enquiry form for customer: "${data.customerName}"`);

    await this._safeFill(this.customerNameInput, data.customerName);
    await this._safeFill(this.mobileInput,       data.mobile);
    await this._safeFill(this.emailInput,         data.email);
    await this._safeSelect(this.sourceSelect,     data.source);
    await this._safeFill(this.productInput,       data.product);
    await this._safeFill(this.descriptionInput,   data.description);
    await this._safeFill(this.quantityInput,      data.quantity);
    await this._safeFill(this.unitPriceInput,     data.unitPrice);

    await this.saveBtn.click();
    console.log('  💾 Save button clicked');
  }

  /** Wait for and return the success/alert message text after save. */
  async getSuccessMessage() {
    const msg = await getAlertText(this.page, 12000);
    console.log(`  💬 Alert text: "${msg}"`);
    return msg;
  }

  /**
   * Open the most-recently-created enquiry from the list.
   * Strategy: click the first row link / view button.
   */
  async openFirstEnquiry() {
    await this.gotoList();
    const rowLink = this.page.locator(
      'table tbody tr:first-child a, table tbody tr:first-child button, .list-row:first-child a'
    ).first();
    await rowLink.waitFor({ state: 'visible', timeout: 10000 });
    await rowLink.click();
    await this.page.waitForLoadState('domcontentloaded');
    console.log(`  🔗 Opened first enquiry — URL: ${this.page.url()}`);
  }

  /** Click "Convert to Quotation" and wait for navigation or alert. */
  async convertToQuotation() {
    await this.convertToQuotationBtn.waitFor({ state: 'visible', timeout: 10000 });
    await this.convertToQuotationBtn.click();
    console.log('  🔄 Clicked "Convert to Quotation"');

    // Some CRMs show a confirm dialog
    const dlg = this.page.locator('.modal, [role="dialog"]').first();
    try {
      await dlg.waitFor({ state: 'visible', timeout: 4000 });
      const confirmBtn = dlg.getByRole('button', { name: /ok|yes|confirm/i }).first();
      await confirmBtn.click();
      console.log('  ✔️  Confirmed conversion dialog');
    } catch {
      // no modal, continue
    }
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Change the enquiry status via the status dropdown.
   * @param {string} status - "In Follow-up" | "Won" | "Lost"
   */
  async updateStatus(status) {
    console.log(`  🔃 Changing status to "${status}" ...`);
    await this.statusDropdown.waitFor({ state: 'visible', timeout: 10000 });
    await this.statusDropdown.selectOption({ label: status });
    await this.statusSaveBtn.click();
    await this.page.waitForLoadState('domcontentloaded');
    console.log(`  ✅ Status updated to "${status}"`);
  }

  /** Read the current value shown for Status on the enquiry detail. */
  async getCurrentStatus() {
    const statusEl = this.page.locator(
      '[data-field="status"], .status-badge, span.status, td.status'
    ).first();
    try {
      return (await statusEl.textContent()).trim();
    } catch {
      return await this.statusDropdown.inputValue();
    }
  }

  // ── private helpers ──────────────────────────────────────────────────────

  async _safeFill(locator, value) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.fill(value);
    } catch {
      // field not present for this CRM build — skip silently
    }
  }

  async _safeSelect(locator, value) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.selectOption({ label: value });
    } catch {
      // dropdown not present or value not available — skip
    }
  }
}

module.exports = { EnquiryPage };
