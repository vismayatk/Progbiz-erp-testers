'use strict';
/**
 * UI scout, part 2 — /leads, the enquiry overview of the demo lead, /followups.
 *
 * STATUS: the signed-in flow of this script has NOT been run against the real app (no saved session
 * existed when it was written). It was exercised end-to-end only against the local mock in
 * scripts/video/scout/selftest/ (node scripts/video/scout/selftest/run_selftest.js). Expect to adjust
 * a selector or two on first real use; every step is wrapped so that one failing step does not stop the rest.
 *
 * Needs reports/video/scout/.auth/state.json (create it with 00_save_auth_state_manual.js: a person signs in).
 * This script does NOT log in and does not read PASSWORD.
 *
 * STRICTLY READ-ONLY
 *   - clicks go through lib2.click(), which only allows: listing tabs, view toggles, the filter-panel
 *     open/close buttons, the quick-search button, a listing cell (row navigation), #btn-enquiry-actions
 *     (menu is opened, screenshotted and closed with Escape; no item is clicked), #btn-add-followup /
 *     #btn-followup-<id> (modal is opened, screenshotted and closed with its X / Close; Save is never touched),
 *     #btn-view-overview-<id> (navigation), and modal close controls.
 *   - the only text typed anywhere is the search term in #filter-name.
 *   - lib2.auditNetwork() logs every non-GET request and aborts anything that looks like a write.
 *   - /my-tasks is never visited.
 *
 * Usage (from the repo root)
 *   node scripts/video/scout/04_leads_followups_scout.js                  # all parts in ONE context
 *   node scripts/video/scout/04_leads_followups_scout.js --part=leads     # leads | enquiry | followups (comma list allowed)
 *   node scripts/video/scout/04_leads_followups_scout.js --probe-unauth   # no session needed: records that the routes bounce to /login
 * Options: --enquiry-id=534528  --needle="Demo Customer"
 * Env overrides (used by the self-test): SCOUT_BASE_URL, SCOUT_OUT, SCOUT_STATE
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const L = require('./lib');
const M = require('./lib2');

const arg = (name, def) => { const a = process.argv.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : def; };
const flag = (name) => process.argv.includes('--' + name);

const BASE = (process.env.SCOUT_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');
const OUT = process.env.SCOUT_OUT || L.OUT;
const STATE = process.env.SCOUT_STATE || path.join(L.OUT, '.auth', 'state.json');
const ENQ_ID = arg('enquiry-id', '534528');
const NEEDLE = arg('needle', 'Demo Customer');
const PARTS = arg('part', 'leads,enquiry,followups').split(',').map((s) => s.trim());
const PACE = Number(arg('pace', '1200')); // pause between steps, ms (raise it after a rate-limit hit)

const log = []; // every click / refusal / rate-limit event
const audit = { step: 'start', nonGet: [], blocked: 0 };
const stats = { http429: 0, http429Seen: 0, http429Paths: [], httpErrors: [], pageErrors: [], rateLimitHits: 0 };
const blockers = [];
const written = [];

const out = (f) => path.join(OUT, f);
const save = (f, obj) => { L.writeJson(out(f), obj); written.push(f); };
const saveText = (f, s) => { L.writeText(out(f), s); written.push(f); };
const step = (name) => { audit.step = name; console.log('  - ' + name); };

/** Run one step; a failure is recorded as a blocker and the scout carries on. */
async function attempt(name, fn) {
  step(name);
  try { return await fn(); } catch (e) {
    if (e.rateLimited) throw e;
    const msg = String(e.message).split('\n')[0].slice(0, 240);
    blockers.push({ step: name, error: msg }); console.log('    FAILED: ' + msg); return null;
  }
}

async function go(page, route, readySelector) {
  const t0 = Date.now();
  const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const dcl = Date.now() - t0;
  if (/\/login/i.test(page.url())) { const e = new Error('SESSION_REJECTED: ' + route + ' bounced to /login'); e.session = true; throw e; }
  await page.locator('#sidebar').waitFor({ state: 'visible', timeout: 60000 });
  const shell = Date.now() - t0;
  const h = await M.waitHydrated(page, t0, readySelector);
  await M.backOffIfRateLimited(page, stats, log);
  return { route, finalUrl: page.url().replace(BASE, ''), status: resp ? resp.status() : null, domcontentloaded_ms: dcl, shell_visible_ms: shell, hydrate_ms: h.hydrate_ms, settled: h.settled };
}

