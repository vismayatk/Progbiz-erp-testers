'use strict';
/**
 * TECHNICAL ROOT-CAUSE (black-box / network level): capture the API calls the app
 * makes when starting a task, to pinpoint WHERE the single-active-task rule fails.
 *   - Which endpoint returns the "running tasks" list (does the BACKEND report >1 running?)
 *   - What endpoint/payload starts a task
 *   - Does the frontend call any "hold/pause other tasks" endpoint on start?
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

const RELEVANT = /task|running|hold|pause|start|end|home|dashboard|activity|timer|status/i;
const IGNORE = /\.(js|css|png|jpg|jpeg|svg|woff|woff2|ttf|ico|map)(\?|$)/i;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const calls = [];

  page.on('response', async (res) => {
    try {
      const req = res.request();
      const url = req.url();
      if (IGNORE.test(url)) return;
      if (!RELEVANT.test(url)) return;
      const method = req.method();
      if (!/POST|GET|PUT|PATCH/.test(method)) return;
      let payload = req.postData();
      let body = '';
      const ct = (res.headers()['content-type'] || '');
      if (/json|text/.test(ct)) { body = (await res.text().catch(() => '')).slice(0, 900); }
      calls.push({ method, status: res.status(), url: url.replace(/^https?:\/\/[^/]+/, ''), payload: (payload || '').slice(0, 300), body });
    } catch { /* ignore */ }
  });

  const login = new LoginPage(page); const tm = new TaskManagementPage(page);
  try {
    await login.login(C.company, C.username, C.password);

    // 1) Home load — which endpoint returns running tasks?
    calls.length = 0;
    await page.goto(`${login.baseUrl}/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
    console.log('\n========== /home API CALLS (looking for the running-tasks list) ==========');
    for (const c of calls) {
      const runHit = /running|"status"\s*:\s*"?(running|1|active)/i.test(c.body);
      console.log(`\n[${c.method} ${c.status}] ${c.url}${runHit ? '   <-- mentions running/status' : ''}`);
      if (c.body) console.log('   RESP:', c.body.slice(0, 500));
    }

    // 2) Start a new Instant task — capture create/start + any hold-others call
    calls.length = 0;
    const name = `ApiProbe ${Date.now()}`;
    await tm.openTaskModal();
    await tm.taskTypeSelect.selectOption({ label: 'Call' }).catch(() => {});
    await tm.taskInput.fill(name);
    await tm.saveBtn.click();
    await page.waitForTimeout(2500);
    for (let i = 0; i < 3; i++) { const sw = page.locator('.swal2-confirm'); if (await sw.isVisible().catch(() => false)) { await sw.click().catch(() => {}); await page.waitForTimeout(1200); } }
    await page.waitForTimeout(1500);

    console.log('\n\n========== TASK-START API CALLS (POST/PUT while starting the task) ==========');
    const writes = calls.filter(c => /POST|PUT|PATCH/.test(c.method));
    if (!writes.length) console.log('(no write calls captured)');
    for (const c of writes) {
      console.log(`\n[${c.method} ${c.status}] ${c.url}`);
      if (c.payload) console.log('   REQ :', c.payload);
      if (c.body) console.log('   RESP:', c.body.slice(0, 400));
    }
    // did any call look like "hold/pause other tasks"?
    const holdCall = calls.find(c => /hold|pause/i.test(c.url) || /hold|pause/i.test(c.payload));
    console.log('\n>>> Hold/pause-other-tasks call on start?', holdCall ? `YES → ${holdCall.method} ${holdCall.url}` : 'NONE FOUND (frontend does not pause other running tasks)');

    // 3) All task-write endpoints seen (reference for the developer)
    console.log('\n========== ENDPOINT REFERENCE (task-related) ==========');
    const uniq = [...new Set(calls.map(c => `${c.method} ${c.url.split('?')[0]}`))];
    uniq.forEach(u => console.log('  ', u));
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
