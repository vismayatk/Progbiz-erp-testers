'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-approval — approver worklist for pending leave requests, with bulk
 * approve/reject and approval delegation.
 * Grid: SL.No | Employee Name | Leave Type | Details | Leave Status | Action,
 * plus per-row checkboxes for bulk actions (captured with 0 rows).
 * QUIRKS: the three filter selects ALL share id "selectbox" — address by nth();
 * #custodianname is the stable id of the "Delegate approvals" input.
 * Breadcrumb group here is "Leave" (not "HRMS" like most sibling pages).
 */
class LeaveApprovalPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-approval');

    // ── Toolbar ────────────────────────────────────────────────────────────
    this.delegateBtn = this.button('Delegate approvals');
    this.filterBtn   = this.button('Filter');
    // Final decision buttons — exposed for visibility asserts, NEVER clicked.
    this.approveSelectedBtn = this.button('Approve Selected');
    this.rejectSelectedBtn  = this.button('Reject Selected');
    this.clearSelectionBtn  = this.button('Clear');   // resets ticked rows only

    // ── Filters / selection ────────────────────────────────────────────────
    this.filterSelects  = this.main.locator('select#selectbox');           // ×3, shared id
    this.selectAllChk   = this.grid.locator('thead input[type="checkbox"]').first();
    this.custodianInput = page.locator('#custodianname');                  // delegation name
  }

  /** Open the "Delegate approvals" panel/dialog (reveals #custodianname). Nothing is saved. */
  async openDelegatePanel() {
    await this.delegateBtn.click();
    await this.custodianInput.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /** Dismiss the delegate panel WITHOUT confirming a delegation. */
  async closeDelegatePanel() {
    if (await this.modal.isVisible().catch(() => false)) {
      const dismiss = this.modal
        .locator('.btn-close, [aria-label="Close"], [data-bs-dismiss="modal"], button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(300);
      return;
    }
    // Inline panel — reload the worklist to discard the unsaved delegation.
    if (await this.custodianInput.isVisible().catch(() => false)) await this.goto();
  }

  /** Toggle the filter panel via "Filter" (no approval/rejection is ever fired). */
  async toggleFilterPanel() {
    await this.filterBtn.click();
    await this.waitReady();
  }

  /** Reset any ticked rows via "Clear" (selection only — no decision fired). */
  async clearSelection() {
    await this.clearSelectionBtn.click();
    await this.page.waitForTimeout(300);
  }

  /** Number of filter selects rendered (crawl captured 3, all id "selectbox"). */
  filterSelectCount() { return this.filterSelects.count(); }

  /** Current worklist row count (0 is a valid state). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { LeaveApprovalPage };
