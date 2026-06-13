'use strict';
require('dotenv').config();
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = 'https://erptest.progbiz.in', CO = 'lesol_test', USER = 'admin', PASS = '123';
const SHOTS = 'crm_shots';

const TARGETS = [
  'followups', 'redirect/quotation', 'add-multiple-lead-tasks', 'dealers',
  'solar-orders', 'bulk-lead-transfer', 'lead-status', 'lead-sources', 'enquiry-upload',
];

function summarize() {
  const vis = el => el.offsetParent !== null;
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const heading = txt(document.querySelector('h1,h2,h3,.page-title,.main-content-title') || document.body).slice(0, 100);
  const breadcrumb = [...document.querySelectorAll('.breadcrumb a, .breadcrumb li')].map(txt).filter(Boolean);
  const tables = [...document.querySelectorAll('table')].filter(vis).map(t => ({
    headers: [...t.querySelectorAll('thead th, thead td')].map(txt).filter(Boolean),
    rowCount: t.querySelectorAll('tbody tr').length,
  }));
  const fields = [...document.querySelectorAll('input,select,textarea')].filter(vis)
    .filter(el => el.type !== 'hidden' && !/^switcher-/.test(el.id) && !/theme|direction|navigation|layout|menu|page-|header|loader/.test(el.name))
    .map(el => ({ tag: el.tagName.toLowerCase(), type: el.type||'', id: el.id||'', placeholder: el.placeholder||'',
      label: (el.labels&&el.labels[0]&&txt(el.labels[0]))||'',
      options: el.tagName==='SELECT'?[...el.options].map(o=>o.text.trim()).slice(0,10):undefined }))
    .slice(0, 40);
  const actions = [...document.querySelectorAll('button, a.btn, .btn')].filter(vis)
    .map(el => txt(el).slice(0,30)).filter(Boolean).filter(t => !/Theme|Reset|Progbiz/.test(t)).slice(0, 25);
  const tabs = [...document.querySelectorAll('.nav-tabs a, .nav-tabs button, [role=tab], .tab')].filter(vis).map(txt).filter(Boolean).slice(0,12);
  return { url: location.href, heading, breadcrumb, tables, fieldCount: fields.length, fields, actions, tabs };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(25000);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="company_code"], input[id*="company" i]').first().fill(CO);
  await page.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 25000 });

  const out = [];
  for (const t of TARGETS) {
    const url = `${BASE}/${t}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2500);
      const d = await page.evaluate(summarize);
      d.requested = t;
      const slug = t.replace(/[^a-z0-9]+/gi,'_');
      await page.screenshot({ path: `${SHOTS}/sub_${slug}.png`, fullPage: true });
      out.push(d);
      console.log(`✔ ${t} → "${d.heading}" landed=${d.url} tables=${d.tables.length} fields=${d.fieldCount} tabs=[${d.tabs.join(', ')}]`);
    } catch (e) {
      out.push({ requested: t, error: e.message });
      console.log(`✖ ${t}: ${e.message}`);
    }
  }
  fs.writeFileSync('crm_submodules_report.json', JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
