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
    const name = `LC5 ${Date.now()}`;
    await tm.createViaModal(name, { type: 'Call' });
    await tm.openTaskDetails(name);
    const hold = await tm.holdTask();
    const confirmStillOpen = await page.getByText(/Are you sure you want to hold/i).isVisible().catch(() => false);
    console.log('hold result:', hold, '| Hold-confirm still open:', confirmStillOpen);
    const st = await tm.rowStatus(name);
    console.log('ROW status after HOLD:', st);
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
