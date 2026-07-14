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
    const name = 'DetProbe2 ' + Date.now();
    await tm.createViaModal(name, { type: 'Call', description: 'details probe' });
    for (const page_ of ['my-tasks', 'delegated-tasks']) {
      await p.goto(process.env.BASE_URL + '/' + page_, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(4000);
      const found = await p.evaluate((n) => {
        const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent||'').includes(n));
        if (!r) return null;
        return { ctrls: [...r.querySelectorAll('*')].map(e => ({ tag: e.tagName, id: e.id||'', cls: (e.className||'').toString().slice(0,35) })).filter(x => x.id.includes('task') || /eye|overview|action|play|view/i.test(x.cls)).slice(0,8) };
      }, name);
      console.log(`${page_}: ${found ? 'FOUND — ' + JSON.stringify(found.ctrls) : 'not here'}`);
      if (found) {
        // click overview-task control
        const r = p.locator('table tbody tr').filter({ hasText: name }).first();
        const ov = r.locator('[id^="overview-task-"]').first();
        if (await ov.count()) { await ov.click().catch(e=>console.log('ov err',e.message.slice(0,40))); }
        else { await r.locator('.ri-eye-line, [title*="view" i], [title*="overview" i]').first().click().catch(e=>console.log('eye err',e.message.slice(0,40))); }
        await p.waitForTimeout(2500);
        const modal = await p.evaluate(() => {
          const m = [...document.querySelectorAll('.modal,.offcanvas')].find(m => m.classList.contains('show') || getComputedStyle(m).display==='block');
          return m ? { id: m.id, hasChat: !!m.querySelector('#txtChat'), inputs: [...m.querySelectorAll('input,textarea')].map(e=>e.id).filter(Boolean).slice(0,6) } : 'none';
        });
        console.log('  modal:', JSON.stringify(modal));
        break;
      }
    }
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
