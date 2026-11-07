'use strict';
/**
 * Generator — Resignation & Exit Management test case document.
 *
 * Builds `Resignation_Exit_Test_Cases.xlsx` (same 20-column house format as
 * HRMS_Test_Case_Report.xlsx) from the module SRS (v1.0, 11-Aug-2026) and the Playwright
 * automation in hrms/tests/11_resignation/resignation_module.spec.js + hrms/pages/resignation/*.
 *
 * Run:  node hrms/docs/automation/gen_resignation_testcases.js
 */
const path = require('path');
const ExcelJS = require('exceljs');

const OUT = path.join(__dirname, 'Resignation_Exit_Test_Cases.xlsx');
const TODAY = '06 Nov 2026';
const BASE = 'https://hrms-test.progbiz.in';

// Column model (matches the master report).
const COLS = [
  ['Test ID', 13], ['Page / Sub-module', 22], ['Scenario', 22], ['Description', 44], ['Preconditions', 30],
  ['Test Data', 28], ['Test Steps', 52], ['Steps to Reproduce', 46], ['Expected Result', 48], ['Type', 12],
  ['Severity', 11], ['Priority', 10], ['Automation Status', 22], ['Automation Reference', 30], ['Execution Status', 18],
  ['Actual Result', 30], ['Tested By / Date', 18], ['Route', 26], ['Remarks', 34], ['SRS Ref', 14],
];

// Defaults applied to every case unless overridden.
const DEF = {
  pre: 'Logged in as HRMS admin amit (role HRMS / ExitManagement); module config seeded',
  data: '', type: 'Functional', sev: 'Major', pri: 'Medium',
  auto: 'Not Automated', autoRef: '', exec: 'Not Executed', actual: '', by: '', remarks: '', srs: '',
};
// Shorthands for the two automated states + their default execution result.
const A = (ref, exec = `Passed (${TODAY})`) => ({ auto: 'Automated', autoRef: ref, exec });
const SPEC = 'resignation_module.spec.js';

let seq = 0;
const id = () => `TC-EXT-${String(++seq).padStart(3, '0')}`;
const cases = [];
const TC = (sub, route, scenario, desc, steps, expected, o = {}) =>
  cases.push({ id: id(), sub, route, scenario, desc, steps, expected, ...DEF, ...o });

/* ───────────────────────── A. Configuration ───────────────────────── */
TC('Exit Reasons', '/resignation-reasons', 'Page load', 'Exit Reasons master page renders with the add form and grid',
  '1. Open /resignation-reasons', 'Heading "Exit Reasons"; add form (Reason, Offered On, Order, Active) and grid visible; no error',
  { ...A(`${SPEC} › C1; ResignationReasonsPage.open`), srs: 'FR-38', type: 'UI', sev: 'Minor' });
TC('Exit Reasons', '/resignation-reasons', 'Add reason', 'A new, tenant-unique exit reason is added and listed',
  '1. Enter a reason\n2. Choose Offered On = Resignation, Order, Active\n3. Save\n4. Filter the grid by the reason',
  'The reason is saved and appears in the grid (filtered)', { ...A(`${SPEC} › C1; ResignationReasonsPage.addReason`), srs: 'FR-38', type: 'Positive' });
TC('Exit Reasons', '/resignation-reasons', 'Duplicate reason', 'Re-adding the same reason text (case/space-insensitive) is refused',
  '1. Add a reason that already exists\n2. Save', 'A validation message states the reason already exists; no duplicate row',
  { ...A(`${SPEC} › C1; ResignationReasonsPage.expectDuplicateRefused`), srs: '§10', type: 'Negative' });
TC('Exit Reasons', '/resignation-reasons', 'Meaningful text', 'Whitespace/symbol-only reason is rejected',
  '1. Enter "   " or "***"\n2. Save', 'Rejected by meaningful-text validation', { srs: '§10', type: 'Validation', sev: 'Minor' });

TC('Notice Period Rules', '/notice-period-rules', 'Page load', 'Notice Period Rules page renders add form + grid',
  '1. Open /notice-period-rules', 'Heading, Scope/Applies-to/Notice-days controls and the rules grid render',
  { ...A(`${SPEC} › C2; NoticePeriodRulesPage.open`), srs: 'FR-38', type: 'UI', sev: 'Minor' });
TC('Notice Period Rules', '/notice-period-rules', 'Add designation rule', 'A Designation-scoped notice rule is added and listed',
  '1. Scope = Designation\n2. Applies To = SOFTWARE TESTER\n3. Notice Days = 30\n4. Save', 'Rule saved; appears in the grid for that designation',
  { ...A(`${SPEC} › C2; NoticePeriodRulesPage.addRule`), srs: 'FR-10/38', type: 'Positive' });
TC('Notice Period Rules', '/notice-period-rules', 'One rule per target', 'A second rule for the same scope+target is refused (idempotent update)',
  '1. Add a rule for a target that already has one', 'App reports "only one rule per target" / updates the existing rule',
  { ...A(`${SPEC} › C2; NoticePeriodRulesPage.addRule (idempotent)`), srs: 'FR-38', type: 'Negative' });
TC('Notice Period Rules', '/notice-period-rules', 'Precedence', 'Effective notice resolves by precedence Designation→Grade→SubDept→Dept→Branch→default',
  '1. Create overlapping rules\n2. Initiate Exit for an employee and read "Notice period (policy)"', 'The most specific matching rule applies',
  { srs: 'FR-10', type: 'Integration' });
