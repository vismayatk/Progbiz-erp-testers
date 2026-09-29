'use strict';

/**
 * Complaints — new module (CMP-01 .. CMP-04)
 *
 * First seen in the 2026-09-18 nav re-crawl; entirely absent from the
 * 2026-09-07 baseline (scripts/discovery_report.json). Whole new nav group:
 * /complaints (listing) → /add-complaint (create) → four inbox tabs.
 *
 * This gets real save + data-flow coverage, not just a smoke check, because
 * — like Enquiry — it is a primary "create a record" workflow a user drives
 * end to end, not a settings page. Complaint Types and the Complaint
 * Dashboard (config / read-only) are covered separately, smoke-only, in
 * erp_new_pages_2026-09.spec.js.
 *
 * Run:  npx playwright test erp/crm/tests/crm_complaints.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { ComplaintsPage } = require('../pages/ComplaintsPage');

const BASE = process.env.BASE_URL;
const C = {
  company:  process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};
const NAME = `QA_COMPLAINT_${Date.now()}`;

test.describe.configure({ mode: 'serial', timeout: 200_000 });

let complaints;
let complaintCreated = null; // set by CMP-03: did a complaint actually get created? (CMP-F1 gate)

test.describe('CRM — Complaints (new module)', () => {
  test.beforeEach(async ({ page }) => {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1200);
    complaints = new ComplaintsPage(page);
  });

  test('CMP-01 | Listing loads with its four inbox tabs and no backend error', async ({ page }) => {
    await complaints.goto();
    const tabs = await complaints.tabs();
    const bodyHasError = await page.evaluate(() => /oops|went wrong|error code|exception/i.test(document.body.innerText));
    console.log(`  tabs: ${JSON.stringify(tabs)}`);
    expect(bodyHasError, '/complaints shows a backend error').toBe(false);
    expect(tabs.length, '/complaints shows no inbox tabs').toBeGreaterThan(0);
  });

  test('CMP-02 | New complaint form shows its required fields', async ({ page }) => {
    await complaints.gotoNew();
    const form = await complaints.describeForm();
    console.log(`  controls: ${JSON.stringify(form.controls.map((c) => c.label))}`);
    console.log(`  buttons: ${JSON.stringify(form.buttons)}`);
    // As read live 2026-09-18: Complaint type*, Branch*, Subject* are required.
    expect(await complaints.selectAfter('Complaint type').count(), 'no "Complaint type" select').toBeGreaterThan(0);
    expect(await complaints.selectAfter('Branch').count(), 'no "Branch" select').toBeGreaterThan(0);
    expect(await complaints.subject.count(), 'no Subject input').toBeGreaterThan(0);
    expect(await complaints.createBtn.count(), 'no "Create complaint" button').toBeGreaterThan(0);
  });

  test('CMP-03 | A new complaint saves', async ({ page }) => {
    const r = await complaints.create(NAME);
    console.log(`  submitted=${r.submitted} chosen=${JSON.stringify(r.chosen)} navigated=${r.navigated} POSTs=${JSON.stringify(r.posts)} alert="${r.alert}" validation=${JSON.stringify(r.validation)}`);
    // KNOWN DEFECT CMP-F1 (found 2026-09-21): the tenant's Complaint Type master
    // data is empty — /add-complaint's "Complaint type *" select offers only the
    // "Choose" placeholder (confirmed live: options=[{value:"0",text:"Choose"}]).
    // This is tenant DATA, not a code/app bug — CMP-01..04 all passed on
    // 2026-09-18 with real types configured, so something emptied Complaint
    // Types between then and now. Flag to the team (Master → Complaint Types)
    // rather than "fixing" this in code. test.fail only while the data is
    // genuinely missing — restoring it turns this back into a normal pass.
    complaintCreated = !!r.chosen['Complaint type'];
    if (!complaintCreated) {
      test.fail(true, 'CMP-F1 — tenant has no Complaint Type configured (Master → Complaint Types is empty); needs product/data fix, not a code fix');
    }
    expect(r.chosen['Complaint type'], 'no Complaint type option to choose — tenant has none configured').toBeTruthy();
    expect(r.chosen['Branch'], 'no Branch option to choose').toBeTruthy();
    expect(r.submitted, 'Create complaint button was never clicked (not found)').toBe(true);
    // Data-flow evidence, not just "a request fired": either the app moved us
    // off the create form, or it issued a save-shaped POST. Either alone is
    // enough; both absent means nothing happened, same standard as CH-F1.
    expect(r.navigated || r.posts.length > 0,
      `save produced neither navigation nor a request — alert="${r.alert}" validation=${JSON.stringify(r.validation)}`).toBe(true);
  });

  test('CMP-04 | The new complaint appears in the listing', async ({ page }) => {
    // Direct consequence of CMP-F1: if CMP-03 couldn't create a complaint (no
    // Complaint Type to choose), there is nothing here to find — same root
    // cause, not a second independent defect.
    if (complaintCreated === false) {
      test.fail(true, 'CMP-F1 — no complaint was created in CMP-03 (tenant has no Complaint Type), so none can appear in the listing');
    }
    const hit = await complaints.findAcrossTabs(NAME);
    console.log(hit ? `  found under "${hit.tab}": ${hit.row.slice(0, 140)}` : '  not found under any tab');
    expect(hit, `"${NAME}" not found in /complaints under any tab`).toBeTruthy();
  });
});
