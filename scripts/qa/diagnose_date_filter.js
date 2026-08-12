'use strict';
/**
 * Pin down the date-filter defect.
 *
 * "Today" returns no leads even though leads exist dated today, and on
 * /followups it returns yesterday's row while hiding today's. Both symptoms
 * fit an off-by-one or a timezone-boundary error, and the two have different
 * fixes — so test every period option and see where today's records land.
 *
 * If today's records show up under "Yesterday", it is off-by-one.
 * If they appear only in the wider ranges, it is a boundary/timezone issue.
 *
 * Read-only.
 *   node scripts/qa/diagnose_date_filter.js
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
const PERIODS = ['All', 'Today', 'Yesterday', 'This Week', 'This Month', 'This Year'];

const gridRows = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const onScreen = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const t = [...document.querySelectorAll('table')].filter(onScreen)
    .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { rows: [], headers: [] };
  const headers = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
  const rows = [...t.querySelectorAll('tbody tr')]
    .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText)))
    .filter((cells) => !(cells.length === 1 && /no data/i.test(cells[0])));
  return { headers, rows };
};

async function applyPeriod(page, labelText, optionText) {
  await page.locator('#btn-toggle-filter, button:has-text("Filter")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const set = await page.evaluate(({ labelText, optionText }) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const onScreen = (e) => e.getClientRects().length > 0;
    const panel = [...document.querySelectorAll('.offcanvas.show')].filter(onScreen)[0] || document.body;
    const sels = [...panel.querySelectorAll('select')].filter(onScreen);
    const target = sels.find((s) => {
      const g = s.closest('.form-group, .col, .mb-3, div');
      const l = g && g.querySelector('label');
      return l && clean(l.innerText) === clean(labelText);
    });
    if (!target) return { ok: false };
    const o = [...target.options].find((x) => clean(x.text) === clean(optionText));
    if (!o) return { ok: false };
    target.value = o.value;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: o.value };
  }, { labelText, optionText });
  await page.locator('#btn-apply-filter').click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(3800);
  return set;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const out = { browserNow: null, periods: {} };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    out.browserNow = await page.evaluate(() => ({
      iso: new Date().toISOString(),
      local: new Date().toString(),
      offsetMinutes: new Date().getTimezoneOffset(),
    }));
    console.log('browser now:', out.browserNow.local, '| offset(min):', out.browserNow.offsetMinutes, '\n');

    for (const target of [
      { page: '/leads', label: 'Date Added', dateCol: 'Date Added' },
      { page: '/followups', label: 'Next Followup Date', dateCol: 'Next Followup Date' },
    ]) {
      console.log(`══ ${target.page} · filter "${target.label}" ══`);
      out.periods[target.page] = {};
      for (const period of PERIODS) {
        await page.goto(`${BASE}${target.page}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3200);
        const set = await applyPeriod(page, target.label, period);
        const g = await page.evaluate(gridRows);
        const di = g.headers.findIndex((h) => h === target.dateCol);
        const dates = di >= 0 ? g.rows.map((r) => (r[di] || '').slice(0, 10)) : [];
        const uniq = [...new Set(dates)];
        out.periods[target.page][period] = { ok: set.ok, rowCount: g.rows.length, distinctDates: uniq };
        console.log(`  ${period.padEnd(11)} rows=${String(g.rows.length).padStart(3)}  dates=${JSON.stringify(uniq.slice(0, 6))}`);
      }
      console.log('');
    }

    const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'crm-date-filter-diagnosis.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(out, null, 2));
    console.log('✅ wrote reports/qa/raw/crm-date-filter-diagnosis.json');
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
})();
