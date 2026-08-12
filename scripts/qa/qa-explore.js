'use strict';
/**
 * QA exploration prober — the data-gathering half of the /qa-* skills.
 *
 * Walks every page of a module and records what a tester would look at:
 * did it load, did the browser throw, did any request fail, what controls
 * are on screen, and has any of that drifted from the recorded baseline.
 *
 * It gathers evidence. It does not decide what counts as a bug — that
 * judgement belongs to the skill reading this output, because "0 rows" is
 * fine on a fresh tenant and alarming on a seeded one, and only a reader
 * with context can tell those apart.
 *
 * SAFETY — this runs against a live tenant with an admin login:
 *   · Only interactions on the SAFE_ACTIONS allowlist are performed.
 *   · Never clicks Save, Submit, Update, Delete, Remove, or Export.
 *   · Never fills a form it then submits.
 *   · Refuses to run against a host that looks like production.
 * Anything that would persist a change is out of scope by construction —
 * a QA sweep that mutates the tenant destroys the next sweep's baseline.
 *
 * Usage:
 *   node scripts/qa/qa-explore.js --module crm
 *   node scripts/qa/qa-explore.js --module task
 *   node scripts/qa/qa-explore.js --module hrms
 *   node scripts/qa/qa-explore.js --module crm --routes /leads,/followups
 *   node scripts/qa/qa-explore.js --module hrms --group leave
 *   node scripts/qa/qa-explore.js --module crm --headed      # watch it work
 *
 * Output:
 *   reports/qa/raw/<module>-<timestamp>.json   — findings, one entry per page
 *   reports/qa/shots/<module>/<route>.png      — full-page screenshot each
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const REPO = path.join(__dirname, '..', '..');

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const MODULE = (arg('module') || 'crm').toLowerCase();
const ONLY_GROUP = arg('group');
const ONLY_ROUTES = arg('routes');
const NAV_GROUP = arg('nav-group');   // e.g. --nav-group CRM
const HEADED = flag('headed') || !!process.env.HEADED;

/**
 * Pull routes straight from the last discovery crawl instead of a hardcoded
 * list. Tenants genuinely differ — dev.erp.progbiz.in exposes 12 CRM routes
 * where devtest.progbiz.in exposes 20 — so a baked-in list silently tests the
 * wrong set. Refresh with: node scripts/discover_modules.js
 */
function routesFromDiscovery(groupName) {
  const p = path.join(REPO, 'scripts', 'discovery_report.json');
  if (!fs.existsSync(p)) {
    console.error(`\n✋ ${path.relative(REPO, p)} not found.\n   Run: node scripts/discover_modules.js\n`);
    process.exit(2);
  }
  const rep = JSON.parse(fs.readFileSync(p, 'utf8'));
  const want = String(groupName).toLowerCase();
  const hits = (rep.nav || []).filter((n) => String(n.group || '').toLowerCase() === want);
  if (!hits.length) {
    const groups = [...new Set((rep.nav || []).map((n) => n.group).filter(Boolean))];
    console.error(`\n✋ No nav group "${groupName}". Available:\n   ${groups.join(' · ')}\n`);
    process.exit(2);
  }
  return hits.map((n) => ({ route: n.path, baseline: null, navLabel: n.text }));
}

// ── Guard: never point this at production ───────────────────────────────────
const PROD_MARKERS = [/^https?:\/\/(www\.)?erp\.progbiz\.in/i, /prod/i, /live/i];
function assertNotProduction(url) {
  if (PROD_MARKERS.some((re) => re.test(url))) {
    console.error(
      `\n✋ Refusing to run against "${url}" — it looks like production.\n` +
      `   This prober clicks around a live app with an admin session. Point it at\n` +
      `   a test tenant (devtest / erptest / hrms-erp) via BASE_URL in .env.\n`
    );
    process.exit(2);
  }
}

