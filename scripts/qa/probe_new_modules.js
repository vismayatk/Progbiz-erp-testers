'use strict';
/**
 * Structural probe of the CRM modules that have zero automated coverage.
 *
 * These pages were built after the Playwright suite was written, so nothing
 * is known about them. Dump enough structure — grids, computed columns,
 * editable fields, action buttons — to write real assertions against them.
 *
 * Read-only. Nothing is filled, clicked or saved.
 *
 *   node scripts/qa/probe_new_modules.js
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

const ROUTES = [
  '/sales-targets',
  '/lead-source-commissions',
  '/lead-expenses',
  '/call-analysis',
  '/solar-orders',
  '/add-multiple-lead-tasks',
  '/crm-dashboard',
];

const dump = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const onScreen = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  return {
    heading: clean(document.querySelector('h1,h2,.page-title,.card-title')?.innerText).slice(0, 70),
    // Visible grids with their full first rows — needed to check arithmetic.
    grids: [...document.querySelectorAll('table')].filter(onScreen).map((t, i) => ({
      idx: i,
      headers: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
      rowCount: t.querySelectorAll('tbody tr').length,
      rows: [...t.querySelectorAll('tbody tr')].slice(0, 4).map((r) =>
        [...r.querySelectorAll('td')].map((c) => {
          const inp = c.querySelector('input,select');
          return inp
            ? { input: inp.id || inp.name || '(anon)', value: inp.value, type: inp.type }
            : clean(c.innerText).slice(0, 26);
        })
      ),
    })),
    editableFields: [...document.querySelectorAll('input,select,textarea')]
      .filter(onScreen).filter((e) => e.type !== 'hidden')
      .map((e) => ({
        id: e.id || null, name: e.name || null, tag: e.tagName.toLowerCase(),
        type: e.type || null, value: String(e.value ?? '').slice(0, 24),
        readOnly: e.readOnly || e.disabled || false,
      })).slice(0, 40),
    actionButtons: [...document.querySelectorAll('button,a.btn')].filter(onScreen)
      .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 30) }))
      .filter((b) => b.id || b.text).slice(0, 24),
    // Dashboard-style summary numbers, for cross-checking against listings.
    statTiles: [...document.querySelectorAll('.card, .stat, .widget, [class*="count" i]')]
      .filter(onScreen).map((c) => clean(c.innerText).slice(0, 90))
      .filter((t) => /\d/.test(t)).slice(0, 20),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const out = {};
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);
    for (const r of ROUTES) {
      process.stdout.write(`  ${r.padEnd(28)}`);
      await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(4200);
      out[r] = await page.evaluate(dump).catch((e) => ({ error: e.message }));
      const g = out[r].grids || [];
      console.log(`grids=${g.length} rows=${g[0] ? g[0].rowCount : 0} fields=${(out[r].editableFields || []).length} buttons=${(out[r].actionButtons || []).length}`);
    }
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await browser.close();
  }
  const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'new-modules-probe.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out, null, 2));
  console.log(`\n✅ wrote ${path.relative(path.join(__dirname, '..', '..'), p)}`);
})();
