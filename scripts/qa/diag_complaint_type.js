'use strict';
/**
 * Read-only probe: what does the /add-complaint "Complaint type" select
 * actually offer right now?
 *
 * CMP-03 failed on 2026-09-21 with `chosen={"Branch":"Kannur"}` (no Complaint
 * type chosen) and the app's own validation alert "Please choose a complaint
 * type". ComplaintsPage.create() picks the first <option> whose value isn't
 * "0"/empty and whose text doesn't start with "Choose"/"Select" — if that
 * came back null, either (a) the tenant has no complaint types configured, or
 * (b) the real options now fail that filter (e.g. value="0" reused, or a
 * different placeholder wording). This dumps every option verbatim so the
 * difference is visible. Nothing is submitted.
 *
 * Run AFTER the full suite finishes (single-session rule — no concurrent
 * browser on lesol_test).
 *
 * Run:  node scripts/qa/diag_complaint_type.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const C = {
  company: process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD || '123',
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login(C.company, C.username, C.password);
    await page.goto(`${process.env.BASE_URL}/add-complaint`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);

    const dump = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const label = (e) => clean(e.closest('.form-group,.mb-3,.mb-2,.col,.col-md-6,.col-md-4,.col-12,div')?.querySelector('label')?.innerText || '');
      return [...document.querySelectorAll('select')].map((sel) => ({
        label: label(sel),
        options: [...sel.options].map((o) => ({ value: o.value, text: clean(o.text), selected: o.selected })),
      }));
    });
    console.log(JSON.stringify(dump, null, 1));
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
})();
