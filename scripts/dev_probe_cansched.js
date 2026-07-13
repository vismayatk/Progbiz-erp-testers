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
      console.log('SAVE canSchedule:', j.canSchedule, '| start:', j.scheduledStartTime, '| finishBefore:', j.finishBefore);
    }
  });
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    const name = 'SchedTgl ' + Date.now();
    await tm.openForm('later');
    await tm.rTaskType.selectOption({ index: 1 }).catch(() => {});
    await tm.rTaskName.fill(name);
    await tm.choosePartyIfRequired();
    await tm.ensureSelfHost();
    // turn the schedule toggle ON
    const tgl = p.locator('#instantDeadlineToggle');
    await p.$eval('#instantDeadlineToggle', el => el.click()).catch(e => console.log('js tgl err', e.message.slice(0,50)));
    await p.waitForTimeout(1200);
    console.log('toggle checked:', await tgl.isChecked().catch(() => 'n/a'));
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const dIns = p.locator('input[type="date"]:visible');
    for (let i = 0; i < await dIns.count(); i++) { await dIns.nth(i).fill(d).catch(() => {}); await dIns.nth(i).blur().catch(() => {}); }
    const tIns = p.locator('input[type="time"]:visible');
    for (let i = 0; i < await tIns.count(); i++) { await tIns.nth(i).fill('10:00').catch(() => {}); await tIns.nth(i).blur().catch(() => {}); }
    await p.waitForTimeout(800);
    await tm.rSave.click(); await p.waitForTimeout(3000);
    console.log('save msg:', await tm._afterSave());
    // check delegated badges + search Upcoming
    await tm.gotoDelegated(); await p.waitForTimeout(3500);
    const badges = await p.evaluate(() => [...document.querySelectorAll('li.nav-item')].map(li => (li.textContent||'').replace(/\s+/g,' ').trim()).slice(0,5));
    console.log('delegated badges:', JSON.stringify(badges));
    console.log('findInDelegated:', await tm.findInDelegated(name));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
