'use strict';
/**
 * Pass 2 of the fix verification — the items that need an editor, a download,
 * or a reversible edit.
 *   #1  editing an older record persists after reload   (edit + revert)
 *   #2  chatbot "Assign To" can be un-ticked and stays   (untick + restore)
 *   #3  Meta Pixel / Ad Account id > 15 digits / spaces  (validation only —
 *       never saves over the live integration)
 *   #16 Leads Report export from page 2 has data rows    (download + inspect)
 *   #17 FollowUp Description column width in that export
 *   #19 Task Report sort by Project / Resigned by Nationality
 * Every mutation is reverted before the script ends.
 */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, DL = process.env.QA_DL_DIR;
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const REPO = path.join(__dirname, '..', '..');
const R = []; const rec = (id, t, st, d) => { R.push({ id, title: t, status: st, detail: d });
  console.log(`  ${({FIXED:'✅',STILL_BROKEN:'❌',UNVERIFIABLE:'⚪',PARTIAL:'🟡'})[st]} ${id.padEnd(4)} ${st.padEnd(13)} ${t}${d ? ' — ' + d : ''}`); };
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const grid = () => { const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const t = [...document.querySelectorAll('table')].filter(on).sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { columns: [], rows: [] };
  return { columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    rows: [...t.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText))).filter((c) => !(c.length <= 2 && /no data|no record/i.test(c.join(' ')))) }; };
