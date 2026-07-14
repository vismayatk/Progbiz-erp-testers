'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    await tm.gotoMyTasks(); await tm.clickTab('Today');
    await p.waitForFunction(() => [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent||'').trim().length>5), { timeout: 10000 }).catch(()=>{});
    await p.waitForTimeout(1500);
    await p.screenshot({ path: 'screenshots/dev_mytasks_today.png' });
    // the action cell (td[0]) — click its button and see if a menu opens
    const r = p.locator('table tbody tr').filter({ hasText: /Running|Scheduled|Hold|Finished/ }).first();
    await r.locator('td').nth(0).locator('a,button,i').first().click().catch(e=>console.log('act err',e.message.slice(0,40)));
    await p.waitForTimeout(2000);
    const after = await p.evaluate(() => ({
      url: location.href.replace(/^https?:\/\/[^/]+/,''),
      openModal: [...document.querySelectorAll('.modal,.offcanvas,.dropdown-menu.show')].filter(x=>x.classList.contains('show')||getComputedStyle(x).display==='block').map(x=>({id:x.id,cls:(x.className||'').slice(0,30)})),
    }));
    console.log('after action-btn click:', JSON.stringify(after));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
