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
    const name = 'ProbeLater ' + Date.now();
    const msg = await tm.createTask(name, { type: 'Call', mode: 'later' });
    console.log('save msg:', msg);
    const tab = await tm.findAcrossTabs(name);
    console.log('found under tab:', tab);
    // also check the modal's date inputs presence in 'later' mode for diagnosis
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
