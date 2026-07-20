'use strict';

const { BasePage } = require('../BasePage');

/**
 * /approval-operation — approval queue for worked-day attendance records
 * (HRMS breadcrumb generation). Card titled "Attendance Log" — DUPLICATED on
 * /attendance-log and /add-visit-report, discriminate by URL/h1 only.
 * Grid (16 columns): SL No | IDNumber | Employee Name | Branch | Date | Entry
 * Time | Exit Time | Status | Period Name | Hours Employee Must Work | Worked
 * Hours | Over Time Hours | Balance Hours | Entry Late Miutes | Exit Early
 * Miutes | Approval. NOTE the UI TYPOS "Entry Late Miutes" / "Exit Early
 * Miutes" — copy header text verbatim or assertions fail on the "corrected"
 * spelling. The per-row "Approval" cell is the mutation point and is never
 * clicked by interaction tests. Captured rowCount 0 — data appears only after
 * the "Filter" dialog is applied.
 */
class ApprovalOperationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'approval-operation');

    // ── Actions (crawled button: "Filter") ─────────────────────────────────
    this.filterBtn = this.button('Filter');

    // Filter criteria live in a dialog (modal or offcanvas) opened by "Filter"
    // — no inline filter inputs were captured on the page itself.
    this.filterDialog = page.locator('.modal.show, .offcanvas.show').first();
  }

  /**
   * Open the "Filter" dialog. Nothing is ever applied.
   * @returns {Promise<boolean>} true when filter controls actually revealed
   */
  async openFilterDialog() {
    const before = await this._visibleControlCount();
    await this.filterBtn.click();
    const dialogShown = await this.filterDialog.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.page.waitForTimeout(300);
    return dialogShown || (await this._visibleControlCount()) > before;
  }

  /** Dismiss the "Filter" dialog WITHOUT applying it. */
  async closeFilterDialog() {
    if (await this.filterDialog.isVisible().catch(() => false)) {
      const dismiss = this.filterDialog
        .locator('.btn-close, [aria-label="Close"], [data-bs-dismiss], button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.filterDialog.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    } else {
      await this.page.keyboard.press('Escape').catch(() => {});   // inline panel variant
    }
    await this.page.waitForTimeout(300);
  }

  /** Current row count — 0 is the documented pre-filter baseline. */
  rowCount() { return this.gridRows.count(); }

  // ── private helpers ──────────────────────────────────────────────────────

  /** Visible form-control count — probe for "did filter controls appear". */
  _visibleControlCount() {
    return this.page.locator('input:visible, select:visible, textarea:visible').count();
  }
}

module.exports = { ApprovalOperationPage };