// ── Module definitions ──────────────────────────────────────────────────────
// CRM/Task run on the ERP host; HRMS is a separate tenant with its own login.
const CRM_ROUTES = [
  '/home', '/crm-dashboard', '/leads', '/followups', '/enquiry', '/enquiries',
  '/quotation', '/quotations', '/lead-sources', '/lead-status',
  '/bulk-lead-transfer', '/dealers', '/customers', '/solar-orders',
  '/add-multiple-lead-tasks', '/lead-expenses', '/lead-source-commissions',
  '/sales-targets', '/call-analysis', '/enquiry-upload',
];

const TASK_ROUTES = [
  '/task', '/my-tasks', '/delegated-tasks', '/created-tasks',
  '/unscheduled-tasks', '/todo-list', '/daily-activity-report',
  '/task-dashboard', '/predefined-task-add', '/calendar',
  '/redirect/task-timeline',
];

function hrmsRoutes() {
  // The HRMS manifest is generated from a real crawl and carries the baseline
  // (title, buttons, columns) we diff against, so it is both route list and
  // expectation source.
  const manifest = require(path.join(REPO, 'hrms', 'fixtures', 'page-manifest.js'));
  const rows = ONLY_GROUP ? manifest.filter((m) => m.group === ONLY_GROUP) : manifest;
  return rows.map((m) => ({ route: `/${m.route}`.replace(/^\/+/, '/'), baseline: m }));
}

function moduleSpec() {
  if (MODULE === 'hrms') {
    return {
      base: process.env.HRMS_BASE_URL || 'https://hrms-erp.progbiz.in',
      pages: hrmsRoutes(),
      login: 'hrms',
    };
  }
  const base = process.env.BASE_URL || 'https://devtest.progbiz.in';
  if (NAV_GROUP) return { base, pages: routesFromDiscovery(NAV_GROUP), login: 'erp' };
  const list = MODULE === 'task' ? TASK_ROUTES : CRM_ROUTES;
  return { base, pages: list.map((r) => ({ route: r, baseline: null })), login: 'erp' };
}

// ── Safe interactions ───────────────────────────────────────────────────────
// An allowlist, not a denylist. A denylist fails open: one unrecognised
// button label and the prober starts saving records on a live tenant.
const SAFE_ACTIONS = [
  {
    name: 'open-filter-panel',
    // Filter panels are pure UI state — opening one persists nothing.
    open: '#btn-toggle-filter, button:has-text("Filter")',
    close: '#btn-close-filter-x, .offcanvas .btn-close, .modal .btn-close',
    expect: 'a filter panel becomes visible',
  },
  {
    name: 'open-create-modal',
    // Opening a create form is safe; we never fill or submit it.
    open: 'button:has-text("Add New"), a:has-text("Add New"), button:has-text("Create New")',
    close: '.modal.show .btn-close, .modal.show button:has-text("Close")',
    expect: 'a create modal opens and closes cleanly',
  },
];

// ── Secret redaction ────────────────────────────────────────────────────────
// The app puts the session JWT in WebSocket query strings, so raw console text
// and request URLs carry a live admin token. These reports get read, pasted
// into tickets and shared, so strip credentials before anything hits disk.
const SECRET_PATTERNS = [
  [/([?&](?:access_token|token|auth|api_key|apikey|key|password|pwd)=)[^&\s"']+/gi, '$1<REDACTED>'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.?[A-Za-z0-9_-]*/g, '<JWT-REDACTED>'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}=*/gi, '$1 <REDACTED>'],
];
const redact = (s) =>
  SECRET_PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), String(s || ''));

// ── Console noise ───────────────────────────────────────────────────────────
// Errors that fire on every page regardless of health. Left unfiltered they
// flag all ~110 pages as suspicious, which trains the reader to ignore the
// column — the classic way a QA signal becomes worthless. Counted separately
// so a genuine spike is still visible.
const CONSOLE_NOISE = [
  /websocket connection to .*notificationhub/i,
  /favicon\.ico/i,
  /\bERR_(BLOCKED_BY_CLIENT|CONNECTION_REFUSED)\b.*(analytics|gtag|hotjar)/i,
];
const isNoise = (text) => CONSOLE_NOISE.some((re) => re.test(text));

