'use strict';

const { BasePage } = require('../BasePage');

/**
 * /shift-roster — assigns a shift to an organisational scope for a date range
 * (Attendance). Two cards: "Assign A Shift" (inline form) and "Current
 * Assignments" (grid: Sl.No | Scope | Target | Shift | From | To | Active).
 * Business rule (on-page help): the most-specific assignment wins; sub-
 * departments inherit the parent department's shift unless overridden.
 * Mandatory form fields (*): Shift, Scope, Effective From. The "Assign" submit
 * button is exposed but NEVER clicked by interaction tests.
 */
class ShiftRosterPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'shift-roster');

    // ── "Assign A Shift" form (crawled input order) ────────────────────────
    this.shiftSelect        = this.main.locator('select').nth(0);   // Shift* — default "-- select --"
    this.scopeSelect        = this.main.locator('select').nth(1);   // Scope* — Company | Branch | Department | Employee
    this.targetInput        = this.main.locator('input[type="text"]:not([placeholder])').first();  // Target (lookup, depends on Scope)
    this.effectiveFromInput = this.main.locator('input[type="date"]').nth(0);   // Effective From*
    this.effectiveToInput   = this.main.locator('input[type="date"]').nth(1);   // Effective To
    this.assignBtn          = this.button('Assign');   // exposed only — never clicked by tests

    // On-page precedence help text — a stable identity anchor for the form card.
    this.helpText = this.main.getByText(/most-specific assignment wins/i).first();

    // ── "Current Assignments" grid filters ─────────────────────────────────
    this.searchInput   = this.main.locator('input[placeholder="Search scope or shift..."]').first();
    this.filterSelects = this.main.locator('select');               // nth(2)/nth(3) are the grid-side filters
    this.activeOnlyChk = page.locator('#activeOnlyCheck');          // stable crawled id
  }

  /** Option labels of the Scope* select (Company/Branch/Department/Employee). */
  scopeOptions() { return this.scopeSelect.locator('option').allTextContents(); }

  /**
   * Pick a Scope* by label and let the dependent Target control re-render.
   * Form state only — nothing is ever assigned.
   */
  async selectScope(label) {
    await this.scopeSelect.selectOption({ label });
    await this.page.waitForTimeout(400);
  }

  /** Type into "Search scope or shift..." and let the assignments grid refresh. */
  async searchAssignments(term) {
    await this.searchInput.fill(term);
    await this.waitReady();
  }

  /** Toggle the #activeOnlyCheck grid filter (UI-only) and let the grid re-render. */
  async toggleActiveOnly() {
    await this.activeOnlyChk.click();
    await this.waitReady();
  }

  /** Current row count — remember: 1 empty placeholder row ≠ 1 assignment. */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { ShiftRosterPage };
