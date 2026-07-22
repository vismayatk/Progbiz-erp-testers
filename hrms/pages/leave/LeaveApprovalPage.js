'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-approval — approver worklist for pending leave requests, with bulk
 * approve/reject and approval delegation.
 * Grid: SL.No | Employee Name | Leave Type | Details | Leave Status | Action,
 * plus per-row checkboxes for bulk actions (captured with 0 rows).
 * QUIRKS: the three filter selects ALL share id "selectbox" — address by nth();
 * "Delegate approvals" opens a MODAL titled "Delegate My Approvals" whose
 * custodian field is an UNLABELLED <select> (no id/name — probed live), with
 * two date inputs, a reason textarea and Cancel/Delegate buttons. (The
 * #custodianname id belongs to the filter offcanvas, a different feature.)
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
    // Delegate modal fields (scoped to the open modal — probed live: no ids).
    this.delegateModalTitle = page.locator('.modal.show').getByText(/Delegate My Approvals/i).first();
    this.custodianInput     = page.locator('.modal.show select').first();  // custodian picker
    this.delegateConfirmBtn = page.locator('.modal.show').getByRole('button', { name: /^\s*Delegate\s*$/i }).first();
  }

  /** Open the "Delegate approvals" modal ("Delegate My Approvals"). Nothing is saved. */
  async openDelegatePanel() {
    await this.delegateBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /** Dismiss the delegate modal WITHOUT confirming a delegation. */
  async closeDelegatePanel() {
    await this.dismissModal();
    // Safety net — reload the worklist if the modal somehow persists.
    if (await this.modal.isVisible().catch(() => false)) await this.goto();
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
