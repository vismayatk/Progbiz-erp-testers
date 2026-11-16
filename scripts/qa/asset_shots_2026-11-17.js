'use strict';

/**
 * Evidence screenshots for the Asset Management test report (onetouch_test, 16-17 Nov 2026).
 *
 *   node scripts/qa/asset_shots_2026-11-17.js            every capture
 *   node scripts/qa/asset_shots_2026-11-17.js ast001 dashboard   only the named ones
 *
 * Read-only, with one exception: `longcode` presses Save on Add Category with a 60-character code,
 * which the server refuses (that refusal is the screenshot); nothing is created.
 * The red outline on a screenshot is drawn by this script. What each page said is saved next to
 * the pictures in facts.json, so that the report quotes the page and not a memory of it.
 *
 * Output: reports/qa/shots/asset-report-2026-11-17/  (git-ignored, like every report)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { chromium } = require('playwright');
const { LoginPage } = require('../../erp/common/LoginPage');
const { dismissRateLimit } = require('../../erp/common/helpers');

const BASE = process.env.BASE_URL || '';
if (process.env.COMPANY_CODE !== 'onetouch_test' || !/test\.erp\.progbiz\.in/.test(BASE)) { console.error('This script is for onetouch_test on test.erp.progbiz.in only.'); process.exit(1); }

const OUT = path.join(__dirname, '..', '..', 'reports', 'qa', 'shots', 'asset-report-2026-11-17');
fs.mkdirSync(OUT, { recursive: true });
const FACTS = path.join(OUT, 'facts.json');
const facts = fs.existsSync(FACTS) ? JSON.parse(fs.readFileSync(FACTS, 'utf8')) : {};
const save = () => fs.writeFileSync(FACTS, JSON.stringify(facts, null, 1));
const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
const only = process.argv.slice(2);
const offline = only.length > 0 && only.every((n) => n === 'prepare');     // `prepare` works on saved pictures only
if (!offline) {                                                           // one session at a time on the tenant
  const busy = cp.execSync('ps -Ao pid,command').toString().split('\n').filter((l) => /^\s*\d+\s+(node|npm exec)\b.*playwright test/.test(l));
  if (busy.length) { console.error('Another test run is using the tenant:\n' + busy.join('\n').slice(0, 400)); process.exit(2); }
}

// pictures of the manual pass that the report uses (see `prepare` below)
const PICTURES = [
  ['it0001_custody_after_return', 'ast004_custody_dates', [255, 68, 1185, 560], [[404, 472, 98, 46], [874, 478, 88, 30]]],
  ['workorder_completed_2030', 'ast005_workorder_future_date', [255, 68, 1185, 390], [[1166, 378, 92, 34]]],
  ['history_it0002', 'ast013_history_times', [255, 68, 1185, 590], [[1206, 406, 206, 184]]],
  ['import_validate_mixed', 'ast009_import_validate', [255, 68, 1185, 800], [[370, 544, 82, 50]]],
  ['import_run_dialog', 'ast009_import_result', [255, 68, 1185, 832], [[294, 727, 1108, 60]]],
  ['register_after_edges', 'ast012_fake_photo', [276, 318, 760, 150], [[441, 418, 40, 40]]],
  ['register_after_edges', 'design_long_name_register', [255, 68, 1185, 832], [[278, 730, 1140, 50]]],
  ['report_asset_register', 'design_long_name_report', [255, 68, 1185, 832], [[278, 612, 1140, 30]]],
  ['pdf_register', 'design_pdf_long_name', null, [[35, 43, 36, 36], [36, 201, 760, 26]]],
  ['settings_approvals', 'design_approval_looks_chosen', [257, 1484, 1160, 300], [[1262, 1573, 124, 30], [291, 1608, 1092, 38]]],
  ['cat_long_code_60_chars', 'design_master_window_buttons', [320, 28, 800, 646], [[954, 611, 146, 46]]],
  ['modal_assign', 'design_action_window_buttons', [320, 182, 800, 536], [[934, 654, 166, 46]]],
  ['phone_assets', 'design_phone_header', [0, 0, 390, 440], [[364, 10, 26, 48]]],
  // this script's own whole-page pictures, cut to the content area
  ['ast001_journal_detail', 'ast001_journal', [255, 68, 1185, 832], [[1142, 266, 263, 43], [293, 516, 1110, 44]]],
  ['rental_checkout_before_start_page', 'rental_checkout_before_start', [255, 68, 1185, 9999], []],
  ['lease_return_before_start_page', 'lease_return_before_start', [255, 68, 1185, 9999], []],
  ['lease_return_before_start_page', 'design_lease_line_cramped', [276, 716, 1144, 204], [[533, 865, 62, 36], [1173, 865, 58, 36], [1361, 865, 62, 36]]],
  ['h5_rental_invoice_opened', 'ast002_rental_invoice_lines', [255, 68, 1345, 932], [[300, 758, 440, 76], [756, 770, 178, 48]]],
  ['menu_view_only_user_open', 'ast018_menu_view_only_user', [0, 60, 470, 400], [[14, 368, 232, 40]]],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.split('\n')[0].slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|mono_download|Failed to fetch/.test(m.text())) errors.push(`console: ${clean(m.text()).slice(0, 400)}`); });
  const calls = [];
  page.on('response', (r) => { if (r.status() >= 400 && /\/api\//.test(r.url())) calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').split('?')[0]}`); });
  if (!offline) {
    await new LoginPage(page).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME || 'admin', process.env.PASSWORD);
    await page.waitForTimeout(2500);
  }

  const go = async (route, wait = 2500) => {
    for (let i = 0; i < 4; i++) {
      errors.length = 0; calls.length = 0;
      try { await page.goto(`${BASE}/${route.replace(/^\//, '')}`, { waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) { if (i === 3) throw e; await page.waitForTimeout(8000); continue; }
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(wait);
      if (!(await dismissRateLimit(page, 800))) return;
      await page.waitForTimeout(20000);
    }
  };
  const main = () => page.locator('main, .main-content').first();
  const txt = async (n = 4000) => clean(await main().innerText({ timeout: 8000 }).catch(() => '')).slice(0, n);
  const shot = (name, o = {}) => (o.of || page).screenshot({ path: path.join(OUT, `${name}.png`), ...(o.full ? { fullPage: true } : {}) });
  const mark = async (loc) => { const n = await loc.count(); if (!n) return 0; await loc.evaluateAll((els) => els.forEach((e) => { e.style.outline = '3px solid #e11d48'; e.style.outlineOffset = '2px'; })); return n; };
  /** Undo a sideways scroll of the page containers (a click or a focus can cause one); tables keep theirs. */
  const flat = () => page.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollLeft > 0 && e.tagName !== 'TABLE' && !e.querySelector(':scope > table')) e.scrollLeft = 0; window.scrollTo(0, window.scrollY); });
  /** the block (label + value) of a labelled field on an overview */
  const box = (label) => main().locator(`xpath=.//*[normalize-space(text())="${label}"]/..`).first();
  const tab = async (name) => { await page.locator('.nav-tabs .nav-link').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first().click(); await page.waitForTimeout(1600); };
  const rowsOf = (sel = 'table tbody tr') => page.locator(sel).evaluateAll((rs) => rs.filter((r) => r.offsetParent).map((r) => [...r.querySelectorAll('td,th')].map((c) => c.innerText.replace(/\s+/g, ' ').trim())));
  const assetId = async (code) => {
    await go('assets', 2500);
    await page.locator('#asset-list-filter-search').fill(code); await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
    const ids = await page.locator('tr[id^="asset-list-row-"]').evaluateAll((rs, c) => rs.filter((r) => ((r.querySelector('.al-code') || {}).innerText || '').trim() === c).map((r) => r.id.replace('asset-list-row-', '')), code);
    return ids[0] || null;
  };
  const tableOf = async (root) => {
    const t = (root || main()).locator('table').first();
    const head = (await t.locator('thead th').allInnerTexts()).map(clean);
    const body = await t.locator('tbody tr').evaluateAll((rs) => rs.map((r) => [...r.querySelectorAll('td,th')].map((c) => c.innerText.replace(/\s+/g, ' ').trim())));
    const foot = await t.locator('tfoot tr').evaluateAll((rs) => rs.map((r) => [...r.querySelectorAll('td,th')].map((c) => c.innerText.replace(/\s+/g, ' ').trim())));
    return { head, body, foot };
  };

  const captures = {
    /* AST-001: a disposal dated before the purchase date, and its journal */
    async ast001() {
      const id = await assetId('E6-0001'); const f = facts.ast001 = { id };
      await go(`asset-view/${id}`, 2800);
      f.badges = (await page.locator('main .badge:visible, .main-content .badge:visible').allInnerTexts()).map(clean).slice(0, 6);
      await mark(box('Purchase Date')); f.purchase = clean(await box('Purchase Date').innerText().catch(() => ''));
      await shot('ast001_asset_purchase_date');
      await tab('Finance'); f.finance = (await txt(9000)).split(/History /).pop().slice(0, 1500); await shot('ast001_asset_finance');
      await tab('History'); f.history = (await txt(9000)).split(/History /).pop().slice(0, 1200); await shot('ast001_asset_history');
      await go('asset-disposals', 2500);
      const t = await tableOf(); f.disposalHead = t.head; f.disposalRow = t.body.find((r) => r.join(' ').includes('E6-0001'));
      const row = page.locator('table tbody tr').filter({ hasText: 'E6-0001' }).first();
      await mark(row); await shot('ast001_disposals_list');
      await row.locator('td').last().scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(500); await shot('ast001_disposals_list_right');
      await go('vouchers', 3500);
      const v = await tableOf(); f.voucherHead = v.head; f.voucherRows = v.body.filter((r) => /\bJ-\d+\b/.test(r.join(' '))).slice(0, 8);
      const j2 = page.locator('table tbody tr').filter({ hasText: /\bJ-2\b/ }).first();
      if (await j2.count()) {
        await mark(j2); await shot('ast001_journal_list');
        const b = j2.locator('button, a').first();
        if (await b.count()) { await b.click(); await page.waitForTimeout(3000); const root = (await page.locator('.modal.show').count()) ? page.locator('.modal.show').last() : main(); f.journal = clean(await root.innerText()).slice(0, 900); f.journalUrl = page.url().replace(BASE, ''); await shot('ast001_journal_detail'); }
      }
    },

    /* a rental check-out dated before the contract starts */
    async rental() {
      const f = facts.rental = {};
      await go('asset-rentals', 2500);
      f.list = (await rowsOf()).slice(0, 4);
      await go('asset-rental-entry/2', 3200);
      f.heading = clean(await page.locator('h1, .page-title').first().innerText());
      f.start = await page.locator('#asset-rental-start').inputValue().catch(() => '');
      f.end = await page.locator('#asset-rental-end').inputValue().catch(() => '');
      const tables = await page.locator('main table, .main-content table').evaluateAll((ts) => ts.map((t) => [...t.querySelectorAll('tr')].map((r) => [...r.querySelectorAll('td,th')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()))));
      f.tables = tables;
      await mark(page.locator('#asset-rental-start'));
      const line = page.locator('table tbody tr').filter({ hasText: 'IT-0004' });
      await mark(line.first().locator('td').nth(3));
      await mark(line.last().locator('td').nth(1));
      f.sideways = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.scrollLeft > 0).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} scrollLeft=${e.scrollLeft} (${e.scrollWidth}/${e.clientWidth})`).slice(0, 5));
      // a tall window instead of a whole-page picture: Playwright's whole-page capture moves the content under the menu
      await page.setViewportSize({ width: 1440, height: 1500 }); await flat(); await page.waitForTimeout(700);
      await shot('rental_checkout_before_start_page');
      await page.setViewportSize({ width: 1440, height: 900 });
    },

    /* a leased asset returned to the vendor with a date before the lease starts */
    async lease() {
      const f = facts.lease = {};
      await go('asset-lease-entry/1', 3200);
      f.heading = clean(await page.locator('h1, .page-title').first().innerText());
      f.start = await page.locator('#asset-lease-start').inputValue().catch(() => '');
      f.tables = await page.locator('main table, .main-content table').evaluateAll((ts) => ts.map((t) => [...t.querySelectorAll('tr')].map((r) => [...r.querySelectorAll('td,th')].map((c) => (c.querySelector('input') ? c.querySelector('input').value : c.innerText).replace(/\s+/g, ' ').trim()))));
      await mark(page.locator('#asset-lease-start'));
      const line = page.locator('table tbody tr').filter({ hasText: 'IT-0011' }).first();
      await mark(line.locator('td').filter({ hasText: /Returned/ })); await mark(line.locator('td').nth(2));
      f.sideways = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.scrollLeft > 0).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} scrollLeft=${e.scrollLeft} (${e.scrollWidth}/${e.clientWidth})`).slice(0, 5));
      await page.setViewportSize({ width: 1440, height: 1260 }); await flat(); await page.waitForTimeout(700);
      await shot('lease_return_before_start_page');
      await page.setViewportSize({ width: 1440, height: 900 });
    },

    /* an asset registered with an earlier purchase date gets no depreciation for the months before */
    async backdated() {
      const id = await assetId('IT-0019'); const f = facts.backdated = { id };
      await go(`asset-view/${id}`, 2800);
      await mark(box('Purchase Date')); await mark(box('Purchase Cost'));
      f.purchase = clean(await box('Purchase Date').innerText().catch(() => '')); f.cost = clean(await box('Purchase Cost').innerText().catch(() => ''));
      await shot('backdated_asset_overview');
      await tab('Finance'); f.finance = (await txt(9000)).split(/History /).pop().slice(0, 1500); await shot('backdated_asset_finance');
      await go('asset-depreciation', 3000);
      f.runs = (await txt(400));
      const now = new Date(); const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await page.locator('#asset-depreciation-kind').selectOption({ label: 'Depreciation' }).catch(() => {});
      await page.locator('#asset-depreciation-month').fill(month);
      await page.locator('#asset-depreciation-preview').click(); await page.waitForTimeout(3500);
      const t = await tableOf(); f.previewHead = t.head; f.previewRow = t.body.find((r) => (r[0] || '').startsWith('IT-0019')); f.month = month;
      await mark(page.locator('table tbody tr').filter({ hasText: 'IT-0019' }).first());
      await shot('backdated_asset_preview');
    },

    /* a category code longer than the limit: server error instead of a message (the save is refused) */
    async longcode() {
      const f = facts.longcode = {};
      await go('asset-categories', 2500);
      await page.locator('#asset-categories-add').click(); await page.locator('.modal.show').last().waitFor({ state: 'visible', timeout: 10000 });
      const m = page.locator('.modal.show').last();
      await m.locator('#asset-category-code').fill('C'.repeat(60)); await m.locator('#asset-category-name').fill('QA_LongCode_check'); await m.locator('#asset-category-prefix').fill('ZQ');
      f.typed = (await m.locator('#asset-category-code').inputValue()).length; f.maxlength = await m.locator('#asset-category-code').getAttribute('maxlength');
      calls.length = 0;
      await m.locator('#asset-category-save').click(); await page.waitForTimeout(3000);
      f.said = (await page.locator('.swal2-popup, .toast, .toast-message, [role=alert]').allInnerTexts().catch(() => [])).map(clean).filter(Boolean);
      f.calls = [...calls];
      await shot('category_long_code_server_error');
      await page.locator('.swal2-confirm:visible').first().click().catch(() => {}); await page.waitForTimeout(600);
      await page.locator('#asset-category-cancel').click().catch(() => {}); await page.waitForTimeout(600);
      await go('asset-categories', 2500);
      await page.locator('#asset-categories-tab-all').click().catch(() => {}); await page.waitForTimeout(1200);
      f.created = (await rowsOf()).some((r) => r.join(' ').includes('QA_LongCode_check'));
    },

    /* a transfer waiting for approval that nobody can cancel */
    async transfer() {
      const f = facts.transfer = {};
      const id = await assetId('qa man 02'); f.id = id;
      await go(`asset-view/${id}`, 2800);
      f.badges = (await page.locator('main .badge:visible, .main-content .badge:visible').allInnerTexts()).map(clean).slice(0, 6);
      f.actions = (await page.locator('button[id^="asset-view-action-"]:visible, a[id^="asset-view-action-"]:visible').allInnerTexts()).map(clean);
      f.strip = (await txt(700));
      await mark(page.locator('main .badge:visible, .main-content .badge:visible').first());
      await shot('transfer_stuck_asset');
      await tab('Custody'); f.custody = (await txt(9000)).split(/History /).pop().slice(0, 900); await shot('transfer_stuck_custody');
      await go('asset-transfers', 2500);
      const t = await tableOf(); f.head = t.head; f.rows = t.body.filter((r) => /qa man 02/i.test(r.join(' ')));
      const row = page.locator('table tbody tr').filter({ hasText: 'qa man 02' }).first();
      f.rowButtons = (await row.locator('button, a').evaluateAll((b) => b.map((x) => (x.title || x.innerText || x.id).trim()))).filter(Boolean);
      await mark(row); await shot('transfer_stuck_list');
      await go('asset-approvals', 2500); f.adminQueue = (await txt(500)); await shot('transfer_stuck_admin_queue');
    },

    /* one staff member holding two seats of the same licence */
    async seats() {
      const f = facts.seats = {};
      await go('asset-software', 2500);
      f.list = await rowsOf();
      const row = page.locator('table tbody tr').filter({ hasText: 'MS Office 2024' }).first();
      f.rowButtons = await row.locator('button, a').evaluateAll((b) => b.map((x) => `${x.id}|${x.title}|${x.innerText.trim()}`));
      const seatBtn = row.locator('button[id*="seat"], button[title*="eat"]').first();
      await ((await seatBtn.count()) ? seatBtn : row.locator('button').first()).click();
      await page.locator('.modal.show').last().waitFor({ state: 'visible', timeout: 10000 }); await page.waitForTimeout(1200);
      const m = page.locator('.modal.show').last();
      f.title = clean(await m.locator('.modal-header, .modal-title').first().innerText());
      const seatRows = await m.locator('table tbody tr').evaluateAll((rs) => rs.map((r) => [...r.querySelectorAll('td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim())));
      f.seatRows = seatRows;
      const count = {}; for (const r of seatRows) if (r[0] && !/released/i.test(r[4] || '')) count[r[0]] = (count[r[0]] || 0) + 1;
      f.twice = Object.entries(count).filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`);
      for (const [name, n] of Object.entries(count)) if (n > 1) await mark(m.locator('table tbody tr').filter({ hasText: name }));
      await shot('licence_same_staff_two_seats');
    },

    /* report totals that do not agree */
    async reports() {
      const f = facts.reports = {};
      const read = async (type, key, name) => {
        await go(`asset-reports?type=${type}`, 3500);
        const t = await tableOf();
        f[key] = { head: t.head, rows: t.body.length, body: t.body, foot: t.foot };
        // bring the money columns into view: the table scrolls sideways inside its card
        await page.locator('main table, .main-content table').first().evaluate((tb) => { let p = tb.parentElement; while (p && p.scrollWidth <= p.clientWidth + 2) p = p.parentElement; if (p) p.scrollLeft = p.scrollWidth; });
        await page.waitForTimeout(500);
        await shot(name);
        if (t.body.length > 12) {                      // long report: a second picture with the Total row
          await page.evaluate(() => { const rows = document.querySelectorAll('main table tr, .main-content table tr'); rows[rows.length - 1].scrollIntoView({ block: 'end' }); });
          await flat(); await page.waitForTimeout(500);
          await mark(page.locator('main table tr, .main-content table tr').last());
          await shot(`${name}_total`);
        }
      };
      await read(1, 'register', 'report_register_right_side');
      await read(17, 'valuation', 'report_valuation_right_side');
      await read(16, 'schedule', 'report_depreciation_schedule');
      await read(15, 'disposals', 'report_disposal_register');
    },

    /* dashboard: "Where assets are" */
    async dashboard() {
      const f = facts.dashboard = {};
      await go('asset-dashboard', 4500);
      f.sub = (await txt(260));
      f.cards = await page.locator('main .card, .main-content .card').evaluateAll((cs) => cs.map((c) => c.innerText.replace(/\s+/g, ' ').trim().slice(0, 260)).filter(Boolean).slice(0, 24));
      await shot('dashboard_top');
      const where = page.locator('main .card, .main-content .card').filter({ hasText: /Where .*Assets Are/i }).first();
      if (await where.count()) { await where.scrollIntoViewIfNeeded(); await page.waitForTimeout(600); await shot('dashboard_where_assets_are', { of: where }); f.where = clean(await where.innerText()); }
      const branch = page.locator('main .card, .main-content .card').filter({ hasText: /By Branch/i }).last();
      if (await branch.count()) { f.byBranch = clean(await branch.innerText()).slice(0, 300); }
      const fin = page.locator('main .card, .main-content .card').filter({ hasText: /Gross block/i }).last();
      if (await fin.count()) { f.finance = clean(await fin.innerText()).slice(0, 400); await fin.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await shot('dashboard_finance_and_branch'); }
    },

    /* Deliveries & Pick-ups: script error on load */
    async deliveries() {
      const f = facts.deliveries = { tries: [] };
      for (let i = 0; i < 2; i++) { await go('asset-deliveries', 3500); f.tries.push({ errors: [...errors], calls: [...calls] }); }
      f.heading = clean(await page.locator('h1, .page-title').first().innerText());
      await shot('deliveries_page');
    },

    /* does any page hide content that is wider than the screen? (desktop widths) */
    async overflow() {
      const f = facts.overflow = {};
      const pages = ['assets', 'asset-view/1', 'asset-rental-entry/2', 'asset-lease-entry/1', 'asset-dashboard', 'asset-maintenance', 'asset-disposals', 'asset-depreciation', 'asset-software', 'asset-settings', 'asset-reports?type=1', 'asset-availability', 'data-import'];
      for (const [w, h] of [[1440, 900], [1366, 768]]) {
        await page.setViewportSize({ width: w, height: h });
        for (const p of pages) {
          await go(p, 2600);
          f[`${w}:${p}`] = await page.evaluate(() => {
            const de = document.documentElement; const vw = window.innerWidth;
            const wide = [];
            for (const e of document.querySelectorAll('main *, .main-content *')) {
              if (!e.offsetParent) continue;
              const r = e.getBoundingClientRect();
              if (r.width > 4 && r.right > vw + 2) { let clipped = false; let p = e.parentElement; while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 2) { clipped = 'scrolls'; break; } p = p.parentElement; } if (!clipped) wide.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ')[0]} right=${Math.round(r.right)} "${(e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`); }
            }
            const scrollers = [...document.querySelectorAll('main *, .main-content *, main, .main-content, body')].filter((e) => e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(getComputedStyle(e).overflowX)).map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ').slice(0, 2).join('.')} hides ${e.scrollWidth - e.clientWidth}px`).slice(0, 6);
            return { page: `${de.scrollWidth}/${de.clientWidth}`, bodyScroll: `${document.body.scrollWidth}/${document.body.clientWidth}`, beyondScreen: wide.slice(0, 6), hiddenOverflow: scrollers };
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    },

    /*
     * Pictures taken by hand on 16 Nov (reports/qa/shots/asset-2026-11-16): cut to the subject and
     * outline it. Nothing is opened on the tenant. Each entry: source, output, cut [x, y, w, h] or
     * null for the whole picture, outlines [[x, y, w, h], …] in the source picture's pixels.
     */
    async prepare() {
      const SRC = path.join(OUT, '..', 'asset-2026-11-16');
      const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      for (const [src, out, cut, boxes] of PICTURES) {
        const file = [path.join(SRC, `${src}.png`), path.join(OUT, `${src}.png`)].find((x) => fs.existsSync(x));
        if (!file) { console.log(`  missing picture: ${src}`); continue; }
        const buf = fs.readFileSync(file); const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20);
        await p2.setViewportSize({ width: w, height: h });
        await p2.setContent(`<body style="margin:0;background:#fff"><div style="position:relative;width:${w}px;height:${h}px"><img src="data:image/png;base64,${buf.toString('base64')}" style="display:block">${(boxes || []).map(([x, y, bw, bh]) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${bw}px;height:${bh}px;border:3px solid #e11d48;box-sizing:border-box;border-radius:4px"></div>`).join('')}</div></body>`);
        await p2.waitForTimeout(200);
        const c = cut || [0, 0, w, h];
        await p2.screenshot({ path: path.join(OUT, `${out}.png`), clip: { x: c[0], y: c[1], width: Math.min(c[2], w - c[0]), height: Math.min(c[3], h - c[1]) } });
      }
      await p2.close();
    },
  };

  for (const [name, fn] of Object.entries(captures)) {
    if (only.length && !only.includes(name)) continue;
    const t0 = Date.now();
    try { await fn(); console.log(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
    catch (e) { console.log(`FAIL ${name}: ${e.message.split('\n')[0].slice(0, 220)}`); (facts._failed = facts._failed || {})[name] = e.message.split('\n')[0].slice(0, 300); }
    save();
  }
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n')[0]); save(); process.exit(1); });
