'use strict';
/**
 * Basic save + data flow for the Master modules.
 *
 * For each master listing that is safe to add to, open its Add form, fill the
 * minimum a record needs (name QA_<ts>, a phone/email if asked, the first real
 * option of any required select), Save, then confirm the new record shows in
 * the listing. That is the whole "does basic save work" question, answered
 * per module rather than assumed from one.
 *
 * Deliberately EXCLUDED: /users (creating a login is out of bounds),
 * /branches and /client-setting (tenant-wide structure), /token-wallet
 * (money). Those are read-only here.
 *
 * Forms are Blazor-bound: every control is driven through Playwright's native
 * fill/selectOption. Records are prefixed QA_ and left for cleanup.
 *
 *   node scripts/qa/master_save_flow.js
 */
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, REPO = path.join(__dirname, '..', '..');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const STAMP = Date.now();
const SKIP = ['/users', '/branches', '/client-setting', '/token-wallet'];
const R = []; const rec = (mod, st, d) => { R.push({ module: mod, status: st, detail: d });
  console.log(`  ${({ SAVED: '✅', NOT_SAVED: '❌', NO_ADD: '⚪', SKIPPED: '·' })[st]} ${mod.padEnd(24)} ${st.padEnd(9)} ${d || ''}`); };
const grid = () => { const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const t = [...document.querySelectorAll('table')].filter(on).sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  return t ? [...t.querySelectorAll('tbody tr')].map((r) => clean(r.innerText)) : []; };

(async () => {
  const masters = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'discovery_report.json'), 'utf8')).nav
    .filter((n) => (n.group || '') === 'Master').map((n) => n.path);
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const ev = {};
  try {
    await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);
    console.log(`\n  ${masters.length} master modules on ${C.company}\n`);
    for (const route of masters) {
      if (SKIP.includes(route)) { rec(route, 'SKIPPED', 'excluded by policy (accounts / tenant structure / money)'); continue; }
      const name = `QA_${route.replace(/\W+/g, '').slice(0, 10)}_${STAMP}`;
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(4200);
      const before = await page.evaluate(grid);
      // Open the Add form — button or navigation, whichever this module uses.
      const add = page.locator('button:has-text("Add New"), a:has-text("Add New"), button:has-text("New"), a:has-text("New"), button:has-text("Add"), a:has-text("Add")').first();
      if (!(await add.count().catch(() => 0))) { rec(route, 'NO_ADD', 'no Add control on the listing'); continue; }
      await add.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3500);
      // Fill the minimum: scope to an open modal if one appeared, else the page.
      const scope = (await page.locator('.modal.show').count().catch(() => 0)) ? page.locator('.modal.show').first() : page;
      const filled = await scope.locator('input:visible, textarea:visible').evaluateAll((els, { name, stamp }) => {
        const out = []; for (const e of els) {
          if (['checkbox', 'radio', 'hidden', 'file', 'submit', 'button'].includes(e.type)) continue;
          const key = `${e.id} ${e.name} ${e.getAttribute('placeholder') || ''} ${e.closest('.form-group,.col,.mb-3,div')?.querySelector('label')?.innerText || ''}`.toLowerCase();
          let v = null;
          if (/name|title/.test(key) && !/user ?name|file/.test(key)) v = name;
          else if (/phone|mobile|contact no/.test(key)) v = String(stamp).slice(-10);
          else if (/e-?mail/.test(key)) v = `qa${stamp}@example.com`;
          else if (/code/.test(key)) v = `QA${String(stamp).slice(-6)}`;
          else if (e.required && e.type !== 'date') v = name;
          if (v !== null) out.push({ id: e.id || e.name || key.slice(0, 30), v });
        } return out; }, { name, stamp: STAMP });
      // Native fills so Blazor binds them.
      for (const f of filled) { const loc = scope.locator(f.id && /^[\w-]+$/.test(f.id) ? `#${f.id}` : `input[placeholder*="${f.id.split(' ')[2] || ''}"]`).first();
        if (await loc.count().catch(() => 0)) await loc.fill(f.v).catch(() => {}); }
      // Required selects → first real option.
      const sels = scope.locator('select:visible'); const n = await sels.count().catch(() => 0);
      for (let i = 0; i < n; i++) { const s = sels.nth(i);
        const opts = await s.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() })).filter((o) => o.value && o.value !== '0' && !/^(choose|select|--)/i.test(o.text)));
        if (opts.length) await s.selectOption(opts[0].value).catch(() => {}); }
      await page.waitForTimeout(800);
      const posts = []; const onReq = (r) => { if (['POST', 'PUT'].includes(r.method()) && !/notification|negotiate/i.test(r.url())) posts.push(r.url().split('?')[0].slice(-48)); }; page.on('request', onReq);
      await scope.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Submit")').first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(5000); page.off('request', onReq);
      const st = await page.evaluate(() => { const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        return { modalOpen: !!document.querySelector('.modal.show'), alert: clean([...document.querySelectorAll('.swal2-popup,.toast,.alert')].map((e) => e.innerText).join(' | ')).slice(0, 120),
          error: /oops|went wrong|error code|exception/i.test(document.body.innerText) }; });
      await page.keyboard.press('Escape').catch(() => {});
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(4000);
      await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(2500);
      const after = await page.evaluate(grid); const listed = after.some((r) => r.includes(name));
      ev[route] = { name, filledFields: filled.map((f) => f.id), posts, ...st, rowsBefore: before.length, rowsAfter: after.length, listed };
      rec(route, listed ? 'SAVED' : 'NOT_SAVED', `${name} · fields=${filled.length} POSTs=${posts.length} modalStillOpen=${st.modalOpen} rows ${before.length}→${after.length}${st.alert ? ' alert="' + st.alert.slice(0, 50) + '"' : ''}${st.error ? ' ERROR' : ''}`);
    }
  } catch (e) { console.log('\nFATAL:', e.message.split('\n')[0].slice(0, 150)); }
  finally { await browser.close(); }
  const saved = R.filter((r) => r.status === 'SAVED').length, bad = R.filter((r) => r.status === 'NOT_SAVED').length;
  console.log(`\n  ${saved} saved · ${bad} not saved · ${R.length - saved - bad} skipped/no-add`);
  const out = path.join(REPO, 'reports', 'qa', 'raw', `master-save-${String(C.company).replace(/\W+/g, '_')}.json`);
  fs.writeFileSync(out, JSON.stringify({ results: R, evidence: ev }, null, 2)); console.log(`  ${path.relative(REPO, out)}`);
})();
