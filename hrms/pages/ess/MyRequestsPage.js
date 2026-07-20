'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess/requests — "My Requests": tracker for the employee's submitted
 * Profile Change Requests (created on /ess/profile, decided on /approvals).
 * Card "Profile Change Requests"; documented empty state on a fresh account:
 * "You have no change requests." The request grid only materialises once a
 * change has been submitted from /ess/profile.
 * Read-only page — no buttons, no forms, nothing to mutate.
 */
class MyRequestsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/requests');

    // Documented fresh-account empty state.
    this.emptyState = this.main.locator('text=You have no change requests.').first();
  }

  /** True when the documented empty state ("You have no change requests.") is showing. */
  hasNoRequests() { return this.containsText('You have no change requests.'); }

  /** True when the "Profile Change Requests" card rendered. */
  hasRequestsCard() { return this.containsText('Profile Change Requests'); }

  /** Request-grid row count (0 while the empty state is showing and no table exists). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { MyRequestsPage };
