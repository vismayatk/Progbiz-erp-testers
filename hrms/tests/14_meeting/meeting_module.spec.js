'use strict';

/**
 * Meeting Management — positive-workflow automation, built from "Meeting Management — SRS".
 *
 * Walks the module in dependency order: Settings → Facilities → Rooms → Meetings page → schedule a
 * meeting (In-Person into the room, with a participant) → detail & audit → the participant views it
 * in their own session (two-actor) → Online, repeating (series + stop), End, Cancel, Edit → delete
 * guards (used facility / booked room) → Settings changes. Every step asserts its own outcome and,
 * after each action, checks for an application BLOCKER (the "Oops / something went wrong / contact
 * admin" screen, flows/pageCheck.js). A failing step is recorded with a full-page screenshot and the
 * walk carries on; failures, blockers and access gaps are listed at the end. Screen recording +
 * trace are kept for failures by the suite config (HRMS_EVIDENCE=all keeps everything).
 *
 * Run ONLY this module (do not run until asked):
 *   $env:HEADED=1; npx playwright test -c hrms/playwright.config.js hrms/tests/14_meeting
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { MeetingSettingsPage } = require('../../pages/meeting/MeetingSettingsPage');
const { MeetingFacilitiesPage } = require('../../pages/meeting/MeetingFacilitiesPage');
const { MeetingRoomsPage } = require('../../pages/meeting/MeetingRoomsPage');
const { MeetingsListPage } = require('../../pages/meeting/MeetingsListPage');
const { MeetingSchedulePage } = require('../../pages/meeting/MeetingSchedulePage');
const { MeetingDetailPage } = require('../../pages/meeting/MeetingDetailPage');
const { withUser } = require('../../flows/userSession');
const { credentials } = require('../../flows/runEmployee');
const { assertNoBlocker, detectBlocker } = require('../../flows/pageCheck');
const { data } = require('../../data/meetingData');
const { VIEWPORT, VIDEO_SIZE } = require('../../fixtures/window');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
const AUTH = path.join(__dirname, '..', '..', '.auth');
const STATE = path.join(AUTH, 'state.json');
const SESSIONS = path.join(__dirname, '..', '..', '..', 'test-results', 'hrms', '_meeting');
const safe = s => s.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();
const runEmp = fs.existsSync(path.join(AUTH, 'run-employee.json'))
  ? JSON.parse(fs.readFileSync(path.join(AUTH, 'run-employee.json'), 'utf-8')) : null;

test('Meeting Management — full module walk (settings → rooms → schedule → lifecycle → tabs)', async ({ browser }, testInfo) => {
  test.setTimeout(90 * 60 * 1000);
  fs.mkdirSync(SESSIONS, { recursive: true });
  const context = await browser.newContext({ storageState: STATE, viewport: VIEWPORT, recordVideo: { dir: SESSIONS, size: VIDEO_SIZE } });
  const page = await context.newPage();
  const results = [];
  const gaps = [];
  const D = data();
  const meetings = {};   // created meeting guids by key

  const step = async (label, fn) => {
    await test.step(label, async () => {
      const t0 = Date.now();
      try {
        await fn();
        await assertNoBlocker(page, label);
        results.push({ label, ok: true, secs: Math.round((Date.now() - t0) / 1000) });
        console.log(`  ✅ ${label} (${Math.round((Date.now() - t0) / 1000)}s)`);
      } catch (e) {
        const shot = testInfo.outputPath(`${safe(label)} — failure.png`);
        await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
        if (fs.existsSync(shot)) await testInfo.attach(`${label} — page at failure`, { path: shot, contentType: 'image/png' });
        const msg = String(e && e.message || e).split('\n').slice(0, 6).join(' ').replace(/\x1b\[[0-9;]*m/g, '');
        const blocker = /BLOCKER —/.test(msg);
        results.push({ label, ok: false, blocker, error: msg, secs: Math.round((Date.now() - t0) / 1000) });
        console.log(`  ${blocker ? '🚧' : '❌'} ${label} — ${msg.slice(0, 260)} | URL: ${page.url()}`);
        expect.soft(false, `${label}: ${msg}`).toBe(true);
      }
    });
  };

  try {
    // ── 1. SETTINGS ───────────────────────────────────────────────────────────
    const settings = new MeetingSettingsPage(page);
    await step('Settings — page loads with all sections', () => settings.open());
    await step('Settings · invite rules list every user level', async () => {
      const rules = await settings.inviteRules();
      expect(rules.length, 'the invite-ceiling table has a row per user level').toBeGreaterThanOrEqual(3);
    });
    await step('Settings · ensure scheduling is permissive (overlap + off days allowed)', async () => {
      await settings.open();
      await settings.setSchedulingRules({ overlap: true, offDays: true });   // so an incidental clash is a warning, not a block
    });

    // ── 2. FACILITIES ─────────────────────────────────────────────────────────
    const fac = new MeetingFacilitiesPage(page);
    await step('Facilities — page loads', () => fac.open());
    await step('Facility · seed standard facilities', () => fac.addStandardFacilities());
    await step('Facility · create a custom facility', () => fac.addFacility(D.facility));

    // ── 3. ROOMS ──────────────────────────────────────────────────────────────
    const rooms = new MeetingRoomsPage(page);
    await step('Rooms — page loads', () => rooms.open());
    await step(`Room · create "${D.room.name}" in ${D.room.branch} with the facility`, () => rooms.addRoom(D.room, [D.facility.name]));
    await step('Room · edit notes and re-save', () => rooms.editNotes(D.room.name, 'Automation — edited notes'));
    await step('Room · filter by branch', async () => { await rooms.filter({ branch: D.room.branch }); await expect(rooms.rowByName(D.room.name)).toBeVisible(); });

    // ── 4. MEETINGS PAGE — tabs & filters ─────────────────────────────────────
    const list = new MeetingsListPage(page);
    await step('Meetings — page loads (Calendar/List/Room-wise/Employee-wise)', () => list.open());
    for (const tab of ['List', 'Room-wise', 'Employee-wise', 'Calendar']) {
      await step(`Meetings · ${tab} tab opens`, async () => { await list.openTab(tab); await assertNoBlocker(page, `${tab} tab`); });
    }
    await step('Meetings · Status filter = Scheduled', () => list.filterStatus('Scheduled'));

    // ── 5. SCHEDULE an In-Person meeting (participant = run employee) ──────────
    const sched = new MeetingSchedulePage(page);
    const participantName = runEmp ? runEmp.display : null;
    await step('Schedule — In-Person form: Check Availability runs', async () => {
      await sched.open();
      await sched.fillBasics(D.inPerson);
      await sched.setRoom(D.room.name);
      if (participantName) await sched.addParticipant(participantName);
      const check = await sched.checkAvailability();
      expect(check, 'the availability check produces a result').toBeTruthy();
    });
    await step('Schedule · book the In-Person meeting', async () => {
      meetings.inPerson = await sched.scheduleMeeting(D.inPerson, { room: D.room.name, participants: participantName ? [participantName] : [] });
      expect(meetings.inPerson, 'a meeting guid should be returned').toBeTruthy();
    });

    // ── 6. DETAIL & audit ─────────────────────────────────────────────────────
    const detail = new MeetingDetailPage(page);
    await step('Meeting detail · shows the core fields', async () => {
      await detail.open(meetings.inPerson);
      await detail.verifyDetail(D.inPerson, { participants: participantName ? [participantName] : [] });
      expect(await detail.status(), 'the new meeting is Scheduled').toMatch(/Scheduled/i);
    });
    await step('Meeting detail · audit history is recorded', async () => {
      const h = await detail.history();
      expect(h, 'the history shows a create entry').toMatch(/creat|schedul|added|book/i);
    });

    // ── 7. MEETINGS LIST shows it ─────────────────────────────────────────────
    await step('Meetings · the booked meeting appears on the List tab', () => list.open().then(() => list.expectListed(D.inPerson.title)));

    // ── 8. TWO-ACTOR: the participant views the meeting in their own session ──
    if (runEmp) {
      await step(`Participant (${runEmp.display}) sees the meeting in their own session`, async () => {
        const ok = await withUser(browser, testInfo, credentials(runEmp), async (ep) => {
          await ep.goto(`${BASE}/hrms/meetings`, { waitUntil: 'domcontentloaded' });
          await ep.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
          await ep.waitForTimeout(2000);
          const body = (await ep.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
          if (/Access Denied|don't have Permission/i.test(body)) return 'denied';
          const lp = new MeetingsListPage(ep);
          await lp.openTab('List').catch(() => {});
          return (await lp.listRow(D.inPerson.title).count()) ? 'seen' : 'not-listed';
        });
        if (ok === 'denied') { gaps.push({ label: `Participant ${runEmp.display} /hrms/meetings`, route: 'hrms/meetings', state: 'Access Denied (Meeting role not granted to the employee)' }); return; }
        expect(ok, `${runEmp.display} should see the meeting they were invited to`).toBe('seen');
      });
    } else gaps.push({ label: 'Two-actor participant view', route: 'hrms/meetings', state: 'Skipped — no run-employee.json' });

    // ── 9. ONLINE meeting (no room, link) ─────────────────────────────────────
    await step('Schedule · book an Online meeting (link, no room)', async () => {
      meetings.online = await sched.scheduleMeeting(D.online, { link: D.online.link });
      expect(meetings.online, 'online meeting guid').toBeTruthy();
    });

    // ── 10. REPEATING series → Stop ───────────────────────────────────────────
    await step('Schedule · book a weekly repeating meeting (series)', async () => {
      meetings.repeating = await sched.scheduleMeeting(D.repeating, { link: D.repeating.link, repeat: 'Weekly' });
      expect(meetings.repeating, 'repeating meeting guid').toBeTruthy();
    });
    await step('Series · stop repeating', async () => {
      await detail.open(meetings.repeating);
      await detail.stopSeries();
    });

    // ── 11. END a meeting (host) ──────────────────────────────────────────────
    await step('Schedule · book a meeting to End', async () => { meetings.toEnd = await sched.scheduleMeeting(D.toEnd, { link: D.toEnd.link }); expect(meetings.toEnd).toBeTruthy(); });
    await step('Lifecycle · host Ends the meeting (End applies only to an in-progress meeting)', async () => {
      await detail.open(meetings.toEnd);
      const r = await detail.end();
      if (r === 'not-available') gaps.push({ label: 'End meeting', route: `hrms/meeting/${meetings.toEnd}`, state: 'No End action on a future meeting — End only applies once a meeting is in progress (SRS §9.1); not reachable in a positive flow' });
    });

    // ── 12. CANCEL a meeting (host) ───────────────────────────────────────────
    await step('Schedule · book a meeting to Cancel', async () => { meetings.toCancel = await sched.scheduleMeeting(D.toCancel, { link: D.toCancel.link }); expect(meetings.toCancel).toBeTruthy(); });
    await step('Lifecycle · host Cancels the meeting (with reason)', async () => { await detail.open(meetings.toCancel); await detail.cancel(); });

    // ── 13. EDIT a scheduled meeting ──────────────────────────────────────────
    await step('Lifecycle · edit the In-Person meeting (change end time)', async () => {
      await detail.open(meetings.inPerson);
      await detail.edit();
      await page.locator('input[type="time"]').nth(1).fill('10:45').catch(() => {});
      await page.waitForTimeout(500);
      await sched.schedule();
    });

    // ── 14. DELETE GUARDS ─────────────────────────────────────────────────────
    await step('Guard · a room that has a meeting cannot be deleted', () => rooms.expectDeleteBlocked(D.room.name));
    await step('Guard · a facility used by a room cannot be deleted', () => fac.expectDeleteBlocked(D.facility.name));

    // ── 15. SETTINGS changes ──────────────────────────────────────────────────
    await step('Settings · toggle scheduling rules then restore', async () => {
      await settings.open();
      await settings.setSchedulingRules({ overlap: false });
      await settings.open();
      await settings.setSchedulingRules({ overlap: true });   // restore default
    });
    await step('Settings · set Team Chat defaults', async () => {
      await settings.open();
      await settings.setTeamChatDefaults({ readonlyHours: 24, archiveDays: 7 });
    });
  } finally {
    const video = page.video();
    await context.close();
    if (video) {
      const d = new Date(); const pad = x => String(x).padStart(2, '0');
      await video.saveAs(path.join(SESSIONS, `meeting-run ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.webm`)).catch(() => {});
      await video.delete().catch(() => {});
    }
    const failed = results.filter(r => !r.ok);
    const blockers = failed.filter(r => r.blocker);
    console.log(`\n  📋 Meeting module: ${results.length} steps · ${results.length - failed.length} passed · ${failed.filter(r => !r.blocker).length} failed · ${blockers.length} blocked (app error)`);
    for (const f of failed.filter(r => !r.blocker)) console.log(`     ❌ ${f.label} — ${f.error.slice(0, 180)}`);
    for (const b of blockers) console.log(`     🚧 ${b.label} — ${b.error.slice(0, 200)}`);
    if (gaps.length) { console.log(`\n  🔒 Access / coverage notes:`); for (const g of gaps) console.log(`     • ${g.label} (/${g.route}) — ${g.state}`); }
    fs.writeFileSync(testInfo.outputPath('meeting-results.json'), JSON.stringify({ results, gaps, meetings }, null, 2));
    await testInfo.attach('meeting-results', { path: testInfo.outputPath('meeting-results.json'), contentType: 'application/json' });
  }
});
