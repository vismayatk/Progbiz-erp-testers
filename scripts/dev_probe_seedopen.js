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
    const name = 'SeedOpen ' + Date.now();
    // later mode via the modal (createViaModal supports mode:'later')
    const msg = await tm.createViaModal(name, { type: 'Call', mode: 'later', description: 'seed' });
    console.log('created later, msg:', msg);
    const opened = await tm.openTaskDetails(name);
    console.log('openTaskDetails →', opened);
    if (opened) {
      const menu = await p.evaluate(() => [...document.querySelectorAll('#task-overview-modal .dropdown-item, #task-overview-modal button, #task-overview-modal a')].map(e=>(e.textContent||'').trim()).filter(t=>/hold|end|edit|reschedul|lead/i.test(t)).slice(0,6));
      console.log('overview menu:', JSON.stringify(menu));
    }
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
