'use strict';

/**
 * CRM → Lead Transfer
 *
 * Until Nov 2026 this was its own page (/bulk-lead-transfer). That page is gone ("Sorry, there's
 * nothing at this address") and its menu entry with it. Leads are transferred from two places now:
 *
 *   Leads list (/leads) — the replacement for the bulk page, and what this page object drives:
 *     tick lead(s)  input#chk-lead-<enquiryId>-<quotationId>  →  a bulk bar appears with
 *     #btn-transfer-selected-leads "Transfer (n)", #btn-create-leads-from-selected,
 *     #btn-delete-selected-leads and #btn-bulk-clear-selection
 *     →  modal "Transfer Leads (n selected)":  #lead-transfer-executive (Auto Assign / You / each
 *     executive), #lead-transfer-followup-today ("Set next follow-up to today"),
 *     #btn-lead-transfer-save "Transfer", #btn-lead-transfer-close
 *
 *   A lead's overview — More (#btn-enquiry-actions) → Transfer Lead (#btn-transfer-branch) →
 *     #branch-transfer modal: #trasfer-branch, #branch-assignto, #btn-branch-trasfer "Save"
 *
 * The Leads list columns are read by their headings (Number, Customer Name, Phone, Assignee): the
 * list has a checkbox column in front and its columns differ between the Nature and Status views.
 *
 * On a build that still has /bulk-lead-transfer the old flow is used (Apply Filters → tick →
 * "Transfer To" → "Transfer Selected (N)").
 */
class LeadTransferPage {
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://test.erp.progbiz.in';

    // old page
    this.applyBtn    = page.locator('button', { hasText: /apply filter/i }).first();
    this.transferBtn = page.locator('button', { hasText: /transfer selected/i }).first();
    this.execSelect  = page.locator('select').filter({ has: page.locator('option', { hasText: /Select Executive/i }) }).first();
    this.rows        = page.locator('table tbody tr');
    // Leads list bulk transfer (Nov 2026)
    this.search          = page.locator('#filter-name');
    this.searchBtn       = page.locator('#btn-search-simple');
    this.bulkTransferBtn = page.locator('#btn-transfer-selected-leads');
    this.bulkClearBtn    = page.locator('#btn-bulk-clear-selection');
    this.transferModal   = page.locator('.modal.show').filter({ has: page.locator('#lead-transfer-executive') });
    this.transferTo      = page.locator('#lead-transfer-executive');
    this.transferSave    = page.locator('#btn-lead-transfer-save');

