'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport:{width:1400,height:900} })).newPage();
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    const tm = new TaskManagementPage(p);
    const name = 'DelOpen ' + Date.now();
    await tm.createViaModal(name, { type: 'Call', mode: 'later', description: 'x' });
    await p.waitForTimeout(2000);
    // find it in delegated (search each tab)
    let where = null;
    await tm.gotoDelegated();
    for (const tab of ['Today','Upcoming','Unscheduled','Delayed','Completed']) {
      await tm.clickTab(tab); await p.waitForTimeout(1500);
      if (await p.evaluate(n => [...document.querySelectorAll('table tbody tr')].some(r=>(r.textContent||'').includes(n)), name)) { where = tab; break; }
    }
    console.log('found in delegated tab:', where);
    if (where) {
      const r = p.locator('table tbody tr').filter({ hasText: name }).first();
      // enumerate action-cell controls
      const ctrls = await r.locator('td').first().locator('a,button,i').evaluateAll(els => els.map(e => ({ tag:e.tagName, cls:(e.className||'').toString().slice(0,30), icon: e.querySelector('i')?.className || (e.tagName==='I'?e.className:'') })));
      console.log('action controls:', JSON.stringify(ctrls));
      // click the send-plane specifically
      await r.locator('.ri-send-plane-2-line').first().click().catch(e=>console.log('send err',e.message.slice(0,40)));
      await p.waitForTimeout(2500);
      const m = await p.evaluate(() => { const mm=document.querySelector('#task-overview-modal'); return mm && (mm.classList.contains('show')||getComputedStyle(mm).display==='block') ? 'OVERVIEW OPENED' : (document.querySelector('.swal2-popup')?'SWAL: '+document.querySelector('.swal2-title,.swal2-html-container')?.textContent?.trim().slice(0,40):'nothing'); });
      console.log('after send-plane:', m);
    }
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
