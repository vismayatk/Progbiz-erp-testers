'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    await p.goto(process.env.BASE_URL + '/leads', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(5000);
    // Playwright selectOption on the select that has a Quotation option
    const typeSel = p.locator('select').filter({ has: p.locator('option', { hasText: /^Quotation$/ }) }).first();
    await typeSel.selectOption({ label: 'Quotation' });
    await p.locator('button').filter({ hasText: /Apply Filter/i }).first().click();
    await p.waitForTimeout(5000);
    const rows = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(r => (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,70)));
    console.log(`rows after Type=Quotation (selectOption): ${rows.length}`);
    rows.slice(0,5).forEach(r => console.log('  ', r));
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
