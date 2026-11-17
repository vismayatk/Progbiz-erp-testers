'use strict';
/**
 * Verify the delivered fixes that can be judged read-only, and probe the
 * three surfaces still needed for the rest (#2, #3, #15-17, #19).
 *
 *   #18  follow-up list sorting no longer throws a database error
 *   #20  serial numbers follow row order in the task list and DAR
 *   #4   leads merely in follow-up are not labelled "Quotation Created"
 *
 * Read-only throughout. Sort headers are clicked (pure UI), records are
 * opened to read them; nothing is saved.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const BASE = process.env.BASE_URL;
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const REPO = path.join(__dirname, '..', '..');
const R = []; const rec = (id, t, st, d) => { R.push({ id, title: t, status: st, detail: d });
  console.log(`  ${({FIXED:'✅',STILL_BROKEN:'❌',UNVERIFIABLE:'⚪',PARTIAL:'🟡'})[st]} ${id.padEnd(4)} ${st.padEnd(13)} ${t}${d ? ' — ' + d : ''}`); };

const grid = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const t = [...document.querySelectorAll('table')].filter(on).sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { columns: [], rows: [] };
  return { columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    rows: [...t.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText)))
      .filter((c) => !(c.length <= 2 && /no data|no record/i.test(c.join(' ')))) };
};
const pageErr = () => { const b = (document.body.innerText || ''); return (/database|sql|exception|oops|something went wrong|error code|internal server/i.exec(b) || [])[0] || null; };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const ev = {};
  const serverErrors = []; page.on('response', (r) => { if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url().slice(-60)}`); });
  const go = async (p, wait = 4500) => { await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(wait); };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);

    // ── #18 follow-up list sorting ──────────────────────────────────────────
    console.log('\n══ #18 · /followups sort by each column ══');
    await go('/followups');
    // Delayed tab has 426 rows — sort against real volume, not one row.
    await page.locator('button:has-text("Delayed"), a:has-text("Delayed")').first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const base = await page.evaluate(grid);
    ev.followupSort = [];
    for (const col of ['Status', 'Followup By', 'Assignee', 'Lead Quality', 'Next Followup Date', 'Last Followup Date']) {
      const idx = base.columns.findIndex((c) => c.toLowerCase() === col.toLowerCase());
      if (idx < 0) { ev.followupSort.push({ col, present: false }); console.log(`     ${col.padEnd(20)} (column not present)`); continue; }
      serverErrors.length = 0;
      await page.locator('table thead th').nth(idx).click({ timeout: 7000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const err = await page.evaluate(pageErr); const g = await page.evaluate(grid);
      const bad = !!err || serverErrors.length > 0 || g.rows.length === 0;
      ev.followupSort.push({ col, present: true, pageError: err, serverErrors: [...serverErrors], rowsAfter: g.rows.length });
      console.log(`     ${col.padEnd(20)} ${bad ? '❌' : '✓'} rows=${g.rows.length}${err ? ' pageErr="' + err + '"' : ''}${serverErrors.length ? ' ' + serverErrors.join(',') : ''}`);
    }
    const sortFail = ev.followupSort.filter((s) => s.present && (s.pageError || s.serverErrors.length || s.rowsAfter === 0));
    rec('#18', 'Sorting the follow-up list no longer errors', sortFail.length ? 'STILL_BROKEN' : 'FIXED',
      sortFail.length ? `failing: ${sortFail.map((s) => s.col).join(', ')}` : `${ev.followupSort.filter((s) => s.present).length} sortable columns clicked, ${base.rows.length} rows, no DB/500 errors`);

    // ── #20 serial numbers follow row order ─────────────────────────────────
    console.log('\n══ #20 · serial numbers in /my-tasks and /daily-activity-report ══');
    await go('/my-tasks');
    await page.locator('button:has-text("Completed"), a:has-text("Completed")').first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const mt = await page.evaluate(grid);
    const si = mt.columns.findIndex((c) => /^sl\.?\s*no$/i.test(c));
    const serials = si >= 0 ? mt.rows.map((r) => parseInt(r[si], 10)) : [];
    const seq = serials.every((n, i) => n === i + 1);
    ev.taskSerials = serials;
    rec('#20a', 'Task list serial numbers follow row order', serials.length ? (seq ? 'FIXED' : 'STILL_BROKEN') : 'UNVERIFIABLE',
      serials.length ? `${serials.slice(0, 12).join(',')}${serials.length > 12 ? '…' : ''}` : 'no SlNo column');

    await go('/daily-activity-report');
    const dar = await page.evaluate(grid);
    const ti = dar.columns.findIndex((c) => /^task$/i.test(c));
    const darSerials = ti >= 0 ? dar.rows.map((r) => { const m = (r[ti] || '').match(/^(\d+)\./); return m ? parseInt(m[1], 10) : null; }) : [];
    const known = darSerials.filter((n) => n !== null);
    // DAR groups by date, so serials restart per group; check each run is 1..n.
    let runsOk = true, run = 0; for (const n of darSerials) { if (n === null) continue; if (n === 1) run = 1; else if (n === run + 1) run = n; else { runsOk = false; break; } }
    ev.darSerials = darSerials;
    rec('#20b', 'Daily Activity Report serials follow row order (per date group)', known.length ? (runsOk ? 'FIXED' : 'STILL_BROKEN') : 'UNVERIFIABLE',
      known.length ? `${darSerials.slice(0, 14).map((n) => n ?? '·').join(',')}` : 'no numbered Task cells');

    // ── #4 "Quotation Created" only when a quotation exists ────────────────
    console.log('\n══ #4 · "Quotation Created" status vs actual quotations ══');
    await go('/followups');
    await page.locator('button:has-text("Delayed"), a:has-text("Delayed")').first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(3500);
    const fu = await page.evaluate(grid);
    const sti = fu.columns.findIndex((c) => /^status$/i.test(c));
    const numi = fu.columns.findIndex((c) => /^number$/i.test(c));
    const dist = {}; fu.rows.forEach((r) => { const s = r[sti] || '?'; dist[s] = (dist[s] || 0) + 1; });
    console.log('     status distribution (Delayed tab, 100/page):', JSON.stringify(dist));
    const qc = fu.rows.filter((r) => /quotation created/i.test(r[sti] || '')).slice(0, 3);
    ev.quotationCreatedSample = [];
    for (const row of qc) {
      const num = row[numi];
      // ENQ-xxx that says "Quotation Created" must have a quotation; QUO-xxx rows are the quotation itself.
      const isEnq = /^ENQ/i.test(num || '');
      ev.quotationCreatedSample.push({ number: num, isEnquiryRow: isEnq });
      console.log(`     "${row[sti]}" on ${num}${isEnq ? '  ← an ENQUIRY row carrying a quotation status' : '  (quotation row, expected)'}`);
    }
    const suspicious = ev.quotationCreatedSample.filter((s) => s.isEnquiryRow);
    rec('#4', 'In-followup leads are not mislabelled "Quotation Created"',
      qc.length === 0 ? 'FIXED' : (suspicious.length ? 'STILL_BROKEN' : 'FIXED'),
      qc.length === 0 ? 'no "Quotation Created" rows among ' + fu.rows.length + ' delayed follow-ups' :
        (suspicious.length ? `${suspicious.length} ENQ row(s) labelled Quotation Created: ${suspicious.map((s) => s.number).join(', ')}` : `${qc.length} "Quotation Created" row(s), all are QUO records — consistent`));

    // ── PROBE: /reports hub (needed for #15 #16 #17 #19) ───────────────────
    console.log('\n══ probe · /reports hub ══');
    await go('/reports', 5500);
    ev.reportsHub = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return { text: clean(document.body.innerText).slice(0, 700),
        clickables: [...document.querySelectorAll('a,button,.card,[role=button],li')].filter(on)
          .map((e) => ({ t: clean(e.innerText).slice(0, 40), h: e.getAttribute('href') })).filter((e) => e.t && /report|lead|task|resign|employee|export/i.test(e.t)).slice(0, 30) };
    });
    console.log('     text:', ev.reportsHub.text.slice(0, 260));
    ev.reportsHub.clickables.forEach((c) => console.log(`     · ${c.t}${c.h ? ' → ' + c.h : ''}`));

    // ── PROBE: chatbot edit form (needed for #2) ────────────────────────────
    console.log('\n══ probe · chatbot edit form ══');
    await go('/chatbots');
    await page.locator('table tbody tr').first().locator('a,button').first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4500);
    ev.chatbotForm = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return { url: location.pathname,
        checkboxes: [...document.querySelectorAll('input[type=checkbox]')].filter(on).map((c) => ({ id: c.id || null, checked: c.checked,
          label: clean(c.closest('label,.form-check,div')?.innerText).slice(0, 30) })).slice(0, 20),
        assignArea: (() => { const el = [...document.querySelectorAll('label,h5,h6,legend,span')].find((x) => /assign/i.test(x.innerText || '')); return el ? clean(el.closest('div')?.innerText).slice(0, 300) : null; })(),
        buttons: [...document.querySelectorAll('button')].filter(on).map((b) => clean(b.innerText)).filter(Boolean).slice(0, 10) };
    });
    console.log('     url:', ev.chatbotForm.url, '| checkboxes:', ev.chatbotForm.checkboxes.length);
    ev.chatbotForm.checkboxes.slice(0, 10).forEach((c) => console.log(`     [${c.checked ? 'x' : ' '}] #${c.id} "${c.label}"`));
    console.log('     assign area:', JSON.stringify(ev.chatbotForm.assignArea || '').slice(0, 200));

    // ── PROBE: whatsapp account edit (needed for #3 Meta Pixel/Ad id) ──────
    console.log('\n══ probe · whatsapp account edit form ══');
    await go('/whatsapp-accounts');
    await page.locator('button:has-text("Edit"), a:has-text("Edit")').first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4500);
    ev.waForm = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return { url: location.pathname,
        fields: [...document.querySelectorAll('input,select,textarea')].filter(on).filter((e) => e.type !== 'hidden')
          .map((e) => ({ id: e.id || null, type: e.type, label: clean(e.closest('.form-group,.col,.mb-3,div')?.querySelector('label')?.innerText).slice(0, 30), val: String(e.value || '').slice(0, 20) }))
          .filter((f) => /pixel|ad ?account|meta|facebook|catalog|token|business/i.test(f.id + f.label)) };
    });
    console.log('     url:', ev.waForm.url);
    ev.waForm.fields.forEach((f) => console.log(`     #${f.id} (${f.type}) "${f.label}" = ${JSON.stringify(f.val)}`));
    if (!ev.waForm.fields.length) console.log('     (no Meta/Pixel fields on this form — integration lives elsewhere)');

  } catch (e) { console.log('\nFATAL:', e.message.split('\n')[0].slice(0, 150)); }
  finally { await browser.close(); }

  const out = path.join(REPO, 'reports', 'qa', 'raw', 'fixes-pass1-lesol_test.json');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ results: R, evidence: ev }, null, 2));
  console.log(`\n  ${path.relative(REPO, out)}`);
})();
