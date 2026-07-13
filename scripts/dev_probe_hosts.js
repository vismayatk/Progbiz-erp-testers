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
    await tm.rTaskName.fill('HostUI');
    await tm.choosePartyIfRequired();
    await p.locator('.add-host-btn').first().click();
    await p.waitForTimeout(1200);
    const ui = await p.evaluate(() => {
      const vis = (e) => e.getClientRects().length > 0;
      return {
        searchBoxes: [...document.querySelectorAll('input')].filter(e => vis(e) && /search/i.test(e.placeholder||'')).map(e => ({ id: e.id, ph: e.placeholder })),
        rows: [...document.querySelectorAll('.form-check, li, label')].filter(vis)
          .map(e => ({ tag: e.tagName, cls: (e.className||'').toString().slice(0,30), txt: (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,25),
                       hasInput: !!e.querySelector('input') }))
          .filter(x => x.txt && /biju|anjitha|hafneetha|arshida/i.test(x.txt)).slice(0, 8),
        doneBtns: [...document.querySelectorAll('button')].filter(e => vis(e) && /done/i.test(e.textContent||'')).length,
      };
    });
    console.log(JSON.stringify(ui, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
