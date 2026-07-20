'use strict';

const { BasePage } = require('../BasePage');

/**
 * /attendance-finalization — month-end pay-cycle control (Attendance). Two
 * cards: "Start / Refresh A Pay-Cycle Run" (form) and "Runs" (grid: Sl.No |
 * Period | Scope | Target | Cut-Off | Pending | Status | Action).
 * ALL five form fields are mandatory: Month, Year, Scope, Target, Cut-Off.
 * The Target* select is a DEPENDENT dropdown — its default text changes with
 * Scope ("-- select branch --" when Branch). The "Finalize" button locks a
 * pay period and is exposed but NEVER clicked by interaction tests.
 */
class AttendanceFinalizationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'attendance-finalization');

    // ── "Start / Refresh A Pay-Cycle Run" form (crawled input order) ───────
    this.monthSelect  = this.main.locator('select').nth(0);   // Month* — January … December
    this.yearSelect   = this.main.locator('select').nth(1);   // Year* — 2023 … 2027
    this.scopeSelect  = this.main.locator('select').nth(2);   // Scope* — Company | Branch | Department | Employee
    this.targetSelect = this.main.locator('select').nth(3);   // Target* — dependent on Scope
    this.cutOffInput  = this.main.locator('input[type="date"]').first();   // Cut-Off*
    this.finalizeBtn  = this.button('Finalize');   // exposed only — NEVER clicked by tests

    // ── "Runs" grid filters ────────────────────────────────────────────────
    this.searchInput   = this.main.locator('input[placeholder="Search branch, department or employee..."]').first();
    this.filterSelects = this.main.locator('select');          // nth(4)-nth(6) are the runs filters
  }

  /** Option labels of the Month* select. */
  monthOptions() { return this.monthSelect.locator('option').allTextContents(); }

  /**
   * Pick a Scope* by label and let the dependent Target* select re-render.
   * Form state only — no run is ever started or finalized.
   */
  async selectScope(label) {
    await this.scopeSelect.selectOption({ label });
    await this.page.waitForTimeout(400);
  }

  /** First option text of the dependent Target* select (e.g. "-- select branch --"). */
  async targetPlaceholderText() {
    return (await this.targetSelect.locator('option').first().innerText()).trim();
  }

  /** Type into "Search branch, department or employee..." and refresh the Runs grid. */
  async searchRuns(term) {
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Current row count — remember: 1 empty placeholder row ≠ 1 run. */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { AttendanceFinalizationPage };
