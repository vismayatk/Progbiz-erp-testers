'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { expectToast, confirmSwal, dismissSwal } = require('./wfhUi');

/**
 * /ess/wfh — "Work From Home" (Self Service). Drive this as the logged-in employee.
 *
 * Policy card ("My Work From Home Policy <name> … up to N a month … request K day(s) ahead …"),
 * this-month usage ("Requested work from home this month (<Month>) X of N day(s) · a approved ·
 * p pending · L left"), an Apply button, and "My Work From Home Requests" grid
 * (Applied on | From | To | Days | Reason | Status | Action with Withdraw / Request Revert /
 * Withdraw Revert).
 *
 * Apply modal (§7.3): From * (date), To * (date), Half day (#wfh-apply-half → First half #wfh-h1 /
 * Second half #wfh-h2), a live "Policy check" that validates as the dates are picked and disables
 * Apply while a rule fails, an Emergency checkbox (only inside the notice period on a policy that
 * allows it), Reason * (textarea), Apply / Cancel.
 */
class WfhEssPage extends BasePage {
  constructor(page) {
    super(page, 'ess/wfh');
    this.fk = new FormKit(page);
    this.applyBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*Apply\s*$/i }).first();
  }

  modalScope() { return this.page.locator('.modal.show:visible, .offcanvas.show:visible, [role="dialog"]:visible').first(); }
  requestRow(reason) { return this.main.locator('table tbody tr').filter({ hasText: reason }).first(); }

  async open() {
    await this.goto();
    await expect(this.page.getByText(/My Work From Home Policy/i).first(), 'the ESS WFH policy card').toBeVisible({ timeout: 30000 });
  }

  /** Whole policy+usage card text (for assertions on the policy name and remaining allowance). */
  async cardText() {
    return (await this.main.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** "X of N … a approved · p pending · L left" → {used, limit, approved, pending, left}. */
  async usage() {
    const t = await this.cardText();
    const m = t.match(/(\d+(?:\.\d+)?)\s*of\s*(\d+).*?(\d+(?:\.\d+)?)\s*approved\D+(\d+(?:\.\d+)?)\s*pending\D+(\d+(?:\.\d+)?)\s*left/i);
    return m ? { used: +m[1], limit: +m[2], approved: +m[3], pending: +m[4], left: +m[5] } : null;
  }

  /**
   * Apply for work from home. Tries each date in `days` (or the single `from`) and uses the first
   * the live check accepts — skipping any day a prior run already requested ("You already have work
   * from home requested on …") or a blackout. Returns { status:'approved'|'pending', day }.
   * @param {{days?:string[], from?:string, reason:string, half?:boolean, halfType?:1|2, emergency?:boolean}} o
   */
  async apply(o) {
    const days = (o.days && o.days.length) ? o.days : [o.from];
    await expect(this.applyBtn, 'the Apply button should be offered (an active policy is assigned)').toBeVisible({ timeout: 20000 });
    await this.applyBtn.click();
    const m = this.modalScope();
    await expect(m, 'the Apply for Work From Home modal opens').toBeVisible({ timeout: 15000 });
    const dates = m.locator('input[type="date"]');
    const submit = m.locator('button').filter({ hasText: /^\s*Apply\s*$/i }).first();
    if (o.half) {
      const half = m.locator('#wfh-apply-half');
      if (!(await half.isChecked().catch(() => false))) await half.click({ force: true });
      await this.page.waitForTimeout(400);
      await m.locator(o.halfType === 2 ? '#wfh-h2' : '#wfh-h1').click({ force: true }).catch(() => {});
    }
    await m.locator('textarea').first().fill(o.reason);   // required for Apply to enable

    let usedDay = null, lastWhy = '';
    for (const day of days) {
      await dates.nth(0).fill(day);
      await dates.nth(0).evaluate(e => e.blur()).catch(() => {});
      if (!o.half) { await dates.nth(1).fill(day).catch(() => {}); await dates.nth(1).evaluate(e => e.blur()).catch(() => {}); }
      if (o.emergency) {
        const emg = this.fk.fieldByLabel(m, 'cannot give', 'input').or(this.fk.fieldByLabel(m, 'Emergency', 'input')).first();
        if (await waitVisible(emg, 2000)) await emg.click({ force: true }).catch(() => {});
      }
      await this.page.waitForTimeout(2200);              // let the live check run on the new date
      if (await submit.isEnabled().catch(() => false)) { usedDay = day; break; }
      lastWhy = (await m.innerText().catch(() => '')).replace(/\s+/g, ' ').replace(/.*Policy check/i, '').slice(0, 200);
      // A genuine clash (already requested / blackout) → try the next candidate day.
    }
    if (!usedDay) throw new Error(`no candidate day was accepted by the live policy check — last: "${lastWhy}"`);
    await submit.click();
    const said = await expectToast(this.page, /work from home (approved for \d|request for \d.*sent for approval)/i, 'ESS Apply');
    await expect(m, 'the Apply modal closes after submit').toBeHidden({ timeout: 15000 }).catch(() => {});
    return { status: /approved for/i.test(said) ? 'approved' : 'pending', day: usedDay };
  }

  /** Request a revert of an approved request (matched by its reason). Returns the confirmation text. */
  async requestRevert(reason) {
    const row = this.requestRow(reason);
    await expect(row, `My Requests row for "${reason}"`).toBeVisible({ timeout: 15000 });
    await row.locator('button, a').filter({ hasText: /Request Revert/i }).first().click();
    // A reason prompt opens (required). Fill any textarea/input, then confirm.
    const dlg = this.page.locator('.swal2-popup, .modal.show, [role="dialog"]').first();
    await expect(dlg, 'the Request Revert prompt opens').toBeVisible({ timeout: 10000 });
    const field = dlg.locator('textarea, input[type="text"]').first();
    if (await waitVisible(field, 4000)) await field.fill(`Revert requested in testing — ${reason}`);
    await dlg.locator('.swal2-confirm, button').filter({ hasText: /^\s*(request revert|submit|yes|confirm|ok|save)/i }).first().click();
    return expectToast(this.page, /revert request sent for approval|work from home reverted/i, 'Request Revert');
  }

  /** Withdraw a pending request (matched by reason). Best-effort — only applies to a Pending row. */
  async withdraw(reason) {
    const row = this.requestRow(reason);
    await expect(row, `My Requests row for "${reason}"`).toBeVisible({ timeout: 15000 });
    await row.locator('button, a').filter({ hasText: /^\s*Withdraw\s*$/i }).first().click();
    if (await this.page.locator('.swal2-popup').first().isVisible().catch(() => false)) await confirmSwal(this.page, /^\s*(yes|withdraw|confirm|ok)/i);
    return expectToast(this.page, /request withdrawn/i, 'Withdraw request');
  }

  /** The Status cell text of a request (by reason). */
  async statusOf(reason) {
    const row = this.requestRow(reason);
    await expect(row, `My Requests row for "${reason}"`).toBeVisible({ timeout: 15000 });
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }
}

module.exports = { WfhEssPage };
