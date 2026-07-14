'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const type of ['Activities', 'Project Task', 'Complaint', 'Offline Meeting']) {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    try {
      await new LoginPage(p).login(C.company, C.username, C.password);
      const tm = new TaskManagementPage(p);
      const name = `NP ${type} ${Date.now()}`;
      await tm.openTaskModal();
      await tm.branchSelect.evaluate(s => { if (!s.value) s.selectedIndex = 0; }).catch(()=>{});
      const ok = await tm.taskTypeSelect.selectOption({ label: type }).then(()=>true).catch(()=>false);
      if (!ok) { console.log(`${type}: NOT a valid type here`); await ctx.close(); continue; }
      await tm.taskInput.fill(name);
      // deliberately SKIP party — click save and read the result
      await tm.saveBtn.click();
      await p.waitForTimeout(2500);
      const msg = await tm._afterSave().catch(e => 'ERR:'+e.message.slice(0,40));
      console.log(`${type}: save msg = ${JSON.stringify(msg)} | url=${p.url().replace(/^https?:\/\/[^/]+/,'')}`);
    } catch (e) { console.log(`${type}: FATAL ${e.message.slice(0,50)}`); }
    finally { await ctx.close(); }
  }
  await b.close();
})();
