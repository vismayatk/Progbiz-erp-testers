'use strict';
/**
 * Deep test of the remaining uncovered CRM modules.
 *
 * Targets the failure modes structural probes cannot see: a date range that
 * accepts From later than To, a bulk-assignment form that submits empty, a
 * search box that ignores its input. These are cheap to check and expensive
 * to ship.
 *
 * SAFETY: fills and filters only. Never submits a create/save form. Write
 * requests are monitored around each action so an unexpected persist is
 * caught rather than assumed away.
 *
 *   node scripts/qa/deep_test_remaining_modules.js
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
const inconclusive = (id, title, detail) => {
  results.push({ id, title, pass: null, detail });
  console.log(`  ⚪ ${id} ${title} — INCONCLUSIVE: ${detail}`);
};

const gridState = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const onScreen = (e) => e.getClientRects().length > 0;
  const t = [...document.querySelectorAll('table')].filter(onScreen)
    .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { headers: [], rows: [] };
  return {
    headers: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    rows: [...t.querySelectorAll('tbody tr')]
      .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText)))
      .filter((cells) => !(cells.length === 1 && /no data|no lead source|no record/i.test(cells[0]))),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const writes = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) {
      // This app fetches with POST, so only flag endpoints that look mutating.
      if (/save|create|add|update|delete|insert|submit/i.test(r.url())) {
        writes.push({ method: r.method(), url: r.url().split('?')[0].slice(-70), at: Date.now() });
      }
    }
  });
  const since = (t) => writes.filter((w) => w.at > t);
  const evidence = {};

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // ══════════ /lead-expenses — date range sanity ══════════
    console.log('\n── /lead-expenses ──');
    await page.goto(`${BASE}/lead-expenses`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4200);
    const base = await page.evaluate(gridState);
    rec('LE-01', 'Lead Expenses page renders its grid', base.headers.length > 0,
      `${base.headers.length} columns, ${base.rows.length} data row(s)`);

    // From deliberately AFTER To — an impossible range.
    const t0 = Date.now();
    const setRange = await page.evaluate(() => {
      const f = document.querySelector('#expense-filter-from');
      const t = document.querySelector('#expense-filter-to');
      if (!f || !t) return { ok: false };
      f.value = '2026-12-31'; f.dispatchEvent(new Event('change', { bubbles: true }));
      t.value = '2026-01-01'; t.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, from: f.value, to: t.value };
    });
    await page.locator('#btn-search-expenses').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const after = await page.evaluate(gridState);
    const warned = await page.evaluate(() =>
      /invalid|from date|greater than|must be|before/i.test(document.body.innerText));
    if (!setRange.ok) {
      inconclusive('LE-02', 'Impossible date range (From after To)', 'date inputs not found by id');
    } else {
      rec('LE-02', 'Impossible date range (From 31-Dec after To 01-Jan) is rejected or returns nothing',
        warned || after.rows.length === 0,
        `rows returned=${after.rows.length} · validation message shown=${warned}`);
    }
    evidence.leadExpenses = { base: base.rows.length, afterBadRange: after.rows.length, warned, setRange, writes: since(t0).length };

    // ══════════ /call-analysis — search filter ══════════
    console.log('\n── /call-analysis ──');
    await page.goto(`${BASE}/call-analysis`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4200);
    const caBefore = await page.evaluate(gridState);
    await page.evaluate(() => {
      const b = document.querySelector('#ca-search-input');
      if (b) {
        b.value = 'ZZZZ_NO_SUCH_RECORD_ZZZZ';
        b.dispatchEvent(new Event('input', { bubbles: true }));
        b.dispatchEvent(new Event('change', { bubbles: true }));
        b.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      }
    });
    await page.waitForTimeout(3500);
    const caAfter = await page.evaluate(gridState);
    if (caBefore.rows.length === 0) {
      inconclusive('CA-01', 'Search filters the call list',
        `grid is empty on this tenant (${caBefore.rows.length} rows) — nothing to filter, cannot judge`);
    } else {
      rec('CA-01', 'Searching a nonsense term returns no rows',
        caAfter.rows.length === 0,
        `before=${caBefore.rows.length} after=${caAfter.rows.length}`);
    }
    evidence.callAnalysis = { before: caBefore.rows.length, after: caAfter.rows.length, headers: caBefore.headers };

    // ══════════ /add-multiple-lead-tasks — empty submit ══════════
    console.log('\n── /add-multiple-lead-tasks ──');
    await page.goto(`${BASE}/add-multiple-lead-tasks`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);
    const amtControls = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const onScreen = (e) => e.getClientRects().length > 0;
      return {
        buttons: [...document.querySelectorAll('button,a.btn')].filter(onScreen)
          .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 28) })).filter((b) => b.id || b.text),
        fields: [...document.querySelectorAll('input,select,textarea')].filter(onScreen)
          .filter((e) => e.type !== 'hidden')
          .map((e) => ({ id: e.id || null, tag: e.tagName.toLowerCase(), required: e.required })),
      };
    });
    evidence.addMultipleLeadTasks = amtControls;
    const submitBtn = amtControls.buttons.find((b) => /assign|save|submit|add/i.test(b.text || ''));
    if (!submitBtn) {
      inconclusive('AM-01', 'Empty bulk-assignment submit is validated',
        `no submit-looking button found (buttons: ${amtControls.buttons.map((b) => b.text || b.id).join(', ')})`);
    } else {
      const t1 = Date.now();
      await page.locator(submitBtn.id ? `#${submitBtn.id}` : `button:has-text("${submitBtn.text}")`)
        .first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const state = await page.evaluate(() => ({
        validation: /required|select at least|please select|mandatory|choose/i.test(document.body.innerText),
        error: /oops|went wrong|error code|exception/i.test(document.body.innerText),
        invalidMarked: document.querySelectorAll('.is-invalid, .invalid-feedback').length,
      }));
      const w = since(t1);
      rec('AM-01', 'Empty bulk-assignment submit is validated, not sent',
        (state.validation || state.invalidMarked > 0) && w.length === 0,
        `validation=${state.validation} invalidFields=${state.invalidMarked} serverError=${state.error} writes=${w.length}`);
      evidence.addMultipleLeadTasks.emptySubmit = { ...state, writes: w };
    }

    // ══════════ /solar-orders ══════════
    console.log('\n── /solar-orders ──');
    await page.goto(`${BASE}/solar-orders`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const solar = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const g = gridStateInline();
      function gridStateInline() {
        const onScreen = (e) => e.getClientRects().length > 0;
        const t = [...document.querySelectorAll('table')].filter(onScreen)[0];
        return t ? {
          headers: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
          rowCount: t.querySelectorAll('tbody tr').length,
          firstRowText: clean(t.querySelector('tbody tr')?.innerText).slice(0, 60),
        } : null;
      }
      return { grid: g, bodyHasEmptyState: /no data|no record|nothing/i.test(document.body.innerText) };
    });
    rec('SO-01', 'Solar Orders shows an empty-state message rather than a blank grid',
      solar.bodyHasEmptyState || (solar.grid && solar.grid.rowCount > 0),
      solar.grid ? `${solar.grid.rowCount} row(s), first="${solar.grid.firstRowText}"` : 'no grid found');
    evidence.solarOrders = solar;

  } catch (e) {
    console.log('\nFATAL:', e.message);
    rec('FATAL', 'run aborted', false, e.message.split('\n')[0].slice(0, 160));
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.pass === true).length;
  const failed = results.filter((r) => r.pass === false).length;
  const incon = results.filter((r) => r.pass === null).length;
  console.log(`\n═══ ${passed} passed · ${failed} failed · ${incon} inconclusive ═══`);
  console.log(`mutating write requests observed: ${writes.length}`);
  const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'remaining-modules-deep.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ results, evidence, writes }, null, 2));
  console.log(`wrote ${path.relative(path.join(__dirname, '..', '..'), p)}`);
})();
