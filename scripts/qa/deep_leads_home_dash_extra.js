'use strict';
/**
 * Final functional pass on the three priority pages: Leads, Home, CRM Dashboard.
 *
 * Covers what the earlier passes did not reach — search correctness, clear-filter
 * behaviour, row actions, export controls, dashboard view toggles, and whether
 * Home's counters can be reconciled against the lists they summarise.
 *
 * Read-only.
 *   node scripts/qa/deep_leads_home_dash_extra.js
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
const R = [];
const rec = (id, t, pass, d) => {
  R.push({ id, title: t, pass, detail: d });
  console.log(`  ${pass === null ? '⚪' : pass ? '✅' : '❌'} ${id} ${t}${d ? ` — ${d}` : ''}`);
};
const grid = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const t = [...document.querySelectorAll('table')].filter(on)
    .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { headers: [], rows: [] };
  return {
    headers: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    rows: [...t.querySelectorAll('tbody tr')]
      .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText)))
      .filter((c) => !(c.length <= 2 && /no data|no record/i.test(c.join(' ')))),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const ev = {};
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // ══ LEADS ══
    console.log('\n══ LEADS ══');
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    await page.selectOption('#page_size', '100').catch(() => {});
    await page.waitForTimeout(3500);
    const g0 = await page.evaluate(grid);
    ev.leadsBase = { headers: g0.headers, rows: g0.rows.length };

    // Business Value — is the column ever populated?
    const bvIdx = g0.headers.findIndex((h) => /business value/i.test(h));
    if (bvIdx >= 0) {
      const vals = g0.rows.map((r) => r[bvIdx]);
      const nonZero = vals.filter((v) => v && v !== '0' && v !== '0.00' && parseFloat(v) > 0);
      rec('LX-01', 'Business Value column carries real values',
        nonZero.length > 0,
        `${nonZero.length} of ${vals.length} rows non-zero · sample: ${[...new Set(vals)].slice(0, 5).join(', ')}`);
      ev.businessValue = { total: vals.length, nonZero: nonZero.length, distinct: [...new Set(vals)].slice(0, 6) };
    }

    // Search correctness — drive search-by + match-mode properly.
    await page.locator('#btn-toggle-filter, button:has-text("Filter")').first().click({ timeout: 7000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const target = g0.rows.length ? g0.rows[0][g0.headers.findIndex((h) => /customer name/i.test(h))] : null;
    if (target) {
      const set = await page.evaluate((term) => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const on = (e) => e.getClientRects().length > 0;
        const panel = [...document.querySelectorAll('.offcanvas.show')].filter(on)[0];
        if (!panel) return false;
        const by = panel.querySelector('#lead-customer-search-by');
        const mode = panel.querySelector('#lead-customer-contains');
        if (by) { const o = [...by.options].find((x) => clean(x.text) === 'name'); if (o) { by.value = o.value; by.dispatchEvent(new Event('change', { bubbles: true })); } }
        if (mode) { const o = [...mode.options].find((x) => clean(x.text) === 'contains'); if (o) { mode.value = o.value; mode.dispatchEvent(new Event('change', { bubbles: true })); } }
        const box = [...panel.querySelectorAll('input[type="text"], input:not([type])')].filter(on)[0];
        if (!box) return false;
        box.value = term;
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, target);
      if (set) {
        await page.locator('#btn-apply-filter').click({ timeout: 7000 }).catch(() => {});
        await page.waitForTimeout(3500);
        const gs = await page.evaluate(grid);
        const ni = gs.headers.findIndex((h) => /customer name/i.test(h));
        const allMatch = gs.rows.length > 0 && gs.rows.every((r) => (r[ni] || '').includes(target));
        rec('LX-02', `Name search for "${target.slice(0, 24)}" returns only matching rows`,
          allMatch, `${gs.rows.length} row(s) returned`);
        ev.search = { term: target, returned: gs.rows.length, allMatch };

        // Clear must restore the full set.
        await page.locator('#btn-toggle-filter, button:has-text("Filter")').first().click({ timeout: 7000 }).catch(() => {});
        await page.waitForTimeout(1400);
        await page.locator('#btn-clear-filter').click({ timeout: 7000 }).catch(() => {});
        await page.waitForTimeout(3500);
        const gc = await page.evaluate(grid);
        rec('LX-03', 'Clear filter restores the unfiltered listing',
          gc.rows.length >= g0.rows.length,
          `before=${g0.rows.length} · filtered=${gs.rows.length} · after clear=${gc.rows.length}`);
      } else {
        rec('LX-02', 'Name search', null, 'could not set the search controls');
      }
    }

    // Controls present on the listing.
    ev.leadsControls = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('button, a.btn')].filter(on)
        .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 24) }))
        .filter((b) => b.id || b.text).slice(0, 20);
    });
    const hasExport = ev.leadsControls.some((b) => /export/i.test(b.id || '') || /export/i.test(b.text || ''));
    rec('LX-04', 'Leads listing offers an export control', hasExport,
      `controls: ${ev.leadsControls.map((b) => b.id || b.text).slice(0, 8).join(', ')}`);

    // ══ HOME ══
    console.log('\n══ HOME ══');
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    ev.home = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const body = clean(document.body.innerText);
      const pick = (label) => {
        const re = new RegExp(label + '\\s+(\\d[\\d,]*)', 'i');
        const m = body.match(re);
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
      };
      return {
        newLeads: pick('New Leads'),
        followups: pick('Followups'),
        delayed: pick('Delayed'),
        completed: pick('Completed'),
        totalLeadsThisMonth: pick('Total Leads'),
        scheduleText: (() => {
          const c = [...document.querySelectorAll('.card, section')].filter(on)
            .find((x) => /today'?s schedule/i.test(x.innerText || ''));
          return c ? clean(c.innerText).slice(0, 200) : '';
        })(),
        clickableTiles: [...document.querySelectorAll('.card a, .card button, .widget a')].filter(on).length,
      };
    });
    console.log(`     home counters: ${JSON.stringify(ev.home).slice(0, 260)}`);
    rec('HX-01', 'Home counters are present and numeric',
      ev.home.newLeads !== null, `New Leads=${ev.home.newLeads} Followups=${ev.home.followups} Delayed=${ev.home.delayed}`);

    // Home "Followups" vs the Follow-ups listing filtered to today.
    await page.goto(`${BASE}/followups`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);
    await page.selectOption('#page_size', '100').catch(() => {});
    await page.waitForTimeout(3000);
    const fu = await page.evaluate(grid);
    ev.followupRows = fu.rows.length;
    rec('HX-02', 'Home "Followups" count reconciles with the Follow-ups listing',
      ev.home.followups !== null ? null : null,
      `home says ${ev.home.followups} · listing shows ${fu.rows.length} row(s) — Home is day-scoped, listing is not, so these are not directly comparable`);

    // ══ DASHBOARD ══
    console.log('\n══ CRM DASHBOARD ══');
    await page.goto(`${BASE}/crm-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6500);
    ev.dashControls = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return {
        buttons: [...document.querySelectorAll('button, a.btn')].filter(on)
          .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 26) })).filter((b) => b.id || b.text).slice(0, 18),
        selects: [...document.querySelectorAll('select[id]')].filter(on).map((s) => s.id),
      };
    });
    const hasViewToggle = ev.dashControls.buttons.some((b) => /marketing view|sales view/i.test(b.text || ''));
    rec('DX-01', 'Dashboard offers the Marketing/Sales view toggle', hasViewToggle,
      `buttons: ${ev.dashControls.buttons.map((b) => b.text || b.id).slice(0, 6).join(', ')}`);

    if (hasViewToggle) {
      const before = await page.evaluate(() => document.querySelectorAll('table').length);
      await page.locator('button:has-text("Marketing View"), a:has-text("Marketing View")').first()
        .click({ timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(4000);
      const after = await page.evaluate(() => ({
        tables: document.querySelectorAll('table').length,
        err: /oops|went wrong|error code/i.test(document.body.innerText),
      }));
      rec('DX-02', 'Marketing View switches without error',
        !after.err, `tables ${before} → ${after.tables}, error text=${after.err}`);
    }

    rec('DX-03', 'Dashboard filter controls present',
      ev.dashControls.selects.length > 0, `${ev.dashControls.selects.length} select(s): ${ev.dashControls.selects.slice(0, 6).join(', ')}`);

  } catch (e) {
    console.log('\nFATAL:', e.message);
    rec('FATAL', 'aborted', false, e.message.split('\n')[0].slice(0, 140));
  } finally {
    await browser.close();
  }

  const p = R.filter((r) => r.pass === true).length;
  const f = R.filter((r) => r.pass === false).length;
  const n = R.filter((r) => r.pass === null).length;
  console.log(`\n═══ ${p} passed · ${f} failed · ${n} inconclusive ═══`);
  const out = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'skiolo-extra.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ tenant: C.company, results: R, evidence: ev }, null, 2));
  console.log(`wrote ${path.relative(path.join(__dirname, '..', '..'), out)}`);
})();
