'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  for (let i = 1; i <= 3; i++) {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    try {
      await new LoginPage(p).login(C.company, C.username, C.password);
      const tm = new TaskManagementPage(p);
      const name = `FlakeTest${i} ` + Date.now();
      const msg = await tm.createTask(name, { type: 'Call', mode: 'later' });
      const tab = await tm.findAcrossTabs(name);
      console.log(`RUN ${i}: msg=${msg} tab=${tab}`);
    } catch (e) { console.log(`RUN ${i}: FATAL`, e.message.slice(0, 80)); }
    finally { await ctx.close(); }
  }
  await b.close();
})();
