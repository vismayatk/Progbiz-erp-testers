'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  const login = new LoginPage(p);
  try {
    await login.login(C.company, C.username, C.password);
    await p.waitForTimeout(2000);
    const snap = () => p.evaluate(() => [...document.querySelectorAll('a')].filter(a => a.getClientRects().length).map(a => `${(a.textContent || '').replace(/\s+/g, ' ').trim()}|${a.getAttribute('href')}`));
    const before = new Set(await snap());
    // the sidebar expands on HOVER (theme "Menu Hover" style)
    const master = p.locator('.side-menu__label, span, a').filter({ hasText: /^\s*Master\s*$/i }).first();
    await master.hover().catch(() => {});
    await p.waitForTimeout(2000);
    let fresh = (await snap()).filter(x => !before.has(x));
    if (!fresh.length) {           // fallback: hover the parent li, then force-open submenus in DOM
      await master.locator('xpath=ancestor::li[1]').hover().catch(() => {});
      await p.waitForTimeout(1500);
      fresh = (await snap()).filter(x => !before.has(x));
    }
    if (!fresh.length) {           // last resort: read the hidden submenu anchors from the DOM
      fresh = await p.evaluate(() => {
        const li = [...document.querySelectorAll('li')].find(l => /^\s*Master\b/.test((l.querySelector('span,a')?.textContent || '')));
        if (!li) return [];
        return [...li.querySelectorAll('a')].map(a => `${(a.textContent || '').replace(/\s+/g, ' ').trim()}|${a.getAttribute('href')}`).filter(x => !x.startsWith('Master|'));
      });
      console.log('(read hidden DOM anchors)');
    }
    console.log('MASTER submenu links:');
    [...new Set(fresh)].forEach(f => console.log('  ', f));
    await p.screenshot({ path: 'screenshots/master_menu.png' });
  } catch (e) { console.log('ERR:', e.message); } finally { await b.close(); }
})();
