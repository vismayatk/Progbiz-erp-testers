'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');
const { FormKit, waitVisible } = require('../FormKit');
const { pickInBox, confirmSwal } = require('./mtgUi');

/**
 * /hrms/meeting/new and /hrms/meeting/edit/{guid} — the Schedule / Edit Meeting form (SRS §4–§7).
 *
 * Fields (routed page, not a modal): Meeting Title*, Meeting Type* (In-Person / Online / Hybrid
 * buttons), Organizer/Host* (search box, defaults to the scheduler), Branch/Office* (select),
 * Meeting Date, Start and End (date + time inputs), Time Zone, Meeting Ends (radios endFixed/endManual),
 * Repeat (select), Required Facilities (#meetingFacilities box), Meeting Room* (select — In-Person /
 * Hybrid), Online link (Online / Hybrid), Description, Agenda, Participants (#meetingParticipants
 * box), Team Chat Group (No Additional / Use Existing / Create New Group buttons), Announcement
 * Branches (#announceBranches box). Actions: Clear, Cancel, Check Availability, Schedule Meeting.
 */
class MeetingSchedulePage extends BasePage {
  constructor(page) {
    super(page, 'hrms/meeting/new');
    this.fk = new FormKit(page);
  }

  form() { return this.main; }
  // Primary submit: "Schedule Meeting" on the new form, "Reschedule/Update/Save Meeting" on the edit
  // form. Exclude Cancel/Clear/Check/Back.
  scheduleBtn() {
    return this.main.locator('button, a.btn')
      .filter({ hasText: /Schedule Meeting|Reschedule|Update Meeting|Save (Changes|Meeting)|^\s*(Save|Update)\s*$/i })
      .filter({ hasNotText: /cancel|clear|check availability|back|again/i }).last();
  }
  checkBtn() { return this.main.locator('button').filter({ hasText: /Check Availability/i }).first(); }

  async open(editGuid) {
    await this.goto(editGuid ? `hrms/meeting/edit/${editGuid}` : 'hrms/meeting/new');
    await expect(this.main.getByText(/Meeting Title/i).first(), 'the schedule form renders').toBeVisible({ timeout: 30000 });
  }

  // ── field setters ──────────────────────────────────────────────────────────
  async setType(type) {
    await this.main.locator('button').filter({ hasText: new RegExp(`^\\s*${type}\\s*$`, 'i') }).first().click();
    await this.page.waitForTimeout(600);
  }

  async fillBasics(spec) {
    const f = this.form();
    await this.fk.setInput(this.fk.fieldByLabel(f, 'Meeting Title', 'input'), spec.title, 'Meeting Title');
    await this.setType(spec.type);
    await this.fk.setSelect(this.fk.selectWithOption(f, spec.branch), spec.branch, 'Branch');
    await this.page.waitForTimeout(800);   // branch sets the time zone and loads rooms
    await f.locator('input[type="date"]').first().fill(spec.date);
    await f.locator('input[type="time"]').nth(0).fill(spec.start);
    await f.locator('input[type="time"]').nth(1).fill(spec.end);
    if (spec.endsMode === 'manual') await f.locator('#endManual').click({ force: true }).catch(() => {});
    else await f.locator('#endFixed').click({ force: true }).catch(() => {});
    if (spec.description) await this.fk.fieldByLabel(f, 'Description', 'textarea').fill(spec.description).catch(() => {});
    if (spec.agenda) await f.locator('textarea[placeholder*="Welcome" i]').first().fill(spec.agenda).catch(() => {});
  }

  /** Select the meeting room (In-Person / Hybrid). The room options load after the branch is set. */
  async setRoom(roomName) {
    const sel = this.main.locator('select').filter({ has: this.page.locator('option', { hasText: /Choose a room/i }) }).first();
    await expect.poll(async () => (await sel.locator('option').allTextContents()).some(t => t.includes(roomName)),
      { timeout: 15000, message: `the room "${roomName}" should be offered` }).toBe(true);
    await sel.selectOption({ label: (await sel.locator('option').allTextContents()).find(t => t.includes(roomName)) });
  }

  /** Online / Hybrid: fill the online link (full http(s)). */
  async setOnlineLink(link) {
    // The link field appears for Online/Hybrid. Try label, placeholder, then a url/text input near
    // the "Online Link" label.
    const candidates = [
      this.main.locator('input[placeholder*="http" i], input[placeholder*="link" i], input[type="url"]').first(),
      this.fk.fieldByLabel(this.form(), 'Online Link', 'input'),
      this.fk.fieldByLabel(this.form(), 'Link', 'input'),
    ];
    for (const c of candidates) {
      if (await waitVisible(c, 3000)) { await c.fill(link); await c.evaluate(e => e.blur()).catch(() => {}); return; }
    }
  }

