'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess/letters — "Self Service Letters" (My Letters & Certificates): the
 * employee requests HR letters/certificates and acknowledges letters HR has
 * published (HR side: /letters/templates → /letters/generate; the dashboard
 * "Letters to Acknowledge" KPI counts unacknowledged rows here).
 * Card "Request A Letter / Certificate" (captured state: "No self-service
 * letter types are available." — no request controls rendered) + card
 * "Published Letters" grid: Letter | Type | Issued | Acknowledged (captured
 * empty — "No letters published to you.").
 * Read-only in the captured state; acknowledging flips real data and is never
 * done by interaction tests.
 */
class MyLettersPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/letters');

    // Documented empty states (both cards captured empty).
    this.noLetterTypesState     = this.main.locator('text=No self-service letter types are available.').first();
    this.noPublishedLettersState = this.main.locator('text=No letters published to you.').first();
  }

  /** True when the request card shows "No self-service letter types are available.". */
  hasNoLetterTypes() { return this.containsText('No self-service letter types are available.'); }

  /** True when the grid shows "No letters published to you.". */
  hasNoPublishedLetters() { return this.containsText('No letters published to you.'); }

  /** True when the "Request A Letter / Certificate" card rendered. */
  hasRequestCard() { return this.containsText('Request A Letter / Certificate'); }

  /** "Published Letters" row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { MyLettersPage };
