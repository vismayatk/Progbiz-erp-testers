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
    await p.waitForTimeout(1500);
    const modal = await p.evaluate(() => {
      const m = document.querySelector('#home-create-task-modal');
      if (!m) return 'NO MODAL';
      const vis = (e) => e.getClientRects().length > 0;
      return {
        shown: m.classList.contains('show') || getComputedStyle(m).display === 'block',
        fields: [...m.querySelectorAll('input:not([type=hidden]),select,textarea')]
          .map(e => ({ tag: e.tagName, type: e.type||'', id: e.id, ph: e.placeholder||'', visible: vis(e) })).slice(0, 25),
      };
    });
    console.log(JSON.stringify(modal, null, 1));
  } catch (e) { console.log('FATAL', e.message); } finally { await b.close(); }
})();
