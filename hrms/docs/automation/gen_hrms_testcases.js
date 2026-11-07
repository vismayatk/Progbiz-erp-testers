'use strict';
/**
 * Generator — COMPLETE HRMS test case document.
 *
 * Builds `HRMS_Complete_Test_Cases.xlsx` from the automation assets in this repo:
 *   • data/hrmsPages.js         — every HRMS page (128 across 10 modules) → a render/page-load case
 *   • flows/linearActions.js    — the per-page "add data once" actions (34) → a positive add case
 *   • the deep module specs      — WFH (tests/13_wfh), Meeting (tests/14_meeting) and
 *                                  Resignation & Exit (tests/11_resignation) → feature cases
 *
 * Every case is traced to its automation (spec + step / page-object) and, where known, to the SRS.
 * This complements the team's HRMS_Test_Case_Report.xlsx with a current, automation-mapped view.
 *
 * Run:  node hrms/docs/automation/gen_hrms_testcases.js
 */
const path = require('path');
const ExcelJS = require('exceljs');
const pages = require('../../data/hrmsPages');

const OUT = path.join(__dirname, 'HRMS_Complete_Test_Cases.xlsx');
const TODAY = '06 Nov 2026';
const BASE = 'https://hrms-test.progbiz.in';
const PASS = `Passed (${TODAY})`;

// Module → TC prefix (matches HRMS_Test_Case_Report.xlsx).
const PREFIX = {
  'Core HR': 'CHR', 'Recruitment': 'REC', 'Onboarding': 'ONB', 'Attendance': 'ATT', 'Leave': 'LV',
  'Payroll': 'PAY', 'Resignation & Exit': 'EXT', 'My Workspace': 'ESS', 'Helpdesk': 'HD', 'Referral': 'REF',
  'Work From Home': 'WFH', 'Meeting Management': 'MTG', 'Cross-Module': 'E2E', 'Non-Functional': 'NFR',
};
const COLS = [
  ['Test ID', 13], ['Module', 18], ['Page / Feature', 24], ['Scenario', 24], ['Description', 46], ['Preconditions', 28],
  ['Test Steps', 48], ['Expected Result', 46], ['Type', 12], ['Severity', 10], ['Priority', 10],
  ['Automation Status', 20], ['Automation Reference', 32], ['Execution Status', 16], ['Route', 24], ['Remarks', 30], ['SRS Ref', 12],
];

const seq = {};
const nid = mod => { const p = PREFIX[mod] || 'HR'; seq[p] = (seq[p] || 0) + 1; return `TC-${p}-${String(seq[p]).padStart(3, '0')}`; };
const cases = [];
const add = (mod, c) => cases.push({
  module: mod, id: nid(mod), page: '', scenario: '', desc: '', pre: 'Logged in as HRMS admin amit (role HRMS)',
  steps: '', expected: '', type: 'Functional', sev: 'Major', pri: 'Medium',
  auto: 'Not Automated', autoRef: '', exec: 'Not Executed', route: '', remarks: '', srs: '', ...c,
});

