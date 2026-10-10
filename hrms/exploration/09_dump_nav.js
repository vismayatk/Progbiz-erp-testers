'use strict';
/* Read-only: dump the live left-nav of hrms-test from a known-good page.
   Blazor renders menu items as <a href> (NavLink) and/or click-handler <li>/<span>. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
require('dotenv').config();

(async () => {
  const base = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ storageState: path.join(__dirname, '..', '.auth', 'state.json'), viewport: { width: 1600, height: 1400 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/employees`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  if (page.url().includes('/login')) throw new Error('auth state expired');

  // Expand collapsible menu groups a few times (Blazor accordions).
  for (let pass = 0; pass < 4; pass++) {
    const groups = await page.locator('#side-menu a, #side-menu li, nav a, aside a, .metismenu a, [class*="menu" i] > ul > li > a').all().catch(() => []);
    for (const g of groups) {
      const href = await g.getAttribute('href').catch(() => null);
      const exp = await g.getAttribute('aria-expanded').catch(() => null);
      if ((!href || href === '#' || exp === 'false')) await g.click({ timeout: 800 }).catch(() => {});
    }
    await page.waitForTimeout(300);
  }

  const data = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[href]')]
      .map(a => ({ label: (a.innerText || a.title || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') }))
      .filter(l => l.href && l.href !== '#' && !l.href.startsWith('javascript') && !/^https?:/.test(l.href));
    // Menu item TEXTS even without href (Blazor @onclick). Scope to anything that looks like a nav list.
    const menuRoots = document.querySelectorAll('#side-menu, nav, aside, .metismenu, [class*="side" i][class*="menu" i], ul.menu');
    const items = new Set();
    menuRoots.forEach(root => root.querySelectorAll('li, a, span.menu-title, .menu-text').forEach(e => {
      const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
      if (t && t.length < 40 && !/\n/.test(t)) items.add(t);
    }));
    return { anchors, items: [...items] };
  });

  const seen = new Set(), uniq = [];
  for (const l of data.anchors) { const k = l.href; if (!seen.has(k)) { seen.add(k); uniq.push(l); } }
  fs.writeFileSync(path.join(__dirname, '_forms', '_nav_live.json'), JSON.stringify({ anchors: uniq, items: data.items }, null, 1));
  console.log(`ANCHORS (${uniq.length}):`);
  for (const l of uniq) console.log('  ' + String(l.href).padEnd(40), l.label);
  console.log(`\nMENU ITEM TEXTS (${data.items.length}):`);
  console.log('  ' + data.items.join(' | '));
  await browser.close();
})().catch(e => { console.error('NAV ERROR:', e.message); process.exit(1); });
