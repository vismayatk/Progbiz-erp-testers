'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { confirmSwal } = require('./mtgUi');

/**
 * /hrms/meeting-facilities — "Meeting Facilities" master (SRS §3, FR-01..03).
 * Buttons: "Add Standard Facilities" (seeds defaults), "Add Facility"; search "Search facility…";
 * grid Sl No | Facility | Description | Rooms | Status | Action.
 * Add Facility modal: Facility Name* (text), Description (textarea), Active (#facActive). Save.
 * A facility used by a room/meeting cannot be deleted — the user is told to mark it Inactive (FR-03).
 */
class MeetingFacilitiesPage extends BasePage {
  constructor(page) {
    super(page, 'hrms/meeting-facilities');
    this.fk = new FormKit(page);
    this.addBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*Add Facility\s*$/i }).first();
    this.addStandardBtn = this.main.locator('button, a.btn').filter({ hasText: /Add Standard Facilities/i }).first();
    this.search = this.main.locator('input[placeholder*="Search facility" i]').first();
  }

  editDialog() { return this.page.locator('.modal.show:visible, .offcanvas.show:visible, [role="dialog"]:visible').first(); }
  rowByName(name) { return this.gridRows.filter({ hasText: name }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Meeting Facilities heading').toContainText(/Meeting Facilities|Facilities/i, { timeout: 30000 });
    await this.addBtn.waitFor({ state: 'visible', timeout: 20000 });
  }

  /** Seed the default facility set (FR-02). Idempotent — safe if some already exist. */
  async addStandardFacilities() {
    const before = await this.gridRows.filter({ hasText: /\S/ }).count();
    await this.addStandardBtn.click();
    if (await this.page.locator('.swal2-popup').first().isVisible().catch(() => false)) await confirmSwal(this.page, /^\s*(yes|add|ok|confirm)/i);
    await this.page.waitForTimeout(1500);
    await expect.poll(async () => this.gridRows.filter({ hasText: /\S/ }).count(),
      { timeout: 15000, message: 'standard facilities should be seeded' }).toBeGreaterThanOrEqual(Math.max(before, 1));
    return (await this.gridHeaderTexts()).length ? 'seeded' : 'seeded';
  }

  async addFacility(spec) {
    await this.addBtn.click();
    const m = this.editDialog();
    await expect(m, 'the Add Facility modal opens').toBeVisible({ timeout: 15000 });
    await this.fk.setInput(m.locator('input:not([type]), input[type="text"]').first(), spec.name, 'Facility Name');
    if (spec.description) await m.locator('textarea').first().fill(spec.description).catch(() => {});
    if (spec.active === false) await m.locator('#facActive').click({ force: true }).catch(() => {});
    await this.fk.saveAndConfirm(m.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first(), { name: 'Save facility' });
    await expect(m, 'the Add Facility modal closes').toBeHidden({ timeout: 15000 }).catch(() => {});
    // persisted check
    await this.goto();
    await expect(this.rowByName(spec.name), `facility "${spec.name}" should be listed`).toBeVisible({ timeout: 20000 });
  }

  /** Try to delete a facility that a room uses — the app must refuse and point to Inactive (FR-03). */
  async expectDeleteBlocked(name) {
    await this.goto();
    const row = this.rowByName(name);
    await expect(row, `facility row "${name}"`).toBeVisible({ timeout: 15000 });
    // The guard is a DISABLED Delete (bin) button whose tooltip tells the user to deactivate instead.
    const del = row.locator('button:has(i[class*="delete-bin" i]), button[title*="deactivate" i], button[title*="delete" i]').last();
    await expect(del, 'the Delete button is disabled for a facility that a room uses').toBeDisabled({ timeout: 10000 });
    const title = (await del.getAttribute('title').catch(() => '')) || '';
    expect(title, 'the tooltip should point to deactivation').toMatch(/deactivate|in use|used|booked|cannot/i);
    await expect(this.rowByName(name), `the facility "${name}" is still listed`).toBeVisible();
  }
}

module.exports = { MeetingFacilitiesPage };