async function shots(page, prefix, screenshots, opts) {
  const s = await M.shotsDown(page, OUT, prefix, opts);
  for (const x of s) { screenshots.push(x); written.push(x.file); }
  return s;
}

async function closeAnythingOpen(page) {
  for (let i = 0; i < 3; i++) {
    const open = await page.evaluate(() => ({ modal: !!document.querySelector('.modal.show'), menu: !!document.querySelector('.dropdown-menu.show'), canvas: !!document.querySelector('.offcanvas.show'), swal: !!document.querySelector('.swal2-popup') }));
    if (!open.modal && !open.menu && !open.canvas && !open.swal) return true;
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  }
  return false;
}

/** Tabs of a listing: click each, screenshot the top, read the grid. */
async function walkTabs(page, tabs, prefix, screenshots, suffix = '') {
  const res = [];
  for (const t of tabs) {
    if (!t.id) continue;
    const r = await attempt(`tab ${t.id}${suffix ? ' (' + suffix + ')' : ''}`, async () => {
      const t0 = Date.now();
      await M.click(page, page.locator('#' + t.id), 'id', log, 'switch listing tab');
      const h = await M.waitHydrated(page, t0, null, 30000);
      await M.backOffIfRateLimited(page, stats, log);
      const shot = await shots(page, `${prefix}_${suffix ? suffix + '-' : ''}${t.id}`, screenshots, { topOnly: true });
      const li = await page.evaluate(M.listingInPage);
      return { tab: t.id, label: t.label, switch_ms: h.hydrate_ms, settled: h.settled, screenshot: shot[0].file, tabsNow: li.tabs.map((x) => ({ id: x.id, label: x.label, count: x.count, active: x.active })), table: li.table, pager: li.pager };
    });
    if (r) res.push(r);
    await page.waitForTimeout(PACE);
  }
  return res;
}

async function filterPanel(page, prefix, screenshots) {
  return attempt('filter panel', async () => {
    await M.click(page, page.locator('#btn-toggle-filter'), 'id', log, 'open the filter panel to read its controls');
    await page.locator('#offcanvasRight.show, .offcanvas.show').first().waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForTimeout(700);
    const shot = await shots(page, `${prefix}_filter-panel`, screenshots, { topOnly: true });
    const form = await page.evaluate(M.formInPage, '.offcanvas.show');
    const x = page.locator('#btn-close-filter-x');
    if (await x.isVisible().catch(() => false)) await M.click(page, x, 'id', log, 'close the filter panel'); else await page.keyboard.press('Escape');
    await page.locator('.offcanvas.show').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    const closed = await closeAnythingOpen(page);
    return { screenshot: shot[0].file, closed, form };
  });
}

/** Type the needle into #filter-name and run the quick search; returns how the search was triggered. */
async function runSearch(page, term) {
  const box = page.locator('#filter-name');
  await box.waitFor({ state: 'visible', timeout: 10000 });
  const before = await page.evaluate(M.listingInPage);
  await box.click();
  await box.fill('');
  await box.pressSequentially(term, { delay: 40 });
  await page.waitForTimeout(1500);
  let after = await page.evaluate(M.listingInPage);
  const sig = (l) => JSON.stringify([l.tabs.map((t) => t.count), l.table ? l.table.rowCount : null, l.pager.showingText]);
  let trigger = 'typing alone (live search)';
  if (sig(after) === sig(before)) {
    const t0 = Date.now();
    await M.click(page, page.locator('#btn-search-simple'), 'id', log, 'run the quick search');
    await M.waitHydrated(page, t0, null, 30000);
    after = await page.evaluate(M.listingInPage); trigger = 'click on #btn-search-simple';
    if (sig(after) === sig(before)) { const t1 = Date.now(); await box.press('Enter'); await M.waitHydrated(page, t1, null, 30000); after = await page.evaluate(M.listingInPage); trigger = sig(after) === sig(before) ? 'no visible change after typing, search button and Enter' : 'Enter key'; }
  }
  await M.backOffIfRateLimited(page, stats, log);
  return { term, trigger, before: { tabs: before.tabs.map((t) => ({ id: t.id, count: t.count, active: t.active })), rows: before.table ? before.table.rowCount : null, showing: before.pager.showingText }, after };
}

