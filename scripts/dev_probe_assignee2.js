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
      console.log('SAVE assignees:', JSON.stringify((j.assigneeList || []).map(a => a.label)),
        '| scheduledStartTime:', j.scheduledStartTime);
    }
  });
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    const name = 'HostFix ' + Date.now();
    await tm.openForm('later');
    await tm.rTaskType.selectOption({ index: 1 }).catch(() => {});
    await tm.rTaskName.fill(name);
    await tm.choosePartyIfRequired();
    console.log('host add result:', await tm.addHostByName('Biju'));
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const dateIn = p.locator('input[type="date"]:visible').first();
    await dateIn.fill(d); await dateIn.blur();
    const timeIn = p.locator('input[type="time"]:visible').first();
    await timeIn.fill('10:00'); await timeIn.blur();
    await p.waitForTimeout(800);
    await tm.rSave.click();
    await p.waitForTimeout(3000);
    const msg = await tm._afterSave();
    console.log('save msg:', msg);
    console.log('found under:', await tm.findAcrossTabs(name));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
