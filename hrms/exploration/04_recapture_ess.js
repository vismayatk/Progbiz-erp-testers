'use strict';
/**
 * HRMS exploration — targeted re-capture of the ESS pages that loaded lazily
 * (dashboard / profile / probation render after an async workspace fetch).
 * Longer settle + section/label extraction. Output: overwrites the 4 page JSONs.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://hrms-erp.progbiz.in';
const DATA = path.join(__dirname, '..', 'data', 'pages');
const SHOTS = path.join(__dirname, '..', 'screenshots', 'ess');
const ROUTES = ['ess', 'ess/profile', 'ess/probation', 'ess/requests'];
const safe = (r) => r.replace(/[\/]/g, '__');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const company = page.locator('#companycode, input[name="company_code"]').first();
  await company.waitFor({ state: 'visible', timeout: 45000 });
  await company.fill('Hrms');
  await page.locator('#signin-username, input[id*="user" i]').first().fill('vismaya');
  await page.locator('#signin-password, input[type="password"]').first().fill('123');
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });
  await page.waitForTimeout(2500);

  for (const route of ROUTES) {
    await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    // wait for the "Loading" placeholder to disappear
    await page.waitForFunction(() => !/loading/i.test(document.body.innerText.slice(0, 400)), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const info = await page.evaluate(() => {
      const txt = (el) => (el && el.innerText || '').trim().replace(/\s+/g, ' ');
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const main = document.querySelector('main, .main-content, [class*="content-wrapper" i], [class*="page-content" i]') || document.body;
      const sectionTitles = Array.from(main.querySelectorAll('h1,h2,h3,h4,h5,.card-title,.card-header,[class*="section-title" i],[class*="widget" i] [class*="title" i]'))
        .filter(vis).map(txt).filter(Boolean).slice(0, 25);
      const buttons = [...new Set(Array.from(main.querySelectorAll('button, a.btn')).filter(vis).map(txt).filter(t => t && t.length < 45))].slice(0, 40);
      const labels = Array.from(main.querySelectorAll('label, .form-label, .field-label, dt, th'))
        .filter(vis).map(txt).filter(Boolean).slice(0, 50);
      const stats = Array.from(main.querySelectorAll('[class*="stat" i], [class*="kpi" i], [class*="metric" i], [class*="tile" i]'))
        .filter(vis).map(txt).filter(Boolean).slice(0, 20);
      const tabs = Array.from(main.querySelectorAll('[role="tab"], .nav-tabs a, .nav-pills a')).filter(vis).map(txt).filter(Boolean).slice(0, 20);
      return { sectionTitles, buttons, labels, stats, tabs, bodySnippet: txt(main).slice(0, 1500) };
    });

    const rec = { route, finalUrl: page.url(), group: 'ess', recaptured: true, ...info };
    fs.writeFileSync(path.join(DATA, `${safe(route)}.json`), JSON.stringify(rec, null, 2));
    await page.screenshot({ path: path.join(SHOTS, `${safe(route)}.png`), fullPage: false });
    console.log(`  ✓ ${route} — sections:[${info.sectionTitles.slice(0, 6).join(' | ')}]`);
  }

  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
