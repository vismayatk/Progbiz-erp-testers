'use strict';
/** Pass 3 — the items pass 2 could not reach:
 *  #2  chatbot Assign To widget (inspect, untick, save, reopen, restore)
 *  #16/#17 Leads Report: apply a wide date filter FIRST, then page 2 → export
 *  #20b DAR serials after a wide date filter
 *  #3  open real edit forms (lead source, WhatsApp account, New Account) and
 *      look for Pixel / Ad Account fields — read only, nothing saved */
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, DL = process.env.QA_DL_DIR;
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const REPO = path.join(__dirname, '..', '..');
const R = []; const rec = (id, t, st, d) => { R.push({ id, title: t, status: st, detail: d });
  console.log(`  ${({FIXED:'✅',STILL_BROKEN:'❌',UNVERIFIABLE:'⚪',PARTIAL:'🟡'})[st]} ${id.padEnd(4)} ${st.padEnd(13)} ${t}${d ? ' — ' + d : ''}`); };
const grid = () => { const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const t = [...document.querySelectorAll('table')].filter(on).sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { columns: [], rows: [] };
  return { columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    rows: [...t.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText))).filter((c) => !(c.length <= 2 && /no data|no record/i.test(c.join(' ')))) }; };
/** Fill every visible date input: from = 2024-01-01, to = today; then Apply. */
const applyWideDates = async (page) => {
  const n = await page.evaluate(() => { const on = (e) => e.getClientRects().length > 0; const ds = [...document.querySelectorAll('input[type=date],input[type=datetime-local]')].filter(on);
    const today = new Date().toISOString().slice(0, 10); ds.forEach((d, i) => { d.value = (i === 0 ? '2024-01-01' : today) + (d.type === 'datetime-local' ? 'T00:00' : ''); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })); }); return ds.length; });
  // Blazor: also drive through native fill for the first two, which raise the bound events.
  const ds = page.locator('input[type=date]:visible'); const cnt = await ds.count().catch(() => 0);
  if (cnt >= 1) await ds.nth(0).fill('2024-01-01').catch(() => {});
  if (cnt >= 2) await ds.nth(1).fill(new Date().toISOString().slice(0, 10)).catch(() => {});
  await page.locator('button:has-text("Apply"), button:has-text("Search"), button:has-text("Generate")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(5000); return n; };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage(); const ev = {};
  const go = async (p, w = 4500) => { await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(w); };
  try {
    await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);

    // ══ #2 chatbot Assign To — what IS the widget? ═════════════════════════
    console.log('\n══ #2 · /chat-bot/5 Assign To widget ══');
    await go('/chat-bot/5', 5000);
    ev.assign = await page.evaluate(() => { const clean = (s) => (s || '').replace(/\s+/g, ' ').trim(); const on = (e) => e.getClientRects().length > 0;
      const lbl = [...document.querySelectorAll('label,h5,h6,legend,span,div,strong')].filter(on).find((x) => /^assign(ed)?\s*to/i.test(clean(x.innerText).slice(0, 20)));
      if (!lbl) return { found: false };
      let scope = lbl; for (let i = 0; i < 4 && scope && !scope.querySelector('select,input,.badge,.chip,[class*=tag],[class*=select]'); i++) scope = scope.parentElement;
      return { found: true, html: clean(scope.outerHTML).slice(0, 900),
        selects: [...scope.querySelectorAll('select')].map((s) => ({ id: s.id, multiple: s.multiple, selected: [...s.selectedOptions].map((o) => clean(o.text)), options: s.options.length })),
        chips: [...scope.querySelectorAll('.badge,.chip,[class*=tag],[class*=selected-item]')].map((c) => ({ text: clean(c.innerText).slice(0, 24), hasRemove: !!c.querySelector('i,button,svg,[class*=close],[class*=remove]') })),
        inputs: [...scope.querySelectorAll('input')].map((i) => ({ id: i.id, type: i.type, ph: i.getAttribute('placeholder') })) }; });
    console.log(`     found=${ev.assign.found} selects=${JSON.stringify(ev.assign.selects)} chips=${JSON.stringify(ev.assign.chips)} inputs=${JSON.stringify(ev.assign.inputs)}`);
    if (ev.assign.html) console.log('     html:', ev.assign.html.slice(0, 400));
    let result2 = 'UNVERIFIABLE', detail2 = 'widget not identified';
    const sel = ev.assign.selects?.find((s) => s.multiple && s.selected.length);
    const chip = ev.assign.chips?.find((c) => c.hasRemove);
    if (sel) {
      const victim = sel.selected[0];
      await page.locator(`#${sel.id}`).selectOption(sel.selected.slice(1).map((t) => ({ label: t }))).catch(() => {}); // drop the first
      await page.locator('button:has-text("Save"), button:has-text("Update")').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(4500);
      await go('/chat-bot/5', 5000);
      const after = await page.locator(`#${sel.id}`).evaluate((s) => [...s.selectedOptions].map((o) => o.text.trim())).catch(() => null);
      const back = after ? after.includes(victim) : null;
      if (back === false) { await page.locator(`#${sel.id}`).selectOption([...after, victim].map((t) => ({ label: t }))).catch(() => {}); await page.locator('button:has-text("Save"), button:has-text("Update")').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3500); }
      result2 = back === null ? 'UNVERIFIABLE' : (back ? 'STILL_BROKEN' : 'FIXED'); detail2 = `removed "${victim}" via multiselect → reappeared after reopen=${back}${back === false ? ' (restored)' : ''}`;
    } else if (chip) {
      const victim = chip.text;
      await page.locator('.badge,.chip,[class*=tag],[class*=selected-item]').filter({ hasText: victim }).first().locator('i,button,svg,[class*=close],[class*=remove]').first().click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(800); await page.locator('button:has-text("Save"), button:has-text("Update")').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(4500);
      await go('/chat-bot/5', 5000);
      const back = await page.locator('.badge,.chip,[class*=tag],[class*=selected-item]').filter({ hasText: victim }).count().catch(() => null);
      result2 = back === null ? 'UNVERIFIABLE' : (back > 0 ? 'STILL_BROKEN' : 'FIXED'); detail2 = `removed chip "${victim}" → reappeared after reopen=${back > 0}` + (back === 0 ? ' (NOT auto-restored — re-add by hand)' : '');
    }
    rec('#2', 'Chatbot Assign To can be un-ticked and stays un-ticked', result2, detail2);

    // ══ #16/#17 Leads Report with a wide date filter ═══════════════════════
    console.log('\n══ #16/#17 · /lead-reports with filter applied ══');
    await go('/lead-reports', 5000);
    ev.lr = { dateInputs: await applyWideDates(page) };
    let g = await page.evaluate(grid); ev.lr.page1Rows = g.rows.length; ev.lr.columns = g.columns;
    console.log(`     date inputs=${ev.lr.dateInputs} · after Apply rows=${g.rows.length} · cols=${g.columns.slice(0, 7).join(' | ')}`);
    await page.selectOption('#page_size', '10').catch(() => {}); await page.waitForTimeout(2500);
    const p2 = page.locator('.pagination .page-link, .pagination a, a.page-link, button.page-link').filter({ hasText: /^2$/ }).first();
    ev.lr.hasPage2 = (await p2.count().catch(() => 0)) > 0;
    if (ev.lr.hasPage2) { await p2.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3500); g = await page.evaluate(grid); ev.lr.page2Rows = g.rows.length; }
    console.log(`     page2 available=${ev.lr.hasPage2} rows=${ev.lr.page2Rows ?? '-'}`);
    const exp = page.locator('button:has-text("Export"), a:has-text("Export"), [id*=export]').first();
    if (await exp.count().catch(() => 0)) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), exp.click({ timeout: 8000 }).catch(() => {})]);
      if (dl) { const fp = path.join(DL, 'leads-report-page2.xlsx'); await dl.saveAs(fp); ev.lr.download = fp; console.log(`     downloaded → ${path.basename(fp)} (page ${ev.lr.hasPage2 ? 2 : 1})`); }
      else console.log('     export clicked, no download event');
    } else console.log('     no Export control');
    rec('#16', 'Leads Report export from page 2 contains data rows', ev.lr.download ? 'PARTIAL' : 'UNVERIFIABLE',
      ev.lr.download ? `downloaded from page ${ev.lr.hasPage2 ? 2 : 1}; rows counted in post-processing` : (ev.lr.page1Rows ? 'report has data but no export control / no page 2' : 'report still empty after wide date filter'));

    // ══ #20b DAR serials with wide date filter ═════════════════════════════
    console.log('\n══ #20b · DAR serials after wide date filter ══');
    await go('/daily-activity-report'); await applyWideDates(page);
    const dar = await page.evaluate(grid); const ti = dar.columns.findIndex((c) => /^task$/i.test(c));
    const nums = ti >= 0 ? dar.rows.map((r) => { const m = (r[ti] || '').match(/^(\d+)\./); return m ? +m[1] : null; }) : [];
    let ok = true, run = 0; for (const n of nums) { if (n === null) continue; if (n === 1) run = 1; else if (n === run + 1) run = n; else { ok = false; break; } }
    const known = nums.filter((n) => n !== null).length;
    rec('#20b', 'Daily Activity Report serials follow row order', known ? (ok ? 'FIXED' : 'STILL_BROKEN') : 'UNVERIFIABLE', known ? `${dar.rows.length} rows; serials ${nums.slice(0, 16).map((n) => n ?? '·').join(',')}` : `${dar.rows.length} rows but none numbered`);

    // ══ #3 open real edit forms and look for Pixel / Ad Account ═══════════
    console.log('\n══ #3 · edit forms: Pixel / Ad Account fields? ══');
    const scanMeta = () => { const clean = (s) => (s || '').replace(/\s+/g, ' ').trim(); const on = (e) => e.getClientRects().length > 0;
      return [...document.querySelectorAll('input,select,textarea')].filter(on).filter((e) => e.type !== 'hidden')
        .map((e) => ({ id: e.id || null, label: clean(e.closest('.form-group,.col,.mb-3,div')?.querySelector('label')?.innerText).slice(0, 30), ph: e.getAttribute('placeholder') }))
        .filter((f) => /pixel|ad ?account|meta|facebook|catalog|token|app ?id/i.test(`${f.id} ${f.label} ${f.ph}`)); };
    ev.meta = {};
    await go('/lead-sources'); await page.locator('table tbody tr').first().locator('a:has(i[class*=pencil])').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000);
    ev.meta.leadSourceEdit = await page.evaluate(scanMeta); await page.keyboard.press('Escape').catch(() => {});
    await go('/whatsapp-accounts'); await page.locator('button:has-text("Edit"), a:has-text("Edit"), a:has(i[class*=pencil])').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(4000);
    ev.meta.waEdit = { url: page.url().replace(BASE, ''), fields: await page.evaluate(scanMeta) }; await page.keyboard.press('Escape').catch(() => {});
    await go('/whatsapp-accounts'); await page.locator('button:has-text("New Account"), a:has-text("New Account")').first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(4000);
    ev.meta.waNew = { url: page.url().replace(BASE, ''), fields: await page.evaluate(scanMeta) };
    for (const [k, v] of Object.entries(ev.meta)) console.log(`     ${k.padEnd(14)} ${JSON.stringify(v).slice(0, 220)}`);
    const anyMeta = [ev.meta.leadSourceEdit, ev.meta.waEdit.fields, ev.meta.waNew.fields].some((f) => f && f.length);
    rec('#3', 'Meta Pixel / Ad Account id > 15 digits or with spaces', anyMeta ? 'PARTIAL' : 'UNVERIFIABLE',
      anyMeta ? 'field located — saving over the live integration is unsafe from a harness; test on the New Account form by hand' : 'no Pixel / Ad Account field on any lead-source or WhatsApp form here — the Meta integration is not on this tenant');
  } catch (e) { console.log('\nFATAL:', e.message.split('\n')[0].slice(0, 150)); }
  finally { await browser.close(); }
  const out = path.join(REPO, 'reports', 'qa', 'raw', 'fixes-pass3-lesol_test.json');
  fs.writeFileSync(out, JSON.stringify({ results: R, evidence: ev }, null, 2)); console.log(`\n  ${path.relative(REPO, out)}`);
})();
