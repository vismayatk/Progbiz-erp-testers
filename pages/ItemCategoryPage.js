'use strict';

/**
 * Inventory → Settings → Item Categories  (/item-categories)
 * Linked to CRM (the Enquiry/Dashboard "Item Category" filters). Uses an INLINE
 * add form (not a modal): #categoryname + Save. Category names are unique —
 * a duplicate is rejected with an "...already exist" message.
 */
class ItemCategoryPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    this.nameInput = page.locator('#categoryname');
    // Save button of the inline add form (first Save following the name field)
    this.saveBtn   = page.locator('#categoryname')
      .locator('xpath=following::button[normalize-space()="Save"][1]');
    this.search    = page.locator('#filter-name');
    this.rows      = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/item-categories`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await this.nameInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    console.log(`  📋 Item Categories loaded: ${this.page.url()}`);
  }

  /** Create a category; returns the validation message (duplicate) or null on success. */
  async create(name) {
    console.log(`  ➕ New Item Category: "${name}"`);
    await this.nameInput.fill(name);
    await this.saveBtn.first().click();
    await this.page.waitForTimeout(1500);
    const swal = this.page.locator('.swal2-popup');
    let msg = null;
    if (await swal.isVisible().catch(() => false)) {
      msg = (await this.page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
      await this.page.locator('.swal2-confirm').click().catch(() => {});
      await swal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      if (/oops|something went wrong|error code/i.test(msg)) throw new Error(`Backend server error: "${msg}"`);
      if (/success|saved successfully|added successfully/i.test(msg)) msg = null;  // success
    }
    await this.nameInput.fill('').catch(() => {});   // reset the inline form
    await this.page.waitForTimeout(600);
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

  /** Edit (pencil) → the inline #categoryname form repopulates → rename → Save. */
  async edit(name, newName) {
    console.log(`  ✏️  Edit Item Category "${name}" → "${newName}"`);
    const { row, exists } = await this.findRow(name);
    if (!exists) throw new Error(`edit: row "${name}" not found`);
    await row.locator('a:has(i.ri-pencil-line)').first().click();
    await this.page.waitForTimeout(1200);
    await this.nameInput.fill(newName);
    await this.saveBtn.first().click();
    await this.page.waitForTimeout(1500);
    let msg = null;
    const swal = this.page.locator('.swal2-popup');
    if (await swal.isVisible().catch(() => false)) {
      msg = (await this.page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
      await this.page.locator('.swal2-confirm').click().catch(() => {});
      await swal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      if (/oops|something went wrong|error code/i.test(msg)) throw new Error(`Backend error: "${msg}"`);
      if (/success|saved|updated/i.test(msg)) msg = null;
    }
    await this.nameInput.fill('').catch(() => {});
    return msg;
  }

  /** Delete (trash) → confirm. Returns true once the row is gone. */
  async delete(name) {
    console.log(`  🗑️  Delete Item Category "${name}"`);
    const { row, exists } = await this.findRow(name);
    if (!exists) throw new Error(`delete: row "${name}" not found`);
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

module.exports = { ItemCategoryPage };
