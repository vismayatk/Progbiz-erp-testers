'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL;
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const look = async (route) => {
    await p.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000);
    const r = await p.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const t = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length)
        .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
      const rows = t ? [...t.querySelectorAll('tbody tr')].map((x) => clean(x.innerText)).filter((x) => x && !/^no data$/i.test(x)) : [];
      const tabs = [...document.querySelectorAll('li.nav-item')].map((e) => clean(e.innerText)).filter(Boolean);
      return { rows: rows.length, sample: rows.slice(0, 3).map((x) => x.slice(0, 80)), tabs };
    });
    console.log(`  ${route.padEnd(22)} rows=${r.rows} tabs=${JSON.stringify(r.tabs)}`);
    r.sample.forEach((s) => console.log(`      ${s}`));
  };
  try {
    await new LoginPage(p).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD);
    await p.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000);
    const cards = await p.evaluate(() => {
      const body = (document.body.innerText || '').replace(/\s+/g, ' ');
      const pick = (l) => (body.match(new RegExp(l + '\\s+(\\d[\\d,]*)', 'i')) || [])[1] || null;
      return { pending: pick('Pending Tasks'), delayed: pick('Delayed Tasks'), completed: pick('Completed Tasks'), unscheduled: pick('Unscheduled') };
    });
    console.log('  home cards:', JSON.stringify(cards), ' (2026-09-18: pending 24 · delayed 38 · completed 20 · unscheduled 0)');
    for (const r of ['/my-tasks', '/delegated-tasks', '/created-tasks', '/todo-list', '/unscheduled-tasks']) await look(r);
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0]); }
  finally { await b.close(); }
})();
