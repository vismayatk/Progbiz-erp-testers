'use strict';

/**
 * Master — Customers and Custom Reports  (MC-20 .. MC-24)
 *
 * Customers cannot be deleted from the UI (a row only offers View and Block number), so nothing here
 * creates a new customer per run. The tests use ONE fixed record, QA_Customer_Fixture, which is created
 * the first time it is missing and reused after that.
 *
 *   MC-20 the tab counts agree: All = Suspect + Prospect + Customer
 *   MC-21 the fixture exists (created once if missing) and the Add form validates its required fields
 *   MC-22 search finds the fixture by name and by phone; nonsense finds nothing
 *   MC-23 View opens the fixture's own page
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
  const search = async (text) => {
    const box = page.locator('#bc-search-input');
    await box.fill(text);
    await box.press('Enter');          // searches run on Enter
    await page.waitForTimeout(2500);
    return page.locator('table tbody tr').filter({ hasText: text });
  };
  const addNew = () => page.locator('main button, main a, .main-content button, .main-content a').filter({ hasText: /^\s*Add New\s*$/ }).filter({ visible: true }).first();

  test('MC-20 | Customers: the tab counts agree (All = Suspect + Prospect + Customer)', async () => {
    await open('/customers');
    const tabs = await page.locator('[role="tab"], .nav-tabs .nav-link, .nav-pills .nav-link').filter({ visible: true }).allInnerTexts();
    const n = (label) => { const t = tabs.find((x) => new RegExp(`^\\s*${label}\\b`, 'i').test(x)); const m = t && t.match(/(\d[\d,]*)\s*$/); return m ? Number(m[1].replace(/,/g, '')) : null; };
    const all = n('All'); const parts = ['Suspect', 'Prospect', 'Customer'].map(n);
    expect(all, `tab "All" has no count (tabs: ${tabs.join(' | ')})`).not.toBeNull();
    expect(parts.every((x) => x !== null), `a tab has no count (tabs: ${tabs.join(' | ')})`).toBe(true);
    expect(parts.reduce((a, b) => a + b, 0), `All=${all}, parts=${parts.join('+')}`).toBe(all);
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

  test('MC-23 | Customers: View opens the fixture\'s own page', async () => {
    await open('/customers');
    const row = (await search(FIXTURE.name)).first();
    await expect(row).toBeVisible();
    const list = page.url();
    await row.locator('button:has-text("View"), a:has-text("View")').first().click();
    await page.waitForFunction((u) => location.href !== u, list, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await expect(page.locator('main, .main-content').first(), 'customer page does not show the customer').toContainText(FIXTURE.name, { timeout: 15000 });
  });

  test('MC-24 | Custom Report: Save is refused until a field and a filter are chosen', async () => {
    await open('/dynamic-list');
    await page.locator('main button, main a, .main-content button, .main-content a').filter({ hasText: /^\s*Add New\s*$/ }).filter({ visible: true }).first().click();
    await page.locator('#dr-report-name').waitFor({ state: 'visible', timeout: 15000 });
    const types = (await page.locator('#dr-report-type option').allTextContents()).map((t) => t.trim()).filter((t) => t && !/^choose/i.test(t));
    expect(types, 'report types').toEqual(expect.arrayContaining(['Leads', 'Tasks', 'Customers', 'Project']));

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