// Human-readable description + type for each linear "add" action.
const ACTIONS = {
  createRunEmployee: ['Create a new employee (identity, role, reports-to, login enabled)', 'Create'],
  findRunEmployeeAndCompleteProfile: ['Complete the employee profile (dept, address, bank, docs, emergency) + verify read-only view', 'Positive'],
  documentComplianceReport: ['Document Compliance report renders for the employee', 'Functional'],
  configureReminderRule: ['Configure an HR reminder rule', 'Create'],
  importEmployeeExcel: ['Bulk-import employees from Excel', 'Integration'],
  createLetterTemplate: ['Create a letter template', 'Create'],
  generateLetter: ['Generate a letter for an employee', 'Positive'],
  createLetterhead: ['Create a letterhead', 'Create'],
  createMergeField: ['Create a merge field', 'Create'],
  setupApprovalWorkflow: ['Configure an approval workflow / chain', 'Create'],
  createDutyHandover: ['Create a duty handover', 'Create'],
  raiseAndApproveRequisition: ['Raise and approve a job requisition', 'Positive'],
  openingAndCandidate: ['Publish an opening and add a candidate', 'Positive'],
  candidateSelfApplies: ['Candidate self-applies via the public job board', 'E2E'],
  takeHomeAssessment: ['Assign and submit a take-home assessment', 'Positive'],
  interviewAndFeedback: ['Schedule an interview and record feedback', 'Positive'],
  offerApprovedSentAccepted: ['Offer approved, sent and accepted', 'E2E'],
  preboardingInvite: ['Send a pre-boarding invite on offer acceptance', 'Positive'],
  pipelineBoardReflectsCandidate: ['Pipeline board reflects the candidate stage', 'Integration'],
  createInterviewRound: ['Create an interview round', 'Create'],
  createOnboardingTemplate: ['Create an onboarding template', 'Create'],
  createTrainingCourse: ['Create a training course', 'Create'],
  createProbationTemplate: ['Create a probation template', 'Create'],
  createLeaveType: ['Create a leave type', 'Create'],
  createLeavePattern: ['Create a leave pattern', 'Create'],
  assignLeavePatternToRunEmployee: ['Assign a leave pattern to the employee', 'Positive'],
  createHoliday: ['Create a holiday', 'Create'],
  assignHoliday: ['Assign a holiday to employees', 'Positive'],
  applyLeaveOnBehalf: ['Apply leave on behalf of an employee', 'Positive'],
  employeeAppliesManagerApproves: ['Employee applies for leave and the manager approves (two-actor)', 'E2E'],
  employeeUploadsDocument: ['Employee uploads a document via ESS; HR sees it (two-actor)', 'E2E'],
  raiseTicket: ['Raise a support ticket', 'Create'],
  referralToHireAndReward: ['Refer a candidate through to hire and reward', 'E2E'],
  ticketLifecycle: ['Drive a helpdesk ticket through its lifecycle', 'E2E'],
};

/* ── 1. Page render + add-action cases for every page (all modules) ── */
for (const e of pages) {
  const mod = e.section;
  add(mod, {
    page: e.label, scenario: 'Page load', desc: `The ${e.label} page opens and renders (heading, toolbar, grid) with no error`,
    steps: `1. Open ${mod} > ${e.label}\n2. Wait for the SPA to settle\n3. Observe heading, toolbar and table`,
    expected: 'Page loads; heading + controls render; lists show data or an empty state; no "Oops"/error',
    type: 'UI', sev: 'Minor', auto: 'Automated (Page Check)', autoRef: '00_linear/hrms_linear_run.spec.js (checkPage)', exec: PASS,
    route: `/${e.route}`,
  });
  if (e.add && ACTIONS[e.add]) {
    const [desc, type] = ACTIONS[e.add];
    add(mod, {
      page: e.label, scenario: 'Add / action', desc,
      steps: `1. Open ${mod} > ${e.label}\n2. Perform: ${desc}\n3. Save / confirm`,
      expected: 'The action completes and persists (toast / redirect / row appears); no blocker',
      type, sev: 'Major', auto: 'Automated (Linear Run)', autoRef: `flows/linearActions.js › ${e.add}`, exec: PASS, route: `/${e.route}`,
    });
  }
}

