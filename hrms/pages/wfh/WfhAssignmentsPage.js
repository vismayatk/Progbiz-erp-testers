'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { expectToast, confirmSwal } = require('./wfhUi');

/**
 * /wfh-assignments — "Work From Home Assignment" (role WfhSetup).
 *
 * List: Refresh, New Assignment; filters Assigned to (search), Assignment Type, Policy, Status;
 * grid Sl No | Assigned to | Policy | Period | Approval workflow | Status | Action with
 * Edit / Pause / Resume / Delete. Editor modal (§7.2): Policy select (active policies),
 * Assignment Type select (Tenant / Branch / Department / Employee — changing it clears the
 * target), the target select (Branch / Department / Employee), From + To dates, Approval workflow
 * select (Auto-approve (no workflow) or a type-49 workflow), Remarks. Save / Cancel.
 */
class WfhAssignmentsPage extends BasePage {
  constructor(page) {
    super(page, 'wfh-assignments');
    this.fk = new FormKit(page);
    this.newBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*New Assignment\s*$/i }).first();
    this.refreshBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*Refresh\s*$/i }).first();
  }

  modalScope() { return this.page.locator('.modal.show:visible, .offcanvas.show:visible, [role="dialog"]:visible').first(); }
  rowMatching(text) { return this.gridRows.filter({ hasText: text }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Work From Home Assignment heading').toContainText(/Work From Home Assignment/i, { timeout: 30000 });
    await this.newBtn.waitFor({ state: 'visible', timeout: 20000 });
  }

  async openNew() {
    await this.dismissSweetAlert().catch(() => {});
    await this.dismissModal().catch(() => {});
    await this.newBtn.click();
    const m = this.modalScope();
    await expect(m, 'the New Work From Home Assignment modal should open').toBeVisible({ timeout: 15000 });
    await expect(m.locator('select').first(), 'Policy select').toBeVisible({ timeout: 10000 });
    return m;
  }

  /**
   * Create an assignment.
   * @param {{policyName:string, scope:'Tenant'|'Branch'|'Department'|'Employee', target?:string,
   *          from:string, to?:string, workflow?:string, remarks?:string}} o
   *   `target` is a substring that identifies the branch/department/employee option (e.g. "[code]"
   *   or the department name); omitted for Tenant scope.
   */
  async createAssignment(o) {
    const m = await this.openNew();
    // Policy — the first select; its options load async, so wait until ours is offered, then pick it.
    const policySel = m.locator('select').first();
    await expect.poll(async () => (await policySel.locator('option').allTextContents()).some(t => t.includes(o.policyName)),
      { timeout: 20000, message: `the Policy dropdown should offer "${o.policyName}"` }).toBe(true);
    await policySel.selectOption({ label: (await policySel.locator('option').allTextContents()).find(t => t.includes(o.policyName)) });
    await this.page.waitForTimeout(500);
    // Assignment Type — the select offering the scope word.
    const typeSel = m.locator('select').filter({ has: this.page.locator('option', { hasText: new RegExp(`^\\s*${o.scope}\\s*$`) }) }).first();
    await this.fk.setSelect(typeSel, o.scope, 'Assignment Type', { loose: false });
    await this.page.waitForTimeout(1500);
    // Target (Branch / Department / Employee) — appears after the type is chosen.
    if (o.scope !== 'Tenant' && o.target) {
      await this.fk.pickByOption(m, o.target, `${o.scope} target`);
    }
    // From / To dates.
    const dates = m.locator('input[type="date"]');
    await dates.nth(0).fill(o.from);
    if (o.to) await dates.nth(1).fill(o.to).catch(() => {});
    // Approval workflow (default = Auto-approve); set only if asked.
    if (o.workflow && !/auto/i.test(o.workflow)) {
      await this.fk.setSelect(this.fk.selectWithOption(m, o.workflow), o.workflow, 'Approval workflow', { loose: true });
    }
    if (o.remarks) {
      // Remarks is an attribute-less Blazor text input; include input:not([type]).
      const rem = m.locator('input:not([type]), input[type="text"], textarea').last();
      await rem.fill(o.remarks).catch(() => {});
    }
    await m.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first().click();
    await expectToast(this.page, /work from home assignment saved/i, 'Save assignment');
    await expect(m, 'the assignment editor closes after save').toBeHidden({ timeout: 15000 });
  }

  /**
   * Make sure `employeeName` has a single active assignment on `policyName` from today. If the
   * employee already has an assignment (which may be un-deletable because requests exist under it,
   * and un-endable-before-today because it starts today), EDIT it to point at our policy and open
   * its date range — avoiding the one-per-target overlap that a second create would hit. Otherwise
   * create a fresh Employee-scope assignment. Idempotent and safe to re-run.
   */
  async ensureAssignment(employeeName, policyName, target, fromISO) {
    await this.open();
    const existing = this.gridRows.filter({ hasText: employeeName })
      .filter({ hasText: /Active|until changed/i });
    if (await existing.count()) {
      await existing.first().locator('[title*="Edit" i]').first().click();
      const m = this.modalScope();
      await expect(m, 'the assignment editor opens to repoint it').toBeVisible({ timeout: 15000 });
      const policySel = m.locator('select').first();
      await expect.poll(async () => (await policySel.locator('option').allTextContents()).some(t => t.includes(policyName)),
        { timeout: 20000, message: `the Policy dropdown should offer "${policyName}"` }).toBe(true);
      await policySel.selectOption({ label: (await policySel.locator('option').allTextContents()).find(t => t.includes(policyName)) });
      await this.page.waitForTimeout(400);
      const dates = m.locator('input[type="date"]');
      await dates.nth(0).fill(fromISO);                       // From ≤ today so the policy is live now
      await dates.nth(1).fill('').catch(() => {});            // open-ended To
      await m.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first().click();
      await expectToast(this.page, /work from home assignment saved/i, 'Repoint assignment');
      await expect(m, 'the editor closes').toBeHidden({ timeout: 15000 });
      return 'edited';
    }
    await this.createAssignment({ policyName, scope: 'Employee', target, from: fromISO, workflow: 'Auto-approve', remarks: 'Automation WFH' });
    return 'created';
  }

  async _rowAction(rowText, titleRe, textRe, name) {
    const row = this.rowMatching(rowText);
    await expect(row, `assignment row matching "${rowText}"`).toBeVisible({ timeout: 15000 });
    const byTitle = row.locator(`[title*="${titleRe}" i]`);
    const btn = (await byTitle.count()) ? byTitle.first()
      : row.locator('button, a').filter({ hasText: textRe }).first();
    await expect(btn, `"${name}" action on the row`).toBeVisible({ timeout: 8000 });
    await btn.click();
  }

  async pause(rowText) {
    await this._rowAction(rowText, 'Pause', /pause/i, 'Pause');
    await confirmSwal(this.page, /^\s*(yes|pause|confirm|ok)/i);
    await expectToast(this.page, /assignment paused/i, 'Pause assignment');
  }

  async resume(rowText) {
    await this._rowAction(rowText, 'Resume', /resume/i, 'Resume');
    // Resume is not destructive — it may or may not ask to confirm; accept either.
    if (await this.page.locator('.swal2-popup').first().isVisible().catch(() => false)) {
      await confirmSwal(this.page, /^\s*(yes|resume|confirm|ok)/i);
    }
    await expectToast(this.page, /assignment resumed/i, 'Resume assignment');
  }

  async deleteRow(rowText) {
    const before = await this.gridRows.filter({ hasText: rowText }).count();
    await this._rowAction(rowText, 'Delete', /delete/i, 'Delete');
    await confirmSwal(this.page, /^\s*(yes|delete|confirm|ok)/i);
    await expectToast(this.page, /assignment deleted/i, 'Delete assignment');
    // One fewer matching row (there may be several for the same employee/policy over runs).
    await expect.poll(async () => this.gridRows.filter({ hasText: rowText }).count(),
      { timeout: 15000, message: `a "${rowText}" assignment row should be removed` }).toBeLessThan(before);
  }

  /** Edit a row: open the editor, set Remarks, Save — exercises Edit and re-save. */
  async editRemarks(rowText, remarks) {
    await this._rowAction(rowText, 'Edit', /edit/i, 'Edit');
    const m = this.modalScope();
    await expect(m, 'the assignment editor opens for edit').toBeVisible({ timeout: 15000 });
    const rem = m.locator('input:not([type]), input[type="text"], textarea').last();
    await rem.fill(remarks).catch(() => {});
    await m.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first().click();
    await expectToast(this.page, /work from home assignment saved/i, 'Edit assignment');
    await expect(m, 'the editor closes after edit').toBeHidden({ timeout: 15000 });
  }

  /**
   * End every ACTIVE assignment for `name` (set its To date to `toISO`, default today). Ending is
   * the reliable way to clear an overlap: an assignment with WFH requests under it cannot be
   * deleted (the app disables Delete), but it can always be end-dated, and ended assignments are
   * ignored by the one-assignment-per-target overlap rule. Paused/Ended rows are left as they are.
   */
  async endActiveFor(name, toISO) {
    const pad = n => String(n).padStart(2, '0');
    const today = new Date();
    const iso = toISO || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    // Only OPEN-ENDED active assignments ("… → until changed") overlap a new future assignment and
    // can be closed off by setting a To date. (Fixed-To rows are left alone; the probe/run data are
    // all open-ended.) Setting To = today makes the row end-dated so it no longer overlaps tomorrow.
    for (let i = 0; i < 12; i++) {
      const openEnded = this.gridRows.filter({ hasText: name }).filter({ hasText: /until changed/i });
      if (!(await openEnded.count())) return;
      const row = openEnded.first();
      await row.locator('[title*="Edit" i]').first().click();
      const m = this.modalScope();
      await expect(m, 'the assignment editor opens to end it').toBeVisible({ timeout: 15000 });
      const dates = m.locator('input[type="date"]');
      const from = await dates.nth(0).inputValue().catch(() => '');     // To must be ≥ From
      await dates.nth(1).fill(from && from > iso ? from : iso);
      await m.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first().click();
      await expectToast(this.page, /work from home assignment saved/i, `End ${name} assignment`);
      await expect(m, 'the editor closes').toBeHidden({ timeout: 15000 });
      await this.page.waitForTimeout(600);
    }
  }

  /** Remove every existing assignment row matching `text` (idempotent setup; clears overlaps). */
  async deleteAllMatching(text) {
    for (let i = 0; i < 12; i++) {
      const n = await this.gridRows.filter({ hasText: text }).count();
      if (!n) return;
      await this.deleteRow(text);           // throws if a delete doesn't reduce the count — surfaces a real stuck row
      await this.page.waitForTimeout(500);
    }
    // Final guarantee: nothing matching remains, or the overlap check will fail the create.
    await expect(this.gridRows.filter({ hasText: text }), `all "${text}" assignments should be cleared`).toHaveCount(0, { timeout: 10000 });
  }
}

module.exports = { WfhAssignmentsPage };
