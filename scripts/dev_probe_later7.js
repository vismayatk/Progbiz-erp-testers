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
    if (r.method() === 'POST' && /task/i.test(r.url()) && r.postData()) {
      console.log('POST', r.url().replace(/^https?:\/\/[^/]+/, ''));
      console.log('BODY:', (r.postData() || '').slice(0, 600));
    }
  });
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    const name = 'NetProbe ' + Date.now();
    const msg = await tm.createTask(name, { type: 'Call', mode: 'later' });
    console.log('save msg:', msg);
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
