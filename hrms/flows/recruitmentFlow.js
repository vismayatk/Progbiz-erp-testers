'use strict';

/**
 * Recruitment flow — shared helpers and hiring steps.
 *
 * Used by tests/02_recruitment (the full hiring chain) and tests/07_referral (a referred
 * candidate is driven through the same interview → offer → acceptance steps). Each step takes
 * the page and a run context `rec` and ends with a persisted check on a fresh page load.
 *
 * `rec` fields: candidateName, candidateEmail, cand.first, openingCode, roundName,
 *               interviewAt (set by scheduleInterview).
 */
const { expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

// One coherent requisition target so every downstream cascade matches.
const DEPARTMENT  = 'SOFTWARE DEVELOPMENT';
const DESIGNATION = 'SOFTWARE TESTER';
const BRANCH      = 'Main Branch';

/**
 * Click a launcher link/button robustly. On this Blazor build the "New …"/"Add …"
 * launchers are <a> elements that take a moment to become actionable after the list
 * renders, so a bare .click() can time out mid-render. Wait for a visible instance,
 * scroll it into view, then click (retrying briefly through the settle).
 */
async function clickLauncher(page, labelRe) {
  const el = page.locator('a, button, [role="tab"], [role="button"]').filter({ hasText: labelRe }).first();
  // Blazor lists sometimes paint without their action bar; a reload re-runs the render.
  let appeared = false;
  for (let attempt = 0; attempt < 3 && !appeared; attempt++) {
    appeared = await waitVisible(el, 12000);
    if (!appeared) { await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForTimeout(1500); }
  }
  await expect(el, `launcher ${labelRe} should appear`).toBeVisible({ timeout: 15000 });
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await expect(async () => { await el.click({ timeout: 5000 }); }).toPass({ timeout: 30000 });
  await page.waitForTimeout(800);
}

/**
 * Open the Candidates register and wait until the grid is genuinely populated — i.e. the
 * first row shows real data (an e-mail), not a skeleton.
 */
async function gotoCandidatesRegister(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE}/recruitment-candidates`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    for (let i = 0; i < 15; i++) {
      const first = await page.locator('table tbody tr').first().innerText().catch(() => '');
      if (/@/.test(first)) return;
      await page.waitForTimeout(1000);
    }
  }
}

/** Search the register (search box + Enter) and return the matching rows' text. */
async function searchRegister(page, term) {
  const search = page.getByPlaceholder(/Search by name, email or ph/i).first();
  await expect(search, 'the Candidates register search box should be visible').toBeVisible({ timeout: 20000 });
  await search.fill(term);
  await search.press('Enter');
  await page.waitForTimeout(2000);
  const rows = await readRows(page);
  await search.fill('');                 // leave the register unfiltered for the next step
  await search.press('Enter');
  await page.waitForTimeout(800);
  return rows;
}

/** The register row for this e-mail ('' if absent) — Status, Stage and Source columns included. */
async function candidateRow(page, email) {
  await gotoCandidatesRegister(page);
  return (await searchRegister(page, email)).find(r => r.includes(email)) || '';
}

/** Assert a candidate is in the register — found via the register search by its unique e-mail. */
async function assertCandidateListed(page, email) {
  expect(await candidateRow(page, email), `the Candidates register should list the new candidate (${email})`).toContain(email);
}

/** True when a candidate with this exact full name is already in the register. */
async function candidateNameTaken(page, fullName) {
  return (await searchRegister(page, fullName)).some(r => r.includes(fullName));
}

/** Click "Add New" until the offcanvas panel is actually open, then return it as the scope. */
async function openAddCandidate(page) {
  const panel = page.locator('.offcanvas.show');
  for (let a = 0; a < 8; a++) {
    await page.locator('a, button, [role="button"]').filter({ hasText: /^\s*Add New\s*$/i })
      .first().click({ timeout: 5000 }).catch(() => {});
    if (await waitVisible(panel, 4000)) break;   // really wait — don't re-click a panel that's still opening
    await page.waitForTimeout(800);
  }
  await expect(panel, 'the Add New candidate offcanvas panel should open').toBeVisible({ timeout: 15000 });
  await expect(panel.locator('input[type="file"]').first(), 'the candidate form should render in the panel').toBeVisible({ timeout: 15000 });
  return panel;
}

const pad2 = n => String(n).padStart(2, '0');
/** Local "YYYY-MM-DDTHH:MM" for <input type="datetime-local">. */
const dtLocal = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** Read a list's rows once the grid has real content (past the skeleton / "No Data" first paint). */
async function readRows(page, { withHtml = false } = {}) {
  for (let i = 0; i < 30; i++) {
    const rows = await page.$$eval('table tbody tr', trs => trs.map(tr => ({ text: tr.innerText.replace(/\s+/g, ' ').trim(), html: tr.innerHTML }))).catch(() => []);
    if (rows.length && rows[0].text && !/^No Data$/i.test(rows[0].text)) return withHtml ? rows : rows.map(r => r.text);
    await page.waitForTimeout(1000);
  }
  return [];
}

/** Fresh-load a list and return the row text containing `needle` ('' if absent). */
async function rowOn(page, fk, route, ready, needle) {
  await fk.gotoReady(`${BASE}/${route}`, { ready });
  return (await readRows(page)).find(t => t.includes(needle)) || '';
}

/** Click an item inside a table row's "More actions" dropdown. */
async function rowMenuAction(page, row, itemRe) {
  await row.locator('button, a').filter({ hasText: /More actions/i })
    .or(row.locator('[aria-label*="More actions" i], [title*="More actions" i]')).first().click();
  const item = page.locator('.dropdown-menu.show a, .dropdown-menu.show button').filter({ hasText: itemRe }).first();
  await expect(item, `"${itemRe}" should be in the row's More actions menu`).toBeVisible({ timeout: 8000 });
  await item.click();
}

