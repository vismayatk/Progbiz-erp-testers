'use strict';

/**
 * Page-coverage suite — one reusable generator for "does this page still look and behave like it did?"
 *
 * Reads erp/common/fixtures/pages.<COMPANY_CODE>.json (built by scripts/qa/make_page_manifest.js,
 * reviewed by a person) and, for each page picked by the caller, defines two tests:
 *
 *   PAGE | <title> (<path>)        opens, shows its heading / tabs / table columns / buttons / filter
 *                                  controls, every tab switches without an error, no script error,
 *                                  no failed app call, no Access Denied or "not found"
 *   FORM | <title> › <opener>      the Add / New form opens (modal or page) with its fields, the
 *                                  required ones still marked required, and is closed WITHOUT saving
 *   LIST | <title> (<path>)        pages with a search box: nonsense finds nothing, clearing brings the
 *                                  rows back, page 2 shows other rows
 *   FILTER | <title> (<path>)      pages with a date range: every range (Today … Previous Year) draws
 *
 * Both are read-only: the suite fails if the page sends a write request (save / create / update /
 * delete / send / upload …). It logs in once for the file and shares the session, because the tenant
 * throttles bursts ("Too many requests").
 *
 * A page entry may carry hand-written keys: known (a tracked defect, kept as its own expected-fail
 * test), noForm (don't open the Add form), permission (an Access Denied wall is the expected
 * screen), skip (reason), optionalButtons (buttons in `buttons` that only show for some data, e.g.
 * a "Show all" that appears once a table is long enough to be cut short).
 *
 *   definePageSuite('Master pages', (e) => ['Master', 'Users'].includes(e.group));
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('./LoginPage');
const { dismissRateLimit } = require('./helpers');

const BASE = process.env.BASE_URL || 'https://test.erp.progbiz.in';
const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const WRITE_VERB = /\/(save|add|create|insert|update|edit|delete|remove|send|submit|upload|import|approve|reject|transfer|convert|assign|post|publish|sync|reset|change-password)[\w-]*(\/|\?|$)/i;
const ERROR_TEXT = /oops|something went wrong|error code|unhandled error|exception|nothing at this address|page not found/i;
const NETWORK_NOISE = /net::ERR_(NETWORK_CHANGED|INTERNET_DISCONNECTED|CONNECTION_|TIMED_OUT|NAME_NOT_RESOLVED|ABORTED)/;

const clean = (s) => String(s ?? '').replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const noCount = (s) => String(s ?? '').replace(/\s*[([]?\s*\d[\d,]*\s*[)\]]?\s*$/, '').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function loadManifest() {
  const file = path.join(__dirname, 'fixtures', `pages.${C.company}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/** What the page shows right now (visible things only; sidebar and header excluded). */
