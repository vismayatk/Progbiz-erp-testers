'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { expectToast, confirmSwal, visibleErrorText } = require('./reUi');

/**
 * /resignation/{guid} — the exit detail page (SRS §11, §7.4, FR-06..08, FR-32..35).
 * Info card + timeline (approver names) + approval card (Approve / Reject / Send Back, optional
 * revised LWD) + HR Review (Confirmed LWD, Notice Treatment, Block gratuity + reason, Exit Checklist
 * Template, HR Remarks, Save) + Retention + Rehire + Letters (preview / generate) + quick links to
 * the checklist, interview and F&F + Close Exit (all-gates readiness).
 *
 * Built text-anchored and resilient: card markup varies, so actions are found by their button text
 * within the content area, and outcomes are asserted on the re-read status / toast.
 */
class ResignationDetailPage extends BasePage {
  constructor(page) {
    super(page, 'resignation');
    this.fk = new FormKit(page);
  }

  async open(guid) {
    // The detail page sometimes comes up as an empty shell on a cold render; reload until its content
    // composes, up to 3 tries.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.goto(`resignation/${guid}`);
      if (await this.main.isVisible().catch(() => false)) {
        const ready = await this.main.getByText(/Timeline|Pending Approval|On Notice|HR Review|Approval —|Retention/i).first()
          .waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
        if (ready) { await this.page.waitForTimeout(1200); return; }
      }
      await this.page.waitForTimeout(1500);
    }
    await expect(this.main, 'the exit detail page should render').toBeVisible({ timeout: 15000 });
    await this.page.waitForTimeout(1200);
  }

  /** The whole page text, normalised (for status / gate / timeline assertions). */
  async text() { return (await this.main.innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); }

  /** A coarse status read from the page (On Notice / Pending / Approved / Closed / …). */
  async status() {
    const t = await this.text();
    const m = t.match(/\b(Pending Approval|Sent Back|Approved · On Notice|On Notice|Approved|Closed|Withdrawn|Retained|Rejected|Submitted)\b/i);
    return m ? m[1] : '(unknown)';
  }

  btn(re) { return this.main.locator('button, a.btn, [role="button"]').filter({ hasText: re }).filter({ hasNotText: /back to|cancel|close filter/i }).first(); }

  // ── Approval ─────────────────────────────────────────────────────────────────
  /** Is an Approve control present and enabled for the current admin (amit)? Waits for render. */
  async canApprove() {
    const b = this.btn(/^\s*Approve\s*$/i);
    if (!(await waitVisible(b, 8000))) return false;
    return !(await b.isDisabled().catch(() => true));
  }

  /** The open confirm dialog (Bootstrap modal OR SweetAlert). */
  confirmDialog() { return this.page.locator('.modal.show:visible, .swal2-popup:visible, [role="dialog"]:visible').first(); }

  /**
   * Approve the current level (FR-07). Clicking Approve opens a confirm dialog ("Approve exit
   * request — Are you sure?") with an Approve/Confirm button that must be clicked to commit; an
   * optional revised-LWD field may ride the dialog.
   */
  async approve({ revisedLwd } = {}) {
    const b = this.btn(/^\s*Approve\s*$/i);
    await expect(b, 'an Approve button').toBeVisible({ timeout: 15000 });
    await b.click();
    const dlg = this.confirmDialog();
    await expect(dlg, 'the approve-confirm dialog').toBeVisible({ timeout: 10000 });
    if (revisedLwd) { const d = dlg.locator('input[type="date"]').first(); if (await d.count()) await d.fill(revisedLwd).catch(() => {}); }
    await dlg.locator('button, .swal2-confirm').filter({ hasText: /^\s*Approve\s*$|confirm|yes|proceed|ok/i })
      .filter({ hasNotText: /cancel/i }).first().click();
    await expectToast(this.page, /approv|success|on notice|activated/i, 'Approve exit').catch(() => {});
    await this.page.waitForTimeout(2000);
  }

  async reject({ reason = 'Rejected by automation test' } = {}) {
    const b = this.btn(/^\s*Reject\s*$/i);
    await expect(b, 'a Reject button').toBeVisible({ timeout: 15000 });
    await b.click();
    const dlg = this.confirmDialog();
    await expect(dlg, 'the reject-confirm dialog').toBeVisible({ timeout: 10000 });
    const box = dlg.locator('textarea').first();
    if (await waitVisible(box, 3000)) await box.fill(reason).catch(() => {});
    await dlg.locator('button, .swal2-confirm').filter({ hasText: /^\s*Reject\s*$|confirm|yes|proceed/i })
      .filter({ hasNotText: /cancel/i }).first().click();
    await expectToast(this.page, /reject|success/i, 'Reject exit').catch(() => {});
    await this.page.waitForTimeout(1500);
  }

  /**
   * Pick the Exit Checklist Template in HR Review (matched loosely by `nameLike`) and save — this
   * must happen BEFORE the final approval so the checklist materializes from it at approval
   * (auto-selection yields nothing when several active templates are ambiguous). Returns true if a
   * template was picked.
   */
  // The Exit Checklist Template <select> is the one offering "-- Auto (by designation) --".
  checklistTemplateSelect() { return this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /Auto \(by designation\)/i }) }).first(); }
  saveReviewBtn() { return this.main.locator('button, a.btn').filter({ hasText: /^\s*Save Review\s*$/i }).first(); }

  /** Select the Exit Checklist Template option (no save). Returns the matched label or false. */
  async _pickChecklistTemplate(nameLike) {
    const ct = this.checklistTemplateSelect();
    if (!(await ct.count())) return false;
    const opts = (await ct.locator('option').allTextContents()).map(t => t.trim());
    const match = opts.find(o => o.toLowerCase().includes(nameLike.toLowerCase()) && !/^--|auto/i.test(o))
      || opts.find(o => /Standard Exit/i.test(o))
      || opts.find(o => o && !/^--|auto/i.test(o));   // any real template
    if (!match) return false;
    await ct.selectOption({ label: match });
    await this.page.waitForTimeout(400);
    return match;
  }

  /** Pick the checklist template and save it (standalone, inline pre-approval Save Review). */
  async setChecklistTemplate(nameLike) {
    const match = await this._pickChecklistTemplate(nameLike);
    if (!match) return false;
    const save = this.saveReviewBtn();
    await expect(save, 'the Save Review button').toBeVisible({ timeout: 10000 });
    await save.click();
    await expectToast(this.page, /success|saved|updated|review/i, 'Save checklist template pick').catch(() => {});
    await this.page.waitForTimeout(1500);
    return match;
  }

  // ── HR Review (§7.4) ──────────────────────────────────────────────────────────
  /**
   * Record HR review. Post-approval the HR Review card is READ-ONLY until "Edit HR Review" is
   * clicked; the editable form saves with "Save Amendment" (pre-approval it is inline with "Save
   * Review"). Sets Confirmed LWD, notice treatment and HR remarks; the checklist template is picked
   * separately before approval.
   */
  async saveHrReview({ confirmedLwd, noticeTreatment, hrRemarks, checklistTemplate } = {}) {
    const edit = this.main.locator('button, a.btn').filter({ hasText: /Edit HR Review/i }).first();
    const editing = await edit.count();
    if (editing) { await edit.click(); await this.page.waitForTimeout(1500); }
    const save = this.main.locator('button, a.btn').filter({ hasText: /Save Amendment|Save Review/i }).first();
    if (!(await save.count())) return;   // HR Review not editable in this state
    const scope = save.locator('xpath=ancestor::*[.//input[@type="date"] or .//select or .//textarea][1]');
    const root = (await scope.count()) ? scope : this.main;
    if (confirmedLwd) {
      // the Confirmed LWD date field — enabled, not the (disabled) retention date
      const lwd = root.locator('input[type="date"]:not([disabled]):not(#retention-date)').first();
      if (await lwd.count()) { await lwd.fill(confirmedLwd); await lwd.evaluate(e => e.blur()).catch(() => {}); await this.page.waitForTimeout(300); }
    }
    if (noticeTreatment) {
      const nt = root.locator('select').filter({ has: this.page.locator('option', { hasText: /Served Fully/i }) }).first();
      if (await nt.count()) await this.fk.setSelect(nt, noticeTreatment, 'Notice Treatment', { loose: true }).catch(() => {});
    }
    if (checklistTemplate) await this._pickChecklistTemplate(checklistTemplate).catch(() => {});   // select; saved by the one Save below
    if (hrRemarks) { const rem = root.locator('textarea').last(); if (await rem.count()) await rem.fill(hrRemarks).catch(() => {}); }
    // Amending a recorded HR review requires a mandatory "Correction Reason" or Save Amendment stays disabled.
    if (editing) {
      const corr = root.locator('textarea[placeholder*="Why the recorded" i], textarea[placeholder*="Correction Reason" i], input[placeholder*="Correction Reason" i]').first();
      if (await corr.count()) await corr.fill('Automated correction — Confirmed LWD set to the effective last working day for closure.').catch(() => {});
    }
    await expect(save, 'Save Amendment/Review should be enabled').toBeEnabled({ timeout: 10000 });
    await save.click();
    await expectToast(this.page, /success|saved|updated|amend|review/i, 'Save HR review').catch(() => {});
    await this.page.waitForTimeout(1200);
  }

  // ── Retention / Rehire (FR-34, FR-35) ──────────────────────────────────────────
  /**
   * Record the Retention Discussion (card: #retention-conducted, #retention-date, Outcome select
   * [Retain / Proceed with Exit / Hold decision], Participants, Summary, "Save Retention"). The
   * FINAL approval of a resignation is gated on a "Proceed with Exit" outcome, so this must run
   * before the last approve. Outcome "Retain" would instead CLOSE the exit as Retained.
   */
  async recordRetention({ outcome = 'Proceed with Exit', date, participants = 'Reporting Manager, HR', summary = 'Proceeding with the exit (automation test).' } = {}) {
    const conducted = this.page.locator('#retention-conducted');
    if (await conducted.count() && !(await conducted.isChecked().catch(() => false))) { await conducted.click({ force: true }).catch(() => {}); await this.page.waitForTimeout(500); }
    if (date) { const d = this.page.locator('#retention-date'); if (await d.count()) await d.fill(date).catch(() => {}); }
    const sel = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /Proceed with Exit/i }) }).first();
    await expect(sel, 'the Retention Outcome select').toBeVisible({ timeout: 10000 });
    await this.fk.setSelect(sel, outcome, 'Retention Outcome', { loose: true });
    const part = this.main.locator('input[placeholder*="Reporting Manager" i]').first();
    if (await part.count()) await part.fill(participants).catch(() => {});
    // the Summary textarea nearest the retention outcome (the last textarea in that card area)
    const rem = sel.locator('xpath=following::textarea[1]').first();
    if (await rem.count()) await rem.fill(summary).catch(() => {});
    const save = this.btn(/Save Retention/i);
    await save.click();
    await expectToast(this.page, /success|saved|retention|recorded/i, 'Save retention').catch(() => {});
    await this.page.waitForTimeout(1500);
  }

  async recordRehire({ eligibility = 'Eligible', remarks = 'Good leaver — rehire eligible' } = {}) {
    const sel = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /Eligible/i }) }).first();
    if (await sel.count()) await this.fk.setSelect(sel, eligibility, 'Rehire Eligibility', { loose: true }).catch(() => {});
    const rem = this.main.getByText(/rehire/i).first().locator('xpath=following::textarea[1]').first();
    if (await rem.count()) await rem.fill(remarks).catch(() => {});
    const save = this.btn(/save rehire|record rehire|rehire/i);
    if (await save.count()) { await save.click(); await expectToast(this.page, /success|saved|rehire/i, 'Record rehire').catch(() => {}); }
  }

  // ── Letters (FR-29..31) ─────────────────────────────────────────────────────────
  // The Exit Letters card: one template <select> (-- Choose a letter template -- / Experience /
  // Relieving / …). Flow: pick a template → "Preview" (renders inline) → "Issue Letter".
  letterSelect() { return this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /Choose a letter template|Relieving|Experience/i }) }).first(); }

  /** Which letters the type offers (from the template select options). */
  async issuableLetters() {
    const sel = this.letterSelect();
    if (!(await sel.count())) return [];
    return (await sel.locator('option').allTextContents()).map(t => t.trim()).filter(t => t && !/choose a letter/i.test(t));
  }

  /**
   * Issue a letter by name: select the template → Preview → Issue Letter → confirm.
   * Returns 'issued' | 'already' | 'not-available'.
   */
  async generateLetter(name) {
    const sel = this.letterSelect();
    if (!(await sel.count())) return 'not-available';
    const opt = (await sel.locator('option').allTextContents()).map(t => t.trim()).find(o => new RegExp(name, 'i').test(o));
    if (!opt) return 'not-available';
    await sel.selectOption({ label: opt });
    await this.page.waitForTimeout(1000);
    const preview = this.main.locator('button, a.btn').filter({ hasText: /^\s*Preview\s*$/i }).first();
    if (await preview.count() && !(await preview.isDisabled().catch(() => false))) { await preview.click(); await this.page.waitForTimeout(1800); }
    const issue = this.main.locator('button, a.btn').filter({ hasText: /Issue Letter|^\s*Issue\s*$|Generate/i }).first();
    if (!(await issue.count())) return 'not-available';
    await issue.click();
    // Poll up to 7s for the outcome: a success (card updates) OR an "Oops … Error Code: X" server
    // error (an unhandled exception in the letter engine), handling any confirm dialog in between.
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      const dtxt = (await this.page.locator('.swal2-popup:visible, .modal.show:visible').allInnerTexts().catch(() => [])).join(' ').replace(/\s+/g, ' ');
      if (/oops|went wrong|error code|support center/i.test(dtxt)) {
        const code = (dtxt.match(/Error Code:?\s*([A-Z0-9]+)/i) || [])[1] || '';
        await this.page.locator('.swal2-confirm:visible, .swal2-close:visible, .modal.show .btn-close').first().click().catch(() => {});
        return `error:${code || 'unknown'}`;
      }
      if (/are you sure|confirm|proceed/i.test(dtxt)) await confirmSwal(this.page, /issue|generate|yes|confirm|proceed/i).catch(() => {});
      const body = (await this.main.innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (!new RegExp(`No ${name} letter has been issued`, 'i').test(body) && /letter (has been )?(issued|generated)/i.test(body)) return 'issued';
      await this.page.waitForTimeout(500);
    }
    return 'not-issued';
  }

  // ── Quick links ──────────────────────────────────────────────────────────────
  linkTo(kind, guid) { return `${this.baseUrl}/${kind}/${guid}`; }

  // ── Close Exit (FR-32) ─────────────────────────────────────────────────────────
  closeBtn() { return this.main.locator('button, a.btn').filter({ hasText: /Close Exit/i }).first(); }

  /** Read the "Not ready to close" gate text near the Close button. */
  async readinessText() {
    const t = await this.text();
    const m = t.match(/Not ready to close:?(.{0,400})/i);
    return (m ? m[1] : t).replace(/\s+/g, ' ').trim().slice(0, 400);
  }

  /**
   * Close the exit. Returns { closed:boolean, blockers:string }. The "Close Exit → Ex-Employee"
   * button is DISABLED while any gate is open (the readiness panel lists them), so we read the gates
   * instead of clicking a disabled control; when enabled we click and confirm.
   */
  async closeExit() {
    const b = this.closeBtn();
    await expect(b, 'a Close Exit button').toBeVisible({ timeout: 15000 });
    if (await b.isDisabled().catch(() => false)) {
      return { closed: false, blockers: await this.readinessText() };
    }
    await b.click();
    await this.page.waitForTimeout(800);
    if (await this.page.locator('.swal2-popup').isVisible().catch(() => false)) {
      const said = (await this.page.locator('.swal2-popup').allInnerTexts().catch(() => [])).join(' ').replace(/\s+/g, ' ');
      if (/pending|not settled|required|blocked|cannot|incomplete|must/i.test(said) && !/are you sure|confirm|proceed/i.test(said)) {
        await this.page.locator('.swal2-confirm, .swal2-close').first().click().catch(() => {});
        return { closed: false, blockers: said.slice(0, 400) };
      }
      await confirmSwal(this.page, /close|ex-employee|yes|confirm|proceed/i).catch(() => {});
    }
    await this.page.waitForTimeout(2000);
    await this.open(this.page.url().match(/resignation\/([0-9a-f-]{8,})/i)?.[1] || '');
    const after = await this.status();
    const toast = (await this.page.locator('.swal2-popup, .toast, [role="alert"]').allInnerTexts().catch(() => [])).join(' ');
    if (/closed/i.test(after) || /closed|success|ex-employee/i.test(toast)) return { closed: true, blockers: '' };
    return { closed: false, blockers: (toast || await this.readinessText()).slice(0, 400) };
  }
}

module.exports = { ResignationDetailPage };
