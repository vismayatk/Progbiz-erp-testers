'use strict';

/**
 * Asset Management — register, custody, maintenance, depreciation  (AR-01 .. AR-10)
 *
 * One story on the test tenant, with its own data: the run makes a QA_ category (useful life 36
 * months, salvage 5%, unique serials) and a QA_ location, registers assets in them and puts one
 * asset through its life. Nothing that posts to Accounts is done: depreciation is only previewed,
 * never posted, and no disposal is completed.
 *
 *   AR-01  New Asset refuses an empty form, then a form with no category
 *   AR-02  a new asset saves with the next code of its category prefix and shows what was entered
 *   AR-03  the form's rules: negative cost, salvage above cost, future purchase date,
 *          warranty end before start, negative useful life
 *   AR-04  unique serial number: a second asset with the same serial is refused, naming the first
 *   AR-05  Mark Lost needs remarks; Lost -> Found; both are in the History
 *   AR-06  Assign to a location, then Receive Back; an expected return before the assignment is refused
 *   AR-07  Send to Maintenance needs an issue; Complete refuses a negative cost, then closes the job
 *   AR-08  Depreciation preview: monthly amount = (cost - salvage) / useful life
 *   AR-09  an asset with no history can be deleted, shows in the Recycle Bin and can be restored
 *   AR-10  Deactivate takes an asset off the register (badge "Inactive", only Reactivate is offered);
 *          Reactivate brings it back
 *
 * Tracked defects kept as expected failures (Asset Management test report, 17 Nov 2026):
 *   AST-004  an assignment dated in the future is accepted
 *   AST-006  a category salvage % above 100 is accepted
 *   AST-013  a file that is not a picture but is named .jpg is accepted as the asset photo
 *
 * Leftovers: assets that gained a history cannot be deleted, so the run deactivates them (they
 * leave the register's default view); deleting the QA category and location then deactivates
 * those too, because the retired assets still point at them.
 *
 * Run:  npx playwright test erp/asset/tests/asset_register.spec.js
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { AssetPage, iso, num, clean } = require('../pages/AssetPage');

const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const STAMP = Date.now();
const TAG = STAMP.toString(36).toUpperCase().slice(-5);          // letters and digits, new on every run
const CAT = { code: `Q${TAG}`, name: `QA_Category_${STAMP}`, prefix: `Q${TAG}` };
const LOC = { code: `L${TAG}`, name: `QA_Location_${STAMP}` };
const SERIAL = `QA-SN-${TAG}`;
const COST = 3600, LIFE = 36, SALVAGE_PCT = 5;

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
const days = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

test.describe('Asset Management — register, custody, maintenance, depreciation', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  test.skip(C.company !== 'onetouch_test', 'creates QA_ assets and masters: onetouch_test only');

  /** @type {import('@playwright/test').Page} */ let page;
  /** @type {AssetPage} */ let asset;
  let mainId = null, mainCode = '';
  let spareId = null, spareCode = '';   // the asset AR-09 deletes and restores, reused by AR-10
  const made = [];              // ids of every asset this run registered

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await new LoginPage(page).login(C.company, C.username, C.password);
    asset = new AssetPage(page);
    const c = await asset.addCategory({ ...CAT, warranty: 12, life: LIFE, salvage: SALVAGE_PCT, serialUnique: true });
    expect(c.saved, `QA category did not save: ${c.said} ${c.calls.join(' ')}`).toBe(true);
    const l = await asset.addLocation(LOC);
    expect(l.saved, `QA location did not save: ${l.said} ${l.calls.join(' ')}`).toBe(true);
  });

  test.afterAll(async () => {
    if (!page) return;
    for (const id of made) {
      try {
        if (await asset.remove(id)) continue;               // no history: deleted
        await asset.deactivate(id);                         // has a history: can only be retired
      } catch { /* leave it: reported as a leftover by the next audit */ }
    }
    await asset.deleteMasterRow('asset-locations', LOC.name).catch(() => {});
    await asset.deleteMasterRow('asset-categories', CAT.name).catch(() => {});
    await page.close();
  });

  test('AR-01 | New Asset refuses an empty form, then a form with no category', async () => {
    await asset.goto('asset-entry', 3000);
    let r = await asset.press('asset-entry-save', 1800);
    expect(r.said, 'empty form').toMatch(/enter the asset name/i);
    await asset.ok();
    await asset.set({ 'asset-entry-name': `QA_NoCategory_${STAMP}` });
    r = await asset.press('asset-entry-save', 1800);
    expect(r.said, 'no category').toMatch(/choose the category/i);
    await asset.ok();
    expect(page.url(), 'the form was left although nothing could be saved').toMatch(/asset-entry$/);
    expect(asset.calls.filter((c) => /save-asset$/.test(c)), 'an incomplete asset was sent to the server').toEqual([]);
  });

  test('AR-02 | A new asset saves with the next code of its category and shows what was entered', async () => {
    const r = await asset.newAsset({
      name: `QA_Asset_${STAMP}`, category: CAT.name, serial: SERIAL, cost: COST, 'purchase-date': iso(monthStart),
      invoice: `INV-${TAG}`, 'warranty-start': iso(monthStart), 'warranty-end': iso(days(365)), location: LOC.name, notes: 'Automated asset test',
    });
    expect(r.saved, `asset did not save: ${r.said} ${r.calls.join(' ')}`).toBe(true);
    mainId = r.id; made.push(r.id);
    mainCode = await asset.code();
    expect(mainCode, 'asset code = category prefix + 4 digits').toBe(`${CAT.prefix}-0001`);
    const body = await asset.text(6000);
    for (const want of [`QA_Asset_${STAMP}`, SERIAL, CAT.name, LOC.name, `INV-${TAG}`, '3,600.00'])
      expect(body, `the asset page does not show "${want}"`).toContain(want);
    expect((await asset.badges())[0], 'status of a new asset').toBe('Available');
    expect(await asset.holder(), 'holder of a new asset').toMatch(/in store/i);
    // O3 of the guide: a reload keeps what was saved
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    expect(await asset.text(6000), 'after a reload').toContain(SERIAL);
  });

  const RULES = [
    ['a negative cost', { cost: -5 }, /cannot be negative/i],
    ['a salvage value above the cost', { cost: 100, salvage: 500 }, /salvage value cannot be more than the cost/i],
    ['a purchase date in the future', { 'purchase-date': iso(days(730)), cost: 100 }, /purchase date cannot be in the future/i],
    ['a warranty that ends before it starts', { 'warranty-start': iso(days(0)), 'warranty-end': iso(days(-30)) }, /warranty end date cannot be before/i],
    ['a negative useful life', { life: -12 }, /cannot be negative/i],
  ];
  for (const [label, fields, message] of RULES) {
    test(`AR-03 | New Asset refuses ${label}`, async () => {
      const r = await asset.newAsset({ name: `QA_Rule_${STAMP}`, category: CAT.name, ...fields });
      if (r.saved) made.push(r.id);
      expect(r.saved, `an asset with ${label} was saved`).toBe(false);
      expect(r.said, `message for ${label}`).toMatch(message);
    });
  }

  test('AR-04 | Unique serial number: a second asset with the same serial is refused', async () => {
    test.skip(!mainId, 'the first asset was not registered');
    const r = await asset.newAsset({ name: `QA_SerialClash_${STAMP}`, category: CAT.name, serial: ` ${SERIAL.toLowerCase()} ` });
    if (r.saved) made.push(r.id);
    expect(r.saved, 'a second asset with the same serial number was saved').toBe(false);
    expect(r.said, 'the message names the asset that already has this serial').toMatch(new RegExp(`already registered on ${mainCode}`, 'i'));
  });

  test('AR-05 | Mark Lost needs remarks; Lost then Found; both show in the History', async () => {
    test.skip(!mainId, 'the first asset was not registered');
    await asset.open(mainId);
    let r = await asset.action('Mark Lost', {});
    expect(r.open, 'Mark Lost with no remarks was accepted').toBe(true);
    expect(r.said).toMatch(/last seen|missing/i);
    await asset.open(mainId);
    r = await asset.action('Mark Lost', { 'asset-status-remarks': 'Automated test: not found at its desk' });
    expect(r.open, `Mark Lost was refused: ${r.said}`).toBe(false);
    await asset.open(mainId);
    expect((await asset.badges())[0]).toBe('Lost');
    const lostActions = await asset.actions();
    expect(lostActions, 'a lost asset can be marked found').toContain('Mark Found');
    expect(lostActions, 'a lost asset cannot be assigned').not.toContain('Assign');
    r = await asset.action('Mark Found', { 'asset-status-remarks': 'Automated test: found in the store' });
    expect(r.open, `Mark Found was refused: ${r.said}`).toBe(false);
    await asset.open(mainId);
    expect((await asset.badges())[0], 'status after Found').toBe('Available');
    const history = await asset.tab('History');
    expect(history).toContain('Marked Lost');
    expect(history).toContain('Found');
    expect(history).toContain('Registered');
  });

  test('AR-06 | Assign to a location, then Receive Back', async () => {
    test.skip(!mainId, 'the first asset was not registered');
    await asset.open(mainId);
    // an expected return before the assignment date is refused
    let r = await asset.action('Assign', { 'asset-assign-type-3': true, 'asset-assign-location': LOC.name, 'asset-assign-date': iso(days(0)), 'asset-assign-expected': iso(days(-3)) });
    expect(r.open, 'an expected return before the assignment date was accepted').toBe(true);
    expect(r.said).toMatch(/expected return date cannot be before/i);
    await asset.open(mainId);
    r = await asset.action('Assign', { 'asset-assign-type-3': true, 'asset-assign-location': LOC.name, 'asset-assign-date': iso(days(0)) });
    expect(r.open, `Assign was refused: ${r.said} ${r.calls.join(' ')}`).toBe(false);
    await asset.open(mainId);
    expect((await asset.badges())[0]).toBe('Assigned');
    expect(await asset.holder(), 'holder after assigning to a location').toContain(LOC.name);
    const held = await asset.actions();
    expect(held).toContain('Return');
    expect(held, 'an assigned asset cannot be assigned again').not.toContain('Assign');
    expect(await asset.tab('Custody'), 'Custody tab lists the assignment').toContain(LOC.name);

    r = await asset.action('Return', { 'asset-return-date': iso(days(0)), 'asset-return-location': LOC.name, 'asset-return-remarks': 'Automated test' });
    expect(r.open, `Receive Back was refused: ${r.said} ${r.calls.join(' ')}`).toBe(false);
    await asset.open(mainId);
    expect((await asset.badges())[0], 'status after Receive Back').toBe('Available');
    expect(await asset.holder(), 'holder after Receive Back').toMatch(/in store/i);
  });

  test('AR-07 | Send to Maintenance needs an issue; Complete refuses a negative cost, then closes the job', async () => {
    test.skip(!mainId, 'the first asset was not registered');
    await asset.open(mainId);
    let r = await asset.action('Maintenance', {});
    expect(r.open, 'a work order with no issue was accepted').toBe(true);
    expect(r.said).toMatch(/describe the issue/i);
    await asset.open(mainId);
    r = await asset.action('Maintenance', { 'asset-maint-type': 'Corrective', 'asset-maint-issue': `Automated test ${TAG}: keyboard not working` });
    expect(r.open, `Send to Maintenance was refused: ${r.said}`).toBe(false);
    await asset.open(mainId);
    expect((await asset.badges())[0]).toBe('Under Maintenance');

    const openJob = async () => {
      await asset.goto('asset-maintenance');
      const row = page.locator('table tbody tr').filter({ hasText: mainCode }).first();
      await expect(row, 'the work order is listed under Maintenance').toContainText('Open');
      await row.locator('button').filter({ hasText: /^\s*Complete\s*$/ }).click();
      await asset.modal().waitFor({ state: 'visible', timeout: 10000 });
    };
    await openJob();
    await asset.set({ 'asset-maintenance-complete-cost': '-250' }, asset.modal());
    r = await asset.press('asset-maintenance-complete-save', 2500, asset.modal());
    expect(r.said, 'a negative repair cost').toMatch(/cannot be negative/i);
    await asset.ok();

    await openJob();
    await asset.set({
      'asset-maintenance-complete-result': 'Available', 'asset-maintenance-complete-diagnosis': 'Loose ribbon cable',
      'asset-maintenance-complete-action': 'Reseated', 'asset-maintenance-complete-outcome': 'Fixed', 'asset-maintenance-complete-cost': '250',
    }, asset.modal());
    r = await asset.press('asset-maintenance-complete-save', 3000, asset.modal());
    await asset.ok();
    await asset.goto('asset-maintenance');
    const done = page.locator('table tbody tr').filter({ hasText: mainCode }).first();
    await expect(done, 'the work order is completed').toContainText('Completed');
    await expect(done, 'the repair cost shows on the work order').toContainText('250.00');
    await asset.open(mainId);
    expect((await asset.badges())[0], 'status after the repair').toBe('Available');
  });

  test('AR-08 | Depreciation preview: monthly amount = (cost - salvage) / useful life', async () => {
    test.skip(!mainId, 'the first asset was not registered');
    const p = await asset.previewDepreciation(thisMonth);
    test.skip(!/not posted/i.test(await asset.text(3000)), `depreciation for ${thisMonth} is already posted on this tenant, so the preview shows the posted run`);
    const row = p.rows.find((r) => (r[0] || '').startsWith(mainCode));
    expect(row, `${mainCode} is not in the ${thisMonth} preview (rows: ${p.rows.map((r) => r[0]).join(', ').slice(0, 300)})`).toBeTruthy();
    // columns: Asset | Cost Center | Cost | Opening | Amount | Accumulated | Net Book Value
    const expected = (COST - COST * SALVAGE_PCT / 100) / LIFE;            // 95.00
    expect(num(row[2]), 'cost').toBeCloseTo(COST, 2);
    expect(num(row[4]), `monthly depreciation of ${mainCode}`).toBeCloseTo(expected, 2);
    expect(num(row[6]), 'net book value = cost - accumulated').toBeCloseTo(COST - num(row[5]), 2);
    // previewing posts nothing
    await expect(page.locator('main, .main-content').first()).toContainText(/Preview\s*[—-]\s*not posted/i);
  });

  test('AR-09 | An asset with no history can be deleted, shows in the Recycle Bin and can be restored', async () => {
    const r = await asset.newAsset({ name: `QA_Delete_${STAMP}`, category: CAT.name });
    expect(r.saved, `asset did not save: ${r.said}`).toBe(true);
    made.push(r.id); spareId = r.id;
    const code = await asset.code();
    spareCode = code;
    expect(await asset.remove(r.id), 'Delete did not return to the register').toBe(true);
    await asset.goto('asset-recycle-bin');
    const binned = page.locator('table tbody tr').filter({ hasText: code }).first();
    await expect(binned, `${code} is in the Recycle Bin`).toBeVisible();
    await binned.locator('button').filter({ hasText: /^\s*Restore\s*$/ }).click();
    await page.waitForTimeout(900);
    await asset.ok();
    await page.waitForTimeout(1500);
    await asset.open(r.id);
    expect(await asset.code(), 'the restored asset opens again').toBe(code);
    expect((await asset.badges())[0]).toBe('Available');
    const history = await asset.tab('History');
    expect(history, 'the History keeps the delete and the restore').toContain('Deleted');
    expect(history).toContain('Restored');
    // seen 16 Nov 2026: Delete and Restore count as history, so a restored asset no longer offers Delete
    if (!(await asset.actions()).includes('Delete'))
      test.info().annotations.push({ type: 'note', description: 'A restored asset no longer offers Delete (the delete and the restore are in its History); it can only be deactivated' });
  });

  test('AR-10 | Deactivate takes an asset off the register; Reactivate brings it back', async () => {
    test.skip(!spareId, 'the spare asset of AR-09 was not registered');
    expect(await asset.deactivate(spareId, 'Automated test: retired'), 'Deactivate was refused').toBe(true);
    await asset.open(spareId);
    expect((await asset.badges())[0], 'badge of a deactivated asset').toBe('Inactive');
    expect(await asset.actions(), 'a deactivated asset offers only Reactivate').toEqual(['Reactivate']);
    expect(await asset.searchRegister(spareCode), 'a deactivated asset is still on the register (default view: active only)').toEqual([]);

    await asset.open(spareId);
    const r = await asset.action('Reactivate', { 'asset-status-remarks': 'Automated test: back in use' });
    expect(r.open, `Reactivate was refused: ${r.said} ${r.calls.join(' ')}`).toBe(false);
    await asset.open(spareId);
    expect((await asset.badges())[0], 'status after Reactivate').toBe('Available');
    expect(await asset.actions(), 'a reactivated asset can be assigned again').toContain('Assign');
    expect((await asset.searchRegister(spareCode)).length, 'the reactivated asset is back on the register').toBe(1);
  });

  /* ── tracked defects ─────────────────────────────────────────────────────── */

  test('AST-004 | An assignment dated in the future is refused', async () => {
    test.fail(true, 'AST-004 — Assign accepts an "Assigned On" date in the future; the asset shows as Assigned at once');
    test.skip(!mainId, 'the first asset was not registered');
    await asset.open(mainId);
    const r = await asset.action('Assign', { 'asset-assign-type-3': true, 'asset-assign-location': LOC.name, 'asset-assign-date': iso(days(730)) });
    try {
      expect(r.open, 'an assignment dated two years ahead was accepted').toBe(true);
    } finally {
      if (!r.open) { await asset.open(mainId); await asset.action('Return', { 'asset-return-location': LOC.name }).catch(() => {}); }
    }
  });

  test('AST-006 | A category salvage % above 100 is refused', async () => {
    test.fail(true, 'AST-006 — Add Category accepts Salvage % = 101; assets of that category can then no longer be saved');
    const bad = { code: `X${TAG}`, name: `QA_Salvage101_${STAMP}`, prefix: `X${TAG}` };
    const r = await asset.addCategory({ ...bad, life: 36, salvage: 101 });
    try {
      expect(r.saved, 'a category with salvage 101% was saved').toBe(false);
    } finally {
      if (r.saved) await asset.deleteMasterRow('asset-categories', bad.name).catch(() => {});
    }
  });

  test('AST-013 | A file that is not a picture is refused as the asset photo', async () => {
    test.fail(true, 'AST-013 — the photo is checked by its file name only: a PDF saved as .jpg is accepted and shows as a broken image');
    const fake = path.join(os.tmpdir(), `qa_not_a_picture_${STAMP}.jpg`);
    fs.writeFileSync(fake, '%PDF-1.4 this is not an image');
    const r = await asset.newAsset({ name: `QA_FakePhoto_${STAMP}`, category: CAT.name, photo: fake });
    try {
      expect(r.saved, 'an asset whose photo is not an image was saved').toBe(false);
    } finally {
      if (r.saved) await asset.remove(r.id).catch(() => {});
      fs.rmSync(fake, { force: true });
    }
  });
});

void clean;
