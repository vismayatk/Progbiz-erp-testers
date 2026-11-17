'use strict';
/**
 * Read-only, single-session root-cause probe for the onetouch_test tenant's
 * 26 failures from the 2026-09-26 full-suite run. Checks, live:
 *  1) #item-search-input on /enquiry — is it really a <select>? How many
 *     real options? (CH-01/ENQ-16/ENQ-19/ENQ-28/quotation cascade)
 *  2) #branch on /enquiry — options (TM-09 found Branches: [])
 *  3) #followup on /enquiry — options (only "New Enquiry" was logged)
 *  4) /crm-item-categories and /crm-items — does #categoryname / #item-name
 *     exist there instead of at /item-categories, /item, /items?
 *  5) /call-analysis — what actually renders (NM-03: "no grid at all")
 *
 * Nothing is submitted or saved.
 * Run:  COMPANY_CODE=onetouch_test CRM_USERNAME=admin PASSWORD=123 \
 *       node scripts/qa/diag_onetouch_test.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const C = {
  company: process.env.COMPANY_CODE || 'onetouch_test',
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
    await page.waitForTimeout(1500);

    // ── 1,2,3) /enquiry form: item picker, branch, followup ────────────
    console.log('\n=== /enquiry form controls ===');
    await page.goto(`${process.env.BASE_URL}/enquiry`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    const formState = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const describe = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return { present: false };
        return {
          present: true, tag: e.tagName, type: e.type || null,
          isSelect: e.tagName === 'SELECT',
          optionCount: e.tagName === 'SELECT' ? e.options.length : null,
          options: e.tagName === 'SELECT' ? [...e.options].map((o) => clean(o.text)).slice(0, 10) : null,
          classes: (e.className || '').toString().slice(0, 100),
        };
      };
      return {
        itemSearchInput: describe('#item-search-input'),
        branch: describe('#branch'),
        followup: describe('#followup'),
      };
    });
    console.log(JSON.stringify(formState, null, 1));

    // ── 4) Item / Item Category routes ──────────────────────────────────
    console.log('\n=== Item & Item Category routes ===');
    for (const route of ['/item-categories', '/crm-item-categories', '/item', '/items', '/crm-items']) {
      await page.goto(`${process.env.BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const state = await page.evaluate(() => ({
        hasCategoryName: !!document.querySelector('#categoryname'),
        hasItemName: !!document.querySelector('#item-name'),
        bodyLen: (document.body.innerText || '').trim().length,
        title: document.title,
        url: location.pathname,
      }));
      console.log(`  ${route.padEnd(20)} ->`, JSON.stringify(state));
    }

    // ── 5) /call-analysis ────────────────────────────────────────────────
    console.log('\n=== /call-analysis ===');
    await page.goto(`${process.env.BASE_URL}/call-analysis`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const callAnalysis = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const body = clean(document.body.innerText || '');
      return {
        hasTable: !!document.querySelector('table'),
        hasGridLike: !!document.querySelector('[class*="grid" i], [class*="ag-" i], [role="grid"]'),
        bodyLen: body.length,
        snippet: body.slice(0, 200),
      };
    });
    console.log(JSON.stringify(callAnalysis, null, 1));
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
})();
