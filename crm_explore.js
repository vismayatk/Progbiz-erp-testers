'use strict';

/**
 * CRM Dashboard + CRM Module live exploration (lesol_test).
 * Maps sidebar submenu, dashboard widgets, listing tables and forms.
 * Writes findings to crm_explore_report.json and screenshots to crm_shots/.
 */

require('dotenv').config();
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = 'https://erptest.progbiz.in';
const CO   = 'lesol_test';
const USER = 'admin';
const PASS = '123';

const SHOTS = 'crm_shots';
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);

const report = { base: BASE, company: CO, pages: [] };
const log = (...a) => console.log(...a);

function summarizeDom() {
  // Runs in the browser
  const vis = el => el.offsetParent !== null || (el.getClientRects && el.getClientRects().length);
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();

  const heading = txt(document.querySelector('h1,h2,h3,.page-title,.main-content-title,.breadcrumb-title') || document.body).slice(0, 120);
  const breadcrumb = [...document.querySelectorAll('.breadcrumb a, .breadcrumb li, nav[aria-label="breadcrumb"] a')]
    .map(txt).filter(Boolean);

  // KPI / stat cards
  const cards = [...document.querySelectorAll('.card, .stat, .widget, .info-box, .counter')]
    .filter(vis)
    .map(c => txt(c).slice(0, 100))
    .filter(t => t.length > 1)
    .slice(0, 30);

  // Tables
  const tables = [...document.querySelectorAll('table')].filter(vis).map(t => ({
    headers: [...t.querySelectorAll('thead th, thead td')].map(txt).filter(Boolean),
    rowCount: t.querySelectorAll('tbody tr').length,
  }));

  // Form fields
  const fields = [...document.querySelectorAll('input, select, textarea')]
    .filter(vis)
    .filter(el => el.type !== 'hidden')
    .map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      id: el.id || '',
      name: el.name || '',
      placeholder: el.placeholder || '',
      label: (el.labels && el.labels[0] && txt(el.labels[0])) || '',
      options: el.tagName === 'SELECT' ? [...el.options].map(o => o.text.trim()).slice(0, 15) : undefined,
    }))
    .slice(0, 60);

  // Action buttons
  const buttons = [...document.querySelectorAll('a.btn, button, a[href]')]
    .filter(vis)
    .map(el => ({ tag: el.tagName.toLowerCase(), text: txt(el).slice(0, 40), id: el.id || '', href: el.getAttribute('href') || '' }))
    .filter(b => b.text || b.id)
    .slice(0, 50);

  return { url: location.href, heading, breadcrumb, cards, tables, fields, buttons };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(25000);

  // ── Login ──
  log('🔐 Logging in as', USER, '@', CO);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="company_code"], input[id*="company" i]').first().fill(CO);
  await page.locator('input[name="username"], input[id*="user" i]').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForFunction(() => !location.href.includes('/login'), { timeout: 25000 });
  log('✅ Logged in →', page.url());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/00_home.png`, fullPage: true });

  // ── Full sidebar structure ──
  const sidebar = await page.evaluate(() => {
    const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('.side-menu__item, .app-sidebar a, aside a, nav a')]
      .filter(el => el.offsetParent !== null)
      .map(el => ({ text: txt(el).slice(0, 40), href: el.getAttribute('href') || '' }))
      .filter(x => x.text);
  });
  report.sidebar = sidebar;
  log('\n── Sidebar links ──');
  sidebar.forEach(s => log(`  ${s.text}  →  ${s.href}`));

  // ── Expand CRM submenu ──
  log('\n── Expanding CRM ──');
  try {
    await page.locator('.side-menu__item, a, span', { hasText: /^\s*CRM\s*$/i }).first().click();
    await page.waitForTimeout(900);
  } catch (e) { log('  CRM click note:', e.message); }
  await page.screenshot({ path: `${SHOTS}/01_crm_expanded.png`, fullPage: true });

  const crmSub = await page.evaluate(() => {
    const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('.slide-menu a, .sub-slide-menu a, ul.slide-menu a, .side-menu a')]
      .filter(el => el.offsetParent !== null)
      .map(el => ({ text: txt(el).slice(0, 40), href: el.getAttribute('href') || '' }))
      .filter(x => x.text && x.href && x.href !== '#' && !/^javascript/i.test(x.href));
  });
  report.crmSubmenu = crmSub;
  log('CRM submenu:');
  crmSub.forEach(s => log(`  ${s.text}  →  ${s.href}`));

  // ── Candidate CRM URLs to visit ──
  const candidates = new Set([
    'crm-dashboard', 'crm', 'leads', 'enquiry',
    ...crmSub.map(s => s.href.replace(/^.*\/(?=[^/]+$)/, '').replace(/^\//, '')),
    ...crmSub.map(s => s.href),
  ]);

  for (const c of candidates) {
    if (!c) continue;
    const url = c.startsWith('http') ? c : `${BASE}/${c.replace(/^\//, '')}`;
    try {
      log(`\n── Visiting ${url} ──`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1800); // allow ajax widgets
      const data = await page.evaluate(summarizeDom);
      const slug = c.replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
      const shot = `${SHOTS}/page_${slug}.png`;
      await page.screenshot({ path: shot, fullPage: true });
      data.screenshot = shot;
      data.requested = url;
      report.pages.push(data);
      log(`  heading="${data.heading}" tables=${data.tables.length} fields=${data.fields.length} cards=${data.cards.length}`);
    } catch (e) {
      log(`  ⚠️ ${url} failed: ${e.message}`);
      report.pages.push({ requested: url, error: e.message });
    }
  }

  fs.writeFileSync('crm_explore_report.json', JSON.stringify(report, null, 2));
  log('\n📄 Wrote crm_explore_report.json');
  log('📸 Screenshots in', SHOTS + '/');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
