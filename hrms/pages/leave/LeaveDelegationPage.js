'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-delegation — read/manage-only registry of leave-approval delegations
 * ("Active & Past Delegations"). NO create buttons here: delegations are
 * created via "Delegate approvals" on /leave-approval (#custodianname input).
 * Grid: SlNo | From | To | From Date | To Date | Active | Action
 * (captured empty — "No delegations.").
 */
class LeaveDelegationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-delegation');
  }

  /** True when the documented empty state ("No delegations.") is showing. */
  hasNoDelegations() { return this.containsText('No delegations.'); }

  /** True when the "Active & Past Delegations" card is showing. */
  hasDelegationsCard() { return this.containsText('Active & Past Delegations'); }

  /** Current grid row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { LeaveDelegationPage };
