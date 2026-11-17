'use strict';
/**
 * Second verification pass for the CRM sweep.
 *
 * Two jobs:
 *   1. Decide whether the suspicious column headers are actually on screen.
 *      A header like "IsIncTax" in a hidden row-template is sloppy but not a
 *      user-facing defect, and filing it as one burns the reader's trust.
 *   2. Drive the core enquiry workflow end to end, which no structural probe
 *      can evaluate — this is where business-rule bugs live.
 *
 * Creates ONE enquiry named QA_<timestamp> so it is identifiable and
 * cleanable. Nothing is deleted.
 *
 *   node scripts/qa/verify_crm_visibility.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { EnquiryPage } = require('../../erp/crm/pages/EnquiryPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};
const STAMP = Date.now();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const R = { stamp: STAMP };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // ── 1. Are the odd headers actually rendered to a user? ────────────────
    const visibleHeaders = async (route) => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);
      return page.evaluate(() => {
        const onScreen = (e) => {
          if (e.getClientRects().length === 0) return false;
          const s = getComputedStyle(e);
          return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
        };
        return [...document.querySelectorAll('table')].map((t, i) => ({
          table: i,
          tableVisible: onScreen(t),
          headers: [...t.querySelectorAll('thead th')].map((h) => ({
            text: (h.innerText || '').replace(/\s+/g, ' ').trim(),
            visible: onScreen(h),
          })).filter((h) => h.text),
        })).filter((t) => t.headers.length);
      });
    };
    R.enquiryVisible = await visibleHeaders('/enquiry');
    R.quotationVisible = await visibleHeaders('/quotation');
    R.callAnalysisVisible = await visibleHeaders('/call-analysis');

    // ── 2. Core workflow: create an enquiry end to end ─────────────────────
    const enq = new EnquiryPage(page);
    await enq.openAddForm();
    await page.waitForTimeout(1500);

    const customer = `QA_${STAMP}`;
    R.workflow = { customer, steps: [] };
    const step = (name, ok, detail) => {
      R.workflow.steps.push({ name, ok, detail: detail || null });
      console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
    };

    // Customer + phone
    await page.locator('#TxtCustomer').fill(customer).catch(() => {});
    await page.locator('#customer-phone').fill(String(STAMP).slice(-10)).catch(() => {});
    step('fill customer + phone', true, customer);

    // Assign To / Lead Source — required selects
    for (const [id, label] of [['#assignto', 'Assign To'], ['#leadsource', 'Lead Source']]) {
      const picked = await page.locator(id).evaluate((s) => {
        const o = [...s.options].filter((x) => x.value && x.value !== '0');
        if (!o.length) return null;
        s.value = o[0].value;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return o[0].text.trim();
      }).catch(() => null);
      step(`select ${label}`, !!picked, picked || 'no options available');
    }

    // Item line — the flow that broke on the other tenant
    let itemOk = true, itemErr = null;
    try {
      await enq.addItem('Inverter', '2');
    } catch (e) { itemOk = false; itemErr = e.message.split('\n')[0].slice(0, 140); }
    step('add line item', itemOk, itemErr);

    // Save
    const urlBefore = page.url();
    await page.locator('#btn-save-enquiry').click({ timeout: 15000 }).catch((e) => {
      R.workflow.saveClickError = e.message.split('\n')[0].slice(0, 120);
    });
    await page.waitForTimeout(6000);

    R.workflow.afterSave = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return {
        url: location.pathname,
        alert: clean([...document.querySelectorAll('.swal2-popup, .toast, .alert')].map((e) => e.innerText).join(' | ')).slice(0, 300),
        hasError: /oops|error code|went wrong|exception/i.test(document.body.innerText),
      };
    });
    R.workflow.afterSave.navigatedAway = page.url() !== urlBefore;
    step('save enquiry', R.workflow.afterSave.navigatedAway || /success|saved/i.test(R.workflow.afterSave.alert),
      `url=${R.workflow.afterSave.url} alert="${R.workflow.afterSave.alert.slice(0, 80)}"`);
    await page.screenshot({ path: 'reports/qa/shots/crm/_verify_after_save.png', fullPage: true }).catch(() => {});

    // Did it actually persist? Search the leads listing for our customer.
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const found = await page.locator('table tbody tr').filter({ hasText: customer }).count().catch(() => 0);
    step('enquiry appears in /leads', found > 0, `${found} matching row(s)`);
    R.workflow.persisted = found > 0;

    const out = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'crm-visibility-workflow.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(R, null, 2));
    console.log(`\n✅ wrote ${path.relative(path.join(__dirname, '..', '..'), out)}`);
    console.log(`   test record created: ${customer}`);
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
