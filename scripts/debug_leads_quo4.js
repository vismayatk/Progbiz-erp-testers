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
    // find + click a filter toggle
    const toggles = await p.evaluate(() => [...document.querySelectorAll('button, a')].map(e => ({ id: e.id, txt: (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,20), icon: e.querySelector('i')?.className || '' })).filter(x => /filter/i.test(x.id + x.txt + x.icon)).slice(0,5));
    console.log('toggle candidates:', JSON.stringify(toggles));
    const tid = toggles.find(t => t.id)?.id;
    if (tid) await p.locator('#' + tid).click();
    else await p.locator('button, a').filter({ hasText: /filter/i }).first().click().catch(()=>{});
    await p.waitForTimeout(1200);
    const typeSel = p.locator('select').filter({ has: p.locator('option', { hasText: /^Quotation$/ }) }).first();
    await typeSel.selectOption({ label: 'Quotation' });
    await p.locator('button').filter({ hasText: /Apply Filter/i }).first().click();
    await p.waitForTimeout(5000);
    const rows = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(r => (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,70)));
    console.log(`rows after Type=Quotation: ${rows.length}`);
    rows.slice(0,5).forEach(r => console.log('  ', r));
  } catch(e){ console.log('ERR', e.message);} finally { await b.close(); }
})();
