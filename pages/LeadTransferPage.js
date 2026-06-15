'use strict';

/**
 * CRM → Lead Transfer  (/bulk-lead-transfer)
 *
 * Flow: Apply Filters → leads table (checkbox + "Current Assignee" column) →
 * select lead(s) → choose "Transfer To" executive → "Transfer Selected (N)" →
 * confirm "Are you sure…" → "Successfully transferred N lead(s)."
 *
 * Note: the lead-load occasionally returns a backend JSON error
 * (ExpectedStartOfValueNotFound); applyFilters() retries through it.
 */
class LeadTransferPage {
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    this.applyBtn    = page.locator('button', { hasText: /apply filter/i }).first();
    this.transferBtn = page.locator('button', { hasText: /transfer selected/i }).first();
    this.execSelect  = page.locator('select').filter({ has: page.locator('option', { hasText: /Select Executive/i }) }).first();
    this.rows        = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/bulk-lead-transfer`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(2000);
    await this._dismissSwal();
  }

  /** Retry "Apply Filters" through intermittent backend swal errors. Returns row count. */
  async applyFilters() {
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
   * Select the first lead, choose an executive, transfer, and confirm.
   * @returns {Promise<string|null>} the result message ("Successfully transferred …" or backend error)
   */
  async transferFirstLeadTo(executive) {
    const row = this.rows.first();
    await row.locator('input[type=checkbox]').check()
      .catch(() => row.locator('input[type=checkbox]').click().catch(() => {}));
    await this.page.waitForTimeout(700);
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

  /** Re-apply filters and read the Current Assignee of the lead with this phone. */
  async assigneeOf(phone) {
    await this.applyFilters();
    return this.page.evaluate((ph) => {
      const norm = s => (s || '').replace(/\D/g, '');
      for (const r of document.querySelectorAll('table tbody tr')) {
        const c = [...r.querySelectorAll('td')].map(e => (e.textContent || '').trim());
        if (c.some(x => norm(x).includes(norm(ph).slice(-10)))) return c[c.length - 1];
      }
      return null;
    }, phone);
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
