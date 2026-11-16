'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { expectToast } = require('./mtgUi');

/**
 * /hrms/meeting-settings — company-wide Meeting Settings (SRS §11, FR-91..97). Sections, each saving
 * on its own: "Who Can Invite Whom" (invite ceiling per user level), "Scheduling" (Allow meetings on
 * off days #offDayMeetings, Allow overlapping meetings #overlapMeetings), "Team Chat — Meeting Group
 * Settings" (read-only delay / archive delay / #cancelRo), "Branch Announcement Groups" (branch →
 * group). MeetingSettings can view; MeetingSettingsEdit can change.
 */
class MeetingSettingsPage extends BasePage {
  constructor(page) { super(page, 'hrms/meeting-settings'); }

  async open() {
    await this.goto();
    await expect(this.main.getByText(/Who Can Invite Whom/i).first(), 'Meeting Settings sections render').toBeVisible({ timeout: 30000 });
  }

  /** The card/section whose heading matches `re` (so a Save click stays within that section). */
  section(re) {
    return this.main.locator('.card, section, [class*="card" i]')
      .filter({ has: this.page.locator('h1,h2,h3,h4,h5,h6,.card-title').filter({ hasText: re }) }).first();
  }

  async saveSection(sec, name) {
    await sec.locator('button').filter({ hasText: /^\s*Save\s*$/i }).first().click();
    await expectToast(this.page, /saved|updated|success/i, name);
  }

  /** Read the invite-ceiling table (FR-91) → array of {level, users, invitesUpTo}. */
  async inviteRules() {
    const sec = this.section(/Who Can Invite Whom/i);
    const rows = sec.locator('table tbody tr');
    const n = await rows.count();
    const out = [];
    for (let i = 0; i < n; i++) {
      const cells = await rows.nth(i).locator('td').allInnerTexts();
      if (cells.length) out.push({ level: (cells[0] || '').trim(), users: (cells[1] || '').trim(), invitesUpTo: (cells[2] || '').trim() });
    }
    return out;
  }

  /** Toggle the Scheduling rules and save that section (FR-??/11.2). Pass booleans to set each. */
  async setSchedulingRules({ offDays, overlap } = {}) {
    const sec = this.section(/Scheduling/i);
    if (offDays != null) { const c = this.page.locator('#offDayMeetings'); (await c.isChecked()) === offDays || await c.click({ force: true }); await expect(c).toBeChecked({ checked: offDays }); }
    if (overlap != null) { const c = this.page.locator('#overlapMeetings'); (await c.isChecked()) === overlap || await c.click({ force: true }); await expect(c).toBeChecked({ checked: overlap }); }
    await this.saveSection(sec, 'Save scheduling rules');
  }

  /** Set Team Chat defaults and save that section (11.3). */
  async setTeamChatDefaults({ readonlyHours, archiveDays, cancelReadonly } = {}) {
    const sec = this.section(/Team Chat/i);
    if (readonlyHours != null) await sec.locator('input[type="number"]').nth(0).fill(String(readonlyHours)).catch(() => {});
    if (archiveDays != null) await sec.locator('input[type="number"]').nth(1).fill(String(archiveDays)).catch(() => {});
    if (cancelReadonly != null) { const c = this.page.locator('#cancelRo'); (await c.isChecked()) === cancelReadonly || await c.click({ force: true }); }
    await this.saveSection(sec, 'Save Team Chat defaults');
  }
}

module.exports = { MeetingSettingsPage };
