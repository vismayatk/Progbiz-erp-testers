'use strict';
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL;
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await new LoginPage(p).login(process.env.COMPANY_CODE, process.env.CRM_USERNAME, process.env.PASSWORD);
    await p.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4500);
    console.log(' ', JSON.stringify(await p.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const body = clean(document.body.innerText);
      return {
        sections: ["Today's Schedule", 'Running Tasks', 'On Hold'].filter((s) => new RegExp(s.replace(/'/g, "'?"), 'i').test(body)),
        iconPlay: document.querySelectorAll('.ri-play-fill').length,
        iconPause: document.querySelectorAll('.ri-pause-fill').length,
        iconStop: document.querySelectorAll('.ri-stop-fill').length,
        biPlay: document.querySelectorAll('[class*="bi-play"]').length,
        biPause: document.querySelectorAll('[class*="bi-pause"]').length,
        biStop: document.querySelectorAll('[class*="bi-record"],[class*="bi-stop"]').length,
        idStart: document.querySelectorAll('[id^="start-task-btn"]').length,
        idResume: document.querySelectorAll('[id^="resume-task-btn"]').length,
        idEnd: document.querySelectorAll('[id^="end-task-btn"]').length,
        timers: (body.match(/\d\d:\d\d:\d\d/g) || []).length,
        holdMentions: (body.match(/QA_HOLD_\d+/g) || []).slice(0, 2),
      };
    })));
    await p.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
    const rows = await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()).filter((t) => /QA_HOLD_/.test(t)));
    console.log('  my-tasks rows for QA_HOLD_*:', JSON.stringify(rows.slice(0, 3)));
    console.log('  tabs:', JSON.stringify(await p.locator('li.nav-item').allInnerTexts().catch(() => [])));
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0]); }
  finally { await b.close(); }
})();
