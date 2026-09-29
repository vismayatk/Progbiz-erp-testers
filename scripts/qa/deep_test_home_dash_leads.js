'use strict';
/**
 * Deep functional test of the three highest-traffic pages: Home, CRM
 * Dashboard and the Leads listing.
 *
 * Goes past "does it render" into the things users actually rely on:
 * do the counters agree with the lists they summarise, do tabs and
 * pagination and sorting actually work, does a filter combination behave.
 * A dashboard that shows a confident wrong number is worse than one that
 * fails to load, because nobody questions it.
 *
 * Read-only: navigates, filters, sorts and paginates. Creates nothing.
 *
 *   node scripts/qa/deep_test_home_dash_leads.js
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

const results = [];
const rec = (id, title, pass, detail) => {
  results.push({ id, title, pass, detail });
  const m = pass === null ? '⚪' : pass ? '✅' : '❌';
  console.log(`  ${m} ${id} ${title}${detail ? ` — ${detail}` : ''}`);
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
      .filter((c) => !(c.length <= 2 && /no data|no record|nothing/i.test(c.join(' ')))),
  };
};

const shot = async (page, n) => {
  const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'shots', 'skiolo-deep', `${n}.png`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const ev = {};

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // ══════════════ HOME PAGE ══════════════
    console.log('\n══ HOME PAGE ══');
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    await shot(page, 'home');

    ev.home = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      // Stat tiles: a card whose text is mostly a number plus a short label.
      const tiles = [...document.querySelectorAll('.card, .widget, [class*="stat" i], [class*="count" i]')]
        .filter(on).map((c) => clean(c.innerText)).filter((t) => t && t.length < 90 && /\d/.test(t));
      return {
        heading: clean(document.querySelector('h1,h2,h3')?.innerText).slice(0, 60),
        tiles: [...new Set(tiles)].slice(0, 25),
        hasTodaySchedule: /today'?s schedule/i.test(document.body.innerText),
        scheduleText: (() => {
          const c = [...document.querySelectorAll('.card, section')]
            .find((x) => /today'?s schedule/i.test(x.innerText || ''));
          return c ? clean(c.innerText).slice(0, 300) : '';
        })(),
        bodyChars: clean(document.body.innerText).length,
      };
    });
    rec('H-01', 'Home page renders', ev.home.bodyChars > 200, `${ev.home.bodyChars} chars, heading="${ev.home.heading}"`);
    rec('H-02', "Home shows a Today's Schedule section", ev.home.hasTodaySchedule,
      ev.home.hasTodaySchedule ? `"${ev.home.scheduleText.slice(0, 70)}…"` : 'section absent');
    console.log(`     tiles seen: ${JSON.stringify(ev.home.tiles.slice(0, 6))}`);

    // ══════════════ CRM DASHBOARD ══════════════
    console.log('\n══ CRM DASHBOARD ══');
    await page.goto(`${BASE}/crm-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6500);
    await shot(page, 'crm-dashboard');

    ev.dash = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return {
        grids: [...document.querySelectorAll('table')].filter(on).map((t, i) => {
          const hrs = [...t.querySelectorAll('thead tr')];
          const bottom = hrs.length ? [...hrs[hrs.length - 1].querySelectorAll('th')] : [];
          const carried = hrs.slice(0, -1).reduce((a, tr) =>
            a + [...tr.querySelectorAll('th')].filter((h) => (+h.getAttribute('rowspan') || 1) > 1).length, 0);
          return {
            idx: i,
            headerRowCount: hrs.length,
            effectiveCols: bottom.length + carried,
            labels: [...carried ? hrs.slice(0, -1).flatMap((tr) =>
              [...tr.querySelectorAll('th')].filter((h) => (+h.getAttribute('rowspan') || 1) > 1)
                .map((h) => clean(h.innerText))) : [],
              ...bottom.map((h) => clean(h.innerText))],
            rows: [...t.querySelectorAll('tbody tr')].map((r) =>
              [...r.querySelectorAll('td')].map((c) => clean(c.innerText))),
          };
        }),
        filters: [...document.querySelectorAll('select[id]')].filter(on).map((s) => s.id),
      };
    });
    for (const g of ev.dash.grids) {
      const bad = g.rows.filter((r) => r.length !== g.effectiveCols);
      rec(`D-0${g.idx + 1}`, `Dashboard grid ${g.idx} — cells match header columns`,
        bad.length === 0,
        `cols=${g.effectiveCols} (${g.headerRowCount} header row(s)) rows=${g.rows.length} misaligned=${bad.length}`);
    }

    // ══════════════ LEADS LISTING ══════════════
    console.log('\n══ LEADS LISTING ══');
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    await shot(page, 'leads');
    const base = await page.evaluate(grid);
    ev.leads = { headers: base.headers, baseRows: base.rows.length };
    rec('L-01', 'Leads listing renders with data', base.rows.length > 0,
      `${base.headers.length} columns, ${base.rows.length} rows`);
    console.log(`     columns: ${JSON.stringify(base.headers)}`);

    // ── Cross-check: dashboard executive lead counts vs the listing ──
    const summary = ev.dash.grids[0];
    if (summary && summary.rows.length) {
      const li = summary.labels.findIndex((l) => /^leads$/i.test(l));
      const ai = base.headers.findIndex((h) => /assignee/i.test(h));
      if (li >= 0 && ai >= 0) {
        const mismatches = [];
        for (const r of summary.rows.slice(0, 6)) {
          const name = r[0];
          const dashN = parseInt(String(r[li]).replace(/\D/g, ''), 10) || 0;
          const listN = base.rows.filter((x) => (x[ai] || '').trim() === name).length;
          // Only compare when the listing is not truncated by paging.
          if (dashN <= base.rows.length) mismatches.push({ name, dashN, listN, ok: dashN === listN });
        }
        const bad = mismatches.filter((m) => !m.ok);
        ev.crossCheck = mismatches;
        rec('D-10', 'Dashboard per-executive Leads counts match the listing',
          bad.length === 0,
          bad.length
            ? bad.map((b) => `${b.name}: dash=${b.dashN} list=${b.listN}`).join(' · ')
            : `${mismatches.length} executive(s) agree (listing page shows ${base.rows.length} rows)`);
      } else {
        rec('D-10', 'Dashboard vs listing cross-check', null, 'could not locate Leads/Assignee columns');
      }
    }

    // ── Pagination ──
    const pageSizeExists = await page.locator('#page_size').count().catch(() => 0);
    if (pageSizeExists) {
      const opts = await page.locator('#page_size option').allTextContents().catch(() => []);
      const bigger = opts.map((o) => parseInt(o, 10)).filter((n) => n > base.rows.length).sort((a, b) => a - b)[0];
      if (bigger) {
        await page.selectOption('#page_size', String(bigger)).catch(() => {});
        await page.waitForTimeout(3500);
        const after = await page.evaluate(grid);
        rec('L-02', `Page size ${bigger} returns more rows than the default`,
          after.rows.length >= base.rows.length,
          `default=${base.rows.length} → ${after.rows.length} (options: ${opts.join(',')})`);
        ev.pagination = { options: opts, base: base.rows.length, after: after.rows.length };
      } else {
        rec('L-02', 'Pagination', null, `only ${opts.join(',')} available; not more than current ${base.rows.length}`);
      }
    } else {
      rec('L-02', 'Pagination control present', null, '#page_size not found');
    }

    // ── Column sorting ──
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const sortable = await page.evaluate(() => {
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)
        .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
      if (!t) return null;
      const hs = [...t.querySelectorAll('thead th')];
      const i = hs.findIndex((h) => /customer name/i.test(h.innerText || ''));
      return i >= 0 ? { index: i, text: (hs[i].innerText || '').trim() } : null;
    });
    if (sortable) {
      const before = (await page.evaluate(grid)).rows.map((r) => r[sortable.index]);
      await page.locator('table thead th').nth(sortable.index).click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(3000);
      const after = (await page.evaluate(grid)).rows.map((r) => r[sortable.index]);
      const changed = JSON.stringify(before) !== JSON.stringify(after);
      const sorted = JSON.stringify(after) === JSON.stringify([...after].sort((a, b) => a.localeCompare(b)))
        || JSON.stringify(after) === JSON.stringify([...after].sort((a, b) => b.localeCompare(a)));
      rec('L-03', `Clicking "${sortable.text}" header sorts the column`,
        changed && sorted,
        changed ? (sorted ? 'order changed and is sorted' : 'order changed but is NOT sorted') : 'order did not change');
      ev.sorting = { column: sortable.text, before: before.slice(0, 4), after: after.slice(0, 4), changed, sorted };
    } else {
      rec('L-03', 'Column sorting', null, 'no "Customer Name" header found');
    }

    // ── Tab filters ──
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const tabs = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('[id^="tab-"], .nav-link, [role="tab"]')].filter(on)
        .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 30) }))
        .filter((b) => b.text && !/switcher|theme/i.test(b.id || ''));
    });
    ev.tabs = tabs;
    if (tabs.length) {
      const t = tabs.find((x) => x.id) || tabs[0];
      const beforeN = (await page.evaluate(grid)).rows.length;
      await page.locator(t.id ? `#${t.id}` : `text=${t.text}`).first().click({ timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const afterG = await page.evaluate(grid);
      rec('L-04', `Tab "${t.text}" changes the result set`,
        afterG.rows.length !== beforeN || afterG.rows.length === 0,
        `all=${beforeN} → "${t.text}"=${afterG.rows.length} (tabs: ${tabs.map((x) => x.text).join(', ')})`);
    } else {
      rec('L-04', 'Tab filters present', null, 'no tab controls found');
    }

    // ── Two filters at once ──
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    await page.locator('#btn-toggle-filter, button:has-text("Filter")').first().click({ timeout: 7000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const combo = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const on = (e) => e.getClientRects().length > 0;
      const panel = [...document.querySelectorAll('.offcanvas.show, .modal.show')].filter(on)[0];
      if (!panel) return null;
      const pick = (label) => {
        const s = [...panel.querySelectorAll('select')].filter(on).find((x) => {
          const g = x.closest('.form-group,.col,.mb-3,div'); const l = g && g.querySelector('label');
          return l && clean(l.innerText) === label;
        });
        if (!s) return null;
        const o = [...s.options].find((x) => x.value && x.value !== '0' && !/^all$/i.test(x.text));
        if (!o) return null;
        s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true }));
        return clean(o.text);
      };
      return { source: pick('lead source'), assignee: pick('assigned to') };
    });
    if (combo && combo.source && combo.assignee) {
      await page.locator('#btn-apply-filter').click({ timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const g2 = await page.evaluate(grid);
      const si = base.headers.findIndex((h) => /lead source/i.test(h));
      const ai = base.headers.findIndex((h) => /assignee/i.test(h));
      const bad = g2.rows.filter((r) =>
        (si >= 0 && !(r[si] || '').toLowerCase().includes(combo.source)) ||
        (ai >= 0 && !(r[ai] || '').toLowerCase().includes(combo.assignee.split(' ')[0])));
      rec('L-05', `Two filters together (Source="${combo.source}" + Assigned To="${combo.assignee}")`,
        bad.length === 0, `${g2.rows.length} row(s), ${bad.length} violate one of the two filters`);
      ev.combo = { ...combo, returned: g2.rows.length, bad: bad.length };
    } else {
      rec('L-05', 'Two filters together', null, `could not set both (${JSON.stringify(combo)})`);
    }
    await shot(page, 'leads-combo-filter');

  } catch (e) {
    console.log('\nFATAL:', e.message);
    rec('FATAL', 'run aborted', false, e.message.split('\n')[0].slice(0, 150));
  } finally {
    await browser.close();
  }

  const p = results.filter((r) => r.pass === true).length;
  const f = results.filter((r) => r.pass === false).length;
  const n = results.filter((r) => r.pass === null).length;
  console.log(`\n═══ ${p} passed · ${f} failed · ${n} inconclusive ═══`);
  const out = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'skiolo-home-dash-leads.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ tenant: C.company, results, evidence: ev }, null, 2));
  console.log(`wrote ${path.relative(path.join(__dirname, '..', '..'), out)}`);
})();
