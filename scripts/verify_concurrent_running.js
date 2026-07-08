'use strict';
/**
 * VERIFY: can more than one task be in "Running" at the same time?
 * The app shows "Another task is in progress" when starting a task, implying a
 * single-active-task rule. This checks the live dashboard and then tries to
 * reproduce a 2nd concurrent running task.
 */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const { TaskManagementPage } = require('../erp/task-management/pages/TaskManagementPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

/** Read the Running / On-Hold sections of the /home dashboard. */
function readDashboard() {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const out = { running: [], onHold: [], pauseBtns: 0, playBtns: 0 };
  // A running task card has a pause control (.ri-pause-fill); a held one has play (.ri-play-fill)
  out.pauseBtns = document.querySelectorAll('.ri-pause-fill, .bi-pause-circle-fill, [class*="pause"]').length;
  out.playBtns  = document.querySelectorAll('.ri-play-fill, .bi-play-circle-fill').length;
  // Walk headings to bucket the cards under "Running Tasks" vs "On Hold"
  const body = document.body.innerText;
  const runIdx = body.search(/Running Tasks/i);
  const holdIdx = body.search(/On Hold/i);
  // collect task cards: elements with a timer HH:MM:SS
  const cards = [...document.querySelectorAll('div')].filter(d => /\d\d:\d\d:\d\d/.test(d.textContent || '') && d.querySelectorAll('*').length < 40);
  const seen = new Set();
  for (const c of cards) {
    const t = norm(c.textContent);
    const m = t.match(/(\d\d:\d\d:\d\d)/);
    if (!m) continue;
    const key = t.slice(0, 60);
    if (seen.has(key)) continue; seen.add(key);
    const running = !!c.querySelector('.ri-pause-fill, .bi-pause-circle-fill');
    const held = !!c.querySelector('.ri-play-fill, .bi-play-circle-fill');
    const rec = { text: t.slice(0, 70), timer: m[1], running, held };
    if (running) out.running.push(rec); else if (held) out.onHold.push(rec);
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page); const tm = new TaskManagementPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.goto(`${login.baseUrl}/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const before = await page.evaluate(readDashboard);
    console.log('\n===== CURRENT STATE (/home) =====');
    console.log('Running tasks:', before.running.length);
    before.running.forEach(r => console.log('   ▶ RUNNING:', r.timer, '|', r.text));
    console.log('On Hold tasks:', before.onHold.length);
    console.log(`pause-controls=${before.pauseBtns} play-controls=${before.playBtns}`);
    console.log('>>> CONCURRENT RUNNING?', before.running.length > 1 ? 'YES — more than one task Running' : 'no');
    await page.screenshot({ path: 'screenshots/verify_running_before.png', fullPage: true }).catch(() => {});

    // ---- Reproduction: start a NEW instant task and see if the old one keeps running ----
    console.log('\n===== REPRODUCTION: start a new Instant task =====');
    const name = `ConcurrencyProbe ${Date.now()}`;
    await tm.openTaskModal();
    await tm.taskTypeSelect.selectOption({ label: 'Call' }).catch(() => {});
    await tm.taskInput.fill(name);
    await tm.saveBtn.click();
    await page.waitForTimeout(2000);
    // capture the "Another task in progress" confirm text, then confirm/continue
    let swalText = '';
    for (let i = 0; i < 3; i++) {
      const sw = page.locator('.swal2-popup');
      if (!(await sw.isVisible().catch(() => false))) break;
      swalText = (await page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
      await page.locator('.swal2-confirm').click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    console.log('Confirm dialog said:', JSON.stringify(swalText));

    await page.goto(`${login.baseUrl}/home`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const after = await page.evaluate(readDashboard);
    console.log('\n===== STATE AFTER STARTING A NEW TASK =====');
    console.log('Running tasks:', after.running.length);
    after.running.forEach(r => console.log('   ▶ RUNNING:', r.timer, '|', r.text));
    await page.screenshot({ path: 'screenshots/verify_running_after.png', fullPage: true }).catch(() => {});
    console.log('\n>>> VERDICT:', after.running.length > 1
      ? `BUG CONFIRMED — ${after.running.length} tasks Running concurrently after starting a new one (single-active-task rule NOT enforced)`
      : 'Single running task after start (rule enforced)');
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
