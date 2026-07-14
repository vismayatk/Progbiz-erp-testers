'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    await tm.gotoDelegated();
    // click Today tab (badge 8 earlier) and wait for real rows
    await tm.clickTab('Today');
    await p.waitForFunction(() => [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent||'').trim().length>5), { timeout: 15000 }).catch(()=>{});
    await p.waitForTimeout(2000);
    await p.screenshot({ path: 'screenshots/dev_delegated_row.png' });
    const first = await p.evaluate(() => {
      const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent||'').trim().length>5);
      return r ? r.outerHTML.replace(/\s+/g,' ').slice(0, 700) : 'still empty';
    });
    console.log('FIRST ROW HTML:', first);
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