TC('Notice Period Rules', '/notice-period-rules', 'Bounds', 'Notice days accept only 0–365',
  '1. Enter 400 (or -1)\n2. Save', 'Rejected; value must be 0–365', { srs: '§10', type: 'Boundary', sev: 'Minor' });

TC('Exit Type Settings', '/exit-type-settings', 'Page load + read', 'Per-type settings grid renders; Resignation is enabled; approval chains readable',
  '1. Open /exit-type-settings\n2. Read Enabled + Approval Chain per type', 'Grid of 9 types; Resignation always enabled; approval-chain column shown',
  { ...A(`${SPEC} › C3; ExitTypeSettingsPage.open/approvalChain`), srs: 'FR-37', type: 'UI' });
TC('Exit Type Settings', '/exit-type-settings', 'Resignation always on', 'Resignation cannot be disabled',
  '1. Try to untick Enabled for Resignation', 'Resignation stays enabled (control disabled / reverts)', { srs: 'FR-37', type: 'Negative', sev: 'Minor' });
TC('Exit Type Settings', '/exit-type-settings', 'Default notice treatment', 'A type default notice treatment can be set and saved',
  '1. Set Default Notice Treatment for a type\n2. Save', 'Saved; prefilled at Initiate Exit for that type', { srs: 'FR-37', type: 'Positive', sev: 'Minor' });
TC('Exit Type Settings', '/exit-type-settings', 'Gratuity / absconding / retirement', 'Gratuity default, absconding trigger days and retirement-age rule persist',
  '1. Set gratuity default, absconding trigger, Add retirement-age rule\n2. Save', 'Values persist and drive Exit Watch / gratuity block', { srs: 'FR-36/37' });

TC('Checklist Templates', '/exit-checklist-templates', 'Page load', 'Templates list renders with New Template',
  '1. Open /exit-checklist-templates', 'Heading, New Template button and grid (Name | Tasks | Action)',
  { ...A(`${SPEC} › C4; ExitChecklistTemplatesPage.open`), srs: 'FR-17', type: 'UI', sev: 'Minor' });
TC('Checklist Templates', '/exit-checklist-templates', 'Create template', 'Template with tasks of each kind (KT / Dept Clearance / Other), owner, due-offset, mandatory is created',
  '1. New Template\n2. Name, optional designation, Active\n3. Add tasks in each kind section (owner, due days, mandatory)\n4. Save Template',
  'Template saved and listed', { ...A(`${SPEC} › C4; ExitChecklistTemplatesPage.createTemplate`), srs: 'FR-17', type: 'Positive' });
TC('Checklist Templates', '/exit-checklist-templates', 'Unique name', 'Duplicate template name (case/space-insensitive) is refused',
  '1. Create a template with an existing name', 'Rejected with a name-clash message', { srs: 'FR-17/§10', type: 'Negative' });
TC('Checklist Templates', '/exit-checklist-templates', 'One active per designation', 'At most one active template per designation',
  '1. Set two active templates for the same designation', 'Second is refused or deactivates the first', { srs: 'FR-18', type: 'Negative' });
TC('Checklist Templates', '/exit-checklist-templates', 'Used template undeletable', 'A template used by any exit cannot be deleted (retire via Inactive)',
  '1. Use a template on an exit\n2. Try to delete it', 'Delete is disabled; editor shows "Used by N exits"; edits affect only future exits',
  { ...A(`${SPEC} › C4; ExitChecklistTemplatesPage.expectUndeletableWhenUsed`), srs: 'FR-19', type: 'Negative' });

TC('Interview Templates', '/exit-interview-templates', 'Page load', 'Interview templates list renders with New Template',
  '1. Open /exit-interview-templates', 'Heading, New Template and grid (Name | Questions | Action)',
  { ...A(`${SPEC} › C5; ExitInterviewTemplatesPage.open`), srs: 'FR-23', type: 'UI', sev: 'Minor' });
TC('Interview Templates', '/exit-interview-templates', 'Create template', 'Template with each question type (Rating 1–5 / Text / Yes-No / Choice) is created; Choice needs options',
  '1. New Template\n2. Name, Default/Mandatory/Active\n3. Add questions of each type (Choice with options)\n4. Save Template',
  'Template saved and listed', { ...A(`${SPEC} › C5; ExitInterviewTemplatesPage.createTemplate`), srs: 'FR-23', type: 'Positive' });
TC('Interview Templates', '/exit-interview-templates', 'Unique name / one default', 'Duplicate name refused; only one default template per tenant',
  '1. Create duplicate-named / second default template', 'Duplicate refused; setting a new default clears the old', { srs: 'FR-23/§8', type: 'Negative' });
TC('Interview Templates', '/exit-interview-templates', 'Mandatory gates closure', 'A mandatory active template makes a settled interview a closure gate',
  '1. Mark a template Mandatory + Active\n2. Try to close an exit with no settled interview', 'Closure blocked until the interview is settled',
  { srs: 'FR-25', type: 'Integration' });

/* ───────────────────────── B. ESS Resignation (two-actor) ───────────────────────── */
TC('ESS Resignation', '/ess/resignation', 'Submit resignation', 'An employee submits their own resignation (reason, proposed LWD, remarks, alt contact)',
  '1. Sign in as the employee\n2. Open My Workspace > Resignation\n3. Choose reason, proposed LWD, remarks, alt email/mobile\n4. Submit Resignation',
  'Resignation submitted; tentative LWD = submission + notice days; status/timeline shown',
  { ...A(`${SPEC} › E1; EssResignationPage.submit`), pre: 'Signed in as a test employee with ESS (Staff) access', srs: 'FR-01/§7.1', type: 'Positive' });
