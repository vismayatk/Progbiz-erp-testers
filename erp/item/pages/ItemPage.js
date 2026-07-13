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
    // Prefer the explicit "Save Item"; else the VISIBLE "Save" (dev labels it
    // "Save" and also has hidden inline-save buttons we must avoid).
    this.saveBtn        = page.locator('button:visible, a.btn:visible')
      .filter({ hasText: /save item|^\s*save\s*$/i }).last();
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

  /**
   * Create with an explicit field set (any field may be omitted/blank to test
   * validation). Returns the validation message, or null on success.
   * Fields: {name, variant, category, brand, description}.
   */
  async createWith(fields = {}) {
    const { name, variant, category, brand, description } = fields;
    await this.gotoForm();
    if (name !== undefined) await this.nameInput.fill(name);
    if (variant !== undefined) await this.page.locator('#variant-name').fill(variant).catch(() => {});
    if (category === '*') {
      // pick the first REAL category (skip the "Choose.." placeholder)
      await this.categorySelect.evaluate(s => {
        const opt = [...s.options].find(o => o.value && !/choose|select|^\s*$/i.test(o.textContent));
        if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
      }).catch(() => {});
    } else if (category) await this.categorySelect.selectOption({ label: category }).catch(() => {});
    if (brand) await this.page.locator('#brand').selectOption({ label: brand }).catch(() => {});
    if (description) await this.page.locator('#description').fill(description).catch(() => {});
    await this.saveBtn.click();
    await this.page.waitForTimeout(2000);
    return this._afterSaveOrValidation();
  }

  /** _afterSave, plus inline (jQuery-validate) message detection when the form stays put. */
  async _afterSaveOrValidation() {
    const swalMsg = await this._afterSave();
    if (swalMsg) return swalMsg;
    if (/\/item(\b|$)/.test(this.page.url()) && !/\/items/.test(this.page.url())) {
      const re = /please (provide|enter|choose|select)|required|cannot be (empty|blank)|invalid|not valid|valid (name|item)|already exist/i;
      for (let i = 0; i < 3; i++) {
        const inline = await this.page.evaluate((src) => {
          const r = new RegExp(src, 'i');
          for (const e of document.querySelectorAll('*')) {
            if (e.children.length > 0) continue;            // leaf nodes only
            if (e.getClientRects().length === 0) continue;  // visible only
            const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
            if (t && t.length < 90 && r.test(t)) return t;
          }
          return null;
        }, re.source);
        if (inline) return inline;
        await this.page.waitForTimeout(700);
      }
    }
    return null;
  }

  /** Edit an item's name via the /items Action column. Returns null on success. */
  async editItem(name, newName) {
    console.log(`  ✏️  Edit Item "${name}" → "${newName}"`);
    const { row, exists } = await this.findRow(name);
    if (!exists) throw new Error(`edit: item "${name}" not found`);
    const editBtn = row.locator('a:has(i[class*="pencil"]), a:has(i[class*="edit"]), [title*="edit" i], a.btn-primary-light, [data-bs-title="Edit" i]').first();
    await editBtn.click().catch(() => {});
    await this.nameInput.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    await this.page.waitForTimeout(800);
    await this.nameInput.fill(newName);
    await this.saveBtn.click();
    await this.page.waitForTimeout(2000);
    return this._afterSaveOrValidation();
  }

  /** Click Cancel on the create form and confirm we leave without saving.
   *  Returns the resulting URL, or null when this build's item form exposes
   *  no Cancel control at all (e.g. the DEV redesign has none). */
  async cancelCreate(name) {
    await this.gotoForm();
    await this.nameInput.fill(name);
    const cancel = this.page.locator('button:visible, a:visible').filter({ hasText: /^\s*cancel\s*$/i }).first();
    if (!(await cancel.count())) return null;
    await cancel.click().catch(() => {});
    await this.page.waitForTimeout(1500);
    return this.page.url();
  }

  async _afterSave() {
    const swal = this.page.locator('.swal2-popup');
    let msg = null;
    if (await swal.isVisible().catch(() => false)) {
      msg = (await this.page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
      await this.page.locator('.swal2-confirm').click().catch(() => {});
      await swal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      if (/oops|something went wrong|error code/i.test(msg)) throw new Error(`Backend server error: "${msg}"`);
      if (/success|saved|added|done|completed/i.test(msg)) msg = null;   // success ("You're done!!" on dev)
    } else if (/\/items(\b|$)/.test(this.page.url())) {
      msg = null;   // navigated back to the list → success
    }
    await this.page.waitForTimeout(800);
    return msg;
  }

  async findRow(name) {
    await this.gotoList();
    const row = this.page.locator('table tbody tr').filter({ hasText: name }).first();
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.search.fill('');
      await this.search.fill(name);
      await this.search.press('Enter').catch(() => {});
      await row.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      if (await row.count() > 0) break;
      await this.page.waitForTimeout(1500);
    }
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
    const delBtn = row.locator(
      'a:has(i[class*="delete"]), button:has(i[class*="delete"]), [data-bs-title="Delete" i], [title*="delete" i], a.btn-danger-light, .btn-danger'
    ).first();
    // Some tenants (e.g. dev) expose no Delete action on the /items list (Edit only).
    if (await delBtn.count() === 0) {
      console.log('  ℹ️  No Delete control on /items for this tenant — skipping delete');
      return null;   // delete not available
    }
    await delBtn.click();
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
