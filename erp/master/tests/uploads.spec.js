'use strict';

/**
 * Excel Upload — the five import pages  (UP-01 .. UP-08)
 *
 *   Individual Customer · Business Customer · Enquiry · Item   /…-upload     Data Import  /data-import
 *
 * These tests never import data. A real spreadsheet would create customers, enquiries or items that
 * cannot be deleted from the UI, so what is checked is everything around the import:
 *   UP-01..05  a file that is not a spreadsheet is refused by the server ("Only .xls and .xlsx files
 *              are allowed") and nothing is added to the upload history
 *   UP-06      Data Import offers a template for every import type, and each downloads as a real .xlsx
 *   UP-07      the history heading follows the chosen import type
 *   UP-08      Upload with no file sends nothing
 *
 * Run:  npx playwright test erp/master/tests/uploads.spec.js
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
const NOT_A_SHEET = { name: `QA_invalid_upload_${Date.now()}.txt`, mimeType: 'text/plain', buffer: Buffer.from('QA invalid upload file: not a spreadsheet') };

const PAGES = [
  { id: 'UP-01', title: 'Individual Customer Upload', route: '/individual-customer-upload', p: 'ic' },
  { id: 'UP-02', title: 'Business Customer Upload',   route: '/business-customer-upload',   p: 'bc' },
  { id: 'UP-03', title: 'Enquiry Upload',             route: '/enquiry-upload',             p: 'eq' },
  { id: 'UP-04', title: 'Item Upload',                route: '/crm-item-upload',            p: 'it' },
  { id: 'UP-05', title: 'Data Import',                route: '/data-import',                p: 'di', hasType: true },
];

test.describe('Excel Upload pages', () => {
  test.describe.configure({ timeout: 150_000 });
  test.skip(C.company !== 'onetouch_test', 'uploads files to the tenant: onetouch_test only');

  let page;
  let uploads = [];
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
    page = await ctx.newPage();
    page.on('request', (r) => {
      const u = r.url();
      if (u.startsWith(BASE) && r.method() !== 'GET' && /\/api\//.test(u) && !/\/(get|list|search|count)[\w-]*/i.test(u)) uploads.push(u.replace(BASE, ''));
    });
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
  });
  test.afterAll(async () => { await page?.context().close(); });

  async function open(route) {
    uploads = [];
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (await dismissRateLimit(page)) { await page.waitForTimeout(15000); await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  const historyRows = async () => (await page.locator('table tbody tr').allInnerTexts())
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t && !/^no (data|records)/i.test(t)).length;
  const dialog = () => page.locator('.swal2-popup:visible, .modal.show:visible').first();
  const chooseBranchAndType = async (cfg) => {
    await page.selectOption(`#${cfg.p}-branch`, { index: 1 });
    if (cfg.hasType) { await page.selectOption('#di-type', { index: 1 }); await page.waitForTimeout(1000); }
  };
  const uploadBtn = () => page.locator('button:has-text("Upload"), input[type="button"][value*="Upload" i], input[type="submit"][value*="Upload" i]').filter({ visible: true }).first();

  for (const cfg of PAGES) {
    test(`${cfg.id} | ${cfg.title}: a file that is not a spreadsheet is refused, nothing is imported`, async () => {
      await open(cfg.route);
      const before = await historyRows();
      await chooseBranchAndType(cfg);
      await page.locator(`#${cfg.p}-upload-excel`).setInputFiles(NOT_A_SHEET);
      await page.waitForTimeout(800);
      await uploadBtn().click();
      await expect(dialog(), 'the server accepted a .txt file, or gave no message').toContainText(/Only \.xls and \.xlsx files are allowed/i, { timeout: 15000 });
      await page.locator('.swal2-confirm:visible').first().click().catch(() => {});
      await page.waitForTimeout(1200);
      expect(await historyRows(), 'a refused file must not appear in the upload history').toBe(before);
    });
  }

  test('UP-06 | Data Import offers a template for every import type, and each is a real .xlsx', async () => {
    await open('/data-import');
    const types = (await page.locator('#di-type option').allTextContents()).map((t) => t.trim()).filter((t) => t && !/^choose/i.test(t));
    expect(types.length, 'import types listed').toBeGreaterThan(3);
    const bad = [];
    for (const t of types) {
      await page.selectOption('#di-type', { label: t });
      await page.waitForTimeout(800);
      const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await page.locator('button:has-text("Download Template")').first().click();
      const d = await dl;
      if (!d) { bad.push(`${t}: no download`); continue; }
      const size = (await d.createReadStream().then((s) => new Promise((res) => { let n = 0; s.on('data', (c) => { n += c.length; }); s.on('end', () => res(n)); }))) || 0;
      if (!/\.xlsx$/i.test(d.suggestedFilename())) bad.push(`${t}: "${d.suggestedFilename()}" is not .xlsx`);
      if (size < 2000) bad.push(`${t}: template is only ${size} bytes`);
    }
    expect(bad, 'broken templates').toEqual([]);
  });

  test('UP-07 | Data Import: the upload-history heading follows the chosen import type', async () => {
    await open('/data-import');
    const types = (await page.locator('#di-type option').allTextContents()).map((t) => t.trim()).filter((t) => t && !/^choose/i.test(t));
    for (const t of types.slice(0, 3)) {
      await page.selectOption('#di-type', { label: t });
      await expect(page.getByText(/Upload history/i).first(), `history heading for ${t}`).toContainText(t.split(' (')[0], { timeout: 8000 });
    }
  });

  test('UP-08 | Upload with no file sends nothing and adds no history row', async () => {
    for (const cfg of PAGES) {
      await open(cfg.route);
      const before = await historyRows();
      await chooseBranchAndType(cfg);
      uploads = [];
      await uploadBtn().click();
      await page.waitForTimeout(2500);
      expect(uploads, `${cfg.title}: Upload with no file sent a write request`).toEqual([]);
      await page.locator('.swal2-confirm:visible').first().click().catch(() => {});
      expect(await historyRows(), `${cfg.title}: history changed`).toBe(before);
    }
  });
});
