'use strict';
/**
 * Study the Work Flow module — the engine that replaced Project Management.
 *
 * Projects is no longer a fixed set of pages; it is one instance of a
 * configurable workflow module identified by a GUID. So before testing the
 * project flow, establish what is configurable: what modules exist, what
 * types and phases a project can have, and what the New Project form asks for.
 *
 * Read-only. Opens forms to read them; saves nothing.
 *
 *   node scripts/qa/study_workflow_module.js
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

const describe = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  return {
    url: location.pathname,
    heading: clean(document.querySelector('h1,h2,h3,.card-title,.page-title')?.innerText).slice(0, 70),
    dead: /nothing at this address/i.test(document.body.innerText),
    grids: [...document.querySelectorAll('table')].filter(on).map((t) => ({
      columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean),
      rows: t.querySelectorAll('tbody tr').length,
      firstRow: [...(t.querySelector('tbody tr')?.querySelectorAll('td') || [])]
        .map((c) => clean(c.innerText).slice(0, 24)),
    })).filter((g) => g.columns.length),
    fields: [...document.querySelectorAll('input,select,textarea')].filter(on)
      .filter((e) => e.type !== 'hidden')
      .map((e) => ({
        id: e.id || null, tag: e.tagName.toLowerCase(), type: e.type || null,
        required: e.required || false,
        label: clean((e.labels && e.labels[0] && e.labels[0].innerText) ||
          e.closest('.form-group,.col,.mb-3,.row > div')?.querySelector('label')?.innerText).slice(0, 34),
        options: e.tagName === 'SELECT'
          ? [...e.options].slice(0, 8).map((o) => clean(o.text).slice(0, 26)) : null,
      })),
    buttons: [...document.querySelectorAll('button, a.btn')].filter(on)
      .map((b) => ({ id: b.id || null, text: clean(b.innerText).slice(0, 30),
        title: b.getAttribute('data-bs-title') || null })).filter((b) => b.id || b.text || b.title),
    tabs: [...document.querySelectorAll('.nav-link, [role="tab"]')].filter(on)
      .map((e) => clean(e.innerText).slice(0, 28)).filter((t) => t && !/switcher|theme/i.test(t)),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const S = {};
  const shot = async (n) => {
    const p = path.join(REPO, 'reports', 'qa', 'shots', 'workflow', `${n}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // ── 1. Work Flow Modules — the customisation layer ────────────────────
    console.log('══ /workflow-modules — what modules are configured? ══');
    await page.goto(`${BASE}/workflow-modules`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    S.modules = await page.evaluate(describe);
    S.moduleLinks = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      if (!t) return [];
      return [...t.querySelectorAll('tbody tr')].map((r) => ({
        cells: [...r.querySelectorAll('td')].map((c) => clean(c.innerText).slice(0, 30)),
        hrefs: [...r.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
      }));
    });
    await shot('workflow_modules');
    console.log('   heading:', S.modules.heading);
    console.log('   grid:', JSON.stringify(S.modules.grids.map((g) => g.columns)));
    S.moduleLinks.forEach((m) => console.log('     row:', JSON.stringify(m.cells)));
    console.log('   buttons:', JSON.stringify(S.modules.buttons.map((b) => b.text || b.id).slice(0, 8)));

    // ── 2. Resolve the Projects workflow GUID from the live nav ───────────
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    // Expand collapsed nav groups so the workflow links render.
    const toggles = page.locator('nav a, .sidebar a, [class*="menu" i] > li > a');
    const n = await toggles.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 60); i++) {
      const t = toggles.nth(i);
      const href = await t.getAttribute('href').catch(() => null);
      if (!href || href === '#' || href === 'javascript:void(0)') {
        await t.click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(140);
      }
    }
    S.workflowGuids = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const out = {};
      for (const a of document.querySelectorAll('a[href]')) {
        const m = (a.getAttribute('href') || '').match(/\/workflows?\/([0-9a-f-]{36})/i);
        if (m) out[m[1]] = clean(a.innerText).slice(0, 30);
      }
      return out;
    });
    console.log('\n══ workflow modules found in nav ══');
    Object.entries(S.workflowGuids).forEach(([g, label]) => console.log(`   ${label.padEnd(20)} ${g}`));

    let guid = Object.keys(S.workflowGuids)[0];

    // The sidebar hides these links behind accordions that did not expand, so
    // fall back to the "Types" action on /workflow-modules — it navigates to
    // /workflow-types/<guid>, which is where the id can be read directly.
    if (!guid) {
      console.log('   nav did not yield a GUID — deriving it from the Work Flow Modules "Types" action');
      await page.goto(`${BASE}/workflow-modules`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4500);
      await page.locator('table tbody tr').first().locator('a:has-text("Types"), button:has-text("Types")')
        .first().click({ timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(5000);
      const m = page.url().match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) { guid = m[1]; S.workflowGuids[guid] = 'Projects (via Types)'; }
      console.log(`   → ${page.url().replace(BASE, '')}`);
    }
    if (!guid) guid = process.env.WORKFLOW_GUID || null;
    if (!guid) { console.log('   ❌ could not resolve a workflow GUID'); throw new Error('no workflow module'); }
    S.guid = guid;
    console.log(`   using workflow GUID: ${guid}`);

    // ── 3. Every page of that workflow module ─────────────────────────────
    const PAGES = [
      ['listing', `/workflows/${guid}`],
      ['new', `/workflow/${guid}`],
      ['dashboard', `/workflow-dashboard/${guid}`],
      ['types', `/workflow-types/${guid}`],
      ['statusReport', `/workflow-status-report/${guid}`],
      ['notes', `/workflow-notes/module/${guid}`],
      ['attachments', `/workflow-attachments/module/${guid}`],
      ['expenses', `/workflow-expenses/module/${guid}`],
      ['collections', `/workflow-collections/module/${guid}`],
      ['pendingCollection', `/workflow-collection-pending/module/${guid}`],
      ['maintenance', `/workflow-maintenance/module/${guid}`],
      ['costTypes', '/workflow-cost-types'],
    ];
    console.log('\n══ workflow pages ══');
    S.pages = {};
    for (const [key, url] of PAGES) {
      const resp = await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(4200);
      const d = await page.evaluate(describe).catch(() => ({}));
      d.http = resp ? resp.status() : null;
      S.pages[key] = d;
      await shot(key);
      console.log(`   ${key.padEnd(18)} http=${d.http} ${d.dead ? 'DEAD' : `"${(d.heading || '').slice(0, 26)}" grids=${(d.grids || []).length} fields=${(d.fields || []).length} rows=${(d.grids || [])[0]?.rows ?? '-'}`}`);
    }

    // ── 4. The New Project form — what does creating one require? ─────────
    console.log('\n══ New Project form ══');
    const nf = S.pages.new;
    console.log('   heading:', nf.heading, '| fields:', (nf.fields || []).length, '| tabs:', JSON.stringify(nf.tabs));
    (nf.fields || []).forEach((f, i) =>
      console.log(`     ${String(i + 1).padStart(2)}. ${(f.label || '(no label)').padEnd(28)} ${f.tag}#${f.id || '-'}${f.required ? ' *' : ''}` +
        (f.options ? `  opts=${JSON.stringify(f.options.slice(0, 4))}` : '')));
    console.log('   buttons:', JSON.stringify((nf.buttons || []).map((b) => b.text || b.title || b.id).slice(0, 10)));

    // ── 5. Project Types — the per-project customisation ──────────────────
    console.log('\n══ Project Types (customisation) ══');
    const ty = S.pages.types;
    console.log('   grid:', JSON.stringify((ty.grids || []).map((g) => ({ cols: g.columns, rows: g.rows }))));
    console.log('   first row:', JSON.stringify((ty.grids || [])[0]?.firstRow));
    console.log('   buttons:', JSON.stringify((ty.buttons || []).map((b) => b.text || b.id).slice(0, 8)));

  } catch (e) {
    console.log('\nERR:', e.message);
    S.error = e.message;
  } finally {
    await browser.close();
  }

  const out = path.join(REPO, 'reports', 'qa', 'raw', 'workflow-module-study.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(S, null, 2));
  console.log(`\n✅ wrote ${path.relative(REPO, out)} — nothing saved`);
})();