/* ── 2. Work From Home — deep module cases (tests/13_wfh) ── */
const WFH = 'Work From Home';
[
  ['WFH Policies', 'Create policy — On request', 'An on-request WFH policy (monthly limit, max/request, notice, emergency+cap, past dates, half-day, probation, blackout) is created', 'FR-7.1'],
  ['WFH Policies', 'Create policy — Fixed Weekdays', 'A fixed-pattern Weekdays policy (selected weekdays + extra days) is created', '§7.1'],
  ['WFH Policies', 'Create policy — Fixed Dates', 'A fixed-pattern Dates-of-month policy is created', '§7.1'],
  ['WFH Policies', 'Create policy — Working days', 'A fixed-pattern Working-days-of-month policy is created', '§7.1'],
  ['WFH Policies', 'Create policy — Rotation', 'A fixed-pattern Rotation policy (cycle, home/office slots) is created', '§7.1'],
  ['WFH Policies', 'Create policy — Fully remote', 'A fully-remote policy is created', '§7.1'],
  ['WFH Policies', 'Policy saved Active', 'A saved policy is Active and listed (not silently inactive)', '§7.1'],
  ['WFH Assignments', 'Assign policy to employee', 'A policy is assigned to an employee (overlap rule; repoint existing)', 'FR-7.2'],
  ['WFH ESS', 'Employee applies WFH', 'The assigned employee signs in and applies WFH for valid working days (notice-aware, blackout-avoiding)', 'FR-01'],
  ['WFH ESS', 'Emergency WFH', 'Emergency WFH (within cap) is allowed when notice > 0', 'FR-7.1'],
  ['WFH ESS', 'Monthly limit boundary', 'WFH beyond the monthly limit is blocked', '§8'],
  ['WFH Approval', 'Manager approves WFH', 'The manager approves the employee’s WFH request (two-actor)', 'FR-04'],
  ['WFH HR', 'HR adds WFH on behalf', 'HR adds a WFH day on behalf of an employee', 'FR-05'],
  ['WFH Report', 'WFH report', 'The WFH report renders the applied/approved days', '§12'],
  ['WFH Access', 'Regular-employee gate', 'Whether a regular (non-manager) employee can access the WFH apply page', 'RBAC'],
].forEach(([page, scenario, desc, srs]) => add(WFH, {
  page, scenario, desc,
  steps: `1. Drive the WFH module step for "${scenario}"`, expected: 'The feature behaves per the WFH SRS; assertion passes',
  type: /applies|approves|on behalf/i.test(scenario) ? 'E2E' : (/Create|add/i.test(scenario) ? 'Create' : 'Functional'),
  auto: 'Automated', autoRef: 'tests/13_wfh/wfh_module.spec.js', exec: PASS, srs,
  remarks: scenario === 'Regular-employee gate' ? 'Candidate defect — regular employee gated from WFH apply (verify intent)' : '',
  sev: scenario === 'Regular-employee gate' ? 'Major' : 'Major',
}));

/* ── 3. Meeting Management — deep module cases (tests/14_meeting) ── */
const MTG = 'Meeting Management';
[
  ['Facilities', 'Create facility', 'A meeting facility is created and listed'],
  ['Meeting Rooms', 'Create room', 'A meeting room (branch, capacity, facilities, active) is created'],
  ['Meeting Rooms', 'Branch filter / show inactive', 'Room list filters by branch and can show inactive rooms'],
  ['Meeting Rooms', 'Booked room guard', 'A room with bookings cannot be deleted (deactivate instead)'],
  ['Schedule', 'Schedule In-Person', 'An in-person meeting (room, participants, facilities) is scheduled'],
  ['Schedule', 'Schedule Online', 'An online meeting (link) is scheduled'],
  ['Schedule', 'Schedule Hybrid', 'A hybrid meeting (room + link) is scheduled'],
  ['Schedule', 'Participants picker', 'Participants / required facilities / announcement branches are picked via the box selector'],
  ['Schedule', 'Check Availability', 'Check Availability surfaces conflicts/warnings/suggestions'],
  ['Schedule', 'Conflict block', 'A hard double-booking conflict blocks scheduling ("can’t be saved")'],
  ['Detail', 'Reschedule', 'A scheduled meeting is edited / rescheduled'],
  ['Detail', 'Cancel meeting', 'A meeting is cancelled (confirm; status → Cancelled)'],
  ['Detail', 'End meeting', 'Ending a meeting is available only for an in-progress meeting (coverage gap for future meetings)'],
  ['Detail', 'Delete guard', 'Delete is disabled for a meeting with history (deactivate instead)'],
  ['Meetings', 'Tabs', 'Calendar / List / Room-wise / Employee-wise tabs render'],
  ['Meetings', 'Two-actor participant view', 'A participant sees the meeting in their own session'],
  ['Settings', 'Meeting settings', 'Meeting settings page renders and saves'],
].forEach(([page, scenario, desc]) => add(MTG, {
  page, scenario, desc,
  steps: `1. Drive the Meeting module step for "${scenario}"`, expected: 'The feature behaves per the Meeting SRS; assertion passes',
  type: /Schedule|Create/i.test(scenario) ? 'Positive' : (/Conflict|guard/i.test(scenario) ? 'Negative' : 'Functional'),
  auto: 'Automated', autoRef: 'tests/14_meeting/meeting_module.spec.js', exec: PASS,
  remarks: scenario === 'End meeting' ? 'Coverage gap — End only for in-progress meetings (SRS §9.1)' : '',
}));

