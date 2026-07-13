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
    const name = 'ProbeLater2 ' + Date.now();
    await tm.openForm('later');
    await tm.rTaskType.selectOption({ index: 1 }).catch(() => {});
    await tm.rTaskName.fill(name);
    await tm.choosePartyIfRequired();
    // fill dates AFTER party pick
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await p.locator('input[type="date"]:visible').first().fill(d);
    await p.locator('input[type="time"]:visible').first().fill('10:00');
    const vals = await p.evaluate(() => [...document.querySelectorAll('input[type=date],input[type=time]')]
      .filter(e => e.getClientRects().length).map(e => ({ type: e.type, value: e.value })));
    console.log('date/time before save:', JSON.stringify(vals));
    await tm.rSave.click();
    await p.waitForTimeout(2500);
    const msg = await tm._afterSave();
    console.log('save msg:', msg);
    console.log('found under tab:', await tm.findAcrossTabs(name));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
