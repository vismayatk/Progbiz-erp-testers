'use strict';
/**
 * READ-ONLY walk of the Asset Management module (onetouch_test).
 *
 *   node scripts/qa/asset_walk.js go
 *
 * Opens every Asset page, records heading, tabs, buttons, table columns and row count, console errors,
 * failed API calls and load time, takes a screenshot, then opens the page's New / Add form (modal or page),
 * reads its fields, takes a second screenshot and closes it. It never saves anything.
 * Output: reports/qa/raw/asset-walk-<stamp>.json and reports/qa/shots/asset-2026-11-16/walk_<page>.png
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { LoginPage } = require('../../erp/common/LoginPage');
const { dismissRateLimit } = require('../../erp/common/helpers');

if (process.argv[2] !== 'go') { console.log('usage: node scripts/qa/asset_walk.js go'); process.exit(0); }
const BASE = process.env.BASE_URL, COMPANY = process.env.COMPANY_CODE;
if (COMPANY !== 'onetouch_test' || !/test\.erp\.progbiz\.in/.test(BASE)) { console.error('onetouch_test only'); process.exit(1); }
const SHOTS = path.join(__dirname, '..', '..', 'reports', 'qa', 'shots', 'asset-2026-11-16');
fs.mkdirSync(SHOTS, { recursive: true });
const ROUTES = ['asset-dashboard', 'assets', 'asset-scan', 'my-assets', 'asset-deliveries', 'asset-approvals', 'asset-transfers', 'asset-exit-clearance',
  'asset-requests', 'asset-employee-charges', 'asset-rentals', 'asset-availability', 'asset-rental-rates', 'asset-leases', 'asset-maintenance',
  'asset-contracts', 'asset-software', 'asset-disposals', 'asset-audits', 'asset-depreciation', 'asset-categories', 'asset-types', 'asset-products',
  'asset-locations', 'asset-designation-kits', 'asset-settings', 'asset-recycle-bin', 'reports', 'data-import'];
const OPENER = /^\s*\+?\s*(add|new|create|start)\b/i;
const UNSAFE = /save|submit|delete|remove|approve|reject|post|confirm|import|upload|send|complete|cancel|dispose|terminate/i;

function read() {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const outside = (e) => !e.closest('aside, .app-sidebar, .side-menu, header, .app-header, .main-header, .switcher-wrapper, #switcher-canvas');
  const main = document.querySelector('main, .main-content, .page-content, .content-wrapper') || document.body;
  const all = (sel, root = main) => [...root.querySelectorAll(sel)].filter(vis).filter(outside);
  const lab = (e) => { let l = e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if (!l) { const g = e.closest('.form-group, .form-check, [class*="col-"]'); l = g && g.querySelector('label'); } return l ? t(l.textContent).slice(0, 70) : ''; };
  return {
    path: location.pathname,
    headings: all('h1,h2,h3,h4,h5,.page-title,.card-title').map((e) => t(e.textContent)).filter(Boolean).slice(0, 10),
    tabs: all('[role="tab"],.nav-tabs .nav-link,.nav-pills .nav-link').map((e) => t(e.textContent)).filter(Boolean).slice(0, 20),
    buttons: all('button,a.btn,[role="button"]').map((e) => t(e.innerText || e.getAttribute('title') || e.getAttribute('aria-label'))).filter((s) => s && s.length < 40).slice(0, 40),
    columns: all('th').map((e) => t(e.textContent)).filter(Boolean).slice(0, 30),
    rows: all('table tbody tr').length,
    controls: all('input,select,textarea').filter((e) => !['hidden', 'password'].includes(e.type)).map((e) => ({ tag: e.tagName.toLowerCase(), type: e.type, id: e.id, label: lab(e), placeholder: e.placeholder || '', required: e.required || /\*/.test(lab(e)) })).slice(0, 80),
    text: t(main.innerText).slice(0, 700),
    denied: /access denied|don't have permission/i.test(document.body.innerText),
    oops: /oops something went wrong/i.test(document.body.innerText),
  };
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  let errors = [], calls = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.split('\n')[0].slice(0, 220)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().split('\n')[0].slice(0, 220)}`); });
  page.on('response', (r) => { if (r.status() >= 400 && /\/api\//.test(r.url())) calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').split('?')[0]}`); });
  await new LoginPage(page).login(COMPANY, process.env.CRM_USERNAME || 'admin', process.env.PASSWORD);
  const out = { at: new Date().toISOString(), pages: [] };
  for (const route of ROUTES) {
    errors = []; calls = [];
    const t0 = Date.now();
    await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (await dismissRateLimit(page)) { await page.waitForTimeout(20000); await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000); errors = []; calls = []; }
    const ms = Date.now() - t0;
    const state = await page.evaluate(read);
    const rec = { route, ms, ...state, errors: [...new Set(errors)].slice(0, 6), calls: [...new Set(calls)].slice(0, 6) };
    await page.screenshot({ path: path.join(SHOTS, `walk_${route}.png`) });
    // the New / Add form
    const op = page.locator('button, a.btn, [role="button"]').filter({ hasText: OPENER }).filter({ visible: true });
    const names = (await op.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
    const i = names.findIndex((n) => OPENER.test(n) && !UNSAFE.test(n));
    if (i >= 0 && !state.denied) {
      errors = []; calls = [];
      const before = page.url();
      await op.nth(i).click().catch(() => {});
      await page.waitForTimeout(3500);
      await dismissRateLimit(page);
      rec.form = { opener: names[i], navigated: page.url().replace(BASE, ''), ...(await page.evaluate(read)), errors: [...new Set(errors)].slice(0, 6), calls: [...new Set(calls)].slice(0, 6) };
      await page.screenshot({ path: path.join(SHOTS, `walk_${route}_form.png`) });
      if (page.url() !== before) await page.goBack().catch(() => {}); else await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1200);
    }
    out.pages.push(rec);
    console.log(`${route.padEnd(26)} ${String(ms).padStart(5)}ms rows=${rec.rows} ${state.denied ? 'DENIED ' : ''}${state.oops ? 'OOPS ' : ''}${rec.errors.length ? 'ERR:' + rec.errors[0].slice(0, 70) : ''} ${rec.calls.length ? 'CALL:' + rec.calls[0] : ''} ${rec.form ? '[form ' + rec.form.navigated + ']' : ''}`);
  }
  const f = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', `asset-walk-${new Date().toISOString().slice(0, 16).replace(':', '-')}.json`);
  fs.writeFileSync(f, JSON.stringify(out, null, 1)); console.log('saved', f);
  await browser.close();
})();
