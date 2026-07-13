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
    await p.waitForTimeout(1500);
    const ui = await p.evaluate(() => {
      const m = document.querySelector('#home-create-task-modal') || document.body;
      const vis = (e) => e.getClientRects().length > 0;
      return {
        modes: [...m.querySelectorAll('input[type=radio],button,.btn-group *')].filter(vis)
          .map(e => ({ tag: e.tagName, id: e.id||'', txt: (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,20) }))
          .filter(x => /instant|later|repeat/i.test(x.id + x.txt)).slice(0,6),
        dates: [...m.querySelectorAll('input[type=date],input[type=datetime-local],input[type=time]')]
          .map(e => ({ type: e.type, id: e.id||'', visible: vis(e), value: e.value })).slice(0,8),
        toggles: [...m.querySelectorAll('input[type=checkbox],[role=switch]')].filter(vis)
          .map(e => ({ id: e.id||'', cls: (e.className||'').slice(0,30), checked: e.checked })).slice(0,6),
      };
    });
    console.log(JSON.stringify(ui, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
