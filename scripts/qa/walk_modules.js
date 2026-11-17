'use strict';
/**
 * Walk the tenant module by module, in one browser session.
 *
 * qa-explore.js sweeps a flat route list and reports a wall of pages. This
 * walks the nav the way a person would — group by group, announcing each
 * module before entering it — so the run is watchable and the findings arrive
 * already attributed to the module they belong to.
 *
 * Reads the groups from the last discovery crawl, so it adapts to whichever
 * tenant is configured rather than assuming a fixed module set.
 *
 * Read-only: navigates and reads. Clicks nothing, saves nothing.
 *
 *   HEADED=1 node scripts/qa/walk_modules.js              # watch it
 *   HEADED=1 node scripts/qa/walk_modules.js --only CRM,Automation
 *   node scripts/qa/walk_modules.js                       # headless
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
const REPO = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const ONLY = argOf('only') ? argOf('only').split(',').map((s) => s.trim().toLowerCase()) : null;

// Console noise that fires on every page regardless of health — counted, not
// listed, so a genuine spike stays visible instead of drowning.
const NOISE = [/websocket connection to .*notificationhub/i, /favicon\.ico/i];
const SECRET = [
  [/([?&](?:access_token|token|auth|api_key|key|password)=)[^&\s"']+/gi, '$1<REDACTED>'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.?[A-Za-z0-9_-]*/g, '<JWT-REDACTED>'],
];
const redact = (s) => SECRET.reduce((a, [re, rep]) => a.replace(re, rep), String(s || ''));

const describe = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const t = [...document.querySelectorAll('table')].filter(on)
    .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  const body = clean(document.body.innerText);
  return {
    heading: clean(document.querySelector('h1,h2,h3,.card-title,.page-title')?.innerText).slice(0, 44),
    columns: t ? [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean).length : 0,
    rows: t ? t.querySelectorAll('tbody tr').length : null,
    fields: [...document.querySelectorAll('input,select,textarea')].filter(on)
      .filter((e) => e.type !== 'hidden').length,
    dead: /nothing at this address/i.test(body),
    errorText: /(oops|something went wrong|error code|unhandled|exception)/i.exec(body)?.[0] || null,
    stuckLoading: /\bloading\.\.\.|please wait\b/i.test(body),
    brokenImages: [...document.querySelectorAll('img')]
      .filter((i) => i.complete && i.naturalWidth === 0).length,
    bodyChars: body.length,
  };
};

