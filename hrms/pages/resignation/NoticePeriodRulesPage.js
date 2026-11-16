'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { visibleErrorText } = require('./reUi');

/**
 * /notice-period-rules — Notice Period Rules (SRS §6 FR-10, FR-38). Inline add-form:
 * Scope (<select>: Designation / Grade (User Level) / Sub Department / Department / Branch /
 * All employees (default)), Applies To (a <select> OR a "Search applies to..." typeahead that
 * loads for the chosen scope), Notice Days (number, 0–365), Shortfall recovery (#rulerecover) with
 * Min/Max bounds, Active (#ruleactive). "Save" / "Clear". Grid: Scope | Applies to | Notice Days |
 * Shortfall recovery | Status | Action. Unique per scope+target; same key re-saved = update (FR-38).
 */
class NoticePeriodRulesPage extends BasePage {
  constructor(page) {
    super(page, 'notice-period-rules');
    this.fk = new FormKit(page);
    this.scopeSelect = this.main.locator('select').filter({ has: page.locator('option', { hasText: /All employees \(default\)/i }) }).first();
    this.appliesSearch = this.main.locator('input[placeholder*="Search applies to" i]').first();
    this.recoverChk = this.page.locator('#rulerecover');
    this.activeChk = this.page.locator('#ruleactive');
    this.minInput = this.main.locator('input[placeholder="Min" i]').first();
    this.maxInput = this.main.locator('input[placeholder="Max" i]').first();
    this.saveBtn = this.main.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first();
  }

  // Notice-days number box: the number input that is NOT Min/Max.
  noticeDaysInput() { return this.main.locator('input[type="number"]:not([placeholder="Min" i]):not([placeholder="Max" i])').first(); }
  rowByApplies(text) { return this.gridRows.filter({ hasText: text }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Notice Period Rules heading').toContainText(/Notice Period Rules/i, { timeout: 30000 });
    await expect(this.scopeSelect, 'the Scope select').toBeVisible({ timeout: 20000 });
  }

  /** The recover-shortfall checkbox (id drifts; match by its label text). */
  recoverCheckbox() {
    return this.page.locator('#rulerecover')
      .or(this.main.getByText(/Recover unserved notice/i).first().locator('xpath=preceding::input[@type="checkbox"][1]'))
      .first();
  }

  /** Add / update a notice-period rule and assert it lands in the grid. */
  async addRule(spec) {
    // The "Applies to" list is a cascade that only (re)loads on a scope CHANGE event — selecting the
    // already-default scope fires nothing, leaving Applies To empty. Force a change: pick another
    // scope first, then the target, then poll the select that offers the target value.
    const scopeOpts = (await this.scopeSelect.locator('option').allTextContents()).map(s => s.trim());
    const other = scopeOpts.find(s => s && !/^--|select/i.test(s) && !new RegExp(spec.scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(s));
    if (other) { await this.scopeSelect.selectOption({ label: other }).catch(() => {}); await this.page.waitForTimeout(500); }
    await this.fk.setSelect(this.scopeSelect, spec.scope, 'Scope', { loose: true });
    await this.page.waitForTimeout(900);
    await this.fk.pickByOption(this.main, spec.appliesTo, 'Applies To');   // polls until the options load
    await this.noticeDaysInput().fill(String(spec.noticeDays));
    await this.page.waitForTimeout(150);
    const rec = this.recoverCheckbox();
    if (spec.recover && await rec.count() && !(await rec.isChecked().catch(() => false))) { await rec.click({ force: true }).catch(() => {}); await this.page.waitForTimeout(400); }
    if (spec.recover) {   // Min/Max (shortfall-cap bounds) only appear when recover is on.
      if (spec.min != null && await this.minInput.count()) await this.minInput.fill(String(spec.min)).catch(() => {});
      if (spec.max != null && await this.maxInput.count()) await this.maxInput.fill(String(spec.max)).catch(() => {});
    }
    if (spec.active !== false && await this.activeChk.count() && !(await this.activeChk.isChecked().catch(() => false))) await this.activeChk.click({ force: true }).catch(() => {});
    await this.saveBtn.click();
    // The save shows no success toast (only a static advisory alert sits on the page); verify by the
    // grid row instead. "Only one rule per target" means the rule is ALREADY seeded (idempotent) —
    // that satisfies the prerequisite; any other validation message is a real failure.
    await this.page.waitForTimeout(1500);
    const err = await visibleErrorText(this.page);
    if (err && /already exists|only one rule/i.test(err)) {
      // already seeded — fine
    } else if (err && /required|please select|invalid|must be/i.test(err)) {
      throw new Error(`Save notice rule rejected: ${err.slice(0, 200)}`);
    }
    await this.goto();
    // The default grid may not list every rule; narrow with the filter box, then assert the row.
    if (await this.appliesSearch.count()) { await this.appliesSearch.fill(spec.appliesTo).catch(() => {}); await this.page.waitForTimeout(1000); }
    await expect(this.rowByApplies(spec.appliesTo), `a notice rule for "${spec.appliesTo}" should be listed`).toBeVisible({ timeout: 20000 });
  }
}

module.exports = { NoticePeriodRulesPage };
