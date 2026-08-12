'use strict';
/**
 * Verify the /lead-expenses date filter before filing anything.
 *
 * The deep test set From=31-Dec after To=01-Jan and still got a row back.
 * Two very different explanations: the filter ignores impossible ranges
 * (app bug), or my value format never registered (my bug). Discriminate by
 * first proving the filter works at all with a VALID range that should
 * exclude everything.
 *
 * Read-only.
 *   node scripts/qa/verify_lead_expense_filter.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};

const rows = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const onScreen = (e) => e.getClientRects().length > 0;
  const t = [...document.querySelectorAll('table')].filter(onScreen)[0];
  if (!t) return { headers: [], data: [] };
  return {
    headers: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    data: [...t.querySelectorAll('tbody tr')]
      .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText)))
      .filter((c) => !(c.length === 1 && /no data|no record/i.test(c[0]))),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const R = {};
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.goto(`${BASE}/lead-expenses`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);

    // What kind of inputs are these, actually?
    R.inputs = await page.evaluate(() =>
      ['expense-filter-from', 'expense-filter-to', 'expense-filter-branch', 'expense-filter-source']
        .map((id) => {
          const e = document.querySelector('#' + id);
          return e ? {
            id, tag: e.tagName.toLowerCase(), type: e.type || null,
            value: e.value, placeholder: e.getAttribute('placeholder'),
            className: (e.getAttribute('class') || '').slice(0, 60),
          } : { id, missing: true };
        })
    );
    console.log('=== FILTER INPUTS ===');
    R.inputs.forEach((i) => console.log(' ', JSON.stringify(i)));

    R.unfiltered = await page.evaluate(rows);
    console.log(`\nunfiltered rows: ${R.unfiltered.data.length}`);
    R.unfiltered.data.slice(0, 3).forEach((r) => console.log('  ', r.join(' | ').slice(0, 110)));

    // Try each plausible format against a VALID range far in the past —
    // if the filter works, this must return zero rows.
    const FORMATS = ['2020-01-01|2020-01-31', '01/01/2020|31/01/2020', '01-01-2020|31-01-2020'];
    R.validRangeAttempts = [];
    for (const f of FORMATS) {
      const [from, to] = f.split('|');
      await page.goto(`${BASE}/lead-expenses`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3500);
      const set = await page.evaluate(({ from, to }) => {
        const fe = document.querySelector('#expense-filter-from');
        const te = document.querySelector('#expense-filter-to');
        if (!fe || !te) return { ok: false };
        fe.value = from; fe.dispatchEvent(new Event('input', { bubbles: true })); fe.dispatchEvent(new Event('change', { bubbles: true }));
        te.value = to; te.dispatchEvent(new Event('input', { bubbles: true })); te.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, fromStuck: fe.value, toStuck: te.value };
      }, { from, to });
      await page.locator('#btn-search-expenses').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(3200);
      const got = await page.evaluate(rows);
      R.validRangeAttempts.push({ format: f, set, rows: got.data.length });
      console.log(`\nvalid past range "${f}" → stuck as from="${set.fromStuck}" to="${set.toStuck}" → ${got.data.length} row(s)`);
    }

    fs.writeFileSync(
      path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'lead-expense-filter-verify.json'),
      JSON.stringify(R, null, 2)
    );
    const anyWorked = R.validRangeAttempts.some((a) => a.rows === 0);
    console.log(`\nVERDICT: ${anyWorked
      ? 'the date filter DOES work in at least one format → the impossible-range result is a real validation gap'
      : 'no format produced a different result → cannot distinguish "filter ignored" from "my format wrong"; NOT filing'}`);
    console.log('✅ wrote reports/qa/raw/lead-expense-filter-verify.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
