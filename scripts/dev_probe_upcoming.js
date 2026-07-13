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
    await p.waitForTimeout(4000);
    await tm.clickTab('Upcoming');
    await p.waitForTimeout(4000);
    await p.screenshot({ path: 'screenshots/dev_upcoming_tab.png', fullPage: false });
    const state = await p.evaluate(() => ({
      badges: [...document.querySelectorAll('li.nav-item')].map(li => (li.textContent||'').replace(/\s+/g,' ').trim()).slice(0,6),
      rowsHtml: [...document.querySelectorAll('table tbody tr')].slice(0,3).map(r => r.innerHTML.replace(/\s+/g,' ').slice(0, 150)),
    }));
    console.log(JSON.stringify(state, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
