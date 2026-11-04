'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { expectToast, confirmSwal } = require('./reUi');

/**
 * /ess/resignation — the employee's own resignation (SRS §7.1, FR-01, FR-34). Submit with a Reason
 * (<select>), optional Proposed Last Working Day (#ess-resignation-lwd), Remarks (textarea),
 * optional Attachment (file) and Alternate email / mobile (#ess-alt-mobile). "Submit Resignation".
 * After submit the employee sees status + timeline and can Withdraw while still pending.
 * Driven in the EMPLOYEE's own session (flows/userSession.withUser), not the admin's.
 */
class EssResignationPage extends BasePage {
  constructor(page) {
    super(page, 'ess/resignation');
    this.fk = new FormKit(page);
    this.reasonSelect = this.main.locator('select').filter({ has: page.locator('option', { hasText: /Better Opportunity|Personal Reasons/i }) }).first();
    this.lwdInput = this.page.locator('#ess-resignation-lwd');
    this.altMobile = this.page.locator('#ess-alt-mobile');
    this.altEmail = this.main.locator('input[type="email"]').first();
    this.remarks = this.main.locator('textarea').first();
    this.submitBtn = this.main.locator('button, a.btn').filter({ hasText: /Submit Resignation/i }).first();
  }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'ESS Resignation heading').toContainText(/Resignation/i, { timeout: 30000 });
  }

  /** True if a resignation is already in progress (the submit form is replaced by a status view). */
  async alreadySubmitted() {
    return !(await this.submitBtn.isVisible().catch(() => false));
  }

  /** Submit a self-service resignation; assert the app confirms and shows an in-progress state. */
  async submit(spec) {
    await this.open();
    await expect(this.submitBtn, 'the Submit Resignation button (no exit should be in progress yet)').toBeVisible({ timeout: 15000 });
    await this.fk.setSelect(this.reasonSelect, spec.reason, 'Reason', { loose: true });
    if (spec.proposedLwd && await this.lwdInput.count()) await this.lwdInput.fill(spec.proposedLwd).catch(() => {});
    if (spec.remarks && await this.remarks.count()) await this.remarks.fill(spec.remarks).catch(() => {});
    if (spec.altEmail && await this.altEmail.count()) await this.altEmail.fill(spec.altEmail).catch(() => {});
    if (spec.altMobile && await this.altMobile.count()) await this.altMobile.fill(spec.altMobile).catch(() => {});
    await this.submitBtn.click();
    // a "submit your resignation?" confirm may appear
    if (await this.page.locator('.swal2-popup').isVisible().catch(() => false)) await confirmSwal(this.page, /yes|submit|confirm|proceed/i).catch(() => {});
    await expectToast(this.page, /success|submitted|resignation.*(submitted|raised)|raised/i, 'Submit resignation');
    // persisted: the page now shows an in-progress status (submit button gone / status text present)
    await this.goto();
    const body = await this.main.innerText().catch(() => '');
    expect(body, 'ESS should now show the resignation status / timeline').toMatch(/pending|submitted|on\s*notice|approval|withdraw|last working/i);
    return body.replace(/\s+/g, ' ').slice(0, 200);
  }

  /** Read the tentative/last-working-day shown to the employee (diagnostic). */
  async statusText() {
    await this.goto();
    return (await this.main.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Withdraw a pending resignation (FR-34) — the pipeline retires. */
  async withdraw() {
    await this.goto();
    const btn = this.main.locator('button, a.btn').filter({ hasText: /Withdraw/i }).first();
    await expect(btn, 'a Withdraw control should be available while pending').toBeVisible({ timeout: 15000 });
    await btn.click();
    if (await this.page.locator('.swal2-popup').isVisible().catch(() => false)) await confirmSwal(this.page, /yes|withdraw|confirm|proceed/i).catch(() => {});
    await expectToast(this.page, /withdraw|success|retired|cancelled/i, 'Withdraw resignation');
    await this.goto();
    const body = await this.main.innerText().catch(() => '');
    expect(body, 'after withdrawal the submit form should be available again or a withdrawn status shown').toMatch(/submit resignation|withdrawn|no.*exit|not.*progress/i);
  }
}

module.exports = { EssResignationPage };
