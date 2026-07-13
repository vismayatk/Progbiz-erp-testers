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
    const name = 'DelProbe ' + Date.now();
    const msg = await tm.createTask(name, { type: 'Call', mode: 'later' });
    console.log('save msg:', msg, '| url:', p.url());
    await p.waitForTimeout(4000);
    // dump raw first rows on whatever page we landed on
    const rows = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')]
      .map(r => (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,70)).slice(0, 8));
    console.log('rows after save:', JSON.stringify(rows, null, 1));
    // does the name appear anywhere in the body?
    console.log('name in body:', await p.evaluate((n) => document.body.innerText.includes(n), name));
    // check the Upcoming tab on this page
    await tm.clickTab('Upcoming');
    const rows2 = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')]
      .map(r => (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,70)).slice(0, 6));
    console.log('Upcoming rows:', JSON.stringify(rows2, null, 1));
    console.log('name in body now:', await p.evaluate((n) => document.body.innerText.includes(n), name));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