/**
 * Approve OUR pending request in /recruitment/approvals. Rows only name the requester, so
 * open each row of this type's Details (newest first) until one shows `marker`, then
 * Approve → "Confirm Approval". Never acts on someone else's request.
 */
async function approveRecruitmentRequest(page, fk, type, marker) {
  // A just-submitted request can take a moment to reach the queue — re-scan a few times.
  for (let pass = 1; pass <= 4; pass++) {
    const found = await findRequestRow(page, fk, type, marker);
    if (found !== null) return approveRow(page, page.locator('table tbody tr').nth(found), marker);
    await page.waitForTimeout(5000);
  }
  throw new Error(`no pending "${type}" approval shows "${marker}" in its Details`);
}

/** Index of the approvals row of `type` whose Details mention `marker`, or null. */
async function findRequestRow(page, fk, type, marker) {
  await fk.gotoReady(`${BASE}/recruitment/approvals`, { ready: /Recruitment Approvals/i });
  const rows = await readRows(page);
  const idxs = rows.map((t, i) => ({ t, i })).filter(x => x.t.startsWith(type)).map(x => x.i).slice(0, 10);
  for (const i of idxs) {
    const row = page.locator('table tbody tr').nth(i);
    await row.locator('a, button').filter({ hasText: /^\s*Details\s*$/ }).first().click();
    const dlg = page.locator('.modal.show, .offcanvas.show, [role="dialog"]').first();
    await expect(dlg, 'the request Details should open').toBeVisible({ timeout: 10000 });
    // Details content loads after the dialog opens — wait for its footer fields.
    await expect(dlg, 'the request Details should finish loading').toContainText(/Requested on/i, { timeout: 10000 });
    const details = (await dlg.innerText()).replace(/\s+/g, ' ');
    await dlg.locator('button').filter({ hasText: /^\s*Close\s*$/ }).first().click().catch(() => page.keyboard.press('Escape'));
    await expect(dlg, 'the request Details should close').toBeHidden({ timeout: 10000 });
    if (details.includes(marker)) return i;
  }
  return null;
}

/** Approve one approvals row (already confirmed to be ours) via "Confirm Approval". */
async function approveRow(page, row, marker) {
  await row.locator('a, button').filter({ hasText: /^\s*Approve\s*$/ }).first().click();
  const confirm = page.locator('.modal.show button, [role="dialog"] button').filter({ hasText: /Confirm Approval/i }).first();
  await expect(confirm, 'the approve dialog should offer "Confirm Approval"').toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal.show, [role="dialog"]').first(), 'the approve dialog should be for our request').toContainText(marker);
  await confirm.click();
  await expect(confirm, 'the approve dialog should close').toBeHidden({ timeout: 15000 });
}