TC('ESS Resignation', '/ess/resignation', 'Reason required', 'Submit without a reason is blocked',
  '1. Leave Reason empty\n2. Submit', 'Validation: Reason required', { pre: 'Signed in as the employee', srs: '§7.1', type: 'Validation', sev: 'Minor' });
TC('ESS Resignation', '/ess/resignation', 'LWD not before submission', 'Proposed LWD cannot be before today (ESS sets min=today)',
  '1. Try a past proposed LWD', 'Blocked; ESS enforces min=today', { pre: 'Signed in as the employee', srs: 'RE-02/§7.1', type: 'Boundary', sev: 'Minor' });
TC('ESS Resignation', '/ess/resignation', 'Withdraw', 'The employee withdraws a pending resignation; the pipeline retires',
  '1. After submitting, open the resignation\n2. Withdraw\n3. Confirm', 'Resignation withdrawn; approval request retired; employee may submit again',
  { ...A(`${SPEC} › E3; EssResignationPage.withdraw`), pre: 'Signed in as the employee with a pending resignation', srs: 'FR-34', type: 'Positive' });
TC('ESS Resignation', '/ess/resignation', 'Duplicate submission blocked', 'A pending resignation blocks a second submission',
  '1. Submit a resignation\n2. Try to submit again', 'Second submission blocked (one exit in progress)', { pre: 'Signed in as the employee', srs: 'FR-03', type: 'Negative' });
TC('ESS Resignation', '/ess/exit-tasks', 'ESS own scope', 'ESS shows only the caller’s own records',
  '1. Sign in as the employee\n2. Open My Exit Tasks', 'Only the employee’s own exit tasks are shown', { pre: 'Signed in as the employee', srs: 'FR-42', type: 'Security' });

/* ───────────────────────── C. Initiate Exit (HR) ───────────────────────── */
TC('Initiate Exit', '/resignations', 'List page load', 'Resignations & Exits list renders with Initiate Exit, filters and paging',
  '1. Open /resignations', 'Heading, Initiate Exit button, search + Advanced Filters, columns and paging render',
  { ...A(`${SPEC} › I1; ResignationsListPage.open`), srs: '§11', type: 'UI', sev: 'Minor' });
TC('Initiate Exit', '/resignations', 'Raise Resignation', 'HR raises a Resignation for an employee (Employee select, Exit Type, LWD, Reason)',
  '1. Initiate Exit\n2. Pick Employee (by code), Exit Type = Resignation\n3. LWD, Reason\n4. Submit',
  'Exit raised; row shows Pending Approval (chain configured); detail page addressable by GUID',
  { ...A(`${SPEC} › I1; ResignationsListPage.raiseExit`), srs: 'FR-02/§7.2', type: 'Positive', sev: 'Critical' });
TC('Initiate Exit', '/resignations', 'In-progress employee omitted', 'An employee with an exit in progress is not offered in the Employee picker (FR-03)',
  '1. Initiate Exit\n2. Search for an employee who already has an exit', 'The employee is absent from the Employee select (guard enforced at selection)',
  { ...A(`${SPEC} › E2; ResignationsListPage.expectDuplicateExitRefused`), srs: 'FR-03', type: 'Negative' });
['Termination', 'Retirement', 'Absconding', 'Death', 'Permanent Disablement', 'End of Contract', 'Internship Completion', 'Other'].forEach(t =>
  TC('Initiate Exit', '/resignations', `Per-type fields: ${t}`, `Choosing Exit Type = ${t} reveals its required fields (§7.3)`,
    `1. Initiate Exit\n2. Pick an employee\n3. Exit Type = ${t}`, `The ${t}-specific fields render and are validated server-side`,
    { ...A(`${SPEC} › I1; ResignationsListPage.setExitType/fillPerType`), srs: '§7.3/FR-02', type: 'UI' }));
TC('Initiate Exit', '/resignations', 'Notice days prefill', 'Notice days prefill from rules and are editable (0–365, 0 = immediate)',
  '1. Pick an employee + type\n2. Observe Notice Days', 'Prefilled from Notice Period Rules; editable within 0–365', { srs: 'FR-10/§7.2', type: 'Functional' });
TC('Initiate Exit', '/resignations', 'Gratuity policy lock', 'A policy-blocked exit type shows gratuity pre-ticked and locked',
  '1. Pick a type whose policy = gratuity not eligible', 'Block-gratuity is pre-ticked and read-only, reason "Blocked by exit-type policy"',
  { ...A(`${SPEC} › I1; ResignationsListPage.gratuityLockedState`), srs: 'FR-09', type: 'Functional' });
TC('Initiate Exit', '/resignations', 'LWD no min/max (HR)', 'HR Initiate Exit LWD field accepts past/far-future dates (no bounds)',
  '1. Enter an LWD far in the past or 30+ years ahead\n2. Submit', 'Accepted (defect RE-02: HR-side LWD has no min/max, unlike ESS)',
  { srs: 'RE-02/§7.2', type: 'Negative', sev: 'Major', remarks: 'Reported defect RE-02 (High) — HR-side LWD lacks min/max' });

/* ───────────────────────── D. Approval ───────────────────────── */
TC('Approval', '/resignation/{guid}', 'Approval request raised', 'Raising an exit with a configured chain creates a pending approval',
  '1. Raise a Resignation (chain configured)', 'Status = Pending Approval; approval card shows the resolved approver',
  { ...A(`${SPEC} › I2; ResignationDetailPage`), srs: 'FR-04', type: 'Functional' });
