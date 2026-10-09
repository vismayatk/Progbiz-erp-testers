'use strict';

/**
 * Recruitment — positive business workflow (single serial run).
 *
 * Hiring chain, in the order the app enforces (each step feeds the next via shared `rec`):
 *   R1 Job Requisition    (REC-001) /requisition-list → New Requisition → Submit (+ "raise anyway")
 *   R7 Approve requisition(REC-002) /recruitment/approvals → Approve → Confirm Approval
 *   R2 Job Opening        (REC-003) /vacancy-list → Add Job Opening
 *   R3 Candidate applies  (REC-004) /recruitment-candidates → Add New (offcanvas, + Resume)
 *   R4 Interview Round    (support) /interview-rounds → Add Round
 *   R5 Schedule Interview (REC-007) /interview-schedules → Schedule Interview (+ Add interviewer)
 *   R8 Interview feedback (REC-008) Panel & Feedback → My Evaluation → interview Completed
 *   R6 Create Offer       (REC-009) /offer-list → New Offer (only interview-cleared candidates)
 *   R9 Offer approval     (REC-010) Submit for Approval → approve in /recruitment/approvals
 *   R9c Send + acceptance (REC-011) Send Offer → Track Response "Accepted" → listed in /offer-acceptance
 *   R9d Pre-boarding      (REC-012) /offer-acceptance → Send Invite → "Invited" (Start Onboarding waits on the candidate)
 *
 * Mandatory + conditional-mandatory fields only (see docs/automation/MANDATORY_FIELDS.md).
 * Every create/approve step ends with a persisted check on a fresh page load — never a toast
 * alone (toast-only checks hid that R1, R5 and R6 were not saving).
 *
 * Login: hrms/fixtures/global-setup.js (env creds). R8 waits for the booked interview slot to
 * pass (the app rejects past bookings, and feedback is for an interview that has happened).
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { FormKit, waitVisible } = require('../../pages/FormKit');
const { person, tagged, RUN_TAG } = require('../../data/naming');
const {
  BASE, DEPARTMENT, DESIGNATION, BRANCH, dtLocal,
  clickLauncher, gotoCandidatesRegister, assertCandidateListed, candidateNameTaken, openAddCandidate,
  readRows, approveRecruitmentRequest,
  addInterviewRound, scheduleInterview, recordEvaluation, createOffer, submitAndApproveOffer,
  sendOfferAndRecordAcceptance, sendPreboardingInvite,
} = require('../../flows/recruitmentFlow');

const CV = path.join(__dirname, '..', '..', 'fixtures', 'files', 'sample-cv.pdf');

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe.serial('Recruitment — positive hiring workflow', () => {
  const rec = {};   // shared: stamp, candidateName, candidateEmail, designation …

  test.beforeAll(() => {
    // Company naming standard (data/naming.js): a realistic candidate, and business-named
    // records carrying the readable run tag. The candidate's First Name is one word (the form
    // rejects spaces there); the surname goes in Last Name. Names may repeat across runs, so
    // the candidate is told apart by e-mail and by applying to THIS run's own job opening.
    rec.cand           = person();
    rec.candidateName  = rec.cand.full;
    rec.candidateEmail = rec.cand.email;
    rec.candidatePhone = '9' + String(Date.now()).slice(-9);
    rec.roundName      = tagged('Technical Round 1');
    rec.reqMarker      = tagged('Additional Software Tester for Q4 delivery');
    console.log(`  🎯 Recruitment run ${RUN_TAG} — candidate ${rec.candidateName} <${rec.candidateEmail}>`);
  });

  test('R1 — create a Job Requisition (REC-001)', async ({ page }) => {
    test.setTimeout(200_000);
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/requisition-list`, { ready: /New Requisition/i });
    await clickLauncher(page, /New Requisition/i);
    const form = await fk.scope({ ready: 'select' });

    await fk.setSelect(fk.selectWithOption(form, DEPARTMENT), DEPARTMENT, 'Department');
    await fk.setCascade(fk.fieldByLabel(form, 'Designation', 'select'), DESIGNATION, 'Designation');
    await fk.setSelect(fk.selectWithOption(form, BRANCH), BRANCH, 'Branch');
    await fk.setInput(fk.fieldByLabel(form, 'Positions', 'input'), '1', 'Positions');
    await fk.setSelect(fk.selectWithOption(form, 'Full Time Employee'), 'Full Time Employee', 'Employee Type');
    await fk.setSelect(fk.selectWithOption(form, 'Office'), 'Office', 'Work Type');
    // Business Justification — required when an approved requisition for the same role
    // already exists (the app then asks to raise an "additional request"). It is also shown
    // in the requisition list, so it doubles as this run's unique persistence marker.
    await fk.setInput(form.getByText('Business Justification', { exact: false }).first().locator('xpath=following::textarea[1]'),
      rec.reqMarker, 'Business Justification');

    // Submit (not "Save Draft"). If the "Requisition Already Exists" dialog appears, confirm
    // the additional request — that is the app's normal path for a repeat role.
    const submit = form.locator('button').filter({ hasText: /^\s*Submit\s*$/ }).first();
    await expect(submit, 'the requisition "Submit" button should be visible').toBeVisible();
    await submit.click();
    const yes = page.locator('.swal2-popup button').filter({ hasText: /Yes, raise it anyway/i }).first();
    if (await waitVisible(yes, 6000)) {
      console.log('  ℹ️ R1 duplicate-role dialog → "Yes, raise it anyway"');
      await yes.click();
    }
    await expect(form, 'the requisition form should close after a successful submit').toBeHidden({ timeout: 20000 });

    // Persisted: the requisition list has a row carrying this run's justification marker.
    // The justification is rendered as a tooltip (title attribute), not row text, so match
    // the row's markup; then assert that row's visible status.
    await expect.poll(async () => {
      await fk.gotoReady(`${BASE}/requisition-list`, { ready: /New Requisition/i });
      for (let i = 0; i < 15; i++) {
        const rows = await page.$$eval('table tbody tr', trs => trs.map(tr => ({ html: tr.innerHTML, text: tr.innerText.replace(/\s+/g, ' ') }))).catch(() => []);
        if (rows.length && rows[0].text.trim()) return (rows.find(r => r.html.includes(rec.reqMarker)) || {}).text || '';
        await page.waitForTimeout(1000);
      }
      return '';
    }, { timeout: 90000, intervals: [2000, 5000], message: `the requisition list should show a row with "${rec.reqMarker}"` })
      .toMatch(/Submitted|Approved|Pending/i);
    console.log(`  ✅ R1 requisition submitted and listed ("${rec.reqMarker}")`);
  });

  test('R7 — approve the requisition (REC-002)', async ({ page }) => {
    test.setTimeout(200_000);
    expect(rec.reqMarker, 'R7 depends on R1').toBeTruthy();
    const fk = new FormKit(page);
    await approveRecruitmentRequest(page, fk, 'Job Requisition', rec.reqMarker);
    console.log(`  ✅ R7 approval confirmed for "${rec.reqMarker}"`);
    // Persisted: the requisition now reads Approved (the app also assigns it a job-opening code).
    await expect.poll(async () => {
      await fk.gotoReady(`${BASE}/requisition-list`, { ready: /New Requisition/i });
      const rows = await readRows(page, { withHtml: true });
      return (rows.find(r => r.html.includes(rec.reqMarker)) || {}).text || '';
    }, { timeout: 60000, intervals: [2000, 5000], message: `requisition "${rec.reqMarker}" should become Approved` })
      .toMatch(/Approved/);
    console.log('  ✅ R7 requisition shows Approved');
  });

  test('R2 — create a Job Opening for that role (REC-003)', async ({ page }) => {
    test.setTimeout(200_000);
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/vacancy-list`, { ready: /Add Job Opening/i });
    await clickLauncher(page, /Add Job Opening/i);
    const form = await fk.scope({ ready: '#designation' });

    // Stable ids on this form.
    await fk.setSelect(form.locator('#designation'),     DESIGNATION,       'Designation');
    await fk.setSelect(form.locator('#employmentType'),  'FullTime',        'Employment Type');
    await fk.setSelect(form.locator('#department'),      DEPARTMENT,        'Department');
    await fk.setSelect(form.locator('#status'),          'Open',            'Status');
    await fk.setSelect(form.locator('#vacancyLocation'), 'Office',          'Work Type');
    await fk.setSelect(form.locator('#selectbox').filter({ has: page.locator('option', { hasText: BRANCH }) }), BRANCH, 'Branch');
    await fk.setInput(fk.fieldByLabel(form, 'Number of Vacancies', 'input'), '1', 'Number of Vacancies');

    const saveBtn = fk.saveButton(form);
    rec.openingSavedVia = await fk.saveAndConfirm(saveBtn, { name: 'Save job opening', successRe: /success|saved|created|published|added/i });
    console.log(`  ✅ R2 job opening created (${rec.openingSavedVia})`);
  });

  test('R3 — add a Candidate who applies to the opening (REC-004)', async ({ page }) => {
    test.setTimeout(200_000);
    const fk = new FormKit(page);
    // Supported entry = Job Board "Candidates" register (/recruitment-candidates) → "Add New".
    // (The standalone /candidates page is NOT used in HRMS — user, 2026-10-03.) The Add New
    // form opens in a Bootstrap OFFCANVAS panel; scope strictly to it or the field lookups
    // leak onto the list's filter bar and silently corrupt the save.
    await gotoCandidatesRegister(page);
    // The offers list and approval Details identify a candidate by NAME only, so make sure this
    // run's realistic name isn't already used by another candidate; pick the next person if so.
    for (let i = 0; i < 8 && await candidateNameTaken(page, rec.cand.full); i++) {
      console.log(`  ℹ️ "${rec.cand.full}" already exists — choosing another name`);
      rec.cand = person();
      rec.candidateName = rec.cand.full;
      rec.candidateEmail = rec.cand.email;
    }
    expect(await candidateNameTaken(page, rec.cand.full), `"${rec.cand.full}" should be a new candidate name`).toBe(false);
    const form = await openAddCandidate(page);

    await fk.setInput(fk.fieldByLabel(form, 'First Name', 'input'), rec.cand.first, 'First Name');
    await fk.setInput(fk.fieldByLabel(form, 'Last Name', 'input'), rec.cand.last, 'Last Name');
    await fk.setInput(fk.fieldByLabel(form, 'Email', 'input'), rec.candidateEmail, 'Email');
    await fk.setSelect(fk.selectWithOption(form, 'Male'), rec.cand.gender, 'Gender');
    // Phone: the dialling-code <select> (anchor "AFG 93", India = "IND 91"); the number input directly follows it.
    const phoneCode = fk.selectWithOption(form, 'AFG 93');
    await fk.setSelect(phoneCode, 'IND', 'Phone code', { loose: true });
    await fk.setInput(phoneCode.locator('xpath=following::input[not(@type="hidden")][1]'), rec.candidatePhone, 'Phone number');
    await fk.setSelect(fk.selectWithOption(form, 'Manual'), 'Manual', 'Source');
    await fk.setSelect(fk.selectWithOption(form, DEPARTMENT), DEPARTMENT, 'Department');
    await fk.setCascade(fk.fieldByLabel(form, 'Designation', 'select'), DESIGNATION, 'Designation');
    // Apply to THIS run's opening — the newest SOFTWARE TESTER opening (highest JOB number,
    // created by R2 / R7 just now). Then the interview and offer lists, which filter by
    // opening, contain only this run's candidate, so a repeated realistic name can't be mixed up.
    const applyOpening = fk.fieldByLabel(form, 'Apply to Job Opening', 'select');
    await expect(applyOpening, 'Apply to Job Opening should enable').toBeEnabled({ timeout: 15000 });
    await expect.poll(async () => (await applyOpening.locator('option').allTextContents()).filter(t => /JOB\d+/.test(t)).length,
      { timeout: 15000, message: 'job openings should load' }).toBeGreaterThan(0);
    const openings = (await applyOpening.locator('option').allTextContents()).map(t => t.trim()).filter(t => /JOB\d+/.test(t));
    const newest = openings.sort((a, b) => Number(b.match(/JOB(\d+)/)[1]) - Number(a.match(/JOB(\d+)/)[1]))[0];
    await fk.setSelect(applyOpening, newest, 'Apply to Job Opening');
    rec.openingLabel = await fk.picked(applyOpening);
    rec.openingCode  = (rec.openingLabel.match(/JOB\d+/i) || [])[0];
    expect(rec.openingCode, 'the chosen opening should have a JOB code').toBeTruthy();
    console.log(`  🔗 candidate applied to opening: "${rec.openingLabel}" (code ${rec.openingCode})`);
    await fk.upload(form.locator('input[type="file"]').first(), CV, 'Resume');

    // Save. For this OFFCANVAS form the reliable success signal is the panel CLOSING —
    // a generic "toast" race can return on a stale/other toast while the save silently
    // fails (panel stays open). So click and require the panel to close.
    const saveBtn = fk.saveButton(form);
    await expect(saveBtn, 'the "Save Candidate" button should be visible').toBeVisible();
    await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await saveBtn.click();
    await expect(form, 'the candidate panel should close after a successful save').toBeHidden({ timeout: 25000 });
    rec.candidateSavedVia = 'panel-closed';
    console.log(`  ✅ R3 candidate "${rec.candidateName}" created (panel closed)`);

    // Persisted-after-reload: the candidate lists on the Candidates register.
    // The grid renders empty-on-first-paint with skeleton rows, so wait until it is
    // genuinely populated (a known-stable row visible) before asserting — otherwise the
    // search races the skeletons and false-fails.
    await assertCandidateListed(page, rec.candidateEmail);
    console.log('  ✅ R3 candidate persisted and listed on the Candidates register');
  });

  test('R4 — add an Interview Round (support for scheduling)', async ({ page }) => {
    test.setTimeout(200_000);
    rec.roundSavedVia = await addInterviewRound(page, rec);
    console.log(`  ✅ R4 interview round "${rec.roundName}" created (${rec.roundSavedVia})`);
  });

  test('R5 — schedule an interview for the candidate (REC-007)', async ({ page }) => {
    test.setTimeout(200_000);
    expect(rec.candidateName && rec.roundName && rec.openingCode, 'R5 depends on R3 + R4').toBeTruthy();
    await scheduleInterview(page, rec);
    console.log(`  ✅ R5 interview booked for ${dtLocal(rec.interviewAt)} and persisted (Scheduled)`);
  });

  test('R8 — record interview feedback → interview Completed (REC-008)', async ({ page }) => {
    test.setTimeout(300_000);
    expect(rec.interviewAt, 'R8 depends on R5').toBeTruthy();
    await recordEvaluation(page, rec);
    console.log('  ✅ R8 evaluation saved (4/5, Proceed) → interview Completed');
  });

  test('R6 — create an Offer for the evaluated candidate (REC-009)', async ({ page }) => {
    test.setTimeout(200_000);
    expect(rec.candidateName && rec.openingCode, 'R6 depends on R3 + R8').toBeTruthy();
    await createOffer(page, rec);
    console.log(`  ✅ R6 offer created for ${rec.candidateName} and persisted (Draft, 600000.00)`);
  });

  test('R9 — submit the offer for approval and approve it (REC-010)', async ({ page }) => {
    test.setTimeout(240_000);
    expect(rec.candidateName, 'R9 depends on R6').toBeTruthy();
    await submitAndApproveOffer(page, rec);
    console.log('  ✅ R9 offer approved');
  });

  test('R9c — send the offer & record acceptance (REC-011)', async ({ page }) => {
    test.setTimeout(240_000);
    expect(rec.candidateName && rec.candidateEmail, 'R9c depends on R9').toBeTruthy();
    await sendOfferAndRecordAcceptance(page, rec);
    console.log('  ✅ R9c candidate listed in Offer Acceptance');
  });

  // "Start Onboarding" unlocks only after the CANDIDATE submits their details through the
  // e-mailed portal link — a candidate-side step outside this admin run.
  test('R9d — send the pre-boarding invite (REC-012)', async ({ page }) => {
    test.setTimeout(200_000);
    expect(rec.candidateEmail, 'R9d depends on R9c').toBeTruthy();
    await sendPreboardingInvite(page, rec);
    console.log(`  ✅ R9d pre-boarding invite sent to ${rec.candidateEmail} (Invited)`);
  });
});
