'use strict';

/**
 * Resignation & Exit Management test data — derived from the module SRS (v1.0, 11-Aug-2026) and the
 * live page probe. The automation seeds the config this module owns (a resignation reason, a notice
 * rule, a checklist template, an interview template) and then drives the full separation lifecycle
 * on a dedicated throwaway employee:
 *
 *   Submit → Approve → On Notice → Clearance + Interview + F&F + Letters → Close.
 *
 * Record names carry a run-tagged, tenant-unique name (naming.js) so re-runs never clash and the
 * team can spot automation rows. People are realistic (letters only) and found by code/e-mail.
 *
 * Live facts (probe): 9 exit types; notice treatments = Served Fully / Partially Served / Waived /
 * Paid in Lieu / Not Served (+"Type default"); seeded reasons include "Better Opportunity".
 */
const { tagged, RUN_TAG } = require('./naming');

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today (caller's date), YYYY-MM-DD. */
function todayISO() { return iso(new Date()); }
/** `days` calendar days from today. */
function daysFromTodayISO(days) { const d = new Date(); d.setDate(d.getDate() + days); return iso(d); }
/** `days` ahead, skipping Sat/Sun so a date lands on a working day. */
function futureWeekdayISO(days = 3) {
  const d = new Date(); d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return iso(d);
}

/** The nine exit types the tenant offers (live). */
const EXIT_TYPES = [
  'Resignation', 'Termination', 'Retirement', 'Absconding', 'Death',
  'Permanent Disablement', 'End of Contract', 'Internship Completion', 'Other',
];

/** Notice-treatment option labels (live, minus the "Type default" sentinel). */
const NOTICE_TREATMENTS = [
  'Served Fully', 'Partially Served', 'Waived', 'Paid in Lieu', 'Not Served',
];

/**
 * Last Working Day for the run exit — comfortably future (clears any notice rule) and on a weekday.
 * Notice rules here set 30 days; 45 ahead leaves margin and keeps interview/checklist due-dates
 * (which must fall between approval and the LWD) placeable.
 */
function lwdISO(days = 45) { return futureWeekdayISO(days); }

/** An interview / checklist due date that falls safely inside (approval … LWD). */
function midExitDateISO() { return futureWeekdayISO(20); }

/** The config the module seeds (and thereby exercises each config page). */
function config() {
  return {
    // Resignation Reasons master — a new, tagged, tenant-unique reason.
    reason: {
      text: tagged('Pursuing a startup'),
      offeredOn: 'Resignation',   // "Offered On" exit-type scope
      order: 50,
      active: true,
    },
    // Notice Period Rules — a Designation-scoped rule for the test designation.
    noticeRule: {
      scope: 'Designation',
      appliesTo: 'SOFTWARE TESTER',   // matches the throwaway employee's designation
      noticeDays: 30,
      recover: false,                 // no recovery → no required "capped at" field (clean save)
      active: true,
    },
    // Exit Checklist Template — one task of every kind, at least one mandatory; due offsets are
    // negative (before the LWD) so they resolve inside the approval…LWD window.
    checklist: {
      name: tagged('Standard Exit Clearance'),
      forDesignation: '',             // generic (blank) so it applies broadly; auto-select friendly
      active: true,
      // Owners kept to Employee / Reporting Manager so no owner-reference is required (Department /
      // Designation / Specific Employee would each demand a reference). Due offsets are negative
      // (before the LWD) so they resolve inside the approval…LWD window.
      tasks: [
        { title: 'Knowledge transfer to team',       kind: 'Knowledge Transfer',   owner: 'Employee',          due: -10, mandatory: true },
        { title: 'Department clearance sign-off',     kind: 'Department Clearance', owner: 'Reporting Manager', due: -5,  mandatory: true },
        { title: 'Exit formalities acknowledgement',  kind: 'Other',                owner: 'Employee',          due: -1,  mandatory: false },
      ],
    },
    // Exit Interview Template — one question of each supported kind (Rating / Text / Yes-No / Choice).
    interview: {
      name: tagged('Standard Exit Interview'),
      isDefault: false,
      mandatory: false,   // not mandatory → not a hard closure gate (keeps the run deterministic)
      active: true,
      // kinds match the live "Answer Type" options: Rating (1–5) / Text / Yes / No / Choice.
      questions: [
        { text: 'How would you rate your overall experience?', kind: 'Rating' },
        { text: 'What is the primary reason for your exit?',    kind: 'Text' },
        { text: 'Would you recommend us as an employer?',       kind: 'Yes / No' },
        { text: 'Which area most needs improvement?',           kind: 'Choice', options: 'Management, Compensation, Growth, Culture' },
      ],
    },
  };
}

/**
 * The exit raised on the full-lifecycle employee (HR Initiate Exit). Resignation is the simplest
 * employer-neutral type (LWD + reason). The actual exit type may be re-chosen at run time to one
 * that auto-activates (no approval chain) so On-Notice is deterministic — see the spec.
 */
function exitSpec() {
  return {
    type: 'Resignation',
    lwd: lwdISO(45),
    reason: 'Better Opportunity',   // a seeded reason (always present)
    remarks: `Automated full-lifecycle exit — ${RUN_TAG}`,
  };
}

/**
 * HR Review decisions applied on the detail page. Confirmed LWD is set to TODAY (a weekday) so the
 * effective last working day is reached and the exit can be closed in the same automated run — HR
 * may set the Confirmed LWD earlier than the tentative date (it records a shortfall), and it is only
 * frozen once F&F is completed, so this must be saved before F&F.
 */
function hrReview() {
  return {
    confirmedLwd: futureWeekdayISO(0),   // today (or next weekday) — makes the LWD "reached" for Close
    noticeTreatment: 'Served Fully',
    hrRemarks: `HR review recorded by automation — ${RUN_TAG}`,
  };
}

/** The ESS self-service resignation (second actor), used for submit → duplicate-guard → withdraw. */
function essResignation() {
  return {
    reason: 'Personal Reasons',     // a seeded ESS reason
    proposedLwd: lwdISO(40),
    remarks: `Self-service resignation via ESS — ${RUN_TAG}`,
    altEmail: 'alt.contact@example.com',
    altMobile: '9' + String(Date.now()).slice(-9),
  };
}

/** Full & Final ad-hoc components (one earning, one deduction) — labels are mandatory per line. */
function fnfComponents() {
  return [
    { kind: 'Earning',   label: tagged('Pro-rata incentive'), amount: 1500 },
    { kind: 'Deduction', label: tagged('ID card recovery'),   amount: 250 },
  ];
}

module.exports = {
  EXIT_TYPES, NOTICE_TREATMENTS,
  todayISO, daysFromTodayISO, futureWeekdayISO, lwdISO, midExitDateISO,
  config, exitSpec, hrReview, essResignation, fnfComponents,
};
