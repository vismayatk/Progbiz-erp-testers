'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const BASE = process.env.BASE_URL;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  try {
    // LOGIN PAGE with proper wait
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.locator('input[name="company_code"], input[id*="company" i]').first().waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1000);
    console.log('=== LOGIN PAGE ===', JSON.stringify(await page.evaluate(() => {
      const vis = e => e.getClientRects().length > 0;
      return {
        inputs: [...document.querySelectorAll('input')].filter(vis).map(i => ({ id: i.id, name: i.name, type: i.type, ph: i.placeholder })),
        eye: [...document.querySelectorAll('i,span,button')].filter(vis).map(e => e.getAttribute('class') || '').filter(c => /eye|show|toggle.*pass|ri-eye/i.test(c)).slice(0, 5),
        checkboxes: [...document.querySelectorAll('input[type=checkbox]')].map(c => ({ id: c.id, label: (c.closest('label,div')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 25) })),
        forgot: [...document.querySelectorAll('a,button')].filter(vis).map(a => ({ txt: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 25), href: a.getAttribute('href') })).filter(a => /forgot|reset/i.test(a.txt)),
      };
    }), null, 1));

    const login = new LoginPage(page);
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // Click CRM in the left nav and dump submenu
    const crm = page.locator('a,button,span,li').filter({ hasText: /^\s*CRM\s*$/i }).first();
    await crm.click().catch(() => {});
    await page.waitForTimeout(1500);
    const menu = await page.evaluate(() => {
      const vis = e => e.getClientRects().length > 0;
      return [...document.querySelectorAll('a')].filter(vis).map(a => ({ txt: (a.textContent || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') })).filter(a => a.txt && a.txt.length < 30 && (a.href || /dashboard|lead|enquiry|followup|home|report/i.test(a.txt))).slice(0, 40);
    });
    console.log('\n=== CRM submenu links ===', JSON.stringify(menu, null, 1));
    await page.screenshot({ path: 'screenshots/discover_crm_menu.png' }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