async function clearSearch(page) {
  const box = page.locator('#filter-name');
  if (!(await box.isVisible().catch(() => false))) return;
  await box.fill('');
  const t0 = Date.now();
  await M.click(page, page.locator('#btn-search-simple'), 'id', log, 'clear the quick search').catch(() => {});
  await M.waitHydrated(page, t0, null, 30000);
}

const demoRows = (tabResults) => tabResults.flatMap((r) => (r.table ? r.table.rows.filter((x) => x.isDemo).map((x) => ({ tab: r.tab, tabLabel: r.label, index: x.index, cells: x.cells, controls: x.controls, bbox: x.bbox, cursor: x.cursor })) : []));

// ───────────────────────────── part: leads ─────────────────────────────
async function partLeads(page) {
  const run = { page: '/leads', screenshots: [] };
  run.nav = await go(page, '/leads', 'table');
  run.title = await page.title();
  await page.waitForTimeout(PACE);
  run.listing = await page.evaluate(M.listingInPage);
  run.defaultTab = (run.listing.tabs.find((t) => t.active) || {}).id || null;
  const top = await shots(page, '05_leads', run.screenshots);
  await attempt('leads text + elements', async () => {
    saveText('leads.text.txt', await page.evaluate(() => document.body.innerText));
    save('leads.elements.json', { page: '/leads', viewport: L.VIEWPORT, dsf: L.DSF, listing: run.listing, elements: await M.collectElementsAllScrolls(page, top.map((s) => s.scrollY)) });
  });
  run.filterPanel = await filterPanel(page, '05_leads', run.screenshots);
  run.tabs = await walkTabs(page, run.listing.tabs.filter((t) => /^tab-lead-/.test(t.id || '')), '05_leads', run.screenshots);

  run.search = await attempt('leads search "' + NEEDLE + '"', async () => {
    // back to the default tab first, so the search starts from the state a viewer would see
    if (run.defaultTab) await M.click(page, page.locator('#' + run.defaultTab), 'id', log, 'back to the default tab');
    await M.waitHydrated(page, Date.now(), null, 30000);
    const s = await runSearch(page, NEEDLE);
    const shot = await shots(page, '05_leads_search', run.screenshots, { topOnly: true });
    s.screenshot = shot[0].file;
    s.searchBox = await page.locator('#filter-name').evaluate((e) => { const r = e.getBoundingClientRect(); return { selector: '#filter-name', placeholder: e.getAttribute('placeholder'), bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, scrollY: Math.round(scrollY) }; });
    s.perTab = await walkTabs(page, s.after.tabs.filter((t) => /^tab-lead-/.test(t.id || '')), '05_leads', run.screenshots, 'search');
    s.demoRows = demoRows(s.perTab);
    return s;
  });

  run.open = await attempt('open the demo lead from the list', async () => {
    const hit = run.search && run.search.demoRows.find((r) => true);
    if (!hit) throw new Error('no "' + NEEDLE + '" row found in any tab of /leads');
    const want = run.search.demoRows.find((r) => r.cells.join(' ').includes(ENQ_ID)) || hit;
    await M.click(page, page.locator('#' + want.tab), 'id', log, 'tab that holds the demo row');
    await M.waitHydrated(page, Date.now(), null, 30000);
    const row = page.locator('table tbody tr', { hasText: NEEDLE }).nth(0);
    const dom = await row.evaluate((r) => ({ anchors: r.querySelectorAll('a').length, buttons: r.querySelectorAll('button').length, html: r.outerHTML.replace(/\s+/g, ' ').replace(/>[^<]{0,80}</g, '><').slice(0, 900) }));
    const tried = [];
    for (const nth of [1, 2]) { // td[1] = number, td[2] = customer name (see EnquiryPage.openFirstEnquiry)
      const t0 = Date.now();
      await M.click(page, row.locator('td').nth(nth), 'cell', log, 'open the lead (row navigation)');
      const ok = await page.waitForURL(/enquiry-overview/i, { timeout: 8000 }).then(() => true).catch(() => false);
      tried.push({ cell: nth, navigated: ok, ms: Date.now() - t0 });
      if (ok) break;
    }
    const url = page.url().replace(BASE, '');
    return { rowDom: dom, tried, resultUrl: url, urlPattern: '/enquiry-overview/{id}', reachedOverview: /enquiry-overview/.test(url) };
  });
  run.private = run.screenshots.map((s) => ({ file: s.file, scrollY: s.scrollY, regions: s.private }));
  save('leads.private.json', run.private);
  save('leads.run.json', run);
  return run;
}

