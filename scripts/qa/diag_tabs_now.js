'use strict';
// Cheap: one page load, click each tab, report counts + machine-made candidates.
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL;
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await new LoginPage(p).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD);
    await p.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000);
    console.log('  #page_size present on /my-tasks:', await p.locator('#page_size').count());
    console.log('  tab labels:', JSON.stringify(await p.locator('li.nav-item').allInnerTexts().catch(() => [])));
    for (const tab of ['Today', 'Delayed', 'Upcoming', 'Unscheduled', 'Completed']) {
      const s = Date.now();
      await p.locator('li.nav-item').filter({ hasText: new RegExp(`^\\s*${tab}\\s*\\d*\\s*$`, 'i') }).locator('button, a').first().click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(2500);
      const info = await p.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const t = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length)
          .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
        if (!t) return { rows: 0, cands: [] };
        const hs = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
        const ti = hs.findIndex((h) => /^task type$/i.test(h)), ni = hs.findIndex((h) => /^task$/i.test(h));
        const rows = [...t.querySelectorAll('tbody tr')].map((r, i) => {
          const c = [...r.querySelectorAll('td')].map((td) => clean(td.innerText));
          return { i, type: c[ti] || '', name: c[ni] || '', opener: !!r.querySelector('td a i.ri-send-plane-2-line') };
        }).filter((r) => r.name && !/^no data$/i.test(r.name));
        return { rows: rows.length,
          cands: rows.filter((r) => r.opener && !/enquiry followup|quotation followup|complaint/i.test(r.type) && /(^(QA_|TM))|\d{13}/.test(r.name)).slice(0, 4) };
      });
      console.log(`  ${tab.padEnd(12)} ${((Date.now() - s) / 1000).toFixed(1)}s  rows=${info.rows}  machine-made openable=${info.cands.length} ${JSON.stringify(info.cands.map((c) => `${c.name} [${c.type}]`))}`);
    }
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0]); }
  finally { await b.close(); }
})();
