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
    await tm.gotoMyTasks(); await p.waitForTimeout(4000);
    const badges = await p.evaluate(() => [...document.querySelectorAll('li.nav-item')].map(li => (li.textContent||'').replace(/\s+/g,' ').trim()).slice(0,5));
    console.log('my-tasks badges:', JSON.stringify(badges));
    for (const tab of ['Upcoming', 'Unscheduled']) {
      await tm.clickTab(tab); await p.waitForTimeout(2000);
      const hit = await p.evaluate(() => document.body.innerText.includes('SchedTgl'));
      const rows = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(r => (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,55)).slice(0,4));
      console.log(`${tab}: SchedTgl visible=${hit}`, JSON.stringify(rows));
    }
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
