'use strict';

/**
 * Work From Home test data — policy definitions derived from the WFH SRS §15.3 (prerequisite
 * policies) and §7.1 (policy editor fields). Each policy carries a run-tagged, tenant-unique name
 * (naming.js) so a re-run never clashes and the team can see which rows came from automation.
 *
 * One representative policy per Type and per Fixed-pattern kind, so the automation exercises every
 * control on the editor:
 *   onRequest  — every On-request control (limit, max/req, notice, emergency+cap, past dates+days
 *                back, half-day, probation, notice-period, one blackout date with a description).
 *   weekdays   — Fixed pattern · Weekdays   (Tue + Thu), Extra days 2, half-day off.
 *   dates      — Fixed pattern · Dates of the month (1 and 15).
 *   workingDays— Fixed pattern · Working days of the month (quick-pick first 3).
 *   rotation   — Fixed pattern · Rotation (Weekly days, cycle 2, default Home/Office slots).
 *   remote     — Fully remote (past dates on, 0 days back).
 */
const { tagged } = require('./naming');

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today in the browser/host time zone as YYYY-MM-DD (the server uses the caller's date). */
function todayISO() { return iso(new Date()); }

/** `days` calendar days from today, YYYY-MM-DD. */
function daysFromTodayISO(days) { const d = new Date(); d.setDate(d.getDate() + days); return iso(d); }

/** `days` ahead but skipping Sat/Sun, so a WFH request lands on a working day. */
function futureWeekdayISO(days = 3) {
  const d = new Date(); d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return iso(d);
}

/**
 * The next `count` weekday (Mon–Fri) dates starting `startOffset` days ahead, skipping any date in
 * `skip` (e.g. a blackout). Used to pick valid WFH request days that clear the notice period and
 * avoid the policy's no-WFH date. Weekly-offs other than Sat/Sun aren't known here, but the run
 * employee (amit) is a Mon–Fri shift, so Sat/Sun is the right skip set.
 */
function workingDaysAhead(count = 2, { startOffset = 3, skip = [] } = {}) {
  const out = [];
  const d = new Date(); d.setDate(d.getDate() + startOffset);
  for (let guard = 0; out.length < count && guard < 40; guard++, d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const s = iso(d);
    if (skip.includes(s)) continue;
    out.push(s);
  }
  return out;
}

/**
 * The policies the suite creates, in editor terms. `mode`: 'onRequest' | 'fixed' | 'remote'.
 * `patternBy` (fixed only): 'Weekdays' | 'Dates of the month' | 'Working days of the month' | 'Rotation'.
 * Numbers follow §15.3; omitted numbers default to 0 on the form.
 */
function policies() {
  return {
    onRequest: {
      key: 'P-OR',
      name: tagged('WFH On request'),
      mode: 'onRequest',
      // Headroom: approved WFH days from earlier runs cannot be withdrawn and keep counting against
      // the month, so a small limit (the SRS uses 4) fills up and blocks re-runs. 31 is the max the
      // field allows and leaves room; the limit-boundary validation is checked separately in the spec.
      monthlyLimit: 31,
      maxPerRequest: 3,
      notice: 2,
      allowEmergency: true,
      emergencyPerMonth: 1,
      allowPast: true,
      daysBack: 3,
      halfDay: true,
      probation: true,
      noticePeriod: true,
      blackout: { date: daysFromTodayISO(5), reason: 'Quarterly audit' },
      active: true,
    },
    weekdays: {
      key: 'P-WD',
      name: tagged('WFH Fixed Weekdays'),
      mode: 'fixed',
      patternBy: 'Weekdays',
      weekdays: ['Tue', 'Thu'],
      extraDays: 2,
      halfDay: false,
      active: true,
    },
    dates: {
      key: 'P-MD',
      name: tagged('WFH Fixed Dates'),
      mode: 'fixed',
      patternBy: 'Dates of the month',
      dates: [1, 15],
      active: true,
    },
    workingDays: {
      key: 'P-WK',
      name: tagged('WFH Fixed Working days'),
      mode: 'fixed',
      patternBy: 'Working days of the month',
      firstNWorkingDays: 3,
      active: true,
    },
    rotation: {
      key: 'P-ROT',
      name: tagged('WFH Fixed Rotation'),
      mode: 'fixed',
      patternBy: 'Rotation',
      rotateBy: 'Weekly days',
      cycleLength: 2,              // default slots: Day 1 Home, Day 2 Office (a valid mix)
      active: true,
    },
    remote: {
      key: 'P-REM',
      name: tagged('WFH Fully remote'),
      mode: 'remote',
      allowPast: true,
      daysBack: 0,
      halfDay: true,
      active: true,
    },
  };
}

module.exports = { policies, todayISO, daysFromTodayISO, futureWeekdayISO, workingDaysAhead };
