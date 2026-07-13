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
    const name = 'LaterTask ' + Date.now();          // same prefix as TM-04
    const msg = await tm.createTask(name, { type: 'Call', mode: 'later' });
    console.log('save msg:', msg, '| url after save:', p.url());
    console.log('tabContains(Upcoming):', await tm.tabContains(name, 'Upcoming'));
    console.log('findAcrossTabs:', await tm.findAcrossTabs(name));
    // dump Upcoming rows to see what's actually there
    await tm.gotoMyTasks(); await tm.clickTab('Upcoming');
    const rows = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map(r => (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,60)).slice(0,6));
    console.log('Upcoming rows:', JSON.stringify(rows, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