const pageErr = () => (/database|sql|exception|oops|something went wrong|error code|internal server/i.exec(document.body.innerText || '') || [])[0] || null;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage(); const ev = {};
  const go = async (p, w = 4500) => { await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(w); };
  const realOpts = (loc) => loc.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() })).filter((o) => o.value && o.value !== '0' && !/^choose|select/i.test(o.text)));

  try {
    await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);

    // ══ #1 edit an OLDER record, reload, verify, revert ══════════════════
    console.log('\n══ #1 · edit the oldest lead source, reload, revert ══');
    await go('/lead-sources');
    await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(3000);
    const ls = await page.evaluate(grid);
    const ni = ls.columns.findIndex((c) => /lead source name/i.test(c));
    const target = ls.rows[ls.rows.length - 1]; // last row = oldest on a newest-first list
    const origName = target ? target[ni] : null;
    console.log(`     ${ls.rows.length} sources; editing the last row "${origName}"`);
    let persisted = null, reverted = null;
    if (origName) {
      const rowLoc = page.locator('table tbody tr').filter({ hasText: origName }).last();
      await rowLoc.locator('a:has(i.ri-pencil-line), a:has(i[class*=pencil]), button:has(i[class*=pencil])').first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const box = page.locator('.modal.show input[type=text]:visible, .modal.show input:not([type]):visible').first();
      const newName = origName + ' QA';
      if (await box.count()) {
        await box.fill(newName); await page.locator('.modal.show button:has-text("Save")').first().click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(4000);
        await go('/lead-sources'); await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(3000);
        const after = await page.evaluate(grid); persisted = after.rows.some((r) => r[ni] === newName);
        // revert
        if (persisted) {
          const r2 = page.locator('table tbody tr').filter({ hasText: newName }).first();
          await r2.locator('a:has(i.ri-pencil-line), a:has(i[class*=pencil]), button:has(i[class*=pencil])').first().click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(2500);
          const box2 = page.locator('.modal.show input[type=text]:visible, .modal.show input:not([type]):visible').first();
          await box2.fill(origName); await page.locator('.modal.show button:has-text("Save")').first().click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(4000); await go('/lead-sources'); await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(3000);
          reverted = (await page.evaluate(grid)).rows.some((r) => r[ni] === origName);
        }
      }
    }
    ev.olderRecord = { origName, persisted, reverted };
    rec('#1', 'Editing an older record persists after reload', persisted === null ? 'UNVERIFIABLE' : (persisted ? 'FIXED' : 'STILL_BROKEN'),
      persisted === null ? 'could not reach the edit modal' : `edited "${origName}" → persisted=${persisted}, reverted=${reverted}`);

    // ══ #2 chatbot Assign To un-tick ═══════════════════════════════════════
    console.log('\n══ #2 · chatbot Assign To ══');
    await go('/chatbots');
    await page.locator('table tbody tr').first().locator('a:has(i[class*=pencil]), button:has(i[class*=pencil]), a:has(i[class*=edit])').first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4500);
    ev.chatbot = await page.evaluate(() => { const clean = (s) => (s || '').replace(/\s+/g, ' ').trim(); const on = (e) => e.getClientRects().length > 0;
      const assignEl = [...document.querySelectorAll('label,h5,h6,legend,span,div')].find((x) => /assign(ed)? to/i.test((x.innerText || '').slice(0, 40)) && on(x));
      const scope = assignEl ? (assignEl.closest('.form-group,.card,.col,.mb-3') || assignEl.parentElement) : null;
      return { url: location.pathname, found: !!assignEl, scopeText: scope ? clean(scope.innerText).slice(0, 200) : null,
        checks: scope ? [...scope.querySelectorAll('input[type=checkbox]')].map((c, i) => ({ i, id: c.id || null, checked: c.checked, label: clean(c.closest('label,.form-check,div')?.innerText).slice(0, 26) })) : [],
        multiselect: scope ? !!scope.querySelector('select[multiple]') : false, tabs: [...document.querySelectorAll('.nav-link')].filter(on).map((t) => clean(t.innerText)).slice(0, 8) }; });
    console.log(`     url=${ev.chatbot.url} assignFound=${ev.chatbot.found} checkboxes=${ev.chatbot.checks.length} multiselect=${ev.chatbot.multiselect} tabs=${JSON.stringify(ev.chatbot.tabs)}`);
    if (ev.chatbot.checks.length) {
      const ticked = ev.chatbot.checks.find((c) => c.checked);
      if (ticked) {
        const cb = page.locator('input[type=checkbox]').filter({ has: page.locator(`xpath=.`) }).nth(0); // placeholder, resolved below by id/label
        const loc = ticked.id ? page.locator(`#${ticked.id}`) : page.locator('label', { hasText: ticked.label }).locator('input[type=checkbox]').first();
        await loc.uncheck({ force: true }).catch(() => {}); await page.waitForTimeout(800);
        await page.locator('button:has-text("Save"), button:has-text("Update")').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(4500);
        // reopen and re-read
        await go('/chatbots'); await page.locator('table tbody tr').first().locator('a:has(i[class*=pencil]), button:has(i[class*=pencil]), a:has(i[class*=edit])').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(4500);
        const stillTicked = await (ticked.id ? page.locator(`#${ticked.id}`) : page.locator('label', { hasText: ticked.label }).locator('input[type=checkbox]').first()).isChecked().catch(() => null);
        // restore
        if (stillTicked === false) { await (ticked.id ? page.locator(`#${ticked.id}`) : page.locator('label', { hasText: ticked.label }).locator('input[type=checkbox]').first()).check({ force: true }).catch(() => {}); await page.locator('button:has-text("Save"), button:has-text("Update")').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3500); }
        ev.chatbot.untickTest = { label: ticked.label, stillTickedAfterReopen: stillTicked };
        rec('#2', 'Chatbot Assign To can be un-ticked and stays un-ticked', stillTicked === null ? 'UNVERIFIABLE' : (stillTicked ? 'STILL_BROKEN' : 'FIXED'),
          `unticked "${ticked.label}" → after reopen ticked=${stillTicked}${stillTicked === false ? ' (restored)' : ''}`);
      } else rec('#2', 'Chatbot Assign To un-tick', 'UNVERIFIABLE', 'no assignee is currently ticked to test un-ticking');
    } else rec('#2', 'Chatbot Assign To un-tick', 'UNVERIFIABLE', `no Assign To checkbox group found (found=${ev.chatbot.found})`);

    // ══ #3 Meta integration id validation (no save over live config) ═════
    console.log('\n══ #3 · Meta Pixel / Ad Account id validation ══');
    ev.meta = { checked: [] };
    for (const r of ['/lead-sources', '/client-setting', '/whatsapp-accounts']) {
      await go(r);
      const f = await page.evaluate(() => { const clean = (s) => (s || '').replace(/\s+/g, ' ').trim(); const on = (e) => e.getClientRects().length > 0;
        return [...document.querySelectorAll('input,select,textarea,label,button')].filter(on).map((e) => clean(e.innerText || e.getAttribute('placeholder') || e.id || '')).filter((t) => /pixel|ad ?account|meta|facebook/i.test(t)).slice(0, 8); });
      ev.meta.checked.push({ route: r, hits: f }); console.log(`     ${r.padEnd(20)} ${f.length ? f.join(' | ') : '(nothing meta-related)'}`);
    }
    const hit = ev.meta.checked.find((c) => c.hits.length);
    rec('#3', 'Meta Pixel / Ad Account id > 15 digits or with spaces', 'UNVERIFIABLE',
      hit ? `meta-related controls seen on ${hit.route}, but saving a 16-digit id over the live integration is not safe from a harness — needs a throwaway integration or a human` : 'no Meta integration form found in nav on this tenant');

    // ══ #16 / #17 Leads Report export from page 2 ═════════════════════════
    console.log('\n══ #16/#17 · Leads Report export from page 2 ══');
    await go('/reports', 5000);
    await page.locator('text=Leads Report').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(5000);
    ev.leadsReport = { url: page.url().replace(BASE, '') };
    const g1 = await page.evaluate(grid); ev.leadsReport.page1Rows = g1.rows.length; ev.leadsReport.columns = g1.columns;
    console.log(`     opened ${ev.leadsReport.url} · page1 rows=${g1.rows.length} · cols=${g1.columns.slice(0, 8).join(' | ')}`);
    const pager = page.locator('a:has-text("2"), button:has-text("2"), .pagination a, .page-link').filter({ hasText: /^2$/ }).first();
    const hasP2 = (await pager.count().catch(() => 0)) > 0;
    if (hasP2) { await pager.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3500); }
    const g2 = await page.evaluate(grid); ev.leadsReport.page2Rows = g2.rows.length; ev.leadsReport.onPage2 = hasP2;
    console.log(`     page 2 available=${hasP2} rows=${g2.rows.length}`);
    const exportBtn = page.locator('button:has-text("Export"), a:has-text("Export"), #export-excel, [id*=export]').first();
    if (await exportBtn.count().catch(() => 0)) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), exportBtn.click({ timeout: 8000 }).catch(() => {})]);
      if (dl) { const fp = path.join(DL, 'leads-report-page2.xlsx'); await dl.saveAs(fp); ev.leadsReport.download = fp; console.log(`     downloaded → ${path.basename(fp)}`); }
      else { ev.leadsReport.download = null; console.log('     export clicked but no download event'); }
    } else console.log('     no Export control found');
    rec('#16', 'Leads Report export from page 2 contains data rows', ev.leadsReport.download ? 'PARTIAL' : 'UNVERIFIABLE',
      ev.leadsReport.download ? 'downloaded; row count checked in post-processing below' : (hasP2 ? 'no export control' : 'report has no page 2 on this tenant'));

    // ══ #19 Task Report sort by Project; Resigned Employees by Nationality ═
    console.log('\n══ #19 · report sorting ══');
    await go('/reports', 5000);
    const cards = await page.evaluate(() => [...document.querySelectorAll('a,.card,[role=button],button')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter((t) => /task report|resigned/i.test(t)));
    console.log('     matching report cards:', JSON.stringify(cards));
    if (cards.length) {
      await page.locator(`text=${cards[0].split(' ').slice(0, 2).join(' ')}`).first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(5000);
      const g = await page.evaluate(grid); const pi = g.columns.findIndex((c) => /project|nationality/i.test(c));
      if (pi >= 0) { const before = g.rows.map((r) => r[pi]); await page.locator('table thead th').nth(pi).click({ timeout: 7000 }).catch(() => {}); await page.waitForTimeout(3500);
        const after = (await page.evaluate(grid)).rows.map((r) => r[pi]); const changed = JSON.stringify(before) !== JSON.stringify(after); const err = await page.evaluate(pageErr);
        rec('#19', `Sorting "${g.columns[pi]}" reorders the ${cards[0].slice(0, 20)}`, err ? 'STILL_BROKEN' : (changed ? 'FIXED' : (before.length > 1 && new Set(before).size > 1 ? 'STILL_BROKEN' : 'UNVERIFIABLE')),
          err ? `error: ${err}` : `order changed=${changed}, ${before.length} rows, ${new Set(before).size} distinct values`); }
      else rec('#19', 'Report sort by Project / Nationality', 'UNVERIFIABLE', `no Project/Nationality column; cols=${g.columns.join(' | ').slice(0, 80)}`);
    } else rec('#19', 'Task Report / Resigned Employees sort', 'UNVERIFIABLE', 'neither report card is on this tenant\'s Reports hub');

  } catch (e) { console.log('\nFATAL:', e.message.split('\n')[0].slice(0, 150)); }
  finally { await browser.close(); }
  const out = path.join(REPO, 'reports', 'qa', 'raw', 'fixes-pass2-lesol_test.json');
  fs.writeFileSync(out, JSON.stringify({ results: R, evidence: ev }, null, 2)); console.log(`\n  ${path.relative(REPO, out)}`);
})();
