'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { expectToast, confirmSwal, visibleErrorText } = require('./reUi');

/**
 * /resignations — "Resignations & Exits" list + the Initiate Exit form (SRS §11, §7.2–§7.3, FR-02).
 *
 * List: "Initiate Exit", "Exit Dashboard", search ("Search employee / code"), Advanced Filters
 * (Exit Type / Branch / Department / Status / Rehire), server paging (#page_size). Columns:
 * # | Emp. Code | Employee | Type | Designation | Department | Reason | Submitted | Last Working Day
 * | Status | Rehire. A row opens /resignation/{guid}.
 *
 * Initiate Exit form (inline panel, probed): Employee (typeahead "Search employee / code"),
 * Exit Type (<select>, enabled types only), then common fields (Notice Days, Reason, Remarks,
 * Block gratuity + reason, Last Working Day, Attachment) and the chosen type's own fields (§7.3).
 */
class ResignationsListPage extends BasePage {
  constructor(page) {
    super(page, 'resignations');
    this.fk = new FormKit(page);
    this.initiateBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*Initiate Exit\s*$/i }).first();
    this.searchBox = this.main.locator('input[placeholder*="Search employee" i]').first();
    this.statusFilter = this.main.locator('select').filter({ has: page.locator('option', { hasText: /Approved · On Notice|Pending Approval/i }) }).first();
    this.typeFilter = this.main.locator('select').filter({ has: page.locator('option', { hasText: /All Exit Types/i }) }).first();
  }

  // The Initiate Exit form scope (an inline panel/card or a modal). The Exit-Type select anchors it.
  form() {
    return this.page.locator('.modal.show, .offcanvas.show, [role="dialog"]').first()
      .or(this.main);
  }
  exitTypeSelect(scope) { return (scope || this.main).locator('select').filter({ has: this.page.locator('option', { hasText: /^Resignation$/ }) }).first(); }
  rowByCode(code) { return this.gridRows.filter({ hasText: code }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Resignations & Exits heading').toContainText(/Resignations? & Exits?|Resignations/i, { timeout: 30000 });
    await expect(this.initiateBtn, 'the Initiate Exit button').toBeVisible({ timeout: 20000 });
  }

  // ── Initiate Exit ──────────────────────────────────────────────────────────
  // The Employee picker is a <select> labelled "Employee *" whose options carry the code in
  // brackets, e.g. "Ada Lovelace [pbhrms0311]" (probe). A search box ("Search employee / code")
  // filters it. The Exit Type is a separate <select> "Exit Type *".
  employeeSelect() { return this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /Choose employee/i }) }).first(); }
  initiateTypeSelect() { return this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /^Resignation$/ }) }).filter({ hasNot: this.page.locator('option', { hasText: /All Exit Types/i }) }).first(); }

  async openInitiateForm() {
    await this.initiateBtn.click();
    const emp = this.employeeSelect();
    await expect(emp, 'the Initiate Exit form (Employee select) should render').toBeVisible({ timeout: 15000 });
    await this.page.waitForTimeout(600);
    return emp;
  }

  /** Pick the subject employee in the Employee <select> by unique code (in brackets). */
  async pickEmployee(empSelect, code) {
    // Narrow the list with the search box when present (long option lists are paged/virtualised).
    const search = this.main.locator('input[placeholder*="Search employee" i]').last();
    if (await search.count()) { await search.fill(code).catch(() => {}); await this.page.waitForTimeout(900); }
    await this.fk.pickByOption(this.main, `[${code}]`, 'Employee');
    await this.page.waitForTimeout(800);   // choosing the employee reveals the type + per-type fields
  }

  async setExitType(type) {
    const sel = this.initiateTypeSelect();
    await this.fk.setSelect(sel, type, 'Exit Type', { loose: true });
    await this.page.waitForTimeout(1000);   // per-type fields + notice/gratuity defaults load
  }

  // Form-field locators anchored off the Exit Type select, so labels that ALSO appear as list-grid
  // column headers (Last Working Day, Reason) never leak onto the grid behind the form.
  lwdField() { return this.initiateTypeSelect().locator('xpath=following::input[not(@type) or @type="text" or @type="date"][1]'); }
  reasonField() { return this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /Better Opportunity/i }) }).last(); }
  remarksField() { return this.main.locator('textarea').last(); }

  /** Is the Block-gratuity checkbox pre-ticked AND locked (policy-blocked type, FR-09)? */
  async gratuityLockedState() {
    const chk = this.main.getByText(/gratuity/i).first().locator('xpath=following::input[@type="checkbox"][1]')
      .or(this.main.locator('input[type="checkbox"]').first());
    if (!(await chk.count())) return { present: false };
    return { present: true, checked: await chk.isChecked().catch(() => false), disabled: await chk.isDisabled().catch(() => false) };
  }

  /** Fill the common fields (§7.2) that apply to the chosen type. All anchored to the FORM. */
  async fillCommon(spec) {
    if (spec.reason) {
      const rsel = this.reasonField();
      if (await rsel.count()) await this.fk.setSelect(rsel, spec.reason, 'Reason', { loose: true });
    }
    if (spec.lwd) {
      const lwd = this.lwdField();
      await expect(lwd, 'the form Last Working Day field').toBeVisible({ timeout: 10000 });
      await lwd.fill('');
      await lwd.fill(spec.lwd);
      await lwd.evaluate(el => el.blur()).catch(() => {});
      await this.page.waitForTimeout(300);
      // Confirm it took the intended date (the field is a picker textbox that can reformat).
      const got = await lwd.inputValue().catch(() => '');
      expect(got, `LWD should hold ${spec.lwd}`).toContain(spec.lwd);
    }
    if (spec.remarks) {
      const rem = this.remarksField();
      if (await rem.count()) await rem.fill(spec.remarks).catch(() => {});
    }
  }

  /** Fill the fields specific to `type` (§7.3). Dates are future/near as the type requires. */
  async fillPerType(type, d = {}) {
    const dateByLabel = (label, val) => this.fk.fieldByLabel(this.main, label, 'input').fill(val).catch(() => {});
    switch (type) {
      case 'Termination':
        if (d.effectiveDate) await dateByLabel('Effective Date', d.effectiveDate);
        if (d.category) { const c = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /Performance|Misconduct|Redundancy/i }) }).first(); if (await c.count()) await this.fk.setSelect(c, d.category, 'Reason Category', { loose: true }); }
        break;
      case 'Retirement':
        if (d.retirementDate) await dateByLabel('Retirement Date', d.retirementDate);
        break;
      case 'Absconding':
        if (d.lastAttendance) await dateByLabel('Last Attendance', d.lastAttendance);
        if (d.effectiveDate) await dateByLabel('Effective Date', d.effectiveDate);
        if (d.actionsTaken) { const t = this.fk.fieldByLabel(this.main, 'Actions Taken', 'textarea').or(this.fk.fieldByLabel(this.main, 'Actions Taken', 'input')); if (await t.count()) await t.fill(d.actionsTaken).catch(() => {}); }
        break;
      case 'Death':
        if (d.dateOfDemise) await dateByLabel('Date of Demise', d.dateOfDemise);
        break;
      case 'Other':
        if (d.otherName) { const t = this.fk.fieldByLabel(this.main, 'Exit Type Name', 'input'); if (await t.count()) await t.fill(d.otherName).catch(() => {}); }
        break;
      default: break;   // Resignation / Permanent Disablement / End of Contract / Internship Completion: common fields only
    }
  }

  /**
   * Submit the Initiate Exit form and return the created exit's guid. The build does NOT redirect to
   * the detail page — it raises the exit (status Pending Approval or On Notice) and stays on the
   * list — so after the success signal we resolve the guid by opening the new row for `empCode`.
   */
  async submitInitiate(empCode) {
    const btn = this.fk.saveButton(this.main, /initiate|submit|save|raise/i);
    await btn.click();
    const detailRe = /\/resignation\/([0-9a-f-]{8,})/i;
    let ok = false;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      if (await this.page.locator('.swal2-popup').filter({ hasText: /initiate|raise|confirm|sure|proceed/i }).isVisible().catch(() => false)) {
        await confirmSwal(this.page, /yes|initiate|confirm|proceed|raise|ok/i).catch(() => {});
      }
      const m = this.page.url().match(detailRe);
      if (m) return m[1];
      const said = (await this.page.locator('.swal2-popup, .toast, [role="alert"]').allInnerTexts().catch(() => [])).join(' ');
      if (/success|initiat|on notice|submitted|created|raised|pending approval/i.test(said)) { ok = true; break; }
      // Even without a toast, the raise may have landed on the list — detect the new row.
      if (empCode && await this.rowByCode(empCode).count().catch(() => 0)) { ok = true; break; }
      await this.page.waitForTimeout(500);
    }
    if (!ok) {
      const errs = await visibleErrorText(this.page);
      throw new Error(`Initiate Exit did not confirm. Visible errors: ${errs || '(none)'}`);
    }
    // Resolve the guid from the new list row.
    await this.page.waitForTimeout(800);
    if (empCode) return this.openDetailByCode(empCode);
    return '';
  }

  /** Full raise: open form → pick employee → type → common + per-type fields → submit. Returns guid. */
  async raiseExit(emp, spec) {
    await this.open();
    const empInput = await this.openInitiateForm();
    await this.pickEmployee(empInput, emp.code);
    await this.setExitType(spec.type);
    await this.fillCommon(spec);
    await this.fillPerType(spec.type, spec.perType || {});
    return this.submitInitiate(emp.code);
  }

  /**
   * FR-03: an employee who already has an exit in progress must not get a second one. The build
   * enforces this at SELECTION — such an employee is simply not offered in the Employee picker. So
   * the guard passes if the employee is absent from the select (after searching); if the build
   * instead lets them be picked, we attempt a raise and expect a refusal message.
   */
  async expectDuplicateExitRefused(emp, spec) {
    await this.open();
    await this.openInitiateForm();
    const search = this.main.locator('input[placeholder*="Search employee" i]').last();
    if (await search.count()) { await search.fill(emp.code).catch(() => {}); await this.page.waitForTimeout(1200); }
    const sel = this.employeeSelect();
    const offered = (await sel.locator('option').allTextContents()).some(o => o.includes(`[${emp.code}]`));
    if (!offered) {
      console.log(`  • FR-03 enforced at selection — ${emp.code} (exit in progress) is not offered in the Employee picker`);
      return;
    }
    // Build allows selection → the refusal must come on save.
    await this.fk.pickByOption(this.main, `[${emp.code}]`, 'Employee');
    await this.setExitType(spec.type);
    await this.fillCommon(spec);
    const btn = this.fk.saveButton(this.main, /initiate|submit|save|raise/i);
    await btn.click();
    await this.page.waitForTimeout(1500);
    if (await this.page.locator('.swal2-popup').isVisible().catch(() => false)) await confirmSwal(this.page, /yes|initiate|confirm|proceed/i).catch(() => {});
    await this.page.waitForTimeout(1500);
    const said = (await this.page.locator('.swal2-popup, .toast, [role="alert"]').allInnerTexts().catch(() => [])).join(' ') + ' ' + (await visibleErrorText(this.page));
    expect(said, 'a duplicate exit should be refused (already in progress)').toMatch(/already|in progress|exists|one exit|cannot/i);
  }

  // ── list helpers ─────────────────────────────────────────────────────────────
  async searchByCode(code) {
    await this.open();
    if (await this.searchBox.count()) { await this.searchBox.fill(code); await this.page.waitForTimeout(1000); }
    return this.rowByCode(code);
  }

  /**
   * Open an exit's detail page by employee code. The detail page is reached from the Action column
   * (a view/eye icon or link), not a plain row link — try the row's action controls, then the row.
   */
  async openDetailByCode(code) {
    const row = await this.searchByCode(code);
    await expect(row, `the exit row for ${code}`).toBeVisible({ timeout: 20000 });
    const candidates = [
      row.locator('a[href*="/resignation/"]').first(),
      row.locator('[title*="view" i], [title*="detail" i], a[title], i[class*="eye" i]').first(),
      row.locator('td').nth(2),   // the Employee cell (whole row is clickable → navigates)
      row,                        // the row itself (cursor:pointer @onclick)
    ];
    for (const c of candidates) {
      if (!(await c.count())) continue;
      await c.click().catch(() => {});
      await this.page.waitForURL(/\/resignation\/[0-9a-f-]{8,}/i, { timeout: 8000 }).catch(() => {});
      if (/\/resignation\/[0-9a-f-]{8,}/i.test(this.page.url())) break;
    }
    await expect(this.page, 'should land on the exit detail page').toHaveURL(/\/resignation\/[0-9a-f-]{8,}/i, { timeout: 15000 });
    return (this.page.url().match(/resignation\/([0-9a-f-]{8,})/i) || [])[1] || '';
  }

  async statusForCode(code) {
    const row = await this.searchByCode(code);
    return (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
  }
}

module.exports = { ResignationsListPage };
