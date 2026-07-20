'use strict';

const { BasePage, escapeRe } = require('../BasePage');

/**
 * /ess/profile — "My Profile": read-only Overview of the employee's own master
 * record (Employee Code PB1053 | Branch | Department | Designation |
 * Reports To | Joined | Confirmed | Phone) + a "Request A Change" form whose
 * edits are routed to HR as approval requests (they surface on /ess/requests
 * and are decided on /approvals) — never applied directly.
 * Crawled editable fields: First Name | Last Name | Email |
 * National / ID Number | Passport No | Blood Group | Reason.
 * LAZY page; no grid. The recapture caught labels but no ids/placeholders, so
 * each control is resolved label-relative (the crawled labels are the only
 * verified anchors). "Submit Change Request" is the final submit — never
 * clicked by tests; "View My Requests" only navigates (safe).
 */
class MyProfilePage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/profile');

    // ── "Request A Change" fields (crawled labels) ─────────────────────────
    this.firstNameInput  = this.fieldByLabel('First Name');
    this.lastNameInput   = this.fieldByLabel('Last Name');
    this.emailInput      = this.fieldByLabel('Email');
    this.nationalIdInput = this.fieldByLabel('National / ID Number');
    this.passportInput   = this.fieldByLabel('Passport No');
    this.bloodGroupInput = this.fieldByLabel('Blood Group');
    this.reasonInput     = this.fieldByLabel('Reason');

    this.submitChangeRequestBtn = this.button('Submit Change Request');  // final submit — never clicked by tests
    this.viewMyRequestsBtn      = this.button('View My Requests');       // navigation only (safe)
  }

  /** The form control (input/textarea/select) immediately following a crawled label. */
  fieldByLabel(label) {
    return this.main
      .locator('label', { hasText: new RegExp(`^\\s*${escapeRe(label)}\\s*\\*?\\s*$`, 'i') })
      .first()
      .locator('xpath=following::input[1] | following::textarea[1] | following::select[1]')
      .first();
  }

  /** True when the "edits go to HR for approval" helper text is showing. */
  hasApprovalHelperText() {
    return this.containsText('submitted to HR for approval');
  }

  /** True when the read-only Overview shows the given field label (e.g. "Employee Code"). */
  hasOverviewField(label) { return this.containsText(label); }

  /**
   * Draft a change WITHOUT submitting — fills only the provided fields.
   * "Submit Change Request" is never clicked here.
   */
  async fillChangeDraft({ firstName, lastName, email, nationalId, passport, bloodGroup, reason } = {}) {
    if (firstName !== undefined)  await this.firstNameInput.fill(firstName);
    if (lastName !== undefined)   await this.lastNameInput.fill(lastName);
    if (email !== undefined)      await this.emailInput.fill(email);
    if (nationalId !== undefined) await this.nationalIdInput.fill(nationalId);
    if (passport !== undefined)   await this.passportInput.fill(passport);
    if (bloodGroup !== undefined) await this.bloodGroupInput.fill(bloodGroup);
    if (reason !== undefined)     await this.reasonInput.fill(reason);
    await this.page.waitForTimeout(200);
  }

  /** Follow "View My Requests" to /ess/requests (read-only navigation). */
  async openMyRequests() {
    await this.viewMyRequestsBtn.click();
    await this.waitReady();
  }
}

module.exports = { MyProfilePage };
