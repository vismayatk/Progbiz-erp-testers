'use strict';
/**
 * READ-ONLY performance check of the ERP tenant in .env. One user, one browser: it measures, it does not load-test.
 *
 *   1. Server baseline        median round trip for the app's index page (your network + the server).
 *   2. First visit            empty cache: login page, then login -> Home. Bytes, requests, biggest files,
 *                             which files are not compressed or have no caching headers.
 *   3. Direct page loads      every menu page opened by URL (the whole app boots again). N runs each.
 *                             FCP, LCP, DOM nodes, time until the page shows content, time until its data calls end.
 *   4. In-app navigation      the same pages opened by clicking the sidebar link (what a signed-in user does all day).
 *                             N runs each, plus JS heap growth over the whole walk (leak check).
 *   5. API calls              every fetch/XHR the app made, grouped by endpoint: count, median, p95, max.
 *
 *   node scripts/qa/site_perf.js                 default: 2 direct + 3 in-app runs per page (about 25 min)
 *   node scripts/qa/site_perf.js --quick         1 + 1 runs (about 8 min)
 *   node scripts/qa/site_perf.js --direct 3 --inapp 3
 *   node scripts/qa/site_perf.js --only leads    only pages whose path contains "leads"
 *   node scripts/qa/site_perf.js --net slow4g    throttled network: 1.6 Mbps down, 0.75 Mbps up, 150 ms latency (Chrome's "Slow 4G")
 *                                                the empty-cache first visit is then measured on that link too (it takes minutes)
 *   node scripts/qa/site_perf.js --net slow4g --cpu 4   also slow the CPU 4x (a mid-range phone)
 *   HEADED=1 node scripts/qa/site_perf.js        watch it (timings are the same, a little noisier)
 *
 * Output: reports/qa/raw/site-perf-<company>-<YYYY-MM-DDTHH-MM>.json and .md
 * A later run is compared with the previous complete one, page by page.
 *
 * It never clicks anything except sidebar links, and never saves. Do not run it while another session
 * is using the tenant: the numbers would be wrong and the tenant throttles bursts (HTTP 429).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { chromium } = require('playwright');
const { LoginPage } = require('../../erp/common/LoginPage');
const { HrmsLoginPage } = require('../../hrms/pages/HrmsLoginPage');
const { dismissRateLimit } = require('../../erp/common/helpers');

// --app hrms measures the HRMS tenant (HRMS_BASE_URL / HRMS_COMPANY_CODE / HRMS_USERNAME / HRMS_PASSWORD); default is the ERP tenant in BASE_URL / COMPANY_CODE / CRM_USERNAME / PASSWORD
const HR = process.argv.includes('--app') && process.argv[process.argv.indexOf('--app') + 1] === 'hrms';
const BASE = HR ? process.env.HRMS_BASE_URL : process.env.BASE_URL;
const COMPANY = HR ? process.env.HRMS_COMPANY_CODE : process.env.COMPANY_CODE;
const USER = HR ? process.env.HRMS_USERNAME : process.env.CRM_USERNAME;
const PASS = HR ? process.env.HRMS_PASSWORD : process.env.PASSWORD;
if (!BASE || !COMPANY || !USER || !PASS) { console.error(`missing target settings (${HR ? 'HRMS_BASE_URL, HRMS_COMPANY_CODE, HRMS_USERNAME, HRMS_PASSWORD' : 'BASE_URL, COMPANY_CODE, CRM_USERNAME, PASSWORD'})`); process.exit(1); }
const ORIGIN = new URL(BASE).origin;
const STAMP = (() => { const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}`; })();
const RAW = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const QUICK = process.argv.includes('--quick');
const DIRECT = Number(arg('direct', QUICK ? 1 : 2));
const INAPP = Number(arg('inapp', QUICK ? 1 : 3));
const ONLY = arg('only', '');
const NET = arg('net', '');                       // '' = no throttling, 'slow4g'
const CPU = Number(arg('cpu', 1));
const PROFILES = { slow4g: { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 } };
if (NET && !PROFILES[NET]) { console.error(`unknown --net "${NET}" (use: ${Object.keys(PROFILES).join(', ')})`); process.exit(1); }
const T = NET ? 4 : 1;                            // timeouts are 4x longer on a slow link
const TAG = NET ? `-${NET}${CPU > 1 ? `-cpu${CPU}` : ''}` : '';
const NETLABEL = NET ? `${NET} (1.6 Mbps down, 0.75 Mbps up, 150 ms latency${CPU > 1 ? `, CPU ${CPU}x slower` : ''})` : 'no throttling';
const OUT = path.join(RAW, `site-perf-${COMPANY}-${STAMP}${TAG}`);
const EXTRA = ['/home', '/client-setting', '/profile', '/data-assistant', '/reports', '/user-locations', '/user-log', '/complaints', '/quotation', '/enquiry'];

// Verdicts. Direct loads include the app boot, so they get more room than in-app navigation.
const LIMIT = NET ? { direct: { good: 6000, fair: 10000 }, inapp: { good: 3000, fair: 6000 }, api: { good: 2000, fair: 4000 } }
  : { direct: { good: 2500, fair: 4000 }, inapp: { good: 1500, fair: 3000 }, api: { good: 1000, fair: 3000 } };
const verdict = (ms, k) => (ms == null ? '-' : ms <= LIMIT[k].good ? 'good' : ms <= LIMIT[k].fair ? 'fair' : 'SLOW');

const STATIC = /\.(wasm|dll|dat|pdb|js|mjs|css|json|woff2?|ttf|png|svg|jpe?g|webp|gif|ico|map|br|gz|blat)$/i;
const log = (...a) => console.log('  •', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function throttle(ctx, page) {
  if (!NET && CPU <= 1) return;
  const cdp = await ctx.newCDPSession(page);
  if (NET) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', PROFILES[NET]); }
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
}
const sorted = (a) => a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y);
const pct = (a, p) => { const s = sorted(a); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const median = (a) => pct(a, 0.5);
const round = (n) => (n == null ? null : Math.round(n));
const kb = (b) => (b == null ? '-' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const sec = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(1)} s`);

/** /api/crm/get-lead/123?x=1 -> POST /api/crm/get-lead/:id */
const endpoint = (method, url) => {
  const p = new URL(url).pathname.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '/:guid').replace(/\/\d+(?=\/|$)/g, '/:id');
  return `${method} ${p}`;
};

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const started = Date.now();
  const result = { company: COMPANY, base: BASE, network: NETLABEL, at: new Date().toISOString(), runs: { direct: DIRECT, inapp: INAPP }, complete: false, partial: !!ONLY,
    baseline: null, firstVisit: null, pages: [], endpoints: [], heap: [], assetFlags: [] };

  // ── network recorder (one per page) ────────────────────────────────────────
  function recorder(page) {
    const n = { lastActivity: Date.now(), lastFinish: 0, calls: [], files: [], pending: [], failed: [], inflight: new Set(), timedOut: false };
    page.on('request', (r) => { n.inflight.add(r); n.lastActivity = Date.now(); });
    page.on('requestfailed', (r) => { n.inflight.delete(r); n.lastActivity = Date.now(); });
    page.on('requestfinished', (r) => {
      n.inflight.delete(r);
      n.lastActivity = Date.now(); n.lastFinish = n.lastActivity;
      n.pending.push((async () => {
        const u = r.url(); if (!u.startsWith(ORIGIN)) return;
        const type = r.resourceType();
        const t = r.timing();
        const resp = await r.response().catch(() => null);
        const sz = await r.sizes().catch(() => null);
        const status = resp ? resp.status() : 0;
        const bytes = sz && sz.responseBodySize > 0 ? sz.responseBodySize : 0;
        const pth = new URL(u).pathname;
        const kind = pth.startsWith('/_framework/') ? 'runtime' : type;
        if ((type === 'fetch' || type === 'xhr') && kind !== 'runtime' && !STATIC.test(pth)) n.calls.push({ ep: endpoint(r.method(), u), ms: t && t.responseEnd > 0 ? t.responseEnd : null, status, bytes });
        n.files.push({ url: u.replace(ORIGIN, '').split('?')[0], type: kind, status, bytes, h: resp ? resp.headers() : {} });
      })());
    });
    n.reset = () => { n.calls = []; n.files = []; n.pending = []; n.lastFinish = 0; n.lastActivity = Date.now(); };
    // settled = nothing in flight AND quiet for quietMs. A call that is still running is waited for (up to maxMs).
    n.settle = async (quietMs = 700, maxMs = 20000 * T) => {
      const t0 = Date.now();
      while ((n.inflight.size || Date.now() - n.lastActivity < quietMs) && Date.now() - t0 < maxMs) await sleep(100);
      n.timedOut = n.inflight.size > 0;
      await Promise.allSettled(n.pending);
    };
    return n;
  }

  const PROBE = () => {
    const main = document.querySelector('main, .main-content, .page-content, .content-wrapper') || document.body;
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    return { chars: (main.innerText || '').replace(/\s+/g, ' ').trim().length, path: location.pathname,
      loading: [...document.querySelectorAll('.spinner-border, .spinner-grow, .loader, .loading, [class*="skeleton"], .swal2-loading')].some(vis) };
  };
  /** time until the main area shows text and no spinner is visible (and, for in-app, the URL is the target).
   *  A spinner that never goes away falls back to the time the text first appeared, flagged as stuck. */
  async function untilContent(page, t0, wantPath, maxMs = 25000 * T, fromPath = null) {
    const norm = (x) => x.replace(/\/$/, '');
    let shell = null;
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(PROBE).catch(() => null);
      if (s && s.chars > 40 && (!wantPath || norm(s.path) === norm(wantPath) || (fromPath && norm(s.path) !== norm(fromPath)))) {
        if (!s.loading) return { ms: Date.now() - t0, stuck: false };
        if (shell == null) shell = Date.now() - t0;
      }
      await sleep(120);
    }
    return shell != null ? { ms: shell, stuck: true } : { ms: null, stuck: false };
  }
  const throttled = async (page) => (await dismissRateLimit(page, 400)) ? (await sleep(15000), true) : false;

  // ── 1+2. baseline and first visit (empty cache) ────────────────────────────
  const ctx1 = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const p1 = await ctx1.newPage();
  const net1 = recorder(p1);
  if (NET) {
    await throttle(ctx1, p1);
    result.baseline = { emulated: NETLABEL };
    log(`network: ${NETLABEL}`);
  } else {
    const rtts = [];
    for (let i = 0; i < 5; i++) { const t = Date.now(); await ctx1.request.get(BASE + '/', { failOnStatusCode: false }).catch(() => {}); rtts.push(Date.now() - t); }
    result.baseline = { indexRoundTripMs: { median: median(rtts), min: Math.min(...rtts), max: Math.max(...rtts) } };
    log(`server round trip for the index page: median ${median(rtts)} ms (min ${Math.min(...rtts)}, max ${Math.max(...rtts)})`);
  }

  const lp = HR ? new HrmsLoginPage(p1) : new LoginPage(p1);
  net1.reset();
  let t = Date.now();
  await (lp.goto ? lp.goto() : p1.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 * T }).catch(() => {}));
  // the login form is drawn by the app, so it is usable only after the runtime has downloaded and started
  const usable = await lp.companyInput.waitFor({ state: 'visible', timeout: 300000 }).then(() => Date.now() - t).catch(() => null);
  await net1.settle(900, 300000);
  const loginPage = { usableMs: usable, ms: Date.now() - t - 900, requests: net1.files.length, bytes: net1.files.reduce((s, f) => s + f.bytes, 0) };
  const loginFiles = net1.files.slice();
  net1.reset();
  t = Date.now();
  await lp.login(COMPANY, USER, PASS);
  const afterLogin = Date.now() - t;
  const homeContent = (await untilContent(p1, t, null, 40000 * T)).ms;
  await net1.settle(1000, 40000 * T);
  const homeReady = (net1.lastFinish || Date.now()) - t;
  const firstFiles = [...loginFiles, ...net1.files];
  const byType = {};
  for (const f of firstFiles) { const k = f.type; byType[k] = byType[k] || { n: 0, bytes: 0 }; byType[k].n++; byType[k].bytes += f.bytes; }
  const biggest = [...firstFiles].sort((a, b) => b.bytes - a.bytes).slice(0, 10).map((f) => ({ url: f.url, bytes: f.bytes, encoding: f.h['content-encoding'] || '' }));
  result.firstVisit = { loginPage, loginRedirectMs: afterLogin, homeContentMs: homeContent, homeReadyMs: homeReady,
    requests: firstFiles.length, bytes: firstFiles.reduce((s, f) => s + f.bytes, 0), byType, biggest };
  // assets: compression and caching
  const COMPRESSED = /\.(png|jpe?g|gif|webp|woff2?|mp4|webm|zip|gz|br|ico)(\?|$)/i;
  const flags = { uncompressed: [], noCaching: [] };
  for (const f of firstFiles) {
    if (['fetch', 'xhr', 'document'].includes(f.type)) continue;
    const enc = f.h['content-encoding'], cc = f.h['cache-control'] || '', validator = f.h.etag || f.h['last-modified'];
    if (f.bytes > 100 * 1024 && !enc && !COMPRESSED.test(f.url)) flags.uncompressed.push({ url: f.url, bytes: f.bytes });
    if (/no-store/i.test(cc) || (!cc && !validator)) flags.noCaching.push({ url: f.url, cc: cc || '(none)' });
  }
  result.assetFlags = flags;
  log(`first visit: login page ${sec(loginPage.ms)}; login → Home content ${sec(homeContent)}, data complete ${sec(homeReady)}; ${result.firstVisit.requests} files, ${kb(result.firstVisit.bytes)}`);
  log(`  not compressed (>100 KB): ${flags.uncompressed.length}; no caching headers: ${flags.noCaching.length}`);

  // ── menu: the live sidebar ─────────────────────────────────────────────────
  await p1.waitForTimeout(1000);
  const menu = await p1.evaluate(() => {
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
  if (!HR) for (const p of EXTRA) if (!seen.has(p)) { seen.add(p); routes.push({ path: p, text: '' }); }
  if (ONLY) routes = routes.filter((r) => ONLY.split(',').some((o) => o && r.path.includes(o)));
  log(`${routes.length} pages × (${DIRECT} direct + ${INAPP} in-app) runs`);
  const recs = new Map(routes.map((r) => [r.path, { ...r, direct: [], inapp: [] }]));
  const allCalls = [];

  // ── 3. direct loads ────────────────────────────────────────────────────────
  // a fresh context that reuses the login (storage state), so each load starts from a closed tab but a warm HTTP cache,
  // as a returning user's would
  const state = await ctx1.storageState();
  const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 900 }, storageState: state });
  await ctx2.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, longMs: 0 };
    const obs = (type, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch { /* unsupported */ } };
    obs('largest-contentful-paint', (e) => { window.__perf.lcp = e.renderTime || e.loadTime || e.startTime; });
    obs('layout-shift', (e) => { if (!e.hadRecentInput) window.__perf.cls += e.value; });
    obs('longtask', (e) => { window.__perf.longMs += Math.max(0, e.duration - 50); });
  });
  const p2 = await ctx2.newPage();
  const net2 = recorder(p2);
  await ctx1.close();
  // warm-up, not measured: puts the app runtime in this browser's cache, as it is for a returning user
  await p2.goto(BASE + '/home', { waitUntil: 'domcontentloaded', timeout: 60000 * T });
  await untilContent(p2, Date.now(), null, 30000); await net2.settle();
  await throttle(ctx2, p2);        // from here on every load runs on the slow link (the cache is already warm)

  const save = () => fs.writeFileSync(OUT + '.json', JSON.stringify(result, null, 2));
  const PACE = Number(arg('pace', 1200));       // pause between page loads, so the tenant's rate limit is not tripped
  const hit429 = () => net2.files.some((f) => f.status === 429);

  /** one direct load; returns the measurement (tainted = the tenant answered 429 during it) */
  async function measureDirect(r) {
    net2.reset();
    const t0 = Date.now();
    await p2.goto(BASE + r.path, { waitUntil: 'domcontentloaded', timeout: 60000 * T });
    if (await throttled(p2)) return { throttled: true, tainted: true };
    const uc = await untilContent(p2, t0, null);
    await net2.settle();
    const dom = await p2.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0] || {};
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, fcp: fcp && fcp.startTime,
        lcp: window.__perf.lcp, cls: window.__perf.cls, blockingMs: window.__perf.longMs,
        nodes: document.getElementsByTagName('*').length, heap: performance.memory ? performance.memory.usedJSHeapSize : null };
    });
    const calls = net2.calls.slice();
    const slow = calls.filter((c) => c.ms != null).sort((a, b) => b.ms - a.ms)[0];
    return { contentMs: uc.ms, spinnerStuck: uc.stuck, readyMs: (net2.lastFinish || Date.now()) - t0, stillLoading: net2.timedOut, ...dom,
      finalPath: new URL(p2.url()).pathname, requests: net2.files.length, bytes: net2.files.reduce((q, f) => q + f.bytes, 0),
      apiCalls: calls.length, apiBytes: calls.reduce((q, c) => q + c.bytes, 0),
      slowestApi: slow ? { ep: slow.ep, ms: round(slow.ms) } : null, failedCalls: calls.filter((c) => c.status >= 400).map((c) => `${c.status} ${c.ep}`),
      tainted: hit429(), _calls: calls };
  }

  /** one in-app click on the sidebar link */
  async function measureInapp(r) {
    net2.reset();
    const startPath = new URL(p2.url()).pathname;
    if (startPath.replace(/\/$/, '') === r.path.replace(/\/$/, '')) return { skipped: true };
    const blockBefore = await p2.evaluate(() => window.__perf.longMs).catch(() => 0);
    const t0 = Date.now();
    const how = await p2.evaluate((p) => {
      const hit = [...document.querySelectorAll('aside a[href], .app-sidebar a[href], .main-menu a[href]')]
        .find((a) => '/' + (a.getAttribute('href') || '').replace(/^\//, '').split('?')[0] === p);
      if (hit) { hit.click(); return 'click'; }
      if (window.Blazor && Blazor.navigateTo) { Blazor.navigateTo(p); return 'navigateTo'; }
      return null;
    }, r.path).catch(() => null);
    if (!how) return { error: 'no sidebar link' };
    if (await throttled(p2)) return { throttled: true, tainted: true };
    const uc = await untilContent(p2, t0, r.path, 20000 * T, startPath);
    await net2.settle();
    const s = await p2.evaluate((b) => ({ blocking: window.__perf.longMs - b, nodes: document.getElementsByTagName('*').length,
      heap: performance.memory ? performance.memory.usedJSHeapSize : null, path: location.pathname }), blockBefore).catch(() => ({}));
    const calls = net2.calls.slice();
    return { contentMs: uc.ms, spinnerStuck: uc.stuck, readyMs: (net2.lastFinish || Date.now()) - t0, stillLoading: net2.timedOut, how,
      blockingMs: round(s.blocking), nodes: s.nodes, heap: s.heap, apiCalls: calls.length, apiBytes: calls.reduce((q, c) => q + c.bytes, 0),
      failedCalls: calls.filter((c) => c.status >= 400).map((c) => `${c.status} ${c.ep}`), tainted: hit429(), _calls: calls };
  }

  /** run a measurement; if the tenant said 429, wait and repeat (twice at most) so the numbers are clean */
  async function clean(fn, r, bucket) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let m;
      try { m = await fn(r); } catch (e) { m = { error: String(e.message).split('\n')[0].slice(0, 120) }; }
      if (m.skipped) return;
      if (!m.tainted || attempt === 2) { if (!m.tainted && m._calls) allCalls.push(...m._calls); delete m._calls; bucket.push(m); return; }
      log(`  429 while loading ${r.path} — waiting 20 s and repeating`);
      await sleep(20000);
    }
  }

  for (const [i, r] of routes.entries()) {
    const rec = recs.get(r.path);
    for (let run = 0; run < DIRECT; run++) { await clean(measureDirect, r, rec.direct); await sleep(PACE); }
    const ok = rec.direct.filter((x) => x.contentMs != null && !x.tainted);
    log(`direct ${String(i + 1).padStart(3)}/${routes.length} ${r.path.padEnd(40)} data ${sec(median(ok.map((x) => x.readyMs)))}  content ${sec(median(ok.map((x) => x.contentMs)))}  LCP ${sec(median(ok.map((x) => x.lcp)))}`);
    save();
  }

  // ── 4. in-app navigation ───────────────────────────────────────────────────
  if (INAPP > 0) {
    await p2.goto(BASE + '/home', { waitUntil: 'domcontentloaded', timeout: 60000 * T });
    await untilContent(p2, Date.now(), null); await net2.settle();
    for (let run = 0; run < INAPP; run++) {
      const order = run % 2 ? [...routes].reverse() : routes;
      for (const r of order) {
        const rec = recs.get(r.path);
        const before = rec.inapp.length;
        await clean(measureInapp, r, rec.inapp);
        const m = rec.inapp[rec.inapp.length - 1];
        if (rec.inapp.length > before && m && m.heap && !m.tainted) result.heap.push({ n: result.heap.length + 1, mb: Math.round(m.heap / 1048576 * 10) / 10, path: r.path });
        if (m) delete m.heap;
        await sleep(PACE);
      }
      log(`in-app run ${run + 1}/${INAPP} done (${((Date.now() - started) / 60000).toFixed(1)} min in)`);
      save();
    }
  }

  // ── summarise ──────────────────────────────────────────────────────────────
  for (const rec of recs.values()) {
    const d = rec.direct.filter((x) => x.contentMs != null && !x.tainted), a = rec.inapp.filter((x) => x.contentMs != null && !x.tainted);
    const field = (arr, k) => median(arr.map((x) => x[k]));
    rec.summary = {
      directContentMs: round(field(d, 'contentMs')), directContentMax: round(Math.max(...d.map((x) => x.contentMs), 0)) || null,
      directReadyMs: round(field(d, 'readyMs')), fcpMs: round(field(d, 'fcp')), lcpMs: round(field(d, 'lcp')), cls: d.length ? Math.round(field(d, 'cls') * 1000) / 1000 : null,
      blockingMs: round(field(d, 'blockingMs')), nodes: round(field(d, 'nodes')), requests: round(field(d, 'requests')), kb: round(field(d, 'bytes') / 1024),
      apiCalls: round(field(d, 'apiCalls')), apiKb: round(field(d, 'apiBytes') / 1024), slowestApi: (d.sort((x, y) => (y.slowestApi?.ms || 0) - (x.slowestApi?.ms || 0))[0] || {}).slowestApi || null,
      inappContentMs: round(field(a, 'contentMs')), inappContentMax: round(Math.max(...a.map((x) => x.contentMs), 0)) || null,
      inappReadyMs: round(field(a, 'readyMs')), inappBlockingMs: round(field(a, 'blockingMs')),
      spinnerStuck: [...rec.direct, ...rec.inapp].filter((x) => x.spinnerStuck).length,
      stillLoading: [...rec.direct, ...rec.inapp].filter((x) => x.stillLoading).length,
      tainted: [...rec.direct, ...rec.inapp].filter((x) => x.tainted).length,
      runsOk: { direct: d.length, inapp: a.length }, throttled: [...rec.direct, ...rec.inapp].filter((x) => x.throttled).length,
      failedCalls: [...new Set([...rec.direct, ...rec.inapp].flatMap((x) => x.failedCalls || []))],
      errors: [...new Set([...rec.direct, ...rec.inapp].map((x) => x.error).filter(Boolean))],
      redirectedTo: [...new Set(d.map((x) => x.finalPath).filter((x) => x && x.replace(/\/$/, '') !== rec.path.replace(/\/$/, '')))],
    };
    // the verdict follows when the page's DATA has finished loading, not when its heading appears
    rec.verdict = { direct: verdict(rec.summary.directReadyMs, 'direct'), inapp: verdict(rec.summary.inappReadyMs, 'inapp') };
  }
  const byEp = {};
  for (const c of allCalls) { (byEp[c.ep] = byEp[c.ep] || []).push(c); }
  result.endpoints = Object.entries(byEp).map(([ep, cs]) => ({ ep, n: cs.length, medianMs: round(median(cs.map((c) => c.ms))), p95Ms: round(pct(cs.map((c) => c.ms), 0.95)),
    maxMs: round(Math.max(...cs.map((c) => c.ms || 0))), kb: round(median(cs.map((c) => c.bytes)) / 1024), errors: cs.filter((c) => c.status >= 400).length }))
    .sort((a, b) => (b.p95Ms || 0) - (a.p95Ms || 0));
  result.pages = [...recs.values()];
  result.durationMs = Date.now() - started;
  result.complete = true;
  const heaps = result.heap.map((h) => h.mb);
  result.heapGrowth = heaps.length > 10 ? { startMb: median(heaps.slice(0, 10)), endMb: median(heaps.slice(-10)), samples: heaps.length } : null;
  save();

  // compare with the previous complete run
  let prev = null;
  const sameKind = new RegExp(`^site-perf-${COMPANY}-\\d{4}-\\d\\d-\\d\\dT\\d\\d-\\d\\d${TAG.replace(/[-]/g, '\\-')}\\.json$`);
  const old = fs.readdirSync(RAW).filter((f) => sameKind.test(f) && !OUT.endsWith(f.replace('.json', ''))).sort().reverse();
  for (const f of old) { try { const j = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')); if (j.complete && !j.partial) { prev = { file: f, ...j }; break; } } catch { /* skip */ } }
  const worse = [], better = [];
  if (prev) {
    const pm = new Map(prev.pages.map((p) => [p.path, p.summary]));
    for (const p of result.pages) {
      const o = pm.get(p.path); if (!o) continue;
      for (const [k, label] of [['directReadyMs', 'direct'], ['inappReadyMs', 'in-app']]) {
        const a = p.summary[k], b = o[k]; if (a == null || b == null) continue;
        if (a - b > 1000 && a > b * 1.3) worse.push({ path: p.path, kind: label, was: b, now: a });
        if (b - a > 1000 && b > a * 1.3) better.push({ path: p.path, kind: label, was: b, now: a });
      }
    }
  }
  result.comparedWith = prev ? prev.file : null; result.worse = worse; result.better = better;
  save();

  // ── markdown ───────────────────────────────────────────────────────────────
  const ps = result.pages.filter((p) => p.summary.runsOk.direct || p.summary.runsOk.inapp);
  const rows = (arr, cols) => arr.map((r) => `| ${cols.map((c) => c(r)).join(' | ')} |`).join('\n');
  const slowDirect = [...ps].sort((a, b) => (b.summary.directReadyMs || 0) - (a.summary.directReadyMs || 0)).slice(0, 15);
  const slowInapp = [...ps].sort((a, b) => (b.summary.inappReadyMs || 0) - (a.summary.inappReadyMs || 0)).slice(0, 15);
  const heavy = [...ps].sort((a, b) => (b.summary.nodes || 0) - (a.summary.nodes || 0)).slice(0, 8);
  const count = (k, v) => ps.filter((p) => p.verdict[k] === v).length;
  const fv = result.firstVisit;
  let md = `# Performance check — ${COMPANY} · ${STAMP}${NET ? ' · ' + NET : ''}\n\n`;
  md += `**Target:** ${BASE} · **Pages:** ${ps.length} · **Runs per page:** ${DIRECT} direct, ${INAPP} in-app · **Took:** ${(result.durationMs / 60000).toFixed(1)} min · **Browser:** Chromium, one user · **Network:** ${NETLABEL}\n\n`;
  md += NET ? `Every page load and click ran on the emulated link above; the app files were already cached (a returning user), the first visit below was not.\n\n` : `Numbers include this machine's network. The server round trip for the index page was **${result.baseline.indexRoundTripMs.median} ms** (median of 5), so anything near that is network, not the app.\n\n`;
  md += `Verdicts: direct load (whole app boots) good ≤ ${LIMIT.direct.good / 1000} s, fair ≤ ${LIMIT.direct.fair / 1000} s; in-app click good ≤ ${LIMIT.inapp.good / 1000} s, fair ≤ ${LIMIT.inapp.fair / 1000} s; API call good ≤ ${LIMIT.api.good / 1000} s, fair ≤ ${LIMIT.api.fair / 1000} s. Verdicts follow **Data** = when the page's last call has finished (nothing left loading). "Content" = when the heading and layout appear, which can be well before the data. Direct loads start with the app runtime already cached (a returning user); the first visit below is the empty-cache cost.\n\n`;
  md += `## Summary\n\n| | good | fair | slow |\n|---|---|---|---|\n| Direct load | ${count('direct', 'good')} | ${count('direct', 'fair')} | ${count('direct', 'SLOW')} |\n| In-app click | ${count('inapp', 'good')} | ${count('inapp', 'fair')} | ${count('inapp', 'SLOW')} |\n\n`;
  md += `## First visit (empty cache)\n\n- Login page: form usable after **${sec(fv.loginPage.usableMs)}**, all files done after ${sec(fv.loginPage.ms)} (${fv.loginPage.requests} files, ${kb(fv.loginPage.bytes)})\n- Login → Home shows content: **${sec(fv.homeContentMs)}**; Home data complete: ${sec(fv.homeReadyMs)}\n- Downloaded: ${fv.requests} files, **${kb(fv.bytes)}** (${Object.entries(fv.byType).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 6).map(([k, v]) => `${k}: ${v.n} files, ${kb(v.bytes)}`).join('; ')})\n- Over 100 KB and not compressed: ${flags.uncompressed.length}${flags.uncompressed.length ? ' — ' + flags.uncompressed.slice(0, 5).map((f) => `${f.url} (${kb(f.bytes)})`).join(', ') : ''}\n- No caching headers: ${flags.noCaching.length}${flags.noCaching.length ? ' — ' + flags.noCaching.slice(0, 5).map((f) => f.url).join(', ') : ''}\n\nBiggest files:\n\n| File | Size | Encoding |\n|---|---|---|\n${rows(fv.biggest, [(f) => f.url, (f) => kb(f.bytes), (f) => f.encoding || 'none'])}\n\n`;
  md += `## Slowest pages — direct load\n\n| Page | Data | Content | LCP | Nodes | Files | KB | API calls | Slowest call | Verdict |\n|---|---|---|---|---|---|---|---|---|---|\n${rows(slowDirect, [(p) => p.path, (p) => sec(p.summary.directReadyMs), (p) => sec(p.summary.directContentMs), (p) => sec(p.summary.lcpMs), (p) => p.summary.nodes ?? '-', (p) => p.summary.requests ?? '-', (p) => p.summary.kb ?? '-', (p) => p.summary.apiCalls ?? '-', (p) => (p.summary.slowestApi ? `${p.summary.slowestApi.ep.replace(/^\w+ /, '')} ${sec(p.summary.slowestApi.ms)}` : '-'), (p) => p.verdict.direct])}\n\n`;
  md += `## Slowest pages — in-app click\n\n| Page | Data | Content | Blocked main thread | Verdict |\n|---|---|---|---|---|\n${rows(slowInapp, [(p) => p.path, (p) => sec(p.summary.inappReadyMs), (p) => sec(p.summary.inappContentMs), (p) => (p.summary.inappBlockingMs != null ? `${p.summary.inappBlockingMs} ms` : '-'), (p) => p.verdict.inapp])}\n\n`;
  md += `## Slowest API calls (by 95th percentile)\n\n| Endpoint | Calls | Median | p95 | Max | KB | Errors |\n|---|---|---|---|---|---|---|\n${rows(result.endpoints.slice(0, 20), [(e) => e.ep, (e) => e.n, (e) => sec(e.medianMs), (e) => sec(e.p95Ms), (e) => sec(e.maxMs), (e) => e.kb, (e) => e.errors])}\n\n`;
  md += `## Heaviest pages (DOM elements)\n\n| Page | Elements |\n|---|---|\n${rows(heavy, [(p) => p.path, (p) => p.summary.nodes])}\n\n`;
  if (result.heapGrowth) md += `## Memory over the in-app walk\n\nJS heap: ${result.heapGrowth.startMb} MB at the start → ${result.heapGrowth.endMb} MB after ${result.heapGrowth.samples} navigations (medians of the first and last 10).\n\n`;
  if (prev) md += `## Against the previous run (${prev.file})\n\n${worse.length ? `**Slower:**\n\n${worse.map((w) => `- ${w.path} (${w.kind}): ${sec(w.was)} → ${sec(w.now)}`).join('\n')}\n\n` : 'Nothing got slower by more than 1 s and 30%.\n\n'}${better.length ? `**Faster:**\n\n${better.map((w) => `- ${w.path} (${w.kind}): ${sec(w.was)} → ${sec(w.now)}`).join('\n')}\n\n` : ''}`;
  const trouble = result.pages.filter((p) => p.summary.errors.length || p.summary.failedCalls.length || p.summary.throttled || p.summary.tainted || p.summary.stillLoading || p.summary.spinnerStuck || (DIRECT && !p.summary.runsOk.direct));
  if (trouble.length) md += `## Pages with errors, failed calls or throttling during the run\n\n${trouble.map((p) => `- ${p.path}: ${[...p.summary.errors, ...p.summary.failedCalls.slice(0, 3), p.summary.tainted ? `${p.summary.tainted} run(s) answered 429 and were left out` : '', p.summary.stillLoading ? `${p.summary.stillLoading} run(s) still had a call running after 20 s` : '', p.summary.spinnerStuck ? `a spinner was still showing after the text appeared (${p.summary.spinnerStuck} run(s))` : '', (DIRECT && !p.summary.runsOk.direct) ? 'no content appeared in 25 s' : ''].filter(Boolean).join('; ')}`).join('\n')}\n\n`;
  if (NET) {
    // set the throttled numbers beside the latest normal-connection run
    const plain = new RegExp(`^site-perf-${COMPANY}-\\d{4}-\\d\\d-\\d\\dT\\d\\d-\\d\\d\\.json$`);
    let normal = null;
    for (const f of fs.readdirSync(RAW).filter((x) => plain.test(x)).sort().reverse()) { try { const j = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')); if (j.complete && !j.partial) { normal = { file: f, ...j }; break; } } catch { /* skip */ } }
    if (normal) {
      const nm = new Map(normal.pages.map((q) => [q.path, q.summary]));
      const pair = ps.map((q) => ({ path: q.path, d: q.summary.directReadyMs, dn: (nm.get(q.path) || {}).directReadyMs, i: q.summary.inappReadyMs, in: (nm.get(q.path) || {}).inappReadyMs }));
      const med = (arr) => median(arr.filter((x) => x != null));
      md += `## Slow 4G against a normal connection (${normal.file.replace('site-perf-' + COMPANY + '-', '').replace('.json', '')})\n\n`;
      md += `| | Normal | Slow 4G | Times slower |\n|---|---|---|---|\n`;
      const row = (label, a, b) => `| ${label} | ${sec(a)} | ${sec(b)} | ${a && b ? (b / a).toFixed(1) + '×' : '-'} |\n`;
      md += row('Direct load, data complete (median page)', med(pair.map((x) => x.dn)), med(pair.map((x) => x.d)));
      md += row('Sidebar click, data complete (median page)', med(pair.map((x) => x.in)), med(pair.map((x) => x.i)));
      if (normal.firstVisit && fv.loginPage.usableMs) md += row('First visit: login form usable', normal.firstVisit.loginPage.ms, fv.loginPage.usableMs);
      if (normal.firstVisit) md += row('First visit: Home content after login', normal.firstVisit.homeContentMs, fv.homeContentMs);
      md += `\nThe ten pages that gain the most on the slow link:\n\n| Page | Normal | Slow 4G | Added |\n|---|---|---|---|\n`;
      md += rows(pair.filter((x) => x.d != null && x.dn != null).sort((a, b) => (b.d - b.dn) - (a.d - a.dn)).slice(0, 10), [(x) => x.path, (x) => sec(x.dn), (x) => sec(x.d), (x) => '+' + sec(x.d - x.dn)]) + '\n\n';
    }
  }
  md += `## Every page\n\n| Page | Direct data | Direct content | FCP | LCP | In-app data | Verdict (direct / in-app) |\n|---|---|---|---|---|---|---|\n${rows(ps, [(p) => p.path, (p) => sec(p.summary.directReadyMs), (p) => sec(p.summary.directContentMs), (p) => sec(p.summary.fcpMs), (p) => sec(p.summary.lcpMs), (p) => sec(p.summary.inappReadyMs), (p) => `${p.verdict.direct} / ${p.verdict.inapp}`])}\n`;
  fs.writeFileSync(OUT + '.md', md);

  console.log(`\nDone in ${(result.durationMs / 60000).toFixed(1)} min`);
  console.log(`  direct:  ${count('direct', 'good')} good · ${count('direct', 'fair')} fair · ${count('direct', 'SLOW')} slow`);
  console.log(`  in-app:  ${count('inapp', 'good')} good · ${count('inapp', 'fair')} fair · ${count('inapp', 'SLOW')} slow`);
  console.log(`  report:  ${path.relative(process.cwd(), OUT)}.md`);
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
