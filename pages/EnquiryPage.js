'use strict';

const { getAlertText, waitOverviewReady, throwIfServerError } = require('../utils/helpers');

class EnquiryPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    // ── Listing (Leads) — "Add New" dropdown ───────────────────────────────
    // The Leads page (/leads) is the listing; "Add New" opens New Enquiry / New
    // Quotation / Upload Enquiries. The Enquiry form itself lives at /enquiry.
    this.addNewBtn = page.locator('#btn-add-new-dropdown');

    // ── Enquiry form fields (verified live on lesol_test) ───────────────────
    this.branchSelect      = page.locator('#branch');               // required
    this.customerNameInput = page.locator('#TxtCustomer');          // required
    this.mobileInput       = page.locator('#customer-phone');
    this.assignToSelect    = page.locator('#assignto');             // required
    this.sourceSelect      = page.locator('#leadsource');
    this.followupSelect    = page.locator('#followup');
    this.businessValueInput= page.locator('#business-value');
    this.noFollowupChk     = page.locator('#no-next-followup-enquiry');
    this.descriptionInput  = page.locator('#enquiry-description');
    this.itemSearchInput   = page.locator('#item-search-input');
    this.quantityInput     = page.locator('#new-item-quantity');

    this.saveBtn   = page.locator('#btn-save-enquiry');
    this.cancelBtn = page.locator('#btn-cancel-enquiry');

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
   * Navigate to the Leads listing (/leads) — the CRM lead master.
   */
  async gotoList() {
    const page = this.page;
    await page.goto(`${this.baseUrl}/leads`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    // The listing table is AJAX-loaded — wait for a row to appear
    await page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    console.log(`  📋 Leads listing loaded: ${page.url()}`);
  }

  /**
   * Open the Add-Enquiry form. Goes directly to /enquiry (the create form,
   * reachable via CRM → Create Enquiry / Leads → Add New → New Enquiry) and
   * waits for the AJAX-rendered form to be ready.
   */
  async clickAddNew() {
    await this.page.goto(`${this.baseUrl}/enquiry`, { waitUntil: 'domcontentloaded' });
    await this.saveBtn.waitFor({ state: 'visible', timeout: 20000 });
    await this.customerNameInput.waitFor({ state: 'visible', timeout: 20000 });
    console.log('  ➕ "Add Enquiry" form ready (/enquiry)');
  }

  /**
   * Fill and submit the enquiry creation form.
   * @param {object} data - from testData.enquiry
   */
  async fillAndCreate(data) {
    console.log(`  ✍️  Filling enquiry form for customer: "${data.customerName}"`);

    // Branch is required (defaults to "Kannur" but ensure a real value)
    await this._selectFirstReal(this.branchSelect, 'Branch');

    // Entering the phone triggers an async customer lookup. Because this is a
    // new number, the "New Customer" modal pops up — fill & save it to create
    // the customer, which then populates the enquiry's customer fields.
    await this._safeFill(this.mobileInput, data.mobile);
    await this.handleNewCustomerModal(data.customerName, data.email);

    // If no modal appeared (existing customer), set the name directly.
    if (await this.customerNameInput.inputValue().catch(() => '') === '') {
      await this._safeFill(this.customerNameInput, data.customerName);
    }

    // Assign To is required
    await this._selectFirstReal(this.assignToSelect, 'Assign To');

    await this._safeFill(this.businessValueInput, data.unitPrice);
    await this._safeFill(this.descriptionInput,   data.description);
    await this._selectFirstReal(this.sourceSelect, 'Lead Source');

    // At least one item is REQUIRED ("Please choose at least one item")
    await this.addItem(data.product || 'Inverter', data.quantity || '1');

    // Avoid the "next follow-up date" requirement by marking it Not Required
    try {
      if (await this.noFollowupChk.count() > 0 && !(await this.noFollowupChk.isChecked())) {
        await this.noFollowupChk.check();
        console.log('  ☑️  Marked follow-up "Not Required"');
      }
    } catch { /* checkbox optional */ }

    await this.saveBtn.click();
    console.log('  💾 Save button clicked');
    await throwIfServerError(this.page);   // surface intermittent backend errors
  }

  /**
   * Handle the "New Customer" modal (#enquiry-new-customer-modal) that opens
   * after entering an unknown phone number. Fills the required Level + Customer
   * Name (+ email), saves it, and waits for it to close.
   */
  async handleNewCustomerModal(customerName, email) {
    const page = this.page;
    const modal = page.locator('#enquiry-new-customer-modal');

    // The async phone lookup opens this modal unpredictably; open it
    // deterministically via the "+" (ri-add-fill) icon next to the phone field.
    if (!(await modal.isVisible().catch(() => false))) {
      const grp = page.locator('#customer-phone')
        .locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
      await grp.locator('i.ri-add-fill').first().click({ timeout: 8000 }).catch(() => {});
    }
    try {
      await modal.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      console.log('  ℹ️  New Customer modal did not appear — existing customer or inline form');
      return;
    }
    console.log('  👤 New Customer modal opened — creating customer');

    // Individual/Business variants share duplicate IDs, so target the VISIBLE
    // controls by placeholder. Level defaults to a valid value ("Suspect"),
    // phone is pre-filled, so only Customer Name is required.
    await this._safeFill(
      modal.locator('input[placeholder="please enter name"]:visible').first(),
      customerName
    );
    if (email) {
      await this._safeFill(
        modal.locator('input[placeholder="please enter email address"]:visible').first(),
        email
      );
    }

    // Save the customer (real button id: #btn-customer-save; duplicated across
    // Individual/Business variants, so click the visible one)
    await page.locator('#btn-customer-save:visible').first().click();

    // The backend may return a SweetAlert after saving the customer. A success
    // alert is dismissed; an error (e.g. "Oops something went wrong / Error Code")
    // is surfaced as a clear failure rather than hanging the rest of the flow.
    const swal = page.locator('.swal2-popup');
    const sawSwal = await swal.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
    if (sawSwal) {
      const swalText = (await page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').trim();
      await page.locator('.swal2-confirm').click().catch(() => {});
      await swal.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
      if (/oops|something went wrong|error code|failed/i.test(swalText)) {
        throw new Error(`New-customer save failed (backend): "${swalText}"`);
      }
    }
    await modal.waitFor({ state: 'hidden', timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1000);
    console.log('  ✅ Customer created');
  }

  /**
   * Add a line item to the enquiry via the "Search Results" modal.
   * Opens #searchItemModal, searches by name, clicks the first result row,
   * then sets the quantity. The item is required for the enquiry to save.
   */
  async addItem(itemName, quantity) {
    const page = this.page;
    console.log(`  📦 Adding item "${itemName}" x${quantity}`);
    try {
      // Open the item-search modal via the magnifier (ri-search-line) INSIDE
      // the item search input-group. (The "+"/ri-add-fill opens a different
      // "add CRM item" modal; the magnifier opens #searchItemModal to pick an
      // existing inventory item.)
      await page.locator('#item-search-input').scrollIntoViewIfNeeded();
      const itemGrp = page.locator('#item-search-input')
        .locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
      await itemGrp.locator('i.ri-search-line').first().click({ timeout: 8000 });

      const modal = page.locator('#searchItemModal');
      await modal.waitFor({ state: 'visible', timeout: 10000 });

      await page.locator('#item-search-modal-input').fill(itemName);
      // Trigger the modal search (search icon inside the modal)
      await modal.locator('i.ri-search-line').first().click().catch(() => {});

      // Wait for a result row; if the term matched nothing, fall back to
      // listing all items (empty search) and take the first.
      const firstRow = modal.locator('table tbody tr').first();
      try {
        await firstRow.waitFor({ state: 'visible', timeout: 6000 });
      } catch {
        console.log(`  ↩️  "${itemName}" matched no item — listing all`);
        await page.locator('#item-search-modal-input').fill('');
        await modal.locator('i.ri-search-line').first().click().catch(() => {});
        await firstRow.waitFor({ state: 'visible', timeout: 8000 });
      }
      const rowBtn = firstRow.locator('button, a, i.ri-add-fill, [class*="add"]').first();
      if (await rowBtn.count() > 0) { await rowBtn.click(); }
      else { await firstRow.click(); }

      // Close the modal if it is still open
      if (await modal.isVisible().catch(() => false)) {
        await modal.locator('.btn-close').first().click().catch(() => {});
      }
      await page.waitForTimeout(800);

      // Set quantity on the added line
      const qty = this.quantityInput;
      if (await qty.count() > 0) { await qty.fill(String(quantity)); }
      console.log('  ✅ Item added');
    } catch (e) {
      console.log(`  ⚠️  addItem failed: ${e.message}`);
    }
  }

  /**
   * Read an existing customer (name + phone) from the Leads listing, to use as
   * the query for the "search existing customer" path.
   * @returns {Promise<{name:string, phone:string}|null>}
   */
  async getExistingCustomerFromLeads() {
    await this.page.goto(`${this.baseUrl}/leads`, { waitUntil: 'domcontentloaded' });
    await this.page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1200);
    return this.page.evaluate(() => {
      // Leads columns: SlNo, Number, Customer Name, Phone, ...
      const r = document.querySelector('table tbody tr');
      if (!r) return null;
      const c = [...r.querySelectorAll('td')].map(e => (e.textContent || '').trim());
      return { name: c[2] || '', phone: (c[3] || '').replace(/\D/g, '').slice(-10) };
    });
  }

  /**
   * WAY 2 — pick an EXISTING customer via the "Search Results" modal
   * (#searchModal): open it from the phone magnifier, search by phone/name in
   * #txtSearchBox, and click the matching result row to populate the form.
   * @param {string} query - phone number or name of an existing customer
   */
  async selectExistingCustomer(query) {
    const page = this.page;
    console.log(`  🔎 Selecting existing customer by "${query}"`);

    // Open the customer-search modal via the phone-field magnifier. Leaving the
    // phone empty forces the #searchModal (an exact phone would auto-fill).
    await this.mobileInput.fill('').catch(() => {});
    const grp = page.locator('#customer-phone')
      .locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
    await grp.locator('i.ri-search-line').first().click();

    const modal = page.locator('#searchModal');
    await modal.waitFor({ state: 'visible', timeout: 10000 });

    await page.locator('#txtSearchBox').fill(query);
    await modal.locator('i.ri-search-line').first().click().catch(() => {});

    const row = modal.locator('table tbody tr').first();
    await row.waitFor({ state: 'visible', timeout: 10000 });
    await row.click();
    await modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});

    // Confirm the form's customer name populated
    await page.waitForFunction(
      () => { const e = document.querySelector('#TxtCustomer'); return e && e.value.trim().length > 0; },
      { timeout: 8000 }
    ).catch(() => {});
    const name = await this.customerNameInput.inputValue().catch(() => '');
    console.log(`  ✅ Existing customer selected: "${name}"`);
  }

  /**
   * WAY 2 — create an enquiry for an EXISTING customer (search & choose), then
   * fill the rest of the form and save. Mirrors fillAndCreate but skips the
   * new-customer modal.
   * @param {string} query - existing customer phone or name
   * @param {object} data  - testData.enquiry (for value/description/item)
   */
  async fillAndCreateWithExisting(query, data) {
    await this._selectFirstReal(this.branchSelect, 'Branch');
    await this.selectExistingCustomer(query);
    await this._selectFirstReal(this.assignToSelect, 'Assign To');
    await this._safeFill(this.businessValueInput, data.unitPrice);
    await this._safeFill(this.descriptionInput,   data.description);
    await this._selectFirstReal(this.sourceSelect, 'Lead Source');
    await this.addItem(data.product || 'Inverter', data.quantity || '1');
    try {
      if (await this.noFollowupChk.count() && !(await this.noFollowupChk.isChecked())) {
        await this.noFollowupChk.check();
      }
    } catch { /* optional */ }
    await this.saveBtn.click();
    console.log('  💾 Save (existing-customer enquiry) clicked');
    await throwIfServerError(this.page);   // surface intermittent backend errors
  }

  /** Select the first non-placeholder option of a <select>. */
  async _selectFirstReal(locator, label) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      const value = await locator.evaluate(sel => {
        const opt = [...sel.options].find(o => o.value && !/^(choose|select|you)?$/i.test(o.text.trim()) && o.value !== '0');
        return opt ? opt.value : (sel.options[1] ? sel.options[1].value : '');
      });
      if (value) { await locator.selectOption(value); console.log(`  🔽 ${label} = selected`); }
    } catch {
      console.log(`  ⚠️  ${label} select not found — skipping`);
    }
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

  /**
   * Convert the open enquiry to a quotation. On the overview page this is the
   * "Create Quotation" header button, which navigates to /quotation/0/{id}
   * (prefilled) where it is saved via #btn-save-quotation.
   */
  async convertToQuotation() {
    console.log('  🔄 Clicking "Create Quotation"');
    await waitOverviewReady(this.page);
    await this.page.locator('#btn-create-quotation').waitFor({ state: 'visible', timeout: 15000 });
    await this.page.locator('#btn-create-quotation').click();
    await this.page.waitForURL(/\/quotation\//, { timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1500);

    const saveQ = this.page.locator('#btn-save-quotation');
    try {
      await saveQ.waitFor({ state: 'visible', timeout: 12000 });
      await saveQ.click();
      console.log('  💾 Quotation Save clicked');
    } catch {
      console.log('  ⚠️  #btn-save-quotation not found — left on quotation form');
    }
    await this.page.waitForTimeout(2500);
    console.log(`  ➡️  URL after convert: ${this.page.url()}`);
  }

  /**
   * Follow-up Status names mapped from the conceptual lifecycle states the test
   * suite uses. Won/Lost are driven by the Followup Status "Nature", not a
   * separate dropdown. ("In Follow-up" → an ongoing status.)
   */
  statusLabelFor(status) {
    const map = {
      'in follow-up': 'Interested',
      'in followup':  'Interested',
      'won':          'Got the business',
      'lost':         'Not interested',
    };
    return map[String(status).toLowerCase()] || status;
  }

  /**
   * Drive a lifecycle transition by recording a follow-up with the mapped
   * Followup Status (this is how the CRM moves a lead to Won/Lost/In-Follow-Up).
   */
  async updateStatus(status) {
    const label = this.statusLabelFor(status);
    console.log(`  🔃 Status "${status}" → recording follow-up "${label}"`);

    await waitOverviewReady(this.page);
    await this.page.locator('#btn-add-followup').waitFor({ state: 'visible', timeout: 15000 });
    await this.page.locator('#btn-add-followup').click();
    const modal = this.page.locator('#followupModal');
    await modal.waitFor({ state: 'visible', timeout: 10000 });

    await this.page.locator('#followup-status').selectOption({ label }).catch(async () => {
      await this.page.locator('#followup-status').selectOption({ index: 1 }).catch(() => {});
    });
    await this.page.waitForTimeout(900);

    // Lead Quality (revealed; required) — pick first real value
    try {
      const lq = this.page.locator('#lead-quality');
      await lq.waitFor({ state: 'visible', timeout: 4000 });
      const v = await lq.evaluate(s => {
        const o = [...s.options].find(o => o.value && !/^choose$/i.test(o.text.trim()) && o.value !== '0');
        return o ? o.value : '';
      });
      if (v) await lq.selectOption(v);
    } catch { /* not required for this status */ }

    try {
      const c = this.page.locator('#no-next-followup');
      if (await c.count() && !(await c.isChecked())) await c.check();
    } catch { /* optional */ }

    await this.page.locator('#followup-description').fill(`Status → ${status}`).catch(() => {});
    await this.page.locator('#btn-save-followup').click();
    await modal.waitFor({ state: 'hidden', timeout: 12000 }).catch(() => {});
    await this.page.waitForTimeout(1200);
    console.log(`  ✅ Follow-up recorded for "${status}"`);
  }

  /** Read the "Status :" value shown in the Enquiry Details panel. */
  async getCurrentStatus() {
    try {
      const t = await this.page.evaluate(() => {
        const hit = [...document.querySelectorAll('*')]
          .map(e => (e.childElementCount === 0 ? (e.textContent || '').trim() : ''))
          .find(x => /^status\s*:/i.test(x));
        return hit || '';
      });
      return t.replace(/^status\s*:/i, '').trim();
    } catch {
      return '';
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
