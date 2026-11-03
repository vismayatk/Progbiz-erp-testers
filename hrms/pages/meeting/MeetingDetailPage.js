'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { expectToast, confirmSwal } = require('./mtgUi');

/**
 * /hrms/meeting/{guid} — meeting detail, actions and audit (SRS §9, FR-74..83).
 * Shows title, type, time (with time zone), branch, room/location, online link, host, teams,
 * participants (Required/Optional), facilities, agenda, series, Team Chat state, announcement
 * branches, and the audit history. Action buttons (shown only when the server allows): Edit,
 * Cancel, End Meeting, Stop repeating, Schedule Again. Cancelled/Completed show who/when/reason.
 */
class MeetingDetailPage extends BasePage {
  constructor(page) { super(page, ''); }

  async open(guid) {
    await this.goto(`hrms/meeting/${guid}`);
    await expect(this.page.getByText(/Meeting not found|not one of its participants/i), 'the meeting should be viewable')
      .toHaveCount(0, { timeout: 15000 });
  }

  bodyText() { return this.main.innerText().then(t => t.replace(/\s+/g, ' ').trim()).catch(() => ''); }
  actionBtn(re) { return this.main.locator('button, a.btn, [role="button"]').filter({ hasText: re }).first(); }
  /** True when an action button matching `re` is present (server shows it only when allowed). */
  async hasAction(re) { return (await this.actionBtn(re).count()) > 0; }

  /** Assert the detail page shows the meeting's core fields (FR-80). */
  async verifyDetail(spec, { host = 'Amit', participants = [] } = {}) {
    const t = await this.bodyText();
    expect(t, 'the detail shows the title').toContain(spec.title);
    expect(t, 'the detail shows the type').toMatch(new RegExp(spec.type.replace('-', '.?'), 'i'));
    expect(t, 'the detail names the host').toMatch(new RegExp(host, 'i'));
    for (const p of participants) expect(t, `the detail lists participant ${p}`).toMatch(new RegExp(p.split(' ')[0], 'i'));
    return t;
  }

  /** The shown status (Scheduled / In progress / Completed / Cancelled). */
  async status() {
    const t = await this.bodyText();
    const m = t.match(/\b(Scheduled|In progress|Completed|Cancelled)\b/i);
    return m ? m[1] : '';
  }

  /** The audit/history section text (FR-82). */
  async history() {
    const h = this.main.locator('[class*="history" i], [class*="audit" i], [class*="timeline" i]').first();
    return (await h.count()) ? (await h.innerText()).replace(/\s+/g, ' ').trim() : this.bodyText();
  }

  /** Cancel the meeting (host only) — the dialog is a modal with a reason textarea and a
   *  "Confirm Cancellation" button; expect Cancelled afterwards (FR-76). */
  async cancel(reason = 'Cancelled in automated testing') {
    await this.actionBtn(/Cancel Meeting/i).click();
    const dlg = this.page.locator('.modal.show, .swal2-popup, [role="dialog"]').filter({ hasText: /Cancel/i }).first();
    await expect(dlg, 'the cancel prompt opens').toBeVisible({ timeout: 10000 });
    const field = dlg.locator('textarea, input[type="text"]').first();
    if (await field.isVisible().catch(() => false)) await field.fill(reason);
    await dlg.locator('button, .swal2-confirm').filter({ hasText: /Confirm Cancellation|^\s*Confirm\s*$|^\s*Yes/i }).first().click();
    await expectToast(this.page, /cancelled|canceled/i, 'Cancel meeting');
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await expect.poll(() => this.status(), { timeout: 20000, intervals: [1000], message: 'the meeting should now read Cancelled' }).toMatch(/Cancelled/i);
  }

  /**
   * End the meeting (host). The End action only exists while the meeting is IN PROGRESS (SRS §9.1) —
   * a future/scheduled meeting has no End button. Returns 'not-available' when it can't be ended
   * (so the caller can record it as a limitation rather than a failure).
   */
  async end(reason = 'Ended in automated testing') {
    if (!(await this.hasAction(/^\s*End( Meeting)?\s*$|End the meeting|End now/i))) return 'not-available';
    await this.actionBtn(/^\s*End( Meeting)?\s*$|End the meeting|End now/i).click();
    const dlg = this.page.locator('.modal.show, .swal2-popup, [role="dialog"]').first();
    if (await dlg.isVisible().catch(() => false)) {
      const field = dlg.locator('textarea, input[type="text"]').first();
      if (await field.isVisible().catch(() => false)) await field.fill(reason);
      await dlg.locator('button, .swal2-confirm').filter({ hasText: /^\s*(yes|end|confirm|ok)/i }).first().click();
    }
    await expectToast(this.page, /ended|completed/i, 'End meeting');
    return 'ended';
  }

  /** Stop a repeating series (owner/host) (FR-79). */
  async stopSeries() {
    const btn = this.actionBtn(/Stop( repeating| series)?/i);
    await expect(btn, 'a "Stop repeating" action should be offered on a series').toBeVisible({ timeout: 10000 });
    await btn.click();
    if (await this.page.locator('.swal2-popup').first().isVisible().catch(() => false)) await confirmSwal(this.page, /^\s*(yes|stop|confirm|ok)/i);
    return expectToast(this.page, /stopped|series/i, 'Stop repeating');
  }

  /** Go to the Edit form for this meeting — the button reads "Edit / Reschedule" (FR-75). */
  async edit() {
    await this.actionBtn(/Edit( \/ Reschedule)?/i).click();
    await expect(this.page, 'Edit opens the meeting form').toHaveURL(/\/hrms\/meeting\/edit\//i, { timeout: 15000 });
  }
}

module.exports = { MeetingDetailPage };
