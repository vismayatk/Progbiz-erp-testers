'use strict';
/**
 * Cross-module integration test.
 *
 * Single-page checks cannot answer the question that actually matters:
 * when something is created in one module, does it show up everywhere it
 * should? A task that saves but never reaches the calendar is a worse bug
 * than a page that fails to load, because nobody notices until a deadline
 * is missed.
 *
 * Creates one task (QA_TASK_<ts>) and one enquiry (QA_LEAD_<ts>), then
 * follows each through every surface that should reflect it. Deletes
 * nothing. Records what it created so it can be cleaned up.
 *
 *   node scripts/qa/integration_test.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { TaskManagementPage } = require('../../erp/task-management/pages/TaskManagementPage');
const { EnquiryPage } = require('../../erp/crm/pages/EnquiryPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};
const STAMP = Date.now();
const TASK_NAME = `QA_TASK_${STAMP}`;
const LEAD_NAME = `QA_LEAD_${STAMP}`;

const results = [];
const rec = (id, title, pass, detail) => {
  results.push({ id, title, pass, detail });
  const mark = pass === null ? '⚪' : pass ? '✅' : '❌';
  console.log(`  ${mark} ${id} ${title}${detail ? ` — ${detail}` : ''}`);
};

/** Does the visible page mention this text anywhere (grid, list or card)? */
const pageMentions = (needle) =>
  (document.body.innerText || '').replace(/\s+/g, ' ').includes(needle);

