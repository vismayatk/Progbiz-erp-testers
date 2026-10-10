'use strict';

/**
 * Work Flow — Project flow  (WF-01 .. WF-07)
 *
 * Project Management was replaced by a configurable workflow engine: each
 * module has Types, each Type carries a Template of Phases and Tasks, and
 * creating a project is expected to INSTANTIATE that template. WF-05 is the
 * spec's reason to exist — a project that saves but arrives without its
 * phases is broken in a way no page-load test would notice, because the
 * engine's whole promise is the template.
 *
 * Tenant-awareness: the module GUID differs per tenant and some tenants have
 * no workflow module at all (skiolo_dev). Everything resolves the id at
 * runtime through WorkflowPage.resolveModuleId() and skips when absent —
 * a hardcoded GUID would make this spec pass or fail by tenant, not by code.
 *
 * DATA: one project (QA_PRJ_<timestamp>) is created per run, listed under the
 * Created tab, "Automated flow test — safe to delete" in its description.
 * Nothing existing is touched.
 *
 * Run:  npm run test:workflow
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { WorkflowPage } = require('../pages/WorkflowPage');

const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

// The flow is one continuous story (resolve → template → create → verify), so
// the spec runs serially and carries state forward rather than re-creating a
// project for every assertion.
test.describe.configure({ mode: 'serial', timeout: 240_000 });

const NAME = `QA_PRJ_${Date.now()}`;
/** @type {WorkflowPage} */ let wf;
/** Chosen from the live Types grid, not hardcoded. */ let templateType = null;
/** Overview path returned by creation, e.g. /workflow-overview/<guid>. */ let overviewPath = null;

test.describe('Work Flow — Project flow', () => {
  test.beforeEach(async ({ page }) => {
    await new LoginPage(page).login(C.company, C.username, C.password);
    wf = new WorkflowPage(page);
    const id = await wf.resolveModuleId();
    test.skip(!id, `tenant "${C.company}" has no workflow module configured`);
  });

  test('WF-01 | Module registry lists a configured workflow module', async () => {
    // resolveModuleId() already proved the registry has a row with a Types
    // action; this pins the shape so a registry change fails loudly here
    // rather than obscurely in later tests.
    expect(wf.moduleId, 'no module GUID resolved from /workflow-modules')
      .toMatch(/^[0-9a-f-]{36}$/i);
    console.log(`  ✅ module id: ${wf.moduleId}`);
  });

  test('WF-02 | Every Type carries a template of phases and tasks', async () => {
    const types = await wf.readTypes();
    expect(types.length, 'no Types configured for the module').toBeGreaterThan(0);
    for (const t of types) {
      expect(t.phases, `type "${t.type}" has no phases in its template`).toBeGreaterThan(0);
      expect(t.tasks,  `type "${t.type}" has no tasks in its template`).toBeGreaterThan(0);
    }
    // Remember one type for the creation tests — the first, so the choice is
    // deterministic per tenant but never hardcoded.
    templateType = types[0];
    console.log(`  ✅ ${types.length} type(s); using "${templateType.type}" (${templateType.phases} phases / ${templateType.tasks} tasks)`);
  });

  test('WF-03 | Creating a project saves and lands on its overview', async () => {
    test.skip(!templateType, 'no type resolved in WF-02');
    overviewPath = await wf.createProject({ name: NAME, type: templateType.type });
    expect(overviewPath, `unexpected post-create path: ${overviewPath}`)
      .toMatch(/^\/workflow-overview\//);
    console.log(`  ✅ created ${NAME} → ${overviewPath}`);
  });

  test('WF-04 | New project appears in the listing under the Created tab', async () => {
    test.skip(!overviewPath, 'project was not created');
    const row = await wf.findInListing(NAME, 'Created');
    expect(row, `"${NAME}" not found under the Created tab`).toBeTruthy();
    // The row's Phase column should already carry the template's first phase.
    console.log(`  ✅ listed: ${row.slice(0, 8).join(' | ')}`);
    // Note: the listing DEFAULTS to the Ongoing tab, so a new project is not
    // on the first screen a user sees. Recorded as finding WF-01 in
    // reports/qa/WORKFLOW-PROJECT-FLOW-2026-08-17.md — behaviour, not defect.
  });

  test('WF-05 | Template phases and tasks are instantiated on the project', async () => {
    test.skip(!overviewPath || !templateType, 'project was not created');

    const phases = await wf.readOverviewTab(overviewPath, 'Phases');
    expect(phases.rows.length,
      `expected ${templateType.phases} phases from the "${templateType.type}" template, got ${phases.rows.length}`)
      .toBe(templateType.phases);

    const tasks = await wf.readOverviewTab(overviewPath, 'Tasks');
    expect(tasks.rows.length,
      `expected ${templateType.tasks} tasks from the "${templateType.type}" template, got ${tasks.rows.length}`)
      .toBe(templateType.tasks);

    // The per-phase task counts ("0 / 3" …) must sum to the task list —
    // otherwise phases and tasks were instantiated from different versions of
    // the template.
    const phaseTaskSum = phases.rows.reduce((a, r) => {
      const m = r.join(' ').match(/\/\s*(\d+)/);
      return a + (m ? parseInt(m[1], 10) : 0);
    }, 0);
    expect(phaseTaskSum, 'per-phase task counts do not sum to the Tasks tab total')
      .toBe(templateType.tasks);

    console.log(`  ✅ ${phases.rows.length} phases, ${tasks.rows.length} tasks, per-phase counts sum correctly`);
  });

  test('WF-06 | Project reaches the dashboard', async () => {
    test.skip(!overviewPath, 'project was not created');
    await wf.gotoDashboard();
    expect(await wf.pageMentions(NAME), `"${NAME}" not on the dashboard`).toBe(true);
    console.log('  ✅ on the dashboard');
  });

  test('WF-07 | Project reaches the status report', async () => {
    test.skip(!overviewPath, 'project was not created');
    await wf.gotoStatusReport();
    expect(await wf.pageMentions(NAME), `"${NAME}" not on the status report`).toBe(true);
    console.log('  ✅ on the status report');
  });
});
