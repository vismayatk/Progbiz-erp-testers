'use strict';

const { BasePage } = require('../BasePage');

/**
 * /approvals — approver inbox (Workflow group, serves Core HR documents).
 * Tabs: "Awaiting my decision (N)" | "My requests" | "History" — labels embed
 * LIVE COUNTS, so tabs are matched by contains-regex, never exact text.
 * Grid: Type | Details | Level | As | Raised | Action. Empty-state ROW:
 * "Nothing awaiting your approval." Approve/Reject controls live in the Action
 * column once rows exist — never clicked by these tests.
 */
class ApprovalsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'approvals');

    this.refreshBtn = this.button('Refresh');

    // Tab handles (contains-match copes with the "(0)" live counter)
    this.awaitingTab   = this.tab('Awaiting my decision');
    this.myRequestsTab = this.tab('My requests');
    this.historyTab    = this.tab('History');
  }

  /** Click a tab by (partial) label and wait for the pane to settle. */
  async switchTab(name) {
    await this.tab(name).click();
    await this.waitReady();
  }

  /** Whether the named tab currently reports itself active. */
  async isTabActive(name) {
    const t = this.tab(name);
    const cls = (await t.getAttribute('class').catch(() => '')) || '';
    if (/(^|\s)active(\s|$)/.test(cls)) return true;
    if ((await t.getAttribute('aria-selected').catch(() => '')) === 'true') return true;
    // bootstrap variant: .active sits on the parent <li>
    const parentCls = (await t.locator('xpath=..').getAttribute('class').catch(() => '')) || '';
    return /(^|\s)active(\s|$)/.test(parentCls);
  }

  /** Re-poll the inbox without navigating. */
  async refresh() {
    await this.refreshBtn.click();
    await this.waitReady();
  }
}

module.exports = { ApprovalsPage };