TC('Approval', '/resignation-approval', 'Approver inbox', 'The resolved approver (reporting manager) sees the exit in Exit Approvals',
  '1. As the approver, open /resignation-approval', 'The pending exit is listed "Awaiting My Approval" at its level', { srs: 'FR-05', type: 'Functional' });
TC('Approval', '/resignation/{guid}', 'Retention gate for final approval', 'The FINAL approval is gated on Retention Discussion outcome = "Proceed with Exit"',
  '1. Click Approve (final level) before recording retention', 'App states the final approval needs a "Proceed with Exit" retention outcome first',
  { ...A(`${SPEC} › I2; ResignationDetailPage.recordRetention`), srs: 'FR-05/FR-34', type: 'Negative', remarks: 'Discovered by automation — non-obvious ordering' });
TC('Approval', '/resignation/{guid}', 'Approve → On Notice', 'Recording retention "Proceed with Exit" then approving activates the exit',
  '1. Record Retention = Proceed with Exit\n2. Approve (confirm the dialog)', 'Final approval sets On Notice; checklist materialises; F&F + payroll clearance seeded',
  { ...A(`${SPEC} › I2; ResignationDetailPage.approve`), srs: 'FR-06', type: 'Positive', sev: 'Critical' });
TC('Approval', '/resignation/{guid}', 'Reject stops exit', 'Rejecting an exit stops the pipeline',
  '1. Reject with a reason', 'Status = Rejected; pipeline stops', { srs: 'FR-05', type: 'Negative' });
TC('Approval', '/resignation/{guid}', 'Approve/Reject confirmation', 'Approve/Reject raise a confirmation dialog',
  '1. Click Approve / Reject', 'A confirm dialog appears; action commits only on confirm', { srs: 'RE-03', type: 'UI', sev: 'Minor', remarks: 'RE-03: earlier builds had no confirm/reason — re-verify' });
TC('Approval', '/resignation/{guid}', 'Revised LWD on approval', 'An approver may propose a revised LWD; the last proposal before final approval wins',
  '1. Approve with a revised LWD', 'The revised LWD becomes the Confirmed LWD', { srs: 'FR-07', type: 'Functional' });

/* ───────────────────────── E. HR Review ───────────────────────── */
TC('HR Review', '/resignation/{guid}', 'Record HR review (pre-approval)', 'HR records confirmed LWD, notice treatment, checklist template and remarks inline (Save Review)',
  '1. On a pending exit, set Confirmed LWD, Notice Treatment, Exit Checklist Template, HR Remarks\n2. Save Review',
  'Values persist; the picked template is consumed at approval to materialise the checklist',
  { ...A(`${SPEC} › I2/N1; ResignationDetailPage.saveHrReview`), srs: '§7.4', type: 'Positive' });
TC('HR Review', '/resignation/{guid}', 'Amendment needs correction reason', 'Post-approval HR review is read-only until "Edit HR Review"; amendments require a Correction Reason',
  '1. On an On-Notice exit, Edit HR Review\n2. Change Confirmed LWD\n3. Save Amendment', 'Save Amendment stays disabled until a Correction Reason is entered',
  { ...A(`${SPEC} › N1; ResignationDetailPage.saveHrReview (edit mode)`), srs: '§7.4', type: 'Functional', remarks: 'Discovered by automation' });
TC('HR Review', '/resignation/{guid}', 'Confirmed LWD recompute', 'Changing Confirmed LWD recomputes shortfall and syncs the non-completed F&F',
  '1. Change Confirmed LWD', 'Shortfall recomputes against the tentative date; F&F row updates', { srs: 'FR-07', type: 'Integration' });
TC('HR Review', '/resignation/{guid}', 'Frozen after F&F', 'Confirmed LWD change is refused once F&F is completed',
  '1. Complete F&F\n2. Try to change Confirmed LWD', 'Refused — Confirmed LWD frozen after F&F', { srs: 'FR-08', type: 'Negative' });
TC('HR Review', '/resignation/{guid}', 'Checklist template drives materialisation', 'The exit checklist materialises only when a template is picked (explicit or unambiguous auto)',
  '1. Approve without a resolvable template', 'No checklist materialises (ambiguous auto-select picks none)',
  { ...A(`${SPEC} › I2; ResignationDetailPage.setChecklistTemplate`), srs: 'FR-18', type: 'Integration', remarks: 'Discovered — pick template BEFORE approval' });

/* ───────────────────────── F. Notice management ───────────────────────── */
[['Extend', 'later only', 'FR-13'], ['Early Release', 'earlier only, not past', 'FR-13'], ['Waive', 'recovery = 0', 'FR-13'], ['Recover', 'amount > 0', 'FR-13']].forEach(([a, rule, srs]) =>
  TC('Notice management', '/resignation/{guid}', `Notice action: ${a}`, `${a} notice action (${rule}) with mandatory remarks`,
    `1. On an On-Notice exit (pre-F&F), apply ${a}\n2. Enter remarks`, `${a} applied per rule (${rule}); effective LWD updates`,
    { srs, type: 'Functional' }));
TC('Notice management', '/resignation/{guid}', 'Blocked after F&F/closure', 'All notice actions are refused after F&F completion or closure',
  '1. Complete F&F\n2. Try any notice action', 'All notice actions refused (controls removed)', { srs: 'FR-14', type: 'Negative' });

