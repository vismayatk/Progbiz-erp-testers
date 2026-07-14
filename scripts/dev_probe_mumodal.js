'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const A = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext(); const p = await ctx.newPage();
  try {
    const login = new LoginPage(p); const tm = new TaskManagementPage(p);
    await login.goto(); await login.login(A.company, A.username, A.password);
    console.log('after login url:', p.url());
    await p.waitForTimeout(2000);
    // manually do what openTaskModal does
    console.log('#new-task visible:', await p.locator('#new-task').isVisible().catch(()=>false));
    await p.locator('#new-task').click().catch(e=>console.log('new-task click err', e.message.slice(0,40)));
    await p.waitForTimeout(1000);
    console.log('#new-task-item visible:', await p.locator('#new-task-item').isVisible().catch(()=>false));
    const items = await p.evaluate(() => ['new-task-item','new-enquiry-item','new-quotation-item'].map(id => { const e=document.getElementById(id); return e?{id,txt:(e.textContent||'').trim().slice(0,20),vis:e.getClientRects().length>0}:{id,missing:true}; }));
    console.log('create-new items:', JSON.stringify(items));
    await p.locator('#new-task-item').click().catch(e=>console.log('item click err', e.message.slice(0,40)));
    await p.waitForTimeout(2500);
    const modal = await p.evaluate(() => { const m=document.querySelector('#home-create-task-modal'); return m?{shown:m.classList.contains('show')||getComputedStyle(m).display==='block', hasTaskName:!!m.querySelector('#taskName'), taskNameVis: m.querySelector('#taskName')?m.querySelector('#taskName').getClientRects().length>0:false}:'NO MODAL'; });
    console.log('modal state:', JSON.stringify(modal));
    await p.screenshot({ path: 'screenshots/dev_mu_modal.png' });
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
