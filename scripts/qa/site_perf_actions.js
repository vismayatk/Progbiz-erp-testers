'use strict';
/**
 * READ-ONLY timing of the actions people repeat all day, on every menu page of the ERP tenant in .env.
 *
 * For each page it finds, at run time, what the page offers and times each one until the page's data has finished
 * loading (the last call ended and nothing is left loading):
 *
 *   tab        click each tab (Today / Delayed / status tabs ...)
 *   search     a term taken from the first row (many matches), a term that matches nothing, then clearing the box
 *   page 2     click page 2 of the list
 *   page size  the largest page size the list offers (100 rows)
 *   filter     open the filter drawer, choose the 2nd option of its first dropdown, Apply, then Clear
 *   date       every option of a date-range dropdown (Today ... Previous Year)
 *   calendar   next / previous month
 *
 * It never saves, deletes, approves or uploads anything: it only types in search boxes, picks dropdown options and
 * clicks tabs, pagers, Apply and Clear. If any write request is seen it stops and says so.
 *
 *   node scripts/qa/site_perf_actions.js                      all pages, 1 pass (about 25 min)
 *   node scripts/qa/site_perf_actions.js --only leads         pages whose path contains "leads"
 *   node scripts/qa/site_perf_actions.js --passes 3           repeat each page's actions 3 times (medians)
 *   node scripts/qa/site_perf_actions.js --net slow4g         on Chrome's "Slow 4G" link
 *   HEADED=1 node scripts/qa/site_perf_actions.js --only leads    watch it
 *
 * Output: reports/qa/raw/site-perf-actions-<company>-<stamp>[-slow4g].json and .md
 * Run it with no other session on the tenant (HTTP 429 throttling ruins the numbers; actions hit by a 429 are repeated).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { chromium } = require('playwright');
const { LoginPage } = require('../../erp/common/LoginPage');
const { dismissRateLimit } = require('../../erp/common/helpers');

const BASE = process.env.BASE_URL;
const COMPANY = process.env.COMPANY_CODE;
const ORIGIN = new URL(BASE).origin;
const STAMP = (() => { const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}`; })();
const RAW = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const ONLY = arg('only', '');
const PASSES = Number(arg('passes', 1));
const NET = arg('net', '');
const PACE = Number(arg('pace', 900));
const PROFILES = { slow4g: { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 } };
if (NET && !PROFILES[NET]) { console.error(`unknown --net "${NET}"`); process.exit(1); }
const T = NET ? 3 : 1;
const TAG = NET ? `-${NET}` : '';
const OUT = path.join(RAW, `site-perf-actions-${COMPANY}-${STAMP}${TAG}`);
const LIMIT = NET ? { good: 2500, fair: 5000 } : { good: 1000, fair: 2500 };
const verdict = (ms) => (ms == null ? '-' : ms <= LIMIT.good ? 'good' : ms <= LIMIT.fair ? 'fair' : 'SLOW');
const EXTRA = ['/home', '/client-setting', '/profile', '/data-assistant', '/reports', '/user-locations', '/user-log', '/complaints', '/quotation', '/enquiry'];

// never click anything that looks like it changes data
const UNSAFE = /save|submit|delete|remove|approve|reject|convert|generate|send|sync|import|upload|transfer|merge|close|cancel|finish|post|publish|pay|confirm|assign|run|start|stop|hold|resume|archive|restore|update|export|download|print|add|new|create/i;
const DATE_TAB = /^\d{1,2}\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i;
const BG = /notificationhub|get-unread-message-count|my-open-call|get-reports-list/i;       // background polling, not part of an action
const WRITE = (m, u) => m !== 'GET' && /\/api\//.test(u) && /(save|create|update|delete|remove|insert|approve|reject|transfer|upload|import|send|assign|convert|cancel|close|add-|edit|submit)/i.test(new URL(u).pathname) && !/\/(get|list|search|count|check|has|is)[\w-]*/i.test(new URL(u).pathname);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sorted = (a) => a.filter((x) => x != null).sort((x, y) => x - y);
const median = (a) => { const s = sorted(a); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const round = (n) => (n == null ? null : Math.round(n));
const sec = (ms) => (ms == null ? '-' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
const log = (...a) => console.log('  •', ...a);

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const started = Date.now();
  const writes = [];
  const openWrites = [];          // write-looking calls a page sends by itself when it opens (not caused by an action)
  const net = { inflight: new Set(), lastActivity: Date.now(), calls: [], pending: [] };
  page.on('request', (r) => {
    net.inflight.add(r); net.lastActivity = Date.now();
    if (r.url().startsWith(ORIGIN) && WRITE(r.method(), r.url())) writes.push(`${r.method()} ${r.url().replace(ORIGIN, '')}`);
  });
  page.on('requestfailed', (r) => { net.inflight.delete(r); net.lastActivity = Date.now(); });
  page.on('requestfinished', (r) => {
    net.inflight.delete(r); net.lastActivity = Date.now();
    const endAt = Date.now();
    net.pending.push((async () => {
      const u = r.url(); if (!u.startsWith(ORIGIN) || !['fetch', 'xhr'].includes(r.resourceType())) return;
      const p = new URL(u).pathname; if (/\/_framework\/|\.(wasm|dll|dat|js|css|json|png|svg|woff2?)$/i.test(p)) return;
      const resp = await r.response().catch(() => null); const t = r.timing();
      net.calls.push({ ep: `${r.method()} ${p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '/:guid').replace(/\/\d+(?=\/|$)/g, '/:id')}`, ms: t && t.responseEnd > 0 ? Math.round(t.responseEnd) : null, status: resp ? resp.status() : 0, endAt });
    })());
  });

  const lp = new LoginPage(page);
  await lp.goto(); await lp.login(COMPANY, process.env.CRM_USERNAME, process.env.PASSWORD);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  if (NET) { const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', PROFILES[NET]); log(`network: ${NET}`); }

  // ── routes: the live sidebar, as in site_perf.js ───────────────────────────
  const menu = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('aside a[href], .app-sidebar a[href], .main-menu a[href]')) {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('javascript') || href === '#' || /^https?:/i.test(href)) continue;
      out.push({ path: '/' + href.replace(/^\//, '').split('?')[0], text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) });
    }
    return out;
  });
  const seen = new Set(); let routes = [];
  for (const m of menu) if (!seen.has(m.path)) { seen.add(m.path); routes.push(m); }
  for (const p of EXTRA) if (!seen.has(p)) { seen.add(p); routes.push({ path: p, text: '' }); }
  // account and settings pages are forms, not lists: pressing Enter in one would submit it
  const SKIP = /^\/(profile|client-setting|reset-password|change-password)\b/i;
  const skipped = routes.filter((r) => SKIP.test(r.path)).map((r) => r.path);
  routes = routes.filter((r) => !SKIP.test(r.path));
  if (skipped.length) log(`not touched (account / settings forms): ${skipped.join(', ')}`);
  if (ONLY) routes = routes.filter((r) => r.path.includes(ONLY));
  log(`${routes.length} pages, ${PASSES} pass(es)`);

  // ── helpers ────────────────────────────────────────────────────────────────
  async function settle(quietMs = 600, maxMs = 20000 * T, minWait = 350) {
    const t0 = Date.now();
    await sleep(minWait);                                    // a debounced search sends its call a moment after the key press
    while ((net.inflight.size || Date.now() - net.lastActivity < quietMs) && Date.now() - t0 < maxMs) await sleep(80);
    await Promise.allSettled(net.pending);
    return net.inflight.size === 0;
  }
  const spinning = () => page.evaluate(() => [...document.querySelectorAll('.spinner-border, .spinner-grow, .loader, .loading, [class*="skeleton"], .swal2-loading')].some((e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length))).catch(() => false);
  const totalEntries = () => page.evaluate(() => { const m = document.body.innerText.match(/Showing\s+\d[\d,]*\s+to\s+\d[\d,]*\s+of\s+(\d[\d,]*)\s+entries/i); return m ? Number(m[1].replace(/,/g, '')) : null; }).catch(() => null);
  const bodyRows = () => page.locator('table tbody tr').count().catch(() => 0);

  /** time one action: ms until the page's data has finished loading. Repeats once, after a wait, if the tenant said 429. */
  async function timed(label, fn) {
    for (let attempt = 0; attempt < 3; attempt++) {
      net.calls = []; net.pending = [];
      const t0 = Date.now();
      let err = null;
      try { await fn(); } catch (e) { err = String(e.message).split('\n')[0].slice(0, 110); }
      const done = await settle();
      const calls = net.calls.filter((c) => !BG.test(c.ep) && c.endAt >= t0);
      const limited = calls.some((c) => c.status === 429) || (await dismissRateLimit(page, 300));
      if (limited && attempt < 2) { log(`    429 during "${label}" — waiting 20 s and repeating`); await sleep(20000); continue; }
      const last = calls.length ? Math.max(...calls.map((c) => c.endAt)) : null;
      const slow = [...calls].filter((c) => c.ms != null).sort((a, b) => b.ms - a.ms)[0];
      return { label, ms: last ? last - t0 : null, calls: calls.length, slowest: slow ? { ep: slow.ep, ms: slow.ms } : null,
        failed: calls.filter((c) => c.status >= 400 && c.status !== 429).map((c) => `${c.status} ${c.ep}`),
        stillLoading: !done || (await spinning()), rows: await bodyRows(), total: await totalEntries(), tainted: limited, error: err };
    }
  }

  async function open(route) {
    net.calls = []; net.pending = [];
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 * T });
    if (await dismissRateLimit(page, 400)) { await sleep(15000); await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 * T }); }
    await settle(800, 25000 * T, 800);
    openWrites.push(...writes.splice(0));
  }

  /** what this page offers, found from the live DOM (sidebar, header and the filter drawer excluded) */
  const discover = () => page.evaluate(({ unsafeSrc, dateTabSrc }) => {
    const UNSAFE = /^(add|new|create|save|delete|export|import|upload|download|print|send|transfer|assign)\b/i, DATE_TAB = new RegExp(dateTabSrc, 'i');
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const outside = (e) => !e.closest('aside, .app-sidebar, .side-menu, header, .app-header, .main-header, .switcher-wrapper, #switcher-canvas, .offcanvas, .modal');
    const noCount = (s) => t(s).replace(/\s*\(?\d[\d,]*\)?\s*$/, '').trim();
    const o = { search: null, tabs: [], activeTab: null, dateSel: null, pageSize: null, pager: false, filter: false, calendar: false, word: null, hasRows: false };
    const hasList = !!document.querySelector('table');
    const inForm = (e) => { const f = e.closest('form'); return !!(f && f.querySelector('button[type="submit"], input[type="submit"]')); };
    const inp = !hasList ? null : [...document.querySelectorAll('input')].filter(vis).filter(outside).filter((e) => !inForm(e)).find((e) => ['text', 'search', ''].includes(e.type || '') && !/phone|mobile|email|password/i.test(`${e.id} ${e.name} ${e.type}`) && (/filter-name|search/i.test(e.id || '') || /search/i.test(`${e.placeholder} ${e.getAttribute('aria-label') || ''}`)) && !/enter\s+\w+\s+(number|and)\b/i.test(e.placeholder || ''));
    if (inp) o.search = inp.id && !/^[0-9a-f-]{20,}$/i.test(inp.id) && !/\d{6,}/.test(inp.id) ? `#${CSS.escape(inp.id)}` : `input[placeholder="${(inp.placeholder || '').replace(/"/g, '\\"')}"]`;
    const tabEls = [...document.querySelectorAll('[role="tab"], .nav-tabs .nav-link, .nav-pills .nav-link')].filter(vis).filter(outside);
    o.tabs = [...new Set(tabEls.map((e) => noCount(e.textContent)).filter((x) => x && x.length < 40 && !UNSAFE.test(x) && !DATE_TAB.test(x)))].slice(0, 12);
    const act = tabEls.find((e) => /active|selected/.test(e.className) || e.getAttribute('aria-selected') === 'true');
    o.activeTab = act ? noCount(act.textContent) : null;
    for (const s of [...document.querySelectorAll('select')].filter(vis).filter(outside)) {
      const opts = [...s.options].map((x) => t(x.text));
      if (!o.dateSel && opts.some((x) => /^today$/i.test(x)) && opts.some((x) => /^this month$/i.test(x))) o.dateSel = { id: s.id, options: opts.filter((x) => x && !/^(select|choose|custom)/i.test(x)) };
      const nums = opts.filter((x) => /^\d+$/.test(x)).map(Number);
      if (!o.pageSize && nums.length >= 3 && (/page|size|length|show/i.test(s.id) || nums.includes(10))) o.pageSize = { id: s.id, options: nums };
    }
    o.pager = !!([...document.querySelectorAll('.pagination a, .pagination button, .pagination li, [class*="pagination"] a, [class*="pagination"] button, [class*="pager"] a, [class*="pager"] button')].filter(vis).find((e) => t(e.textContent) === '2'));
    o.filter = !![...document.querySelectorAll('[data-bs-toggle="offcanvas"], button, a.btn')].filter(vis).filter(outside).find((e) => /^filters?$/i.test(t(e.innerText)) || (e.getAttribute('data-bs-toggle') === 'offcanvas'));
    o.calendar = !!document.querySelector('.fc-next-button');
    const row = document.querySelector('table tbody tr'); o.hasRows = !!row;
    if (row) { const cells = [...row.querySelectorAll('td')].map((c) => t(c.textContent)); for (const c of cells) { const w = (c.match(/[A-Za-z]{4,}/) || [])[0]; if (w) { o.word = w.slice(0, 3); break; } } }
    return o;
  }, { unsafeSrc: UNSAFE.source, dateTabSrc: DATE_TAB.source });

  // ── run every page ─────────────────────────────────────────────────────────
  const result = { company: COMPANY, base: BASE, network: NET || 'none', at: new Date().toISOString(), passes: PASSES, complete: false, partial: !!ONLY, pages: [] };
  const save = () => fs.writeFileSync(OUT + '.json', JSON.stringify(result, null, 2));

  for (const [i, r] of routes.entries()) {
    const rec = { path: r.path, text: r.text, offers: null, actions: [], error: null };
    openWrites.length = 0;
    try {
      await open(r.path);
      const off = await discover();
      rec.offers = { search: !!off.search, tabs: off.tabs.length, date: off.dateSel ? off.dateSel.options.length : 0, pager: off.pager, pageSize: !!off.pageSize, filter: off.filter, calendar: off.calendar };
      rec.opensWith = [...new Set(openWrites)];
      rec.baselineTotal = await totalEntries(); rec.baselineRows = await bodyRows();
      const results = [];
      for (let pass = 0; pass < PASSES; pass++) {
        const A = [];
        const add = async (label, fn) => { const m = await timed(label, fn); if (m) A.push(m); await sleep(PACE); };

        // page 2, then the largest page size
        if (off.pager) {
          const pg = page.locator('.pagination, [class*="pagination"], [class*="pager"]');
          await add('page 2', () => pg.locator('a, button').filter({ hasText: /^2$/ }).or(pg.locator('li').filter({ hasText: /^2$/ })).first().click({ timeout: 5000 }));
          await open(r.path);
        }
        if (off.pageSize) {
          const big = Math.min(100, Math.max(...off.pageSize.options));
          await add(`page size ${big}`, () => page.selectOption(off.pageSize.id ? `#${off.pageSize.id}` : 'select >> nth=0', { label: String(big) }));
          await open(r.path);
        }
        // tabs
        for (const tab of off.tabs) {
          if (tab === off.activeTab) continue;
          await add(`tab: ${tab}`, () => page.locator('[role="tab"], .nav-tabs .nav-link, .nav-pills .nav-link').filter({ hasText: new RegExp(`^\\s*${tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') }).first().click({ timeout: 5000 }));
        }
        if (off.tabs.length > 1 && off.activeTab) { await page.locator('[role="tab"], .nav-tabs .nav-link, .nav-pills .nav-link').filter({ hasText: new RegExp(`^\\s*${off.activeTab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') }).first().click().catch(() => {}); await settle(); }
        // search
        if (off.search) {
          const box = () => page.locator(off.search).first();
          if (off.word) await add(`search "${off.word}"`, async () => { await box().fill(off.word); await box().press('Enter'); });
          await add('search: no match', async () => { await box().fill(`zz_no_match_${Date.now() % 100000}`); await box().press('Enter'); });
          await add('clear search', async () => { await box().fill(''); await box().press('Enter'); });
        }
        // filter drawer
        if (off.filter) {
          const body = page.locator('main, .main-content, .page-content, .content-wrapper').first();
          const trig = body.locator('button, a.btn').filter({ hasText: /^\s*filters?\s*$/i }).or(body.locator('[data-bs-toggle="offcanvas"]')).filter({ visible: true }).first();
          const drawer = page.locator('.offcanvas.show');
          await add('filter: open drawer', async () => { await trig.click({ timeout: 5000 }); await drawer.first().waitFor({ state: 'visible', timeout: 5000 }); });
          if (await drawer.count()) {
            const sel = drawer.locator('select').filter({ visible: true }).first();
            if (await sel.count()) { const n = await sel.locator('option').count(); if (n > 1) await sel.selectOption({ index: 1 }).catch(() => {}); }
            const apply = drawer.locator('button').filter({ hasText: /^\s*(search|apply|filter|go|submit filters?)\s*$/i }).filter({ visible: true }).first();
            if (await apply.count()) await add('filter: apply', () => apply.click({ timeout: 5000 }));
            const clear = drawer.locator('button').filter({ hasText: /^\s*(clear|reset|clear all)\s*$/i }).filter({ visible: true }).first();
            if (await clear.count()) await add('filter: clear', () => clear.click({ timeout: 5000 }));
            await page.keyboard.press('Escape').catch(() => {}); await sleep(400);
            if (await drawer.count()) await drawer.locator('.btn-close, button[data-bs-dismiss="offcanvas"]').first().click().catch(() => {});
          }
        }
        // date range
        if (off.dateSel) {
          const sel = off.dateSel.id ? page.locator(`#${off.dateSel.id}`) : page.locator('select').filter({ has: page.locator('option', { hasText: /^This Month$/ }) }).first();
          for (const o of off.dateSel.options) await add(`date: ${o}`, () => sel.selectOption({ label: o }));
        }
        // calendar
        if (off.calendar) {
          await add('calendar: next', () => page.locator('.fc-next-button').click({ timeout: 5000 }));
          await add('calendar: previous', () => page.locator('.fc-prev-button').click({ timeout: 5000 }));
        }
        results.push(A);
        if (writes.length) throw new Error(`WRITE REQUEST SEEN DURING AN ACTION: ${writes.join(', ')}`);
        if (pass < PASSES - 1) await open(r.path);
      }
      // median across passes, by action label
      const labels = [...new Set(results.flat().map((a) => a.label))];
      rec.actions = labels.map((label) => {
        const all = results.flat().filter((a) => a.label === label), ok = all.filter((a) => !a.tainted && !a.error);
        const pick = ok.length ? ok : all;
        const worst = [...pick].sort((x, y) => (y.ms || 0) - (x.ms || 0))[0];
        return { label, ms: round(median(pick.map((a) => a.ms))), max: round(Math.max(...pick.map((a) => a.ms || 0))) || null, runs: pick.length, calls: worst.calls, slowest: worst.slowest, failed: [...new Set(pick.flatMap((a) => a.failed))].slice(0, 3),
          stillLoading: pick.some((a) => a.stillLoading), rows: worst.rows, total: worst.total, tainted: all.some((a) => a.tainted), error: all.find((a) => a.error)?.error || null };
      });
    } catch (e) { rec.error = String(e.message).split('\n')[0].slice(0, 160); }
    result.pages.push(rec);
    const worst = [...rec.actions].sort((a, b) => (b.ms || 0) - (a.ms || 0))[0];
    log(`${String(i + 1).padStart(3)}/${routes.length} ${r.path.padEnd(38)} ${String(rec.actions.length).padStart(2)} actions${rec.error ? '  ERROR ' + rec.error : worst ? `  slowest: ${worst.label} ${sec(worst.ms)}` : '  (nothing to time)'}`);
    save();
    if (rec.error && /WRITE REQUEST SEEN/.test(rec.error)) { console.error('STOPPING: ' + rec.error); break; }
  }
  result.complete = true; result.durationMs = Date.now() - started; save();

  // ── markdown ───────────────────────────────────────────────────────────────
  const flat = result.pages.flatMap((p) => p.actions.map((a) => ({ ...a, path: p.path })));
  const kind = (l) => (l.startsWith('tab:') ? 'tab' : l.startsWith('search "') ? 'search' : l.startsWith('search: no') ? 'search (no match)' : l === 'clear search' ? 'clear search' : l.startsWith('page size') ? 'page size' : l === 'page 2' ? 'page 2' : l.startsWith('filter: open') ? 'filter: open drawer' : l.startsWith('filter: apply') ? 'filter: apply' : l.startsWith('filter: clear') ? 'filter: clear' : l.startsWith('date:') ? 'date range' : l.startsWith('calendar') ? 'calendar' : l);
  const rows = (arr, cols) => arr.map((r) => `| ${cols.map((c) => c(r)).join(' | ')} |`).join('\n');
  const timed_ = flat.filter((a) => a.ms != null);
  const byKind = {};
  for (const a of timed_) (byKind[kind(a.label)] = byKind[kind(a.label)] || []).push(a);
  const kinds = Object.entries(byKind).map(([k, v]) => ({ k, n: v.length, med: median(v.map((x) => x.ms)), p90: sorted(v.map((x) => x.ms))[Math.floor(v.length * 0.9)] ?? null, max: Math.max(...v.map((x) => x.ms)) }));
  const cnt = (v) => timed_.filter((a) => verdict(a.ms) === v).length;
  let md = `# Action timing — ${COMPANY} · ${STAMP}${NET ? ' · ' + NET : ''}\n\n`;
  md += `**Target:** ${BASE} · **Pages:** ${result.pages.length} · **Actions timed:** ${timed_.length} · **Passes:** ${PASSES} · **Network:** ${NET || 'no throttling'} · **Took:** ${(result.durationMs / 60000).toFixed(1)} min\n\n`;
  md += `Each time is from the click or Enter key until the page's data has finished loading (the last call ended and nothing is left loading). Verdict: good ≤ ${LIMIT.good / 1000} s, fair ≤ ${LIMIT.fair / 1000} s, SLOW above. Actions that sent no server call are not listed. Nothing was saved or changed.\n\n`;
  md += `## Summary\n\n| | good | fair | slow |\n|---|---|---|---|\n| All timed actions | ${cnt('good')} | ${cnt('fair')} | ${cnt('SLOW')} |\n\n`;
  md += `## By kind of action\n\n| Action | Timed | Median | 90th percentile | Slowest |\n|---|---|---|---|---|\n${rows(kinds.sort((a, b) => (b.med || 0) - (a.med || 0)), [(x) => x.k, (x) => x.n, (x) => sec(x.med), (x) => sec(x.p90), (x) => sec(x.max)])}\n\n`;
  md += `## Slowest actions\n\n| Page | Action | Time | Calls | Slowest call | Rows in list | Verdict |\n|---|---|---|---|---|---|---|\n${rows([...timed_].sort((a, b) => b.ms - a.ms).slice(0, 30), [(a) => a.path, (a) => a.label, (a) => sec(a.ms), (a) => a.calls, (a) => (a.slowest ? `${a.slowest.ep.replace(/^\w+ \/api\//, '')} ${sec(a.slowest.ms)}` : '-'), (a) => (a.total != null ? a.total.toLocaleString('en-US') : '-'), (a) => verdict(a.ms)])}\n\n`;
  const withData = result.pages.filter((p) => p.baselineTotal != null).sort((a, b) => b.baselineTotal - a.baselineTotal).slice(0, 12);
  md += `## How much data the lists hold (the timings depend on it)\n\n| Page | Rows in the list |\n|---|---|\n${rows(withData, [(p) => p.path, (p) => p.baselineTotal.toLocaleString('en-US')])}\n\n`;
  const trouble = result.pages.flatMap((p) => [...(p.error ? [`${p.path}: ${p.error}`] : []), ...p.actions.filter((a) => a.stillLoading || a.error || a.failed.length || a.tainted).map((a) => `${p.path} · ${a.label}: ${[a.stillLoading ? 'still loading or a spinner stayed' : '', a.error || '', ...a.failed, a.tainted ? 'hit the rate limit' : ''].filter(Boolean).join('; ')}`)]);
  const opens = result.pages.filter((p) => p.opensWith && p.opensWith.length);
  if (opens.length) md += `## Write-looking calls that pages send by themselves when they open\n\n${opens.map((p) => `- ${p.path}: ${p.opensWith.join(', ')}`).join('\n')}\n\nNot caused by the timed actions, and not counted as a stop condition.\n\n`;
  if (trouble.length) md += `## Needs a look\n\n${trouble.map((x) => `- ${x}`).join('\n')}\n\n`;
  md += `## Every page\n\n| Page | Offers | Slowest action | Time |\n|---|---|---|---|\n${rows(result.pages, [(p) => p.path, (p) => (p.offers ? Object.entries(p.offers).filter(([, v]) => v).map(([k, v]) => (typeof v === 'number' ? `${k} ${v}` : k)).join(', ') || 'nothing to time' : '-'), (p) => { const w = [...p.actions].sort((a, b) => (b.ms || 0) - (a.ms || 0))[0]; return w ? w.label : '-'; }, (p) => { const w = [...p.actions].sort((a, b) => (b.ms || 0) - (a.ms || 0))[0]; return w ? sec(w.ms) : '-'; }])}\n`;
  fs.writeFileSync(OUT + '.md', md);
  console.log(`\nDone in ${(result.durationMs / 60000).toFixed(1)} min · ${timed_.length} actions timed: ${cnt('good')} good, ${cnt('fair')} fair, ${cnt('SLOW')} slow\n  report: ${path.relative(process.cwd(), OUT)}.md`);
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