/* ───────────────────────── G. Checklist execution ───────────────────────── */
TC('Exit Tasks', '/exit-tasks/{guid}', 'Checklist materialised', 'On final approval the checklist materialises from the template (+ one asset item per asset)',
  '1. Open the exit task board after approval', 'Per-exit items exist (KT / clearance / other) with due dates from the effective LWD',
  { ...A(`${SPEC} › N2; ExitTaskBoardPage.open/count`), srs: 'FR-20', type: 'Functional', sev: 'Critical' });
TC('Exit Tasks', '/exit-tasks/{guid}', 'Complete / Waive items', 'Owners/HR complete or waive checklist items (Waive needs a reason) via the confirm dialog',
  '1. Complete an item\n2. Waive another with a reason', 'Items move to Completed / Waived; linked tasks close',
  { ...A(`${SPEC} › N2; ExitTaskBoardPage.settleAll`), srs: 'FR-21', type: 'Positive' });
TC('Exit Tasks', '/exit-tasks/{guid}', 'Add ad-hoc item', 'HR adds an ad-hoc item with a due date inside approval…LWD',
  '1. Add Task\n2. Title, kind, owner, due\n3. Save', 'Ad-hoc item is listed', { ...A(`${SPEC} › N2; ExitTaskBoardPage.addAdhoc`), srs: 'FR-22', type: 'Positive', sev: 'Minor' });
TC('Exit Tasks', '/exit-tasks/{guid}', 'Settled item immutable', 'A settled item (Completed/Waived/N-A) exposes no Edit/Delete',
  '1. Settle an item\n2. Look for Edit/Delete', 'None available (server-enforced immutability)',
  { ...A(`${SPEC} › N2; ExitTaskBoardPage.expectSettledImmutable`), srs: 'FR-22/§8', type: 'Negative' });
TC('Exit Clearance', '/exit-clearance', 'Clearance board', 'Cross-exit clearance board shows the employee’s open items with Kind filter and search',
  '1. Open /exit-clearance\n2. Search by employee code', 'Open items for the employee are listed; Waive/N-A available',
  { ...A(`${SPEC} › N3; ExitClearancePage.searchFor`), srs: '§11', type: 'UI' });

/* ───────────────────────── H. Exit Interview ───────────────────────── */
TC('Exit Interview', '/exit-interview/{guid}', 'Schedule + record answers', 'Schedule an interview (template, mode, date, interviewer) and record answers per question type',
  '1. Open the interview\n2. Schedule (In Person, date, interviewer)\n3. Record Rating/Text/Yes-No/Choice answers\n4. Complete',
  'Interview scheduled and completed with recorded answers', { ...A(`${SPEC} › N4; ExitInterviewPage.schedule/recordAnswers`), srs: 'FR-24', type: 'Positive' });
TC('Exit Interview', '/exit-interview/{guid}', 'Form mode', 'Form mode needs no date/interviewer and is answered by the employee via ESS',
  '1. Schedule mode = Form', 'No date/interviewer required; employee answers via ESS', { srs: 'FR-24/§7.6', type: 'Functional' });
TC('Exit Interview', '/exit-interview/{guid}', 'Date bounds', 'Non-Form interview date is today…LWD, never past',
  '1. Try a past interview date', 'Rejected (today…LWD)', { srs: 'FR-24', type: 'Boundary', sev: 'Minor' });
TC('Exit Interview', '/exit-interview/{guid}', 'Skip with reason', 'An interview can be skipped with a reason',
  '1. Skip\n2. Enter a reason', 'Interview marked Skipped', { ...A(`${SPEC} › N4; ExitInterviewPage.skip`), srs: 'FR-25', type: 'Functional', sev: 'Minor' });
TC('Exit Interview', '/exit-interview/{guid}', 'Not reschedulable', 'A completed/skipped interview cannot be rescheduled',
  '1. On a settled interview, look for Reschedule', 'No reschedule control (settled is final)', { ...A(`${SPEC} › N4; ExitInterviewPage.expectNotReschedulable`), srs: 'FR-25', type: 'Negative' });

/* ───────────────────────── I. F&F ───────────────────────── */
TC('F&F Settlement', '/fnf/{guid}', 'Calculate settlement', '"Calculate settlement" fills data-derived figures from salary/leave/payroll',
  '1. Open the F&F worksheet\n2. Calculate settlement', 'Notice recovery, leave encashment, salary payable, bonus filled with notes; no save yet',
  { ...A(`${SPEC} › N5; FnfPage.calculate`), srs: 'FR-27/§7.7', type: 'Functional' });
TC('F&F Settlement', '/fnf/{guid}', 'Ad-hoc components', 'Ad-hoc earning/deduction lines (labelled, amount ≥ 0) are added and saved',
  '1. Add an earning + a deduction line (labelled)\n2. Save inputs', 'Lines saved; net payable updates (header ± components)',
  { ...A(`${SPEC} › N5; FnfPage.addComponent/save`), srs: 'FR-26/§7.7', type: 'Positive' });
TC('F&F Settlement', '/fnf/{guid}', 'Mark completed (clearance-gated)', '"Mark worksheet completed" is disabled until ALL clearance items are settled, then freezes the record',
  '1. Settle all clearance\n2. Mark worksheet completed', 'Completion requires all clearance settled; on completion the worksheet is locked',
  { ...A(`${SPEC} › N5; FnfPage.markCompleted`), srs: 'FR-28/§7.7', type: 'Functional', sev: 'Critical', remarks: 'Impl requires ALL clearance settled (SRS §7.7 says mandatory only)' });
