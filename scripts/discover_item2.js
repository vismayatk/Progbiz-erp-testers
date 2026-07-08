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
    await page.goto(`${BASE}/item`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const all = await page.evaluate(() => {
      const vis = e => e.getClientRects().length > 0;
      const ok = s => !/switcher|theme|direction|navigation|sidemenu|page-styles|layout|menu-|header-/.test(s || '');
      return [...document.querySelectorAll('input,select,textarea')].filter(vis).filter(e => ok(e.id || e.name)).map(e => ({ tag: e.tagName, id: e.id, name: e.name, type: e.type, ph: e.placeholder, cls: (e.className || '').slice(0, 25),
        label: (() => { let p = e.closest('td,div'); for (let i = 0; i < 3 && p; i++) { const l = p.querySelector('label,th'); if (l) return l.textContent.replace(/\s+/g, ' ').trim().slice(0, 18); p = p.parentElement; } return ''; })() }));
    });
    console.log('ALL /item inputs:', JSON.stringify(all, null, 1));
    // variant table headers
    const vcols = await page.evaluate(() => [...document.querySelectorAll('table thead th, table th')].map(t => t.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 15));
    console.log('variant table headers:', JSON.stringify(vcols));
    await page.screenshot({ path: 'screenshots/discover_item_form.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
