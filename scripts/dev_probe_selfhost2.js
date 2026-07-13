'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  p.on('request', (r) => {
    if (r.method() === 'POST' && /save-task/i.test(r.url()) && r.postData()) {
      const j = JSON.parse(r.postData());
      console.log('SAVE assignees:', (j.assigneeList || []).map(a => a.label).join(','), '| start:', j.scheduledStartTime);
    }
  });
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    const name = 'SelfFix2 ' + Date.now();
    const msg = await tm.createTask(name, { type: 'Call', mode: 'later' });
    console.log('save msg:', msg);
    console.log('found under:', await tm.findAcrossTabs(name));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