TC('F&F Settlement', '/fnf/{guid}', 'Locked after completion', 'A completed F&F refuses further saves, LWD changes and notice actions',
  '1. After completion, try to edit figures / LWD / notice', 'All refused; status Completed; inputs disabled',
  { ...A(`${SPEC} › N5; FnfPage.assertLocked`), srs: 'FR-28/§8', type: 'Negative' });
TC('F&F Settlement', '/fnf/{guid}', 'Amounts ≥ 0', 'Negative amounts are rejected',
  '1. Enter a negative component amount', 'Rejected (every amount ≥ 0)', { srs: 'FR-26', type: 'Boundary', sev: 'Minor' });

/* ───────────────────────── J. Letters ───────────────────────── */
TC('Exit Letters', '/resignation/{guid}', 'Issuable set per type', 'The type offers only its issuable letters (e.g. Resignation = Relieving/Experience/Service Certificate)',
  '1. Open the Exit Letters card', 'Only the type’s issuable letters are offered in the template picker',
  { ...A(`${SPEC} › N6; ResignationDetailPage.issuableLetters`), srs: 'FR-29', type: 'Functional' });
TC('Exit Letters', '/resignation/{guid}', 'Issue required letter — BLOCKER', 'Issuing a required closure letter (Relieving/Experience) fails with a server error',
  '1. Pick a letter template\n2. Preview\n3. Issue Letter', 'DEFECT: server error "Oops — Error Code" (varies: EBAMNL/3SNU93/09B8NV); letter not issued; closure gate stays open',
  { ...A(`${SPEC} › N6; ResignationDetailPage.generateLetter`, `Blocked (${TODAY})`), srs: 'FR-29/RE-01', type: 'Negative', sev: 'Critical', pri: 'High',
    actual: 'Issue Letter raises an "Oops something went wrong" dialog with a random error code; the letter is not generated.',
    remarks: 'BLOCKER — likely incompletely-configured Relieving/Experience letter templates in the Letter module; gates exit closure. See Findings.' });
TC('Exit Letters', '/resignation/{guid}', 'Preview before issue', 'A letter can be previewed before issuing',
  '1. Pick a template\n2. Preview', 'The letter preview renders', { srs: 'FR-29', type: 'UI', sev: 'Minor' });

/* ───────────────────────── K. Closure ───────────────────────── */
TC('Closure', '/resignation/{guid}', 'Readiness panel', 'The readiness panel mirrors all close gates (approval, checklist, F&F, letters, interview, LWD)',
  '1. Open the exit detail\n2. Read the readiness panel', 'All gates listed with pass/open state',
  { ...A(`${SPEC} › X1; ResignationDetailPage.readinessText`), srs: 'FR-32', type: 'UI' });
TC('Closure', '/resignation/{guid}', 'Close validates all gates', 'Close Exit validates every gate at once and reports all open blockers in one message',
  '1. Click Close Exit with gates open', 'Close is disabled / reports every open gate (e.g. LWD not reached, letters not issued) at once',
  { ...A(`${SPEC} › X1; ResignationDetailPage.closeExit`, `Blocked (${TODAY})`), srs: 'FR-32', type: 'Functional', sev: 'Critical',
    remarks: 'In the automated run the only remaining gate is the letter-issuance failure (see Findings); all other gates pass.' });
TC('Closure', '/resignation/{guid}', 'LWD-not-reached gate', 'Close is refused while the effective LWD is in the future',
  '1. Try to close before the effective LWD', 'Refused: "last working day has not been reached — close on/after that day or record an early release"',
  { srs: 'FR-32/§8', type: 'Negative' });
TC('Closure', '/resignation/{guid}', 'Close ends employment', 'On success closing ends the employment record, stamps ClosedOn and rehire data',
  '1. With all gates passed, Close Exit\n2. Confirm', 'Employment ends; ClosedOn stamped; exit frozen (letters excepted)',
  { srs: 'FR-33', type: 'Positive', sev: 'Critical', exec: `Blocked (${TODAY})`, remarks: 'Not reachable in automation until the letter blocker is fixed' });

/* ───────────────────────── L. Retention / Rehire ───────────────────────── */
TC('Retention', '/resignation/{guid}', 'Record retention outcome', 'HR records a retention discussion; outcomes Retain / Proceed with Exit / Hold',
  '1. Record Retention (conducted, date, outcome, participants, summary)\n2. Save Retention', 'Outcome saved; "Retain" closes the exit as Retained and keeps the employee active',
  { ...A(`${SPEC} › I2; ResignationDetailPage.recordRetention`), srs: 'FR-34', type: 'Functional' });
TC('Rehire', '/resignation/{guid}', 'Record rehire eligibility', 'Rehire eligibility is recorded; remarks mandatory for negative/conditional',
  '1. On a leaving exit, set Rehire Eligibility + remarks\n2. Save', 'Recorded; remarks required for "Not eligible"/"With conditions"',
  { ...A(`${SPEC} › N7; ResignationDetailPage.recordRehire`), srs: 'FR-35', type: 'Functional' });

/* ───────────────────────── M. Exit Watch ───────────────────────── */
TC('Exit Watch', '/exit-watch', 'Watchlist tabs', 'Approaching Retirement / Absconding / Contract Expiry / Internship Ending tabs render',
  '1. Open /exit-watch\n2. Switch each tab', 'Each tab lists rule-based candidates; a window selector (6/12/24 months) applies',
  { ...A(`${SPEC} › R2; ExitWatchPage.openTab`), srs: 'FR-36', type: 'UI' });
TC('Exit Watch', '/exit-watch', 'Initiate prefilled', 'One click pre-fills Initiate Exit from a watchlist row',
  '1. Click Initiate Retirement on a row', 'Initiate Exit opens pre-filled with the employee/type', { srs: 'FR-36', type: 'Functional', sev: 'Minor' });