// ───────────────────────────── part: enquiry overview ─────────────────────────────
async function readHistory(page) {
  const tab = page.locator('#followups-tab');
  if (await tab.count()) { await M.click(page, tab, 'id', log, 'show the Followup History tab'); await page.locator('#followups').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1200); }
  return page.evaluate(() => { const r = document.querySelector('#followups'); if (!r) return null; const items = [...r.querySelectorAll('li, tbody tr')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean); return { count: items.length, items, text: (r.innerText || '').replace(/\s+/g, ' ').trim() }; });
}

async function followupModal(page, opener, prefix, screenshots, why) {
  const posts0 = audit.nonGet.length;
  await M.click(page, opener, 'id', log, why);
  const modal = page.locator('#followupModal.show, .modal.show').first();
  await modal.waitFor({ state: 'visible', timeout: 12000 });
  await page.waitForTimeout(1200);
  const shot = await shots(page, prefix, screenshots, { topOnly: true });
  const form = await page.evaluate(M.formInPage, '.modal.show');
  // close: header X first, footer "Close" as fallback, Escape as last resort. Save is never addressed.
  let closedBy = null;
  const x = modal.locator('.modal-header .btn-close, .modal-header [data-bs-dismiss="modal"], .modal-header button[aria-label="Close"]').first();
  if (await x.isVisible().catch(() => false)) { await M.click(page, x, 'close', log, 'close the modal without saving'); closedBy = 'header X'; }
  else { const c = modal.locator('.modal-footer button', { hasText: /^\s*(Close|Cancel)\s*$/ }).first(); if (await c.isVisible().catch(() => false)) { await M.click(page, c, 'close', log, 'close the modal without saving'); closedBy = 'footer Close'; } }
  await page.locator('.modal.show').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  if (await page.locator('.modal.show').count()) { await page.keyboard.press('Escape'); closedBy = (closedBy || '') + ' + Escape'; await page.waitForTimeout(800); }
  const stillOpen = (await page.locator('.modal.show').count()) > 0;
  return { screenshot: shot[0].file, form, closedBy, stillOpen, nonGetRequestsWhileOpen: audit.nonGet.slice(posts0) };
}

