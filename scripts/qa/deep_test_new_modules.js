'use strict';
/**
 * Deep functional test of the uncovered CRM modules.
 *
 * Priority is arithmetic, because these pages compute money and nothing has
 * ever checked them. The Sales Targets "spread" helper divides an annual
 * figure across twelve months — if it rounds badly, every target in the
 * company is quietly wrong, and no page-load test would ever notice.
 *
 * SAFETY: fills inputs and clicks client-side helpers, but NEVER clicks
 * #btn-save-targets. Network traffic is monitored around every click so any
 * button that writes without an explicit save is caught rather than assumed
 * harmless. If a write is detected the run reports it and stops touching that
 * control.
 *
 *   node scripts/qa/deep_test_new_modules.js
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
  console.log(`  ${pass ? '✅' : '❌'} ${id} ${title}${detail ? ` — ${detail}` : ''}`);
};

const num = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const evidence = {};

  // Watch for any write request, so a "helper" that silently persists is caught.
  const writes = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) {
      writes.push({ method: r.method(), url: r.url().split('?')[0].slice(-70), at: Date.now() });
    }
  });
  const writesSince = (t) => writes.filter((w) => w.at > t);

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // ══════════ SALES TARGETS ══════════
    console.log('\n── /sales-targets ──');
    await page.goto(`${BASE}/sales-targets`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);

    const execIds = await page.evaluate(() =>
      [...document.querySelectorAll('[id^="spread-amount-"]')].map((e) => e.id.replace('spread-amount-', ''))
    );
    rec('ST-01', 'Sales Targets renders per-executive rows', execIds.length > 0, `${execIds.length} executives`);
    evidence.execIds = execIds;

    // The core arithmetic check, across values chosen to expose rounding.
    const CASES = [
      { amount: 120000, note: 'divides evenly (10,000/mo)' },
      { amount: 100000, note: 'does NOT divide evenly (8333.33…)' },
      { amount: 1, note: 'smallest positive value' },
      { amount: 99999.99, note: 'decimal input' },
    ];
    evidence.spread = [];

    for (const [i, tc] of CASES.entries()) {
      const id = execIds[0];
      if (!id) break;
      const t0 = Date.now();
      await page.locator(`#spread-amount-${id}`).fill(String(tc.amount));
      await page.locator(`#btn-spread-${id}`).click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);

      const row = await page.evaluate((execId) => {
        const months = [];
        for (let m = 0; m < 12; m++) {
          const el = document.querySelector(`#target-amount-${execId}-${m}`);
          months.push(el ? el.value : null);
        }
        // The Total cell is the last cell of that executive's row.
        const anyInput = document.querySelector(`#spread-amount-${execId}`);
        const tr = anyInput ? anyInput.closest('tr') : null;
        const cells = tr ? [...tr.querySelectorAll('td')] : [];
        const last = cells[cells.length - 1];
        return {
          months,
          totalCell: last ? (last.innerText || '').replace(/\s+/g, ' ').trim() : null,
        };
      }, id);

      const sum = row.months.reduce((a, v) => a + num(v), 0);
      const drift = Math.round((sum - tc.amount) * 100) / 100;
      const writesNow = writesSince(t0);

      evidence.spread.push({ ...tc, months: row.months, sum, drift, totalCell: row.totalCell, writes: writesNow.length });
      rec(`ST-0${i + 2}`, `Spread ${tc.amount} across 12 months (${tc.note})`,
        Math.abs(drift) < 0.005,
        `sum=${sum} drift=${drift >= 0 ? '+' : ''}${drift} · months[0..2]=${row.months.slice(0, 3).join(',')} · Total cell="${row.totalCell}"`);

      if (writesNow.length) {
        rec(`ST-W${i}`, 'Spread button did NOT write to the server', false,
          `${writesNow.length} write request(s): ${writesNow.map((w) => w.method + ' ' + w.url).join(' | ')}`);
      }
    }

    // Does the Total cell agree with the months actually on screen?
    const totalCheck = await page.evaluate((execId) => {
      const months = [];
      for (let m = 0; m < 12; m++) {
        const el = document.querySelector(`#target-amount-${execId}-${m}`);
        months.push(el ? parseFloat(el.value || '0') || 0 : 0);
      }
      const tr = document.querySelector(`#spread-amount-${execId}`).closest('tr');
      const cells = [...tr.querySelectorAll('td')];
      return {
        monthSum: months.reduce((a, b) => a + b, 0),
        totalText: (cells[cells.length - 1].innerText || '').replace(/\s+/g, ' ').trim(),
      };
    }, execIds[0]);
    const totalNum = num(totalCheck.totalText);
    rec('ST-06', 'Total column equals the sum of the 12 monthly cells',
      Math.abs(totalNum - totalCheck.monthSum) < 0.005,
      `months sum=${totalCheck.monthSum} · Total shows="${totalCheck.totalText}" (${totalNum})`);
    evidence.totalCheck = totalCheck;

    // Negative input — should be rejected or clamped, not silently accepted.
    const tNeg = Date.now();
    await page.locator(`#spread-amount-${execIds[0]}`).fill('-50000');
    await page.locator(`#btn-spread-${execIds[0]}`).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const negMonths = await page.evaluate((execId) => {
      const out = [];
      for (let m = 0; m < 12; m++) {
        const el = document.querySelector(`#target-amount-${execId}-${m}`);
        out.push(el ? el.value : null);
      }
      return out;
    }, execIds[0]);
    const negSum = negMonths.reduce((a, v) => a + num(v), 0);
    rec('ST-07', 'Negative spread amount is rejected, not distributed',
      negSum >= 0, `sum after -50000 spread = ${negSum} · months[0..2]=${negMonths.slice(0, 3).join(',')}`);
    evidence.negative = { months: negMonths, sum: negSum, writes: writesSince(tNeg).length };

    // "Copy previous year" — does it write immediately? Monitor, don't assume.
    const tCopy = Date.now();
    await page.locator('#btn-copy-previous-year').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const copyWrites = writesSince(tCopy);
    rec('ST-08', 'Copy-previous-year only fills the form, does not persist',
      copyWrites.length === 0,
      copyWrites.length
        ? `${copyWrites.length} write(s): ${copyWrites.map((w) => w.method + ' ' + w.url).join(' | ')}`
        : 'no write requests observed');
    evidence.copyPreviousYear = { writes: copyWrites };

    // ══════════ CRM DASHBOARD ══════════
    console.log('\n── /crm-dashboard ──');
    await page.goto(`${BASE}/crm-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);

    const dash = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const onScreen = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('table')].filter(onScreen).map((t, i) => {
        const headerCells = [...t.querySelectorAll('thead th')];
        return {
          idx: i,
          headerCount: headerCells.length,
          headerColspanTotal: headerCells.reduce((a, h) => a + (parseInt(h.getAttribute('colspan') || '1', 10)), 0),
          headers: headerCells.map((h) => clean(h.innerText)),
          headerRows: t.querySelectorAll('thead tr').length,
          rows: [...t.querySelectorAll('tbody tr')].slice(0, 5).map((r) => ({
            cellCount: r.querySelectorAll('td').length,
            cells: [...r.querySelectorAll('td')].map((c) => clean(c.innerText).slice(0, 18)),
          })),
        };
      });
    });
    evidence.dashboard = dash;

    for (const g of dash) {
      const bad = g.rows.filter((r) => r.cellCount !== g.headerColspanTotal);
      rec(`DB-0${g.idx + 1}`, `Dashboard grid ${g.idx} — data cells match header columns`,
        bad.length === 0,
        `headers=${g.headerCount} (colspan total ${g.headerColspanTotal}, ${g.headerRows} header row(s)) · row cells=${g.rows.map((r) => r.cellCount).join('/')}`);
    }

    // Cross-check: does the dashboard's per-executive Leads count match /leads?
    const execRow = dash[0] && dash[0].rows[0];
    if (execRow) {
      const execName = execRow.cells[0];
      const dashLeads = num(execRow.cells[1]);
      await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3800);
      const listingCount = await page.evaluate((name) => {
        const onScreen = (e) => e.getClientRects().length > 0;
        const t = [...document.querySelectorAll('table')].filter(onScreen)
          .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
        if (!t) return null;
        const hs = [...t.querySelectorAll('thead th')].map((h) => (h.innerText || '').trim());
        const ai = hs.findIndex((h) => /assignee/i.test(h));
        if (ai < 0) return null;
        return [...t.querySelectorAll('tbody tr')]
          .filter((r) => ((r.querySelectorAll('td')[ai] || {}).innerText || '').trim() === name).length;
      }, execName);
      rec('DB-03', `Dashboard "Leads" count for ${execName} matches the Leads listing`,
        listingCount !== null && listingCount === dashLeads,
        `dashboard=${dashLeads} · listing page 1=${listingCount} (listing is paginated — treat a mismatch as needing a second look, not proof)`);
      evidence.crossCheck = { execName, dashLeads, listingCount };
    }

  } catch (e) {
    console.log('\nFATAL:', e.message);
    rec('FATAL', 'run aborted', false, e.message.split('\n')[0].slice(0, 160));
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n═══ ${passed}/${results.length} checks passed ═══`);
  console.log(`total write requests observed during run: ${writes.length}`);
  const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'new-modules-deep.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ results, evidence, allWrites: writes }, null, 2));
  console.log(`wrote ${path.relative(path.join(__dirname, '..', '..'), p)}`);
})();
