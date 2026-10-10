'use strict';
/**
 * READ-ONLY tenant data audit.
 *
 * Logs in with the creds in .env (COMPANY_CODE / CRM_USERNAME / PASSWORD / BASE_URL) and records
 * what the tenant actually has — master lists, dropdown options, form defaults — so the suites
 * can be checked against real data instead of lesol_test assumptions.
 *
 * It opens pages and forms and reads them. It NEVER clicks Save/Submit and creates nothing.
 * (It does pick values in dropdowns on forms it then abandons, to see which fields appear.)
 *
 *   node scripts/qa/audit_tenant_data.js            # -> reports/qa/raw/tenant-audit-<company>-<date>.json
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { chromium } = require('playwright');
const { LoginPage } = require('../../erp/common/LoginPage');
const { EnquiryPage } = require('../../erp/crm/pages/EnquiryPage');
const { TaskManagementPage } = require('../../erp/task-management/pages/TaskManagementPage');

const BASE = process.env.BASE_URL;
const COMPANY = process.env.COMPANY_CODE;
const OUT_DIR = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw');
const DATE = new Date().toISOString().slice(0, 10);
const OUT = path.join(OUT_DIR, `tenant-audit-${COMPANY}-${DATE}.json`);

// Pages that list master/transaction data. Order = sidebar-ish.
const LISTS = [
  '/users', '/user-levels', '/department', '/designations', '/teams', '/access-roles', '/branches',
  '/customers', '/leads', '/followups', '/lead-sources', '/lead-status', '/crm-items',
  '/crm-item-categories', '/item-packing-types', '/payment-terms', '/complaint-types', '/complaints',
  '/sales-targets', '/predefined-tasks', '/my-tasks', '/delegated-tasks', '/todo-list',
  '/dynamic-fields', '/email-templates', '/lead-source-commissions', '/lead-expenses', '/repeat-accounts',
  '/workflow-types/4b179641-0997-4eb6-ba2a-0e79acf55c97',
];

const audit = { company: COMPANY, base: BASE, at: new Date().toISOString(), lists: {}, forms: {} };
const log = (...a) => console.log('  •', ...a);

/** Visible form controls (optionally inside a scope selector). */
async function readControls(page, scopeSel) {
  return page.evaluate((scopeSel) => {
    const root = (scopeSel && document.querySelector(scopeSel)) || document;
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const txt = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const lab = (e) => {
      let l = e.id && document.querySelector(`label[for="${e.id}"]`);
      if (!l) { const g = e.closest('.form-group, [class*="col-"]'); l = g && g.querySelector('label'); }
      return l ? txt(l.textContent) : '';
    };
    return [...root.querySelectorAll('input,select,textarea')].filter(vis)
      .filter((e) => e.type !== 'password' && e.type !== 'hidden')
      .map((e) => ({
        tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '',
        label: lab(e), placeholder: e.placeholder || '', min: e.min || '',
        value: e.tagName === 'SELECT' ? '' : txt(e.value).slice(0, 60),
        options: e.tagName === 'SELECT' ? [...e.options].map((o) => txt(o.text)) : undefined,
      }));
  }, scopeSel);
}