// ─────────────────────────────── hiring steps ───────────────────────────────

/** Interview Round for the designation (support for scheduling). */
async function addInterviewRound(page, rec) {
  const fk = new FormKit(page);
  await fk.gotoReady(`${BASE}/interview-rounds`, { ready: /Add Round/i });
  await clickLauncher(page, /Add Round/i);
  const form = await fk.scope({ ready: 'select' });
  await fk.setSelect(fk.selectWithOption(form, DESIGNATION), DESIGNATION, 'Designation');
  await fk.setInput(fk.fieldByLabel(form, 'Round Name', 'input'), rec.roundName, 'Round Name');
  return fk.saveAndConfirm(fk.saveButton(form), { name: 'Save round' });
}

/** Schedule an interview 2 minutes ahead (the app rejects past slots) → persisted Scheduled. */
async function scheduleInterview(page, rec) {
  const fk = new FormKit(page);
  // The form loads its opening list when it opens, so a just-created opening can be missing
  // until a fresh load — reopen it (after a reload) until this run's opening is offered.
  let form;
  for (let attempt = 1; attempt <= 4; attempt++) {
    await fk.gotoReady(`${BASE}/interview-schedules`, { ready: /Schedule Interview/i });
    await clickLauncher(page, /Schedule Interview/i);
    form = await fk.scope({ ready: 'input[type="datetime-local"]' });   // unique to the schedule form
    await fk.pickByOption(form, DESIGNATION, 'Designation');
    const offered = await expect.poll(async () => (await form.locator('option').allTextContents()).some(t => t.includes(rec.openingCode)),
      { timeout: 15000 }).toBe(true).then(() => true, () => false);
    if (offered) break;
    console.log(`  ℹ️ opening ${rec.openingCode} not offered yet — reloading the schedule form (attempt ${attempt})`);
    await page.waitForTimeout(10000);
  }

  // Pick each step by the value it must offer: Designation → Job Opening (the one the
  // candidate applied to) → Candidate → Round.
  await fk.pickByOption(form, rec.openingCode, 'Job Opening');
  // Candidate: target the Candidate select itself (placeholder "Select candidate") and wait for
  // this run's full name — a loose match can hit the Interviewer list, which holds employees with
  // the same realistic names.
  const candSel = form.locator('select').filter({ has: page.locator('option', { hasText: /^\s*Select candidate\s*$/ }) }).first();
  await expect(candSel, 'the Candidate select should be visible').toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await candSel.locator('option').allTextContents()).some(t => t.includes(rec.candidateName)),
    { timeout: 20000, message: `the Candidate list should offer ${rec.candidateName}` }).toBe(true);
  const candLabel = (await candSel.locator('option').allTextContents()).map(t => t.trim()).find(t => t.includes(rec.candidateName));
  await fk.setSelect(candSel, candLabel, 'Candidate');
  await fk.pickByOption(form, rec.roundName,   'Round');
  rec.interviewAt = new Date(Date.now() + 2 * 60000);
  const dt = form.locator('input[type="datetime-local"]').first();
  await expect(dt, 'Interview Date should enable once a round is chosen').toBeEnabled({ timeout: 15000 });
  await fk.setInput(dt, dtLocal(rec.interviewAt), 'Interview Date');
  // Interviewers: choose AND click "+ Add" — choosing alone adds nobody.
  await fk.pickByOption(form, 'Amit Kumar', 'Interviewer');
  await form.locator('button').filter({ hasText: /^\s*\+?\s*Add\s*$/ }).first().click();
  const added = await form.evaluate(root => [...root.querySelectorAll('span, div, li, a, button')]
    .filter(e => !e.closest('select') && e.getBoundingClientRect().width > 0
      && /^\s*Amit Kumar Shaji \[progbiz0017\]/.test(e.innerText || '') && (e.innerText || '').length < 60).length);
  expect(added, 'Amit should be listed as an added interviewer').toBeGreaterThan(0);

  await form.locator('button, a').filter({ hasText: /^\s*Schedule Interview\s*$/ }).last().click();
  await expect(page.getByText('Book a round against an active job opening').first(), 'the schedule form should close on success').toBeHidden({ timeout: 20000 });
  await expect.poll(async () => rowOn(page, fk, 'interview-schedules', /Schedule Interview/i, rec.roundName),
    { timeout: 60000, intervals: [10000], message: `the interview list should show ${rec.candidateName} as Scheduled` })
    .toMatch(/Scheduled/);
}

