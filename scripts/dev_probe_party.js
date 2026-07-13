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
    await tm.openTaskModal();
    await p.waitForTimeout(1000);
    const modal = p.locator('#home-create-task-modal');
    // group controls around partySearch
    const ctl = await p.evaluate(() => {
      const inp = document.querySelector('#partySearch');
      const grp = inp && inp.closest('.input-group');
      return grp ? [...grp.querySelectorAll('i,button')].map(e => ({ tag: e.tagName, id: e.id||'', cls: (e.className||'').slice(0,40) })) : 'no group';
    });
    console.log('party group controls:', JSON.stringify(ctl));
    await modal.locator('#partySearch').fill('a');
    // click the search icon in the group
    await modal.locator('#partySearch').locator('xpath=ancestor::div[contains(@class,"input-group")][1]')
      .locator('i.ri-search-line').first().click().catch(e => console.log('icon err', e.message.slice(0,50)));
    await p.waitForTimeout(2500);
    const after = await p.evaluate(() => {
      const m2 = [...document.querySelectorAll('.modal')].filter(m => m.classList.contains('show') || getComputedStyle(m).display === 'block').map(m => m.id);
      const sugg = [...document.querySelectorAll('#home-create-task-modal li, #home-create-task-modal table tbody tr, .modal.show table tbody tr')]
        .filter(e => e.getClientRects().length)
        .map(e => (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,40)).filter(Boolean).slice(0,6);
      return { openModals: m2, sugg };
    });
    console.log(JSON.stringify(after, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
