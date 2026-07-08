'use strict';
/** Capture GET /api/app/v1/get-running-tasks and get-is-task-running response
 *  bodies to confirm the BACKEND reports >1 running task. */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const hits = [];
  page.on('response', async (res) => {
    const u = res.request().url();
    if (/get-running-tasks|get-is-task-running/i.test(u)) {
      const body = await res.text().catch(() => '');
      hits.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), status: res.status(), body });
    }
  });
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);   // lands on /home; the widget fetches ~once
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(8000);   // give the lazy running-tasks widget time to fetch
    for (const h of hits) {
      console.log(`\n[${h.status}] ${h.url}`);
      console.log(h.body.slice(0, 1600));
      // count running-status entries in the body
      const runMatches = (h.body.match(/"taskStatus"\s*:\s*"?running"?|"status"\s*:\s*"?running"?|"isRunning"\s*:\s*true|"statusID"\s*:\s*1\b/gi) || []);
      const taskNames = (h.body.match(/"task"\s*:\s*"[^"]{1,40}"/gi) || []).slice(0, 8);
      console.log('   --- running-status markers:', runMatches.length, '| task names:', JSON.stringify(taskNames));
    }
    if (!hits.length) console.log('No get-running-tasks / get-is-task-running calls captured.');
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
