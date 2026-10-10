'use strict';

const { getAlertText, waitOverviewReady, throwIfServerError } = require('../../common/helpers');
const { tenant, AUTOMATION_NAME, JUNK_SOURCE } = require('../../common/tenantData');

class EnquiryPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://test.erp.progbiz.in';

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
    this.itemSearchInput   = page.locator('#item-search-input');   // <select> on the Aug-2026 build, text input + search modal on older ones — see addItem()
    this.quantityInput     = page.locator('#new-item-quantity');
    this.addItemBtn        = page.locator('#btn-add-item');

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

  /** Open the Add Enquiry form, retrying the (slow, AJAX) form load up to 3×. */
  async openAddForm() {
    for (let i = 0; i < 3; i++) {
      try { await this.clickAddNew(); return; }
      catch { await this.page.waitForTimeout(2500); }
    }
    await this.clickAddNew();   // final attempt surfaces the error
  }

  /** Option labels of the Followup Status (#followup) dropdown. */
  followupStatusOptions() { return this.followupSelect.locator('option').allTextContents(); }

  /** Select a Followup Status by label and let the conditional fields settle. */
  async selectFollowup(label) {
    await this.followupSelect.selectOption({ label }).catch(() => {});
    await this.page.waitForTimeout(900);
  }

  /**
   * Whether the Lead Quality (Cold/Warm/Hot) field is visible (appears only
   * for In-Followup statuses; conditionally rendered, not just css-hidden —
   * it's absent from the DOM entirely for New Enquiry).
   *
   * Was `'#lead-quality, [id*="quality" i]'` — that broad fallback meant
   * once #lead-quality stopped existing in the DOM, `.first()` fell through
   * to whatever ELSE on the page happened to have "quality" in its id, which
   * is how this started reporting Lead Quality as visible for New Enquiry
   * (2026-09-18 re-audit). #lead-quality is the field; if it isn't there,
   * it isn't visible — no substring fallback needed.
   */
  leadQualityVisible() {
    const lq = this.page.locator('#lead-quality');
    return lq.count().then((n) => n > 0 && lq.first().isVisible()).catch(() => false);
  }

  /**
   * Whether Lead Quality is currently REQUIRED (label "Lead Quality*" or the
   * control's own `required`). As of the 2026-09-18 re-audit the field is
   * always rendered and visible; what the Followup Status changes is whether
   * it's mandatory — optional for "New Enquiry", required for In-Followup
   * statuses such as "Interested".
   */
  leadQualityRequired() {
    return this.page.evaluate(() => {
      const e = document.querySelector('#lead-quality');
      if (!e) return false;
      const label = e.closest('.form-group,.mb-3,.col,.col-md-3,.col-md-4,.col-md-6,div')?.querySelector('label')?.innerText || '';
      return e.required || /\*/.test(label);
    }).catch(() => false);
  }

  /** Lead Quality option labels (when visible). */
  async leadQualityOptions() {
    const lq = this.page.locator('#lead-quality').first();
    return (await lq.count()) ? lq.locator('option').allTextContents() : [];
  }

  descriptionVisible() { return this.descriptionInput.isVisible().catch(() => false); }

  /** Branch dropdown option labels. */
  branchOptions() { return this.branchSelect.locator('option').allTextContents(); }
  /** Lead Source dropdown option labels. */
  leadSourceOptions() { return this.sourceSelect.locator('option').allTextContents(); }
  /** Auto-generated enquiry number value. */
  enquiryNumber() { return this.page.locator('#enquiry-number').inputValue().catch(() => ''); }
  /** Enquiry date field value. */
  enquiryDate() { return this.page.locator('#enquiry-date').inputValue().catch(() => ''); }

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
    await this.selectLeadSource();

    // At least one item is REQUIRED ("Please choose at least one item")
    await this.addItem(data.product || tenant().item, data.quantity || '1');

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
    // controls by placeholder. Two build variants exist:
    //  - old: single name field  (placeholder "please enter name")
    //  - DEV: split #first-name / #last-name + a display-name combo (#cust-disp-ind)
    const oldName = modal.locator('input[placeholder="please enter name"]:visible').first();
    if (await oldName.count()) {
      await this._safeFill(oldName, customerName);
    } else {
      const parts = String(customerName).split(/\s+/);
      await this._safeFill(modal.locator('#first-name:visible, input[placeholder="please enter first name"]:visible').first(), parts[0]);
      if (parts.length > 1) {
        await this._safeFill(modal.locator('#last-name:visible, input[placeholder="please enter last name"]:visible').first(), parts.slice(1).join(' '));
      }
      // display name (type-ahead combo) — type the full name so the record shows it
      await this._safeFill(modal.locator('#cust-disp-ind:visible, input[placeholder*="display name" i]:visible').first(), customerName);
    }
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
   * Add a line item to the enquiry.
   *
   * The item picker has two shapes depending on the tenant's build, and this
   * handles both by looking at what #item-search-input actually is:
   *   - <select> (Aug-2026 build, e.g. lesol_test): a plain list of the
   *     tenant's items, committed with #btn-add-item.
   *   - <input type=text> + magnifier (older build, e.g. onetouch_test): the
   *     magnifier opens #searchItemModal, you search and click a result row,
   *     then commit with #btn-add-item.
   *
   * Flow: choose item -> set quantity -> click add -> confirm the row landed.
   * The item is required for the enquiry to save, so this THROWS on failure
   * rather than logging and continuing — a silent miss here used to surface
   * as an unrelated assertion failure several steps later.
   */
  async addItem(itemName, quantity) {
    console.log(`  📦 Adding item "${itemName}" x${quantity}`);

    await this.itemSearchInput.waitFor({ state: 'visible', timeout: 20000 });
    await this.itemSearchInput.scrollIntoViewIfNeeded();

    const tag = await this.itemSearchInput.evaluate((el) => el.tagName);
    return tag === 'SELECT'
      ? this._addItemFromSelect(itemName, quantity)
      : this._addItemFromModal(itemName, quantity);
  }

  /**
   * Older picker: type-less input + magnifier -> "Search Results" modal.
   * The modal's search box id differs between builds (#item-search-modal-input
   * once, #searchItemModal-modal-input now), so it is found by position.
   * Like the <select> path, a name the tenant doesn't have falls back to the
   * first real entry (an empty search lists every item).
   */
  async _addItemFromModal(itemName, quantity) {
    const page = this.page;

    // The magnifier is inside the item input-group. (The "+" beside it,
    // ri-add-fill, opens a different "New Item" modal — never click that.)
    const group = this.itemSearchInput
      .locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
    await group.locator('i.ri-search-line').first().click({ timeout: 15000 });

    const modal = page.locator('#searchItemModal');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    const searchBox = modal.locator('input[type="text"]').first();
    const searchIcon = modal.locator('i.ri-search-line').first();
    const rows = modal.locator('table tbody tr');

    const search = async (term) => {
      await searchBox.fill(term);
      await searchIcon.click().catch(() => {});
      await page.waitForTimeout(1500);
      return rows.count();
    };

    let found = await search(String(itemName));
    if (!found) found = await search('');          // not in this tenant -> list all
    if (!found) throw new Error('item search modal (#searchItemModal) lists no items');

    // Exact name, else first containing it, else the first row. The name is the
    // first cell (the others are Price and IsIncTax).
    const names = (await rows.locator('td:first-child').allInnerTexts())
      .map((t) => t.replace(/\s+/g, ' ').trim());
    const want = String(itemName).replace(/\s+/g, ' ').trim().toLowerCase();
    let idx = names.findIndex((n) => n.toLowerCase() === want);
    if (idx < 0) idx = names.findIndex((n) => n.toLowerCase().includes(want));
    if (idx < 0) idx = 0;
    const choice = { value: names[idx], text: names[idx] };
    if (choice.text.toLowerCase() !== want) {
      console.log(`  ↩️  "${itemName}" not in this tenant's list — using "${choice.text}"`);
    }

    await rows.nth(idx).click({ timeout: 15000 });
    await modal.waitFor({ state: 'hidden', timeout: 10000 });   // picking a row closes it

    await this.quantityInput.fill(String(quantity));
    await this.addItemBtn.click({ timeout: 15000 });

    // Confirm the line landed in the enquiry's own grid. Direct-child selectors
    // matter: the search modal sits inside this table and has rows of its own.
    const line = page.locator('table:has(#item-search-input) > tbody > tr')
      .filter({ hasText: choice.text }).first();
    await line.waitFor({ state: 'visible', timeout: 15000 });
    console.log(`  ✅ Item added: ${choice.text} x${quantity}`);
    return choice;
  }

  /** Newer picker: a plain <select> of the tenant's items. */
  async _addItemFromSelect(itemName, quantity) {
    // Resolve the option: exact label, else first containing the name, else
    // the first real entry (value "0" is the "-- Select Item --" placeholder).
    const choice = await this.itemSearchInput.evaluate((sel, wanted) => {
      const opts = [...sel.options].filter((o) => o.value && o.value !== '0');
      if (!opts.length) return null;
      const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const target = norm(wanted || '');
      const hit =
        opts.find((o) => norm(o.text) === target) ||
        opts.find((o) => norm(o.text).includes(target)) ||
        opts[0];
      return { value: hit.value, text: hit.text.replace(/\s+/g, ' ').trim() };
    }, itemName);

    if (!choice) throw new Error('item picker (#item-search-input) has no selectable items');
    if (choice.text.toLowerCase() !== String(itemName).toLowerCase()) {
      console.log(`  ↩️  "${itemName}" not in this tenant's list — using "${choice.text}"`);
    }

    await this.itemSearchInput.selectOption(choice.value);
    await this.quantityInput.fill(String(quantity));
    await this.addItemBtn.click({ timeout: 15000 });

    // Confirm the line actually landed in the grid before moving on.
    const row = this.page.locator('table tbody tr').filter({ hasText: choice.text }).first();
    await row.waitFor({ state: 'visible', timeout: 15000 });
    console.log(`  ✅ Item added: ${choice.text} x${quantity}`);
    return choice;
  }

  /**
   * Read an existing customer (name + phone) from the Leads listing, to use as
   * the query for the "search existing customer" path.
   * @returns {Promise<{name:string, phone:string}|null>}
   */
  async getExistingCustomerFromLeads() {
    // Only customers this suite created may be reused — a real client must never
    // get test enquiries (and Won/Lost statuses) attached to their record.
    await this.page.goto(`${this.baseUrl}/leads`, { waitUntil: 'domcontentloaded' });
    await this.page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1200);
    const hit = await this.page.evaluate((src) => {
      const auto = new RegExp(src, 'i');
      const heads = [...document.querySelectorAll('table thead th')].map(e => (e.textContent || '').trim().toLowerCase());
      const iName = heads.findIndex(h => /customer name/.test(h));
      const iPhone = heads.findIndex(h => /phone/.test(h));
      for (const r of document.querySelectorAll('table tbody tr')) {
        const c = [...r.querySelectorAll('td')].map(e => (e.textContent || '').trim());
        const name = c[iName] || '';
        if (auto.test(name)) return { name, phone: (c[iPhone] || '').replace(/\D/g, '').slice(-10) };
      }
      return null;
    }, AUTOMATION_NAME.source);
    if (!hit) console.log('  ℹ️  No automation-created customer on /leads page 1 — a new one will be created');
    return hit;
  }

  /** Lead Source: the tenant's configured source, else the first REAL one (never "All"/blank). */
  async selectLeadSource() {
    try {
      await this.sourceSelect.waitFor({ state: 'visible', timeout: 5000 });
      const want = tenant().leadSource;
      const value = await this.sourceSelect.evaluate((sel, { want, junk }) => {
        const j = new RegExp(junk, 'i');
        const opts = [...sel.options].filter(o => o.value && o.value !== '0' && !j.test(o.text.trim()));
        const hit = (want && opts.find(o => o.text.trim().toLowerCase() === want.toLowerCase())) || opts[0];
        return hit ? hit.value : '';
      }, { want, junk: JUNK_SOURCE.source });
      if (value) { await this.sourceSelect.selectOption(value); console.log('  🔽 Lead Source = selected'); }
    } catch {
      console.log('  ⚠️  Lead Source select not found — skipping');
    }
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
    await this.selectLeadSource();
    await this.addItem(data.product || tenant().item, data.quantity || '1');
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
    await this.page.waitForTimeout(1500);

    // The /leads rows contain NO anchors/buttons — navigation is a JS handler on the
    // ENQ-number / customer-name CELLS. Clicking the row body or hunting for <a> does
    // nothing (the old anchor-based strategies silently left us on /leads).
    await this.page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });
    for (const nth of [1, 2]) {              // td[1] = ENQ number, td[2] = customer name
      await this.page.locator('table tbody tr').first().locator('td').nth(nth).click().catch(() => {});
      const ok = await this.page.waitForURL(/enquiry-overview/i, { timeout: 8000 }).then(() => true).catch(() => false);
      if (ok) {
        console.log(`  🔗 Opened first enquiry via td[${nth}] — URL: ${this.page.url()}`);
        return;
      }
    }
    throw new Error(`openFirstEnquiry: clicking ENQ/customer cells did not reach enquiry-overview (still on ${this.page.url()})`);
  }

  /**
   * Convert the open enquiry to a quotation. On the overview page this is the
   * "Create Quotation" header button, which navigates to /quotation/0/{id}
   * (prefilled) where it is saved via #btn-save-quotation.
   */
  /**
   * "Create Quotation" is NOT a top-level button on this build — it's
   * `<a id="btn-create-quotation" class="dropdown-item">` inside the
   * #btn-enquiry-actions menu (alongside Edit Enquiry, Transfer To Branch,
   * Merge Duplicate), so it stays `hidden` until that dropdown is opened.
   * Waiting on #btn-create-quotation directly times out — "resolved to
   * hidden" — every time (2026-09-18 re-audit: crm_enquiry.spec.js ENQ-28).
   * crm_chain.spec.js's CH-06 already opens the dropdown first; this gives
   * both page-object methods below the same fix so every caller gets it.
   */
  async _openCreateQuotationMenuItem() {
    await this.page.locator('#btn-enquiry-actions').click({ timeout: 10000 });
    await this.page.waitForTimeout(2200);
    const item = this.page.locator('.dropdown-menu.show a, .dropdown-menu.show button')
      .filter({ hasText: /create quotation/i }).first();
    await item.waitFor({ state: 'visible', timeout: 10000 });
    return item;
  }

  /** Click "Create Quotation" and land on the prefilled /quotation/0/{id} form
   *  WITHOUT saving (so the form can be inspected/edited first). */
  async openQuotationForm() {
    console.log('  🔄 Opening Quotation form from enquiry');
    await waitOverviewReady(this.page);
    const item = await this._openCreateQuotationMenuItem();
    await item.click();
    await this.page.waitForURL(/\/quotation\//, { timeout: 15000 }).catch(() => {});
    await this.page.locator('#btn-save-quotation').waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
  }

  async convertToQuotation() {
    console.log('  🔄 Clicking "Create Quotation"');
    await waitOverviewReady(this.page);
    const item = await this._openCreateQuotationMenuItem();
    await item.click();
    await this.page.waitForURL(/\/quotation\//, { timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1500);

    // Two REQUIRED fields the prefill does NOT set — without them the save is blocked
    // by a "Please select lead quality" swal and we silently stay on /quotation/0/:
    const validUpto = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    await this.page.locator('#expdate').fill(validUpto).catch(() => {});
    await this.page.locator('#quotation-quality').selectOption({ index: 1 }).catch(() => {});
    await setFutureQuotationFollowup(this.page);
    console.log(`  📅 Valid Upto ${validUpto} + Lead Quality + future follow-up date set`);

    const saveQ = this.page.locator('#btn-save-quotation');
    try {
      await saveQ.waitFor({ state: 'visible', timeout: 12000 });
      await saveQ.click();
      console.log('  💾 Quotation Save clicked');
    } catch {
      console.log('  ⚠️  #btn-save-quotation not found — left on quotation form');
    }
    // a successful save navigates off the /quotation/0/ create form
    await this.page.waitForURL((u) => !/\/quotation\/0\//.test(String(u)), { timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    console.log(`  ➡️  URL after convert: ${this.page.url()}`);
  }

  /**
   * Follow-up Status names mapped from the conceptual lifecycle states the test
   * suite uses. Won/Lost are driven by the Followup Status "Nature", not a
   * separate dropdown. ("In Follow-up" → an ongoing status.)
   */
  statusLabelFor(status) {
    const st = tenant().status;
    const map = {
      'new': st.new, 'in follow-up': st.inFollowup, 'in followup': st.inFollowup,
      'won': st.won, 'lost': st.lost,
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
  /** Read the overview's status lines: "Status : <lifecycle>" and "Followup Status : <label>".
   *  The value can live in a SIBLING element (so read the parent line), and the panel
   *  AJAX-loads slowly — poll until a real value (not just the bare labels) appears.
   *  Returns the combined line text, e.g. "Status : In FollowUp | Followup Status : Interested". */
  async getCurrentStatus() {
    for (let i = 0; i < 10; i++) {
      const t = await this.page.evaluate(() => {
        // VISIBLE leaves only — the closed #followupModal also contains a
        // "Followup Status :" label (value "Choose") that must not be read.
        const leaves = [...document.querySelectorAll('*')]
          .filter(e => e.childElementCount === 0 && e.getClientRects().length > 0);
        const out = [];
        for (const e of leaves) {
          const txt = (e.textContent || '').replace(/\s+/g, ' ').trim();
          if (/^(followup\s*)?status\s*:/i.test(txt) && txt.length < 60) {
            const line = ((e.parentElement && e.parentElement.textContent) || txt)
              .replace(/\s+/g, ' ').trim().slice(0, 120);
            out.push(line);
          }
        }
        return [...new Set(out)].join(' | ');
      }).catch(() => '');
      // keep polling until some VALUE exists beyond the bare labels
      const valueOnly = t.replace(/(followup\s*)?status\s*:/gi, '').replace(/\|/g, ' ').trim();
      if (valueOnly) return t;
      await this.page.waitForTimeout(1500);
    }
    return '';
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

/**
 * Quotation form: set "Next FollowUp Date" (#firstfollowupdate) 2 days ahead.
 * Its default can sit below the field's own minimum (QT-F1), which blocks Save
 * with "Follow-up date cannot be in the past." — a save test must not depend on it.
 */
async function setFutureQuotationFollowup(page) {
  const f = page.locator('#firstfollowupdate');
  if (!(await f.count().catch(() => 0))) return false;
  const d = new Date(Date.now() + 2 * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
  await f.fill(v).catch(() => {});
  await page.waitForTimeout(300);
  return true;
}

module.exports.setFutureQuotationFollowup = setFutureQuotationFollowup;