/** Read a list page: headers, total, rows (page size raised to the max the page offers). */
async function readList(page, route) {
  const rec = { route };
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('table tbody tr, .empty, .no-data').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2500);
    rec.finalPath = new URL(page.url()).pathname;
    // raise the page size (a view setting, not data)
    const ps = page.locator('#page_size');
    if (await ps.count()) {
      const opts = await ps.locator('option').allTextContents();
      const max = opts.map((o) => Number(o.trim())).filter(Boolean).sort((a, b) => b - a)[0];
      if (max) { await ps.selectOption({ label: String(max) }).catch(() => {}); await page.waitForTimeout(2500); }
    }
    Object.assign(rec, await page.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
      const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
      const t = [...document.querySelectorAll('table')].filter(vis)
        .sort((a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length)[0];
      const body = document.body.innerText.replace(/\s+/g, ' ');
      const tot = body.match(/Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)\s+entries/i);
      const rows = t ? [...t.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map(txt)) : [];
      return {
        heading: txt(document.querySelector('h1,h2,h3,h4,.page-title') || document.body).slice(0, 80),
        headers: t ? [...t.querySelectorAll('thead th')].map(txt) : [],
        total: tot ? Number(tot[3]) : rows.length,
        rowsShown: rows.length,
        rows: rows.slice(0, 150).map((r) => r.map((c) => c.slice(0, 70))),
        emptyText: rows.length ? '' : (body.match(/no (data|records?|items?|results?|entries)[^.]{0,50}/i) || [''])[0],
        selects: [...document.querySelectorAll('select')].filter(vis).map((s) => ({
          id: s.id, options: [...s.options].map((o) => txt(o)).slice(0, 40),
        })),
      };
    }));
  } catch (e) { rec.error = String(e.message).split('\n')[0]; }
  return rec;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const lp = new LoginPage(page); await lp.goto();
  await lp.login(COMPANY, process.env.CRM_USERNAME, process.env.PASSWORD);
  audit.header = await page.evaluate(() => (document.querySelector('header, .app-header')?.innerText || '').replace(/\s+/g, ' ').slice(0, 200));

  // ── lists ────────────────────────────────────────────────────────────────
  for (const r of LISTS) { log('list', r); audit.lists[r] = await readList(page, r); }

  // ── enquiry form ─────────────────────────────────────────────────────────
  try {
    log('form: enquiry');
    await page.goto(BASE + '/leads', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const enq = new EnquiryPage(page);
    await enq.openAddForm();
    await page.waitForTimeout(3000);
    const f = { url: new URL(page.url()).pathname, controls: await readControls(page) };
    // choose each Followup Status (UI only, never saved) and see what fields appear
    const fu = page.locator('#followup');
    f.followup = [];
    if (await fu.count()) {
      const labels = (await fu.locator('option').allTextContents()).map((s) => s.trim());
      for (const label of labels) {
        await fu.selectOption({ label }).catch(() => {});
        await page.waitForTimeout(1200);
        const ctl = await readControls(page);
        f.followup.push({
          status: label,
          leadQuality: ctl.filter((c) => /quality/i.test(c.id + c.label)).map((c) => ({ id: c.id, options: c.options })),
          ids: ctl.map((c) => c.id).filter(Boolean),
        });
      }
    }
    // item search modal: how many items, and how it reports them
    try {
      const group = page.locator('#item-search-input').locator('xpath=ancestor::div[contains(@class,"input-group")][1]');
      await page.locator('#item-search-input').scrollIntoViewIfNeeded();
      await group.locator('i.ri-search-line').first().click({ timeout: 10000 });
      const modal = page.locator('#searchItemModal');
      await modal.waitFor({ state: 'visible', timeout: 10000 });
      await modal.locator('input[type="text"]').first().fill('');
      await modal.locator('i.ri-search-line').first().click().catch(() => {});
      await page.waitForTimeout(2500);
      f.itemModal = await modal.evaluate((m) => {
        const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
        const rows = [...m.querySelectorAll('table tbody tr')].map((r) => [...r.querySelectorAll('td')].map(txt));
        return { rows: rows.length, items: rows.map((r) => r[0]), prices: rows.map((r) => r[1]),
          note: txt(m.querySelector('.modal-body')).slice(-120), paging: !!m.querySelector('.pagination') };
      });
      for (const term of ['Inverter', 'Camera', 'Laptop']) {
        await modal.locator('input[type="text"]').first().fill(term);
        await modal.locator('i.ri-search-line').first().click().catch(() => {});
        await page.waitForTimeout(1800);
        (f.itemSearch = f.itemSearch || {})[term] = await modal.locator('table tbody tr td:first-child').allInnerTexts();
      }
    } catch (e) { f.itemModalError = String(e.message).split('\n')[0]; }
    audit.forms.enquiry = f;
  } catch (e) { audit.forms.enquiry = { error: String(e.message).split('\n')[0] }; }

  // ── quotation form (defaults) ────────────────────────────────────────────
  try {
    log('form: quotation');
    await page.goto(BASE + '/quotation', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    audit.forms.quotation = {
      url: new URL(page.url()).pathname, openedAt: new Date().toString(),
      controls: await readControls(page),
    };
  } catch (e) { audit.forms.quotation = { error: String(e.message).split('\n')[0] }; }

  // ── task modal ───────────────────────────────────────────────────────────
  try {
    log('form: task modal');
    const tm = new TaskManagementPage(page);
    await tm.gotoHome();
    audit.forms.createNewMenu = await tm.getCreateNewOptions().catch(() => null);
    await tm.openTaskModal();
    const t = { controls: await readControls(page, '#home-create-task-modal, #crm-home-create-task-modal') };
    for (const mode of ['later', 'repeat']) {
      await tm.selectMode(mode);
      t[mode] = (await readControls(page, '#home-create-task-modal, #crm-home-create-task-modal')).map((c) => c.id || c.label).filter(Boolean);
    }
    audit.forms.taskModal = t;
    await page.keyboard.press('Escape').catch(() => {});
  } catch (e) { audit.forms.taskModal = { error: String(e.message).split('\n')[0] }; }

  // ── other forms (read-only) ──────────────────────────────────────────────
  for (const r of ['/bulk-lead-transfer', '/add-complaint', '/add-multiple-lead-tasks']) {
    try {
      log('form', r);
      await page.goto(BASE + r, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      audit.forms[r] = { url: new URL(page.url()).pathname, controls: await readControls(page) };
    } catch (e) { audit.forms[r] = { error: String(e.message).split('\n')[0] }; }
  }

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(audit, null, 2));
  console.log('\nWROTE', path.relative(process.cwd(), OUT));
})().catch((e) => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
