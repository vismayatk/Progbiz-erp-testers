'use strict';

/**
 * Asset Management — who can do what  (AA-01 .. AA-03)
 *
 * Signs in as the QA test users of the Asset testing guide. They were made on onetouch_test on
 * 16 Nov 2026, each with its own access role; their logins are in .env:
 *
 *   QA_ASSET_LIMITED_USER / _PASSWORD   role "QA Asset Limited": Assets, view only
 *   QA_ASSET_RAHUL_USER   / _PASSWORD   role "QA Asset Staff":   My Assets only
 *   QA_ASSET_CUSTOM_USER  / _PASSWORD   role "QA Asset Custom":  Assets + Add; Disposal, Audit and
 *                                       Finance without Confirm; quick-add for Category and Location
 *
 *   AA-01  view-only user: sees the register and an asset, cannot add, edit, assign or delete,
 *          and cannot open the setup, depreciation or disposal pages by typing their address
 *   AA-02  staff user: only My Assets; the register, an asset and the settings are refused
 *   AA-03  custom user: "+ Add" shows only beside Category and Location on New Asset;
 *          Depreciation offers Preview but no Post
 *
 * Read-only: these tests save nothing. A test is skipped when its login is not in .env.
 *
 * Run:  npx playwright test erp/asset/tests/asset_access.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { AssetPage, clean } = require('../pages/AssetPage');

const COMPANY = process.env.COMPANY_CODE || 'onetouch_test';
const user = (key) => ({ username: process.env[`QA_ASSET_${key}_USER`], password: process.env[`QA_ASSET_${key}_PASSWORD`] });

async function signIn(page, key) {
  const u = user(key);
  await new LoginPage(page).login(COMPANY, u.username, u.password);
  await page.waitForTimeout(2500);
  return new AssetPage(page);
}
const menuLinks = (page) => page.evaluate(() => [...document.querySelectorAll('aside a[href], .app-sidebar a[href]')]
  .map((a) => (a.getAttribute('href') || '').replace(/^\//, '')).filter((h) => h && !/^javascript/.test(h)));
const denied = async (asset, route) => { await asset.goto(route); return /access denied/i.test(await asset.text(600)); };

test.describe('Asset Management — who can do what', () => {
  test.describe.configure({ timeout: 240_000 });
  test.skip(COMPANY !== 'onetouch_test', 'the QA asset users exist on onetouch_test only');

  test('AA-01 | View-only user: sees assets, cannot change them, cannot open setup pages', async ({ page }) => {
    test.skip(!user('LIMITED').username, 'QA_ASSET_LIMITED_USER is not set in .env');
    const asset = await signIn(page, 'LIMITED');
    const links = await menuLinks(page);
    expect(links, 'Asset Register in the menu').toContain('assets');
    expect(links, 'Scan Asset in the menu').toContain('asset-scan');
    for (const hidden of ['asset-settings', 'asset-categories', 'asset-rentals', 'asset-leases', 'asset-disposals', 'asset-depreciation', 'my-assets'])
      expect(links, `"${hidden}" must not be in a view-only user's menu`).not.toContain(hidden);
    // guide check A1 expects only Register and Scan Asset; Asset Approvals is there too (open question for the product team)
    if (links.includes('asset-approvals')) test.info().annotations.push({ type: 'open-question', description: 'Asset Approvals shows in the menu of a view-only user; the testing guide (A1) lists only Asset Register and Scan Asset' });

    await asset.goto('assets', 3000);
    expect(await asset.text(400), 'the register opens').toMatch(/Asset Register/);
    const buttons = (await page.locator('main button:visible, .main-content button:visible').allInnerTexts()).map(clean);
    expect(buttons, 'New Asset must be hidden without the Add right').not.toContain('New Asset');
    const ids = await asset.listedIds();
    expect(ids.length, 'the view-only user sees assets on the register').toBeGreaterThan(0);
    await asset.open(ids[0]);
    expect(await asset.text(300), 'an asset opens for a view-only user').toMatch(/^Asset /);
    expect(await asset.actions(), 'a view-only user gets no action button on an asset').toEqual([]);
    for (const route of ['asset-entry', 'asset-settings', 'asset-categories', 'asset-depreciation', 'asset-disposals'])
      expect(await denied(asset, route), `/${route} opened for a view-only user`).toBe(true);
  });

  test('AA-02 | Staff user: only My Assets', async ({ page }) => {
    test.skip(!user('RAHUL').username, 'QA_ASSET_RAHUL_USER is not set in .env');
    const asset = await signIn(page, 'RAHUL');
    const links = await menuLinks(page);
    expect(links, 'My Assets in the menu').toContain('my-assets');
    for (const hidden of ['assets', 'asset-scan', 'asset-settings', 'asset-categories', 'asset-rentals', 'asset-depreciation'])
      expect(links, `"${hidden}" must not be in a staff user's menu`).not.toContain(hidden);
    await asset.goto('my-assets', 3000);
    expect(clean(await page.locator('h1, .page-title').first().innerText())).toBe('My Assets');
    await expect(page.locator('#asset-my-request'), 'Request an asset').toBeVisible();
    for (const route of ['assets', 'asset-view/1', 'asset-entry', 'asset-settings', 'asset-depreciation'])
      expect(await denied(asset, route), `/${route} opened for a staff user`).toBe(true);
  });

  test('AA-03 | Custom user: quick-add only where the role allows; Preview without Post', async ({ page }) => {
    test.skip(!user('CUSTOM').username, 'QA_ASSET_CUSTOM_USER is not set in .env');
    const asset = await signIn(page, 'CUSTOM');
    await asset.goto('asset-entry', 3500);
    const withAdd = await page.evaluate(() => [...document.querySelectorAll('label')].filter((l) => l.offsetParent && /\bAdd\b/.test(l.innerText))
      .map((l) => l.innerText.replace(/\s+/g, ' ').replace(/[*]/g, '').replace(/\bAdd\b/, '').trim()));
    expect(withAdd.sort(), '"+ Add" shows only beside the fields whose quick-add role the user holds').toEqual(['Category', 'Location']);

    await asset.goto('asset-depreciation', 3000);
    await expect(page.locator('#asset-depreciation-preview'), 'Preview').toBeVisible();
    await expect(page.locator('#asset-depreciation-post'), 'Post must be hidden without the Confirm right').toHaveCount(0);

    await asset.goto('asset-disposals', 3000);
    const rowButtons = (await page.locator('table tbody button:visible').allInnerTexts()).map(clean);
    expect(rowButtons, 'Complete must be hidden without the Confirm right').not.toContain('Complete');
  });
});
