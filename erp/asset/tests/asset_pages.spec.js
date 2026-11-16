'use strict';

/**
 * Asset Management — every page opens  (AP-01 .. AP-04)
 *
 *   AP-01  each of the 27 Asset pages opens with its heading and its table columns, with no
 *          "Access Denied", no "Oops something went wrong", no script error and no failed API call
 *   AP-02  the Asset Management menu holds every entry the testing guide lists
 *   AP-03  the Reports hub has an Asset Management section, and six of its reports open with
 *          Excel and PDF buttons
 *   AP-04  Data Import offers "Assets (asset register)" with a template, Validate and Import
 *
 * Read-only: nothing is created, saved or deleted.
 * Tracked defect kept as an expected failure:
 *   AST-016  Deliveries & Pick-ups throws "Cannot read properties of undefined (reading 'style')"
 *            from defaultmenu.min.js on every load (two menu entries point at this one address)
 *
 * Run:  npx playwright test erp/asset/tests/asset_pages.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { AssetPage, clean } = require('../pages/AssetPage');

const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

// route, heading, a few table columns (read live on onetouch_test, 16 Nov 2026)
const ROUTES = [
  ['asset-dashboard', 'Asset Dashboard', []],
  ['assets', 'Assets', ['Code', 'Name', 'Category', 'Serial No', 'Status', 'Condition']],
  ['asset-scan', 'Scan Asset', []],
  ['my-assets', 'My Assets', []],
  ['asset-deliveries', 'Deliveries & Pick-ups', ['When', 'Kind', 'Contract / customer', 'Assets']],
  ['asset-approvals', 'Asset Approvals', ['Request', 'Asset', 'Details', 'Requested By']],
  ['asset-transfers', 'Asset Transfers', ['Date', 'Asset', 'From', 'To', 'Reason']],
  ['asset-exit-clearance', 'Exit Clearance', ['Employee', 'Resigned on', 'Assets held', 'Settlement']],
  ['asset-requests', 'Asset Requests', ['Requested', 'Employee', 'Kind', 'For', 'Details']],
  ['asset-employee-charges', 'Employee Charges', ['Repaired', 'Employee', 'Asset', 'Repair', 'Charge']],
  ['asset-rentals', 'Rental Contracts', ['Contract', 'Customer', 'Branch', 'Period', 'Deposit']],
  ['asset-availability', 'Availability & Bookings', ['Asset', 'Status', 'Available', 'Bookings']],
  ['asset-rental-rates', 'Rental Rate Cards', ['Applies to', 'Customer', 'Rate', 'Per', 'Minimum']],
  ['asset-leases', 'Vendor Leases', ['Lease', 'Vendor', 'Branch', 'Period', 'Monthly']],
  ['asset-maintenance', 'Maintenance', ['Opened', 'Asset', 'Type', 'Provider', 'Issue']],
  ['asset-contracts', 'AMC & Insurance', ['Type', 'Asset', 'Provider', 'Reference', 'Period']],
  ['asset-software', 'Software Licences', ['Software', 'Type', 'Branch', 'Key', 'Seats', 'Expiry']],
  ['asset-disposals', 'Disposals', ['Requested', 'Asset', 'Reason', 'Condition', 'Status']],
  ['asset-audits', 'Physical Audits', ['Date', 'Location', 'Branch', 'Auditor', 'Status']],
  ['asset-depreciation', 'Depreciation & Lease Cost', ['Month', 'Branch', 'Kind', 'Book', 'Total']],
  ['asset-categories', 'Asset Categories', ['Code', 'Name', 'Code Prefix', 'Depreciation']],
  ['asset-types', 'Asset Types', ['Category', 'Code', 'Name', 'Status']],
  ['asset-products', 'Asset Products', ['Name', 'Type', 'Manufacturer', 'Model']],
  ['asset-locations', 'Asset Locations', ['Branch', 'Code', 'Location']],
  ['asset-designation-kits', 'Designation Kits', ['Designation', 'Employees', 'Kit']],
  ['asset-settings', 'Asset Settings', []],
  ['asset-recycle-bin', 'Asset Recycle Bin', ['Code', 'Name', 'Details', 'Deleted']],
];
// what the testing guide (check A2) says an Asset Admin sees, by address
const MENU = ['assets', 'asset-scan', 'my-assets', 'asset-approvals', 'asset-transfers', 'asset-exit-clearance', 'asset-requests',
  'asset-employee-charges', 'asset-rentals', 'asset-availability', 'asset-rental-rates', 'asset-leases', 'asset-maintenance', 'asset-contracts',
  'asset-software', 'asset-disposals', 'asset-audits', 'asset-depreciation', 'asset-categories', 'asset-types', 'asset-products',
  'asset-locations', 'asset-settings', 'asset-recycle-bin', 'asset-dashboard'];
const KNOWN_SCRIPT_ERROR = { 'asset-deliveries': /reading 'style'/ };

test.describe('Asset Management — every page opens', () => {
  test.describe.configure({ timeout: 150_000 });

  /** @type {import('@playwright/test').Page} */ let page;
  /** @type {AssetPage} */ let asset;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await new LoginPage(page).login(C.company, C.username, C.password);
    asset = new AssetPage(page);
  });
  test.afterAll(async () => { await page?.close(); });

  for (const [route, heading, columns] of ROUTES) {
    test(`AP-01 | ${heading} (/${route}) opens with its heading and columns`, async () => {
      await asset.goto(route);
      const body = await asset.text(3000);
      expect(body, `/${route} shows Access Denied to the admin`).not.toMatch(/access denied/i);
      expect(body, `/${route} shows a server error`).not.toMatch(/oops something went wrong/i);
      expect(clean(await page.locator('h1, .page-title').first().innerText()), 'page heading').toBe(heading);
      const shown = (await page.locator('main th, .main-content th').allTextContents()).map((c) => clean(c).toLowerCase());
      for (const c of columns) expect(shown, `column "${c}" on /${route}`).toContain(c.toLowerCase());
      const known = KNOWN_SCRIPT_ERROR[route];
      expect(asset.errors.filter((e) => !(known && known.test(e))), `script errors on /${route}`).toEqual([]);
      expect(asset.calls, `failed API calls on /${route}`).toEqual([]);
    });
  }

  test('AST-016 | Deliveries & Pick-ups loads without a script error', async () => {
    test.fail(true, 'AST-016 — defaultmenu.min.js setNavActive throws "Cannot read properties of undefined (reading \'style\')" on every load of /asset-deliveries');
    await asset.goto('asset-deliveries', 3500);
    expect(asset.errors, 'script errors on /asset-deliveries').toEqual([]);
  });

  test('AP-02 | the Asset Management menu holds every entry of the testing guide', async () => {
    await asset.goto('home');
    const links = await page.evaluate(() => [...document.querySelectorAll('aside a[href], .app-sidebar a[href]')].map((a) => (a.getAttribute('href') || '').replace(/^\//, '')));
    const missing = MENU.filter((m) => !links.includes(m));
    expect(missing, 'menu entries the guide lists but the sidebar does not have').toEqual([]);
  });

  test('AP-03 | Reports hub: the Asset Management reports open with Excel and PDF', async () => {
    await asset.goto('reports', 3000);
    const cards = (await page.locator('.report-card').allInnerTexts()).map(clean);
    for (const name of ['Asset Register', 'Assets by Employee', 'Depreciation Schedule', 'Asset Valuation', 'Disposal Register', 'Audit Variance'])
      expect(cards.some((c) => c.startsWith(name)), `report card "${name}" on the Reports hub`).toBe(true);
    for (const type of [1, 2, 5, 13, 16, 17]) {
      await asset.goto(`asset-reports?type=${type}`, 3000);
      const body = await asset.text(1500);
      expect(body, `asset report ${type} shows an error`).not.toMatch(/oops something went wrong|access denied/i);
      const buttons = (await page.locator('main button:visible, .main-content button:visible').allInnerTexts()).map(clean);
      expect(buttons, `Excel button on asset report ${type}`).toContain('Excel');
      expect(buttons, `PDF button on asset report ${type}`).toContain('PDF');
      expect(asset.errors, `script errors on asset report ${type}`).toEqual([]);
      expect(asset.calls, `failed API calls on asset report ${type}`).toEqual([]);
    }
  });

  test('AP-04 | Data Import offers Assets with a template, Validate and Import', async () => {
    await asset.goto('data-import', 3000);
    const type = page.locator('main select:visible, .main-content select:visible').first();
    const options = (await type.locator('option').allInnerTexts()).map(clean);
    expect(options, 'import types').toContain('Assets (asset register)');
    await type.selectOption({ label: 'Assets (asset register)' });
    await page.waitForTimeout(1500);
    for (const id of ['asset-import-template', 'asset-import-branch', 'asset-import-file', 'asset-import-validate', 'asset-import-run'])
      await expect(page.locator(`#${id}`), `#${id} on the asset import`).toBeAttached();
    // Validate with no file is refused before anything is sent
    const r = await asset.press('asset-import-validate', 2000);
    expect(r.said, 'Validate with no file').toMatch(/choose the excel file/i);
    await asset.ok();
  });
});
