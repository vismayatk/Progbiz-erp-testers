'use strict';

/**
 * Recruitment — SRS changes for the 02→09 Nov 2026 dev window (R1–R9).
 * Source: Z:\hrms documents\SRS\SRS-ESS-Recruitment-Changes-2026-11-09.docx
 *
 * These are SELF-CONTAINED checks of the newly-shipped behaviour, independent of
 * the serial hiring chain in recruitment_workflow.spec.js. They verify the new
 * UI surfaces, their validation and their negative cases — the "How to test" and
 * "negative cases" the SRS lists — using existing tenant data and WITHOUT running
 * one-way destructive actions (e.g. R3's onboarding teardown): the "Not Joined"
 * modal is opened, its validation asserted, then cancelled, so the suite is
 * repeatable. Phase-0 smoke (2026-11-10) confirmed every route below is deployed.
 *
 * Coverage: R1, R2, R3, R7, R8, R9 are fully automated and green against live.
 *   - R4 (Not-Joined flag across screens) is deferred: it needs a candidate ALREADY
 *     marked Not Joined, and marking one is the one-way teardown this suite avoids.
 *   - R5 (In-Person interview location auto-fill) is deferred: it needs a schedulable
 *     application whose opening's branch has a saved map pin.
 *   - R6 (list filter persistence) is a documented fixme — see its note below.
 *
 * Run: npx playwright test -c hrms/playwright.config.js hrms/tests/02_recruitment/srs_2026_11_changes.spec.js
 */
