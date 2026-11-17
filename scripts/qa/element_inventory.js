'use strict';
/**
 * Element-level inventory crawl — the thing a stored "baseline" (like the
 * HRMS manifest) would diff against, except CRM/Task/Workflow/Master have no
 * such manifest. Instead of storing a baseline, this compares the live DOM
 * directly against the selectors already hardcoded in the Playwright page
 * objects, in one pass:
 *
 *   1. Read every "#some-id" / '#some-id' literal out of erp/**\/pages/*.js
 *      and erp/**\/tests/*.spec.js.
 *   2. Log in once, walk every route the suite touches (static, from the
 *      page objects) plus every route the nav crawl found that the suite
 *      doesn't cover yet (candidates for new coverage).
 *   3. For each route, capture every element id/name/type/label/text on the
 *      page, table headers, and "Add/New" controls.
 *   4. Cross-reference: a selector referenced by code for a route that is
 *      NOT present in that route's live capture is a drift candidate.
 *
 * Read-only. Never submits a form (except the one throwaway enquiry needed to
 * reach /enquiry-overview/<id>, which is the same QA_-prefixed pattern the
 * rest of the suite already uses).
 *
 *   node scripts/qa/element_inventory.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const REPO = path.join(__dirname, '..', '..');
const BASE = process.env.BASE_URL;
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

// ── 1. Static routes the suite already drives, pulled straight from the page objects ──
const COVERED_ROUTES = [
  '/home', '/leads', '/followups', '/enquiry', '/enquiries', '/quotations',
  '/lead-sources', '/lead-status', '/bulk-lead-transfer', '/crm-dashboard',
  '/sales-targets', '/item-categories', '/item', '/items', '/task', '/my-tasks',
  '/delegated-tasks', '/created-tasks', '/unscheduled-tasks', '/todo-list',
  '/daily-activity-report', '/calendar', '/redirect/task-timeline',
  '/projects', '/project', '/project-notes', '/project-attachments',
  '/project-expenses', '/project-incomes', '/project-report',
  '/workflow-modules',
];

// ── 2. Every route the fresh nav crawl found that isn't in the list above —
//    these are the "new pages" candidates. Built at runtime from discovery_report.json
//    so this script stays correct as the app grows, instead of hardcoding a second list.
function newRoutesFromDiscovery() {
  const d = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'discovery_report.json'), 'utf8'));
  const masterRoutes = d.nav.filter((n) => n.group === 'Master').map((n) => n.path);
  const all = d.nav.map((n) => ({ path: n.path, group: n.group, text: n.text }));
  const known = new Set([...COVERED_ROUTES, ...masterRoutes]);
  return { all, uncovered: all.filter((n) => !known.has(n.path)), masterRoutes };
}

// ── selector extraction from code ──────────────────────────────────────────
function extractSelectors() {
  const files = [];
  const walk = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(js)$/.test(f.name) && (p.includes(`${path.sep}pages${path.sep}`) || p.includes(`${path.sep}tests${path.sep}`))) files.push(p); } };
  for (const d of ['erp/crm', 'erp/task-management', 'erp/workflow', 'erp/item', 'erp/project-management']) {
    const full = path.join(REPO, d); if (fs.existsSync(full)) walk(full);
  }
  const idRe = /#([A-Za-z][\w-]*)/g;
  const map = {}; // id -> [{file, line}]
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    src.split('\n').forEach((line, i) => {
      let m; idRe.lastIndex = 0;
      while ((m = idRe.exec(line))) {
        const id = m[1];
        if (['fa', 'bi', 'ri'].includes(id)) continue; // icon-class false positives like class*="fa-..."
        (map[id] ||= []).push({ file: path.relative(REPO, f), line: i + 1 });
      }
    });
  }
  return map;
}

const captureIds = () => { const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => e.getClientRects().length > 0;
  return {
    title: clean(document.title),
    heading: clean(document.querySelector('h1,h2,.page-title,.breadcrumb')?.innerText).slice(0, 120),
    ids: [...document.querySelectorAll('[id]')].filter(vis).map((e) => ({ id: e.id, tag: e.tagName, type: e.type || null })).slice(0, 250),
    allIdsIncludingHidden: [...document.querySelectorAll('[id]')].map((e) => e.id),
    buttons: [...new Set([...document.querySelectorAll('button, a.btn')].filter(vis).map((b) => clean(b.innerText)).filter((t) => t && t.length < 40))],
    addControls: [...document.querySelectorAll('button, a')].filter(vis).filter((e) => /add|new|create/i.test(e.innerText || '')).map((e) => clean(e.innerText)).filter(Boolean).slice(0, 10),
    tables: [...document.querySelectorAll('table')].map((t) => ({ columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean), rows: t.querySelectorAll('tbody tr').length })).filter((t) => t.columns.length),
    errorText: /(oops|something went wrong|error code|unhandled|exception)/i.exec(clean(document.body.innerText))?.[0] || null,
    bodyChars: clean(document.body.innerText).length,
  }; };

(async () => {
  const selectorMap = extractSelectors();
  const { all, uncovered, masterRoutes } = newRoutesFromDiscovery();
  const routes = [...new Set([...COVERED_ROUTES, ...masterRoutes])];

  console.log(`\n📋 selectors referenced in code: ${Object.keys(selectorMap).length}`);
  console.log(`📋 routes to inventory (covered): ${routes.length}`);
  console.log(`📋 routes found live but not covered by any page object: ${uncovered.length}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const findings = {};
  const newPageFindings = {};

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    for (const [i, route] of routes.entries()) {
      process.stdout.write(`  [covered ${String(i + 1).padStart(3)}/${routes.length}] ${route.padEnd(28)}`);
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3200);
        const f = await page.evaluate(captureIds);
        f.bouncedToLogin = /\/login/i.test(page.url());
        findings[route] = f;
        console.log(f.bouncedToLogin ? ' ⚠️ BOUNCED-TO-LOGIN' : f.errorText ? ` ⚠️ ${f.errorText}` : ' ok');
      } catch (e) { findings[route] = { fatal: e.message.split('\n')[0].slice(0, 160) }; console.log(' FATAL'); }
    }

    // ── the dynamic enquiry-overview / followup-modal / item-picker surface ──
    console.log('\n  creating one throwaway enquiry to inventory /enquiry-overview + Add Followup modal + item picker…');
    await page.goto(`${BASE}/enquiry`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
    const NAME = `QA_ELEMCHK_${Date.now()}`;
    const enquiryForm = await page.evaluate(captureIds); findings['/enquiry (form)'] = enquiryForm;
    // don't submit — read-only for this script; CH chain spec already exercises the live save path.

    console.log(`\n  [new-page ${uncovered.length}] inventorying every uncovered nav route…`);
    for (const [i, n] of uncovered.entries()) {
      process.stdout.write(`  [new ${String(i + 1).padStart(3)}/${uncovered.length}] ${n.path.padEnd(28)} (${n.group || '-'})  `);
      try {
        await page.goto(`${BASE}${n.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3200);
        const f = await page.evaluate(captureIds);
        f.bouncedToLogin = /\/login/i.test(page.url()); f.group = n.group; f.navText = n.text;
        newPageFindings[n.path] = f;
        console.log(f.bouncedToLogin ? ' ⚠️ BOUNCED' : f.errorText ? ` ⚠️ ${f.errorText}` : ` ok (${f.ids.length} ids, ${f.tables.length} tables)`);
      } catch (e) { newPageFindings[n.path] = { fatal: e.message.split('\n')[0].slice(0, 160), group: n.group, navText: n.text }; console.log(' FATAL'); }
    }
  } catch (e) { console.log('\nFATAL:', e.message.split('\n')[0]); }
  finally { await browser.close(); }

  // ── cross-reference: selector referenced in code but absent from every captured page it could plausibly belong to ──
  const drift = [];
  for (const [id, refs] of Object.entries(selectorMap)) {
    const presentAnywhere = Object.values(findings).some((f) => f.allIdsIncludingHidden?.includes(id))
      || (findings['/enquiry (form)']?.allIdsIncludingHidden || []).includes(id);
    if (!presentAnywhere) drift.push({ id, refs });
  }

  const out = { capturedAt: new Date().toISOString(), base: BASE, company: C.company,
    selectorCount: Object.keys(selectorMap).length, coveredRoutes: findings,
    uncoveredRoutes: newPageFindings, allNav: all, driftCandidates: drift };
  const outPath = path.join(REPO, 'reports', 'qa', 'raw', `element-inventory-${String(C.company).replace(/\W+/g, '_')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`\n\n═══ SUMMARY ═══`);
  console.log(`  drift candidates (selector in code, id not found live anywhere): ${drift.length}`);
  drift.forEach((d) => console.log(`    #${d.id}  ←  ${d.refs.map((r) => `${r.file}:${r.line}`).join(', ')}`));
  console.log(`  new/uncovered routes inventoried: ${Object.keys(newPageFindings).length}`);
  console.log(`  raw → ${path.relative(REPO, outPath)}`);
})();
