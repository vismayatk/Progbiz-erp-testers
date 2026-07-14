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
    const name = 'ActProbe ' + Date.now();
    await tm.openTaskModal();
    await tm.branchSelect.evaluate(s => { if (!s.value) s.selectedIndex = 0; }).catch(()=>{});
    await tm.taskTypeSelect.selectOption({ label: 'Activities' });
    await tm.taskInput.fill(name);
    await tm.descInput.fill('activities probe').catch(()=>{});
    await tm.saveBtn.click(); await p.waitForTimeout(2500);
    const msg = await tm._afterSave();
    console.log('save msg:', msg);
    // find in my-tasks
    let found = null;
    await tm.gotoMyTasks(); await p.waitForTimeout(3000);
    for (const tab of ['Today','Delayed','Upcoming','Unscheduled','Completed']) {
      await tm.clickTab(tab); await p.waitForTimeout(1200);
      if (await p.evaluate(n => [...document.querySelectorAll('table tbody tr')].some(r=>(r.textContent||'').includes(n)), name)) { found = tab; break; }
    }
    console.log('found in my-tasks tab:', found);
    // try opening details
    const opened = await tm.openTaskDetails(name);
    console.log('openTaskDetails →', opened);
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
