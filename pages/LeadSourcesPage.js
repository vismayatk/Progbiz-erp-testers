'use strict';

const { throwIfServerError } = require('../utils/helpers');

/**
 * CRM → Settings → Lead Sources  (/lead-sources)
 * Master list of lead sources. New Lead Source → #lead-source modal →
 * #lead-source-name (maxlength 30) → #btn-lead-source-save.
 */
class LeadSourcesPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    this.newBtn    = page.locator('a, button').filter({ hasText: /new lead source/i }).first();
    this.modal     = page.locator('#lead-source');
    this.nameInput = page.locator('#lead-source-name');
    this.saveBtn   = page.locator('#btn-lead-source-save');
    this.closeBtn  = page.locator('#btn-lead-source-close');
    this.search    = page.locator('#filter-name');
    this.rows      = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/lead-sources`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await this.rows.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    console.log(`  📋 Lead Sources loaded: ${this.page.url()}`);
  }

  /**
   * Create a lead source. Returns the validation message shown (e.g. the
   * "...already exist" duplicate message), or null on success.
   * Throws only on a genuine backend server error.
   */
  async create(name) {
    console.log(`  ➕ New Lead Source: "${name}"`);
    await this.newBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 });
    await this.nameInput.fill(name);
    await this.saveBtn.click();
    await this.page.waitForTimeout(1500);
    return this._afterSave();
  }

  async _afterSave() {
    const swal = this.page.locator('.swal2-popup');
    let msg = null;
    if (await swal.isVisible().catch(() => false)) {
      msg = (await this.page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
      await this.page.locator('.swal2-confirm').click().catch(() => {});
      await swal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      if (/oops|something went wrong|error code/i.test(msg)) throw new Error(`Backend server error: "${msg}"`);
      if (/success|saved successfully|added successfully/i.test(msg)) msg = null;  // success
    }
    // close the modal if it is still open (e.g. after a duplicate rejection)
    if (await this.modal.isVisible().catch(() => false)) await this.closeBtn.click().catch(() => {});
    await this.page.waitForTimeout(800);
    return msg;   // null = saved; otherwise the validation message
  }

  /** Search the list for a name and report whether a row contains it. */
  /** Search by name and return the matching row locator (and whether it exists). */
  async findRow(name) {
    await this.search.fill(name);
    await this.search.press('Enter').catch(() => {});   // trigger server-side filter
    const row = this.page.locator('table tbody tr').filter({ hasText: name }).first();
    await row.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    return { row, exists: (await row.count()) > 0 };
  }

  async existsInList(name) {
    const { exists } = await this.findRow(name);
    return exists;
  }

  /** Edit a row (pencil icon) → rename via the prefilled modal → save. Returns validation msg or null. */
  async edit(name, newName) {
    console.log(`  ✏️  Edit Lead Source "${name}" → "${newName}"`);
    const { row, exists } = await this.findRow(name);
    if (!exists) throw new Error(`edit: row "${name}" not found`);
    await row.locator('a:has(i.ri-pencil-line)').first().click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 });
    await this.nameInput.fill(newName);
    await this.saveBtn.click();
    await this.page.waitForTimeout(1500);
    return this._afterSave();
  }

  /** Delete a row (trash icon) → confirm. Returns true once the row is gone. */
  async delete(name) {
    console.log(`  🗑️  Delete Lead Source "${name}"`);
    const { row, exists } = await this.findRow(name);
    if (!exists) throw new Error(`delete: row "${name}" not found`);
    await row.locator('a:has(i.ri-delete-bin-5-fill)').first().click();
    await this.page.waitForTimeout(1500);
    // confirm dialog ("Are you sure…") then success
    await this._dismissSwalChain();
    const { exists: still } = await this.findRow(name);
    return !still;
  }

  async _dismissSwalChain() {
    for (let i = 0; i < 3; i++) {
      const c = this.page.locator('.swal2-confirm');
      if (await c.isVisible().catch(() => false)) {
        const t = (await this.page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').trim();
        if (/oops|something went wrong|error code/i.test(t)) { await c.click().catch(() => {}); throw new Error(`Backend error on delete: "${t}"`); }
        await c.click().catch(() => {});
        await this.page.waitForTimeout(1200);
      } else break;
    }
  }

  /** Max length enforced on the name field. */
  async nameMaxLength() {
    return this.nameInput.evaluate(el => el.maxLength);
  }
}

module.exports = { LeadSourcesPage };