/** Wait for the slot to pass, record a 4/5 "Proceed" evaluation → interview Completed. */
async function recordEvaluation(page, rec) {
  const fk = new FormKit(page);
  // Feedback is only accepted once the booked slot has passed. Wait ON the Interviews page (the
  // booked interview visible) rather than on a blank tab, then reload it to pick up the new state.
  await fk.gotoReady(`${BASE}/interview-schedules`, { ready: /Schedule Interview/i });
  await readRows(page);
  const waitMs = rec.interviewAt.getTime() + 20000 - Date.now();
  if (waitMs > 0) {
    console.log(`  ⏳ waiting ${Math.ceil(waitMs / 1000)} s on the Interviews page for the booked slot to pass`);
    await page.waitForTimeout(waitMs);
    await fk.gotoReady(`${BASE}/interview-schedules`, { ready: /Schedule Interview/i });
    await readRows(page);
  }
  const row = page.locator('table tbody tr').filter({ hasText: rec.roundName }).first();
  await expect(row, "this run's interview row should be listed").toBeVisible({ timeout: 20000 });
  await row.locator('[title="Panel & Feedback"]').click();

  const save = page.locator('button').filter({ hasText: /Save My Evaluation/i }).first();
  await expect(save, 'Panel & Feedback should show "Save My Evaluation"').toBeVisible({ timeout: 20000 });
  const box = save.locator('xpath=ancestor::*[.//input[@type="datetime-local"]][1]');
  await expect(box.locator('input[type="datetime-local"]').first(),
    '"Interview conducted on" should be pre-filled with the booked slot').toHaveValue(dtLocal(rec.interviewAt));
  const star = page.getByRole('radio', { name: '4 out of 5' }).first();   // stars are role=radio
  await star.click();
  await expect(star, 'rating 4/5 should be selected').toHaveAttribute('aria-checked', 'true');
  await fk.setSelect(box.locator('select').filter({ has: page.locator('option', { hasText: 'Proceed' }) }).first(), 'Proceed', 'Recommendation');
  await fk.setInput(box.locator('textarea').first(), 'QA automated evaluation — proceed to offer.', 'Comments');
  await save.click();
  await expect(page.getByText(/Evaluation saved/i).first(), 'the app should confirm "Evaluation saved"').toBeVisible({ timeout: 15000 });
  await expect.poll(async () => rowOn(page, fk, 'interview-schedules', /Schedule Interview/i, rec.roundName),
    { timeout: 60000, intervals: [10000], message: 'the interview should become Completed' })
    .toMatch(/Completed/);
}

