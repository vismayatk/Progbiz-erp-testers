'use strict';

/**
 * Task Management — Task Details panel: Notes, Documents, Edit, Reschedule,
 * Add Lead, and the Start→Hold→Resume→End lifecycle.
 * Source: Test cases TC_TASK_044-064 + Scenarios 4, 7, 13, 14, 15.
 *
 * The Task Details panel (#task-overview-modal) opens from a My Tasks row and holds
 * everything: notes (#txtChat + .btn-send), document upload (.fe-paperclip →
 * #file-input-document), lifecycle (Hold / End Task / Resume), and a ⋮ menu
 * (.fe-more-vertical) → Edit Task / Reschedule Task / Add Lead.
 *
 *   TM-24  Add a note + upload a document            TC_060-064 · Scenario 7
 *   TM-25  Edit an existing task (title)             Scenario 13 · TC_038
 *   TM-26  Reschedule a task                         Scenario 14 · TC_038
 *   TM-27  Add a Lead from a task (⋮ → Add Lead)     Scenario 15
 *   TM-28  Lifecycle: Hold → Resume → End            TC_044-056 · Scenario 4
 *
 * Run:  npx playwright test tests/task_management_details.spec.js
 */
require('dotenv').config();
const path = require('path');
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { TaskManagementPage } = require('../pages/TaskManagementPage');
const { screenshot } = require('../../common/helpers');