/** Screenshot into the shared QA folder so the report can reference it. */
async function shot(page, name) {
  const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'shots', 'integration', `${name}.png`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return path.relative(path.join(__dirname, '..', '..'), p);
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const evidence = { taskName: TASK_NAME, leadName: LEAD_NAME, shots: {} };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // ══════════ SCENARIO A — task propagation ══════════
    console.log('\n══ A. Create a task, follow it across every surface ══');
    const tm = new TaskManagementPage(page);
    let created = false;
    try {
      await tm.createTask(TASK_NAME, {});
      created = true;
    } catch (e) {
      // Fall back to the modal path, which uses a different entry point.
      console.log(`   (createTask failed: ${e.message.split('\n')[0].slice(0, 80)} — trying modal)`);
      try { await tm.createViaModal(TASK_NAME, {}); created = true; }
      catch (e2) { rec('IN-01', 'Create a task', false, e2.message.split('\n')[0].slice(0, 120)); }
    }
    if (created) rec('IN-01', 'Create a task', true, TASK_NAME);
    evidence.shots.taskCreated = await shot(page, 'A1_task_created');

    if (created) {
      const SURFACES = [
        { id: 'IN-02', name: 'My Tasks',              go: () => tm.gotoMyTasks() },
        { id: 'IN-03', name: 'To Do List',            go: () => tm.gotoTodo() },
        { id: 'IN-04', name: 'Calendar',              go: () => tm.gotoCalendar() },
        { id: 'IN-05', name: 'Task Timeline',         go: () => tm.gotoTimeline() },
        { id: 'IN-06', name: 'Daily Activity Report', go: () => tm.gotoDailyActivity() },
        { id: 'IN-07', name: 'Delegated Tasks',       go: () => tm.gotoDelegated() },
        { id: 'IN-08', name: 'Home page',             go: () => tm.gotoHome() },
        { id: 'IN-09', name: 'Task Dashboard',        go: () => page.goto(`${BASE}/task-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 }) },
      ];
      for (const s of SURFACES) {
        await s.go().catch(() => {});
        await page.waitForTimeout(4200);
        const found = await page.evaluate(pageMentions, TASK_NAME).catch(() => false);
        const rows = await page.evaluate(() => {
          const on = (e) => e.getClientRects().length > 0;
          const t = [...document.querySelectorAll('table')].filter(on)[0];
          return t ? t.querySelectorAll('tbody tr').length : null;
        }).catch(() => null);
        evidence.shots[s.name] = await shot(page, `A_${s.id}_${s.name.replace(/\W+/g, '_')}`);
        // Delegated Tasks legitimately should NOT contain a self-assigned task.
        if (s.name === 'Delegated Tasks') {
          rec(s.id, `${s.name} — self-assigned task correctly absent`, !found,
            found ? 'task appears here though it was not delegated' : 'not listed (expected)');
        } else {
          rec(s.id, `${s.name} shows the new task`, found,
            found ? `found · grid rows=${rows}` : `NOT found · grid rows=${rows}`);
        }
      }
    }

    // ══════════ SCENARIO B — lead propagation ══════════
    console.log('\n══ B. Create a lead, follow it across CRM surfaces ══');
    const enq = new EnquiryPage(page);
    let leadOk = false;
    try {
      await enq.openAddForm();
      await page.waitForTimeout(1500);
      await page.locator('#TxtCustomer').fill(LEAD_NAME);
      await page.locator('#customer-phone').fill(String(STAMP).slice(-10));
      for (const id of ['#assignto', '#leadsource']) {
        await page.locator(id).evaluate((s) => {
          const o = [...s.options].filter((x) => x.value && x.value !== '0');
          if (o.length) { s.value = o[0].value; s.dispatchEvent(new Event('change', { bubbles: true })); }
        }).catch(() => {});
      }
      await enq.addItem('Inverter', '1').catch(() => {});
      await page.locator('#btn-save-enquiry').click({ timeout: 15000 });
      await page.waitForTimeout(6000);
      leadOk = /enquiry-overview/.test(page.url());
    } catch (e) {
      rec('IN-10', 'Create a lead', false, e.message.split('\n')[0].slice(0, 120));
    }
    if (leadOk) rec('IN-10', 'Create a lead', true, `${LEAD_NAME} → ${page.url().replace(BASE, '')}`);
    evidence.shots.leadCreated = await shot(page, 'B1_lead_created');

    if (leadOk) {
      const CRM_SURFACES = [
        { id: 'IN-11', name: 'Leads listing', url: '/leads' },
        { id: 'IN-12', name: 'Enquiries listing', url: '/enquiries' },
        { id: 'IN-13', name: 'Follow-ups', url: '/followups' },
        { id: 'IN-14', name: 'Home Today\'s Schedule', url: '/home' },
      ];
      for (const s of CRM_SURFACES) {
        await page.goto(`${BASE}${s.url}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(4200);
        const found = await page.evaluate(pageMentions, LEAD_NAME).catch(() => false);
        evidence.shots[s.name] = await shot(page, `B_${s.id}_${s.name.replace(/\W+/g, '_')}`);
        rec(s.id, `${s.name} shows the new lead`, found, found ? 'found' : 'NOT found');
      }
    }

    // ══════════ SCENARIO C — workflow / projects surfaces ══════════
    console.log('\n══ C. Projects / Workflow module ══');
    const wfId = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a[href]')]
        .find((x) => /\/workflow\/[0-9a-f-]{36}/i.test(x.getAttribute('href') || ''));
      return a ? (a.getAttribute('href').match(/\/workflow\/([0-9a-f-]{36})/i) || [])[1] : null;
    }).catch(() => null);
    evidence.workflowModuleId = wfId;

    if (!wfId) {
      rec('IN-15', 'Projects workflow module reachable from the nav', null,
        'no /workflow/<guid> link found on /home — nav may need expanding first');
    } else {
      const WF = [
        { id: 'IN-15', name: 'Projects listing', url: `/workflows/${wfId}` },
        { id: 'IN-16', name: 'Projects dashboard', url: `/workflow-dashboard/${wfId}` },
        { id: 'IN-17', name: 'Project Notes', url: `/workflow-notes/module/${wfId}` },
        { id: 'IN-18', name: 'Project Expenses', url: `/workflow-expenses/module/${wfId}` },
        { id: 'IN-19', name: 'Project Collections', url: `/workflow-collections/module/${wfId}` },
        { id: 'IN-20', name: 'Project Status Report', url: `/workflow-status-report/${wfId}` },
      ];
      for (const s of WF) {
        const resp = await page.goto(`${BASE}${s.url}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
        await page.waitForTimeout(4000);
        const st = await page.evaluate(() => {
          const on = (e) => e.getClientRects().length > 0;
          const t = [...document.querySelectorAll('table')].filter(on)[0];
          return {
            bounced: /\/login/i.test(location.pathname),
            error: /oops|went wrong|error code|nothing at this address/i.test(document.body.innerText),
            rows: t ? t.querySelectorAll('tbody tr').length : null,
            hasGrid: !!t,
          };
        }).catch(() => ({}));
        evidence.shots[s.name] = await shot(page, `C_${s.id}_${s.name.replace(/\W+/g, '_')}`);
        rec(s.id, `${s.name} loads`, !st.bounced && !st.error,
          `http=${resp ? resp.status() : '?'} grid=${st.hasGrid} rows=${st.rows} error=${st.error}`);
      }
    }

  } catch (e) {
    console.log('\nFATAL:', e.message);
    rec('FATAL', 'run aborted', false, e.message.split('\n')[0].slice(0, 160));
  } finally {
    await browser.close();
  }

  const pass = results.filter((r) => r.pass === true).length;
  const fail = results.filter((r) => r.pass === false).length;
  const skip = results.filter((r) => r.pass === null).length;
  console.log(`\n═══ ${pass} passed · ${fail} failed · ${skip} inconclusive ═══`);
  console.log(`created: ${TASK_NAME} · ${LEAD_NAME}`);
  const p = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'integration.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ results, evidence }, null, 2));
  console.log(`wrote ${path.relative(path.join(__dirname, '..', '..'), p)}`);
})();