async function partEnquiry(page) {
  const run = { page: '/enquiry-overview/' + ENQ_ID, screenshots: [] };
  run.nav = await go(page, '/enquiry-overview/' + ENQ_ID, '#btn-add-followup');
  await page.waitForTimeout(PACE);
  run.overview = await page.evaluate(M.overviewInPage);
  if (!run.overview.isDemo) blockers.push({ step: 'enquiry overview', error: 'the page for id ' + ENQ_ID + ' does not show "' + NEEDLE + '"; personal values were redacted' });
  const top = await shots(page, '06_enquiry-overview', run.screenshots);
  await attempt('overview text + elements', async () => {
    saveText('enquiry-overview.text.txt', await page.evaluate(() => document.body.innerText));
    save('enquiry-overview.elements.json', { page: run.page, viewport: L.VIEWPORT, dsf: L.DSF, overview: run.overview, elements: await M.collectElementsAllScrolls(page, top.map((s) => s.scrollY)) });
  });

  run.tabs = [];
  for (const t of run.overview.tabs) {
    const r = await attempt('overview tab "' + t.text + '"', async () => {
      const loc = t.id ? page.locator('#' + t.id) : page.getByRole('tab', { name: t.text });
      await M.click(page, loc, t.id ? 'id' : 'tab', log, 'show an overview tab');
      await page.waitForTimeout(1500); await M.waitHydrated(page, Date.now(), null, 15000);
      const slug = t.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const shot = await shots(page, '06_enquiry-overview_tab-' + slug, run.screenshots, { topOnly: true });
      return { tab: t.text, id: t.id, screenshot: shot[0].file, content: await page.evaluate(M.overviewInPage) };
    });
    if (r) run.tabs.push(r);
    await page.waitForTimeout(PACE);
  }

  run.historyBefore = await attempt('follow-up history BEFORE', () => readHistory(page));

  run.actionsMenu = await attempt('actions dropdown', async () => {
    await M.click(page, page.locator('#btn-enquiry-actions'), 'id', log, 'open the actions dropdown to read it');
    await page.locator('.dropdown-menu.show').waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForTimeout(600);
    const shot = await shots(page, '06_enquiry-overview_actions-menu', run.screenshots, { topOnly: true });
    const menu = await page.evaluate(M.openMenuInPage);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    if (await page.locator('.dropdown-menu.show').count()) await M.click(page, page.locator('#btn-enquiry-actions'), 'id', log, 'close the actions dropdown (toggle)');
    const closed = (await page.locator('.dropdown-menu.show').count()) === 0;
    return { screenshot: shot[0].file, closed, menu, assignOrTransferItems: menu ? menu.items.filter((i) => /assign|transfer/i.test(i.text)) : [] };
  });

  run.followupModal = await attempt('Add FollowUp modal (open, look, close)', () => followupModal(page, page.locator('#btn-add-followup'), '06_enquiry-overview_followup-modal', run.screenshots, 'open the Add FollowUp modal to read its fields'));
  await closeAnythingOpen(page);

  run.historyAfter = await attempt('follow-up history AFTER (fresh load)', async () => {
    const nav = await go(page, '/enquiry-overview/' + ENQ_ID, '#btn-add-followup');
    const h = await readHistory(page);
    const shot = await shots(page, '06_enquiry-overview_after-modal', run.screenshots, { topOnly: true });
    return Object.assign({ nav, screenshot: shot[0].file }, h);
  });
  run.historyUnchanged = !!(run.historyBefore && run.historyAfter && run.historyBefore.count === run.historyAfter.count && run.historyBefore.text === run.historyAfter.text);

  run.private = run.screenshots.map((s) => ({ file: s.file, scrollY: s.scrollY, regions: s.private }));
  save('enquiry-overview.private.json', run.private);
  save('enquiry-overview.run.json', run);
  return run;
}

