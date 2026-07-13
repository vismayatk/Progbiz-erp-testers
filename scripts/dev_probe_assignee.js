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
    await tm.openForm('later');
    await tm.rTaskName.fill('AsgProbe');
    await tm.choosePartyIfRequired();
    // dump anything assignee-ish on the page
    const ui = await p.evaluate(() => {
      const vis = (e) => e.getClientRects().length > 0;
      const hits = [...document.querySelectorAll('*')]
        .filter(e => vis(e) && e.children.length <= 2)
        .map(e => ({ tag: e.tagName, id: e.id||'', cls: (e.className||'').toString().slice(0,35),
                     txt: (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,30) }))
        .filter(x => /assign|anjitha|host/i.test(x.id + x.cls + x.txt));
      return hits.slice(0, 12);
    });
    console.log(JSON.stringify(ui, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
