'use strict';

/**
 * Tracked front-end script errors  (ERP-011, ERP-012)
 *
 * Each test is an expected failure (`test.fail`): it describes the behaviour that SHOULD hold and
 * fails today because of a known defect. When the defect is fixed the test starts passing, Playwright
 * reports "expected to fail but passed", and the marker comes off.
 *
 *   ERP-011  Landing on /home after login throws
 *            "Cannot read properties of null (reading 'removeEventListener')" at assets/js/defaultmenu.min.js:1029
 *   ERP-012  Opening an Edit modal a second time throws "Cannot convert undefined or null to object"
 *            from Bootstrap's Tooltip (Object.values in _isWithActiveTrigger)
 *   (ERP-001, ERP-002, ERP-010 are tracked per page in erp/common/fixtures/pages.<tenant>.json)
 *
 * Read-only: opens an existing record's edit form and closes it, never saves.
 *
 * Run:  npx playwright test erp/master/tests/script_errors.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');

const BASE = process.env.BASE_URL || 'https://test.erp.progbiz.in';
const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

test.describe('Tracked script errors', () => {
  test.describe.configure({ timeout: 120_000 });

  test('ERP-011 | landing on Home after login raises no script error', async ({ page }) => {
    test.fail(true, 'ERP-011 — defaultmenu.min.js:1029 reads removeEventListener of null on the first load of /home');
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    await page.waitForTimeout(3500);
    expect(errors, 'script errors on the first load of /home').toEqual([]);
  });

  test('ERP-012 | opening an Edit modal twice raises no script error', async ({ page }) => {
    test.fail(true, 'ERP-012 — Bootstrap Tooltip._isWithActiveTrigger calls Object.values(undefined) when an Edit modal is reopened');
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    await page.goto(`${BASE}/workflow-cost-types`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const pencil = page.locator('table tbody tr').first().locator('a:has(i.ri-pencil-line), button:has(i.ri-pencil-line)').first();
    test.skip(!(await pencil.count()), 'no cost type to open');
    const errors = [];
    page.on('pageerror', (e) => { if (!/removeEventListener/.test(e.message)) errors.push(e.message); });
    for (let i = 0; i < 2; i++) {          // the error appears on the second open
      await pencil.click();
      await page.waitForTimeout(2500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
    expect(errors, 'script errors while reopening an Edit modal').toEqual([]);
  });
});
