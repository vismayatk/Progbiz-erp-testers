'use strict';

/**
 * Inventory → Items  (/items list, /item create form "Product")
 * Linked to CRM (Enquiry/Quotation item selection). Create form: #item-name
 * (required) + optional Group/Category/UOM/Brand → "Save Item". Item names are
 * unique — a duplicate is rejected. Edit/Delete via the /items Action column.
 */
class ItemPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    this.nameInput      = page.locator('#item-name');
    this.categorySelect = page.locator('#category');
    this.saveBtn        = page.locator('button, a.btn').filter({ hasText: /save item/i }).first();
    this.search         = page.locator('#filter-name');
  }

  async gotoForm() {
    await this.page.goto(`${this.baseUrl}/item`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await this.nameInput.waitFor({ state: 'visible', timeout: 15000 });
  }

  async gotoList() {
    await this.page.goto(`${this.baseUrl}/items`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await this.page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  }

  /**
   * Create an item via the Product form. Returns the validation message
   * (e.g. duplicate "...already exist"), or null on success.
   */
  async create(name, category) {
    console.log(`  ➕ New Item: "${name}"`);
    await this.gotoForm();
    await this.nameInput.fill(name);
    if (category) await this.categorySelect.selectOption({ label: category }).catch(() => {});
    await this.saveBtn.click();
    await this.page.waitForTimeout(2500);
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
      if (/success|saved|added/i.test(msg)) msg = null;   // success
    } else if (/\/items(\b|$)/.test(this.page.url())) {
      msg = null;   // navigated back to the list → success
    }
    await this.page.waitForTimeout(800);
    return msg;
  }

  async findRow(name) {
    await this.gotoList();
    await this.search.fill(name);
    await this.search.press('Enter').catch(() => {});
    const row = this.page.locator('table tbody tr').filter({ hasText: name }).first();
    await row.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    return { row, exists: (await row.count()) > 0 };
  }

  async existsInList(name) {
    return (await this.findRow(name)).exists;
  }

  /** Delete an item via the /items Action column (trash) + confirm. */
  async delete(name) {
    console.log(`  🗑️  Delete Item "${name}"`);
    const { row, exists } = await this.findRow(name);
    if (!exists) throw new Error(`delete: item "${name}" not found`);
    await row.locator('a:has(i.ri-delete-bin-5-fill)').first().click();
    await this.page.waitForTimeout(1500);
    for (let i = 0; i < 3; i++) {
      const c = this.page.locator('.swal2-confirm');
      if (await c.isVisible().catch(() => false)) {
        const t = (await this.page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').trim();
        if (/oops|something went wrong|error code/i.test(t)) { await c.click().catch(() => {}); throw new Error(`Backend error on delete: "${t}"`); }
        await c.click().catch(() => {});
        await this.page.waitForTimeout(1200);
      } else break;
    }
    return !(await this.findRow(name)).exists;
  }
}

module.exports = { ItemPage };
