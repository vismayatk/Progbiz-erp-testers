'use strict';

/**
 * Master — create / edit / delete on the simple master listings  (MC-01 .. MC-09)
 *
 * Each test makes one QA_<name>_<timestamp> record, finds it in the listing, renames it, deletes it
 * (through the "Are you sure?" dialog) and checks it is gone. Cleanup runs in `finally`, so a failing
 * step cannot leave a QA_ record behind. Nothing here touches a record the test did not create.
 *
 *   MC-01 Item Packing Type   MC-02 Department     MC-03 Designation   MC-04 Work Flow Cost Type
 *   MC-05 User Level          MC-06 Team (cards)   MC-07 Payment Term  (positive path)
 *   MC-08 Payment Term needs the slab percentages to add up to 100 (negative, nothing saved)
 *   MC-09 A blank name is refused on the inline masters (negative, nothing saved)
 *   MC-10 Email Template (names are stored in lower case)   MC-11 Custom Field, created inactive
 *
 * Run:  npx playwright test erp/master/tests/master_crud.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { MasterListPage, BASE } = require('../pages/MasterListPage');

const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const stamp = () => Date.now();
const qa = (k, t = stamp()) => `QA_${k}_${t}`;
// the renamed value must NOT contain the original as a substring, or "old name gone" can never be true
const renamedFrom = (k, t) => `QA_${k}_E_${t}`;

test.describe('Master — simple masters: create, edit, delete', () => {
  test.describe.configure({ timeout: 240_000 });
  test.skip(C.company !== 'onetouch_test', 'creates and deletes QA_ records: onetouch_test only');

  let page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
  });
  test.afterAll(async () => { await page?.close(); });

  /** create -> listed -> rename -> listed under the new name -> delete -> gone */
  async function lifecycle(key, label) {
    const m = new MasterListPage(page, key);
    const t = stamp();
    const nm = (v) => (m.cfg.lower ? v.toLowerCase() : v);
    const name = nm(qa(key, t)); const renamed = nm(renamedFrom(key, t));
    try {
      await m.goto();
      const before = await page.locator('table tbody tr').count();

      const saved = await m.create(name);
      if (m.cfg.saved) expect(saved, `${label}: save confirmation`).toMatch(m.cfg.saved);
      expect(m.writes.length, `${label}: Save sent no write request`).toBeGreaterThan(0);
      await expect(await m.rows(name), `${label}: new record not listed`).toHaveCount(1);

      let current = renamed;
      if (m.cfg.noRename) {
        // the name is locked once saved: edit another field and check the record is unchanged in the list
        const edited = await m.editInPlace(name);
        if (m.cfg.saved) expect(edited, `${label}: edit confirmation`).toMatch(m.cfg.saved);
        await expect(await m.rows(name), `${label}: record missing after edit`).toHaveCount(1);
        current = name;
      } else {
        const edited = await m.rename(name, renamed);
        if (m.cfg.saved) expect(edited, `${label}: edit confirmation`).toMatch(m.cfg.saved);
        await expect(await m.rows(renamed), `${label}: renamed record not listed`).toHaveCount(1);
        await expect(await m.rows(name), `${label}: old name still listed after rename`).toHaveCount(0);
      }

      const deleted = await m.remove(current);
      if (m.cfg.deleted) expect(deleted, `${label}: delete confirmation`).toMatch(m.cfg.deleted);
      await expect(await m.rows(current), `${label}: record still listed after delete`).toHaveCount(0);

      await m.goto();
      expect(await page.locator('table tbody tr').count(), `${label}: row count did not return to what it was`).toBeLessThanOrEqual(Math.max(before, 10));
    } finally {
      await m.cleanup(renamed, name);
      // script errors the page raised are tracked defects: show them in the report without failing the lifecycle
      for (const e of m.pageErrors) test.info().annotations.push({ type: 'script-error', description: `${label}: ${e}` });
    }
  }

  test('MC-01 | Item Packing Type: create, edit, delete', async () => { await lifecycle('packing', 'Item Packing Type'); });
  test('MC-02 | Department: create, edit, delete', async () => { await lifecycle('department', 'Department'); });
  test('MC-03 | Designation: create, edit, delete', async () => { await lifecycle('designation', 'Designation'); });
  test('MC-04 | Work Flow Cost Type: create, edit, delete', async () => { await lifecycle('costtype', 'Cost Type'); });
  test('MC-05 | User Level: create, edit, delete', async () => { await lifecycle('userlevel', 'User Level'); });
  test('MC-07 | Payment Term: create, edit, delete', async () => { await lifecycle('payterm', 'Payment Term'); });
  test('MC-10 | Email Template: create, edit, delete', async () => { await lifecycle('emailtpl', 'Email Template'); });
  test('MC-11 | Custom Field (inactive): create, edit, delete', async () => { await lifecycle('customfield', 'Custom Field'); });

  test('MC-06 | Team: create shows a card, delete removes it', async () => {
    const name = qa('team');
    const card = () => page.locator('.card').filter({ hasText: name }).filter({ hasNot: page.locator('.card') });
    const open = async () => {
      await page.goto(`${BASE}/teams`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.locator('.card').first().waitFor({ state: 'visible', timeout: 20000 });
      await page.waitForTimeout(1200);
    };
    const realTeams = async () => page.locator('.card').filter({ hasText: /From:/ }).filter({ hasNot: page.locator('.card') }).count();
    try {
      await open();
      const before = await realTeams();
      await page.locator('main button, main a, .main-content button, .main-content a').filter({ hasText: /^\s*Create Team\s*$/ }).filter({ visible: true }).first().click();
      const modal = page.locator('.modal.show').last();
      await expect(modal).toBeVisible({ timeout: 10000 });
      await modal.locator('#teamname').fill(name);
      await modal.locator('button:has-text("Save"), button:has-text("Create")').first().click();
      await expect(page.locator('.swal2-popup, .toast').filter({ hasText: /Team Added Successfully/i }).first()).toBeVisible({ timeout: 10000 });
      await open();
      await expect(card(), 'new team card not listed').toHaveCount(1);
      await expect(card(), 'a new team has no members').toContainText(/\b0\b/);
      expect(await realTeams(), 'exactly one team was added').toBe(before + 1);

      // delete only the card that carries our name
      await card().locator('[class*="btn-danger"]').first().click();
      await expect(page.locator('.swal2-popup:visible').first()).toContainText(/delete/i, { timeout: 8000 });
      await page.locator('.swal2-confirm:visible').first().click();
      // wait for the delete to finish before reloading, or the reload cancels it
      await expect(page.locator('.swal2-popup, .toast').filter({ hasText: /done|deleted|success/i }).first()).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(1000);
      await open();
      await expect(card(), 'team still listed after delete').toHaveCount(0);
      expect(await realTeams(), 'the other teams are untouched').toBe(before);
    } finally {
      try {
        await open();
        if (await card().count()) {
          await card().locator('[class*="btn-danger"]').first().click();
          await page.locator('.swal2-confirm:visible').first().click();
          await page.waitForTimeout(3000);   // let the delete finish
        }
      } catch { /* reported by the assertions above */ }
    }
  });

  test('MC-99 | no QA_ record is left behind on any of these masters', async () => {
    // a failed cleanup (for instance a changed confirmation wording) must not pass silently
    const left = [];
    for (const key of ['packing', 'department', 'designation', 'costtype', 'userlevel', 'payterm', 'emailtpl', 'customfield']) {
      const m = new MasterListPage(page, key);
      const prefix = m.cfg.lower ? `qa_${key}` : `QA_${key}`;
      const n = await (await m.rows(prefix)).count();
      if (n) left.push(`${m.cfg.title} (${n})`);
    }
    await page.goto(`${BASE}/teams`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.card').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1500);
    const teams = await page.locator('.card').filter({ hasText: 'QA_team_' }).filter({ hasNot: page.locator('.card') }).count();
    if (teams) left.push(`Team (${teams})`);
    expect(left, 'records the tests created and did not delete').toEqual([]);
  });

  test('MC-08 | Payment Term: slab percentages must add up to 100, nothing is saved otherwise', async () => {
    const m = new MasterListPage(page, 'payterm');
    const name = qa('payterm_bad');
    try {
      await m.goto();
      const scope = await m.openForm();
      await scope.locator(m.cfg.nameInput).fill(name);          // a name, but no slab
      m.writes.length = 0;
      await scope.locator('button:has-text("Save")').first().click();
      await expect(page.locator('.swal2-popup, .toast').filter({ hasText: /Percentage sum should be 100/i }).first(),
        'no "Percentage sum should be 100" message').toBeVisible({ timeout: 8000 });
      expect(m.writes, 'an invalid term was sent to the server').toEqual([]);
      await page.locator('.swal2-confirm:visible').first().click().catch(() => {});
      await expect(await m.rows(name), 'invalid term appears in the list').toHaveCount(0);
    } finally {
      await m.cleanup(name);
    }
  });

  test('MC-09 | A blank name is refused on the inline masters, nothing is saved', async () => {
    for (const key of ['packing', 'department']) {
      const m = new MasterListPage(page, key);
      await m.goto();
      const rowsBefore = await page.locator('table tbody tr').count();
      m.writes.length = 0;
      await page.locator('main button:has-text("Save"), .main-content button:has-text("Save")').first().click();
      await page.waitForTimeout(2000);
      expect(m.writes, `${m.cfg.title}: a blank name was sent to the server`).toEqual([]);
      await page.locator('.swal2-confirm:visible').first().click().catch(() => {});
      await m.goto();
      expect(await page.locator('table tbody tr').count(), `${m.cfg.title}: a row appeared`).toBe(rowsBefore);
    }
  });
});
