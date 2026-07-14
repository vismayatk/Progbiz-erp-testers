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
    await tm.gotoMyTasks();
    for (const tab of ['Today','Delayed','Upcoming','Unscheduled','Completed']) {
      await tm.clickTab(tab);
      await p.waitForFunction(() => [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent||'').trim().length>5), { timeout: 8000 }).catch(()=>{});
      const html = await p.evaluate(() => {
        const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent||'').trim().length>5);
        return r ? r.querySelector('td').outerHTML.replace(/\s+/g,' ').slice(0,400) : null;
      });
      console.log(`${tab}: ${html ? 'ACTIONS ' + html : 'empty'}`);
      if (html) {
        const r = p.locator('table tbody tr').first();
        for (const sel of ['[id^="overview-task-"]','.ri-eye-line','.ri-eye-fill','.ri-arrow-right-line','td:nth-child(4)']) {
          const loc = r.locator(sel).first();
          if (!(await loc.count())) continue;
          await loc.click().catch(()=>{}); await p.waitForTimeout(2000);
          const m = await p.evaluate(() => { const mm=[...document.querySelectorAll('.modal,.offcanvas')].find(x=>x.classList.contains('show')||getComputedStyle(x).display==='block'); return mm?{id:mm.id,hasChat:!!mm.querySelector('#txtChat'),ff:!!mm.querySelector('.fe-paperclip,.ri-attachment-line')}:null; });
          if (m) { console.log(`  opener "${sel}" →`, JSON.stringify(m)); return; }
        }
        console.log('  no opener worked on this row');
        return;
      }
    }
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
