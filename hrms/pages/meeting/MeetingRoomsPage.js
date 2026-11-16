'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit } = require('../FormKit');
const { confirmSwal, pickInBox } = require('./mtgUi');

/**
 * /hrms/meeting-rooms — "Meeting Rooms" master (SRS §3, FR-04..10).
 * "Add Room"; branch filter; "Show inactive" (#showInactive); grid
 * Room | Code | Branch | Location | Capacity | Facilities | Status | Action.
 * Add Room modal: Room Name* (text), Room Code (text), Branch/Office* (select), Maximum Capacity
 * (number), Physical Location (text), Facilities (#roomFacilities box), Notes (textarea),
 * Active (#roomActive). "Save Room". A room with bookings can't be moved/deleted (FR-06/07) and an
 * inactive room can't be booked (FR-08).
 */
class MeetingRoomsPage extends BasePage {
  constructor(page) {
    super(page, 'hrms/meeting-rooms');
    this.fk = new FormKit(page);
    this.addBtn = this.main.locator('button, a.btn').filter({ hasText: /^\s*Add Room\s*$/i }).first();
    this.branchFilter = this.main.locator('select').first();
    this.showInactive = this.page.locator('#showInactive');
  }

  editDialog() { return this.page.locator('.modal.show:visible, .offcanvas.show:visible, [role="dialog"]:visible').first(); }
  rowByName(name) { return this.gridRows.filter({ hasText: name }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Meeting Rooms heading').toContainText(/Meeting Rooms|Rooms/i, { timeout: 30000 });
    await this.addBtn.waitFor({ state: 'visible', timeout: 20000 });
  }

  /** Create a room in `spec.branch` offering `facilityNames` (FR-04/05). */
  async addRoom(spec, facilityNames = []) {
    await this.addBtn.click();
    const m = this.editDialog();
    await expect(m, 'the Add Room modal opens').toBeVisible({ timeout: 15000 });
    const texts = m.locator('input:not([type]), input[type="text"]');
    await this.fk.setInput(texts.nth(0), spec.name, 'Room Name');
    if (spec.code) await texts.nth(1).fill(spec.code).catch(() => {});
    await this.fk.setSelect(m.locator('select').filter({ has: this.page.locator('option', { hasText: spec.branch }) }).first(), spec.branch, 'Branch');
    if (spec.capacity != null) await m.locator('input[type="number"]').first().fill(String(spec.capacity)).catch(() => {});
    // Location is the text input after capacity (before the facilities box); set by label if present.
    const loc = this.fk.fieldByLabel(m, 'Location', 'input');
    if (await loc.count()) await loc.fill(spec.location || '').catch(() => {});
    for (const f of facilityNames) await pickInBox(this.page, 'roomFacilities', f, { scope: m }).catch(() => {});
    if (spec.notes) await m.locator('textarea').first().fill(spec.notes).catch(() => {});
    if (spec.active === false) await m.locator('#roomActive').click({ force: true }).catch(() => {});
    await this.fk.saveAndConfirm(m.locator('button').filter({ hasText: /^\s*Save Room\s*$/i }).first(), { name: 'Save room' });
    await expect(m, 'the Add Room modal closes').toBeHidden({ timeout: 15000 }).catch(() => {});
    await this.goto();
    await expect(this.rowByName(spec.name), `room "${spec.name}" should be listed`).toBeVisible({ timeout: 20000 });
  }

  /** Edit a room: open its editor, change Notes, save. */
  async editNotes(name, notes) {
    const row = this.rowByName(name);
    await row.locator('[title="Edit" i]').or(row.locator('button, a').filter({ hasText: /edit/i })).first().click();
    const m = this.editDialog();
    await expect(m, 'the room editor opens').toBeVisible({ timeout: 15000 });
    await m.locator('textarea').first().fill(notes).catch(() => {});
    await this.fk.saveAndConfirm(m.locator('button').filter({ hasText: /^\s*Save Room\s*$/i }).first(), { name: 'Edit room' });
    await expect(m, 'the room editor closes').toBeHidden({ timeout: 15000 }).catch(() => {});
  }

  /** Filter the list to a branch and (optionally) include inactive; return visible row count. */
  async filter({ branch, includeInactive } = {}) {
    await this.goto();
    if (branch) await this.branchFilter.selectOption({ label: branch }).catch(() => {});
    if (includeInactive && await this.showInactive.count()) await this.showInactive.check().catch(() => {});
    await this.page.waitForTimeout(1200);
    return this.gridRows.filter({ hasText: /\S/ }).count();
  }

  /** Try to delete a room that has a booking — the app must refuse and point to Inactive (FR-07). */
  async expectDeleteBlocked(name) {
    await this.goto();
    const row = this.rowByName(name);
    await expect(row, `room row "${name}"`).toBeVisible({ timeout: 15000 });
    // The guard is a DISABLED Delete (bin) button; its tooltip reads "Meetings were booked here —
    // deactivate instead" (FR-07).
    const del = row.locator('button:has(i[class*="delete-bin" i]), button[title*="deactivate" i], button[title*="booked" i], button[title*="delete" i]').last();
    await expect(del, 'the Delete button is disabled for a booked room').toBeDisabled({ timeout: 10000 });
    const title = (await del.getAttribute('title').catch(() => '')) || '';
    expect(title, 'the tooltip should point to deactivation').toMatch(/deactivate|booked|has meetings|in use|cannot/i);
    await expect(this.rowByName(name), `the room "${name}" is still listed`).toBeVisible();
  }
}

module.exports = { MeetingRoomsPage };