    /** 'bulk-page' (the old /bulk-lead-transfer) or 'leads-list' (Nov 2026). Set by goto(). */
    this.mode = null;
    this._phone = null;
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/bulk-lead-transfer`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(2000);
    await this._dismissSwal();
    const dead = await this.page.evaluate(() => /nothing at this address|page not found/i.test(document.body.innerText)).catch(() => false);
    this.mode = dead ? 'leads-list' : 'bulk-page';
    if (dead) {
      console.log('  ↪️  /bulk-lead-transfer is gone — transferring from the Leads list instead');
      await this._gotoLeads();
    }
  }

  async _gotoLeads() {
    await this.page.goto(`${this.baseUrl}/leads`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await this.rows.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1200);
  }

  /** Old page: retry "Apply Filters" through intermittent backend swal errors. Leads list: the rows already listed. Returns row count. */
  async applyFilters() {
    if (this.mode === 'leads-list') return this._dataRowCount();
    let rows = 0;
    for (let i = 0; i < 4 && rows === 0; i++) {
      await this._dismissSwal();
      await this.applyBtn.click({ timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(3000);
      const err = await this._swalText();
      if (err) await this._dismissSwal();
      rows = await this.rows.count().catch(() => 0);
      console.log(`  🔄 Apply Filters attempt ${i + 1}: rows=${rows}${err ? ` (backend err: ${err.slice(0, 60)})` : ''}`);
    }
    return rows;
  }

  /** Old page only: some tenants list NO leads until a Branch is chosen (the branch select starts on "Choose"). */
  async chooseBranch(branch) {
    if (this.mode === 'leads-list') return false;
    const sel = this.page.locator('select').filter({ has: this.page.locator('option', { hasText: /^\s*Choose\s*$/ }) })
      .filter({ has: this.page.locator('option', { hasText: branch }) }).first();
    if (!(await sel.count().catch(() => 0))) return false;
    await sel.selectOption({ label: branch }).catch(() => {});
    await this.page.waitForTimeout(1500);
    console.log(`  🏢 Branch = ${branch}`);
    return true;
  }

  _dataRowCount() {
    return this.page.evaluate(() => [...document.querySelectorAll('table tbody tr')]
      .filter((r) => r.getClientRects().length && r.querySelectorAll('td').length > 2).length);
  }

  /** Leads list: search the list for a phone (or name) and wait for the rows. */
  async _searchLeads(text) {
    await this.search.fill(String(text));
    await this.searchBtn.click().catch(async () => { await this.search.press('Enter').catch(() => {}); });
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(2200);
  }

  /** Read the row carrying this phone from the table now on screen, by column heading. */
  _readRow(phone) {
    return this.page.evaluate((ph) => {
      const norm = (s) => (s || '').replace(/\D/g, '');
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const t = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length)
        .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
      if (!t) return null;
      const hs = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
      const col = (re) => hs.findIndex((h) => re.test(h));
      const ni = col(/^number$/i), ci = col(/^customer name$/i), pi = col(/^phone$/i), ai = col(/assignee/i);
      const rows = [...t.querySelectorAll('tbody tr')];
      for (let i = 0; i < rows.length; i++) {
        const c = [...rows[i].querySelectorAll('td')].map((e) => clean(e.innerText));
        if (!c.some((x) => norm(x).length >= 9 && norm(x).endsWith(norm(ph).slice(-9)))) continue;
        return {
          index: i,
          number: ni >= 0 ? c[ni] : c[2], name: ci >= 0 ? c[ci] : c[3],
          phone: norm(pi >= 0 ? c[pi] : c[4]).slice(-10), assignee: ai >= 0 ? c[ai] : c[c.length - 1],
        };
      }
      return null;
    }, phone);
  }

  /** The lead row with this phone: { number, name, phone, assignee } or null. */
  async findLead(phone) {
    if (this.mode !== 'leads-list') return this._readRow(phone);
    this._phone = phone;
    if (!/\/leads/.test(this.page.url())) await this._gotoLeads();
    await this._searchLeads(String(phone).slice(-9));
    let row = await this._readRow(phone);
    // a lead sits under one of the four chips (New / In Follow Up / Won / Lost): look under each
    for (const id of ['tab-lead-new', 'tab-lead-infollowup', 'tab-lead-won', 'tab-lead-lost']) {
      if (row) break;
      const chip = this.page.locator(`#${id}`);
      if (!(await chip.count().catch(() => 0))) continue;
      await chip.click().catch(() => {});
      await this.page.waitForTimeout(2200);
      row = await this._readRow(phone);
    }
    return row;
  }

  /** Tick ONLY the lead with this phone, choose the executive, transfer and confirm. */
  async transferLeadTo(phone, executive) {
    if (this.mode !== 'leads-list') {
      const row = this.rows.filter({ hasText: String(phone).slice(-9) }).first();
      await row.locator('input[type=checkbox]').check()
        .catch(() => row.locator('input[type=checkbox]').click().catch(() => {}));
      await this.page.waitForTimeout(700);
      return this._transferSelected(executive);
    }
    const lead = await this.findLead(phone);
    if (!lead) throw new Error(`lead with phone ${phone} is not in the Leads list — nothing to transfer`);
    // clear anything already ticked, then tick this row only
    if (await this.bulkClearBtn.isVisible().catch(() => false)) { await this.bulkClearBtn.click().catch(() => {}); await this.page.waitForTimeout(500); }
    const box = this.page.locator('table tbody tr:visible').filter({ hasText: String(phone).slice(-9) }).first().locator('input[type=checkbox]').first();
    await box.check({ force: true }).catch(async () => { await box.click({ force: true }).catch(() => {}); });
    await this.bulkTransferBtn.waitFor({ state: 'visible', timeout: 8000 });
    const label = (await this.bulkTransferBtn.innerText()).replace(/\s+/g, ' ').trim();
    if (!/\(1\)/.test(label)) throw new Error(`expected exactly one lead selected, the bulk bar says "${label}"`);
    await this.bulkTransferBtn.click();
    await this.transferModal.waitFor({ state: 'visible', timeout: 10000 });
    await this.transferTo.selectOption({ label: executive });
    await this.page.waitForTimeout(400);
    await this.transferSave.click();

    // a confirm ("Are you sure…") and / or a result message may follow: walk them, keep the last text
    let result = null;
    for (let i = 0; i < 12; i++) {
      await this.page.waitForTimeout(1000);
      const txt = await this._swalText();
      if (txt) { result = txt; await this._dismissSwal(); continue; }
      const toast = (await this.page.locator('.toast:visible, .alert:visible').allInnerTexts().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
      if (toast) result = toast;
      if (!(await this.transferModal.isVisible().catch(() => false)) && i >= 2) break;
    }
    console.log(`  📨 Transfer result=${JSON.stringify(result)}`);
    return result;
  }

  /** Table columns: ['',SlNo,Number,Customer Name,Phone,Status,Stage,Date,Lead Source,Current Assignee] */
  async getFirstLead() {
    return this.page.evaluate(() => {
      const r = document.querySelector('table tbody tr');
      if (!r) return null;
      const c = [...r.querySelectorAll('td')].map(e => (e.textContent || '').trim());
      return { number: c[2], name: c[3], phone: (c[4] || '').replace(/\D/g, '').slice(-10), assignee: c[c.length - 1] };
    });
  }

  /**
   * Old page: select the first lead, choose an executive, transfer, and confirm.
   * @returns {Promise<string|null>} the result message ("Successfully transferred …" or backend error)
   */
  async transferFirstLeadTo(executive) {
    const row = this.rows.first();
    await row.locator('input[type=checkbox]').check()
      .catch(() => row.locator('input[type=checkbox]').click().catch(() => {}));
    await this.page.waitForTimeout(700);
    return this._transferSelected(executive);
  }

  async _transferSelected(executive) {
    await this.execSelect.selectOption({ label: executive });
    await this.transferBtn.click();

    // 1) the "Are you sure…" confirm swal → confirm it
    await this.page.locator('.swal2-popup').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const confirmTxt = await this._swalText();
    await this._dismissSwal();
    await this.page.locator('.swal2-popup').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    // 2) the result swal (success or backend error) — poll a generous window
    let result = null;
    for (let i = 0; i < 10 && !result; i++) { await this.page.waitForTimeout(1000); result = await this._swalText(); }
    await this._dismissSwal();
    console.log(`  📨 Transfer confirm=${JSON.stringify(confirmTxt)} result=${JSON.stringify(result)}`);
    return result;
  }

  /** Read the lead's assignee again from a fresh list (old page: re-apply the filters). */
  async assigneeOf(phone) {
    if (this.mode === 'leads-list') {
      await this._gotoLeads();
      return (await this.findLead(phone))?.assignee || null;
    }
    await this.applyFilters();
    return (await this.findLead(phone))?.assignee || null;
  }

  // ── private ──
  async _swalText() {
    const s = this.page.locator('.swal2-popup');
    if (await s.isVisible().catch(() => false)) {
      return (await this.page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').trim();
    }
    return null;
  }
  async _dismissSwal() {
    const c = this.page.locator('.swal2-confirm');
    if (await c.isVisible().catch(() => false)) { await c.click().catch(() => {}); await this.page.waitForTimeout(400); return true; }
    return false;
  }
}

module.exports = { LeadTransferPage };
