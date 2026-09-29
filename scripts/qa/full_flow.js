'use strict';
/**
 * The whole flow in ONE browser session.
 *
 * The Playwright specs give each test a fresh page, so a full run logs in
 * seventeen times and reads as seventeen disconnected episodes. That is right
 * for CI isolation and wrong for watching: this script opens one window, logs
 * in once, and walks the entire journey in order —
 *
 *   CRM      enquiry -> leads -> follow-up -> followups -> quotation
 *            -> quotations -> control moves -> home
 *   WORKFLOW module -> type template -> create project -> phases/tasks
 *            -> dashboard -> status report
 *
 * Reuses the same page objects as the specs, so what you watch here is what
 * CI asserts. Creates one enquiry, one quotation and one project, all prefixed
 * QA_FLOW_ and described "safe to delete". Nothing existing is touched.
 *
 *   HEADED=1 node scripts/qa/full_flow.js     # watch it
 *   node scripts/qa/full_flow.js              # headless
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { EnquiryPage } = require('../../erp/crm/pages/EnquiryPage');
const { CrmChainPage } = require('../../erp/crm/pages/CrmChainPage');
const { WorkflowPage } = require('../../erp/workflow/pages/WorkflowPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};
const REPO = path.join(__dirname, '..', '..');
const STAMP = Date.now();
const NAME = `QA_FLOW_${STAMP}`;
const PRJ = `QA_PRJ_${STAMP}`;

const results = [];
const step = (id, title, pass, detail) => {
  results.push({ id, title, pass, detail });
  const m = pass === null ? '⚪' : pass ? '✅' : '❌';
  console.log(`  ${m} ${id.padEnd(6)} ${title}${detail ? ` — ${detail}` : ''}`);
};
const banner = (n, t) => console.log(`\n${'─'.repeat(62)}\n  ${n}. ${t}\n${'─'.repeat(62)}`);

(async () => {
  const headed = !!process.env.HEADED;
  console.log(`\n  host   ${BASE}`);
  console.log(`  tenant ${C.company}   user ${C.username}`);
  console.log(`  mode   ${headed ? 'HEADED (watch the window)' : 'headless'}`);
  console.log(`  record ${NAME}\n`);

  const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 250 : 0 });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const shot = async (n) => {
    const p = path.join(REPO, 'reports', 'qa', 'shots', 'fullflow', `${n}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  };
  const ev = { host: BASE, tenant: C.company, record: NAME, project: PRJ };

  try {
    // ═══ LOGIN — once, for everything that follows ═══════════════════════
    banner(0, 'Sign in');
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2500);
    const chain = new CrmChainPage(page);
    const enq = new EnquiryPage(page);
    const wf = new WorkflowPage(page);
    step('LOGIN', 'Signed in', /\/home/.test(page.url()), page.url().replace(BASE, ''));
    ev.homeBefore = await chain.homeCounters();
    console.log(`     home before: ${JSON.stringify({ ...ev.homeBefore, scheduleText: undefined })}`);

    // ═══ 1. ENQUIRY ══════════════════════════════════════════════════════
    banner(1, 'Create an enquiry');
    await enq.openAddForm();
    await page.waitForTimeout(1500);
    await page.locator('#TxtCustomer').fill(NAME);
    await page.locator('#customer-phone').fill(String(STAMP).slice(-10));

    // Blazor-bound selects: native selectOption only. Setting .value from
    // evaluate() does not update the model and the control silently reverts.
    const pickFirst = async (sel) => {
      const loc = page.locator(sel);
      if (!(await loc.count().catch(() => 0))) return null;
      const opts = await loc.locator('option').evaluateAll((os) =>
        os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
          .filter((o) => o.value && o.value !== '0' && !/^choose/i.test(o.text)));
      if (!opts.length) return null;
      await loc.selectOption(opts[0].value).catch(() => {});
      return opts[0].text;
    };
    ev.assignee = await pickFirst('#assignto');
    ev.leadSource = await pickFirst('#leadsource');
    // Choosing a status renders a REQUIRED Lead Quality — set it after, or the
    // save is refused with "Please choose lead quality".
    ev.followupStatus = await pickFirst('#followup');
    await page.waitForTimeout(1500);
    ev.leadQuality = await pickFirst('#lead-quality');
    console.log(`     assignee=${ev.assignee} source=${ev.leadSource} status=${ev.followupStatus} quality=${ev.leadQuality}`);

    await enq.addItem('Inverter', '2');
    await page.locator('#btn-save-enquiry').click({ timeout: 15000 });
    await page.waitForTimeout(6500);
    ev.enquiryPath = page.url().replace(BASE, '');
    await shot('01_enquiry_saved');
    step('CH-01', 'Enquiry saves and opens its overview',
      /^\/enquiry-overview\//.test(ev.enquiryPath), ev.enquiryPath);

    // ═══ 2. LEADS ════════════════════════════════════════════════════════
    banner(2, 'Find it in Leads');
    const inLeads = await chain.findAcrossTabs('/leads', NAME);
    await shot('02_leads');
    step('CH-02', 'Enquiry appears in the Leads listing', !!inLeads,
      inLeads ? `tab "${inLeads.tab}" — ${inLeads.row.slice(0, 5).join(' | ')}` : 'not found in any tab');

    // ═══ 3. FOLLOW-UP ════════════════════════════════════════════════════
    banner(3, 'Follow-up on the enquiry');
    const fu = await chain.addFollowup(ev.enquiryPath);
    await shot('03_followup_modal');
    step('CH-03', 'Follow-up modal opens', fu.opened, fu.opened ? 'modal shown' : fu.detail);
    step('CH-04', 'Follow-up saves', fu.saved, fu.detail);
    ev.followup = fu;
    if (!fu.saved) {
      console.log('     ⓘ known defect CH-F1 — Save issues no request and shows no message.');
      console.log('       Reproduced on dev.erp (group_dev, lesol_dev) and test.erp (lesol_test).');
    }
    // Dismiss the stuck modal so the run can continue.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1200);

    const inFollowups = await chain.findAcrossTabs('/followups', NAME);
    await shot('04_followups');
    step('CH-05', 'Record reaches the FollowUps listing', !!inFollowups,
      inFollowups ? `tab "${inFollowups.tab}"` : 'not found in any tab');

    // ═══ 4. QUOTATION ════════════════════════════════════════════════════
    banner(4, 'Convert to a quotation');
    await chain.goto(ev.enquiryPath);
    // Create Quotation lives in the actions dropdown, not as a bare button.
    await page.locator('#btn-enquiry-actions').click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2200);
    const cq = page.locator('.dropdown-menu.show a, .dropdown-menu.show button')
      .filter({ hasText: /create quotation/i }).first();
    const cqFound = (await cq.count().catch(() => 0)) > 0;
    if (cqFound) { await cq.click({ timeout: 12000 }).catch(() => {}); await page.waitForTimeout(7000); }
    ev.quotationFormPath = page.url().replace(BASE, '');
    const pre = await page.evaluate(() => {
      const on = (e) => e.getClientRects().length > 0;
      const t = [...document.querySelectorAll('table')].filter(on)[0];
      return {
        customer: document.querySelector('#customerNameInput')?.value
          || document.querySelector('#TxtCustomer')?.value || '',
        itemRows: t ? t.querySelectorAll('tbody tr').length : 0,
        quotationNo: document.querySelector('#quotation-no')?.value || null,
      };
    });
    await shot('05_quotation_form');
    step('CH-06', 'Quotation form opens prefilled',
      cqFound && pre.customer.includes(NAME) && pre.itemRows > 0,
      `no=${pre.quotationNo} customer="${pre.customer}" itemRows=${pre.itemRows}`);

    // Strict id: a `button:has-text("Save")` fallback matches the hidden
    // #cf-new-option-save in a dormant custom-field modal.
    const saveQ = page.locator('#btn-save-quotation');
    await saveQ.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    await saveQ.click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(7000);
    ev.quotationPath = page.url().replace(BASE, '');
    await shot('06_quotation_saved');
    step('CH-07', 'Quotation saves', /\/quotation-view\//.test(ev.quotationPath), ev.quotationPath);

    const inQuotations = await chain.findAcrossTabs('/quotations', NAME);
    await shot('07_quotations');
    step('CH-08', 'Quotation appears in the Quotations listing', !!inQuotations,
      inQuotations ? `tab "${inQuotations.tab}" — ${inQuotations.row.slice(0, 5).join(' | ')}` : 'not found');

    // ═══ 5. CONTROL MOVES ════════════════════════════════════════════════
    banner(5, 'Follow-up control after conversion');
    await chain.goto(ev.enquiryPath);
    const onEnq = await chain.hasFollowupControl();
    await chain.goto(ev.quotationPath);
    const onQuo = await chain.hasFollowupControl();
    step('CH-09', 'Control moves from the enquiry to the quotation',
      !onEnq && onQuo, `enquiry=${onEnq ? 'present' : 'absent'} quotation=${onQuo ? 'present' : 'absent'} (by design)`);

    // ═══ 6. HOME ═════════════════════════════════════════════════════════
    banner(6, 'Home page');
    ev.homeAfter = await chain.homeCounters();
    const delta = {};
    // Home's cards are task counters (Pending/Delayed/Completed/Unscheduled
    // Tasks as of 2026-09-18), not CRM-lead counters — see the comment on
    // CrmChainPage.homeCounters(). An enquiry/follow-up isn't a task, so
    // these are logged for visibility, not gated on.
    for (const k of ['pendingTasks', 'delayedTasks', 'completedTasks', 'unscheduled']) {
      if (ev.homeBefore?.[k] !== null && ev.homeAfter[k] !== null) delta[k] = ev.homeAfter[k] - ev.homeBefore[k];
    }
    await shot('08_home');
    console.log(`     counters ${JSON.stringify(delta)}`);
    step('CH-10', 'Home reflects the new record',
      (ev.homeAfter.scheduleText || '').includes(NAME),
      `deltas ${JSON.stringify(delta)}, Today's Schedule lists it`);

    // ═══ 7. WORKFLOW ═════════════════════════════════════════════════════
    banner(7, 'Work Flow — project');
    const guid = await wf.resolveModuleId();
    step('WF-01', 'Workflow module resolved', !!guid, guid || 'no workflow module on this tenant');

    if (guid) {
      const types = await wf.readTypes();
      const t0 = types[0];
      step('WF-02', 'Types carry a phase/task template',
        types.length > 0 && types.every((t) => t.phases > 0 && t.tasks > 0),
        `${types.length} type(s); using "${t0?.type}" (${t0?.phases} phases / ${t0?.tasks} tasks)`);

      let prjPath = null;
      try { prjPath = await wf.createProject({ name: PRJ, type: t0.type }); } catch (e) {
        step('WF-03', 'Project creation', false, e.message.split('\n')[0].slice(0, 110));
      }
      if (prjPath) {
        ev.projectPath = prjPath;
        await shot('09_project_created');
        step('WF-03', 'Project saves and opens its overview', /^\/workflow-overview\//.test(prjPath), prjPath);

        const row = await wf.findInListing(PRJ, 'Created');
        await shot('10_project_listing');
        step('WF-04', 'Project appears under the Created tab', !!row,
          row ? row.slice(0, 8).join(' | ') : 'not found');

        const phases = await wf.readOverviewTab(prjPath, 'Phases');
        const tasks = await wf.readOverviewTab(prjPath, 'Tasks');
        await shot('11_project_phases');
        step('WF-05', 'Template phases and tasks instantiated',
          phases.rows.length === t0.phases && tasks.rows.length === t0.tasks,
          `${phases.rows.length}/${t0.phases} phases, ${tasks.rows.length}/${t0.tasks} tasks`);

        await wf.gotoDashboard();
        step('WF-06', 'Project reaches the dashboard', await wf.pageMentions(PRJ), '');
        await wf.gotoStatusReport();
        step('WF-07', 'Project reaches the status report', await wf.pageMentions(PRJ), '');
      }
    }

  } catch (e) {
    console.log(`\n  FATAL: ${e.message.split('\n')[0].slice(0, 160)}`);
    step('FATAL', 'run aborted', false, e.message.split('\n')[0].slice(0, 140));
  } finally {
    if (headed) { console.log('\n  (window closes in 5s)'); await new Promise((r) => setTimeout(r, 5000)); }
    await browser.close();
  }

  const pass = results.filter((r) => r.pass === true).length;
  const fail = results.filter((r) => r.pass === false).length;
  console.log(`\n${'═'.repeat(62)}`);
  console.log(`  ${pass} passed · ${fail} failed   (${C.company} @ ${BASE})`);
  results.filter((r) => r.pass === false).forEach((r) => console.log(`    ❌ ${r.id} ${r.title}`));
  console.log(`  created: ${NAME}${ev.projectPath ? ` · ${PRJ}` : ''}`);
  const out = path.join(REPO, 'reports', 'qa', 'raw', `full-flow-${C.company}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ results, evidence: ev }, null, 2));
  console.log(`  ${path.relative(REPO, out)}`);
  console.log(`${'═'.repeat(62)}\n`);
})();
