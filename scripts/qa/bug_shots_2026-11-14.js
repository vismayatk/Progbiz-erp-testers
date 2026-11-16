'use strict';

/**
 * Evidence screenshots for the 14 Nov 2026 bug report (onetouch_test).
 *
 *   node scripts/qa/bug_shots_2026-11-14.js go [step ...]
 *
 * READ-ONLY: one login, opens pages, opens forms and closes them, never saves. Before each
 * screenshot the part of the page the bug is about gets a red outline (drawn in this browser only).
 * Each step also records what was read from the page (values, console errors, failed calls) into
 * reports/qa/shots/bug-report-2026-11-14/facts.json, so the report quotes what was really there.
 *
 * Without the word "go" it does nothing, so listing or --help can never start a second session.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { dismissRateLimit } = require('../../erp/common/helpers');
const { SalesTargetsPage } = require('../../erp/crm/pages/SalesTargetsPage');
const { EnquiryPage } = require('../../erp/crm/pages/EnquiryPage');

if (process.argv[2] !== 'go') { console.log('usage: node scripts/qa/bug_shots_2026-11-14.js go [step ...]'); process.exit(0); }
const ONLY = process.argv.slice(3);
const BASE = process.env.BASE_URL || 'https://test.erp.progbiz.in';
const COMPANY = process.env.COMPANY_CODE || 'onetouch_test';
if (COMPANY !== 'onetouch_test' || !/test\.erp\.progbiz\.in/.test(BASE)) { console.error('onetouch_test on test.erp.progbiz.in only'); process.exit(1); }
const OUT = path.join(__dirname, '..', '..', 'reports', 'qa', 'shots', 'bug-report-2026-11-14');
fs.mkdirSync(OUT, { recursive: true });
const FACTS_FILE = path.join(OUT, 'facts.json');
const facts = fs.existsSync(FACTS_FILE) ? JSON.parse(fs.readFileSync(FACTS_FILE, 'utf8')) : {};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let errors = [], calls = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.split('\n')[0].slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().split('\n')[0].slice(0, 300)}`); });
  page.on('response', (r) => { if (r.status() >= 400 && /\/api\//.test(r.url())) calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').split('?')[0]}`); });
  const reset = () => { errors = []; calls = []; };
  const heard = () => ({ errors: [...new Set(errors)].slice(0, 8), calls: [...new Set(calls)].slice(0, 8) });

  const pause = (ms) => page.waitForTimeout(ms);
  async function open(route, wait = 3500) {
    reset();
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await pause(wait);
    if (await dismissRateLimit(page)) { await pause(20000); await page.reload({ waitUntil: 'domcontentloaded' }); await pause(wait + 2000); }
  }
  async function mark(locator, n = 6) {
    const c = Math.min(await locator.count().catch(() => 0), n);
    for (let i = 0; i < c; i++) {
      await locator.nth(i).evaluate((e) => {
        if (e.tagName === 'TR') { [...e.children].forEach((c) => { c.style.background = 'rgba(225,29,72,.14)'; c.style.boxShadow = 'inset 0 3px 0 #e11d48, inset 0 -3px 0 #e11d48'; c.setAttribute('data-qa-mark', '1'); }); return; }
        e.style.outline = '3px solid #e11d48'; e.style.outlineOffset = '2px'; e.setAttribute('data-qa-mark', '1');
      }).catch(() => {});
    }
    return c;
  }
  const unmark = () => page.evaluate(() => document.querySelectorAll('[data-qa-mark]').forEach((e) => { e.style.outline = ''; e.style.outlineOffset = ''; e.style.background = ''; e.style.boxShadow = ''; e.removeAttribute('data-qa-mark'); })).catch(() => {});
  async function shot(name, info = {}) {
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    facts[name] = { ...info, ...heard(), url: page.url().replace(BASE, ''), at: new Date().toISOString() };
    fs.writeFileSync(FACTS_FILE, JSON.stringify(facts, null, 2));
    console.log(`  📸 ${name}  ${JSON.stringify(facts[name]).slice(0, 420)}`);
    await unmark();
  }
  const text = (loc) => loc.innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  const closeModal = async () => { await page.keyboard.press('Escape').catch(() => {}); await pause(700); };

  const steps = {};

  // ERP-011: script error on the first load of Home after login (the login happens here)
  steps.home = async () => {
    await pause(3500);
    await shot('erp011_home_first_load', { note: 'console after login' });
  };

  // ERP-020: sale above stock saves although Allow Negative Stock is off
  steps.erp020 = async () => {
    await open('/client-setting', 3000);
    const head = page.locator('.accordion-button').filter({ hasText: /Inventory Settings/i }).first();
    if (await head.count()) {
      if ((await head.getAttribute('aria-expanded')) !== 'true') { await head.click(); await pause(1200); }
      const sw = page.locator('#allow-negative-stock');
      await sw.scrollIntoViewIfNeeded().catch(() => {});
      await page.mouse.wheel(0, -180); await pause(400);
      const checked = await sw.isChecked().catch(() => null);
      await mark(sw.locator('xpath=ancestor::*[contains(@class,"form-check") or contains(@class,"col")][1]'));
      await shot('erp020_setting_allow_negative_stock_off', { allowNegativeStock: checked });
    }
    await open('/sales-invoices', 4000);
    const rows = page.locator('table tbody tr').filter({ hasText: /99,999,900|99999900/ });
    const n = await rows.count();
    const rowTexts = [];
    for (let i = 0; i < Math.min(n, 4); i++) rowTexts.push((await text(rows.nth(i))).slice(0, 260));
    await mark(rows);
    const tiles = await page.locator('button, .card').filter({ hasText: /This Month/i }).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 120)).catch(() => '');
    if (n) await rows.first().scrollIntoViewIfNeeded().catch(() => {});
    await shot('erp020_sales_invoices_oversell_invoices', { invoices: n, rowTexts, tiles });
    await open('/items', 3500);
    const box = page.getByPlaceholder('Search by name').first();
    await box.fill('QA_Item_Fixture', { timeout: 10000 }); await box.press('Enter'); await pause(3500);
    const item = page.locator('table tbody tr').filter({ hasText: 'QA_Item_Fixture' }).first();
    const itemRow = await text(item);
    await mark(item);
    await shot('erp020_item_stock_below_zero', { itemRow });
  };

  // Lead transfer waits for approval
  steps.transfer = async () => {
    await open('/leads', 4500);
    let found = null;
    for (const chip of ['#tab-lead-new', '#tab-lead-infollowup', '#tab-lead-won', '#tab-lead-lost']) {
      const c = page.locator(chip);
      if (await c.count()) { await c.click().catch(() => {}); await pause(2500); }
      const row = page.locator('table tbody tr').filter({ hasText: /awaiting approval/i }).first();
      if (await row.count()) { found = { chip, row: (await text(row)).slice(0, 300) }; await row.scrollIntoViewIfNeeded().catch(() => {}); await mark(row.locator('td').filter({ hasText: /awaiting approval/i })); break; }
    }
    await shot('transfer_awaiting_approval_on_leads_list', { found });
  };

  // Every Client Setting as it is now, against the morning snapshot (nothing is changed here)
  steps.settings = async () => {
    await open('/client-setting', 3500);
    const now = await page.evaluate(() => [...document.querySelectorAll('.accordion-collapse input[id], .accordion-collapse select[id], .accordion-collapse textarea[id]')].map((e) => ({
      id: e.id, value: e.type === 'checkbox' ? e.checked : (e.tagName === 'SELECT' ? (e.selectedOptions[0]?.textContent || '').trim() : e.value),
    })));
    const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'site-audit-onetouch_test-2026-11-14T12-23.json'), 'utf8'));
    const wasBy = {}; for (const o of snap.clientSettings.options.filter((x) => x.id)) (wasBy[o.id] = wasBy[o.id] || []).push(o);
    const seen = {}; const changed = []; let comparable = 0;
    for (const o of now) {
      const k = (seen[o.id] = (seen[o.id] || 0) + 1) - 1;
      const w = (wasBy[o.id] || [])[k];
      if (!w) continue;
      comparable += 1;
      if (String(w.value) !== String(o.value)) changed.push({ id: o.id, label: w.label, morning: w.value, now: o.value });
    }
    const duplicateIds = Object.entries(seen).filter(([, n]) => n > 1).map(([id]) => id);
    const dup = await page.evaluate((ids) => ids.map((id) => ({ id, inputs: document.querySelectorAll(`[id="${id}"]`).length, labels: [...document.querySelectorAll(`label[for="${id}"]`)].map((l) => l.innerText.trim()) })), duplicateIds);
    facts.settings_check = { read: now.length, comparable, changed, duplicateIds: dup, at: new Date().toISOString() };
    fs.writeFileSync(FACTS_FILE, JSON.stringify(facts, null, 2));
    if (dup.length) {
      const sw = page.locator(`[id="${dup[0].id}"]`);
      const head = page.locator('.accordion-button').filter({ hasText: /Item Settings/i }).first();
      if (await head.count() && (await head.getAttribute('aria-expanded')) !== 'true') { await head.click(); await pause(1200); }
      await sw.first().scrollIntoViewIfNeeded().catch(() => {});
      for (let i = 0; i < await sw.count(); i++) await mark(sw.nth(i).locator('xpath=ancestor::*[contains(@class,"form-check") or contains(@class,"col")][1]'));
      await shot('settings_two_switches_share_one_id', { dup });
    }
    console.log(`  settings read: ${now.length}, compared: ${comparable}, different from the morning: ${JSON.stringify(changed)}, shared ids: ${JSON.stringify(dup)}`);
  };

  // Payment Pending Leads: the quick search box does not filter (tried twice, plus the Filter panel search)
  steps.pendingsearch = async () => {
    const tries = [];
    const bodies = [];
    const onReq = (r) => { if (r.method() === 'POST' && /won-leads|pending/i.test(r.url())) bodies.push(`${r.url().split('/').pop()} ${((r.postData() || '').match(/"searchString":("[^"]*"|null)/) || [''])[0]}`); };
    page.on('request', onReq);
    const rowCount = () => page.locator('table tbody tr').count();
    const says = async () => (await text(page.locator('table tbody').first())).slice(0, 80);
    for (let i = 0; i < 2; i++) {
      await open('/payment-pending-leads', 4000);
      const rowsBefore = await rowCount();
      const typed = `zz_no_match_${i + 1}`;
      const box = page.locator('#filter-name').first();
      // 1. Enter
      bodies.length = 0;
      await box.fill(typed); await box.press('Enter'); await pause(3000);
      const rowsAfterEnter = await rowCount();
      const sentOnEnter = [...bodies];
      if (i === 1) { await mark(box); await page.screenshot({ path: path.join(OUT, 'erp021_payment_pending_enter_does_not_search.png') }); await unmark(); }
      // 2. the magnifier button right of the box
      const mag = box.locator('xpath=following::button[1]');
      const magHtml = await mag.evaluate((e) => e.outerHTML.replace(/\s+/g, ' ').slice(0, 160)).catch(() => '');
      bodies.length = 0;
      await mag.click().catch(() => {}); await pause(3000);
      const rowsAfterMagnifier = await rowCount();
      const afterMagnifierSays = await says();
      const sentOnMagnifier = [...bodies];
      tries.push({ typed, rowsBefore, rowsAfterEnter, sentOnEnter, rowsAfterMagnifier, afterMagnifierSays, sentOnMagnifier, magHtml });
      if (i === 1) { await mark(mag); await shot('erp021_payment_pending_after_magnifier', { tries }); }
    }
    facts.erp021 = { tries, at: new Date().toISOString() };
    // 3. the search inside the Filter panel, for comparison
    await open('/payment-pending-leads', 4000);
    bodies.length = 0;
    await page.locator('#toggleFilter').click().catch(() => {}); await pause(1200);
    const inner = page.locator('#filterContent input[type="search"]').first();
    if (await inner.count()) {
      await inner.fill('zz_no_match_panel');
      await page.locator('#filterContent button:has-text("Apply Filter")').first().click().catch(() => {});
      await pause(3000);
      facts.erp021.panel = { typed: 'zz_no_match_panel', rows: await rowCount(), says: await says(), sent: [...bodies] };
    }
    fs.writeFileSync(FACTS_FILE, JSON.stringify(facts, null, 2));
    console.log(`  erp021: ${JSON.stringify(facts.erp021).slice(0, 900)}`);
    page.off('request', onReq);
  };

  // Where a waiting lead transfer can be approved (read only: nothing is approved here)
  steps.approvals = async () => {
    await open('/approval/config', 4000);
    const lt = page.getByText(/Lead Transfer/i).first();
    const ltRow = await text(lt.locator('xpath=ancestor::*[self::tr or contains(@class,"card") or contains(@class,"list-group-item") or contains(@class,"row")][1]'));
    await lt.scrollIntoViewIfNeeded().catch(() => {});
    await mark(lt);
    await shot('transfer_approval_config', { leadTransfer: ltRow.slice(0, 400), pageText: (await text(page.locator('.main-content, main, body').first())).slice(0, 900) });
    await open('/approval/assignment', 4000);
    const lt2 = page.getByText(/Lead Transfer/i).first();
    await mark(lt2);
    await shot('transfer_approval_assignment', { pageText: (await text(page.locator('.main-content, main, body').first())).slice(0, 900) });
    await open('/ess/approvals', 4500);
    const mine = page.locator('table tbody tr, .card, .list-group-item').filter({ hasText: /lead transfer|transfer/i });
    await mark(mine.first());
    await shot('transfer_my_approvals', { transferItems: await mine.count(), pageText: (await text(page.locator('.main-content, main, body').first())).slice(0, 900) });
  };

  // CH-F1 / ERP-004: Add Follow-up opens with a date below its own minimum
  steps.followup = async () => {
    reset();
    await new EnquiryPage(page).openFirstEnquiry();
    await pause(4500);
    const add = page.locator('#btn-add-followup');
    if (!(await add.count())) { await shot('chf1_followup_no_button', { note: 'no Add Follow-up on this record' }); return; }
    await add.click(); await pause(3500);
    const date = page.locator('.modal.show #next-followup-date').first();
    const d = await date.evaluate((e) => ({ value: e.value, min: e.min, valid: e.validity.valid, under: e.validity.rangeUnderflow, message: e.validationMessage })).catch(() => null);
    await mark(date.locator('xpath=ancestor::div[1]'));
    await shot('chf1_followup_date_below_minimum', { date: d, record: page.url().replace(BASE, '') });
    await closeModal();
    const close = page.locator('.modal.show .btn-close, .modal.show button:has-text("Close"), .modal.show button:has-text("Cancel")').first();
    if (await close.count()) await close.click().catch(() => {});
  };

  // CMP-F1: no complaint type, so a complaint cannot be created
  steps.complaint = async () => {
    await open('/complaint-types', 3500);
    await mark(page.locator('table').first().locator('tbody'));
    await shot('cmpf1_complaint_types_empty', { firstRow: (await text(page.locator('table tbody tr').first())).slice(0, 120) });
    await open('/add-complaint', 4000);
    const none = page.getByText(/No active complaint types/i).first();
    await mark(none);
    await shot('cmpf1_new_complaint_no_types', { message: await text(none) });
  };

  // NP-F1 / ERP-009: Message Expenses never finishes loading
  steps.expenses = async () => {
    await open('/whatsapp-expenses', 15000);
    const loading = page.getByText(/^\s*Loading/i).first();
    const still = await loading.isVisible().catch(() => false);
    await mark(loading);
    await shot('npf1_whatsapp_expenses_stuck_loading', { stillLoadingAfter15s: still });
  };

  // ERP-010: Add button throws on click
  steps.erp010 = async () => {
    for (const [route, name] of [['/receipts', 'receipts'], ['/dealers', 'dealers']]) {
      await open(route, 3500);
      const btn = page.locator('a[data-bs-toggle="dropdown"], button[data-bs-toggle="dropdown"]').filter({ hasText: /add|new|create/i }).first();
      const html = await btn.evaluate((e) => e.outerHTML.replace(/\s+/g, ' ').replace(/<!--.*?-->/g, '').slice(0, 260)).catch(() => '');
      await mark(btn);
      await page.screenshot({ path: path.join(OUT, `erp010_add_button_${name}.png`) });
      await unmark();
      reset();
      await btn.click().catch(() => {});
      await pause(2500);
      facts[`erp010_add_button_${name}`] = { button: html, ...heard(), openedUrl: page.url().replace(BASE, ''), url: route, at: new Date().toISOString() };
      fs.writeFileSync(FACTS_FILE, JSON.stringify(facts, null, 2));
      console.log(`  📸 erp010_add_button_${name}  ${JSON.stringify(facts[`erp010_add_button_${name}`]).slice(0, 420)}`);
      await closeModal();
    }
  };

  // ERP-012: reopening an Edit modal throws
  steps.erp012 = async () => {
    await open('/workflow-cost-types', 3500);
    const pencil = page.locator('table tbody tr').first().locator('a:has(i.ri-pencil-line), button:has(i.ri-pencil-line)').first();
    if (!(await pencil.count())) { await shot('erp012_no_row', {}); return; }
    reset();
    for (let i = 0; i < 2; i++) { await pencil.click(); await pause(2500); if (i === 0) { await page.keyboard.press('Escape'); await pause(900); } }
    await shot('erp012_edit_modal_reopened', {});
    await closeModal();
  };

  // ERP-002: WhatsApp Accounts throws while drawing
  steps.erp002 = async () => {
    await open('/whatsapp-accounts', 4000);
    await mark(page.locator('#blazor-error-ui:visible'));
    await shot('erp002_whatsapp_accounts', { errorBar: await page.locator('#blazor-error-ui').isVisible().catch(() => false) });
  };

  // ERP-013..019: HRMS-side pages
  steps.hrms = async () => {
    for (const [route, name] of [['/leave-approval', 'erp013_leave_approval'], ['/exit-dashboard', 'erp014_exit_dashboard'], ['/resignation-approval', 'erp015_resignation_approval'], ['/ess/resignation', 'erp016_my_resignation']]) {
      await open(route, 4000);
      const oops = page.getByText(/oops|something went wrong/i).first();
      const seen = await oops.isVisible().catch(() => false);
      if (seen) await mark(oops);
      await mark(page.locator('#blazor-error-ui:visible'));
      await shot(name, { oops: seen, message: seen ? (await text(oops)).slice(0, 160) : '' });
      const ok = page.locator('.swal2-confirm:visible, .modal.show button:has-text("OK")').first();
      if (await ok.count()) await ok.click().catch(() => {});
    }
    await open('/notice-period-rules', 3500);
    const sb = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
    if (await sb.count()) { reset(); await sb.fill('QA'); await sb.press('Enter'); await pause(800); const mag = page.locator('button:has(i.ri-search-line), button:has(i.bi-search), button:has(i.fe-search)').first(); if (await mag.count()) await mag.click().catch(() => {}); await pause(3000); await mark(sb); }
    await shot('erp017_notice_rules_search', {});
    await open('/document-types', 3500);
    const sb2 = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
    if (await sb2.count()) {
      const before = await page.locator('table tbody tr').count();
      const firstName = (await text(page.locator('table tbody tr').first())).slice(0, 80);
      await sb2.fill('zzzz-no-such-type'); await sb2.press('Enter'); await pause(3000);
      const after = await page.locator('table tbody tr').count();
      await mark(sb2);
      await shot('erp018_document_types_enter_does_not_search', { rowsBefore: before, rowsAfterEnter: after, firstRow: firstName, typed: 'zzzz-no-such-type' });
    }
    await open('/vacancy-list', 4000);
    const tab = page.locator('a, button').filter({ hasText: /^\s*Candidates\s*$/ }).first();
    if (await tab.count()) { await tab.click().catch(() => {}); await pause(3500); }
    const denied = page.getByText(/access denied/i).first();
    await mark(denied);
    await shot('erp019_job_board_candidates_tab_access_denied', { denied: await denied.isVisible().catch(() => false) });
  };

  // ERP-005 / CRM-009: Sales Targets Total drops the decimals (typed on screen only, never saved)
  steps.targets = async () => {
    reset();
    const st = new SalesTargetsPage(page);
    await st.goto();
    const [id] = await st.executiveIds();
    if (!id) { await shot('crm009_no_executive', {}); return; }
    await st.spread(id, 99999.99);
    const monthSum = await st.monthlyTotal(id);
    const cellText = await st.totalCellText(id);
    await mark(page.locator(`#spread-amount-${id}`).locator('xpath=ancestor::tr[1]').locator('td').last());
    await page.locator(`#spread-amount-${id}`).scrollIntoViewIfNeeded().catch(() => {});
    await shot('crm009_sales_targets_total_drops_decimals', { monthsSum: monthSum, totalCell: cellText, typed: '99999.99', saved: false });
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});   // throw the typed numbers away
    await pause(2500);
  };

  // ERP-008 / CRM-010: empty list does not say it is empty
  steps.empty = async () => {
    await open('/solar-orders', 4000);
    const rows = await page.locator('table tbody tr').count();
    await mark(page.locator('table').first());
    await shot('crm010_solar_orders_empty_list', { rows, bodyText: (await text(page.locator('table tbody').first())).slice(0, 120) });
  };

  // Question: Leads Kanban column says 66, draws 20 cards
  steps.kanban = async () => {
    await open('/leads', 4500);
    const status = page.locator('#btn-view-status');
    if (await status.count()) { await status.click().catch(() => {}); await pause(2500); }
    const board = page.locator('#btn-status-layout-board');
    if (await board.count()) { await board.click().catch(() => {}); await pause(3500); }
    const cols = await page.locator('.kb-column').evaluateAll((els) => els.map((c) => ({
      title: (c.querySelector('.kb-column-title')?.innerText || '').trim(), count: (c.querySelector('.kb-column-count')?.innerText || '').trim(), cards: c.querySelectorAll('.kb-card').length,
    })));
    const off = cols.findIndex((c) => Number(c.count) > c.cards);
    if (off >= 0) await mark(page.locator('.kb-column').nth(off).locator('.kb-column-count, .kb-column-title'));
    await shot('leads_kanban_count_vs_cards', { columns: cols });
    const list = page.locator('#btn-status-layout-list');
    if (await list.count()) await list.click().catch(() => {});
    const nature = page.locator('#btn-view-nature');
    if (await nature.count()) await nature.click().catch(() => {});
  };

  try {
    const lp = new LoginPage(page);
    await lp.goto();
    reset();
    await lp.login(COMPANY, process.env.CRM_USERNAME || 'admin', process.env.PASSWORD);
    for (const [name, fn] of Object.entries(steps)) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      console.log(`\n== ${name}`);
      try { await fn(); } catch (e) { console.log(`  !! ${name} failed: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `_failed_${name}.png`) }).catch(() => {}); }
      await pause(2500);
    }
  } finally {
    await browser.close();
  }
})();
