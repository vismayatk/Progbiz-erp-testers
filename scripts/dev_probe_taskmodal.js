'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  try {
    await new LoginPage(p).login(C.company, C.username, C.password);
    // open Create New → Task
    await p.locator('#new-task').click(); await p.waitForTimeout(800);
    await p.locator('#new-task-item').click().catch(() => {});
    await p.waitForTimeout(2000);
    const modal = await p.evaluate(() => {
      const m = document.querySelector('#home-create-task-modal');
      if (!m) return 'NO MODAL';
      return {
        fields: [...m.querySelectorAll('input:not([type=hidden]),select,textarea')]
          .filter(e => e.getClientRects().length)
          .map(e => ({ tag: e.tagName, type: e.type||'', id: e.id, ph: e.placeholder||'' })).slice(0, 20),
        partyish: [...m.querySelectorAll('*')]
          .filter(e => e.getClientRects().length && /party/i.test((e.id||'') + (e.className||'') + (e.placeholder||'') + (e.childElementCount === 0 ? e.textContent||'' : '')))
          .map(e => ({ tag: e.tagName, id: e.id, cls: (e.className||'').slice(0,40), txt: (e.textContent||'').replace(/\s+/g,' ').trim().slice(0,30) })).slice(0, 10),
      };
    });
    console.log(JSON.stringify(modal, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
