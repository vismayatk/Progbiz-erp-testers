'use strict';

const { BasePage } = require('../BasePage');

/**
 * /ess/locations — "My Work Locations": the employee registers geo
 * work-locations that, once approved on admin /geofences, become valid mobile
 * punch zones. Card "Add A Work Location" (crawled: name text placeholder
 * "e.g. Home, Site A", three number inputs labelled Radius (m)* | Latitude* |
 * Longitude* in body order, an address-search text input that moves a
 * third-party Leaflet map) + card "My Locations" grid: Sl.No | Name | Lat |
 * Long | Radius | Status (captured with one EMPTY placeholder row).
 * NEVER assert on Leaflet map internals (external leafletjs.com asset);
 * "Use my location" needs geolocation permission (not grantable headless) and
 * "Submit for approval" creates a real geofence request — both are exposed
 * but never clicked by tests.
 */
class MyLocationsPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'ess/locations');

    // ── "Add A Work Location" form (crawled placeholders / body label order) ─
    this.nameInput          = this.main.locator('input[placeholder="e.g. Home, Site A"]').first();
    this.radiusInput        = this.main.locator('input[type="number"]').nth(0);   // Radius (m)*
    this.latitudeInput      = this.main.locator('input[type="number"]').nth(1);   // Latitude*
    this.longitudeInput     = this.main.locator('input[type="number"]').nth(2);   // Longitude*
    this.addressSearchInput = this.main.locator('input[placeholder^="Search an address"]').first();

    this.useMyLocationBtn     = this.button('Use my location');       // needs geolocation — never clicked by tests
    this.submitForApprovalBtn = this.button('Submit for approval');   // final submit — never clicked by tests
  }

  /**
   * Draft a work location WITHOUT submitting — form state only.
   * "Submit for approval" is never clicked here.
   */
  async fillLocationDraft({ name, radius, latitude, longitude } = {}) {
    if (name !== undefined)      await this.nameInput.fill(name);
    if (radius !== undefined)    await this.radiusInput.fill(String(radius));
    if (latitude !== undefined)  await this.latitudeInput.fill(String(latitude));
    if (longitude !== undefined) await this.longitudeInput.fill(String(longitude));
    await this.page.waitForTimeout(200);
  }

  /** True when the Leaflet attribution rendered (map present — internals never asserted). */
  hasMapAttribution() { return this.containsText('Leaflet'); }

  /** "My Locations" row count — remember: 1 EMPTY placeholder row ≠ 1 location. */
  rowCount() { return this.gridRows.count(); }
}

module.exports = { MyLocationsPage };
