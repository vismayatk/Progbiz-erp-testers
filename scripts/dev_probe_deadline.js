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
      console.log('SAVE finishBefore:', j.finishBefore, '| scheduledStartTime:', j.scheduledStartTime,
        '| assignees:', (j.assigneeList || []).map(a => a.label).join(','));
    }
  });
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    const name = 'DeadlineFix ' + Date.now();
    await tm.openForm('later');
    await tm.rTaskType.selectOption({ index: 1 }).catch(() => {});
    await tm.rTaskName.fill(name);
    await tm.choosePartyIfRequired();
    // enable the deadline toggle, then dump date inputs
    await p.locator('#instantDeadlineToggle').click({ force: true }).catch(e => console.log('tgl err', e.message.slice(0,50)));
    await p.waitForTimeout(1200);
    const dates = await p.evaluate(() => [...document.querySelectorAll('input[type=date],input[type=time],input[type=datetime-local]')]
      .filter(e => e.getClientRects().length).map(e => ({ type: e.type, value: e.value })));
    console.log('date inputs after toggle:', JSON.stringify(dates));
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    // fill ALL visible date inputs (schedule + deadline) and times
    const dIns = p.locator('input[type="date"]:visible');
    for (let i = 0; i < await dIns.count(); i++) { await dIns.nth(i).fill(d).catch(() => {}); await dIns.nth(i).blur().catch(() => {}); }
    const tIns = p.locator('input[type="time"]:visible');
    for (let i = 0; i < await tIns.count(); i++) { await tIns.nth(i).fill('10:00').catch(() => {}); await tIns.nth(i).blur().catch(() => {}); }
    await p.waitForTimeout(800);
    await tm.rSave.click(); await p.waitForTimeout(3000);
    console.log('save msg:', await tm._afterSave());
    console.log('found under:', await tm.findAcrossTabs(name));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
