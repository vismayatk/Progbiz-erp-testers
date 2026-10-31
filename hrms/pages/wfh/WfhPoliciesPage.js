'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { expectToast, confirmSwal } = require('./wfhUi');

/**
 * /wfh-policies — "Work From Home Policies" (role WfhSetup).
 *
 * List: filters Name (#wfh-pol-name search), Type (#wfh-pol-type), Status (#wfh-pol-status);
 * grid Sl No | Name | Type | Work From Home Days | Monthly limit | Status | Assigned | Action
 * with Edit / Delete per row. "New Policy" / the pencil opens the editor modal (§7.1):
 *   Name (text) · Type (select: On request / Fixed pattern / Fully remote) · — then by type —
 *   On request: Monthly limit (days), Max days per request, Notice (days), Allow emergency
 *     (appears when Notice>0) + Emergency days a month, Allow past dates (#wfh-back) + days back.
 *   Fixed pattern: "Pattern by" segmented buttons (Weekdays / Dates of the month / Working days
 *     of the month / Rotation), each revealing its own picker; limit field is "Extra days a month".
 *   Fully remote: request rules hidden.
 *   Common: Allow half-day (#wfh-half), Allowed during probation (#wfh-prob), Allowed during
 *     notice period (#wfh-notice), No work from home dates (date + Description + Add → chips),
 *     Active (#wfh-active). Save / Cancel.
 */