/* ───────────────────────── N. Dashboard & Reports ───────────────────────── */
TC('Exit Dashboard', '/exit-dashboard', 'Tiles + deep-links', 'Scoped tiles render and deep-link to filtered lists; Top Reasons / Exits by Type',
  '1. Open /exit-dashboard\n2. Click a tile', 'Tiles render; clicking deep-links to the matching filtered /resignations list',
  { ...A(`${SPEC} › R1; ExitDashboardPage.tiles/tileDeepLinks`), srs: 'FR-39', type: 'UI' });
TC('Exit Reports', '/exit-reports', 'Run all 13 reports', 'Each of the 13 reports runs and renders without error',
  '1. Open /exit-reports\n2. Run each report', 'All 13 reports render; Export Excel is available',
  { ...A(`${SPEC} › R3; ExitReportsPage.runReport`), srs: 'FR-40/§12', type: 'Functional' });
TC('Exit Reports', '/exit-reports', 'Filters + export', 'Date range (default last 12 months), branch/dept/designation/type filters; Excel export matches the screen',
  '1. Apply filters\n2. Export Excel', 'Report respects filters and scope; Excel columns match the screen', { srs: 'FR-40/§12', type: 'Functional', sev: 'Minor' });

/* ───────────────────────── O. Access control / NFR ───────────────────────── */
TC('Access Control', '/resignations', 'Branch + Department scope', 'Every list/read/write enforces the caller’s Branch + Department scope',
  '1. As a scoped user, open the lists/records', 'Only rows inside the caller’s branch+department scope are visible', { srs: 'FR-41/§5', type: 'Security', sev: 'Critical' });
TC('Access Control', '/resignation/{guid}', 'GUID addressing / IDOR', 'Records are addressed by GUID; out-of-scope/foreign-tenant access is denied ("not found")',
  '1. Request a record outside scope by GUID', 'Denied without leaking existence', { srs: 'FR-41/§14', type: 'Security', sev: 'Critical' });
TC('Access Control', '/resignations', 'Missing role → 403', 'A user without the required role gets 403',
  '1. As a user lacking ExitManagement, open a write action', '403 / Access Denied', { srs: '§10', type: 'Security' });
TC('Non-Functional', '/resignations', 'Blazor render + paging', 'Pages render under the Blazor WASM SPA with server-side paging on large grids',
  '1. Open large lists\n2. Page through', 'Grids page server-side; loading/no-data states shown', { srs: '§14', type: 'NFR', sev: 'Minor' });
TC('Non-Functional', '/resignation/{guid}', 'Audit trail', 'Every workflow action records an employment-history event with actor/time',
  '1. Perform workflow actions\n2. Check history', 'History shows each action with actor and timestamp', { srs: '§14', type: 'NFR', sev: 'Minor' });

/* ───────────────────────── Findings (defects/observations) ───────────────────────── */
const FINDINGS = [
  ['F-01', 'Critical', 'Exit letter issuance fails (server error)',
    'Issuing the required Relieving/Experience closure letters throws "Oops something went wrong — Error Code: <varies: EBAMNL / 3SNU93 / 09B8NV>" even with the LWD reached and F&F completed. The templates appear in the picker but error on generation, so the required-letter close gate never clears and the exit cannot be closed.',
    'Likely incompletely-configured Relieving/Experience letter templates in the Letter module (random error codes = unhandled exceptions). Seed/fix the templates, then re-run N6 + X1.',
    'TC-EXT (Exit Letters — Issue), TC-EXT (Closure)', 'FR-29 / FR-32 / RE-01'],
  ['F-02', 'Medium', 'HR-side Initiate Exit LWD has no min/max',
    'The HR Initiate Exit "Last Working Day" field accepts far-past and far-future dates (no bounds), unlike the ESS form which sets min=today.',
    'Add min (submission date) / sensible max to the HR LWD field.', 'TC-EXT (Initiate — LWD no min/max)', 'RE-02 / §7.2'],
  ['F-03', 'Low', 'F&F completion requires ALL clearance settled',
    'F&F "Mark worksheet completed" is disabled until every clearance item is settled, whereas SRS §7.7 says completion requires only the mandatory clearance items.',
    'Confirm intended behaviour; align SRS or implementation.', 'TC-EXT (F&F — Mark completed)', '§7.7'],
  ['F-04', 'Info', 'Final approval gated on retention "Proceed with Exit"',
    'The final-level approval cannot be given until HR records a Retention Discussion with outcome "Proceed with Exit" — a non-obvious ordering dependency (not called out in the workflow narrative).',
    'Document the ordering; consider surfacing the prerequisite earlier.', 'TC-EXT (Approval — Retention gate)', 'FR-05 / FR-34'],
  ['F-05', 'Info', 'SRS lists 6 exit types; 9 are live',
    'The live tenant offers 9 exit types (adds Permanent Disablement, End of Contract, Internship Completion); SRS §3 documents 6.',
    'Update the SRS to match the as-built set.', 'TC-EXT (Initiate — per-type fields)', '§3'],
];

