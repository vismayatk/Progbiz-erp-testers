'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { TaskManagementPage } = require('../pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page); const tm = new TaskManagementPage(page);
  try {
    await login.login(C.company, C.username, C.password); await page.waitForTimeout(1500);
    const name = `LC3 ${Date.now()}`;
    await tm.createViaModal(name, { type: 'Call' });
    console.log('seeded:', name);
    await tm.openTaskDetails(name);
    const hold = await tm.holdTask();
    console.log('hold result:', hold);
    const sHold = await tm.rowStatus(name);
    console.log('ROW status after HOLD:', sHold);
    // reopen, resume, end
    await tm.openTaskDetails(name);
    const resume = await tm.resumeTask();
    console.log('resume result:', resume);
    await tm.openTaskDetails(name);
    const end = await tm.endTask();
    console.log('end result:', end);
    const sEnd = await tm.rowStatus(name);
    console.log('ROW status after END:', sEnd);
    await page.screenshot({ path: 'screenshots/diag_lc3.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