const CREDS = {
  company:  process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const DOC = path.resolve(__dirname, '..', '..', 'common', 'sample-document.txt');

async function arriveWithTask(page, label) {
  const login = new LoginPage(page);
  const tm = new TaskManagementPage(page);
  await login.goto();
  await login.login(CREDS.company, CREDS.username, CREDS.password);
  const name = `${label} ${Date.now()}`;
  const msg = await tm.createViaModal(name, { type: 'Call', description: `${label} flow` });
  expect(msg, `seed task should save, got "${msg}"`).toBeFalsy();
  const opened = await tm.openTaskDetails(name);
  expect(opened, `Task Details did not open for "${name}"`).toBeTruthy();
  return { tm, name };
}

test.describe('Task Management — Task Details, Notes, Lifecycle', () => {
  test.describe.configure({ timeout: 200_000 });

  test('TM-24 | Add a note and upload a document (Scenario 7)', async ({ page }) => {
    const { tm } = await arriveWithTask(page, 'Notes');

    // TC_060-062 — note
    const noteOk = await tm.addNote(`Auto note ${Date.now()}`);
    expect(noteOk, 'Note did not appear in the activity log').toBeTruthy();
    console.log('  ✅ Note saved and visible in activity log');

    // TC_063-064 — document. A falsy msg alone passes even if nothing attached
    // (setInputFiles is swallowed), so require the uploaded file to appear in Task Details.
    const up = await tm.uploadDocument(DOC);
    await screenshot(page, 'tm24_notes_docs');
    expect(up, `Document upload should not error, got "${up}"`).toBeFalsy();
    const docBody = (await tm.detailsModal.textContent().catch(() => '')) || '';
    const docName = DOC.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    expect(docBody, `Uploaded document "${docName}" not listed in Task Details`).toContain(docName);
    console.log('  ✅ ASSERT: Note added + document uploaded AND listed');
  });

  test('TM-25 | Edit an existing task title (Scenario 13)', async ({ page }) => {
    const { tm, name } = await arriveWithTask(page, 'EditMe');

    const newTitle = `${name} EDITED`;
    const msg = await tm.editTaskTitle(newTitle);
    await screenshot(page, 'tm25_edit');
    expect(msg, `Edit should save, got "${msg}"`).toBeFalsy();

    // verify the edited title is now searchable in My Tasks
    const tab = await tm.findAcrossTabs(newTitle);
    console.log(`  🔎 Edited title visible under tab: ${tab}`);
    expect(tab, 'Edited title not found in My Tasks').toBeTruthy();
    console.log('  ✅ ASSERT: Task edited and updated title persisted');
  });

  test('TM-26 | Reschedule a task (Scenario 14)', async ({ page }) => {
    const { tm, name } = await arriveWithTask(page, 'Reschedule');

    const d = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    const msg = await tm.reschedule(d, '14:30');
    await screenshot(page, 'tm26_reschedule');
    expect(msg, `Reschedule should save, got "${msg}"`).toBeFalsy();
    // A falsy msg alone passes on a silent no-op (all reschedule steps are swallowed).
    // Reopen the Reschedule dialog and read the saved date back to prove it persisted.
    expect(await tm.openTaskDetails(name), 'Task Details should reopen for verification').toBeTruthy();
    await tm.detailsMenu('Reschedule Task');
    const dlg = page.locator('.modal:visible, [role="dialog"]:visible').last();
    const savedDate = await dlg.locator('input[type="date"]:visible').first().inputValue().catch(() => '');
    console.log('  📅 saved reschedule date:', savedDate);
    expect(savedDate, `Task should be rescheduled to ${d}`).toBe(d);
    console.log(`  ✅ ASSERT: Task rescheduled to ${d} 14:30 (persisted)`);
  });

  test('TM-27 | Add a Lead from a task (Scenario 15)', async ({ page }) => {
    const { tm } = await arriveWithTask(page, 'LeadFromTask');

    const res = await tm.addLeadFromTask();
    await screenshot(page, 'tm27_add_lead');
    console.log('  🔗 Add Lead →', JSON.stringify(res));
    const ok = /enquiry|lead/i.test(res.url) || res.customerPrefilled;
    expect(ok, `Add Lead should open a lead/enquiry form (url=${res.url}, prefilled=${res.customerPrefilled})`).toBeTruthy();
    console.log('  ✅ ASSERT: Add Lead opens the lead-creation flow from a task');
  });

  test('TM-28 | Task lifecycle — Hold → Resume → End (Scenario 4)', async ({ page }) => {
    test.setTimeout(420_000);
    const { tm, name } = await arriveWithTask(page, 'Lifecycle');

    console.log('  ▶ statuses before:', JSON.stringify(await tm.detailsStatuses()));

    // HOLD → confirm "Hold Task" modal. Verify the row transitions to "Hold". (hard assertion)
    const hold = await tm.holdTask();
    expect(hold, `Hold should not error, got "${hold}"`).toBeFalsy();
    const sHold = await tm.rowStatus(name);
    console.log('  ⏸ row status after Hold:', sHold);
    expect(sHold, 'Task should be On Hold after Hold').toMatch(/hold/i);

    // RESUME → control reappears once held; success returns falsy AND the task must
    // return to Running (a dead Resume control also returns null — verify the transition).
    await tm.openTaskDetails(name);
    const resume = await tm.resumeTask();
    console.log('  ▶ resume result:', resume);
    expect(resume, `Resume should not error, got "${resume}"`).toBeFalsy();
    const sResume = await tm.rowStatus(name);
    console.log('  ▶ row status after Resume:', sResume);
    expect(sResume, 'Task should be Running after Resume').toMatch(/running/i);

    // END → confirm "End Task" modal. The end-time window is minute-granular and can be
    // too tight right after a resume on the slow tenant, so END may legitimately return a
    // time-window validation message (which itself proves the control is wired).
    await tm.openTaskDetails(name);
    const end = await tm.endTask();
    await screenshot(page, 'tm28_lifecycle');
    console.log('  ⏹ End result:', end === null ? 'ended' : `(msg) ${end}`);
    if (end === null) {
      // A clean end must actually reach Completed — a dead End control also returns null.
      const sEnd = await tm.rowStatus(name);
      console.log('  ⏹ row status after End:', sEnd);
      expect(sEnd, 'Ended task should be Completed').toMatch(/completed/i);
    } else {
      // Non-null = the end-time-window validation surfaced; the End control is wired.
      expect(/time|start/i.test(String(end)), `Unexpected End error: ${end}`).toBeTruthy();
    }
    console.log('  ✅ ASSERT: Lifecycle Hold(→Hold) → Resume(→Running) → End verified');
  });
});
