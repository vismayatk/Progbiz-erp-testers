'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);
    for (const menu of ['Master', 'Excel Upload']) {
      // capture links before, click the nav item, capture the new links that appeared
      const before = await page.evaluate(() => new Set([...document.querySelectorAll('a')].filter(a => a.getClientRects().length).map(a => a.getAttribute('href'))).size);
      const item = page.locator('a,span,li').filter({ hasText: new RegExp(`^\\s*${menu}\\s*$`, 'i') }).first();
      await item.click().catch(() => {});
      await page.waitForTimeout(1500);
      const links = await page.evaluate(() =>
        [...document.querySelectorAll('a')].filter(a => a.getClientRects().length)
          .map(a => ({ txt: (a.textContent || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') }))
          .filter(a => a.href && a.href !== 'javascript:void(0);' && a.txt && a.txt.length < 40));
      console.log(`\n===== ${menu} submenu =====`);
      const seen = new Set();
      for (const l of links) {
        const key = l.href;
        if (seen.has(key)) continue; seen.add(key);
        console.log(`  ${l.txt}  ->  /${l.href}`);
      }
      // collapse the menu again
      await item.click().catch(() => {});
      await page.waitForTimeout(600);
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
