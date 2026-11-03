'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');

/**
 * /hrms/meetings — the Meetings page (SRS §10, FR-84..90). Tabs: Calendar (month/week/day/list
 * views), List, Room-wise, Employee-wise. Filters: Branch, Status (All/Scheduled/Completed/
 * Cancelled), "Only my meetings" (#mineOnly). "New Meeting" opens the form. Meetings the viewer is
 * not part of show as Busy (unless AllMeeting).
 */
class MeetingsListPage extends BasePage {
  constructor(page) {
    super(page, 'hrms/meetings');
    this.newBtn = this.main.locator('button, a.btn').filter({ hasText: /New Meeting/i }).first();
    this.statusFilter = this.main.locator('select').filter({ has: page.locator('option', { hasText: /Scheduled/ }) }).first();
    this.branchFilter = this.main.locator('select').filter({ has: page.locator('option', { hasText: /All branches/i }) }).first();
    this.mineOnly = page.locator('#mineOnly');
  }

  tab(name) { return this.main.locator('[role="tab"], .nav-tabs a, .nav-tabs button, .nav-link, a, button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`, 'i') }).first(); }

  async open() {
    await this.goto();
    await expect(this.pageTitle, 'Meetings heading').toContainText(/Meetings/i, { timeout: 30000 });
    await expect(this.tab('Calendar'), 'the Calendar tab').toBeVisible({ timeout: 20000 });
  }

  async openTab(name) {
    await this.tab(name).click();
    await this.page.waitForTimeout(1500);
  }

  async filterStatus(label) { if (await this.statusFilter.count()) { await this.statusFilter.selectOption({ label }).catch(() => {}); await this.page.waitForTimeout(1000); } }
  async setMineOnly(on) { if (await this.mineOnly.count()) { on ? await this.mineOnly.check().catch(() => {}) : await this.mineOnly.uncheck().catch(() => {}); await this.page.waitForTimeout(1000); } }

  /** Switch to the List tab and return the row for a meeting title (or empty locator). */
  listRow(title) { return this.main.locator('table tbody tr').filter({ hasText: title }).first(); }

  /** On the List tab, assert the meeting is listed; returns its row text. */
  async expectListed(title) {
    await this.openTab('List');
    const row = this.listRow(title);
    await expect(row, `meeting "${title}" should appear on the List tab`).toBeVisible({ timeout: 20000 });
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Room-wise tab: a per-room "Book" button opens the form with the room filled (FR-86). */
  async roomWiseHasBook() {
    await this.openTab('Room-wise');
    return this.main.locator('button, a.btn').filter({ hasText: /^\s*Book\s*$/i }).first().count();
  }
}

module.exports = { MeetingsListPage };