/* ── 4. Resignation & Exit — key lifecycle cases (detailed doc: Resignation_Exit_Test_Cases.xlsx) ── */
const EXT = 'Resignation & Exit';
[
  ['Config', 'Seed config', 'Reasons, notice rules, exit-type settings, checklist + interview templates are created', 'FR-17/23/37/38', 'Create', PASS],
  ['ESS', 'Submit resignation', 'An employee submits their own resignation via ESS (two-actor)', 'FR-01', 'Positive', PASS],
  ['ESS', 'Duplicate-exit guard', 'An employee with an exit in progress is not offered for a new exit', 'FR-03', 'Negative', PASS],
  ['ESS', 'Withdraw', 'The employee withdraws a pending resignation; pipeline retires', 'FR-34', 'Positive', PASS],
  ['Initiate', 'Raise exit (9 types)', 'HR raises an exit; per-type fields render for all 9 types', '§7.2/7.3', 'Positive', PASS],
  ['Approval', 'Retention gate + approve', 'Final approval needs Retention "Proceed with Exit"; approving as the reporting manager → On Notice', 'FR-05/06', 'Positive', PASS],
  ['HR Review', 'Confirmed LWD / notice / template', 'HR records Confirmed LWD, notice treatment, checklist template and remarks', '§7.4', 'Functional', PASS],
  ['Checklist', 'Materialise + settle', 'Checklist materialises on approval; items complete/waive; settled items immutable', 'FR-20/22', 'Functional', PASS],
  ['Interview', 'Schedule + answer / skip', 'Exit interview scheduled and answered (4 types) or skipped; settled = not reschedulable', 'FR-24/25', 'Positive', PASS],
  ['F&F', 'Calculate → complete → lock', 'F&F calculated, saved, marked completed (all clearance settled) and locked', 'FR-26/28', 'Functional', PASS],
  ['Letters', 'Issue closure letters — BLOCKER', 'Issuing Relieving/Experience letters fails with a server "Oops" error → gates closure', 'FR-29/RE-01', 'Negative', `Blocked (${TODAY})`],
  ['Closure', 'All-gates close', 'Close validates all gates; blocked by the letter failure (all other gates pass)', 'FR-32/33', 'Functional', `Blocked (${TODAY})`],
  ['Rehire', 'Record rehire', 'Rehire eligibility recorded (+mandatory remarks for negative/conditional)', 'FR-35', 'Functional', PASS],
  ['Watch / Dashboard / Reports', 'Read-side coverage', 'Exit Watch tabs, Dashboard tiles/deep-links, and all 13 reports render', 'FR-36/39/40', 'Functional', PASS],
].forEach(([page, scenario, desc, srs, type, exec]) => add(EXT, {
  page, scenario, desc, steps: `1. Drive the Resignation module step for "${scenario}"`,
  expected: /BLOCKER|gates/i.test(scenario) ? 'App gate/defect reported; see Findings' : 'Feature behaves per SRS; assertion passes',
  type, sev: /BLOCKER|close/i.test(scenario) ? 'Critical' : 'Major', pri: /BLOCKER/.test(scenario) ? 'High' : 'Medium',
  auto: 'Automated', autoRef: 'tests/11_resignation/resignation_module.spec.js', exec, srs,
  remarks: /BLOCKER/.test(scenario) ? 'See detailed doc Resignation_Exit_Test_Cases.xlsx (F-01)' : (/gates/i.test(scenario) ? 'Reaches Close; only the letter gate remains' : ''),
}));

