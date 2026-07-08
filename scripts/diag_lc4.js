'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const hdr = () => { const m = document.querySelector('#task-overview-modal'); if (!m) return { closed: true }; const vis = e => e.getClientRects().length > 0;
  return { btns: [...m.querySelectorAll('button')].filter(vis).map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(t => /hold|end|resume|start/i.test(t)).slice(0,5),
           status: [...m.querySelectorAll('.badge,span')].filter(vis).map(e => e.textContent.trim()).filter(t => /running|hold|completed|paused|not started/i.test(t)).slice(0,4) }; };
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page); const tm = new TaskManagementPage(page);
  try {
    await login.login(C.company, C.username, C.password); await page.waitForTimeout(1500);
    const name = `LC4 ${Date.now()}`;
    await tm.createViaModal(name, { type: 'Call' });
    await tm.openTaskDetails(name);
    console.log('OPEN:', JSON.stringify(await page.evaluate(hdr)));
    const hold = await tm.holdTask();
    console.log('hold result:', hold, '| PANEL:', JSON.stringify(await page.evaluate(hdr)));
    await page.screenshot({ path: 'screenshots/diag_lc4_hold.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
