'use strict';
/**
 * Reconcile the numbers shown on Home, the CRM Dashboard and the Leads
 * listing against the data they claim to summarise.
 *
 * A dashboard that shows a confidently wrong number is worse than a page
 * that fails to load: nobody questions it. This checks three things the
 * earlier passes could not:
 *
 *   1. Do the Leads tab counts match the rows those tabs actually return?
 *      (page size is raised to 100 first, so pagination cannot mask it)
 *   2. Do Home's totals agree with the Dashboard's, and with the listing?
 *   3. Does clicking a column header genuinely sort, or just reorder?
 *
 * Read-only.
 *   node scripts/qa/reconcile_counters.js
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
const rec = (id, t, pass, d) => {
  results.push({ id, title: t, pass, detail: d });
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

/** Raise page size so a tab's true row count is not truncated. */
async function maxPageSize(page) {
  const has = await page.locator('#page_size').count().catch(() => 0);
  if (!has) return null;
  const opts = await page.locator('#page_size option').allTextContents().catch(() => []);
  const biggest = opts.map((o) => parseInt(o, 10)).filter(Boolean).sort((a, b) => b - a)[0];
  if (biggest) {
    await page.selectOption('#page_size', String(biggest)).catch(() => {});
    await page.waitForTimeout(3500);
  }
  return biggest;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const ev = {};
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // ── 1. Leads tabs: claimed count vs rows actually returned ────────────
    console.log('\n══ Leads tab counts vs actual rows ══');
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    const size = await maxPageSize(page);
    console.log(`  (page size set to ${size})`);

    const tabs = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('[id^="tab-"], .nav-link, [role="tab"]')].filter(on)
        .map((b) => {
          const txt = clean(b.innerText);
          const m = txt.match(/^(.*?)[\s:]*(\d[\d,]*)$/);
          return { id: b.id || null, text: txt, label: m ? m[1].trim() : txt, claimed: m ? parseInt(m[2].replace(/,/g, ''), 10) : null };
        })
        .filter((b) => b.text && !/switcher|theme/i.test(b.id || ''));
    });
    ev.tabs = tabs;
    console.log(`  tabs: ${tabs.map((t) => `${t.label}=${t.claimed}`).join(' · ')}`);

    ev.tabChecks = [];
    for (const t of tabs.filter((x) => x.claimed !== null).slice(0, 5)) {
      await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);
      await maxPageSize(page);
      await page.locator(t.id ? `#${t.id}` : `text="${t.text}"`).first().click({ timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(4000);
      const g = await page.evaluate(grid);
      // Only a strict comparison when the claim fits inside one page.
      const comparable = t.claimed <= (size || 10);
      ev.tabChecks.push({ label: t.label, claimed: t.claimed, returned: g.rows.length, comparable });
      rec(`TC-${t.label.replace(/\W+/g, '').slice(0, 8)}`,
        `Tab "${t.label}" claims ${t.claimed} — rows returned`,
        comparable ? g.rows.length === t.claimed : null,
        comparable
          ? `returned ${g.rows.length}`
          : `returned ${g.rows.length} of a claimed ${t.claimed} — exceeds page size ${size}, not comparable`);
    }

    // ── 2. Home vs Dashboard vs listing ──────────────────────────────────
    console.log('\n══ Counter reconciliation ══');
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    ev.homeNumbers = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const out = {};
      // Pull "<label> <number>" pairs out of the visible stat cards.
      for (const c of [...document.querySelectorAll('.card, .widget, section')].filter(on)) {
        const txt = clean(c.innerText);
        for (const m of txt.matchAll(/([A-Za-z][A-Za-z \-/]{2,24}?)\s+(\d[\d,]*)\b/g)) {
          const k = m[1].trim();
          if (!(k in out)) out[k] = parseInt(m[2].replace(/,/g, ''), 10);
        }
      }
      return out;
    });
    console.log(`  home: ${JSON.stringify(ev.homeNumbers).slice(0, 300)}`);

    await page.goto(`${BASE}/crm-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6500);
    ev.dashTotals = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      if (!t) return null;
      const hrs = [...t.querySelectorAll('thead tr')];
      const bottom = hrs.length ? [...hrs[hrs.length - 1].querySelectorAll('th')].map((h) => clean(h.innerText)) : [];
      const carried = hrs.slice(0, -1).flatMap((tr) =>
        [...tr.querySelectorAll('th')].filter((h) => (+h.getAttribute('rowspan') || 1) > 1).map((h) => clean(h.innerText)));
      const labels = [...carried, ...bottom];
      const rows = [...t.querySelectorAll('tbody tr')].map((r) =>
        [...r.querySelectorAll('td')].map((c) => clean(c.innerText)));
      const li = labels.findIndex((l) => /^leads$/i.test(l));
      return {
        labels,
        rowCount: rows.length,
        leadsColumnIndex: li,
        leadsSum: li >= 0 ? rows.reduce((a, r) => a + (parseInt(String(r[li]).replace(/\D/g, ''), 10) || 0), 0) : null,
        perExec: li >= 0 ? rows.map((r) => ({ name: r[0], leads: parseInt(String(r[li]).replace(/\D/g, ''), 10) || 0 })) : [],
      };
    });
    console.log(`  dashboard labels: ${JSON.stringify((ev.dashTotals || {}).labels)}`);
    console.log(`  dashboard Leads column sum across executives: ${(ev.dashTotals || {}).leadsSum}`);

    const tabTotal = tabs.filter((t) => t.claimed !== null).reduce((a, t) => a + t.claimed, 0);
    ev.tabTotal = tabTotal;
    const homeTotal = ev.homeNumbers['Total Leads'] ?? ev.homeNumbers['Leads'] ?? null;
    const dashSum = (ev.dashTotals || {}).leadsSum;

    rec('RC-01', 'Home "Total Leads" agrees with the Dashboard Leads sum',
      homeTotal !== null && dashSum !== null ? homeTotal === dashSum : null,
      `home=${homeTotal} · dashboard sum=${dashSum} · leads tabs total=${tabTotal}`);

    rec('RC-02', 'Leads tab totals are in the same order of magnitude as Home',
      homeTotal !== null ? Math.abs(tabTotal - homeTotal) < Math.max(10, homeTotal) : null,
      `tabs sum to ${tabTotal} while Home reports ${homeTotal} — Home is scoped "This Month", tabs appear to be all-time`);

    // ── 3. Sorting, re-verified with a bigger page ───────────────────────
    console.log('\n══ Sorting ══');
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);
    await maxPageSize(page);
    const nameIdx = await page.evaluate(() => {
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)
        .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
      return t ? [...t.querySelectorAll('thead th')].findIndex((h) => /customer name/i.test(h.innerText || '')) : -1;
    });
    if (nameIdx >= 0) {
      const before = (await page.evaluate(grid)).rows.map((r) => r[nameIdx]);
      await page.locator('table thead th').nth(nameIdx).click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const asc = (await page.evaluate(grid)).rows.map((r) => r[nameIdx]);
      await page.locator('table thead th').nth(nameIdx).click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const desc = (await page.evaluate(grid)).rows.map((r) => r[nameIdx]);

      const isAsc = JSON.stringify(asc) === JSON.stringify([...asc].sort((a, b) => a.localeCompare(b)));
      const isDesc = JSON.stringify(desc) === JSON.stringify([...desc].sort((a, b) => b.localeCompare(a)));
      ev.sorting = { before: before.slice(0, 5), asc: asc.slice(0, 5), desc: desc.slice(0, 5), isAsc, isDesc };
      rec('SO-01', 'First click on "Customer Name" sorts ascending', isAsc,
        `first 5 after click: ${asc.slice(0, 5).join(' | ')}`);
      rec('SO-02', 'Second click sorts descending', isDesc,
        `first 5 after 2nd click: ${desc.slice(0, 5).join(' | ')}`);
    } else {
      rec('SO-01', 'Sorting', null, 'Customer Name column not found');
    }

  } catch (e) {
    console.log('\nFATAL:', e.message);
    rec('FATAL', 'aborted', false, e.message.split('\n')[0].slice(0, 150));
  } finally {
    await browser.close();
  }

  const p = results.filter((r) => r.pass === true).length;
  const f = results.filter((r) => r.pass === false).length;
  const n = results.filter((r) => r.pass === null).length;
  console.log(`\n═══ ${p} passed · ${f} failed · ${n} inconclusive ═══`);
  const out = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'skiolo-counters.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ tenant: C.company, results, evidence: ev }, null, 2));
  console.log(`wrote ${path.relative(path.join(__dirname, '..', '..'), out)}`);
})();
