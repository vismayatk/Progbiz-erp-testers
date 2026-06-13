'use strict';

/**
 * Comprehensive CRM module audit (lesol_test).
 * Visits every CRM page and captures: heading, breadcrumb, purpose hints,
 * buttons, filters, search, table columns, form fields (with required/maxlength/
 * pattern), select option sets (status/source values). Does a SAFE empty-submit
 * validation probe on the Enquiry form (blocked by validation -> creates nothing).
 *
 * Output: crm_audit.json  +  screenshots in crm_audit_shots/
 */

require('dotenv').config();
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = 'https://erptest.progbiz.in';
const CO   = 'lesol_test';
const USER = 'admin';
const PASS = '123';

const SHOTS = 'crm_audit_shots';
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);

// CRM module pages (from discovered nav tree)
const PAGES = [
  { name: 'CRM Dashboard',        path: 'crm-dashboard' },
  { name: 'Leads',                path: 'leads' },
  { name: 'FollowUps',            path: 'followups' },
  { name: 'Create Enquiry',       path: 'redirect/enquiry',   form: true },
  { name: 'Create Quotation',     path: 'redirect/quotation', form: true },
  { name: 'Lead Task Assignment', path: 'add-multiple-lead-tasks' },
  { name: 'Dealers',              path: 'dealers' },
  { name: 'Solar Order Forms',    path: 'solar-orders' },
  { name: 'Lead Transfer',        path: 'bulk-lead-transfer' },
  { name: 'Lead Status',          path: 'lead-status' },
  { name: 'Lead Sources',         path: 'lead-sources' },
];

function captureDom() {
  const vis = el => el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0);
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const SWITCHER = el => /^switcher-/.test(el.id) || ['theme-style','direction','navigation-style','navigation-menu-styles','sidemenu-layout-styles','page-styles','layout-width','menu-positions','header-positions','page-loader'].includes(el.name);

  const heading = txt(document.querySelector('.page-title, .main-content-title, h1, h2, h3') || {});
  const breadcrumb = [...document.querySelectorAll('.breadcrumb a, .breadcrumb li, ol.breadcrumb *')]
    .map(txt).filter((v, i, a) => v && a.indexOf(v) === i);

  // Buttons / actions (exclude top nav + theme switcher noise)
  const buttons = [...document.querySelectorAll('button, a.btn, a[id^="btn"], a[id^="tab"]')]
    .filter(vis)
    .filter(el => !/^nav-/.test(el.id) && el.id !== 'mainHeaderProfile' && el.id !== 'messageDropdown' && !/^switcher-/.test(el.id))
    .map(el => ({ tag: el.tagName.toLowerCase(), text: txt(el).slice(0, 50), id: el.id || '' }))
    .filter(b => b.text || b.id)
    .filter((b, i, a) => a.findIndex(x => x.text === b.text && x.id === b.id) === i);

  // Form fields & filters (skip theme switcher radios)
  const allControls = [...document.querySelectorAll('input, select, textarea')]
    .filter(el => el.type !== 'hidden' && !SWITCHER(el));

  const field = el => ({
    tag: el.tagName.toLowerCase(),
    type: el.type || '',
    id: el.id || '',
    name: el.name || '',
    placeholder: el.placeholder || '',
    label: (el.labels && el.labels[0] && txt(el.labels[0])) || (el.getAttribute('aria-label') || ''),
    required: el.required || el.getAttribute('aria-required') === 'true' || /\*/.test((el.labels && el.labels[0] && el.labels[0].textContent) || ''),
    maxLength: el.maxLength > 0 ? el.maxLength : undefined,
    pattern: el.pattern || undefined,
    min: el.min || undefined,
    max: el.max || undefined,
    options: el.tagName === 'SELECT' ? [...el.options].map(o => o.text.trim()).filter(Boolean).slice(0, 20) : undefined,
    visible: vis(el),
  });

  const fields = allControls.map(field);

  // Tables -> columns
  const tables = [...document.querySelectorAll('table')].filter(vis).map(t => ({
    headers: [...t.querySelectorAll('thead th, thead td')].map(txt).filter(Boolean),
    rowCount: t.querySelectorAll('tbody tr').length,
    sampleRow: (() => { const r = t.querySelector('tbody tr'); return r ? txt(r).slice(0, 160) : ''; })(),
  }));

  // Tabs (status buckets on Leads)
  const tabs = [...document.querySelectorAll('[id^="tab-"], .nav-tabs a, .nav-pills a')]
    .filter(vis).map(el => ({ id: el.id || '', text: txt(el).slice(0, 40) })).filter(t => t.text);

  return { url: location.href, title: document.title, heading, breadcrumb, buttons, fields, tables, tabs };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  page.setDefaultTimeout(25000);

  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss().catch(() => {}); });

  // Login
  console.log('🔐 login', USER, '@', CO);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="company_code"], input[id*="company" i]').first().fill(CO);
  await page.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 25000 });
  console.log('✅', page.url());

  const out = { base: BASE, company: CO, capturedAt: 'run-time', pages: [] };

  for (const p of PAGES) {
    const url = `${BASE}/${p.path}`;
    const entry = { name: p.name, requested: url };
    try {
      console.log(`\n── ${p.name} (${p.path}) ──`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2200);
      Object.assign(entry, await page.evaluate(captureDom));
      const slug = p.path.replace(/[^a-z0-9]+/gi, '_');
      await page.screenshot({ path: `${SHOTS}/${slug}.png`, fullPage: true });
      entry.screenshot = `${SHOTS}/${slug}.png`;
      console.log(`   final=${entry.url}`);
      console.log(`   heading="${entry.heading}" buttons=${entry.buttons.length} fields=${entry.fields.length} tables=${entry.tables.length}`);

      // Safe validation probe on enquiry form: click Save with everything empty
      if (p.form && /enquiry/i.test(entry.url)) {
        const validation = await probeValidation(page, 'btn-save-enquiry');
        entry.validationProbe = validation;
        console.log(`   validationProbe: ${JSON.stringify(validation).slice(0, 200)}`);
      }
    } catch (e) {
      entry.error = e.message;
      console.log('   ⚠️', e.message);
    }
    out.pages.push(entry);
  }

  out.dialogs = dialogs;
  fs.writeFileSync('crm_audit.json', JSON.stringify(out, null, 2));
  console.log('\n📄 wrote crm_audit.json  |  📸', SHOTS + '/');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });

async function probeValidation(page, saveBtnId) {
  try {
    const btn = page.locator(`#${saveBtnId}`).first();
    if (await btn.count() === 0) return { note: 'save button not found' };
    await btn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return await page.evaluate(() => {
      const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
      const msgs = [];
      // toastr / sweetalert / inline invalid feedback
      document.querySelectorAll('.toast-message, .toast, .swal2-html-container, .swal2-title, .invalid-feedback, .error, .text-danger, .validation-message, [class*="error"]').forEach(e => {
        const t = txt(e); if (t && t.length < 160) msgs.push(t);
      });
      // HTML5 validity
      const invalid = [...document.querySelectorAll('input,select,textarea')]
        .filter(el => el.willValidate && !el.checkValidity())
        .map(el => ({ id: el.id || el.name, msg: el.validationMessage }));
      return { messages: [...new Set(msgs)].slice(0, 12), html5Invalid: invalid.slice(0, 12) };
    });
  } catch (e) { return { error: e.message }; }
}
