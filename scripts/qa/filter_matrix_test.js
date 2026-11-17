'use strict';
/**
 * Filter correctness matrix.
 *
 * For every listing with a filter panel: open it, pick a real (non-"All")
 * value for each dropdown in turn, apply, and check EVERY returned row
 * actually carries that value. A filter that silently ignores its input still
 * returns rows and still looks right on screen — only a row-by-row check
 * catches it.
 *
 * Where a filter's label cannot be mapped to a grid column with confidence,
 * the result is recorded as "applied, not verifiable" rather than guessed at.
 * A false pass is worse than an honest gap.
 *
 * Read-only: filters and reads. Nothing is created, saved or deleted.
 *
 *   node scripts/qa/filter_matrix_test.js
 *   node scripts/qa/filter_matrix_test.js --only /leads,/my-tasks
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
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const ONLY = argOf('only') ? argOf('only').split(',').map((s) => s.trim()) : null;

/** Listings worth filtering, across the in-scope modules. */
let LISTINGS = [
  '/leads', '/followups', '/enquiries', '/quotations', '/customers', '/dealers',
  '/my-tasks', '/delegated-tasks', '/todo-list', '/daily-activity-report',
  '/lead-expenses', '/solar-orders', '/users', '/branches', '/suppliers',
];
if (ONLY) LISTINGS = LISTINGS.filter((l) => ONLY.includes(l));

/**
 * Filter label → the grid column that should reflect it.
 * Only pairs we are confident about; anything else stays unverifiable.
 */
const LABEL_TO_COLUMN = {
  'lead source': ['lead source', 'source'],
  'assigned to': ['assignee', 'assigned to', 'assigned'],
  'branch': ['branch'],
  'status': ['status'],
  'lead quality': ['lead quality', 'quality'],
  'nature': ['nature'],
  'added by': ['added by', 'created by'],
  'priority': ['priority'],
  'department': ['department'],
};

const readGrid = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const onScreen = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const t = [...document.querySelectorAll('table')].filter(onScreen)
    .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { headers: [], rows: [] };
  const headers = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
  const rows = [...t.querySelectorAll('tbody tr')]
    .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText)))
    // Drop empty-state placeholder rows in all their observed wordings.
    .filter((cells) => !(cells.length <= 2 &&
      /no data|no record|no expenses|no lead source|nothing|not found/i.test(cells.join(' '))));
  return { headers, rows };
};

/** Enumerate the filter panel's selects with their labels and real options. */
const readFilterPanel = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const onScreen = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const panel = [...document.querySelectorAll('.offcanvas.show, .modal.show')].filter(onScreen)[0];
  if (!panel) return { open: false, selects: [] };
  return {
    open: true,
    selects: [...panel.querySelectorAll('select')].filter(onScreen).map((s, i) => {
      const grp = s.closest('.form-group, .col, .mb-3, div');
      const lbl = grp && grp.querySelector('label');
      return {
        index: i,
        id: s.id || null,
        label: clean(lbl && lbl.innerText),
        options: [...s.options]
          .map((o) => ({ value: o.value, text: clean(o.text) }))
          // Skip "All"/placeholder entries — they assert nothing.
          .filter((o) => o.value && o.value !== '0' && o.value !== '-1' && !/^all$/i.test(o.text)),
      };
    }),
  };
};

async function openFilter(page) {
  await page.locator('#btn-toggle-filter, button:has-text("Filter")').first()
    .click({ timeout: 7000 }).catch(() => {});
  await page.waitForTimeout(1400);
  return page.evaluate(readFilterPanel);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const report = { base: BASE, tenant: C.company, at: new Date().toISOString(), listings: [] };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    for (const route of LISTINGS) {
      console.log(`\n══ ${route} ══`);
      const entry = { route, filters: [], note: null };

      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3800);
      const baseline = await page.evaluate(readGrid);
      entry.headers = baseline.headers;
      entry.baselineRows = baseline.rows.length;

      if (!baseline.headers.length) {
        entry.note = 'no grid on this page';
        console.log('   (no grid — skipped)');
        report.listings.push(entry);
        continue;
      }

      const panel = await openFilter(page);
      if (!panel.open) {
        entry.note = 'no filter panel found';
        console.log('   (no filter panel — skipped)');
        report.listings.push(entry);
        continue;
      }
      console.log(`   baseline ${baseline.rows.length} row(s) · ${panel.selects.length} filter select(s)`);

      for (const sel of panel.selects) {
        if (!sel.options.length) continue;
        const labelKey = (sel.label || '').toLowerCase();
        const colAliases = LABEL_TO_COLUMN[labelKey];
        const colIdx = colAliases
          ? baseline.headers.findIndex((h) => colAliases.includes(h.toLowerCase()))
          : -1;

        const choice = sel.options[0];
        // Re-open the page each time so filters do not compound.
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(3000);
        await openFilter(page);
        const applied = await page.evaluate(({ idx, value }) => {
          const onScreen = (e) => e.getClientRects().length > 0;
          const panel = [...document.querySelectorAll('.offcanvas.show, .modal.show')].filter(onScreen)[0];
          if (!panel) return false;
          const s = [...panel.querySelectorAll('select')].filter(onScreen)[idx];
          if (!s) return false;
          s.value = value;
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, { idx: sel.index, value: choice.value });

        if (!applied) continue;
        await page.locator('#btn-apply-filter').click({ timeout: 7000 }).catch(() => {});
        await page.waitForTimeout(3200);
        const got = await page.evaluate(readGrid);

        const result = {
          label: sel.label || `(select #${sel.index})`,
          id: sel.id,
          chose: choice.text,
          rowsReturned: got.rows.length,
          verifiable: colIdx >= 0,
          column: colIdx >= 0 ? baseline.headers[colIdx] : null,
        };

        if (colIdx >= 0 && got.rows.length) {
          const want = choice.text.toLowerCase();
          const bad = got.rows.filter((r) => {
            const cell = (r[colIdx] || '').toLowerCase();
            return cell && !cell.includes(want) && !want.includes(cell);
          });
          result.mismatched = bad.length;
          result.sample = bad.slice(0, 2).map((r) => r[colIdx]);
          result.pass = bad.length === 0;
          console.log(`   ${result.pass ? '✅' : '❌'} ${result.label} = "${choice.text}" → ${got.rows.length} row(s), ${bad.length} mismatched${bad.length ? ` (e.g. "${result.sample[0]}")` : ''}`);
        } else {
          result.pass = null;
          console.log(`   ⚪ ${result.label} = "${choice.text}" → ${got.rows.length} row(s) (no matching grid column — not verifiable)`);
        }
        entry.filters.push(result);
      }
      report.listings.push(entry);
    }
  } catch (e) {
    console.log('\nFATAL:', e.message);
    report.fatal = e.message.split('\n')[0];
  } finally {
    await browser.close();
  }

  const all = report.listings.flatMap((l) => l.filters || []);
  const checked = all.filter((f) => f.pass !== null);
  const failed = checked.filter((f) => !f.pass);
  console.log(`\n═══ ${checked.length} verifiable filters · ${failed.length} returned wrong rows · ${all.length - checked.length} not verifiable ═══`);
  const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'filter-matrix.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(report, null, 2));
  console.log(`wrote ${path.relative(path.join(__dirname, '..', '..'), p)}`);
})();
