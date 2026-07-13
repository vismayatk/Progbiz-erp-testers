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
      console.log('SAVE assignees:', (j.assigneeList || []).map(a => a.label).join(','),
        '| start:', j.scheduledStartTime, '| finishBefore:', j.finishBefore);
    }
  });
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    // debug the self-name resolution + host button presence mid-flow
    await tm.openForm('later');
    await tm.rTaskName.fill('SelfDbg');
    await tm.choosePartyIfRequired();
    const dbg = await p.evaluate(() => ({
      headerText: (document.querySelector('li.header-element')?.textContent || '').replace(/\s+/g,' ').trim().slice(0, 50),
      hostBtns: document.querySelectorAll('.add-host-btn').length,
    }));
    console.log('DBG:', JSON.stringify(dbg));
    console.log('ensureSelfHost →', await tm.ensureSelfHost());
    const name = 'SelfFix ' + Date.now();
    await tm.rTaskName.fill(name);
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const dIn = p.locator('input[type="date"]:visible').first(); await dIn.fill(d); await dIn.blur();
    const tIn = p.locator('input[type="time"]:visible').first(); await tIn.fill('10:00'); await tIn.blur();
    await p.waitForTimeout(800);
    await tm.rSave.click(); await p.waitForTimeout(3000);
    console.log('save msg:', await tm._afterSave());
    console.log('found under:', await tm.findAcrossTabs(name));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
