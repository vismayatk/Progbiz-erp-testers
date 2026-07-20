'use strict';

const { BasePage } = require('../BasePage');

/**
 * /employee-salary-process — monthly payroll computation (Core HR).
 * Grid: Staff Name | Basic Salary | No of Leave | Payable Amount.
 * Shows a "No Data" row until Branch/Year/Month yield results.
 * Quirk: the Year and Month selects share a DUPLICATE name="narration-typ" —
 * disambiguated by position, never by name alone.
 */
class EmployeeSalaryProcessPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'employee-salary-process');

    // ── Filters ────────────────────────────────────────────────────────────
    this.branchSelect = page.locator('#assignedToBranch');                    // default "All"
    this.yearSelect   = this.main.locator('select[name="narration-typ"]').nth(0);  // "Salary Year :"
    this.monthSelect  = this.main.locator('select[name="narration-typ"]').nth(1);  // "Salary Month :" (January–December)

    this.saveBtn = this.button('Save');   // persists the whole run — never clicked by tests
  }

  /** Pick period filters (labels) and let the payroll grid recompute. Read-only. */
  async applyPeriodFilter({ branchLabel, yearLabel, monthLabel } = {}) {
    if (branchLabel) await this.branchSelect.selectOption({ label: branchLabel }).catch(() => {});
    if (yearLabel)   await this.yearSelect.selectOption({ label: yearLabel }).catch(() => {});
    if (monthLabel)  await this.monthSelect.selectOption({ label: monthLabel }).catch(() => {});
    await this.waitReady();
  }

  /** Select the first real Year option plus the given month, then wait. */
  async selectFirstYearAndMonth(monthLabel = 'January') {
    const years = await this.yearOptions();
    const real = years.map(y => y.trim()).find(y => y && !/^(choose|select)/i.test(y));
    if (real) await this.yearSelect.selectOption({ label: real }).catch(() => {});
    await this.monthSelect.selectOption({ label: monthLabel }).catch(() => {});
    await this.waitReady();
  }

  /** Option labels of the Salary Year select. */
  yearOptions() {
    return this.yearSelect.locator('option').allTextContents();
  }
}

module.exports = { EmployeeSalaryProcessPage };
