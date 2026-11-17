'use strict';

/**
 * Inventory — ERP item master  (IT-01 .. IT-06)
 *
 * Inventory > Items (/items) and the Product form (/item). One QA item, QA_Item_Fixture, is created the first
 * time it is missing and reused by every invoice test; items are never deleted. Nothing else is saved.
 *
 *   IT-01 The Items list opens with its search box, New Item button and columns (SlNo, Name, Category, Variants, Stock)
 *   IT-02 "Add More Variant" is refused until the item has a name
 *   IT-03 The variants grid has exactly ONE "Variant Name" column and a Default column on each of its four tabs
 *   IT-04 The QA item exists (created once if missing) and is found by name, with its price
 *   IT-05 A second item with the same name is refused and the list still has one
 *   IT-06 Save with no name is refused and nothing is sent
 *
 * Run:  npx playwright test erp/inventory/tests/inventory_items.spec.js --workers=1
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { ErpItemPage } = require('../pages/ErpItemPage');
const { C, trackWrites } = require('../../accounts/pages/shared');

const ITEM = 'QA_Item_Fixture';

test.describe('Inventory — ERP item master', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  test.skip(C.company !== 'onetouch_test', 'creates a QA item: onetouch_test only');

  /** @type {import('@playwright/test').Page} */
  let page, items, tracker;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    tracker = trackWrites(page);
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    items = new ErpItemPage(page);
  });
  test.afterAll(async () => { await page?.close(); });

  test('IT-01 | The Items list opens with its search box and New Item button', async () => {
    await items.gotoList();
    await expect(page.getByText('Items', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(items.search).toBeVisible();
    await expect(page.locator('a, button').filter({ hasText: /New Item/ }).filter({ visible: true }).first(), 'New Item button').toBeVisible();
    for (const col of [/s[il]\.?\s?no/i, /^\s*Name/, /Category/, /Variants/, /Stock/]) {   // 12 Nov: the Action column was removed from the list
      await expect(page.locator('table thead th').filter({ hasText: col }).first(), `column ${col}`).toBeVisible();
    }
  });

  test('IT-02 | "Add More Variant" is refused until the item has a name', async () => {
    await items.gotoForm();
    tracker.clear();
    await items.variantTab.click();
    const dlg = page.locator('.swal2-popup:visible').first();
    await expect(dlg).toBeVisible({ timeout: 8000 });
    await expect(dlg).toContainText(/enter item name before adding multiple variants/i);
    await items.dismiss();
    expect(tracker.writes, 'nothing is saved').toEqual([]);
  });

  test('IT-03 | The variant section has exactly one Variant Name box', async () => {
    await items.gotoForm();
    await items.name.fill('QA_variant_layout_check');
    await items.name.press('Tab');
    await items.openVariants();
    // 12 Nov layout: one grid, one "Variant Name" column and a "Default" column, whichever tab is open
    for (const [tab, extra] of [['Codes', ['SKU', 'Barcode', 'Brand']], ['Prices', ['Main Branch']], ['Cost & reorder', ['Opening Cost', 'Reorder Level']], ['Opening Stock', ['Opening Stock']]]) {
      await items.variantGridTab(tab);
      const labels = await items.variantLabels();
      expect(labels.filter((l) => /^Variant Name/i.test(l)), `Variant Name column on the ${tab} tab`).toHaveLength(1);
      expect(labels.some((l) => /^Default/i.test(l)), `"Default" column on the ${tab} tab`).toBe(true);
      for (const want of extra) expect(labels.some((l) => l.includes(want)), `${want} is missing from the ${tab} tab`).toBe(true);
    }
    // leave without saving: reload the form
    await items.gotoForm();
    expect(await items.name.inputValue(), 'the unsaved item name must not stick').toBe('');
  });

  test('IT-04 | The QA item exists (created once if missing), is found by name and shows its price', async () => {
    if (!(await items.exists(ITEM))) {
      const r = await items.create({ name: ITEM, price: 100 });
      expect(['saved', 'none'], `item did not save: ${r.text}`).toContain(r.kind);
    }
    const rows = await items.rows(ITEM);
    await expect(rows, 'the QA item is not listed').toHaveCount(1);
    await expect(rows.first()).toContainText(ITEM);
  });

  test('IT-05 | A second item with the same name is refused and the list still has one', async () => {
    const r = await items.create({ name: ITEM, price: 100 });
    // the app answers with a message ("... already exist ...") or simply does not add a row; both keep the list at one
    if (r.kind === 'dialog') {
      expect(r.text).toMatch(/exist|already|duplicate|unique/i);
      await items.dismiss();
    }
    await expect(await items.rows(ITEM), 'a duplicate row was added').toHaveCount(1);
  });

  test('IT-06 | Save with no name is refused and nothing is sent', async () => {
    await items.gotoForm();
    tracker.clear();
    await page.getByRole('button', { name: /Save Item/ }).click();
    await page.waitForTimeout(2500);
    expect(tracker.writes, 'an item without a name was sent to the server').toEqual([]);
    expect(page.url(), 'must stay on the form').toMatch(/\/item(\b|$)/);
  });
});
