'use strict';

const { BasePage } = require('../BasePage');

/**
 * /leave-ledger — append-only audit ledger of every leave transaction; the
 * single source of truth balances are computed from.
 * Grid: Date | Employee | Leave Type | Txn | Days | Source Ref | Balance after |
 * Posted by (captured empty — "No transactions.").
 * Banner: "Append-only — rows are never edited or deleted. Corrections post a
 * new Adjust or Reverse entry referencing the original."
 * "Export" triggers a download — exposed but not exercised by tests.
 */
class LeaveLedgerPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'leave-ledger');

    // ── Toolbar ────────────────────────────────────────────────────────────
    // Probed live: the "Filter" button is the offcanvas TOGGLE
    // (data-bs-target="#ledgerFilterOffcanvas"), not an apply button — the
    // panel has no apply control, so filters apply live as fields change.
    this.filterBtn = this.button('Filter');
    this.exportBtn = this.button('Export');   // download — not exercised

    // ── Filters — resident in #ledgerFilterOffcanvas (opened via filterBtn) ──
    this.employeeSearch = this.filterPanel.locator('input[placeholder="All (search name / ID)"]').first();
    this.txnTypeSelect  = this.filterPanel.locator('select').first();
    this.fromDateInput  = this.filterPanel.locator('input[type="date"]').nth(0);
    this.toDateInput    = this.filterPanel.locator('input[type="date"]').nth(1);
  }

  /** Filter the ledger by employee name/ID (read-only query). */
  async filterByEmployee(term) {
    await this.openFilterPanel();
    await this.employeeSearch.fill(term);
    await this.waitReady();
  }

  /** Filter the ledger by a from/to date window (ISO yyyy-mm-dd). Read-only. */
  async filterByDates(from, to) {
    await this.openFilterPanel();
    if (from) await this.fromDateInput.fill(from);
    if (to)   await this.toDateInput.fill(to);
    await this.waitReady();
  }

  /** True when the documented append-only banner is showing. */
  hasAppendOnlyBanner() { return this.containsText('Append-only'); }

  /** Reveal the filter fields (open the offcanvas) — for visibility assertions. */
  async revealFilters() { await this.openFilterPanel(); }

  /** Current grid row count (the empty state renders as a single message row). */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { LeaveLedgerPage };