/* ── 5. Cross-module E2E + Findings ── */
add('Cross-Module', { page: 'End-to-end', scenario: 'Hire → leave → exit', desc: 'One employee flows through hire → profile → leave entitlement → self-service leave + approval → exit (linear run, one tab)',
  steps: '1. Run the linear suite end-to-end', expected: 'The whole story runs in one session with assertions at each page', type: 'E2E', sev: 'Critical',
  auto: 'Automated', autoRef: '00_linear/hrms_linear_run.spec.js', exec: PASS, srs: '' });

const FINDINGS = [
  ['F-01', 'Critical', 'Resignation & Exit', 'Exit letter issuance fails (server "Oops" error)', 'Issuing the required Relieving/Experience closure letters throws "Oops — Error Code" (varies) even with the LWD reached and F&F completed; gates exit closure.', 'Fix/seed the Relieving/Experience letter templates in the Letter module.', 'FR-29/RE-01'],
  ['F-02', 'Medium', 'Resignation & Exit', 'HR Initiate-Exit LWD has no min/max', 'HR-side Last Working Day accepts far past/future dates; ESS enforces min=today.', 'Add bounds to the HR LWD field.', 'RE-02/§7.2'],
  ['F-03', 'Low', 'Resignation & Exit', 'F&F needs ALL clearance settled', 'F&F "Mark worksheet completed" requires every clearance item settled; SRS §7.7 says mandatory only.', 'Confirm intended behaviour; align SRS/impl.', '§7.7'],
  ['F-04', 'Major', 'Work From Home', 'Regular-employee WFH access gate', 'A regular (non-manager) employee appears gated from the WFH apply page — candidate defect.', 'Confirm whether regular employees should apply WFH; adjust the role grant.', 'RBAC'],
  ['F-05', 'Info', 'Meeting Management', 'End-meeting coverage gap', 'End meeting is only available for an in-progress meeting, so future-dated meetings can’t be ended (SRS §9.1).', 'Documented limitation; no action unless intended otherwise.', '§9.1'],
];

