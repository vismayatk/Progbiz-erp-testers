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
    for (const route of ['my-tasks','delegated-tasks']) {
      await p.goto(process.env.BASE_URL + '/' + route, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(4500);
      const firstRow = await p.evaluate(() => {
        const r = document.querySelector('table tbody tr');
        if (!r || !(r.textContent||'').trim()) return null;
        return { text: (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,45),
          ctrls: [...r.querySelectorAll('*')].map(e=>({tag:e.tagName,id:e.id||'',cls:(e.className||'').toString().slice(0,30),title:e.getAttribute('title')||''})).filter(x=>x.id||x.title||/eye|overview|view|action|play|ri-/i.test(x.cls)).slice(0,10) };
      });
      console.log(`${route} first row:`, JSON.stringify(firstRow, null, 1));
      if (firstRow) {
        const r = p.locator('table tbody tr').first();
        // try each plausible opener
        for (const sel of ['[id^="overview-task-"]', '.ri-eye-line', '[title*="overview" i]', 'i.ri-more-2-fill', 'td']) {
          await r.locator(sel).first().click({ timeout: 4000 }).catch(()=>{});
          await p.waitForTimeout(1800);
          const m = await p.evaluate(() => {
            const mm = [...document.querySelectorAll('.modal,.offcanvas')].find(x=>x.classList.contains('show')||getComputedStyle(x).display==='block');
            return mm ? { sel:'HIT', id: mm.id, cls:(mm.className||'').slice(0,30), hasChat: !!mm.querySelector('#txtChat'), inputs:[...mm.querySelectorAll('input,textarea')].map(e=>e.id).filter(Boolean).slice(0,5) } : null;
          });
          if (m) { console.log(`  opener "${sel}" →`, JSON.stringify(m)); break; }
          else console.log(`  opener "${sel}" → no modal`);
        }
        break;
      }
    }
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
