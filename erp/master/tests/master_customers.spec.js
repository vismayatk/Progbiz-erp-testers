'use strict';

/**
 * Master — Customers and Custom Reports  (MC-20 .. MC-24)
 *
 * Customers cannot be deleted from the UI (the side panel only offers Open Profile and Block Number), so nothing here
 * creates a new customer per run. The tests use ONE fixed record, QA_Customer_Fixture, which is created
 * the first time it is missing and reused after that.
 *
 *   MC-20 the tile counts agree: All = Suspect + Prospect + Customer; each "% of all" is right; each tile
 *         lists only its own level and as many as it says; "of N entries" = the All tile
 *   MC-21 the fixture exists (created once if missing) and the Add form validates its required fields
 *   MC-22 search finds the fixture by name and by phone; nonsense finds nothing
 *   MC-23 the side panel shows the chosen customer with the same four counts as its row, and
 *         Open Profile opens that customer's own page
 *
 * Nov 2026 redesign (read on 14 Nov): tiles replaced the level tabs, rows of cards replaced the table,
 * and a side panel with "Open Profile" / "Block Number" replaced the buttons on each row.
 *   MC-24 Custom Report: Save is refused until a field AND a filter are chosen (nothing saved)
 *
 * Run:  npx playwright test erp/master/tests/master_customers.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { dismissRateLimit } = require('../../common/helpers');

const BASE = process.env.BASE_URL || 'https://test.erp.progbiz.in';
const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const FIXTURE = { name: 'QA_Customer_Fixture', phone: '9000000099' };

test.describe('Master — Customers and Custom Reports', () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(C.company !== 'onetouch_test', 'creates a QA_ customer: onetouch_test only');

  let page;
  let writes = [];
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('request', (r) => {
      const u = r.url();
      if (u.startsWith(BASE) && r.method() !== 'GET' && /\/api\//.test(u) && !/\/(get|list|search|count|check)[\w-]*/i.test(u)) writes.push(u.replace(BASE, ''));
    });
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
  });
  test.afterAll(async () => { await page?.close(); });

  async function open(route) {
    writes = [];
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (await dismissRateLimit(page)) { await page.waitForTimeout(15000); await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  // Nov 2026 redesign: the list is rows of cards (#cst-rows .cst-row), not a table; the level tabs are
  // four tiles (#grade-tabs .cst-tile); the chosen customer is shown in a side panel (#cst-panel)
  // whose "Open Profile" button replaced the View button on each row.
  const ROWS = '#cst-rows .cst-row';
  const search = async (text) => {
    const box = page.locator('#bc-search-input');
    await box.fill(text);
    await box.press('Enter');          // searches run on Enter
    await page.waitForTimeout(2500);
    return page.locator(ROWS).filter({ hasText: text });
  };
  /** The tiles over the list: { All: { count, hint, id }, Suspect: …, Prospect: …, Customer: … } */
  const tiles = () => page.locator('#grade-tabs .cst-tile').evaluateAll((els) => Object.fromEntries(els.map((e) => {
    const t = (sel) => (e.querySelector(sel)?.innerText || '').replace(/\s+/g, ' ').trim();
    return [t('.k'), { count: Number(t('.v').replace(/,/g, '')), hint: t('.h'), id: e.id }];
  })));
  /** Rows as drawn: { id, name, level, phone, counts: [enquiries, quotations, invoices, projects] } */
  const rows = () => page.locator(ROWS).evaluateAll((els) => els.map((e) => ({
    id: e.id.replace('bc-row-', ''),
    name: (e.querySelector('.nm')?.innerText || '').trim(),
    level: (e.querySelector('.badge')?.innerText || '').trim(),
    phone: (e.querySelector('bdi')?.innerText || '').trim(),
    counts: [...e.querySelectorAll('b')].map((b) => Number(b.innerText.trim())),
  })));
  /** N from "Showing 1 to 10 of N entries" under the list (null when the line is not drawn). */
  const listTotal = async () => {
    const t = await page.getByText(/Showing \d+ to \d+ of [\d,]+ entries/).first().innerText({ timeout: 3000 }).catch(() => '');
    const m = t.match(/of ([\d,]+) entries/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };
  const addNew = () => page.locator('main button, main a, .main-content button, .main-content a').filter({ hasText: /^\s*Add New\s*$/ }).filter({ visible: true }).first();

  test('MC-20 | Customers: the tile counts agree (All = Suspect + Prospect + Customer) and each tile lists only its own level', async () => {
    await open('/customers');
    await page.locator(ROWS).first().waitFor({ state: 'visible', timeout: 20000 });
    const t = await tiles();
    const parts = ['Suspect', 'Prospect', 'Customer'];
    for (const k of ['All', ...parts]) expect(t[k], `tile "${k}" is missing (tiles: ${Object.keys(t).join(' | ')})`).toBeTruthy();
    expect(parts.reduce((a, k) => a + t[k].count, 0), `All=${t.All.count}, parts=${parts.map((k) => t[k].count).join('+')}`).toBe(t.All.count);

    // the "% of all" under a tile is its count over All
    for (const k of parts) {
      const pct = Number((t[k].hint.match(/(\d+)\s*%/) || [])[1]);
      const real = t.All.count ? (t[k].count / t.All.count) * 100 : 0;
      expect(Math.abs(pct - real), `${k}: the tile says "${t[k].hint}" for ${t[k].count} of ${t.All.count} (${real.toFixed(1)}%)`).toBeLessThanOrEqual(1);
    }
    // the line under the list counts the same parties as the All tile
    expect(await listTotal(), 'the "of N entries" line under the list').toBe(t.All.count);

    // each tile lists only its own level, and as many as it says
    for (const k of parts) {
      await page.locator(`#${t[k].id}`).click();
      await page.waitForTimeout(2500);
      const shown = await rows();
      if (t[k].count === 0) { expect(shown.length, `${k} tile says 0 but rows are listed`).toBe(0); continue; }
      expect(shown.length, `${k} tile says ${t[k].count} but no row is listed`).toBeGreaterThan(0);
      expect([...new Set(shown.map((r) => r.level))], `rows under the ${k} tile`).toEqual([k]);
      expect(await listTotal(), `"of N entries" under the ${k} tile`).toBe(t[k].count);
    }
    await page.locator(`#${t.All.id}`).click();
  });

  test('MC-21 | Customers: the Add form validates, and the QA fixture exists', async () => {
    await open('/customers');
    // 1. required fields: an empty form must not be saved
    await addNew().click();
    const modal = page.locator('.modal.show').last();
    await expect(modal).toBeVisible({ timeout: 10000 });
    writes = [];
    await modal.locator('#btn-customer-save').click();
    await page.waitForTimeout(2000);
    expect(writes.filter((w) => /save-customer/i.test(w)), 'an empty customer form was sent to the server').toEqual([]);
    await expect(modal, 'required-field messages').toContainText(/required/i);
    await page.locator('.swal2-confirm:visible').first().click().catch(() => {});
    await modal.locator('#btn-customer-close').click();     // this modal ignores Escape
    await expect(modal).toBeHidden({ timeout: 8000 });

    // 2. the fixture: create it once. Reload first, so the search runs against a clean list.
    await open('/customers');
    if (await (await search(FIXTURE.name)).count()) return;
    await addNew().click();
    await expect(modal).toBeVisible({ timeout: 10000 });
    await modal.locator('#first-name').fill(FIXTURE.name);
    await modal.locator('#cust-disp-ind').fill(FIXTURE.name);
    await modal.locator('#customer-phone-input').fill(FIXTURE.phone);
    await modal.locator('#customer-level').selectOption({ label: 'Prospect' });
    await modal.locator('#btn-customer-save').click();
    await expect(page.locator('.swal2-popup, .toast').filter({ hasText: /Saved Successfully/i }).first()).toBeVisible({ timeout: 15000 });
    await open('/customers');
    await expect(await search(FIXTURE.name), 'the QA customer was saved but is not listed').toHaveCount(1);
  });

  test('MC-22 | Customers: search finds the fixture by name and by phone, and nothing for nonsense', async () => {
    await open('/customers');
    await expect(await search(FIXTURE.name), 'search by name').toHaveCount(1);
    await expect(await search(FIXTURE.phone), 'search by phone').toHaveCount(1);
    const none = (await (await search(`zz_no_match_${Date.now()}`)).count()) + 0;
    expect(none, 'nonsense matched a customer').toBe(0);
    expect(writes, 'searching sent a write request').toEqual([]);
  });

  test('MC-23 | Customers: the side panel shows the chosen customer, and Open Profile opens its own page', async () => {
    await open('/customers');
    const row = (await search(FIXTURE.name)).first();
    await expect(row).toBeVisible();
    await row.click();
    const panel = page.locator('#cst-panel');
    await expect(panel, 'the side panel does not show the chosen customer').toContainText(FIXTURE.name, { timeout: 10000 });
    await expect(panel, 'the side panel does not show its phone').toContainText(FIXTURE.phone);
    // Enquiries / Quotations / Invoices / Projects: the four numbers on the row are the four on the panel
    const me = (await rows()).find((r) => r.name === FIXTURE.name);
    const onPanel = (await panel.locator('a[href*="customer/"] b').allInnerTexts()).map((x) => Number(x.trim()));
    expect(onPanel, `row shows ${me.counts.join(' / ')}, panel shows ${onPanel.join(' / ')}`).toEqual(me.counts);

    const list = page.url();
    await panel.locator('[id^="bc-view-btn-"]').click();      // "Open Profile"
    await page.waitForFunction((u) => location.href !== u, list, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    expect(page.url(), 'Open Profile went to another customer').toContain(`/customer/${me.id}`);
    await expect(page.locator('main, .main-content').first(), 'customer page does not show the customer').toContainText(FIXTURE.name, { timeout: 15000 });
  });

  test('MC-24 | Custom Report: Save is refused until a field and a filter are chosen', async () => {
    await open('/dynamic-list');
    await page.locator('main button, main a, .main-content button, .main-content a').filter({ hasText: /^\s*Add New\s*$/ }).filter({ visible: true }).first().click();
    await page.locator('#dr-report-name').waitFor({ state: 'visible', timeout: 15000 });
    // Leads, Tasks and Customers are fixed. The fourth type is the tenant's Work Flow module: "Projects"
    // since the Nov 2026 build ("Project" before), and it is added a moment after the other three.
    const readTypes = async () => (await page.locator('#dr-report-type option').allTextContents()).map((t) => t.trim()).filter((t) => t && !/^choose/i.test(t));
    await expect.poll(readTypes, { timeout: 12000, message: 'report types' })
      .toEqual(expect.arrayContaining(['Leads', 'Tasks', 'Customers', expect.stringMatching(/^Projects?$/)]));

    await page.locator('#dr-report-name').fill(`QA_report_${Date.now()}`);
    await page.locator('#dr-report-type').selectOption({ label: 'Leads' });
    await page.waitForTimeout(1200);
    writes = [];
    const save = page.locator('button:has-text("Save")').filter({ visible: true }).first();

    await save.click();   // nothing chosen yet
    await expect(page.locator('.swal2-popup').filter({ hasText: /Please select at least one field/i }).first(), 'no "select a field" message').toBeVisible({ timeout: 8000 });
    await page.locator('.swal2-confirm:visible').first().click();

    await page.locator('#dr-select-fields').click();
    await page.getByText('Customer Name', { exact: true }).filter({ visible: true }).first().click();
    await page.keyboard.press('Escape');
    await save.click();   // a field, but no filter
    await expect(page.locator('.swal2-popup').filter({ hasText: /Please select at least one filter/i }).first(), 'no "select a filter" message').toBeVisible({ timeout: 8000 });
    await page.locator('.swal2-confirm:visible').first().click();

    expect(writes, 'an incomplete report was sent to the server').toEqual([]);
  });
});
