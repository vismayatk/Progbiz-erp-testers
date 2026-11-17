'use strict';
/**
 * Read-only, single-session probe for the three non-429 failures from the
 * 2026-09-21 full test:erp run:
 *
 *  1) CMP-03 — /add-complaint "Complaint type" select had no real option to
 *     choose (chosen={"Branch":"Kannur"} only). Dump every option verbatim.
 *  2) ENQ-09 — Lead Quality was NOT visible for "New Enquiry" (contradicts the
 *     2026-09-18 live finding that it's always visible now). Re-check live.
 *  3) NP-12 — /whatsapp-expenses was still "Loading…" after 4s. Load it and
 *     watch how long it actually takes.
 *
 * One session, sequential, nothing submitted/saved.
 * Run:  node scripts/qa/diag_full_run_failures.js
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { EnquiryPage } = require('../../erp/crm/pages/EnquiryPage');

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
    await page.waitForTimeout(1500);

    // ── 1) Complaint type options ─────────────────────────────────────
    console.log('\n=== 1) /add-complaint select options ===');
    await page.goto(`${process.env.BASE_URL}/add-complaint`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    const selects = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const label = (e) => clean(e.closest('.form-group,.mb-3,.mb-2,.col,.col-md-6,.col-md-4,.col-12,div')?.querySelector('label')?.innerText || '');
      return [...document.querySelectorAll('select')].map((sel) => ({
        label: label(sel),
        options: [...sel.options].map((o) => ({ value: o.value, text: clean(o.text) })),
      }));
    });
    console.log(JSON.stringify(selects, null, 1));

    // ── 2) Lead Quality visibility for New Enquiry ────────────────────
    console.log('\n=== 2) Lead Quality for New Enquiry ===');
    const enq = new EnquiryPage(page);
    await enq.openAddForm();
    await enq.selectFollowup('New Enquiry');
    await page.waitForTimeout(800);
    const lqState = await page.evaluate(() => {
      const e = document.querySelector('#lead-quality');
      if (!e) return { present: false };
      const r = e.getClientRects();
      const cs = getComputedStyle(e);
      return {
        present: true, rects: r.length, display: cs.display, visibility: cs.visibility,
        offsetParent: !!e.offsetParent, required: e.required,
      };
    });
    console.log('New Enquiry:', JSON.stringify(lqState));
    await enq.selectFollowup('Interested');
    await page.waitForTimeout(800);
    const lqState2 = await page.evaluate(() => {
      const e = document.querySelector('#lead-quality');
      if (!e) return { present: false };
      const r = e.getClientRects();
      return { present: true, rects: r.length, offsetParent: !!e.offsetParent, required: e.required };
    });
    console.log('Interested:', JSON.stringify(lqState2));

    // ── 3) /whatsapp-expenses load time ───────────────────────────────
    console.log('\n=== 3) /whatsapp-expenses load timing ===');
    const t0 = Date.now();
    await page.goto(`${process.env.BASE_URL}/whatsapp-expenses`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    for (let i = 0; i <= 10; i++) {
      const state = await page.evaluate(() => {
        const body = document.body.innerText || '';
        return {
          loading: /loading/i.test(body) && body.replace(/\s+/g, ' ').trim().length < 60,
          hasError: /oops|went wrong|error code|exception|too many/i.test(body),
          hasTable: !!document.querySelector('table tbody tr'),
          bodyLen: body.length,
        };
      });
      console.log(`  t=${Date.now() - t0}ms`, JSON.stringify(state));
      if (!state.loading) break;
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    console.log('ERROR', e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
})();