function readPage() {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const outside = (e) => !e.closest('aside, .app-sidebar, .side-menu, header, .app-header, .main-header, .switcher-wrapper, #switcher-canvas');
  const main = document.querySelector('main, .main-content, .page-content, .content-wrapper') || document.body;
  const all = (sel) => [...main.querySelectorAll(sel)].filter(vis).filter(outside);
  return {
    path: location.pathname,
    body: t(main.innerText).slice(0, 6000),
    headings: all('h1, h2, h3, h4, h5, .page-title, .card-title').map((e) => t(e.textContent)).filter(Boolean),
    tabs: all('[role="tab"], .nav-tabs .nav-link, .nav-pills .nav-link').map((e) => t(e.textContent)).filter(Boolean),
    buttons: all('button, a.btn, [role="button"]').map((e) => t(e.innerText || e.getAttribute('title') || e.getAttribute('aria-label'))).filter(Boolean),
    columns: all('th').map((e) => t(e.textContent)).filter(Boolean),
    labels: all('label').map((e) => t(e.textContent)).filter(Boolean),
    // every label / placeholder in the markup, visible or not (filters can sit in a collapsed panel)
    // (filter panels are off-canvas drawers outside <main>, so look at the whole document)
    labelsInDom: [...document.querySelectorAll('label')].filter(outside).map((e) => t(e.textContent))
      .concat([...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(outside).map((e) => t(e.placeholder))).filter(Boolean),
    ids: [...document.querySelectorAll('[id]')].filter(outside).map((e) => e.id),
    visibleIds: all('[id]').map((e) => e.id),
    tables: all('table').length,
    rows: all('table tbody tr').length,
  };
}

const found = (list, want, loose = false) => {
  const w = clean(noCount(want));
  return list.some((x) => { const c = clean(noCount(x)); return loose ? c.includes(w) : c === w || c.startsWith(w); });
};

function definePageSuite(title, select) {
  const manifest = loadManifest();
  const pages = manifest ? manifest.pages.filter(select) : [];

  test.describe(title, () => {
    test.describe.configure({ timeout: 150_000 });
    test.skip(!manifest, `no erp/common/fixtures/pages.${C.company}.json for tenant ${C.company} (node scripts/qa/make_page_manifest.js)`);

    /** @type {import('@playwright/test').Page} */
    let page;
    let menuHrefs = [];
    let consoleErrs = [], badCalls = [], writes = [];

    test.beforeAll(async ({ browser }) => {
      if (!manifest) return;
      page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });
      page.on('pageerror', (e) => consoleErrs.push(`pageerror: ${String(e.message).slice(0, 200)}`));
      page.on('response', (r) => {
        const u = r.url();
        if (u.startsWith(BASE) && r.status() >= 400 && /\/api\//.test(u)) badCalls.push(`${r.status()} ${u.replace(BASE, '').slice(0, 120)}`);
      });
      page.on('request', (r) => {
        const u = r.url();
        if (u.startsWith(BASE) && !['GET', 'HEAD', 'OPTIONS'].includes(r.method()) && /\/api\//.test(u) && WRITE_VERB.test(u.replace(BASE, ''))) writes.push(`${r.method()} ${u.replace(BASE, '').slice(0, 120)}`);
      });
      const lp = new LoginPage(page);
      await lp.goto();
      await lp.login(C.company, C.username, C.password);
      await page.waitForTimeout(1500);
      menuHrefs = await page.evaluate(() => [...document.querySelectorAll('aside a[href], .app-sidebar a[href]')].map((a) => a.getAttribute('href') || ''));
    });
    test.afterAll(async () => { await page?.close(); });

    /** Replace {module} with the id the sidebar links use for this tenant's project type. */
    function resolve(route) {
      if (!route.includes('{module}')) return route;
      const prefix = route.split('{module}')[0].replace(/^\//, '').replace(/\/?$/, '');
      const href = menuHrefs.find((h) => h.replace(/^\//, '').startsWith(prefix) && GUID.test(h));
      test.skip(!href, `no sidebar link under /${prefix} to take the project module id from`);
      return '/' + href.replace(/^\//, '').split('?')[0];
    }

    /** Open a route and wait until it has drawn something (a heading, or the body is no longer empty). */
    async function visit(url, e) {
      consoleErrs = []; badCalls = []; writes = [];
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (await dismissRateLimit(page)) {
        await page.waitForTimeout(15000);
        await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      const first = e.heading && e.heading[0];
      if (first) {
        await expect.poll(async () => { const r = await page.evaluate(readPage); return clean(r.headings.join(' ') + ' ' + r.body).includes(clean(first)); },
          { timeout: 15000 }).toBe(true).catch(() => {});
      }
      await page.waitForTimeout(1200);
      return page.evaluate(readPage);
    }

    /** Click the page's Add / New button and wait for its form (modal drawer, or the next page). */
    async function clickOpener(e) {
      const opener = page.locator('main button, main a, .main-content button, .main-content a')
        .filter({ hasText: new RegExp(`^\\s*\\+?\\s*${esc(e.form.opener)}\\s*\\+?\\s*$`, 'i') }).filter({ visible: true }).first();
      await expect(opener, `"${e.form.opener}" button`).toBeVisible({ timeout: 10000 });
      const listUrl = page.url();
      await opener.click();
      let scope;
      if (e.form.kind === 'modal') {
        scope = page.locator('.modal.show, .offcanvas.show').last();
        await expect(scope, 'modal did not open').toBeVisible({ timeout: 10000 });
      } else {
        await page.waitForFunction((u) => location.href !== u, listUrl, { timeout: 15000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        scope = page.locator('main, .main-content, body').first();
      }
      await page.waitForTimeout(1500);
      return { scope, listUrl };
    }

    /** Console errors and failed calls that are not tracked defects or network noise. */
    function problems(e) {
      const known = (e.known || []);
      const allowed = (text, key) => known.some((k) => k[key] && new RegExp(k[key], 'i').test(text));
      return {
        console: consoleErrs.filter((m) => !NETWORK_NOISE.test(m) && !allowed(m, 'console')),
        calls: badCalls.filter((m) => !allowed(m, 'call')),
      };
    }

    for (const e of pages) {
      const tag = e.title || e.path;

      test(`PAGE | ${tag} (${e.path}) opens with its expected structure`, async () => {
        test.skip(!!e.skip, e.skip);
        const url = resolve(e.path);
        const s = await visit(url, e);

        // 1. it is the page we asked for, and it is not an error or permission wall
        const wantPath = (e.finalPath || e.path).replace('{module}', '');
        expect.soft(s.path.replace(GUID, ''), `landed on ${s.path}`).toContain(wantPath.replace(GUID, '').replace(/\/$/, '') || '/');
        expect.soft(/\/login/i.test(s.path), 'bounced to /login').toBe(false);
        if (!e.permission) expect.soft(/access denied|don'?t have permission/i.test(s.body), 'page shows Access Denied').toBe(false);
        expect.soft(ERROR_TEXT.test(s.body), `error text on page: "${(s.body.match(ERROR_TEXT) || [''])[0]}"`).toBe(false);
        expect.soft(s.body.length, 'page rendered (almost) nothing').toBeGreaterThan(40);

        // 2. what the page offers
        const missing = (label, want, list, loose) => want.filter((w) => !found(list, w, loose)).map((w) => `${label} "${w}"`);
        const lost = [
          ...missing('heading', e.heading || [], s.headings.concat(s.body), true),
          ...missing('tab', e.tabs || [], s.tabs),
          ...missing('column', e.columns || [], s.columns),
          ...missing('button', (e.buttons || []).filter((b) => !(e.optionalButtons || []).includes(b)), s.buttons, true),
          ...(e.controls || []).filter((c) => (c.id ? !s.ids.includes(c.id) : !found(s.labelsInDom.concat(s.labels, s.body), c.label, true))).map((c) => `control "${c.id || c.label}"`),
        ];
        expect.soft(lost, `${lost.length} expected element(s) missing — the page changed (see /qa-changes)`).toEqual([]);

        // 3. every tab opens without an error and shows something (rows or an empty message)
        for (const tab of e.tabs || []) {
          const el = page.locator('[role="tab"], .nav-tabs .nav-link, .nav-pills .nav-link').filter({ hasText: new RegExp(`^\\s*${esc(noCount(tab))}`, 'i') }).first();
          if (!(await el.count())) continue;
          const before = consoleErrs.length;
          await el.click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(1500);
          const t = await page.evaluate(readPage);
          expect.soft(ERROR_TEXT.test(t.body), `tab "${tab}" shows an error`).toBe(false);
          expect.soft(t.rows > 0 || t.body.length > 120, `tab "${tab}" is blank`).toBe(true);
          const fresh = consoleErrs.slice(before).filter((m) => !NETWORK_NOISE.test(m));
          expect.soft(fresh, `tab "${tab}" raised script errors`).toEqual([]);
        }

        // 4. health: no script error, no failed app call, nothing written
        const p = problems(e);
        expect.soft(p.console, 'script errors on this page').toEqual([]);
        expect.soft(p.calls, 'failed app API calls on this page').toEqual([]);
        expect.soft(writes, 'a read-only page test sent a write request').toEqual([]);
      });

      // a list with a search box: nonsense finds nothing, clearing brings the rows back, paging works
      if (e.filters && e.filters.search && (e.columns || []).length) {
        test(`LIST | ${tag} (${e.path}) search and paging work`, async () => {
          test.skip(!!e.skip, e.skip);
          await visit(resolve(e.path), e);
          const box = e.filters.search.id ? page.locator(`#${e.filters.search.id}`).first()
            : page.getByPlaceholder(e.filters.search.placeholder || /search/i).first();
          test.skip(!(await box.isVisible().catch(() => false)), 'the search box is inside a collapsed filter panel');
          const rows = () => page.locator('table tbody tr').filter({ visible: true }).count();
          const bodyRows = async () => (await page.locator('table tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
          const before = await rows();
          const firstBefore = (await bodyRows())[0];
          // 1. nothing matches nonsense
          // searches in this app run on Enter, not as you type
          await box.fill(`zz_no_match_${Date.now()}`);
          await box.press('Enter');
          await page.waitForTimeout(2500);
          const after = await bodyRows();
          expect.soft(after.filter((r) => r && !/^no\b|nothing|empty|not found/i.test(r)).length, 'rows still listed for a search that matches nothing').toBe(0);
          expect.soft(ERROR_TEXT.test((await page.evaluate(readPage)).body), 'error after searching').toBe(false);
          // 2. clearing restores the list
          await box.fill('');
          await box.press('Enter');
          await page.waitForTimeout(2500);
          expect.soft(await rows(), 'list did not come back after clearing the search').toBeGreaterThanOrEqual(Math.min(before, 1));
          // 3. paging: page 2 shows different rows and no error
          const next = page.locator('.pagination a, .pagination button, [class*="pagination"] a, [class*="pagination"] button').filter({ hasText: /^\s*2\s*$/ }).first();
          if (before >= 10 && (await next.count())) {
            await next.click();
            await page.waitForTimeout(2000);
            const p2 = (await bodyRows())[0];
            expect.soft(p2 && p2 !== firstBefore, 'page 2 shows the same first row as page 1').toBe(true);
            expect.soft(ERROR_TEXT.test((await page.evaluate(readPage)).body), 'error on page 2').toBe(false);
          }
          expect.soft(problems(e).console, 'script errors while searching / paging').toEqual([]);
          expect.soft(writes, 'searching sent a write request').toEqual([]);
        });
      }

      // a dashboard with a date range: every range draws without an error
      if (e.filters && e.filters.dateRange) {
        test(`FILTER | ${tag} (${e.path}) every date range loads`, async () => {
          test.skip(!!e.skip, e.skip);
          await visit(resolve(e.path), e);
          const sel = page.locator('select').filter({ has: page.locator('option', { hasText: /^This Month$/ }) }).first();
          test.skip(!(await sel.isVisible().catch(() => false)), 'the date-range dropdown is inside a collapsed filter panel');
          const labels = (await sel.locator('option').allTextContents()).map((x) => x.trim()).filter((x) => /^(today|yesterday|this week|this month|this year|previous month|previous year)$/i.test(x));
          expect(labels.length, 'date-range options').toBeGreaterThan(1);
          for (const label of labels) {
            const errBefore = consoleErrs.length;
            await sel.selectOption({ label });
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(1500);
            const s = await page.evaluate(readPage);
            expect.soft(ERROR_TEXT.test(s.body), `error text with range "${label}"`).toBe(false);
            expect.soft(s.tables > 0 || s.body.length > 200, `page is blank with range "${label}"`).toBe(true);
            expect.soft(consoleErrs.slice(errBefore).filter((m) => !NETWORK_NOISE.test(m)), `script errors with range "${label}"`).toEqual([]);
          }
          expect.soft(writes, 'changing the range sent a write request').toEqual([]);
        });
      }

      if (e.form && !e.noForm) {
        test(`FORM | ${tag} › ${e.form.opener} opens with its fields, nothing saved`, async () => {
          test.skip(!!e.skip, e.skip);
          const url = resolve(e.path);
          const s = await visit(url, e);
          expect(ERROR_TEXT.test(s.body), 'the list page itself shows an error').toBe(false);

          const { scope } = await clickOpener(e);

          const form = await scope.evaluate((root) => {
            const vis = (n) => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length);
            const t = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const group = (n) => n.closest('.form-group, .form-check, .form-switch, [class*="col-"], .mb-3, td, li');
            const labelOf = (n) => { const f = n.id && document.querySelector(`label[for="${CSS.escape(n.id)}"]`); const g = group(n); const l = f || (g && g.querySelector('label')); return l ? t(l.textContent) : ''; };
            return {
              text: t(root.innerText),
              fields: [...root.querySelectorAll('input, select, textarea')].filter((n) => !['hidden'].includes(n.type)).map((n) => ({
                id: n.id || '', visible: vis(n), label: labelOf(n), required: n.required || n.getAttribute('aria-required') === 'true' || /\*/.test(labelOf(n)) })),
            };
          });

          const lost = [];
          for (const h of e.form.heading || []) if (!clean(form.text).includes(clean(noCount(h)))) lost.push(`heading "${h}"`);
          for (const f of e.form.fields || []) {
            const hit = form.fields.find((x) => (f.id ? x.id === f.id : clean(x.label) === clean(f.label) || clean(x.label).includes(clean(f.label))));
            if (!hit) { lost.push(`field "${f.id || f.label}"`); continue; }
            if (f.required && !hit.required) lost.push(`field "${f.id || f.label}" no longer marked required`);
          }
          expect.soft(lost, `${lost.length} expected form element(s) missing — the form changed (see /qa-changes)`).toEqual([]);
          expect.soft(ERROR_TEXT.test(form.text), 'error text in the form').toBe(false);

          // close without saving
          if (e.form.kind === 'modal') {
            await page.keyboard.press('Escape');
            if (await scope.isVisible().catch(() => false)) {
              await scope.locator('.btn-close, button:has-text("Close"), button:has-text("Cancel")').first().click({ timeout: 4000 }).catch(() => {});
            }
          } else {
            await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
          }
          const p = problems(e);
          expect.soft(p.console, 'script errors while opening the form').toEqual([]);
          expect.soft(writes, 'opening the form sent a write request').toEqual([]);
        });
      }

      for (const k of e.known || []) {
        test(`${k.id} | ${tag} (${e.path}) ${k.expect}`, async () => {
          test.fail(true, `${k.id} — ${k.reason}`);
          await visit(resolve(e.path), e);
          if (k.onOpen && e.form) { await clickOpener(e); await page.waitForTimeout(1000); }
          const hits = consoleErrs.filter((m) => new RegExp(k.console, 'i').test(m));
          expect(hits, `${k.id}: ${k.reason}`).toEqual([]);
        });
      }
    }
  });
}

module.exports = { definePageSuite };
