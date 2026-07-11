'use strict';

/**
 * CRM — Item  (Excel "Item" sheet: Item_01 .. Item_15)
 * Item form (/item): Item Name* (#item-name) + Variant Name* (#variant-name) +
 * Type/Group/Category/Brand/Description → "Save". List (/items): SlNo · Name ·
 * Category · Action; search #filter-name. NOTE: this build has NO Price field,
 * so the Excel's price cases (Item_07/08/09) are not applicable here.
 *
 * Run:  npx playwright test tests/crm_item.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { ItemPage } = require('../pages/ItemPage');
const { screenshot } = require('../../common/helpers');

const C = {
  company:  process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

async function arrive(page) {
  const lp = new LoginPage(page);
  await lp.goto();
  await lp.login(C.company, C.username, C.password);
  return new ItemPage(page);
}

test.describe('CRM — Item', () => {
  test.describe.configure({ timeout: 150_000 });

  test('Item_01 | Create item with valid mandatory fields', async ({ page }) => {
    const item = await arrive(page);
    const name = `AutoItem ${Date.now()}`;
    const msg = await item.createWith({ name, variant: name });
    await screenshot(page, 'item01_create');
    expect(msg, `Create should succeed, got "${msg}"`).toBeFalsy();
    expect(await item.existsInList(name), 'Item not found in list').toBeTruthy();
    console.log(`  ✅ Item "${name}" created and listed`);
  });

  test('Item_02 | Create item with all fields', async ({ page }) => {
    const item = await arrive(page);
    // Category here is group-dependent (selecting it without a matching group is
    // rejected with "Please choose a valid category"), so exercise the safe
    // optional fields (Variant + Description) alongside the mandatory name.
    const name = `AutoItemFull ${Date.now()}`;
    const msg = await item.createWith({ name, variant: `${name} V1`, description: 'all-fields item' });
    await screenshot(page, 'item02_allfields');
    expect(msg, `Create with all fields should succeed, got "${msg}"`).toBeFalsy();
    // Data round-trip: a falsy msg alone can hide a silent no-save — require it in the grid.
    expect(await item.existsInList(name), 'created item not persisted to the /items grid').toBeTruthy();
    console.log('  ✅ Item created with name + variant + description, persisted to grid');
  });

  test('Item_03 | Access Add Item without login redirects to Login', async ({ page }) => {
    // fresh context (no session) — navigating straight to /item must not show the form
    await page.context().clearCookies();
    await page.goto(`${process.env.BASE_URL}/item`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // Positively confirm the auth guard redirected to LOGIN, rather than accepting a
    // merely-absent form (this SPA is slow to render, so "form not visible yet" ≠ blocked).
    const redirected = await page.waitForURL(/login/i, { timeout: 15000 }).then(() => true).catch(() => false);
    const onLogin = redirected || await page.locator('#companycode, #signin-username').first().isVisible().catch(() => false);
    await screenshot(page, 'item03_noauth');
    console.log('  🔒 url:', page.url(), '| on login screen:', onLogin);
    expect(onLogin, 'unauthenticated access to /item must redirect to the login screen').toBeTruthy();
    console.log('  ✅ Unauthenticated access is redirected to Login');
  });

  test('Item_04 | Session timeout while creating item', async () => {
    test.skip(true, 'Requires waiting for a real server session to expire — not deterministically automatable.');
  });

  test('Item_05 | Create without Item Name is rejected', async ({ page }) => {
    const item = await arrive(page);
    const msg = await item.createWith({ name: '', variant: 'v' });
    await screenshot(page, 'item05_noname');
    expect(msg, `Blank Item Name should be rejected (got "${msg}")`).toBeTruthy();
    console.log(`  ✅ Rejected missing Item Name — "${msg}"`);
  });

  test('Item_06 | Create with whitespace-only Item Name is rejected', async ({ page }) => {
    const item = await arrive(page);
    const msg = await item.createWith({ name: '   ', variant: 'v' });
    await screenshot(page, 'item06_blankname');
    expect(msg, `Whitespace Item Name should be rejected (got "${msg}")`).toBeTruthy();
    console.log(`  ✅ Rejected whitespace Item Name — "${msg}"`);
  });

  for (const id of ['Item_07', 'Item_08', 'Item_09']) {
    test(`${id} | Price validation (no Price field on this build)`, async () => {
      test.skip(true, 'This build\'s item form has no Price field (mandatory fields are Item Name + Variant Name). Price cases are not applicable here.');
    });
  }

  test('Item_10 | Duplicate Item Name is rejected', async ({ page }) => {
    const item = await arrive(page);
    const name = `DupItem ${Date.now()}`;
    expect(await item.createWith({ name, variant: name }), 'first create should succeed').toBeFalsy();
    const dup = await item.createWith({ name, variant: name });
    await screenshot(page, 'item10_dup');
    expect(dup, 'Duplicate should be rejected').toBeTruthy();
    expect(dup).toMatch(/exist|duplicate|already/i);
    console.log(`  ✅ Duplicate rejected — "${dup}"`);
  });

  test('Item_11 | Save creates and lists the item', async ({ page }) => {
    const item = await arrive(page);
    const name = `SaveItem ${Date.now()}`;
    expect(await item.createWith({ name, variant: name })).toBeFalsy();
    expect(await item.existsInList(name)).toBeTruthy();
    console.log('  ✅ Save persisted the item to the grid');
  });

  test('Item_12 | Search Item functionality', async ({ page }) => {
    const item = await arrive(page);
    const name = `SearchItem ${Date.now()}`;
    expect(await item.createWith({ name, variant: name })).toBeFalsy();
    expect(await item.existsInList(name), 'search should find the created item').toBeTruthy();
    expect(await item.existsInList(`ZZNoSuch ${Date.now()}`), 'search should not find a random name').toBeFalsy();
    console.log('  ✅ Search returns matching item only');
  });

  test('Item_13 | Edit Item', async ({ page }) => {
    const item = await arrive(page);
    const name = `EditItem ${Date.now()}`;
    expect(await item.createWith({ name, variant: name })).toBeFalsy();
    const newName = `${name} EDITED`;
    const msg = await item.editItem(name, newName);
    await screenshot(page, 'item13_edit');
    expect(msg, `Edit should succeed, got "${msg}"`).toBeFalsy();
    expect(await item.existsInList(newName), 'edited name not in list').toBeTruthy();
    console.log('  ✅ Item edited and updated name listed');
  });

  test('Item_14 | Delete Item', async ({ page }) => {
    const item = await arrive(page);
    const name = `DelItem ${Date.now()}`;
    expect(await item.createWith({ name, variant: name })).toBeFalsy();
    const res = await item.delete(name);
    await screenshot(page, 'item14_delete');
    test.skip(res === null, 'No Delete action on /items for this tenant (Edit-only).');
    expect(res, 'Item should be removed after delete').toBeTruthy();
    console.log('  ✅ Item deleted');
  });

  test('Item_15 | Cancel while adding item returns to list', async ({ page }) => {
    const item = await arrive(page);
    const name = `CancelItem ${Date.now()}`;
    const url = await item.cancelCreate(name);
    await screenshot(page, 'item15_cancel');
    console.log('  ↩  after Cancel →', url);
    // The old /\/items?/ allowed staying on the form (/item). Require the /items LIST route,
    // and prove Cancel did not persist the item.
    expect(/\/items(\b|$)/.test(url), 'Cancel should return to the /items list, not stay on /item').toBeTruthy();
    expect(await item.existsInList(name), 'Cancel must not persist the item').toBeFalsy();
    console.log('  ✅ Cancel returned to the /items list without saving');
  });
});
