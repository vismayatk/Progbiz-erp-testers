'use strict';

const { BasePage } = require('../BasePage');

/**
 * /approval/config — per-type approval workflow definitions (Workflow group).
 * "New Workflow" form card + "Configured Workflows" grid card.
 * Grid: Type | Name | Approval chain. Empty-state ROW: "No workflows configured yet."
 * Page copy: "No levels = direct (auto-approve, no approval step)."
 * "+ Add level" only appends UNSAVED level rows — nothing persists until
 * "Save Workflow", which tests never click.
 */
class ApprovalConfigPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'approval/config');

    // ── "New Workflow" form ────────────────────────────────────────────────
    this.approvalTypeSelect = this.main.locator('select').first();  // "-- Select type --", no id
    this.workflowNameInput  = page.locator('input[placeholder="e.g. Long Leave Approval"]');
    this.defaultChk         = page.locator('#cfgDefault');          // "Default for this type"

    this.addLevelBtn     = this.button('+ Add level');
    this.saveWorkflowBtn = this.button('Save Workflow');   // final submit — never clicked by tests
  }

  /** Option labels of the Approval Type select (23 crawled document types). */
  approvalTypeOptions() {
    return this.approvalTypeSelect.locator('option').allTextContents();
  }

  /** Append an (unsaved) approval-level row to the New Workflow form. */
  async addLevel() {
    await this.addLevelBtn.click();
    await this.page.waitForTimeout(400);
  }

  /** Fill the New Workflow form WITHOUT saving. */
  async fillWorkflow({ type, name } = {}) {
    if (type !== undefined) await this.approvalTypeSelect.selectOption({ label: type }).catch(() => {});
    if (name !== undefined) await this.workflowNameInput.fill(name);
  }

  /** Visible form-control count — used to observe "+ Add level" appending a row. */
  visibleControlCount() {
    return this.page.locator('input:visible, select:visible, textarea:visible').count();
  }
}

module.exports = { ApprovalConfigPage };
