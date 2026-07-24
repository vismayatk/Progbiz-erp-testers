'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess/locations — "My Work Locations": the employee registers geo
 * work-locations that, once approved on admin /geofences, become valid mobile
 * punch zones. Card "Add A Work Location" (crawled: name text placeholder
 * "e.g. Home, Site A", three number inputs labelled Radius (m)* | Latitude* |
 * Longitude* in body order, an address-search text input) + card "My Locations"
 * grid: Sl.No | Name | Lat | Long | Radius | Status (captured with one EMPTY
 * placeholder row).
 * PROBED LIVE: Latitude* and Longitude* are READ-ONLY — they are set by the
 * map / "Use my location", never typed; only Name and Radius are editable.
 * The map is a GOOGLE MAPS widget (not Leaflet, despite the crawl's stray
 * leafletjs link) — never assert on map internals. Its large height pushes the
 * "My Locations" grid below the fold, and the grid paints only after the map
 * settles, so goto() waits for and scrolls to the grid. "Use my location"
 * needs geolocation permission (not grantable headless) and "Submit for
 * approval" creates a real geofence request — both exposed, never clicked.
 */
class MyLocationsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/locations');

    // ── "Add A Work Location" form (crawled placeholders / body label order) ─
    this.nameInput          = this.main.locator('input[placeholder="e.g. Home, Site A"]').first();
    this.radiusInput        = this.main.locator('input[type="number"]').nth(0);   // Radius (m)* — editable
    this.latitudeInput      = this.main.locator('input[type="number"]').nth(1);   // Latitude* — READ-ONLY (map-set)
    this.longitudeInput     = this.main.locator('input[type="number"]').nth(2);   // Longitude* — READ-ONLY (map-set)
    this.addressSearchInput = this.main.locator('input[placeholder^="Search an address"]').first();

    this.useMyLocationBtn     = this.button('Use my location');       // needs geolocation — never clicked by tests
    this.submitForApprovalBtn = this.button('Submit for approval');   // final submit — never clicked by tests
  }

  /**
   * Navigate and settle the "My Locations" grid. The Google Map keeps the
   * network busy (BasePage's networkidle wait times out) and its height pushes
   * the grid below the fold where it paints late — scroll it into view and wait
   * for it explicitly so assertions are deterministic, not flaky.
   */
  async goto(route = this.route) {
    await super.goto(route);
    await this.settleGrid();
  }

  /**
   * Bring the "My Locations" grid into view and wait for it to paint.
   * @returns {Promise<boolean>} true if the grid became visible. The grid sits
   * below the Google Map and only renders once the map has initialised — in
   * environments where the external maps script is slow/blocked the map (and
   * therefore the grid) may never appear, so callers must tolerate `false`.
   */
  async settleGrid() {
    await this.grid.scrollIntoViewIfNeeded({ timeout: 40000 }).catch(() => {});
    return this.grid.waitFor({ state: 'visible', timeout: 40000 }).then(() => true).catch(() => false);
  }

  /** The value currently held by the (editable) Name field. */
  nameValue() { return this.nameInput.inputValue(); }

  /**
   * Draft a work location WITHOUT submitting — form state only.
   * Only the editable fields (Name, Radius) are typed; Latitude/Longitude are
   * read-only map-set fields and are never filled. "Submit for approval" is
   * never clicked here.
   */
  async fillLocationDraft({ name, radius } = {}) {
    if (name !== undefined)   await this.nameInput.fill(name);
    if (radius !== undefined) await this.radiusInput.fill(String(radius));
    await this.page.waitForTimeout(200);
  }

  /** True when the Lat/Long fields are read-only (map-driven, as probed live). */
  async latLongAreReadOnly() {
    const lat = await this.latitudeInput.getAttribute('readonly');
    const lng = await this.longitudeInput.getAttribute('readonly');
    return lat !== null && lng !== null;
  }

  /** "My Locations" row count — remember: 1 EMPTY placeholder row ≠ 1 location. */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { MyLocationsPage };
