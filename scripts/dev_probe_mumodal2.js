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
    // poll for #new-task visibility over time
    for (const t of [2000, 4000, 7000]) {
      await p.waitForTimeout(t - (t===2000?0:t===4000?2000:4000));
      const st = await p.evaluate(() => {
        const nt = document.querySelector('#new-task');
        if (!nt) return { present:false };
        const cs = getComputedStyle(nt);
        const r = nt.getBoundingClientRect();
        return { present:true, vis: nt.getClientRects().length>0, display:cs.display, visibility:cs.visibility, w:Math.round(r.width), h:Math.round(r.height), x:Math.round(r.x), y:Math.round(r.y),
                 parentHidden: (() => { let e=nt.parentElement; while(e){ if(getComputedStyle(e).display==='none') return e.className.slice(0,30); e=e.parentElement;} return false; })() };
      });
      console.log(`@${t}ms #new-task:`, JSON.stringify(st));
      if (st.vis) break;
    }
    // what create-new-ish controls ARE visible?
    const alt = await p.evaluate(() => [...document.querySelectorAll('button,a')].filter(e=>e.getClientRects().length && /create new|add new|new task/i.test(e.textContent||'')).map(e=>({id:e.id,txt:(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,20)})).slice(0,6));
    console.log('visible create-new controls:', JSON.stringify(alt));
    await p.screenshot({ path: 'screenshots/dev_mu_home.png' });
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