// ── Per-page probe ──────────────────────────────────────────────────────────
async function probePage(page, spec, entry) {
  const { route, baseline } = entry;
  const url = `${spec.base}${route}`;
  const consoleErrors = [];
  const noisyErrors = [];
  const failedRequests = [];

  const onConsole = (m) => {
    if (m.type() !== 'error') return;
    const text = redact(m.text().replace(/\s+/g, ' ')).slice(0, 300);
    (isNoise(text) ? noisyErrors : consoleErrors).push(text);
  };
  const onResponse = (r) => {
    const s = r.status();
    if (s >= 400) failedRequests.push({ status: s, url: redact(r.url()).slice(0, 200) });
  };
  page.on('console', onConsole);
  page.on('response', onResponse);

  const finding = { route, url, checkedAt: new Date().toISOString() };

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
    finding.httpStatus = resp ? resp.status() : null;
    await page.waitForTimeout(3500); // these are SPA pages; give them a beat

    finding.landedOn = page.url().replace(spec.base, '');
    finding.bouncedToLogin = /\/login/i.test(finding.landedOn);

    if (!finding.bouncedToLogin) {
      Object.assign(finding, await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const vis = (e) => e.getClientRects().length > 0;

        const tables = [...document.querySelectorAll('table')].map((t) => ({
          columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean),
          rowCount: t.querySelectorAll('tbody tr').length,
        })).filter((t) => t.columns.length);

        const bodyText = clean(document.body.innerText);

        return {
          title: clean(document.title),
          heading: clean(document.querySelector('h1,h2,.page-title,.breadcrumb')?.innerText).slice(0, 120),
          buttons: [...new Set([...document.querySelectorAll('button, a.btn')]
            .filter(vis).map((b) => clean(b.innerText)).filter((t) => t && t.length < 40))],
          tables,
          inputCount: [...document.querySelectorAll('input,select,textarea')].filter(vis).length,
          // Signals a tester would eyeball immediately:
          stuckLoading: /\bloading\.\.\.|please wait\b/i.test(bodyText),
          errorText: /(oops|something went wrong|error code|unhandled|exception|not found|sorry, there's nothing)/i
            .exec(bodyText)?.[0] || null,
          emptyState: /(no records|no data|nothing found|no result)/i.test(bodyText),
          brokenImages: [...document.querySelectorAll('img')]
            .filter((i) => i.complete && i.naturalWidth === 0)
            .map((i) => (i.getAttribute('src') || '').slice(0, 120)),
          bodyChars: bodyText.length,
        };
      }));

      // ── Baseline drift (HRMS only — it is the module with a recorded one) ──
      if (baseline) {
        const liveCols = (finding.tables[0] && finding.tables[0].columns) || [];
        const baseCols = baseline.columns || [];
        finding.drift = {
          titleExpected: baseline.title,
          titleMatches: !baseline.title || (finding.heading || '').includes(baseline.title)
            || (finding.title || '').includes(baseline.title),
          columnsAdded: liveCols.filter((c) => !baseCols.includes(c)),
          columnsRemoved: baseCols.filter((c) => !liveCols.includes(c)),
          buttonsMissing: (baseline.buttons || []).filter(
            (b) => !finding.buttons.some((x) => x.toLowerCase() === b.toLowerCase())
          ),
        };
        if (baseline.quirk) finding.knownQuirk = baseline.quirk;
      }

      // ── Safe interactions ──────────────────────────────────────────────
      finding.interactions = [];
      for (const act of SAFE_ACTIONS) {
        const opener = page.locator(act.open).first();
        if (!(await opener.count().catch(() => 0))) continue;
        if (!(await opener.isVisible().catch(() => false))) continue;

        const before = await page.locator('.modal.show, .offcanvas.show').count().catch(() => 0);
        await opener.click({ timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(1200);
        const after = await page.locator('.modal.show, .offcanvas.show').count().catch(() => 0);

        finding.interactions.push({
          action: act.name,
          expected: act.expect,
          opened: after > before,
          panelsVisible: after,
        });

        // Always close what we opened — a left-open modal poisons the next page.
        await page.locator(act.close).first().click({ timeout: 4000 }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(600);
      }
    }

    const shot = path.join(REPO, 'reports', 'qa', 'shots', MODULE, `${route.replace(/\W+/g, '_')}.png`);
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    finding.screenshot = path.relative(REPO, shot);
  } catch (e) {
    finding.proberError = e.message.split('\n')[0].slice(0, 200);
  } finally {
    page.off('console', onConsole);
    page.off('response', onResponse);
  }

  finding.consoleErrors = consoleErrors.slice(0, 15);
  finding.noisyErrorCount = noisyErrors.length;   // known-benign, counted not listed
  finding.failedRequests = failedRequests.slice(0, 15);
  return finding;
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  const spec = moduleSpec();
  assertNotProduction(spec.base);

  console.log(`\n🔎 QA sweep — module "${MODULE}" on ${spec.base}`);
  let pages = spec.pages;
  if (ONLY_ROUTES) {
    const want = ONLY_ROUTES.split(',').map((s) => s.trim());
    pages = pages.filter((p) => want.includes(p.route));
  }
  console.log(`   ${pages.length} page(s) to check\n`);

  const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 150 : 0 });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const findings = [];

  try {
    // Login once, reuse the session for every page.
    if (spec.login === 'hrms') {
      const { HrmsLoginPage } = require(path.join(REPO, 'hrms', 'pages', 'HrmsLoginPage'));
      await new HrmsLoginPage(page).login();
    } else {
      const { LoginPage } = require(path.join(REPO, 'erp', 'common', 'LoginPage'));
      await new LoginPage(page).login(
        process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD
      );
    }
    await page.waitForTimeout(2000);

    for (const [i, entry] of pages.entries()) {
      process.stdout.write(`  [${String(i + 1).padStart(3)}/${pages.length}] ${entry.route.padEnd(34)}`);
      const f = await probePage(page, spec, entry);
      findings.push(f);

      const flags = [];
      if (f.bouncedToLogin) flags.push('BOUNCED-TO-LOGIN');
      if (f.httpStatus >= 400) flags.push(`HTTP-${f.httpStatus}`);
      if (f.errorText) flags.push('ERROR-TEXT');
      if (f.stuckLoading) flags.push('STUCK-LOADING');
      if (f.consoleErrors.length) flags.push(`JS-ERR×${f.consoleErrors.length}`);
      if (f.failedRequests.length) flags.push(`REQ-FAIL×${f.failedRequests.length}`);
      if (f.brokenImages && f.brokenImages.length) flags.push(`IMG×${f.brokenImages.length}`);
      const d = f.drift;
      if (d && (d.columnsRemoved.length || d.buttonsMissing.length || !d.titleMatches)) flags.push('DRIFT');
      console.log(flags.length ? ` ⚠️  ${flags.join(' ')}` : ' ok');
    }
  } catch (e) {
    console.error('\nFATAL:', e.message);
  } finally {
    await browser.close();
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(REPO, 'reports', 'qa', 'raw', `${MODULE}-${stamp}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({
    module: MODULE, base: spec.base, capturedAt: new Date().toISOString(),
    pageCount: findings.length, findings,
  }, null, 2));

  const suspicious = findings.filter((f) =>
    f.bouncedToLogin || f.httpStatus >= 400 || f.errorText || f.stuckLoading ||
    f.consoleErrors.length || f.failedRequests.length || f.proberError ||
    (f.drift && (f.drift.columnsRemoved.length || f.drift.buttonsMissing.length || !f.drift.titleMatches))
  );
  console.log(`\n✅ ${findings.length} pages checked · ${suspicious.length} need a look`);
  console.log(`   raw findings → ${path.relative(REPO, out)}`);
  console.log(`   screenshots  → reports/qa/shots/${MODULE}/\n`);
})();
