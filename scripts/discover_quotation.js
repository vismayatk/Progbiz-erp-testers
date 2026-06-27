'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const BASE = process.env.BASE_URL;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password); await page.waitForTimeout(1500);
    await page.goto(`${BASE}/quotation`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const d = await page.evaluate(() => {
      const vis = e => e && e.getClientRects().length > 0;
      const ok = s => !/switcher|theme|direction|navigation|sidemenu|page-styles|layout|menu-|header-|example-radios/.test(s || '');
      return {
        url: location.pathname,
        fields: [...document.querySelectorAll('input,select,textarea')].filter(vis).filter(e => ok(e.id || e.name)).map(e => ({ tag: e.tagName, id: e.id, type: e.type, ph: e.placeholder,
          label: (() => { let p = e.closest('div,td'); for (let i = 0; i < 3 && p; i++) { const l = p.querySelector('label,th'); if (l) return l.textContent.replace(/\s+/g, ' ').trim().slice(0, 20); p = p.parentElement; } return ''; })() })).slice(0, 35),
        buttons: [...document.querySelectorAll('button,a.btn')].filter(vis).map(b => ({ id: b.id, txt: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22) })).filter(b => b.id || b.txt).slice(0, 20),
        totalsWords: ['Gross', 'Discount', 'Tax', 'Total', 'Payable', 'Terms', 'Condition'].filter(w => new RegExp(w, 'i').test(document.body.innerText)),
        itemSearch: [...document.querySelectorAll('input')].filter(vis).map(i => ({ id: i.id, ph: i.placeholder })).filter(i => /item|search|rate|qty|quantity|tax|discount/i.test(i.id + i.ph)).slice(0, 10),
      };
    });
    console.log('QUOTATION FORM:', JSON.stringify(d, null, 1));
    await page.screenshot({ path: 'screenshots/discover_quotation.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