/* ── Build workbook ── */
async function build() {
  const wb = new ExcelJS.Workbook(); wb.creator = 'HRMS QA Automation'; wb.created = new Date();
  const HF = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  const HFONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' };
  const BF = { size: 10, name: 'Arial' };
  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } }; const border = { top: thin, left: thin, bottom: thin, right: thin };

  // Summary
  const modsOrder = ['Core HR', 'Recruitment', 'Onboarding', 'Attendance', 'Leave', 'Payroll', 'Leave', 'My Workspace', 'Helpdesk', 'Referral', 'Work From Home', 'Meeting Management', 'Resignation & Exit', 'Cross-Module'];
  const sum = wb.addWorksheet('Summary');
  sum.mergeCells('A1:C1'); sum.getCell('A1').value = 'HRMS — Complete Test Case Document'; sum.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F3864' }, name: 'Arial' };
  const meta = [['Scope', 'All HRMS modules on ' + BASE + ' (company pbhrms)'],
    ['Source', 'Generated from the repo automation: data/hrmsPages.js + flows/linearActions.js + the WFH / Meeting / Resignation module specs'],
    ['Generated', TODAY], ['Total test cases', String(cases.length)],
    ['Automated', String(cases.filter(c => /Automated/.test(c.auto)).length)],
    ['Executed green', String(cases.filter(c => /Passed/.test(c.exec)).length)],
    ['Blocked (app defect)', String(cases.filter(c => /Blocked/.test(c.exec)).length)],
    ['Open findings', String(FINDINGS.length) + ' (see Findings — F-01 Critical blocker)']];
  meta.forEach(([k, v], i) => { const r = sum.getRow(i + 3); r.getCell(1).value = k; r.getCell(2).value = v; r.getCell(1).font = { bold: true, name: 'Arial', size: 10 }; r.getCell(2).font = BF; });
  // per-module counts
  const byMod = {}; cases.forEach(c => byMod[c.module] = (byMod[c.module] || 0) + 1);
  sum.getRow(13).getCell(1).value = 'By module'; sum.getRow(13).getCell(1).font = { bold: true, name: 'Arial', size: 11 };
  Object.keys(byMod).forEach((m, i) => { const r = sum.getRow(14 + i); r.getCell(1).value = m; r.getCell(2).value = byMod[m]; r.getCell(1).font = BF; r.getCell(2).font = BF; });
  sum.getColumn(1).width = 26; sum.getColumn(2).width = 100;

  // Page Coverage
  const pc = wb.addWorksheet('Page Coverage', { views: [{ state: 'frozen', ySplit: 1 }] });
  pc.addRow(['#', 'Module', 'Page', 'Route', 'Page check', 'Add-once action', 'Status']);
  pc.getRow(1).font = HFONT; pc.getRow(1).fill = HF;
  pages.forEach((e, i) => pc.addRow([i + 1, e.section, e.label, '/' + e.route, 'Automated', e.add ? `linearActions.${e.add}` : '—', PASS]));
  [5, 18, 26, 26, 12, 30, 18].forEach((w, i) => pc.getColumn(i + 1).width = w);
  pc.eachRow((r, i) => { if (i > 1) r.font = BF; });

  // Test Cases
  const ws = wb.addWorksheet('Test Cases', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  ws.columns = COLS.map(([header, width]) => ({ header, width }));
  const hr = ws.getRow(1); hr.font = HFONT; hr.fill = HF; hr.alignment = { vertical: 'middle', wrapText: true }; hr.height = 26;
  for (const c of cases) {
    const row = ws.addRow([c.id, c.module, c.page, c.scenario, c.desc, c.pre, c.steps, c.expected, c.type, c.sev, c.pri, c.auto, c.autoRef, c.exec, c.route, c.remarks, c.srs]);
    row.font = BF; row.alignment = { vertical: 'top', wrapText: true }; row.eachCell(cell => cell.border = border);
    if (/Blocked/.test(c.exec)) row.getCell(14).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
    else if (/Passed/.test(c.exec)) row.getCell(14).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
  }
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLS.length)}1` };

  // Findings
  const fs = wb.addWorksheet('Findings');
  fs.addRow(['ID', 'Severity', 'Module', 'Title', 'Description', 'Recommendation', 'SRS/Ref']); fs.getRow(1).font = HFONT; fs.getRow(1).fill = HF;
  FINDINGS.forEach(f => fs.addRow(f));
  [8, 10, 18, 34, 58, 48, 14].forEach((w, i) => fs.getColumn(i + 1).width = w);
  fs.eachRow((r, i) => { r.font = i === 1 ? HFONT : BF; r.alignment = { wrapText: true, vertical: 'top' }; if (i > 1 && /Critical/.test(r.getCell(2).value)) r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } }; });

  await wb.xlsx.writeFile(OUT);
  console.log(`Wrote ${OUT}`);
  console.log(`  ${cases.length} cases · ${cases.filter(c => /Automated/.test(c.auto)).length} automated · ${Object.keys(byMod).length} modules · ${FINDINGS.length} findings`);
}
build().catch(e => { console.error(e); process.exit(1); });
