'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const A = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  try {
    await new LoginPage(p).login(A.company, A.username, A.password);
    await p.waitForTimeout(3000);
    await p.locator('#new-lead-type').click().catch(e=>console.log('lead-type err',e.message.slice(0,40)));
    await p.waitForTimeout(1200);
    const itemVis = await p.locator('#new-task-item').isVisible().catch(()=>false);
    console.log('#new-task-item visible after toggle:', itemVis);
    await p.locator('#new-task-item').click().catch(e=>console.log('item click err',e.message.slice(0,40)));
    await p.waitForTimeout(3000);
    const after = await p.evaluate(() => ({
      url: location.pathname,
      homeModal: (() => { const m=document.querySelector('#home-create-task-modal'); return m?{shown:m.classList.contains('show')||getComputedStyle(m).display==='block', hasTaskName:!!m.querySelector('#taskName')}:null; })(),
      anyModalShown: [...document.querySelectorAll('.modal')].filter(m=>m.classList.contains('show')||getComputedStyle(m).display==='block').map(m=>m.id||m.className.slice(0,25)),
      taskNameAnywhere: (() => { const t=document.querySelector('#taskName'); return t?{vis:t.getClientRects().length>0, inModal: !!t.closest('.modal')}:null; })(),
    }));
    console.log('after #new-task-item click:', JSON.stringify(after, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