/** New Offer for the interview-cleared candidate (Total CTC 600000) → persisted Draft. */
async function createOffer(page, rec) {
  const fk = new FormKit(page);
  await fk.gotoReady(`${BASE}/offer-list`, { ready: /New Offer/i });
  await clickLauncher(page, /New Offer/i);
  const form = await fk.scope({ ready: '#offerDesignation' });

  await fk.setSelect(form.locator('#offerDesignation'), DESIGNATION, 'Designation');
  await fk.setCascade(form.locator('#offerOpening'), rec.openingCode, 'Job Opening', { loose: true });
  // Candidate is a TYPE-AHEAD (not a select). Only candidates who have cleared an interview are offered.
  const cand = form.locator('#offerCandidate');
  await expect(cand, 'Candidate search should enable after the opening').toBeEnabled({ timeout: 15000 });
  await cand.click();
  await cand.pressSequentially(rec.candidateEmail, { delay: 30 });   // search by unique e-mail
  const sug = page.locator('li').filter({ hasText: rec.candidateEmail }).first();
  await expect(sug, 'the evaluated candidate should be offered in the search').toBeVisible({ timeout: 15000 });
  await sug.click();
  await expect.poll(async () => cand.inputValue(), { timeout: 10000, message: 'Candidate should be set to this run\'s candidate' })
    .toContain(rec.candidateEmail);
  await fk.setSelect(form.locator('#offerBranch'), BRANCH, 'Branch');
  const jd = new Date(Date.now() + 21 * 864e5);
  await fk.setInput(form.locator('#offerJoining'), jd.toISOString().slice(0, 10), 'Joining Date');
  // Fill Total CTC only — Fixed CTC does not drive Total, and filling both once corrupted it.
  await fk.setInput(form.locator('#offerTotal'), '600000', 'Total CTC');
  await fk.setSelect(form.locator('#offerUserLevel'), 'Team Member', 'User Level');

  await form.locator('button').filter({ hasText: /^\s*Create Offer\s*$/ }).first().click();
  await expect(page.locator('#offerDesignation'), 'the offer form should close on success').toBeHidden({ timeout: 20000 });
  await expect.poll(async () => rowOn(page, fk, 'offer-list', /New Offer/i, rec.candidateName),
    { timeout: 60000, intervals: [10000], message: `the offers list should show ${rec.candidateName} as Draft, 600000.00` })
    .toMatch(/600000\.00.*Draft/);
}

/** More actions → Submit for Approval → Confirm (Pending Approval) → approve → Approved. */
async function submitAndApproveOffer(page, rec) {
  const fk = new FormKit(page);
  expect(await rowOn(page, fk, 'offer-list', /New Offer/i, rec.candidateName), 'the offer should be Draft first').toMatch(/Draft/);
  await rowMenuAction(page, page.locator('table tbody tr').filter({ hasText: rec.candidateName }).first(), /Submit for Approval/i);
  const ok = page.locator('.swal2-popup button, .modal.show button').filter({ hasText: /^\s*Confirm\s*$/ }).first();
  await expect(ok, 'a "Submit this offer for approval?" confirm should appear').toBeVisible({ timeout: 10000 });
  await ok.click();
  await expect.poll(async () => rowOn(page, fk, 'offer-list', /New Offer/i, rec.candidateName),
    { timeout: 60000, intervals: [10000], message: 'the offer should become Pending Approval' })
    .toMatch(/Pending Approval/);
  console.log('  ✅ offer submitted → Pending Approval');

  // Approve it in Recruitment Approvals (our row is identified by the candidate in Details).
  await approveRecruitmentRequest(page, fk, 'Offer', rec.candidateName);
  await expect.poll(async () => rowOn(page, fk, 'offer-list', /New Offer/i, rec.candidateName),
    { timeout: 60000, intervals: [10000], message: 'the offer should become Approved' })
    .toMatch(/Approved/);
}

/**
 * Send Offer (the app e-mails the offer to the candidate — reserved @example.com addresses only;
 * automated with the user's go-ahead) → Sent; Track Response "Accepted" → Accepted; the candidate
 * then lists in Offer Acceptance.
 */
