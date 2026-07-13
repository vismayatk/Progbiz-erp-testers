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
    await tm.openForm('later');
    await tm.rTaskType.selectOption({ index: 1 }).catch(() => {});
    await tm.rTaskName.fill('DiagLater ' + Date.now());
    await tm.choosePartyIfRequired();
    const dump = () => p.evaluate(() => [...document.querySelectorAll('input[type=date],input[type=time],input[type=datetime-local]')]
      .filter(e => e.getClientRects().length)
      .map(e => {
        const label = e.closest('div')?.parentElement?.querySelector('label')?.textContent?.trim() || '';
        return { type: e.type, id: e.id || '', label: label.slice(0, 25), value: e.value };
      }));
    console.log('AFTER PARTY, visible date/time inputs:', JSON.stringify(await dump(), null, 1));
    // fill first date+time as createTask does
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await p.locator('input[type="date"]:visible').first().fill(d);
    await p.locator('input[type="time"]:visible').first().fill('10:00');
    await p.waitForTimeout(800);
    console.log('AFTER FILL:', JSON.stringify(await dump(), null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
