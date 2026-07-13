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
    await p.goto(process.env.BASE_URL + '/my-tasks', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    const tabs = await p.evaluate(() =>
      [...document.querySelectorAll('li.nav-item')].filter(e => e.getClientRects().length)
        .map(li => ({
          txt: (li.textContent||'').replace(/\s+/g,' ').trim().slice(0,25),
          inner: li.querySelector('button,a') ? { tag: li.querySelector('button,a').tagName, id: li.querySelector('button,a').id, cls: (li.querySelector('button,a').className||'').slice(0,40) } : null,
        })).slice(0, 8));
    console.log('tabs:', JSON.stringify(tabs, null, 1));
    const top = () => p.evaluate(() => (document.querySelector('table tbody tr')?.textContent||'').replace(/\s+/g,' ').trim().slice(0,50));
    console.log('top row before:', await top());
    // strategy 1: li>button click on "Completed"
    await p.locator('li.nav-item').filter({ hasText: /Completed/i }).locator('button,a').first().click().catch(e => console.log('s1 err', e.message.slice(0,60)));
    await p.waitForTimeout(3500);
    console.log('top row after Completed click:', await top());
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
