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
    const name = 'DetProbe ' + Date.now();
    await tm.createViaModal(name, { type: 'Call', description: 'details probe' });
    // land where the save redirected (delegated-tasks); find the row
    await p.waitForTimeout(3000);
    console.log('url after save:', p.url());
    const rowInfo = await p.evaluate((n) => {
      const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent||'').includes(n));
      if (!r) return 'ROW NOT FOUND on ' + location.pathname;
      return { rowText: (r.textContent||'').replace(/\s+/g,' ').trim().slice(0,50),
        controls: [...r.querySelectorAll('a,button,i,[id]')].map(e => ({ tag: e.tagName, id: e.id||'', cls: (e.className||'').toString().slice(0,30), title: e.getAttribute('title')||'' })).filter(x => x.id || x.title || /overview|eye|action|play/i.test(x.cls)).slice(0,8) };
    }, name);
    console.log('row:', JSON.stringify(rowInfo, null, 1));
    // try clicking the overview control
    const r = p.locator('table tbody tr').filter({ hasText: name }).first();
    await r.locator('[id^="overview-task-"], .ri-eye-line, [title*="overview" i], [title*="view" i]').first().click().catch(e => console.log('overview click err', e.message.slice(0,50)));
    await p.waitForTimeout(2500);
    const modal = await p.evaluate(() => {
      const m = [...document.querySelectorAll('.modal, .offcanvas')].find(m => m.classList.contains('show') || getComputedStyle(m).display === 'block');
      if (!m) return 'NO DETAILS MODAL';
      return { id: m.id, cls: (m.className||'').slice(0,40),
        hasChat: !!m.querySelector('#txtChat'),
        noteBoxes: [...m.querySelectorAll('input,textarea')].map(e => ({ id: e.id, ph: e.placeholder||'' })).slice(0,6),
        menuBtns: [...m.querySelectorAll('button,a')].map(e => ({ id: e.id||'', txt: (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,18) })).filter(x=>x.txt||x.id).slice(0,12) };
    });
    console.log('details modal:', JSON.stringify(modal, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