const { test, expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../../pages/FormKit');
const { openAddCandidate, rowMenuAction, readRows } = require('../../flows/recruitmentFlow');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

test.describe('Recruitment SRS 2026-11 (R1–R9)', () => {

  // ── R1 — Add Candidate slide-in panel: opens as offcanvas, guarded against stray close ──
  test('R1 Add Candidate opens as a slide-in panel that resists Esc/backdrop and reopens blank', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/recruitment-candidates`, { ready: /Recruitment Candidates|Add New/i });

    const panel = await openAddCandidate(page);
    await expect(panel.locator('.offcanvas-title, h5, h4, h3').first(),
      'the panel should be titled "Add New Candidate"').toContainText(/Add New Candidate/i);

    // Fields present (the shared quick-add form)
    for (const lab of ['First Name', 'Email', 'Gender', 'Phone', 'Source', 'Apply to Job Opening']) {
      await expect(panel.getByText(new RegExp(lab, 'i')).first(), `panel shows "${lab}"`).toBeVisible();
    }

    // Half-fill, then try to dismiss by stray backdrop click + Esc — the panel must NOT close.
    await fk.setInput(fk.fieldByLabel(panel, 'First Name', 'input'), 'Temp', 'First Name');
    await page.mouse.click(5, 300).catch(() => {});                 // backdrop (top-left, outside panel)
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
    await expect(panel, 'a half-filled panel should survive a stray backdrop click + Esc').toBeVisible();

    // Close deliberately via Cancel, reopen, confirm it is blank.
    const cancel = panel.locator('button, a').filter({ hasText: /^\s*Cancel\s*$/i }).first();
    await cancel.click();
    await expect(panel, 'Cancel should close the panel').toBeHidden({ timeout: 10000 });

    const panel2 = await openAddCandidate(page);
    await expect(fk.fieldByLabel(panel2, 'First Name', 'input'),
      'reopening the panel should present a blank First Name').toHaveValue('');
    await panel2.locator('button, a').filter({ hasText: /^\s*Cancel\s*$/i }).first().click();
  });

  // ── R1 — the identical form also renders as a routed full page ──
  test('R1 Add Candidate also renders as a standalone full page', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/recruitment-candidate/add`, { ready: /Add Candidate/i });
    await expect(page.locator('#recAddTalentPoolOnly'),
      'the full page carries the same "Add to Talent Pool only" switch as the panel').toHaveCount(1);
    // Scope label checks to the form itself so they don't match sidebar nav items.
    const form = page.locator('form, .card, section').filter({ has: page.locator('#recAddTalentPoolOnly') }).first();
    for (const lab of ['First Name', 'Email', 'Gender', 'Phone', 'Source']) {
      await expect(form.getByText(new RegExp(lab, 'i')).first(), `full page shows "${lab}"`).toBeVisible();
    }
  });

  // ── R2 — "Add to Talent Pool only" toggle hides the opening cascade + interview waiver, makes resume optional ──
  test('R2 Talent-Pool-only toggle hides the job-opening cascade and makes resume optional', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/recruitment-candidates`, { ready: /Recruitment Candidates|Add New/i });
    const panel = await openAddCandidate(page);

    // Before toggling: the Dept→Desig→Opening cascade and a mandatory Resume* are shown.
    await expect(panel.getByText(/Apply to Job Opening/i).first(), 'cascade present before toggle').toBeVisible();
    await expect(panel.getByText(/Resume\s*\*/i).first(), 'Resume is mandatory before toggle').toBeVisible();

    const toggle = panel.locator('#recAddTalentPoolOnly');
    await fk.check(toggle, 'Add to Talent Pool only');

    // After toggling: cascade + Interview-Not-Required disappear; Resume label drops the asterisk (optional).
    await expect(panel.getByText(/Apply to Job Opening/i),
      'the job-opening cascade should vanish in Talent-Pool-only mode').toHaveCount(0);
    await expect(panel.locator('#recAddInterviewNotRequired'),
      '"Interview Not Required" should vanish in Talent-Pool-only mode').toHaveCount(0);
    await expect(panel.getByText(/Resume\s*\(optional\)/i).first(),
      'Resume should read "(optional)" in Talent-Pool-only mode').toBeVisible();

    await panel.locator('button, a').filter({ hasText: /^\s*Cancel\s*$/i }).first().click();
  });

  // ── R3 — Offer Acceptance "Not Joined": menu item + modal validation (opened then cancelled, non-destructive) ──
  test('R3 Offer Acceptance offers "Not Joined" with Reason + Rehire Eligibility validation', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/offer-acceptance`, { ready: /Offer Acceptance|Accepted Offers/i });
    const rows = await readRows(page);
    test.skip(rows.length === 0, 'no accepted-offer cards on the board to exercise Not Joined');

    const row = page.locator('table tbody tr').first();
    const more = row.locator('button, a').filter({ hasText: /More actions/i })
      .or(row.locator('[title*="More actions" i], [aria-label*="More actions" i]')).first();
    const dlg = page.locator('.modal.show, [role="dialog"]').filter({ hasText: /Not Joined/i }).first();
    // Open More actions → Not Joined. Blazor dropdowns can need a second open; re-open the
    // menu (not the modal) each pass, and stop as soon as the modal is up.
    for (let a = 0; a < 3 && !(await dlg.isVisible().catch(() => false)); a++) {
      await more.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(700);
      const item = page.locator('.dropdown-menu.show a, .dropdown-menu.show button').filter({ hasText: /Not Joined/i }).first();
      if (await waitVisible(item, 4000)) { await item.click().catch(() => {}); }
      await page.waitForTimeout(1500);
    }
    await expect(dlg, 'the "Not Joined — <candidate>" modal should open').toBeVisible({ timeout: 10000 });
    await expect(dlg.getByText(/Reason for Not Joining/i).first(), 'the modal asks for a Reason for Not Joining').toBeVisible();
    await expect(dlg.getByText(/Rehire Eligibility/i).first(), 'the modal asks for Rehire Eligibility').toBeVisible();
    // The rehire-eligibility select offers the three SRS options.
    await expect(dlg.locator('select').first(), 'eligibility offers Eligible / Not Eligible / Eligible with Conditions')
      .toContainText(/Eligible with Conditions/i);

    // Negative: Submit with empty fields → a SweetAlert demands the Not-Joining reason.
    await dlg.locator('button').filter({ hasText: /^\s*Submit\s*$/i }).first().click();
    const swal = page.locator('.swal2-container');
    await expect(swal, 'empty Submit should raise a validation popup').toBeVisible({ timeout: 8000 });
    await expect(swal, 'the popup should ask for the reason the candidate did not join')
      .toContainText(/reason the candidate did not join|enter the reason/i);
    await swal.locator('.swal2-confirm, button').filter({ hasText: /ok|got it|close/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await expect(swal, 'dismiss the validation popup').toBeHidden({ timeout: 8000 });

    // Cancel WITHOUT submitting — we never actually mark anyone Not Joined (that teardown is one-way).
    await expect(dlg, 'the Not-Joined modal should still be open after the blocked submit').toBeVisible();
    await dlg.locator('button').filter({ hasText: /^\s*Cancel\s*$/i }).first().click();
    await expect(dlg, 'Cancel should close the Not-Joined modal, leaving the offer untouched').toBeHidden({ timeout: 10000 });
  });

  // ── R7 — Candidate Status Add/Edit dialog now shows Save (was missing for recruiters) ──
  test('R7 Candidate Status Add dialog presents a Save button', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/candidate-status`, { ready: /Candidate Status|Add/i });
    await page.locator('main, .main-content').locator('button, a.btn, [role="button"]')
      .filter({ hasText: /Add (Followup |New )?Status|^\s*Add\b/i }).first().click().catch(() => {});
    const dlg = page.locator('.modal.show, .offcanvas.show, [role="dialog"]').first();
    await expect(dlg, 'the Add Status dialog should open').toBeVisible({ timeout: 12000 });
    await expect(dlg, 'it is the "Add New Status" dialog').toContainText(/Add New Status|Status Name/i);
    await expect(dlg.locator('button').filter({ hasText: /save/i }).first(),
      'the dialog should now present a Save (Save Status) button for recruiters').toBeVisible({ timeout: 8000 });
    await page.keyboard.press('Escape').catch(() => {});
  });

  // ── R8 — Candidates menu moved under HRMS → Candidates ──
  test('R8 Candidates + Candidate Status live under the HRMS → Candidates group', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/candidates`, { ready: /Candidates/i });
    const nav = page.locator('aside, [class*="sidebar" i], [class*="side-menu" i]').first();
    await expect(nav.getByText(/^\s*Candidate Status\s*$/i).first(),
      'the sidebar should list Candidate Status under the Candidates group').toBeVisible({ timeout: 10000 });
    // Both pages open.
    await fk.gotoReady(`${BASE}/candidate-status`, { ready: /Candidate Status/i });
    expect(page.url()).toContain('/candidate-status');
  });

  // ── R9 — Pre-boarding Approvals shows Department & Designation columns ──
  test('R9 Pre-boarding Approvals lists Department and Designation columns', async ({ page }) => {
    const fk = new FormKit(page);
    await fk.gotoReady(`${BASE}/preboarding-approvals`, { ready: /Pre.?boarding Approvals/i });
    const heads = (await page.locator('table thead th, table thead td').allInnerTexts().catch(() => []))
      .map(h => h.trim());
    expect(heads.join(' | '), 'the grid should carry a Department column').toMatch(/Department/i);
    expect(heads.join(' | '), 'the grid should carry a Designation column').toMatch(/Designation/i);
  });

  // ── R6 — Candidate list keeps filters/tab/page when you open a candidate and come back ──
  // NOTE: on this build the register rows expose no text/href action controls and a plain row
  // click does not navigate, so the "open a candidate, then return" trip can't be driven
  // deterministically from automation without first mapping the exact open control (name-cell
  // click vs eye vs Info/Edit) and its target route. The search box IS present and filterable
  // (verified in Phase-0 probing); the persistence-on-return itself needs that open mechanism.
  // Left as a documented manual check rather than a flaky/false assertion. TODO once the
  // candidate-open control on /recruitment-candidates is captured.
  test.fixme('R6 Candidate list keeps filters/tab/page when opening a candidate and returning', async () => {});

});