/* ───────────────────────── Build workbook ───────────────────────── */
async function build() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HRMS QA Automation'; wb.created = new Date();
  const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  const HEAD_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' };
  const BODY_FONT = { size: 10, name: 'Arial' };
  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // Summary / Read Me
  const sum = wb.addWorksheet('Summary', { properties: { defaultColWidth: 22 } });
  sum.mergeCells('A1:D1'); sum.getCell('A1').value = 'Resignation & Exit Management — Test Case Document';
  sum.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F3864' }, name: 'Arial' };
  const meta = [
    ['Module', 'HRMS — Resignation & Exit Management'],
    ['Tenant', `${BASE} (company pbhrms), admin amit (ExitManagement)`],
    ['SRS', 'Resignation-Exit-Management-SRS.pdf v1.0 (11-Aug-2026, as-built)'],
    ['Automation', 'hrms/tests/11_resignation/resignation_module.spec.js + hrms/pages/resignation/* (npm run hrms:resignation)'],
    ['Generated', TODAY],
    ['', ''],
    ['Total test cases', String(cases.length)],
    ['Automated (verified green)', String(cases.filter(c => c.auto === 'Automated' && /Passed/.test(c.exec)).length)],
    ['Automated but blocked (app defect)', String(cases.filter(c => /Blocked/.test(c.exec)).length)],
    ['Manual / not yet automated', String(cases.filter(c => c.auto !== 'Automated').length)],
    ['Open findings', String(FINDINGS.length) + ' (see Findings sheet — F-01 Critical blocker)'],
  ];
  meta.forEach(([k, v], i) => { const r = sum.getRow(i + 3); r.getCell(1).value = k; r.getCell(2).value = v; r.getCell(1).font = { bold: true, name: 'Arial', size: 10 }; r.getCell(2).font = BODY_FONT; });
  sum.getColumn(1).width = 30; sum.getColumn(2).width = 90;

  // Legend
  const leg = wb.addWorksheet('Legend');
  leg.addRow(['Field', 'Meaning']);
  [['Test ID', 'TC-EXT-NNN (EXT = Resignation & Exit, matches HRMS_Test_Case_Report.xlsx)'],
   ['Type', 'UI / Positive / Negative / Functional / Validation / Boundary / Integration / Security / NFR'],
   ['Severity', 'Critical / Major / Minor / Trivial'], ['Priority', 'High / Medium / Low'],
   ['Automation Status', 'Automated (covered by the spec) / Not Automated (manual) / Out of Scope'],
   ['Automation Reference', 'The spec step + page-object method that covers the case'],
   ['Execution Status', `Passed (${TODAY}) = automated + green · Blocked = app defect prevents it · Not Executed = manual, pending`],
   ['SRS Ref', 'FR-xx / §x from the SRS, or RE-xx finding ids from prior manual sweeps']].forEach(r => leg.addRow(r));
  leg.getColumn(1).width = 22; leg.getColumn(2).width = 110;
  leg.getRow(1).font = HEAD_FONT; leg.getRow(1).fill = HEAD_FILL;

  // Test Cases
  const ws = wb.addWorksheet('Test Cases', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  ws.columns = COLS.map(([header, width]) => ({ header, width }));
  const hr = ws.getRow(1); hr.font = HEAD_FONT; hr.fill = HEAD_FILL; hr.alignment = { vertical: 'middle', wrapText: true }; hr.height = 28;
  for (const c of cases) {
    const steps2repro = `${c.pre} → ${c.steps.replace(/\n/g, ' → ')}`;
    const row = ws.addRow([c.id, c.sub, c.scenario, c.desc, c.pre, c.data, c.steps, steps2repro, c.expected,
      c.type, c.sev, c.pri, c.auto, c.autoRef, c.exec, c.actual, c.by, c.route, c.remarks, c.srs]);
    row.font = BODY_FONT; row.alignment = { vertical: 'top', wrapText: true };
    row.eachCell(cell => { cell.border = border; });
    // tint automated-green / blocked rows
    if (/Blocked/.test(c.exec)) row.getCell(15).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
    else if (/Passed/.test(c.exec)) row.getCell(15).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
  }
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLS.length)}1` };

  // Traceability (SRS → TC)
  const tr = wb.addWorksheet('Traceability');
  tr.addRow(['SRS Ref', 'Test IDs']); tr.getRow(1).font = HEAD_FONT; tr.getRow(1).fill = HEAD_FILL;
  const bySrs = {};
  cases.forEach(c => (c.srs || '—').split('/').map(s => s.trim()).forEach(s => (bySrs[s] = bySrs[s] || []).push(c.id)));
  Object.keys(bySrs).sort().forEach(s => tr.addRow([s, bySrs[s].join(', ')]));
  tr.getColumn(1).width = 16; tr.getColumn(2).width = 80; tr.eachRow(r => r.alignment = { wrapText: true, vertical: 'top' });

  // Findings
  const fs = wb.addWorksheet('Findings');
  fs.addRow(['ID', 'Severity', 'Title', 'Description', 'Recommendation', 'Related TCs', 'SRS/Ref']);
  fs.getRow(1).font = HEAD_FONT; fs.getRow(1).fill = HEAD_FILL;
  FINDINGS.forEach(f => fs.addRow(f));
  [8, 12, 34, 60, 50, 24, 14].forEach((w, i) => fs.getColumn(i + 1).width = w);
  fs.eachRow((r, i) => { r.font = i === 1 ? HEAD_FONT : BODY_FONT; r.alignment = { wrapText: true, vertical: 'top' };
    if (i > 1 && /Critical/.test(r.getCell(2).value)) r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } }; });

  await wb.xlsx.writeFile(OUT);
  console.log(`Wrote ${OUT}`);
  console.log(`  ${cases.length} test cases · ${cases.filter(c => c.auto === 'Automated').length} automated · ${FINDINGS.length} findings`);
}
build().catch(e => { console.error(e); process.exit(1); });