async function sendOfferAndRecordAcceptance(page, rec) {
  const fk = new FormKit(page);
  const offerRow = () => page.locator('table tbody tr').filter({ hasText: rec.candidateName }).first();

  expect(await rowOn(page, fk, 'offer-list', /New Offer/i, rec.candidateName), 'the offer should be Approved first').toMatch(/Approved/);
  await rowMenuAction(page, offerRow(), /Send Offer/i);
  const sendDlg = page.locator('.swal2-popup, .modal.show, [role="dialog"]').filter({ hasText: /Email this offer/i }).first();
  await expect(sendDlg, 'the "Email this offer to the candidate?" confirm should appear').toBeVisible({ timeout: 10000 });
  await sendDlg.locator('button').filter({ hasText: /^\s*Confirm\s*$/ }).first().click();
  await expect(sendDlg, 'the send confirm should close').toBeHidden({ timeout: 20000 });
  await expect.poll(async () => rowOn(page, fk, 'offer-list', /New Offer/i, rec.candidateName),
    { timeout: 60000, intervals: [10000], message: 'the offer should become Sent' })
    .toMatch(/\bSent\b/);
  console.log(`  ✅ offer sent to ${rec.candidateEmail}`);

  // Record the candidate's acceptance: More actions → Track Response → Accepted → Save.
  await rowMenuAction(page, offerRow(), /Track Response/i);
  const track = page.locator('.modal.show').filter({ hasText: /Track Offer Response/i }).first();
  await expect(track, 'the Track Offer Response form should open').toBeVisible({ timeout: 10000 });
  await fk.setSelect(track.locator('select').first(), 'Accepted', 'Response');
  await fk.setInput(track.locator('textarea').first(), 'Candidate accepted the offer by e-mail.', 'Acceptance Remarks');
  await track.locator('button').filter({ hasText: /^\s*Save\s*$/ }).first().click();
  await expect(track, 'the Track Offer Response form should close on save').toBeHidden({ timeout: 20000 });
  await expect.poll(async () => rowOn(page, fk, 'offer-list', /New Offer/i, rec.candidateName),
    { timeout: 60000, intervals: [10000], message: 'the offer should become Accepted' })
    .toMatch(/\bAccepted\b/);
  console.log('  ✅ acceptance recorded → offer Accepted');

  // The accepted candidate now flows to Offer Acceptance / New Joiners (Accepted Offers tab).
  await expect.poll(async () => rowOn(page, fk, 'offer-acceptance', /Accepted Offers/i, rec.candidateEmail),
    { timeout: 60000, intervals: [10000], message: `Offer Acceptance should list ${rec.candidateEmail} as Accepted` })
    .toMatch(/Accepted/);
}

/**
 * Pre-boarding invite (the app e-mails the portal link — reserved @example.com addresses only;
 * automated with the user's go-ahead) → "Invited expires …" + "Resend Invite".
 */
async function sendPreboardingInvite(page, rec) {
  const fk = new FormKit(page);
  const accRow = () => page.locator('table tbody tr').filter({ hasText: rec.candidateEmail }).first();

  expect(await rowOn(page, fk, 'offer-acceptance', /Accepted Offers/i, rec.candidateEmail),
    'the accepted candidate should be "Not invited" yet').toMatch(/Not invited/);
  const send = accRow().locator('button').filter({ hasText: /^\s*Send Invite\s*$/ }).first();
  await expect(send, 'the row should offer "Send Invite"').toBeVisible({ timeout: 15000 });
  await send.click();
  const dlg = page.locator('.swal2-popup, .modal.show, [role="dialog"]').filter({ hasText: /pre-boarding portal link/i }).first();
  await expect(dlg, 'the "Email the pre-boarding portal link?" confirm should appear').toBeVisible({ timeout: 10000 });
  await expect(dlg, 'the invite confirm should name this run\'s candidate').toContainText(rec.candidateName);
  await dlg.locator('button').filter({ hasText: /^\s*Confirm\s*$/ }).first().click();
  await expect(dlg, 'the invite confirm should close').toBeHidden({ timeout: 20000 });
  await expect.poll(async () => rowOn(page, fk, 'offer-acceptance', /Accepted Offers/i, rec.candidateEmail),
    { timeout: 60000, intervals: [10000], message: 'Pre-Boarding should become "Invited expires …"' })
    .toMatch(/Invited expires \d{1,2}-\w{3}/);
  await expect(accRow().locator('button').filter({ hasText: /Resend Invite/i }).first(),
    'after inviting, the row should offer "Resend Invite"').toBeVisible({ timeout: 15000 });
}

module.exports = {
  BASE, DEPARTMENT, DESIGNATION, BRANCH, dtLocal,
  clickLauncher, gotoCandidatesRegister, searchRegister, candidateRow, assertCandidateListed,
  candidateNameTaken, openAddCandidate, readRows, rowOn, rowMenuAction, approveRecruitmentRequest,
  addInterviewRound, scheduleInterview, recordEvaluation, createOffer, submitAndApproveOffer,
  sendOfferAndRecordAcceptance, sendPreboardingInvite,
};