// ───────────────────────────── part: follow-ups ─────────────────────────────
async function partFollowups(page) {
  const run = { page: '/followups', screenshots: [] };
  run.nav = await go(page, '/followups', 'table');
  await page.waitForTimeout(PACE);
  run.listing = await page.evaluate(M.listingInPage);
  run.defaultTab = (run.listing.tabs.find((t) => t.active) || {}).id || null;
  const top = await shots(page, '07_followups', run.screenshots);
  await attempt('followups text + elements', async () => {
    saveText('followups.text.txt', await page.evaluate(() => document.body.innerText));
    save('followups.elements.json', { page: '/followups', viewport: L.VIEWPORT, dsf: L.DSF, listing: run.listing, elements: await M.collectElementsAllScrolls(page, top.map((s) => s.scrollY)) });
  });
  run.filterPanel = await filterPanel(page, '07_followups', run.screenshots);
  run.tabs = await walkTabs(page, run.listing.tabs.filter((t) => /^tab-followup-/.test(t.id || '')), '07_followups', run.screenshots);
  run.demoRowsUnfiltered = demoRows(run.tabs);

  run.search = await attempt('followups search "' + NEEDLE + '"', async () => {
    const s = await runSearch(page, NEEDLE);
    const shot = await shots(page, '07_followups_search', run.screenshots, { topOnly: true });
    s.screenshot = shot[0].file;
    s.perTab = await walkTabs(page, s.after.tabs.filter((t) => /^tab-followup-/.test(t.id || '')), '07_followups', run.screenshots, 'search');
    s.demoRows = demoRows(s.perTab);
    return s;
  });

  const rows = (run.search && run.search.demoRows.length ? run.search.demoRows : run.demoRowsUnfiltered) || [];
  const target = rows.find((r) => r.controls.some((c) => (c.id || '').endsWith('-' + ENQ_ID))) || rows[0];
  run.demoRow = target || null;

  run.openFollowupModal = await attempt('follow-up row: "Followup" (modal; open, look, close)', async () => {
    if (!target) throw new Error('no "' + NEEDLE + '" row found in any tab of /followups');
    await M.click(page, page.locator('#' + target.tab), 'id', log, 'tab that holds the demo row');
    await M.waitHydrated(page, Date.now(), null, 30000);
    const c = target.controls.find((x) => /^btn-followup-\d+$/.test(x.id || ''));
    if (!c) throw new Error('the demo row has no #btn-followup-<id> control');
    const row = page.locator('table tbody tr', { hasText: NEEDLE }).first();
    return followupModal(page, row.locator('#' + c.id), '07_followups_followup-modal', run.screenshots, 'open the follow-up modal from the listing row');
  });
  await closeAnythingOpen(page);

  run.openOverview = await attempt('follow-up row: open the enquiry overview', async () => {
    if (!target) throw new Error('no demo row');
    const c = target.controls.find((x) => /^btn-view-overview-\d+$/.test(x.id || ''));
    if (!c) throw new Error('the demo row has no #btn-view-overview-<id> control');
    const row = page.locator('table tbody tr', { hasText: NEEDLE }).first();
    const t0 = Date.now(); const pagesBefore = page.context().pages().length;
    await M.click(page, row.locator('#' + c.id), 'id', log, 'open the enquiry overview from the follow-up row');
    const ok = await page.waitForURL(/enquiry-overview/i, { timeout: 10000 }).then(() => true).catch(() => false);
    const h = ok ? await M.waitHydrated(page, t0, '#btn-add-followup', 30000) : null;
    const opened = { control: c, navigated: ok, newTab: page.context().pages().length > pagesBefore, modal: (await page.locator('.modal.show').count()) > 0, resultUrl: page.url().replace(BASE, ''), hydrate_ms: h ? h.hydrate_ms : null };
    const shot = await shots(page, '07_followups_open-overview', run.screenshots, { topOnly: true });
    opened.screenshot = shot[0].file;
    await closeAnythingOpen(page);
    return opened;
  });

  run.kanban = await attempt('Kanban View (look only)', async () => {
    await go(page, '/followups', 'table');
    await M.click(page, page.locator('#btn-view-kanban'), 'id', log, 'look at the Kanban view');
    await page.waitForTimeout(2500); await M.waitHydrated(page, Date.now(), null, 20000);
    const shot = await shots(page, '07_followups_kanban', run.screenshots, { topOnly: true });
    const cols = await page.evaluate(() => [...document.querySelectorAll('.main-content [class*="kanban"] h5, .main-content [class*="kanban"] h6, .main-content [class*="kanban"] .card-title')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20));
    await M.click(page, page.locator('#btn-view-list'), 'id', log, 'back to the List view');
    await page.waitForTimeout(1500);
    return { screenshot: shot[0].file, columnTitles: cols };
  });

  run.private = run.screenshots.map((s) => ({ file: s.file, scrollY: s.scrollY, regions: s.private }));
  save('followups.private.json', run.private);
  save('followups.run.json', run);
  return run;
}

