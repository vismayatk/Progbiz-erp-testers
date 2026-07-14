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
    const r = p.locator('table tbody tr').filter({ hasText: /Running|Scheduled|Hold|Finished/ }).first();
    await r.locator('td').nth(0).locator('a,button,i').first().click().catch(()=>{});
    await p.waitForSelector('#task-overview-modal.show', { timeout: 8000 }).catch(()=>{});
    await p.waitForTimeout(2500);
    const m = await p.evaluate(() => {
      const mm = document.querySelector('#task-overview-modal');
      if (!mm) return 'none';
      return {
        chat: !!mm.querySelector('#txtChat'),
        sendBtn: !!mm.querySelector('.btn-send'),
        paperclip: !!mm.querySelector('.fe-paperclip, .ri-attachment-line, .ri-attachment-2, [class*="attach"]'),
        fileInput: !!mm.querySelector('#file-input-document, input[type=file]'),
        menuDots: !!mm.querySelector('.ri-more-2-fill, .ri-more-2-line, [data-bs-toggle="dropdown"]'),
        menuItems: [...mm.querySelectorAll('.dropdown-item, [role="menuitem"], button, a')].map(e=>(e.textContent||'').replace(/\s+/g,' ').trim()).filter(t=>/edit|reschedul|hold|resume|end|lead|delete|note|complete|start/i.test(t)).slice(0,12),
        inputs: [...mm.querySelectorAll('input,textarea')].map(e=>({id:e.id,ph:e.placeholder||''})).filter(x=>x.id||x.ph).slice(0,8),
      };
    });
    console.log(JSON.stringify(m, null, 1));
    await p.screenshot({ path: 'screenshots/dev_task_overview.png' });
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
