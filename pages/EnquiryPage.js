'use strict';

const { getAlertText } = require('../utils/helpers');

class EnquiryPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    // ── List page — Add New button ─────────────────────────────────────────
    this.addNewBtn = page.getByRole('link',   { name: /add new|new enquiry|\+\s*new/i }).or(
                     page.getByRole('button', { name: /add new|new enquiry|\+\s*new/i })).first();

    // ── Form fields ────────────────────────────────────────────────────────
    this.customerNameInput = page.locator(
      'input[name*="customer" i], input[id*="customer" i], input[placeholder*="customer" i], input[name*="name" i]'
    ).first();
    this.mobileInput = page.locator(
      'input[name*="mobile" i], input[name*="phone" i], input[id*="mobile" i], input[placeholder*="mobile" i]'
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
      'textarea[name*="desc" i], textarea[id*="desc" i], textarea[name*="remark" i], textarea[name*="note" i], textarea'
    ).first();
    this.quantityInput = page.locator(
      'input[name*="qty" i], input[name*="quantity" i], input[id*="qty" i]'
    ).first();
    this.unitPriceInput = page.locator(
      'input[name*="price" i], input[name*="amount" i], input[id*="price" i]'
    ).first();

    this.saveBtn = page.getByRole('button', { name: /^(save|submit|create|add)$/i }).or(
                   page.getByRole('button', { name: /save|submit/i })).first();

    // ── Detail / action buttons ────────────────────────────────────────────
    this.convertToQuotationBtn =
      page.getByRole('button', { name: /convert|quotation/i }).or(
      page.getByRole('link',   { name: /convert|quotation/i })).first();

    this.statusDropdown = page.locator(
      'select[name*="status" i], select[id*="status" i]'
    ).first();
    this.statusSaveBtn = page.getByRole('button', { name: /save|update/i }).first();
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  /**
   * Navigate to the enquiry listing by clicking CRM → Enquiry in the sidebar.
   * Falls back to direct URL probing if the sidebar link is not found.
   */
  async gotoList() {
    const page = this.page;

    // Step 1: ensure we are on the app (not login)
    if (page.url().includes('/login') || page.url() === 'about:blank') {
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' });
    }

    // Step 2: try clicking CRM sidebar item to expand sub-menu
    try {
      const crmMenu = page.getByRole('link', { name: /^crm$/i }).or(
                      page.locator('a', { hasText: /^crm$/i })).first();
      await crmMenu.waitFor({ state: 'visible', timeout: 5000 });
      await crmMenu.click();
      console.log('  📂 Clicked CRM sidebar menu');
      await page.waitForTimeout(600);
    } catch {
      console.log('  ⚠️  CRM sidebar item not found — trying direct URLs');
    }

    // Step 3: click "Enquiry" sub-menu item if visible
    try {
      const enquiryLink = page.getByRole('link', { name: /^enquir/i }).first();
      await enquiryLink.waitFor({ state: 'visible', timeout: 5000 });
      await enquiryLink.click();
      await page.waitForLoadState('domcontentloaded');
      console.log(`  📋 Enquiry list loaded via sidebar: ${page.url()}`);
      return;
    } catch {
      // fall through to direct URL probe
    }

    // Step 4: direct URL fallback
    const paths = [
      '/crm/enquiry', '/crm/enquiries', '/enquiry',
      '/enquiries',   '/sales/enquiry', '/crm',
    ];
    for (const p of paths) {
      await page.goto(`${this.baseUrl}${p}`, { waitUntil: 'domcontentloaded' });
      if (!page.url().includes('/login')) {
        console.log(`  📋 Enquiry list loaded via URL: ${page.url()}`);
        return;
      }
    }
    throw new Error('Could not reach enquiry listing page — update gotoList() paths');
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
   * Open the most recently created enquiry from the listing.
   * Uses JS evaluation to find any clickable link/button in the first data row.
   */
  async openFirstEnquiry() {
    await this.gotoList();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(1000);

    // Try multiple selector strategies in order of specificity
    const candidates = [
      'table tbody tr:first-child td a',
      'table tbody tr:first-child a',
      'table tbody tr:first-child button',
      'tbody tr:first-child td:first-child a',
      '.table tbody tr:first-child a',
      'tr:nth-child(1) a',
      '[class*="list"] a:first-of-type',
      '[class*="row"]:first-child a',
      // icon-based view/eye buttons
      'table tbody tr:first-child [title*="view" i]',
      'table tbody tr:first-child [class*="eye" i]',
      'table tbody tr:first-child [class*="view" i]',
    ];

    for (const sel of candidates) {
      const el = this.page.locator(sel).first();
      const count = await el.count();
      if (count > 0) {
        await el.waitFor({ state: 'visible', timeout: 5000 });
        await el.click();
        await this.page.waitForLoadState('domcontentloaded');
        console.log(`  🔗 Opened first enquiry via "${sel}" — URL: ${this.page.url()}`);
        return;
      }
    }

    // Last resort: JS click on first anchor inside a table row
    const clicked = await this.page.evaluate(() => {
      const a = document.querySelector('table tbody tr a, tbody tr a, tr td a');
      if (a) { a.click(); return true; }
      return false;
    });

    if (!clicked) throw new Error('openFirstEnquiry: no clickable row found in enquiry listing');
    await this.page.waitForLoadState('domcontentloaded');
    console.log(`  🔗 Opened first enquiry via JS click — URL: ${this.page.url()}`);
  }

  /** Click "Convert to Quotation" and handle any confirmation dialog. */
  async convertToQuotation() {
    await this.convertToQuotationBtn.waitFor({ state: 'visible', timeout: 10000 });
    await this.convertToQuotationBtn.click();
    console.log('  🔄 Clicked "Convert to Quotation"');

    // Handle optional confirm modal
    try {
      const dlg = this.page.locator('.modal, [role="dialog"]').first();
      await dlg.waitFor({ state: 'visible', timeout: 4000 });
      const confirmBtn = dlg.getByRole('button', { name: /ok|yes|confirm/i }).first();
      await confirmBtn.click();
      console.log('  ✔️  Confirmed conversion dialog');
    } catch {
      // no modal
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

  /** Read the current status value shown on the detail page. */
  async getCurrentStatus() {
    try {
      const statusEl = this.page.locator(
        '[data-field="status"], .status-badge, span.status, td.status, .badge'
      ).first();
      return (await statusEl.textContent()).trim();
    } catch {
      try { return await this.statusDropdown.inputValue(); } catch { return ''; }
    }
  }

  // ── private helpers ──────────────────────────────────────────────────────

  async _safeFill(locator, value) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.fill(value);
    } catch {
      console.log(`  ⚠️  Field not found for value "${value}" — skipping`);
    }
  }

  async _safeSelect(locator, value) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.selectOption({ label: value });
    } catch {
      // dropdown not present or value unavailable
    }
  }
}

module.exports = { EnquiryPage };
