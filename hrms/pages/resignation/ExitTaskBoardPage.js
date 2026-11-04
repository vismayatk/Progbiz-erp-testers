'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { expectToast, confirmSwal } = require('./reUi');

// Confirm a Complete/Waive/N-A action dialog, which on this build is a Bootstrap MODAL (not a
// SweetAlert) — click its confirm button (and fill a reason textarea for Waive).
async function confirmAction(page, re = /^\s*(complete|waive|yes|confirm|proceed|ok|not applicable)\b/i, { reason } = {}) {
  const dlg = page.locator('.modal.show:visible, .swal2-popup:visible, [role="dialog"]:visible').first();
  if (!(await dlg.isVisible().catch(() => false))) return false;
  if (reason) { const box = dlg.locator('textarea').first(); if (await box.isVisible().catch(() => false)) await box.fill(reason).catch(() => {}); }
  const btn = dlg.locator('button, .swal2-confirm').filter({ hasText: re }).filter({ hasNotText: /cancel|close|back/i }).first();
  await (await btn.count() ? btn : dlg.locator('.swal2-confirm, .btn-primary, .btn-success, .btn-danger').first()).click().catch(() => {});
  await page.waitForTimeout(600);
  return true;
}

/**
 * /exit-tasks/{guid} — the per-exit checklist task board (SRS §7.5, FR-20..22).
 * Grid of materialized items (Task | Kind | Owner | Due | Required | Status | Action). HR can
 * Complete / Waive / N-A each item, add ad-hoc items, edit/delete UNSETTLED items. A settled item
 * (Completed / Waived / Not Applicable) is immutable (no edit, no delete) — server-enforced.
 */
class ExitTaskBoardPage extends BasePage {
  constructor(page) {
    super(page, 'exit-tasks');
    this.fk = new FormKit(page);
  }

  async open(guid) {
    await this.goto(`exit-tasks/${guid}`);
    await expect(this.main, 'the exit task board should render').toBeVisible({ timeout: 30000 });
    await this.page.waitForTimeout(1000);
  }

  rows() { return this.gridRows.filter({ hasText: /\S/ }); }
  rowByTitle(title) { return this.gridRows.filter({ hasText: title }).first(); }
  async count() { return this.rows().count(); }

  /** Act on a row (Complete / Waive / N/A / Edit / Delete) by its visible control text/icon. */
  async _act(title, re, { reason } = {}) {
    const row = this.rowByTitle(title);
    await expect(row, `the checklist item "${title}"`).toBeVisible({ timeout: 15000 });
    const ctl = row.locator('button, a.btn, [role="button"], [title]').filter({ hasText: re })
      .or(row.locator(`[title~="${''}"]`));
    const target = (await ctl.count()) ? ctl.first() : row.locator('button, a.btn').filter({ hasText: re }).first();
    await target.click();
    await this.page.waitForTimeout(600);
    await confirmAction(this.page, re, { reason });
    await expectToast(this.page, /success|complet|waiv|updated|not applicable|saved/i, `Item action on "${title}"`).catch(() => {});
    await this.page.waitForTimeout(800);
  }

  completeItem(title) { return this._act(title, /^\s*complete\s*$|complete/i); }
  waiveItem(title, reason = 'Waived by automation test') { return this._act(title, /waive/i, { reason }); }
  naItem(title) { return this._act(title, /n\/?a|not applicable/i); }

  /** Add an ad-hoc checklist item (HR). Due must fall inside approval…LWD. */
  async addAdhoc({ title, kind = 'Other', owner = 'Employee', due } = {}) {
    const add = this.main.locator('button, a.btn').filter({ hasText: /add (task|item|ad-?hoc)|\+ ?task|new task/i }).first();
    await expect(add, 'an Add task control').toBeVisible({ timeout: 15000 });
    await add.click();
    await this.page.waitForTimeout(700);
    const scope = this.page.locator('.modal.show, .offcanvas.show, [role="dialog"]').first();
    const root = (await scope.count()) ? scope : this.main;
    await this.fk.setInput(root.locator('input[type="text"], input:not([type])').first(), title, 'Task Title');
    const kindSel = root.locator('select').filter({ has: this.page.locator('option', { hasText: /Asset Return|Knowledge|Department/i }) }).first();
    if (await kindSel.count()) await this.fk.setSelect(kindSel, kind, 'Kind', { loose: true }).catch(() => {});
    const ownerSel = root.locator('select').filter({ has: this.page.locator('option', { hasText: /Employee|Reporting Manager|Department/i }) }).first();
    if (await ownerSel.count()) await this.fk.setSelect(ownerSel, owner, 'Owner', { loose: true }).catch(() => {});
    if (due) { const d = root.locator('input[type="date"]').first(); if (await d.count()) await d.fill(due).catch(() => {}); }
    const save = this.fk.saveButton(root, /save|add|create/i);
    await save.click();
    await expectToast(this.page, /success|added|saved|created/i, 'Add ad-hoc task').catch(() => {});
    await this.page.waitForTimeout(800);
    await expect(this.rowByTitle(title), `the ad-hoc item "${title}" should be listed`).toBeVisible({ timeout: 15000 });
  }

  /**
   * Complete (or waive, if no Complete) EVERY still-open item — F&F "Mark completed" is gated on all
   * clearance being settled, not just the mandatory ones. Returns how many it settled. Re-reads the
   * grid each pass since settling re-renders rows.
   */
  async settleAll() {
    let settled = 0;
    for (let pass = 0; pass < 12; pass++) {
      const rows = this.rows();
      const n = await rows.count();
      let actedThisPass = false;
      for (let i = 0; i < n; i++) {
        const row = rows.nth(i);
        const txt = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
        if (/completed|waived|not applicable/i.test(txt)) continue;
        const comp = row.locator('button, a.btn, [title]').filter({ hasText: /^\s*complete\s*$|complete/i }).first();
        const waive = row.locator('button, a.btn, [title]').filter({ hasText: /waive/i }).first();
        const act = (await comp.count()) ? comp : (await waive.count() ? waive : null);
        if (!act) continue;
        const isWaive = !(await comp.count());
        await act.click().catch(() => {});
        await this.page.waitForTimeout(600);
        // Complete/Waive opens a confirm MODAL (not swal) — confirm it (with a reason for Waive).
        await confirmAction(this.page, isWaive ? /waive|confirm|yes|proceed/i : /complete|confirm|yes|proceed/i, { reason: isWaive ? 'Waived by automation test' : undefined });
        await this.page.waitForTimeout(800);
        settled++; actedThisPass = true;
        break;   // grid re-rendered — restart the pass
      }
      if (!actedThisPass) break;
    }
    return settled;
  }

  /** Back-compat alias — settle everything. */
  async settleAllMandatory() { return this.settleAll(); }

  /** A settled item must offer no Edit/Delete control (immutability, §8). */
  async expectSettledImmutable(title) {
    const row = this.rowByTitle(title);
    await expect(row, `the settled item "${title}"`).toBeVisible({ timeout: 10000 });
    const txt = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
    expect(txt, `"${title}" should be settled`).toMatch(/completed|waived|not applicable/i);
    const edit = row.locator('button, a').filter({ hasText: /edit|delete/i });
    const editable = await edit.count();
    expect(editable, `a settled item "${title}" should expose no Edit/Delete`).toBe(0);
  }
}

module.exports = { ExitTaskBoardPage };