// ───────────────────────────── unauthenticated probe ─────────────────────────────
async function probeUnauth(browser) {
  const ctx = await browser.newContext({ viewport: L.VIEWPORT, deviceScaleFactor: L.DSF });
  const page = await ctx.newPage(); L.watchNetwork(page, stats);
  const res = [];
  for (const [nn, name, route] of [['05', 'leads', '/leads'], ['06', 'enquiry-overview', '/enquiry-overview/' + ENQ_ID], ['07', 'followups', '/followups']]) {
    const t0 = Date.now();
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    const onLogin = await page.waitForURL(/\/login/i, { timeout: 20000 }).then(() => true).catch(() => false);
    if (onLogin) await page.locator('#companycode').waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    const ms = Date.now() - t0;
    await page.waitForTimeout(800);
    const file = `${nn}_${name}_unauthenticated_s0.png`;
    await page.screenshot({ path: out(file), type: 'png' }); written.push(file);
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    res.push({ route, finalUrl: page.url().replace(BASE, ''), bouncedToLogin: onLogin, login_form_visible_ms: ms, screenshot: file, bodyTextLength: text.length, showsAnyRecord: /ENQ-\d+|demo customer/i.test(text), rateLimited: /too many (attempts|requests)/i.test(text) });
    if (/too many (attempts|requests)/i.test(text)) { stats.rateLimitHits += 1; break; }
    await page.waitForTimeout(4000);
  }
  await ctx.close();
  return res;
}

// ───────────────────────────── main ─────────────────────────────
(async () => {
  if (!BASE) { console.log('BASE_URL is not set'); process.exit(2); }
  L.ensureDir(OUT);
  const started = new Date().toISOString();

  if (flag('probe-unauth')) {
    const browser = await chromium.launch({ headless: true });
    let res = null;
    try { res = await probeUnauth(browser); } finally { await browser.close(); }
    save('unauth_probe.json', { started, finished: new Date().toISOString(), base: BASE.replace(/^https?:\/\//, ''), routes: res, http429: stats.http429, rateLimitHits: stats.rateLimitHits, pageErrors: stats.pageErrors });
    console.log(JSON.stringify(res.map((r) => ({ route: r.route, finalUrl: r.finalUrl, bouncedToLogin: r.bouncedToLogin, ms: r.login_form_visible_ms })), null, 1));
    return;
  }

  if (!fs.existsSync(STATE)) {
    console.log('NO_SAVED_SESSION: ' + path.relative(L.ROOT, STATE) + ' does not exist. A person has to sign in once:');
    console.log('  node scripts/video/scout/00_save_auth_state_manual.js');
    process.exit(3);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: L.VIEWPORT, deviceScaleFactor: L.DSF, storageState: STATE });
  const page = await ctx.newPage();
  L.watchNetwork(page, stats);
  await M.auditNetwork(page, audit);
  page.on('dialog', (d) => { log.push({ t: Date.now(), action: 'native dialog dismissed', type: d.type(), message: d.message().slice(0, 120) }); d.dismiss().catch(() => {}); });

  const result = { started, base: BASE.replace(/^https?:\/\//, ''), enquiryId: ENQ_ID, needle: NEEDLE, parts: {} };
  let exit = 0;
  try {
    for (const p of PARTS) {
      console.log('PART ' + p);
      if (p === 'leads') result.parts.leads = await partLeads(page);
      else if (p === 'enquiry') result.parts.enquiry = await partEnquiry(page);
      else if (p === 'followups') result.parts.followups = await partFollowups(page);
      await closeAnythingOpen(page);
      await page.waitForTimeout(PACE * 2);
    }
  } catch (e) {
    const msg = String(e.message).split('\n')[0].slice(0, 240);
    blockers.push({ step: audit.step, error: msg, fatal: true });
    console.log('STOPPED: ' + msg);
    exit = e.session ? 4 : e.rateLimited ? 5 : 1;
    await page.screenshot({ path: out('99_scout2_stopped.png') }).then(() => written.push('99_scout2_stopped.png')).catch(() => {});
  } finally {
    await closeAnythingOpen(page).catch(() => {});
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  const summary = {
    started, finished: new Date().toISOString(), exitCode: exit, parts: PARTS,
    rateLimitHits: stats.rateLimitHits, http429: stats.http429, httpErrors: stats.httpErrors.slice(0, 40), pageErrors: [...new Set(stats.pageErrors)].slice(0, 20),
    network: { nonGetRequests: audit.nonGet.length, blockedAsPossibleWrite: audit.blocked, nonGet: audit.nonGet },
    clicks: log, blockers, files: written,
  };
  save('scout2.run.json', summary);
  console.log(JSON.stringify({ exit, blockers, rateLimitHits: stats.rateLimitHits, blockedRequests: audit.blocked, files: written.length }, null, 1));
  process.exit(exit);
})();
