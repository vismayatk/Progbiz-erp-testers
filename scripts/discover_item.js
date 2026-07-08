'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const BASE = process.env.BASE_URL;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);
    for (const slug of ['item', 'items']) {
      await page.goto(`${BASE}/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const d = await page.evaluate(() => {
        const vis = e => e.getClientRects().length > 0;
        return {
          url: location.pathname,
          inputs: [...document.querySelectorAll('input,select,textarea')].filter(vis).filter(e => !/switcher|theme|direction|navigation|sidemenu|page-styles|layout|menu-|header-/.test(e.id + e.name)).map(e => ({ tag: e.tagName, id: e.id, type: e.type, ph: e.placeholder, label: (e.closest('div')?.querySelector('label')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20) })).slice(0, 25),
          priceField: [...document.querySelectorAll('input')].filter(vis).map(i => ({ id: i.id, ph: i.placeholder })).filter(i => /price|rate|amount|cost|mrp/i.test(i.id + i.ph)),
          cols: [...document.querySelectorAll('table thead th')].map(t => t.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
          actionIcons: [...document.querySelectorAll('table tbody tr')][0] ? [...document.querySelectorAll('table tbody tr')[0].querySelectorAll('a,button,i')].map(e => (e.getAttribute('class') || '') + '|' + (e.getAttribute('title') || '')).filter(c => /edit|delete|pencil|trash|bin|view/i.test(c)).slice(0, 6) : [],
          saveBtns: [...document.querySelectorAll('button,a.btn')].filter(vis).map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(t => /save|update|cancel|new item|add item/i.test(t)).slice(0, 8),
        };
      });
      console.log(`\n=== /${slug} ===`); console.log(JSON.stringify(d, null, 1));
    }
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
