'use strict';
/**
 * READ-ONLY whole-site audit of the ERP tenant in .env.
 *
 * 1. Logs in and reads the LIVE sidebar + Create New menu (new features show up here).
 * 2. Visits every route and records: heading, tabs, buttons, form fields (with options),
 *    tables (columns + rows), totals, error text, console errors, failed API calls, load time.
 * 3. On pages with an "Add / New / Create" button, opens that form (modal or page), reads its
 *    fields and closes it. It never clicks Save / Submit / anything that commits data.
 * 4. Reads /client-setting: every option in every section (accordion or tabs), with its
 *    label and current value. Sections are read from the DOM, so nothing is expanded or saved.
 *
 *   node scripts/qa/site_audit.js   ->  reports/qa/raw/site-audit-<company>-<YYYY-MM-DDTHH-MM>.json
 *
 * Each run is a snapshot; scripts/qa/site_diff.js compares the newest complete snapshot with
 * the one before it (the /qa-changes skill runs both).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { chromium } = require('playwright');
const { LoginPage } = require('../../erp/common/LoginPage');

const BASE = process.env.BASE_URL;
const COMPANY = process.env.COMPANY_CODE;
// local time, so two runs on the same day keep separate snapshots
const STAMP = (() => { const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}`; })();
const OUT = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', `site-audit-${COMPANY}-${STAMP}.json`);
const EXTRA = ['/home', '/client-setting', '/profile', '/data-assistant', '/reports', '/user-locations',
  '/user-log', '/complaints', '/quotation', '/enquiry'];
// Never click a button whose label suggests it commits or changes data.
const UNSAFE = /save|submit|delete|remove|approve|reject|convert|generate|send|sync|import|upload|transfer|merge|close|cancel|finish|post|publish|pay|confirm|assign|apply|run|start|stop|end|hold|resume|archive|restore|reset|clear|update|export|download|print/i;
const OPENER = /^\s*\+?\s*(add|new|create)(\s+[a-z&\/-]+){0,3}\s*\+?\s*$/i;

const log = (...a) => console.log('  •', ...a);

/** Everything visible on the page that tells us what the page does. */
function inventory(scope) {
  const root = (scope && document.querySelector(scope)) || document;
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const outside = (e) => !e.closest('aside, .app-sidebar, .side-menu, header, .app-header, .main-header, .switcher-wrapper, #switcher-canvas');
  const lab = (e) => {
    let l = e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`);
    if (!l) { const g = e.closest('.form-group, .form-check, .form-switch, [class*="col-"], td, li'); l = g && g.querySelector('label'); }
    return l ? t(l.textContent).slice(0, 80) : '';
  };
  const main = scope ? root : (document.querySelector('main, .main-content, .page-content, .content-wrapper') || document.body);
  const body = t(document.body.innerText);
  const heading = [...main.querySelectorAll('h1, h2, h3, h4, .page-title, .card-title')].filter(vis).filter(outside).map((e) => t(e.textContent)).filter(Boolean);
  const tabs = [...main.querySelectorAll('[role="tab"], .nav-tabs .nav-link, .nav-pills .nav-link')].filter(vis).filter(outside).map((e) => t(e.textContent)).filter(Boolean);
  const buttons = [...main.querySelectorAll('button, a.btn, [role="button"]')].filter(vis).filter(outside)
    .map((e) => t(e.innerText || e.getAttribute('title') || e.getAttribute('aria-label'))).filter((s) => s && s.length < 40);
  const controls = [...root.querySelectorAll('input, select, textarea')].filter(vis).filter(outside)
    .filter((e) => !['hidden', 'password'].includes(e.type))
    .map((e) => ({
      tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', label: lab(e), placeholder: e.placeholder || '',
      required: e.required || /\*/.test(lab(e)),
      checked: ['checkbox', 'radio'].includes(e.type) ? e.checked : undefined,
      value: e.tagName === 'SELECT' ? t(e.options[e.selectedIndex] && e.options[e.selectedIndex].text)
        : (['checkbox', 'radio'].includes(e.type) ? undefined : t(e.value).slice(0, 60)),
      options: e.tagName === 'SELECT' ? [...e.options].map((o) => t(o.text)).slice(0, 25) : undefined,
      optionCount: e.tagName === 'SELECT' ? e.options.length : undefined,
    }));
  const tables = [...main.querySelectorAll('table')].filter(vis).filter(outside).map((tb) => ({
    headers: [...tb.querySelectorAll('thead th')].map((h) => t(h.textContent)).filter(Boolean),
    rows: tb.querySelectorAll('tbody tr').length,
    firstRow: [...(tb.querySelector('tbody tr')?.querySelectorAll('td') || [])].map((c) => t(c.textContent).slice(0, 40)).slice(0, 10),
  }));
  const total = (body.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+(\d+)\s+entries/i) || [])[1];
  return {
    heading: [...new Set(heading)].slice(0, 8), tabs: [...new Set(tabs)].slice(0, 20),
    buttons: [...new Set(buttons)].slice(0, 40), controls: controls.slice(0, 80), tables: tables.slice(0, 6),
    total: total ? Number(total) : null,
    charts: main.querySelectorAll('canvas, svg.apexcharts-svg, .apexcharts-canvas').length,
    notFound: /nothing at this address|page not found|404/i.test(body.slice(0, 600)),
    errorText: (body.match(/(oops[^.]{0,80}|error code[^.]{0,60}|something went wrong[^.]{0,60}|unhandled error[^.]{0,60}|exception[^.]{0,60})/i) || [''])[0],
    textLength: t(main.innerText).length,
  };
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  let consoleErr = [], badCalls = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text().slice(0, 160)); });
  // uncaught script errors ("Cannot read properties of null …") are not console.error calls: record them too
  page.on('pageerror', (e) => consoleErr.push(`pageerror: ${String(e.message).slice(0, 150)}`));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.startsWith(BASE)) badCalls.push(`${r.status()} ${u.replace(BASE, '').slice(0, 120)}`);
  });

  const lp = new LoginPage(page); await lp.goto();
  await lp.login(COMPANY, process.env.CRM_USERNAME, process.env.PASSWORD);
  await settle(page);

  // ── live menu ────────────────────────────────────────────────────────────
  const menu = await page.evaluate(() => {
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const out = [];
    for (const a of document.querySelectorAll('aside a[href], .app-sidebar a[href], .main-menu a[href]')) {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('javascript') || href === '#' || /^https?:/i.test(href)) continue;
      const sub = a.closest('ul.slide-menu');
      const parent = sub && sub.closest('li') && sub.closest('li').querySelector(':scope > a .side-menu__label, :scope > a');
      out.push({ path: '/' + href.replace(/^\//, '').split('?')[0], text: t(a.textContent).slice(0, 60), group: parent ? t(parent.textContent).slice(0, 40) : 'Top' });
    }
    return out;
  });
  const createNew = await page.evaluate(() => {
    const a = document.getElementById('new-task-item'); const m = a && a.closest('.dropdown-menu, ul');
    return m ? [...m.querySelectorAll('a, button')].map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean) : [];
  });
  const seen = new Set(); const routes = [];
  for (const m of menu) if (!seen.has(m.path)) { seen.add(m.path); routes.push(m); }
  for (const p of EXTRA) if (!seen.has(p)) { seen.add(p); routes.push({ path: p, text: '', group: '(not in menu)' }); }
  // pages the previous snapshot had but today's menu doesn't: still visit them, so the diff can
  // tell "hidden from the menu but still opens" apart from "gone / access denied"
  const RAW = path.dirname(OUT);
  const snaps = fs.readdirSync(RAW).filter((f) => f.startsWith(`site-audit-${COMPANY}-`) && f.endsWith('.json')).sort().reverse();
  for (const f of snaps) {
    let prev; try { prev = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')); } catch { continue; }
    if (prev.complete === false) continue;            // a run that was stopped part-way
    for (const p of prev.pages || []) {
      if (!seen.has(p.path)) { seen.add(p.path); routes.push({ path: p.path, text: p.text || '', group: '(was in menu)' }); }
    }
    break;
  }
  log(`menu: ${menu.length} links → ${routes.length} unique routes; Create New: ${createNew.join(', ')}`);

  const audit = { company: COMPANY, base: BASE, user: process.env.CRM_USERNAME, at: new Date().toISOString(),
    complete: false, createNew, menu, pages: [], clientSettings: null };
  const started = Date.now();

  // ── every page ───────────────────────────────────────────────────────────
  for (const [i, r] of routes.entries()) {
    consoleErr = []; badCalls = [];
    const rec = { ...r };
    try {
      // a page that comes back blank or hit a network error gets one more try, so a
      // network blip isn't reported as "everything on this page was removed"
      for (let attempt = 1; attempt <= 2; attempt++) {
        consoleErr = []; badCalls = [];
        const t0 = Date.now();
        await page.goto(BASE + r.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await settle(page);
        rec.loadMs = Date.now() - t0;
        rec.finalPath = new URL(page.url()).pathname;
        Object.assign(rec, await page.evaluate(inventory, null));
        const blip = !rec.textLength || consoleErr.some((e) => /net::ERR_/.test(e));
        if (!blip || attempt === 2) break;
        rec.retried = true;
        log(`${r.path}: blank or network error — retrying`);
        await page.waitForTimeout(3000);
      }
      // open an Add/New/Create form, read it, close it — never commit
      const openers = await page.locator('main button:visible, main a.btn:visible, .main-content button:visible, .main-content a.btn:visible').evaluateAll((els, src) => {
        const re = new RegExp(src, 'i');
        return els.map((e, k) => ({ k, text: (e.innerText || '').replace(/\s+/g, ' ').trim(), type: e.getAttribute('type') || '' }))
          .filter((o) => re.test(o.text) && o.type !== 'submit').slice(0, 1);
      }, OPENER.source).catch(() => []);
      if (openers.length && !UNSAFE.test(openers[0].text)) {
        const before = page.url();
        const btn = page.locator('main button:visible, main a.btn:visible, .main-content button:visible, .main-content a.btn:visible').nth(openers[0].k);
        await btn.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const modal = await page.locator('.modal.show, .offcanvas.show').count().catch(() => 0);
        if (modal) {
          const id = await page.locator('.modal.show, .offcanvas.show').last().getAttribute('id').catch(() => null);
          rec.form = { opener: openers[0].text, kind: 'modal', id, ...(await page.evaluate(inventory, id ? `#${id}` : '.modal.show, .offcanvas.show')) };
          await page.keyboard.press('Escape').catch(() => {});
        } else if (page.url() !== before) {
          await settle(page);
          rec.form = { opener: openers[0].text, kind: 'page', path: new URL(page.url()).pathname, ...(await page.evaluate(inventory, null)) };
        } else {
          rec.form = { opener: openers[0].text, kind: 'inline-or-none', ...(await page.evaluate(inventory, null)) };
        }
        // trim the form record to what matters
        if (rec.form) { delete rec.form.tables; delete rec.form.charts; }
      }
    } catch (e) { rec.error = String(e.message).split('\n')[0].slice(0, 160); }
    rec.consoleErrors = [...new Set(consoleErr)].slice(0, 6);
    rec.failedCalls = [...new Set(badCalls)].slice(0, 8);
    audit.pages.push(rec);
    const flag = rec.error ? 'ERROR' : rec.notFound ? 'NOT FOUND' : rec.errorText ? 'ERROR TEXT' : rec.failedCalls.length ? `${rec.failedCalls.length} failed calls` : 'ok';
    log(`${String(i + 1).padStart(3)}/${routes.length} ${r.path.padEnd(42)} ${String(rec.loadMs || '-').padStart(6)}ms  ${flag}${rec.form ? `  [form: ${rec.form.opener} → ${rec.form.kind}, ${rec.form.controls?.length || 0} fields]` : ''}`);
    fs.writeFileSync(OUT, JSON.stringify(audit, null, 2));   // save as we go
  }

  // ── client settings: every option, read from the DOM (collapsed sections included) ──
  try {
    await page.goto(BASE + '/client-setting', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settle(page);
    await page.waitForTimeout(1500);
    audit.clientSettings = await page.evaluate(() => {
      const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const main = document.querySelector('.main-content, main, .page-content') || document.body;
      const section = (e) => {
        const item = e.closest('.accordion-item');
        if (item) return t((item.querySelector('.accordion-button, .accordion-header') || {}).textContent) || '(accordion)';
        const pane = e.closest('.tab-pane');
        if (pane) return t((document.querySelector(`[data-bs-target="#${pane.id}"], [href="#${pane.id}"]`) || {}).textContent) || pane.id;
        const card = e.closest('.card');
        return t(card && (card.querySelector('.card-header, .card-title') || {}).textContent) || '(page)';
      };
      const label = (e) => {
        const f = e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`);
        if (f) return t(f.textContent);
        const g = e.closest('.form-check, .form-switch, .form-group, .mb-3, [class*="col-"], .row, li, tr');
        const l = g && g.querySelector('label, .form-label, .form-check-label');
        if (l) return t(l.textContent);
        return t(g && g.innerText).slice(0, 80);
      };
      const options = [...main.querySelectorAll('input, select, textarea')]
        .filter((e) => !(e.id || '').startsWith('switcher') && !e.closest('#switcher-canvas, .switcher-wrapper, aside, header, .pickr, .pcr-app'))
        .filter((e) => !['hidden', 'password', 'button', 'submit', 'reset'].includes(e.type))
        .map((e) => ({
          section: section(e), id: e.id || '', tag: e.tagName.toLowerCase(), type: e.type || '', label: label(e).slice(0, 80),
          value: ['checkbox', 'radio'].includes(e.type) ? e.checked
            : e.tagName === 'SELECT' ? t(e.options[e.selectedIndex] && e.options[e.selectedIndex].text) : t(e.value).slice(0, 120),
          choices: e.tagName === 'SELECT' ? [...e.options].map((o) => t(o.text)) : undefined,
        }));
      return {
        heading: t((main.querySelector('h1, h2, h3, .page-title') || {}).textContent),
        sections: [...main.querySelectorAll('.accordion-button, [role="tab"], .nav-tabs .nav-link')].map((b) => t(b.textContent)).filter(Boolean),
        saveButtons: [...main.querySelectorAll('button[type="submit"], button[id*="save" i]')].map((b) => ({ id: b.id, text: t(b.textContent), section: section(b) })),
        options,
      };
    });
    log(`client-setting: ${audit.clientSettings.sections.length} sections, ${audit.clientSettings.options.length} options`);
  } catch (e) { audit.clientSettings = { error: String(e.message).split('\n')[0] }; }

  audit.complete = true;
  audit.durationMs = Date.now() - started;
  fs.writeFileSync(OUT, JSON.stringify(audit, null, 2));
  await browser.close();
  console.log('\nWROTE', path.relative(process.cwd(), OUT));
})().catch((e) => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