class WfhPoliciesPage extends BasePage {
  constructor(page) {
    super(page, 'wfh-policies');
    this.fk = new FormKit(page);
    this.newBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*New Policy\s*$/i }).first();
    this.nameFilter = page.locator('#wfh-pol-name');
    this.typeFilter = page.locator('#wfh-pol-type');
    this.statusFilter = page.locator('#wfh-pol-status');
  }

  /** The open editor modal. */
  modalScope() { return this.page.locator('.modal.show:visible, .offcanvas.show:visible, [role="dialog"]:visible').first(); }

  /** Grid row whose Name cell holds `name`. */
  rowByName(name) { return this.gridRows.filter({ hasText: name }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Work From Home Policies heading').toContainText(/Work From Home Policies/i, { timeout: 30000 });
    await this.newBtn.waitFor({ state: 'visible', timeout: 20000 });
    await this.gridHeaders.first().waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});  // list can be slow on first load
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  async openNew() {
    // A prior failed step may have left a modal/backdrop open — clear it so New Policy is clickable.
    await this.dismissSweetAlert().catch(() => {});
    await this.dismissModal().catch(() => {});
    await this.newBtn.click();
    const m = this.modalScope();
    await expect(m, 'the New Work From Home Policy modal should open').toBeVisible({ timeout: 15000 });
    await expect(m.locator('.modal-title, h5, h4').filter({ hasText: /Work From Home Policy/i }).first(), 'editor title').toBeVisible();
    return m;
  }

  async openEdit(name) {
    const row = this.rowByName(name);
    await expect(row, `policy row "${name}"`).toBeVisible({ timeout: 15000 });
    await row.locator('[title="Edit" i], button, a').filter({ hasText: /edit/i }).first()
      .or(row.locator('[title="Edit" i]')).first().click();
    const m = this.modalScope();
    await expect(m, 'the editor should open for edit').toBeVisible({ timeout: 15000 });
    return m;
  }

  _numberByLabel(scope, label) { return this.fk.fieldByLabel(scope, label, 'input'); }

  async _setSwitch(scope, idOrLabel, on, name) {
    // Switch is addressed by id (#wfh-back etc.) or by its label text. NO first-checkbox fallback:
    // a missing conditional switch is simply skipped, and the final state is asserted so a toggle
    // that didn't take fails loudly (rather than silently saving e.g. an inactive policy).
    const chk = idOrLabel.startsWith('#') ? scope.locator(idOrLabel).first()
      : this.fk.fieldByLabel(scope, idOrLabel, 'input');
    if (!(await waitVisible(chk, 4000))) return;       // conditional field not present — skip
    await chk.scrollIntoViewIfNeeded().catch(() => {});
    if ((await chk.isChecked().catch(() => null)) !== on) await chk.click({ force: true }).catch(() => {});
    await expect(chk, `"${name}" should be ${on ? 'on' : 'off'}`).toBeChecked({ checked: on, timeout: 5000 });
  }

  /** Click a "Pattern by" segmented button (Weekdays / Dates of the month / …). */
  async _patternBy(scope, kind) {
    const btn = scope.locator('button, label, a').filter({ hasText: new RegExp(`^\\s*${kind}\\s*$`, 'i') }).first();
    await expect(btn, `"Pattern by ${kind}" toggle`).toBeVisible({ timeout: 8000 });
    await btn.click();
    await this.page.waitForTimeout(800);
  }

  /** Fill the whole editor for a policy spec (see data/wfhData.js). Does NOT save. */
  async fillPolicy(spec) {
    const m = this.modalScope();
    // Name — the Blazor text input has NO type attribute, so match by its placeholder.
    const nameInput = m.locator('input[placeholder*="Hybrid" i], input[placeholder*="Tue" i]').first();
    await this.fk.setInput(nameInput, spec.name, 'Policy name');

    // Type select — the first select in the modal.
    const typeSel = m.locator('select').first();
    const typeLabel = spec.mode === 'onRequest' ? 'On request' : spec.mode === 'fixed' ? 'Fixed pattern' : 'Fully remote';
    await this.fk.setSelect(typeSel, typeLabel, 'Type', { loose: true });
    await this.page.waitForTimeout(900);

    if (spec.mode === 'fixed') {
      await this._patternBy(m, spec.patternBy);
      if (spec.patternBy === 'Weekdays') {
        const map = { Sun: 'wd-0', Mon: 'wd-1', Tue: 'wd-2', Wed: 'wd-3', Thu: 'wd-4', Fri: 'wd-5', Sat: 'wd-6' };
        for (const d of spec.weekdays) {
          const chk = m.locator(`#${map[d]}`);
          if (!(await chk.isChecked().catch(() => false))) await chk.click({ force: true });
          await expect(chk, `weekday ${d} selected`).toBeChecked();
        }
      } else if (spec.patternBy === 'Dates of the month') {
        for (const n of spec.dates) {
          await m.locator('button').filter({ hasText: new RegExp(`^\\s*${n}\\s*$`) }).first().click();
          await this.page.waitForTimeout(150);
        }
      } else if (spec.patternBy === 'Working days of the month') {
        // Quick pick: set "first N working days" and Apply.
        const qp = this.fk.fieldByLabel(m, 'Quick pick', 'input');
        if (await waitVisible(qp, 3000)) { await qp.fill(String(spec.firstNWorkingDays)); }
        const apply = m.locator('button').filter({ hasText: /^\s*Apply\s*$/i }).first();
        if (await waitVisible(apply, 3000)) await apply.click();
        await this.page.waitForTimeout(400);
      } else if (spec.patternBy === 'Rotation') {
        await this.fk.setSelect(this.fk.fieldByLabel(m, 'Rotate by', 'select'), spec.rotateBy, 'Rotate by', { loose: true });
        const cyc = this.fk.fieldByLabel(m, 'Cycle length', 'input');
        if (await waitVisible(cyc, 3000)) await this.fk.setInput(cyc, String(spec.cycleLength), 'Cycle length');
        // Leave the default slot mix (Day 1 Home, Day 2 Office) — a valid Home/Office mix.
        await expect(m.locator('button').filter({ hasText: /Home/i }).first(), 'a rotation slot toggle').toBeVisible();
      }
      if (spec.extraDays !== undefined) await this.fk.setInput(this._numberByLabel(m, 'Extra days a month'), String(spec.extraDays), 'Extra days a month');
    }

    if (spec.mode === 'onRequest') {
      if (spec.monthlyLimit !== undefined) await this.fk.setInput(this._numberByLabel(m, 'Monthly limit'), String(spec.monthlyLimit), 'Monthly limit');
      if (spec.maxPerRequest !== undefined) await this.fk.setInput(this._numberByLabel(m, 'Max days per request'), String(spec.maxPerRequest), 'Max days per request');
      if (spec.notice !== undefined) await this.fk.setInput(this._numberByLabel(m, 'Notice (days)'), String(spec.notice), 'Notice (days)');
      await this.page.waitForTimeout(500);
      if (spec.allowEmergency) {
        await this._setSwitch(m, '#wfh-emergency', true, 'Allow emergency');   // appears once Notice > 0
        await this.page.waitForTimeout(600);
        if (spec.emergencyPerMonth !== undefined) await this.fk.setInput(this._numberByLabel(m, 'Emergency days a month'), String(spec.emergencyPerMonth), 'Emergency days a month');
      }
    }

    if (spec.mode !== 'remote' || spec.allowPast !== undefined) {
      if (spec.allowPast) {
        await this._setSwitch(m, '#wfh-back', true, 'Allow past dates');
        await this.page.waitForTimeout(400);
        if (spec.daysBack !== undefined) {
          const db = this._numberByLabel(m, 'days back');
          if (await waitVisible(db, 3000)) await this.fk.setInput(db, String(spec.daysBack), 'Days back');
        }
      }
    }

    // Common switches.
    if (spec.halfDay !== undefined) await this._setSwitch(m, '#wfh-half', !!spec.halfDay, 'Allow half-day');
    if (spec.probation !== undefined) await this._setSwitch(m, '#wfh-prob', !!spec.probation, 'Allowed during probation');
    if (spec.noticePeriod !== undefined) await this._setSwitch(m, '#wfh-notice', !!spec.noticePeriod, 'Allowed during notice period');

    // Blackout date (On request / Fixed only).
    if (spec.blackout) {
      const dateInput = m.locator('input[type="date"]').first();
      if (await waitVisible(dateInput, 3000)) {
        await dateInput.fill(spec.blackout.date);
        const desc = m.locator('input[placeholder*="Description" i]').first();
        if (await waitVisible(desc, 2000)) await desc.fill(spec.blackout.reason);
        await m.locator('button').filter({ hasText: /^\s*Add\s*$/i }).first().click();
        await this.page.waitForTimeout(500);
      }
    }

    if (spec.active !== undefined) await this._setSwitch(m, '#wfh-active', !!spec.active, 'Active');
  }

  /** Click Save and assert the "policy saved" success message. */
  async save() {
    const m = this.modalScope();
    await m.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first().click();
    await expectToast(this.page, /work from home policy saved/i, 'Save policy');
    await expect(m, 'the editor should close after save').toBeHidden({ timeout: 15000 });
  }

  /** Full create: New → fill → Save (the "policy saved" toast is the success gate). */
  async createPolicy(spec) {
    await this.openNew();
    await this.fillPolicy(spec);
    await this.save();
  }

  /** Try to save with a bad value and assert the exact refusal message, then cancel out. */
  async expectValidation(fieldLabel, value, messageRe, { name = 'validation' } = {}) {
    const m = await this.openNew();
    await this.fk.setInput(m.locator('input[placeholder*="Hybrid" i], input[placeholder*="Tue" i]').first(), `WFH VALCHK ${Date.now()}`, 'Name');
    await this.fk.setInput(this._numberByLabel(m, fieldLabel), String(value), fieldLabel);
    await m.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first().click();
    // The refusal surfaces as a swal/toast or inline error.
    await expect.poll(async () => {
      const t = (await this.page.locator('.swal2-popup, .toast, [role="alert"], .invalid-feedback, .text-danger').allInnerTexts().catch(() => [])).join(' | ');
      return t.replace(/\s+/g, ' ');
    }, { timeout: 15000, message: `${name}: expected message ${messageRe}` }).toMatch(messageRe);
    await this.dismissSweetAlert();
    await this.dismissModal();
  }

  /** Toggle a policy's Active switch via the editor and save. */
  async setActive(name, on) {
    const m = await this.openEdit(name);
    await this._setSwitch(m, '#wfh-active', on, 'Active');
    await m.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first().click();
    await expectToast(this.page, /work from home policy saved/i, `Set ${name} ${on ? 'active' : 'inactive'}`);
    await expect(m, 'editor closes').toBeHidden({ timeout: 15000 });
  }

  /** Delete a policy by name: row Delete → confirm → assert "policy deleted". */
  async deleteByName(name) {
    const row = this.rowByName(name);
    await expect(row, `policy row "${name}" to delete`).toBeVisible({ timeout: 15000 });
    await row.locator('[title="Delete" i]').or(row.locator('button, a').filter({ hasText: /delete/i })).first().click();
    await confirmSwal(this.page, /^\s*(yes|delete|confirm|ok)/i);
    await expectToast(this.page, /work from home policy deleted/i, 'Delete policy');
    await expect(this.rowByName(name), `"${name}" should be gone from the list`).toHaveCount(0, { timeout: 15000 });
  }

  /** Apply the list filters and return the visible row count. */
  async filterBy({ name, type, status } = {}) {
    if (name !== undefined) await this.nameFilter.fill(name);
    if (type !== undefined) await this.typeFilter.selectOption({ label: type }).catch(() => {});
    if (status !== undefined) await this.statusFilter.selectOption({ label: status }).catch(() => {});
    await this.page.waitForTimeout(1200);
    return this.gridRows.filter({ hasText: /\S/ }).count();
  }
}

module.exports = { WfhPoliciesPage };
