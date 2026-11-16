'use strict';

/**
 * Meeting Management test data — facilities, a room, and meeting specs, built from the SRS.
 * Run-tagged, tenant-unique names (naming.js) so a re-run never clashes.
 *
 * Chain: facilities (Add Standard + one custom) → a room in Main Branch that offers them →
 * meetings booked into that room. Dates are always in the future (SRS: not in the past; 5 min–12 h).
 */
const { tagged, RUN_ID } = require('./naming');

const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = tot => `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;   // minutes-since-midnight → HH:mm

/**
 * The i-th WEEKDAY from today (i = 0 is the next weekday), as YYYY-MM-DD. Index-based so distinct i
 * ALWAYS give distinct dates — unlike "n days ahead + skip weekend", where e.g. +5 (Sat) and +6
 * (Sun) both collapse onto the same Monday and silently double-book the host.
 */
function futureWeekday(i = 0) {
  const d = new Date();
  let c = -1;
  for (let g = 0; g < 500; g++) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) { c++; if (c === i) return isoDate(d); }
  }
  return isoDate(d);
}

const BRANCH = 'Main Branch';

// Every meeting uses amit as host; reusing the same date+time across runs double-books him. Shift
// the whole run's booking window (distinct weekday per meeting) AND offset the start minute per run
// so two runs never land the same slot on the same day.
const BASE = 2 + (Number(RUN_ID.slice(-2)) % 10);     // 2..11 — which weekday the window starts on
const MIN = Number(RUN_ID.slice(-3)) % 30;            // 0..29 — per-run minute offset

function data() {
  return {
    branch: BRANCH,
    // one custom facility; Add Standard Facilities seeds the defaults separately
    facility: { name: tagged('Projector'), description: 'HD projector with HDMI', active: true },
    room: {
      name: tagged('Conference Room'),
      code: `MR-${RUN_ID.slice(-4)}`,
      branch: BRANCH,
      capacity: 10,
      location: '3rd floor, west wing',
      notes: 'Automation test room',
      active: true,
    },
    // In-Person meeting booked into the room (host defaults to the scheduler, amit)
    inPerson: {
      title: tagged('Sprint Planning'),
      type: 'In-Person',
      branch: BRANCH,
      date: futureWeekday(BASE),
      start: hhmm(600 + MIN),
      end: hhmm(630 + MIN),
      description: 'Plan the next sprint.',
      agenda: '1. Review backlog\n2. Assign stories\n3. Risks',
      endsMode: 'fixed',
    },
    // Online meeting (needs a link, no room)
    online: {
      title: tagged('Design Review (Online)'),
      type: 'Online',
      branch: BRANCH,
      date: futureWeekday(BASE + 1),
      start: hhmm(840 + MIN),
      end: hhmm(885 + MIN),
      link: 'https://meet.example.com/design-review',
      description: 'Remote design review.',
    },
    // Repeating weekly meeting (series)
    repeating: {
      title: tagged('Weekly Standup'),
      type: 'Online',
      branch: BRANCH,
      date: futureWeekday(BASE + 2),
      start: hhmm(570 + MIN),
      end: hhmm(585 + MIN),
      link: 'https://meet.example.com/standup',
      repeat: 'Weekly',
    },
    // A meeting to End (host) and one to Cancel — distinct days so they don't overlap
    toEnd: { title: tagged('Status Sync (to end)'), type: 'Online', branch: BRANCH, date: futureWeekday(BASE + 3), start: hhmm(660 + MIN), end: hhmm(680 + MIN), link: 'https://meet.example.com/status' },
    toCancel: { title: tagged('Ad-hoc Review (to cancel)'), type: 'Online', branch: BRANCH, date: futureWeekday(BASE + 4), start: hhmm(900 + MIN), end: hhmm(920 + MIN), link: 'https://meet.example.com/adhoc' },
  };
}

module.exports = { data, futureWeekday, isoDate };
