'use strict';
/** QA verify ERP-1554: in Daily (Activity) Report, RUNNING tasks show duration "00:00"
 *  like on-hold tasks. Fixed = running tasks show a real elapsed duration. */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.goto(`${login.baseUrl}/daily-activity-report`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('table thead th')].map(t => (t.textContent || '').replace(/\s+/g, ' ').trim());
      const rows = [...document.querySelectorAll('table tbody tr')].slice(0, 30).map(r => {
        const cells = [...r.querySelectorAll('td')].map(c => (c.textContent || '').replace(/\s+/g, ' ').trim());
        const txt = (r.textContent || '').replace(/\s+/g, ' ').trim();
        const status = (txt.match(/running|on ?hold|completed|hold|pending/i) || [''])[0];
        const durs = (txt.match(/\d{1,2}:\d{2}(:\d{2})?/g) || []);
        return { status, durations: durs, cells: cells.slice(0, 8) };
      });
      return { heads, rows };
    });
    console.log('HEADERS:', JSON.stringify(info.heads));
    const running = info.rows.filter(r => /running/i.test(r.status));
    console.log(`\nrows=${info.rows.length} | running rows=${running.length}`);
    running.slice(0, 8).forEach(r => console.log('   RUNNING row durations:', JSON.stringify(r.durations), '|', JSON.stringify(r.cells)));
    // bug = running rows whose only/duration value is 00:00 or 0:00
    const zero = running.filter(r => r.durations.length && r.durations.every(d => /^0?0:00(:00)?$/.test(d)));
    console.log('\nrunning rows showing 00:00:', zero.length, '/', running.length);
    console.log('VERDICT:', running.length === 0
      ? 'INCONCLUSIVE — no running-task rows in the report right now (needs a running task in the report window)'
      : (zero.length > 0 ? 'NOT FIXED — running task(s) still show 00:00 duration'
                         : 'FIXED — running tasks show a real elapsed duration'));
    await page.screenshot({ path: 'screenshots/qa_1554.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
