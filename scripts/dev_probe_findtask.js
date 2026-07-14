'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport:{width:1400,height:900} })).newPage();
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    const name = 'Notes ' + Date.now();
    const msg = await tm.createViaModal(name, { type: 'Call', description: 'notes flow' });
    console.log('created, msg:', msg, '| landed:', p.url());
    await p.waitForTimeout(2000);
    for (const route of ['my-tasks','delegated-tasks']) {
      await p.goto(process.env.BASE_URL + '/' + route, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(4000);
      for (const tab of ['Today','Delayed','Upcoming','Unscheduled','Completed']) {
        await tm.clickTab(tab);
        await p.waitForTimeout(1500);
        const hit = await p.evaluate((n) => {
          const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent||'').includes(n));
          return r ? (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,60) : null;
        }, name);
        if (hit) { console.log(`FOUND in ${route}/${tab}: ${hit}`); }
      }
    }
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
