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
    const check = async (label) => {
      const st = await p.evaluate(() => ({ newTask: !!document.querySelector('#new-task'), newTaskVis: document.querySelector('#new-task')?.getClientRects().length>0,
        newLeadType: !!document.querySelector('#new-lead-type'), url: location.pathname }));
      console.log(label, JSON.stringify(st));
    };
    await p.waitForTimeout(3000); await check('post-login');
    // explicit goto /home (what openTaskModal's gotoHome does)
    await p.goto(process.env.BASE_URL + '/home', { waitUntil: 'domcontentloaded' });
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
    await p.waitForTimeout(3000); await check('after goto /home');
    // click #new-lead-type to see if Task appears
    if (await p.locator('#new-lead-type').isVisible().catch(()=>false)) {
      await p.locator('#new-lead-type').click().catch(()=>{});
      await p.waitForTimeout(1500);
      const opts = await p.evaluate(() => [...document.querySelectorAll('a,button,li,.dropdown-item')].filter(e=>e.getClientRects().length).map(e=>({id:e.id||'',txt:(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,18)})).filter(x=>/task|enquiry|quotation|lead|meeting/i.test(x.txt+x.id)).slice(0,10));
      console.log('new-lead-type menu:', JSON.stringify(opts));
    }
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
