'use strict';
/**
 * HRMS exploration — step 1
 * Login to https://hrms-erp.progbiz.in/ and capture the navigation structure:
 *  - post-login landing URL
 *  - sidebar / menu items (text + href), including collapsed groups
 *  - full list of <a> elements after expanding menu groups
 * Output: hrms/data/nav.json + screenshots
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://hrms-erp.progbiz.in';
const OUT = path.join(__dirname, '..', 'data');
const SHOTS = path.join(__dirname, '..', 'screenshots');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  console.log('→ opening login page');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SHOTS, '00_login.png'), fullPage: true });

  // login form — same pattern as erptest build (#companycode, #signin-username, #signin-password)
  const company = page.locator('#companycode, input[name="company_code"], input[id*="company" i], input[placeholder*="company" i]').first();
  const user    = page.locator('#signin-username, input[name="username"], input[id*="user" i], input[placeholder*="user" i]').first();
  const pass    = page.locator('#signin-password, input[type="password"]').first();

  await company.waitFor({ state: 'visible', timeout: 45000 });
  await company.fill('Hrms');
  await user.fill('vismaya');
  await pass.fill('123');
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });
  await page.waitForTimeout(4000);

  const landing = page.url();
  console.log('✅ logged in, landing:', landing);
  await page.screenshot({ path: path.join(SHOTS, '01_landing.png'), fullPage: true });

  // Try to expand every collapsible menu group (common patterns)
  const expanders = page.locator('nav [data-bs-toggle], nav .has-sub > a, aside [data-bs-toggle], .sidebar [data-bs-toggle="collapse"], .sidebar .menu-item.has-children > a');
  const nExp = await expanders.count().catch(() => 0);
  console.log('menu expanders found:', nExp);
  for (let i = 0; i < nExp; i++) {
    await expanders.nth(i).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: path.join(SHOTS, '02_menu_expanded.png'), fullPage: true });

  // Dump every anchor on the page with its text, href and rough location (sidebar vs elsewhere)
  const anchors = await page.evaluate(() => {
    const inNav = (el) => !!el.closest('nav, aside, .sidebar, [class*="sidebar" i], [class*="side-nav" i], [class*="menu" i]');
    return Array.from(document.querySelectorAll('a')).map(a => ({
      text: (a.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      href: a.getAttribute('href'),
      nav: inNav(a),
      cls: (a.className && a.className.toString ? a.className.toString() : '').slice(0, 80),
    })).filter(x => x.href || x.text);
  });

  // Also dump the sidebar's visible text tree for structure
  const navText = await page.evaluate(() => {
    const el = document.querySelector('nav, aside, .sidebar, [class*="sidebar" i]');
    return el ? el.innerText : '(no sidebar element found)';
  });

  // Capture top-level DOM skeleton to understand app shell
  const shell = await page.evaluate(() => {
    const walk = (el, depth) => {
      if (depth > 3) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 100) || undefined,
        children: Array.from(el.children).map(c => walk(c, depth + 1)).filter(Boolean),
      };
    };
    return walk(document.body, 0);
  });

  fs.writeFileSync(path.join(OUT, 'nav.json'), JSON.stringify({ landing, anchors, navText, shell }, null, 2));
  console.log(`anchors captured: ${anchors.length}`);
  console.log('--- sidebar text ---\n' + navText.slice(0, 2000));

  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
