'use strict';

/**
 * Module presets — map a short module name to how it runs, so each module can be run on its own
 * (`npm run hrms:leave`) and all together (`npm run hrms:all`). Used by hrms/scripts/run-module.js.
 *
 * Most modules are a SECTION of the one linear run (tests/00_linear) — the runner sets HRMS_SECTION
 * and the linear spec walks just that sidebar section (the run employee is created/bootstrapped as
 * needed). A few modules are their OWN spec file (e.g. WFH) and run by path instead.
 *
 * Sections come from data/hrmsPages.js: Core HR, Recruitment, Onboarding, Attendance, Leave,
 * Payroll, My Workspace (ESS), Helpdesk, Referral, Resignation & Exit.
 */
module.exports = {
  // section slices of the linear run
  'core-hr':     { section: 'Core HR' },
  recruitment:   { section: 'Recruitment' },
  onboarding:    { section: 'Onboarding' },
  attendance:    { section: 'Attendance' },
  leave:         { section: 'Leave' },
  payroll:       { section: 'Payroll' },
  ess:           { section: 'My Workspace' },      // Employee Self Service
  helpdesk:      { section: 'Helpdesk' },
  referral:      { section: 'Referral' },
  resignation:   { section: 'Resignation & Exit' },

  // standalone module spec files
  wfh:           { spec: ['hrms/tests/13_wfh'] },  // Work From Home — self-contained

  // the whole suite
  linear:        { spec: ['hrms/tests/00_linear'] },               // every page, one tab
  all:           { spec: ['hrms/tests/00_linear', 'hrms/tests/13_wfh'] },
};
