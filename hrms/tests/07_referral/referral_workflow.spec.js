'use strict';

/**
 * Referral Program — positive workflow (single serial run).
 *
 *   RF1 Submit a referral      (REF-001)  /ess/referral → Refer a Candidate
 *   RF2 View own referral      (REF-002)  /ess/referral → My Referrals
 *   RF3 Admin reviews referral (REF-003)  /ess/referral/admin  (+ discovery log)
 *   RF4 Into recruitment       (REF-004)  Manage → assign opening → Accept & add to pipeline
 *                                          → candidate in the register (Source Referral)
 *   RF5 Track: interview       (REF-005)  round → schedule → evaluation; referral follows the ATS stage
 *   RF6 Track: hired           (REF-005)  offer → approve → send → accepted; referral → Hired
 *   RF7 Reward raised          (REF-006)  reward Pending (never approved / paid)
 *
 * Mandatory + conditional-mandatory fields only (Full name, Email, Gender,
 * Phone, How-do-you-know, Resume — see docs/automation/MANDATORY_FIELDS.md).
 * The submitting + reviewing account is the same admin, so no 2nd actor needed
 * for RF1-RF3.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { FormKit, waitVisible } = require('../../pages/FormKit');
const { person, tagged, RUN_TAG } = require('../../data/naming');
const {
  DESIGNATION, gotoCandidatesRegister, candidateRow, candidateNameTaken,
  addInterviewRound, scheduleInterview, recordEvaluation, createOffer, submitAndApproveOffer,
  sendOfferAndRecordAcceptance,
} = require('../../flows/recruitmentFlow');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

/** True when a referral for this exact full name already exists (admin list search). */
async function referralNameTaken(page, fk, fullName) {
  await fk.gotoReady(`${BASE}/ess/referral/admin`, { ready: /Referral|Dashboard|Submitted|Manage/i });
  const search = page.locator('input[placeholder*="Search" i]').first();
  await expect(search, 'the referral admin search box should be visible').toBeVisible({ timeout: 20000 });
  await search.fill(fullName);
  await search.press('Enter').catch(() => {});
  await page.waitForTimeout(2500);
  return (await page.locator('body').innerText()).includes(fullName);
}
const CV   = path.join(__dirname, '..', '..', 'fixtures', 'files', 'sample-cv.pdf');

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe.serial('Referral Program — refer → view → admin review', () => {
  const rf = {};

  // Company naming standard: a realistic referred person (data/naming.js). First name is one
  // word (the form rejects spaces there); the surname goes in Last name.
  const useNewPerson = () => {
    rf.who   = person();
    rf.name  = rf.who.full;
    rf.email = rf.who.email;
  };

  test.beforeAll(() => {
    useNewPerson();
    rf.phone = '9' + String(Date.now()).slice(-9);
    console.log(`  🤝 Referral run ${RUN_TAG} — referring "${rf.name}" <${rf.email}>`);
  });

  test('RF1 — submit a candidate referral (REF-001)', async ({ page }) => {
    test.setTimeout(200_000);
    const fk = new FormKit(page);
    // My Referrals identifies a referral by name only — make sure this name isn't already referred.
    // The offer list and approvals identify a candidate by name, so the name must be new to
    // Recruitment too (RF6 drives this person through an offer).
    const taken = async () => (await referralNameTaken(page, fk, rf.name))
      || (await gotoCandidatesRegister(page), await candidateNameTaken(page, rf.name));
    for (let i = 0; i < 6 && await taken(); i++) {
      console.log(`  ℹ️ "${rf.name}" was already referred — choosing another name`);
      useNewPerson();
    }
    expect(await taken(), `"${rf.name}" should be new to Referrals and Recruitment`).toBe(false);
    await fk.gotoReady(`${BASE}/ess/referral`, { ready: /Refer a Candidate/i });
    await page.locator('a, button, [role="button"]').filter({ hasText: /Refer a Candidate/i }).first().click();
    await page.waitForTimeout(1500);
    const form = await fk.scope({ ready: '#ref-phone' });

    // The refer form lays fields out in a grid, so "label → following input" is wrong
    // (it skips to the next field and leaves Email empty → "Candidate email is required",
    // which silently voids the whole submit). Anchor by the stable placeholders instead.
    await fk.setInput(form.getByPlaceholder('e.g. Priya'), rf.who.first, 'First name');
    await fk.setInput(form.getByPlaceholder('e.g. Sharma'), rf.who.last, 'Last name');
    await fk.setInput(form.getByPlaceholder('name@example.com'), rf.email, 'Email');
    await fk.setSelect(fk.selectWithOption(form, 'Male'), rf.who.gender, 'Gender');
    // Phone: the code select directly precedes #ref-phone.
    await fk.setSelect(form.locator('#ref-phone').locator('xpath=preceding::select[1]'), 'IND', 'Phone code', { loose: true });
    await fk.setInput(form.locator('#ref-phone'), rf.phone, 'Phone number');
    await fk.setInput(form.getByPlaceholder(/Former colleague/i), 'Former colleague at Infopark, Kochi', 'How do you know the candidate');
    await fk.upload(form.locator('input[type="file"]').first(), CV, 'Resume / CV');

    // Click the specific "Submit Referral" button (a generic save-verb matcher also hits
    // "Refer"/"Apply" controls on the page and may miss the real submit). Success = the
    // app navigates to the referral detail page.
    const submit = form.locator('button, a.btn').filter({ hasText: /Submit Referral/i }).first();
    await expect(submit, 'the "Submit Referral" button should be visible').toBeVisible();
    await submit.scrollIntoViewIfNeeded().catch(() => {});
    await submit.click();
    await page.waitForURL(/\/ess\/referral\/detail\//i, { timeout: 25000 });
    rf.submitVia = 'detail-redirect';
    console.log(`  ✅ RF1 referral submitted (${rf.submitVia})`);
  });

  test('RF2 — the referrer can see the submitted referral (REF-002)', async ({ page }) => {
    test.setTimeout(90_000);
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/referral`, { ready: /My Referrals|Total Referred|Refer a Candidate/i });
    // "My Referrals" view.
    const myTab = page.locator('a, button, [role="tab"], [role="button"]').filter({ hasText: /My Referrals/i }).first();
    if (await myTab.count()) { await myTab.click(); await page.waitForTimeout(2000); }
    await expect(page.getByText(rf.name, { exact: false }).first(), `My Referrals should list "${rf.name}"`).toBeVisible({ timeout: 25000 });
    console.log(`  ✅ RF2 referrer sees "${rf.name}" in My Referrals`);
  });

  test('RF3 — admin sees the referral and can act on it (REF-003) + capture controls', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/ess/referral/admin`, { ready: /Referral|Dashboard|Submitted|Manage/i });
    await page.waitForTimeout(1500);

    const search = page.locator('input[placeholder*="Search" i], input[placeholder*="name" i]').first();
    if (await search.count()) { await search.fill(rf.name); await page.waitForTimeout(1500); }
    await expect(page.getByText(rf.name, { exact: false }).first(), `admin should see the referral "${rf.name}"`).toBeVisible({ timeout: 20000 });

    // Discovery: log the admin row/detail action controls for REF-003/REF-004 wiring.
    const controls = await page.evaluate((name) => {
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left > 250; };
      const row = [...document.querySelectorAll('tr, .card, [class*="referral" i]')].find(el => (el.innerText || '').includes(name));
      const scope = row || document;
      const btns = [...scope.querySelectorAll('button, a, [role="button"]')].filter(vis)
        .map(e => (e.innerText || e.title || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
        .filter(t => t && t.length < 26);
      return [...new Set(btns)];
    }, rf.name);
    console.log(`  🔎 Referral admin controls → ${JSON.stringify(controls)}`);
    console.log(`  ✅ RF3 admin sees referral "${rf.name}"`);
  });

  /** Admin list → search this run's referral by e-mail → its row text (status, reward). */
  async function adminRowText(page, fk) {
    await fk.gotoReady(`${BASE}/ess/referral/admin`, { ready: 'input[placeholder="Candidate, email or referrer"]' });
    const search = page.getByPlaceholder(/Candidate, email or referrer/i).first();
    await expect(search, 'the referral admin search box should be visible').toBeVisible({ timeout: 20000 });
    await search.fill(rf.email);
    await search.press('Enter').catch(() => {});
    const row = page.locator('table tbody tr').filter({ hasText: rf.email }).first();
    await expect(row, `the admin list should show ${rf.email}`).toBeVisible({ timeout: 20000 });
    return { row, text: (await row.innerText()).replace(/\s+/g, ' ') };
  }

  /** Open this run's referral Manage page (remembered after the first open). */
  async function openReferral(page, fk) {
    if (!rf.detailUrl) {
      const { row } = await adminRowText(page, fk);
      await row.locator('a, button').filter({ hasText: /Manage/i }).first().click();
      await page.waitForURL(/\/ess\/referral\/admin\/detail\//, { timeout: 20000 });
      rf.detailUrl = page.url();
    } else {
      await fk.gotoReady(rf.detailUrl, { ready: 'input[placeholder="Note (optional)"]' });
    }
    await expect(page.getByText(rf.email).first(), 'the Manage Referral page should be for this run\'s referral').toBeVisible({ timeout: 20000 });
  }

  /** Detail page text after a fresh load (status badge, rewards, timeline). */
  async function detailText(page, fk) {
    await fk.gotoReady(rf.detailUrl, { ready: 'input[placeholder="Note (optional)"]' });
    await expect(page.getByText(rf.email).first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);
    return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  }

  /** Wait until the referral's status (admin list) matches `re`, re-reading after fresh loads. */
  async function expectReferralStatus(page, fk, re, what) {
    await expect.poll(async () => (await adminRowText(page, fk)).text,
      { timeout: 90000, intervals: [3000, 5000], message: `the referral should show ${what}` })
      .toMatch(re);
  }

  test('RF4 — assign the referral to an opening and accept it into the pipeline (REF-004)', async ({ page }) => {
    test.setTimeout(240_000);
    const fk = new FormKit(page);
    expect(rf.email, 'RF4 depends on RF1').toBeTruthy();
    expect((await adminRowText(page, fk)).text, 'the referral should start as Submitted').toContain('Submitted');
    await openReferral(page, fk);

    // A "General referral" must be assigned to an open job (select → Assign) before it can be
    // accepted — accepting first only raises "Assign this referral to an open job…".
    // Use the newest SOFTWARE TESTER opening (highest JOB number) — it has the fewest candidates,
    // so the interview form's candidate list (filtered by opening) stays unambiguous.
    const job = fk.selectWithOption(page, 'Choose an open job');
    const opts = (await job.locator('option').allTextContents()).map(t => t.trim()).filter(t => /JOB\d+/.test(t) && t.includes(DESIGNATION));
    expect(opts.length, `an open ${DESIGNATION} opening should be offered`).toBeGreaterThan(0);
    const newest = opts.sort((x, y) => Number(y.match(/JOB(\d+)/)[1]) - Number(x.match(/JOB(\d+)/)[1]))[0];
    await fk.setSelect(job, newest, 'Open job');
    rf.job = newest.match(/JOB\d+/)[0];
    await page.locator('button').filter({ hasText: /^\s*Assign\s*$/ }).first().click();
    await expectReferralStatus(page, fk, new RegExp(DESIGNATION), `role "${DESIGNATION}"`);
    expect(await detailText(page, fk), 'the timeline should record the job assignment').toMatch(/Assigned to the .+ opening/i);
    console.log(`  ✅ RF4a referral assigned to ${rf.job} (${DESIGNATION})`);

    // Accept & add to pipeline → "Referral accepted and added to the recruitment pipeline".
    // A refusal ("Assign this referral to an open job…") fails the step — never clicked away.
    await openReferral(page, fk);
    await page.locator('button').filter({ hasText: /Accept & add to pipeline/i }).first().click();
    const popup = page.locator('.swal2-popup').filter({ hasText: /\w/ }).first();
    await expect(popup, 'the app should answer the accept').toBeVisible({ timeout: 15000 });
    const said = (await popup.innerText()).replace(/\s+/g, ' ');
    expect(said, 'the accept should succeed, not be refused').toMatch(/accepted and added to the recruitment pipeline/i);
    await popup.locator('button').filter({ hasText: /^\s*OK\s*$/i }).first().click({ timeout: 5000 }).catch(() => {});
    await expectReferralStatus(page, fk, /In Pipeline/, '"In Pipeline"');
    expect(await detailText(page, fk), 'the referral should be linked to the recruitment ATS').toMatch(/ATS stage:\s*APPLIED/i);
    console.log('  ✅ RF4b referral accepted → In Pipeline (ATS stage APPLIED)');

    // Converted into recruitment: the candidate is in the Candidates register, sourced from the referral.
    const reg = await candidateRow(page, rf.email);
    expect(reg, 'the referred candidate should be in the Candidates register').toContain(rf.email);
    expect(reg, 'the register should show Stage APPLIED and Source Referral').toMatch(/APPLIED\s+Referral/);
    console.log('  ✅ RF4c candidate in the Candidates register (Stage APPLIED, Source Referral)');
  });

  // Once linked, the referral's status follows the candidate's ATS stage ("Status updates
  // automatically as the candidate advances" — a manual status is overwritten by the next
  // "Pipeline update"). So the referred candidate is advanced through the real recruitment steps.
  test('RF5 — interview the referred candidate; the referral tracks the ATS stage (REF-005)', async ({ page }) => {
    test.setTimeout(480_000);
    const fk = new FormKit(page);
    expect(rf.job, 'RF5 depends on RF4').toBeTruthy();
    rf.rec = { candidateName: rf.name, candidateEmail: rf.email, cand: rf.who, openingCode: rf.job,
      roundName: tagged('Referral Technical Round') };
    console.log(`  ✅ RF5a interview round "${rf.rec.roundName}" created (${await addInterviewRound(page, rf.rec)})`);
    await scheduleInterview(page, rf.rec);
    console.log('  ✅ RF5b interview scheduled (persisted)');
    await recordEvaluation(page, rf.rec);
    console.log('  ✅ RF5c evaluation saved → interview Completed');
    const reg = await candidateRow(page, rf.email);
    expect(reg, 'the ATS stage should have moved on from APPLIED').not.toMatch(/\bAPPLIED\b/);
    rf.atsAfterInterview = (reg.match(/\b([A-Z][A-Z ]{3,})\s+Referral\b/) || [, '?'])[1].trim();
    const detail = await detailText(page, fk);
    expect(detail, 'the referral page should show the same ATS stage').toContain(`ATS stage: ${rf.atsAfterInterview}`);
    expect(detail, 'the timeline should log a pipeline update for the new stage').toContain(`Pipeline update: ${rf.atsAfterInterview}`);
    console.log(`  ✅ RF5d referral tracks the ATS → stage ${rf.atsAfterInterview}`);
  });

  test('RF6 — offer accepted → the referral becomes Hired (REF-005)', async ({ page }) => {
    test.setTimeout(480_000);
    const fk = new FormKit(page);
    expect(rf.rec && rf.rec.interviewAt, 'RF6 depends on RF5').toBeTruthy();
    expect(await detailText(page, fk), 'no reward should exist before hiring').toMatch(/No rewards yet/i);
    await createOffer(page, rf.rec);
    console.log('  ✅ RF6a offer created (Draft)');
    await submitAndApproveOffer(page, rf.rec);
    console.log('  ✅ RF6b offer approved');
    await sendOfferAndRecordAcceptance(page, rf.rec);
    console.log('  ✅ RF6c offer sent and accepted');
    await expectReferralStatus(page, fk, /\bHired\b/, '"Hired" once the offer is accepted');
    expect(await detailText(page, fk), 'the referral should show ATS stage HIRED').toMatch(/ATS stage:\s*HIRED/i);
    console.log('  ✅ RF6d referral → Hired (ATS stage HIRED)');
  });

  // Reward: "A reward is raised automatically when the candidate is hired." Positive scope stops
  // at the raised (Pending) reward — approving / paying it is a payout and is never automated, and
  // the shared Reward Policy (/ess/referral/admin/policy) is never edited.
  test('RF7 — a referral reward is raised on hiring (REF-006)', async ({ page }) => {
    test.setTimeout(150_000);
    const fk = new FormKit(page);
    expect(rf.detailUrl, 'RF7 depends on RF6').toBeTruthy();
    await expect.poll(async () => detailText(page, fk),
      { timeout: 60000, intervals: [3000, 5000], message: 'a reward should be raised on hiring' })
      .not.toMatch(/No rewards yet/i);
    await expectReferralStatus(page, fk, /Hired\s+Pending/, 'reward "Pending"');
    console.log('  ✅ RF7 reward raised automatically (Pending) — not approved/paid');
  });
});