(async () => {
  const headed = !!process.env.HEADED;
  const reportPath = path.join(REPO, 'scripts', 'discovery_report.json');
  if (!fs.existsSync(reportPath)) {
    console.error('\n  No discovery_report.json — run: node scripts/discover_modules.js\n');
    process.exit(2);
  }
  const nav = JSON.parse(fs.readFileSync(reportPath, 'utf8')).nav || [];

  // Group the routes exactly as the sidebar does.
  const groups = new Map();
  for (const n of nav) {
    const g = n.group || '(ungrouped)';
    if (!groups.has(g)) groups.set(g, []);
    if (!groups.get(g).some((x) => x.path === n.path)) groups.get(g).push(n);
  }
  let entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  if (ONLY) entries = entries.filter(([g]) => ONLY.includes(g.toLowerCase()));

  const total = entries.reduce((a, [, v]) => a + v.length, 0);
  console.log(`\n  host   ${BASE}`);
  console.log(`  tenant ${C.company}`);
  console.log(`  mode   ${headed ? 'HEADED — watch the window' : 'headless'}`);
  console.log(`  scope  ${entries.length} module(s), ${total} page(s)\n`);

  const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 120 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const summary = [];

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2500);
    console.log(`  signed in → ${page.url().replace(BASE, '')}\n`);

    for (const [group, pages] of entries) {
      console.log(`${'━'.repeat(66)}`);
      console.log(`  ${group.toUpperCase()}  (${pages.length} page${pages.length > 1 ? 's' : ''})`);
      console.log(`${'━'.repeat(66)}`);
      const mod = { module: group, pages: [], issues: [] };

      for (const p of pages) {
        const consoleErrors = [];
        let noisy = 0;
        const failed = [];
        const onConsole = (m) => {
          if (m.type() !== 'error') return;
          const txt = redact(m.text().replace(/\s+/g, ' ')).slice(0, 220);
          if (NOISE.some((re) => re.test(txt))) noisy++; else consoleErrors.push(txt);
        };
        const onResp = (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${redact(r.url()).slice(-56)}`); };
        page.on('console', onConsole);
        page.on('response', onResp);

        const resp = await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
          .catch(() => null);
        await page.waitForTimeout(headed ? 2600 : 3600);
        const d = await page.evaluate(describe).catch((e) => ({ probeError: e.message }));
        page.off('console', onConsole);
        page.off('response', onResp);

        const http = resp ? resp.status() : null;
        const flags = [];
        if (d.dead) flags.push('DEAD');
        if (http && http >= 400) flags.push(`HTTP-${http}`);
        if (d.errorText) flags.push('ERROR-TEXT');
        if (d.stuckLoading) flags.push('STUCK-LOADING');
        if (consoleErrors.length) flags.push(`JS-ERR×${consoleErrors.length}`);
        if (failed.length) flags.push(`REQ-FAIL×${failed.length}`);
        if (d.brokenImages) flags.push(`IMG×${d.brokenImages}`);

        const label = (p.text || p.path).slice(0, 26);
        const shape = d.columns ? `${d.columns} cols / ${d.rows} rows` : `${d.fields} fields`;
        console.log(`   ${flags.length ? '⚠️ ' : '✓  '}${label.padEnd(28)}${p.path.padEnd(34)}${shape.padEnd(18)}${flags.join(' ')}`);

        const rec = { path: p.path, label: p.text, http, ...d, consoleErrors, failedRequests: failed, noisy, flags };
        mod.pages.push(rec);
        if (flags.length) mod.issues.push(rec);
      }

      const bad = mod.issues.length;
      console.log(`   ${bad ? `⚠️  ${bad} of ${pages.length} need a look` : `✓  all ${pages.length} clean`}\n`);
      summary.push(mod);
    }
  } catch (e) {
    console.log(`\n  FATAL: ${e.message.split('\n')[0].slice(0, 150)}`);
  } finally {
    if (headed) { console.log('  (window closes in 4s)'); await new Promise((r) => setTimeout(r, 4000)); }
    await browser.close();
  }

  // ── Roll-up ────────────────────────────────────────────────────────────
  console.log(`${'═'.repeat(66)}`);
  console.log(`  MODULE SUMMARY — ${C.company} @ ${BASE}`);
  console.log(`${'═'.repeat(66)}`);
  let pagesTotal = 0, issuesTotal = 0;
  for (const m of summary) {
    pagesTotal += m.pages.length; issuesTotal += m.issues.length;
    const mark = m.issues.length ? '⚠️ ' : '✓ ';
    console.log(`  ${mark} ${m.module.padEnd(20)} ${String(m.pages.length).padStart(3)} pages   ${m.issues.length ? `${m.issues.length} issue(s): ${m.issues.map((i) => i.path).join(', ').slice(0, 60)}` : 'clean'}`);
  }
  console.log(`${'─'.repeat(66)}`);
  console.log(`  ${pagesTotal - issuesTotal}/${pagesTotal} pages clean across ${summary.length} modules`);

  const out = path.join(REPO, 'reports', 'qa', 'raw', `walk-modules-${String(C.company).replace(/\W+/g, '_')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ host: BASE, tenant: C.company, at: new Date().toISOString(), summary }, null, 2));
  console.log(`  ${path.relative(REPO, out)}`);
  console.log(`${'═'.repeat(66)}\n`);
})();
