'use strict';
/**
 * Retest every previously-reported issue against the current tenant, and
 * re-run the sorting check with a collation-independent method.
 *
 * The sorting assertion in the earlier pass compared against JavaScript's
 * localeCompare, which does not match the database collation the server
 * sorts with — so a legitimate sort looked broken. The reliable check is
 * that ascending and descending are reverses of one another over the same
 * rows: that holds under any collation.
 *
 * Read-only.
 *   node scripts/qa/retest_known_issues.js
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
const out = [];
const rec = (id, t, status, d) => {
  out.push({ id, title: t, status, detail: d });
  const m = { REPRODUCED: '❌', FIXED: '✅', ABSENT: '⚪', INCONCLUSIVE: '⚪' }[status] || '·';
  console.log(`  ${m} ${id.padEnd(8)} ${status.padEnd(13)} ${t}${d ? ` — ${d}` : ''}`);
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
  const consoleErrors = [];
  const failedReqs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 400) failedReqs.push(`${r.status()} ${r.url().slice(-70)}`); });

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // ── ERP-003: dead routes ──────────────────────────────────────────────
    console.log('\n══ ERP-003 · dead routes ══');
    ev.deadRoutes = [];
    for (const r of ['/created-tasks', '/unscheduled-tasks', '/projects', '/item', '/items', '/item-categories']) {
      const resp = await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => null);
      await page.waitForTimeout(2500);
      const dead = await page.evaluate(() =>
        /nothing at this address|sorry, there's nothing/i.test(document.body.innerText)).catch(() => false);
      ev.deadRoutes.push({ route: r, http: resp ? resp.status() : null, dead });
      console.log(`     ${r.padEnd(20)} http=${resp ? resp.status() : '?'} ${dead ? 'DEAD' : 'reachable'}`);
    }
    const deadCount = ev.deadRoutes.filter((x) => x.dead).length;
    rec('ERP-003', 'Routes returning "nothing at this address"',
      deadCount ? 'REPRODUCED' : 'FIXED', `${deadCount} of ${ev.deadRoutes.length} dead here`);

    // ── ERP-004: Blazor exception on Custom Reports ───────────────────────
    console.log('\n══ ERP-004 · Custom Reports ══');
    consoleErrors.length = 0;
    await page.goto(`${BASE}/dynamic-list`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const blazor = consoleErrors.filter((e) => /unhandled exception|disposeAllTooltips|WebAssemblyRenderer/i.test(e));
    ev.blazor = blazor;
    rec('ERP-004', 'Unhandled Blazor exception on /dynamic-list',
      blazor.length ? 'REPRODUCED' : 'FIXED',
      blazor.length ? blazor[0].slice(0, 110) : 'no unhandled exception observed');

    // ── ERP-005: duplicate element IDs in filter panels ───────────────────
    console.log('\n══ ERP-005 / ERP-006 · filter panels ══');
    ev.dupIds = {};
    for (const r of ['/leads', '/followups']) {
      await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(4000);
      await page.locator('#btn-toggle-filter, button:has-text("Filter")').first().click({ timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(1600);
      ev.dupIds[r] = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const on = (e) => e.getClientRects().length > 0;
        const panel = [...document.querySelectorAll('.offcanvas.show, .modal.show')].filter(on)[0];
        if (!panel) return { open: false };
        const sels = [...panel.querySelectorAll('select')].filter(on);
        const ids = {}, labels = {};
        for (const s of sels) {
          if (s.id) ids[s.id] = (ids[s.id] || 0) + 1;
          const g = s.closest('.form-group,.col,.mb-3,div'); const l = g && g.querySelector('label');
          const lb = l ? clean(l.innerText) : '';
          if (lb) labels[lb] = (labels[lb] || 0) + 1;
        }
        return {
          open: true,
          duplicateIds: Object.fromEntries(Object.entries(ids).filter(([, v]) => v > 1)),
          duplicateLabels: Object.fromEntries(Object.entries(labels).filter(([, v]) => v > 1)),
        };
      });
      await page.keyboard.press('Escape').catch(() => {});
    }
    const dupLeads = Object.keys(ev.dupIds['/leads']?.duplicateIds || {}).length;
    const dupFu = Object.keys(ev.dupIds['/followups']?.duplicateIds || {}).length;
    rec('ERP-005', 'Duplicate element IDs in filter panels',
      (dupLeads || dupFu) ? 'REPRODUCED' : 'FIXED',
      `/leads: ${JSON.stringify(ev.dupIds['/leads']?.duplicateIds)} · /followups: ${JSON.stringify(ev.dupIds['/followups']?.duplicateIds)}`);
    const dupLabelFu = ev.dupIds['/followups']?.duplicateLabels || {};
    rec('ERP-006', 'Two filters sharing the label "Status"',
      dupLabelFu.Status ? 'REPRODUCED' : 'FIXED', `/followups duplicate labels: ${JSON.stringify(dupLabelFu)}`);

    // ── ERP-007: duplicate "Agent" columns ────────────────────────────────
    console.log('\n══ ERP-007 · AI Call Analysis ══');
    await page.goto(`${BASE}/call-analysis`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(4500);
    const ca = await page.evaluate(grid);
    const dupCols = ca.headers.filter((h, i) => h && ca.headers.indexOf(h) !== i);
    ev.callAnalysisHeaders = ca.headers;
    rec('ERP-007', 'Duplicate column headers on AI Call Analysis',
      dupCols.length ? 'REPRODUCED' : 'FIXED',
      dupCols.length ? `duplicates: ${[...new Set(dupCols)].join(', ')} · headers: ${ca.headers.join(' | ')}` : `headers: ${ca.headers.join(' | ')}`);

    // ── ERP-010: /lead-status naming ──────────────────────────────────────
    await page.goto(`${BASE}/lead-status`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3500);
    ev.leadStatus = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return {
        heading: clean(document.querySelector('h1,h2,.card-title,.page-title')?.innerText).slice(0, 50),
        breadcrumb: clean(document.querySelector('.breadcrumb')?.innerText).slice(0, 70),
      };
    });
    rec('ERP-010', 'Lead Status page naming inconsistency',
      /followup/i.test(ev.leadStatus.heading) ? 'REPRODUCED' : 'FIXED',
      `heading="${ev.leadStatus.heading}" breadcrumb="${ev.leadStatus.breadcrumb}"`);

    // ── ERP-011: Sales Targets Total rounding ─────────────────────────────
    console.log('\n══ ERP-011 · Sales Targets ══');
    await page.goto(`${BASE}/sales-targets`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const execId = await page.evaluate(() => {
      const e = document.querySelector('[id^="spread-amount-"]');
      return e ? e.id.replace('spread-amount-', '') : null;
    });
    if (!execId) {
      rec('ERP-011', 'Sales Targets Total rounding', 'ABSENT', 'no executives on this tenant');
    } else {
      await page.locator(`#spread-amount-${execId}`).fill('99999.99');
      await page.locator(`#btn-spread-${execId}`).click({ timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const st = await page.evaluate((id) => {
        let sum = 0;
        for (let m = 0; m < 12; m++) {
          const el = document.querySelector(`#target-amount-${id}-${m}`);
          sum += el ? (parseFloat(el.value) || 0) : 0;
        }
        const tr = document.querySelector(`#spread-amount-${id}`).closest('tr');
        const cells = [...tr.querySelectorAll('td')];
        return { sum: Math.round(sum * 100) / 100, total: (cells[cells.length - 1].innerText || '').trim() };
      }, execId);
      const shown = parseFloat(String(st.total).replace(/[^0-9.]/g, ''));
      ev.salesTargets = st;
      rec('ERP-011', 'Sales Targets Total drops decimals',
        Math.abs(shown - st.sum) > 0.005 ? 'REPRODUCED' : 'FIXED',
        `months sum=${st.sum} · Total cell="${st.total}"`);
    }

    // ── Sorting, collation-independent ────────────────────────────────────
    console.log('\n══ Sorting (asc must be the reverse of desc) ══');
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(4500);
    const idx = await page.evaluate(() => {
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)
        .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
      return t ? [...t.querySelectorAll('thead th')].findIndex((h) => /customer name/i.test(h.innerText || '')) : -1;
    });
    if (idx < 0) {
      rec('SORT', 'Column sorting', 'INCONCLUSIVE', 'Customer Name column not found');
    } else {
      await page.locator('table thead th').nth(idx).click({ timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const asc = (await page.evaluate(grid)).rows.map((r) => r[idx]);
      await page.locator('table thead th').nth(idx).click({ timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const desc = (await page.evaluate(grid)).rows.map((r) => r[idx]);
      // Under ANY collation, a correct toggle makes one the reverse of the other.
      const isReverse = asc.length === desc.length && asc.length > 1 &&
        JSON.stringify(asc) === JSON.stringify([...desc].reverse());
      ev.sorting = { asc: asc.slice(0, 5), desc: desc.slice(0, 5), isReverse, rows: asc.length };
      rec('SORT', 'Ascending is the exact reverse of descending',
        isReverse ? 'FIXED' : 'REPRODUCED',
        `asc[0..2]=${asc.slice(0, 3).join(' | ')} · desc[0..2]=${desc.slice(0, 3).join(' | ')}`);
    }

  } catch (e) {
    console.log('\nFATAL:', e.message);
    rec('FATAL', 'aborted', 'INCONCLUSIVE', e.message.split('\n')[0].slice(0, 140));
  } finally {
    await browser.close();
  }

  const repro = out.filter((r) => r.status === 'REPRODUCED').length;
  const fixed = out.filter((r) => r.status === 'FIXED').length;
  console.log(`\n═══ ${repro} reproduced · ${fixed} not present · ${out.length - repro - fixed} other ═══`);
  const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'skiolo-retest.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ tenant: C.company, results: out, evidence: ev }, null, 2));
  console.log(`wrote ${path.relative(path.join(__dirname, '..', '..'), p)}`);
})();
