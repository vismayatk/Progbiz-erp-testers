'use strict';

/**
 * Inventory > Items  (/items list, /item form "Product")  — the ERP item master.
 * (The CRM tenant profile's /crm-items modal is a different page: see erp/item/pages/ItemPage.js.)
 *
 * Form: Item Name (#item-name, required), Group, Category, UOM, Brand, Sellable / Purchasable ticks,
 * Price (#new-item-price). "Add More Variant" (#price-tab) needs an item name first and then shows the
 * variant section (a grid: Default, Variant Name, then tabs Codes / Prices / Cost & reorder / Opening Stock).
 */
const { BASE, outcome, closeDialog, settle } = require('../../accounts/pages/shared');
const { dismissRateLimit } = require('../../common/helpers');

class ErpItemPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.name = page.locator('#item-name');
    this.price = page.locator('#new-item-price:visible').first();   // the id is used on both the basic and the variant tab
    this.variantTab = page.getByRole('button', { name: /Add More Variant/ });   // 12 Nov: was the #price-tab tab
    this.basicTab = page.locator('#basic-tab');
  }

  get search() { return this.page.getByPlaceholder(/search by name/i).first(); }

  async gotoList() {
    await this.page.goto(`${BASE}/items`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (await dismissRateLimit(this.page, 4000)) { await this.page.waitForTimeout(8000); await this.page.goto(`${BASE}/items`, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await this.search.waitFor({ state: 'visible', timeout: 40000 });
    await settle(this.page, 800);
  }

  async gotoForm() {
    await this.page.goto(`${BASE}/item`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (await dismissRateLimit(this.page, 4000)) { await this.page.waitForTimeout(8000); await this.page.goto(`${BASE}/item`, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await this.name.waitFor({ state: 'visible', timeout: 40000 });
    await settle(this.page, 800);
  }

  /** Rows of the list that contain this name (the list is searched on Enter). */
  async rows(name) {
    await this.gotoList();
    await this.search.fill(name);
    await this.search.press('Enter');
    await this.page.waitForTimeout(2500);
    return this.page.locator('table tbody tr').filter({ hasText: name });
  }

  async exists(name) { return (await (await this.rows(name)).count()) > 0; }

  /** Tick or untick a checkbox by its id. */
  async tick(id, on) {
    const box = this.page.locator(`#${id}`);
    if ((await box.isChecked()) !== on) await box.click();
  }

  /** Fill the form and press Save Item. Returns { kind, text }. */
  async create({ name, price, sellable = true, purchasable = true }) {
    await this.gotoForm();
    await this.name.fill(name);
    await this.name.press('Tab');
    await this.tick('checkebox-sm-sellable', sellable);
    await this.tick('checkebox-sm-purchasable', purchasable);
    if (price !== undefined) { await this.price.fill(String(price)); await this.price.press('Tab'); }
    return this.save();
  }

  async save() {
    await this.page.getByRole('button', { name: /Save Item/ }).click();
    return outcome(this.page, /saved|success|added|done|created/i, 10000);
  }

  async dismiss() { await closeDialog(this.page); }

  /** Open the variant section (needs an item name). */
  async openVariants() { await this.variantTab.click(); await this.page.waitForTimeout(800); }

  /** Open one tab of the variants grid (Codes, Prices, "Cost & reorder", "Opening Stock"). */
  async variantGridTab(name) {
    await this.page.getByText(name, { exact: true }).filter({ visible: true }).first().click();
    await this.page.waitForTimeout(500);
  }

  /** Column headers visible in the variants grid (12 Nov: a grid with one header per field, not labelled boxes). */
  async variantLabels() {
    return this.page.locator('th').evaluateAll((ths) => ths
      .filter((t) => t.getClientRects().length > 0)
      .map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean));
  }
}

module.exports = { ErpItemPage };
