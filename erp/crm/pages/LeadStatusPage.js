'use strict';

const { throwIfServerError } = require('../../common/helpers');

/**
 * CRM → Settings → Lead Status  (/lead-status, heading "Followup Status")
 * Configures follow-up statuses and their lifecycle "Nature" (In Followup / Won
 * / Lost) — the master that drives Won/Lost classification across the CRM.
 * New Followup Status → #followup-status modal → name + Nature select → Save.
 */
class LeadStatusPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    this.newBtn       = page.locator('a, button').filter({ hasText: /new followup status/i }).first();
    this.modal        = page.locator('#followup-status');
    this.nameInput    = this.modal.locator('input[type="text"]:visible, input[placeholder*="status name" i]').first();
    this.natureSelect = this.modal.locator('select').first();
    this.saveBtn      = this.modal.locator('button').filter({ hasText: /^\s*save\s*$/i }).first();
    this.closeBtn     = this.modal.locator('button').filter({ hasText: /^\s*close\s*$/i }).first();
    this.search       = page.locator('#filter-name');
    this.rows         = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/lead-status`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    console.log(`  📋 Lead Status (Followup Status) loaded: ${this.page.url()}`);
  }

  /**
   * Create a follow-up status with a lifecycle Nature. Returns the validation
   * message (e.g. duplicate "...already exist") or null on success; throws only
   * on a genuine backend error.
   */
  async create(name, nature) {
    console.log(`  ➕ New Followup Status: "${name}" (nature=${nature})`);
    await this.newBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 });
    await this.nameInput.fill(name);
    await this.natureSelect.selectOption({ label: nature }).catch(async () => {
      await this.natureSelect.selectOption({ index: 1 }).catch(() => {});
    });
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
    if (await this.modal.isVisible().catch(() => false)) await this.closeBtn.click().catch(() => {});
    await this.page.waitForTimeout(800);
    return msg;
  }

  async findRow(name) {
    await this.search.fill(name);
    await this.search.press('Enter').catch(() => {});
    const row = this.page.locator('table tbody tr').filter({ hasText: name }).first();
    await row.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    return { row, exists: (await row.count()) > 0 };
  }

  async existsInList(name) {
    return (await this.findRow(name)).exists;
  }

  /** Edit (pencil) → rename via the prefilled #followup-status modal → save. */
  async edit(name, newName) {
    console.log(`  ✏️  Edit Followup Status "${name}" → "${newName}"`);
    const { row, exists } = await this.findRow(name);
    if (!exists) throw new Error(`edit: row "${name}" not found`);
    await row.locator('a:has(i.ri-pencil-line)').first().click();
    await this.modal.waitFor({ state: 'visible', timeout: 10000 });
    await this.nameInput.fill(newName);
    await this.saveBtn.click();
    await this.page.waitForTimeout(1500);
    return this._afterSave();
  }

  /** Delete (trash) → confirm. Returns true once the row is gone. */
  async delete(name) {
    console.log(`  🗑️  Delete Followup Status "${name}"`);
    const { row, exists } = await this.findRow(name);
    if (!exists) throw new Error(`delete: row "${name}" not found`);
    await row.locator('a:has(i.ri-delete-bin-5-fill)').first().click();
    await this.page.waitForTimeout(1500);
    await this._dismissSwalChain();
    return !(await this.findRow(name)).exists;
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
}

module.exports = { LeadStatusPage };
