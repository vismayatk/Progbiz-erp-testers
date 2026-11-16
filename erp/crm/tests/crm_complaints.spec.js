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
    // Complaint type*, Branch*, Subject* are required. Nov 2026: Complaint type is a set of choices (one per
    // active type) instead of a dropdown, and says so when the tenant has none; Priority is three buttons.
    const type = await complaints.complaintTypeField();
    console.log(`  complaint type: ${JSON.stringify(type)}`);
    expect(type.kind, 'the form has no "Complaint type" field at all').not.toBe('missing');
    if (type.kind === 'none' && type.notice) {
      // no active type on this tenant (CMP-F1): the form must say so and link to the setup page
      await expect(page.locator('a[href*="complaint-types"]').filter({ hasText: /set up complaint types/i }), 'no link to set up complaint types').toBeVisible();
    }
    expect(await complaints.selectAfter('Branch').count(), 'no "Branch" select').toBeGreaterThan(0);
    expect(await complaints.selectAfter('Branch').evaluate((e) => e.required || /\*/.test((e.closest('div')?.querySelector('label')?.textContent) || '')), 'Branch is no longer marked required').toBe(true);
    expect(await complaints.subject.count(), 'no Subject input').toBeGreaterThan(0);
    expect(await complaints.expandDetails(), 'no Description box, even after "Add details"').toBe(true);
    const priority = await complaints.priorityField();
    console.log(`  priority: ${JSON.stringify(priority)}`);
    expect(priority.options.map((o) => o.trim()), 'Priority choices').toEqual(expect.arrayContaining(['Normal', 'Medium', 'High']));
    expect(priority.selected, 'Priority should start on Normal').toMatch(/normal/i);
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

  test('CMP-05 | List and Board show the same complaints: tiles, inbox counts, rows and board columns agree', async ({ page }) => {
    await complaints.goto();
    const tiles = await complaints.tiles();
    test.skip(!Object.keys(tiles).length, 'this build has no complaint tiles (older layout)');
    const inbox = await complaints.inboxCounts();
    console.log(`  tiles: ${JSON.stringify(tiles)}`);
    console.log(`  inbox: ${JSON.stringify(inbox)}`);
    for (const t of ['Open', 'In progress', 'Overdue (SLA)', 'Due in 4 hours', 'Escalated', 'In team pool', 'Resolved']) {
      expect(tiles, `tile "${t}" missing`).toHaveProperty(t);
      expect(typeof tiles[t], `tile "${t}" shows "${tiles[t]}", not a count`).toBe('number');
    }
    for (const chip of ['All', 'My team inbox', 'Assigned to me', 'Added by me']) expect(inbox, `inbox chip "${chip}" missing`).toHaveProperty(chip);
    // a sub-inbox can never hold more than All
    for (const chip of ['My team inbox', 'Assigned to me', 'Added by me']) expect(inbox[chip], `"${chip}" (${inbox[chip]}) is larger than All (${inbox.All})`).toBeLessThanOrEqual(inbox.All);

    // the All inbox lists what its chip counts (first page: the list pages at 10 or more rows)
    const rows = await complaints.listRows();
    console.log(`  list rows under All: ${rows.length}`);
    if (inbox.All < 10) expect(rows.length, `the All chip says ${inbox.All} but ${rows.length} row(s) are listed`).toBe(inbox.All);
    else expect(rows.length, `the All chip says ${inbox.All} but the list is empty`).toBeGreaterThan(0);
    if (inbox.All === 0) await expect(page.locator('table.cmp-table'), 'an empty list should say so').toContainText(/no complaints found/i);

    // Board: five status columns with counts; the inbox chips keep their counts
    expect(await complaints.setView('Board'), 'no Board switch on /complaints').toBe(true);
    try {
      const cols = await complaints.boardColumns();
      console.log(`  board: ${JSON.stringify(cols)}`);
      expect(Object.keys(cols), 'board columns').toEqual(['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed']);
      for (const [name, n] of Object.entries(cols)) expect(typeof n, `board column "${name}" shows "${n}", not a count`).toBe('number');
      expect(await complaints.inboxCounts(), 'the inbox counts changed between List and Board').toEqual(inbox);
      // nothing can be on the board that the All inbox does not count
      const onBoard = Object.values(cols).reduce((a, n) => a + n, 0);
      if (inbox.All === 0) expect(onBoard, 'the board shows complaints while All is 0').toBe(0);
    } finally {
      await complaints.setView('List');
    }
  });
});