  async addParticipant(name) { await pickInBox(this.page, 'meetingParticipants', name); }
  async addRequiredFacility(name) { await pickInBox(this.page, 'meetingFacilities', name); }
  async addAnnouncementBranch(name) { await pickInBox(this.page, 'announceBranches', name); }
  async setRepeat(kind) { await this.fk.setSelect(this.fk.selectWithOption(this.form(), 'Does not repeat'), kind, 'Repeat', { loose: true }); }

  /** Team Chat group choice: 'none' | 'existing' | 'new'. */
  async setTeamChat(mode) {
    const label = mode === 'new' ? /Create New Group/i : mode === 'existing' ? /Use Existing Group/i : /No Additional Group/i;
    const btn = this.main.locator('button, a.btn, [role="button"], label').filter({ hasText: label }).first();
    if (await btn.count()) await btn.click().catch(() => {});
    await this.page.waitForTimeout(400);
  }

  /** Run Check Availability and return the conflicts/warnings/suggestions panel text. */
  async checkAvailability() {
    await this.checkBtn().click();
    await this.page.waitForTimeout(2500);
    // a swal may summarise; otherwise read the availability/result region
    const swal = (await this.page.locator('.swal2-popup').allInnerTexts().catch(() => [])).join(' ');
    const body = (await this.main.innerText().catch(() => '')).replace(/\s+/g, ' ');
    await this.dismissSweetAlert().catch(() => {});
    return `${swal} ${body}`.replace(/\s+/g, ' ').trim();
  }

  /**
   * Click Schedule Meeting; confirm any "Schedule the meeting anyway?" warning; succeed when the app
   * redirects to the meeting page (/hrms/meeting/{guid}) or shows a success toast. Returns the guid
   * (from the URL) or ''.
   */
  async schedule() {
    await this.scheduleBtn().click();
    const detailRe = /\/hrms\/meeting\/([0-9a-f]{8}-[0-9a-f-]{8,})/i;
    let guid = '';
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      // A "Schedule the meeting anyway?" warning may appear — confirm it.
      const warn = this.page.locator('.swal2-popup').filter({ hasText: /anyway|warning|conflict|proceed|schedule/i }).first();
      if (await warn.isVisible().catch(() => false)) { await confirmSwal(this.page, /anyway|schedule|yes|confirm|proceed|ok/i).catch(() => {}); }
      const m = this.page.url().match(detailRe);
      if (m) { guid = m[1]; break; }
      // Only a HARD block stops here (warnings are confirmable, handled above). Capture the specific
      // blocking conflicts (the lines under the "can't be saved" header), not just the header.
      const panel = (await this.main.innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (/can'?t be saved|cannot be saved as it is|blocking conflict|is in the past/i.test(panel)) {
        const detail = (panel.match(/Conflicts[^.]*?can'?t be saved as it is:?(.{0,200})/i) || [])[1] || '';
        throw new Error(`scheduling was blocked by a conflict:${detail || ' ' + panel.slice(0, 160)}`);
      }
      await this.page.waitForTimeout(500);
    }
    if (!guid) {
      const inline = await this.fk.visibleErrors();
      throw new Error(`scheduling did not complete (no redirect to the meeting page). Validation: "${(inline || '(none visible)').slice(0, 220)}"`);
    }
    return guid;
  }

  /** Full schedule helper. Returns the created meeting's guid. */
  async scheduleMeeting(spec, { room, link, participants = [], facilities = [], repeat, teamChat } = {}) {
    await this.open();
    await this.fillBasics(spec);
    if (/In-Person|Hybrid/i.test(spec.type) && room) await this.setRoom(room);
    if (/Online|Hybrid/i.test(spec.type) && (link || spec.link)) await this.setOnlineLink(link || spec.link);
    for (const f of facilities) await this.addRequiredFacility(f).catch(() => {});
    for (const p of participants) await this.addParticipant(p);
    if (repeat || spec.repeat) await this.setRepeat(repeat || spec.repeat);
    if (teamChat) await this.setTeamChat(teamChat);
    await this.page.waitForTimeout(500);
    return this.schedule();
  }
}

module.exports = { MeetingSchedulePage };
