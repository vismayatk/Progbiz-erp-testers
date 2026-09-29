'use strict';
// Time each step of openFirstOpenableTask to find what still blocks TM-24.
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { TaskManagementPage } = require('../../erp/task-management/pages/TaskManagementPage');
const t0 = Date.now(); const ms = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await new LoginPage(p).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD);
    console.log(`[${ms()}] logged in`);
    const tm = new TaskManagementPage(p);
    for (const tab of ['Today', 'Upcoming', 'Delayed']) {
      await tm.gotoMyTasks();                 console.log(`[${ms()}] goto my-tasks (${tab})`);
      await p.waitForTimeout(2000);
      await tm.clickTab(tab);                 console.log(`[${ms()}] clickTab ${tab}`);
      await p.selectOption('#page_size', '100').catch(() => {});
      await p.waitForTimeout(2000);           console.log(`[${ms()}] page_size 100`);
      const cands = await p.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const t = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length)
          .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
        if (!t) return [];
        const hs = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
        const ti = hs.findIndex((h) => /^task type$/i.test(h)), ni = hs.findIndex((h) => /^task$/i.test(h));
        return [...t.querySelectorAll('tbody tr')].map((r, i) => {
          const c = [...r.querySelectorAll('td')].map((td) => clean(td.innerText));
          return { i, type: c[ti] || '', name: c[ni] || '', hasOpener: !!r.querySelector('td a i.ri-send-plane-2-line') };
        });
      });
      const machine = cands.filter((c) => /(^(QA_|TM))|\d{13}/.test(c.name));
      const eligible = machine.filter((c) => c.hasOpener && !/enquiry followup|quotation followup|complaint/i.test(c.type));
      console.log(`[${ms()}] ${tab}: rows=${cands.length} machine-made=${machine.length} eligible=${eligible.length}`);
      console.log(`         machine-made: ${JSON.stringify(machine.slice(0, 5).map((c) => `${c.name} [${c.type}] opener=${c.hasOpener}`))}`);
      if (eligible.length) {
        const c = eligible[0];
        const s = Date.now();
        const ok = await tm._openRowOverview(p.locator('table tbody tr').nth(c.i));
        console.log(`[${ms()}] _openRowOverview("${c.name}") -> ${ok}  (took ${((Date.now() - s) / 1000).toFixed(1)}s)`);
        if (ok) { console.log(`         #txtChat visible: ${await p.locator('#txtChat').isVisible().catch(() => false)}`); break; }
      }
    }
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0]); }
  finally { await b.close(); console.log(`[${ms()}] done`); }
})();
