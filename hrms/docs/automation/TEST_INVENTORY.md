# HRMS Automation — Test Inventory (for review before push)

**App:** https://hrms-test.progbiz.in · company `pbhrms` · admin `amit` (password from `.env`, never in code)
**Scope:** positive scenarios only · every step asserts · **one linear run over every HRMS page, in sidebar order, in ONE browser tab**.

## The complete run
```bash
HEADED=1 npx playwright test -c hrms/playwright.config.js hrms/tests/00_linear --workers=1 --retries=0
```
- `hrms/tests/00_linear/hrms_linear_run.spec.js` — ONE test that walks `hrms/data/hrmsPages.js` (128 HRMS pages, live sidebar order) in a single tab. The browser is never closed between pages.
- **Every page** gets the same check (`flows/pageCheck.js`): opened once (reloaded only if it comes up blank) → not bounced to login / not a missing page → no application error → loading spinners clear → a page heading → every list shows its headers and its rows (an empty list is noted, not failed).
- **Pages whose main job is adding something** do it **once** (`flows/linearActions.js`, 22 actions), all for the run's **one employee**, created on the Employee page (`flows/runEmployee.js`).
- **Payroll, Attendance, Resignation & Exit = base only** (page checks, no data) — owned by teammates.
- A failing page is recorded (screenshot + error) and the walk continues in the same tab; the run is marked failed at the end.
- **Evidence** (only when something fails): `reports/hrms-evidence/<run>/index.html` — failure screenshots per page, the employee's own screen + recording when they were acting, the **whole-run video** (one continuous recording), trace, `page-results.json`.

Useful variants:
- Read-only (checks only, adds nothing): `HRMS_LINEAR_READONLY=1`
- Only some pages: `HRMS_PAGES="leave-approval,offer-list"` · Resume from page 52: `HRMS_FROM=52`

## Latest result (2026-10-09)
- Full run: **128 pages — 124 passed first time**; 4 failures were all automation issues, fixed and re-run green the same day:
  011 Duty Handover (date conflict on a reused employee → now uses the run employee), 026 Onboarding Templates and 049 Leave Types ("is it listed" matched a hidden element → now visible-only), 056 Leave Approval (reloaded My Leave a second time and it hung on the app spinner → now uses the open page).
- Run employee: **Riya Iyer (pbhrms0349)** · candidate **Gokul Kamath (JOB0086)** · referral **Lakshmi Raghavan → Hired, reward Pending** · ticket **TKT-261009-001 → Resolved**.

## Every page, in order
| # | Section | Page | Route | Add data once |
|---|---|---|---|---|
| 001 | Core HR | Employee | `employees` | Create the run's ONE employee (login, Reports To Amit) — used by every later page |
| 002 | Core HR | Worker Directory | `worker-directory` | Find the run employee in the directory; complete their profile (department, blood group, nationality, address) |
| 003 | Core HR | Document Compliance | `document-compliance` | — (check only) |
| 004 | Core HR | HR Reminders | `hrms/reminder-rules` | — (check only) |
| 005 | Core HR | Employee Excel Import | `upload-employee` | — (check only) |
| 006 | Core HR | Letter Templates | `letters/templates` | Letter template "Experience Letter (Auto …)" |
| 007 | Core HR | Generate Letter | `letters/generate` | Generate an appointment letter for the run employee (e-mail off) |
| 008 | Core HR | Letterheads | `letters/letterheads` | — (check only) |
| 009 | Core HR | Merge Fields | `letters/fields` | — (check only) |
| 010 | Core HR | Approval Config | `approval/config` | — (check only) |
| 011 | Core HR | Duty Handover | `employee-handover` | Duty handover: run employee → Amit, unique future window |
| 012 | Recruitment | Job Requisitions | `requisition-list` | Raise a requisition, then approve it in Recruitment Approvals |
| 013 | Recruitment | Job Board | `vacancy-list` | Job opening + a candidate applying to it (with résumé) |
| 014 | Recruitment | Job Applications | `job-applications-list` | — (check only) |
| 015 | Recruitment | Assessments | `assessment-list` | — (check only) |
| 016 | Recruitment | Interview Schedules | `interview-schedules` | Interview round, interview booked, feedback 4/5 Proceed → Completed |
| 017 | Recruitment | Offers | `offer-list` | Offer → approved → e-mailed (@example.com) → accepted |
| 018 | Recruitment | Offer Acceptance | `offer-acceptance` | Pre-boarding invite e-mailed (@example.com) → Invited |
| 019 | Recruitment | My Approvals | `recruitment/approvals` | — (check only) |
| 020 | Recruitment | Recruitment Dashboard | `recruitment-dashboard` | — (check only) |
| 021 | Recruitment | Pipeline Board | `recruitment-pipeline` | — (check only) |
| 022 | Recruitment | Talent Pool | `talent-pool` | — (check only) |
| 023 | Recruitment | Interview Rounds | `interview-rounds` | — (check only) |
| 024 | Recruitment | Referral Dashboard | `ess/referral/admin` | — (check only) |
| 025 | Recruitment | Reward Policy | `ess/referral/admin/policy` | — (check only) |
| 026 | Onboarding | Onboarding Templates | `onboarding-templates` | Onboarding template with 1 stage + 1 required task |
| 027 | Onboarding | Onboarding Pipeline | `onboarding-pipeline` | — (check only) |
| 028 | Onboarding | Pre-boarding Approvals | `preboarding-approvals` | — (check only) |
| 029 | Onboarding | Onboarding Tasks | `onboarding-tasks` | — (check only) |
| 030 | Onboarding | Onboarding Employees | `onboarding-employees` | — (check only) |
| 031 | Onboarding | Blacklisted Employees | `blacklisted-employees` | — (check only) |
| 032 | Onboarding | Training Courses | `training-courses` | Training course "Workplace Safety Induction (Auto …)" |
| 033 | Onboarding | Probation Templates | `hrms/probation-templates` | — (check only) |
| 034 | Onboarding | Probation Dashboard | `hrms/probation` | — (check only) |
| 035 | Onboarding | Appointment Letters | `hrms/appointment-letters` | — (check only) |
| 036 | Onboarding | Confirmation Letters | `hrms/confirmation-letters` | — (check only) |
| 037 | Onboarding | Extension Letters | `hrms/extension-letters` | — (check only) |
| 038 | Onboarding | Hold & Dropped Report | `onboarding-hold-dropped` | — (check only) |
| 039 | Onboarding | Training Assessment Report | `training-assessment-report` | — (check only) |
| 040 | Onboarding | Probation Report | `hrms/probation-report` | — (check only) |
| 041 | Attendance | Shifts & Rules | `shifts` | — (check only) |
| 042 | Attendance | Shift Roster | `shift-roster` | — (check only) |
| 043 | Attendance | Regularization | `regularization` | — (check only) |
| 044 | Attendance | Late In / Early Out Requests | `late-early-requests` | — (check only) |
| 045 | Attendance | Overtime Approval | `overtime-approval` | — (check only) |
| 046 | Attendance | Attendance Finalization | `attendance-finalization` | — (check only) |
| 047 | Attendance | Geofences | `geofences` | — (check only) |
| 048 | Attendance | Test Data Generator | `attendance-test-data` | — (check only) |
| 049 | Leave | Leave Types | `leave-types` | Leave type (letters-only name, e.g. "Study Leave Mysuru") |
| 050 | Leave | Leave Patterns | `leave-patterns` | Leave pattern with effective dates |
| 051 | Leave | Leave Policy | `leave-policy` | — (check only) |
| 052 | Leave | Leave Assignment | `leave-assignment-list` | Assign Standard Staff to the run employee |
| 053 | Leave | Holidays | `holiday-list` | Holiday (28 Dec 2026) |
| 054 | Leave | Holiday Assignment | `holiday-assignment-list` | Assign that holiday to Main Branch |
| 055 | Leave | Apply Leave for Employee | `leave-request-on-behalf` | Apply + approve 1 day Casual Leave for the run employee (balance −1) |
| 056 | Leave | Leave Approval | `leave-approval` | Run employee signs in and applies → Amit approves → employee sees Approved (balance −1) |
| 057 | Leave | Comp-Off Approval | `comp-off-approval` | — (check only) |
| 058 | Leave | Leave Ledger | `leave-ledger` | — (check only) |
| 059 | Leave | Attendance Sync | `leave-attendance-sync` | — (check only) |
| 060 | Leave | Leave Reports | `leave-reports` | — (check only) |
| 061 | Leave | Leave Calendar | `leave-calendar` | — (check only) |
| 062 | Payroll | Payroll Policies | `payroll/policies` | — (check only) |
| 063 | Payroll | Salary Components | `payroll/components` | — (check only) |
| 064 | Payroll | Salary Structures | `payroll/structures` | — (check only) |
| 065 | Payroll | Employee Salary | `payroll/employee-salary` | — (check only) |
| 066 | Payroll | Salary Revisions | `payroll/salary-revisions` | — (check only) |
| 067 | Payroll | Salary Advances | `payroll/salary-advance` | — (check only) |
| 068 | Payroll | Reimbursements | `payroll/adhoc` | — (check only) |
| 069 | Payroll | Opening Balances | `payroll/opening-balances` | — (check only) |
| 070 | Payroll | Consultant Invoices | `payroll/consultant-invoices` | — (check only) |
| 071 | Payroll | Consultant Payout Advice | `payroll/consultant-payout-advice` | — (check only) |
| 072 | Payroll | TDS Sections | `payroll/tds-sections` | — (check only) |
| 073 | Payroll | Payroll Checklist | `payroll/checklist` | — (check only) |
| 074 | Payroll | Off-Cycle Payments | `payroll/off-cycle` | — (check only) |
| 075 | Payroll | Payroll Runs | `payroll/runs` | — (check only) |
| 076 | Payroll | Payslips | `payroll/payslips` | — (check only) |
| 077 | Payroll | Bank Transfers | `payroll/bank-files` | — (check only) |
| 078 | Payroll | Bank Reconciliation | `payroll/bank-recon` | — (check only) |
| 079 | Payroll | Settlement Recoveries | `payroll/settlement-recoveries` | — (check only) |
| 080 | Payroll | Held Salary Payments | `payroll/held-salary` | — (check only) |
| 081 | Payroll | Statutory Configuration | `payroll/statutory-config` | — (check only) |
| 082 | Payroll | Statutory Returns | `payroll/statutory-returns` | — (check only) |
| 083 | Payroll | TDS Challans | `payroll/tds-challans` | — (check only) |
| 084 | Payroll | Tax Declarations | `payroll/tax-declarations` | — (check only) |
| 085 | Payroll | Previous Employer (12B) | `payroll/previous-employer` | — (check only) |
| 086 | Payroll | Regime Comparison | `payroll/regime-comparison` | — (check only) |
| 087 | Payroll | Payroll Dashboard | `payroll/dashboard` | — (check only) |
| 088 | Payroll | Payroll Report Pack | `payroll/reports` | — (check only) |
| 089 | Payroll | Audit Trail | `payroll/audit-trail` | — (check only) |
| 090 | Payroll | Outlier Alerts | `payroll/outliers` | — (check only) |
| 091 | Payroll | Form 16 & Certificates | `payroll/statements` | — (check only) |
| 092 | Resignation & Exit | Exit Dashboard | `exit-dashboard` | — (check only) |
| 093 | Resignation & Exit | Exit Reports | `exit-reports` | — (check only) |
| 094 | Resignation & Exit | Resignations & Exits | `resignations` | — (check only) |
| 095 | Resignation & Exit | F&F Settlements | `fnf-settlements` | — (check only) |
| 096 | Resignation & Exit | Exit Watch | `exit-watch` | — (check only) |
| 097 | Resignation & Exit | Exit Approvals | `resignation-approval` | — (check only) |
| 098 | Resignation & Exit | Exit Clearance | `exit-clearance` | — (check only) |
| 099 | Resignation & Exit | Exit Checklist Templates | `exit-checklist-templates` | — (check only) |
| 100 | Resignation & Exit | Exit Interview Templates | `exit-interview-templates` | — (check only) |
| 101 | Resignation & Exit | Notice Period Rules | `notice-period-rules` | — (check only) |
| 102 | Resignation & Exit | Exit Type Settings | `exit-type-settings` | — (check only) |
| 103 | Resignation & Exit | Exit Reasons | `resignation-reasons` | — (check only) |
| 104 | My Workspace | Workspace | `ess` | — (check only) |
| 105 | My Workspace | Profile | `ess/profile` | — (check only) |
| 106 | My Workspace | Digital ID | `ess/digital-id` | — (check only) |
| 107 | My Workspace | Directory | `ess/directory` | — (check only) |
| 108 | My Workspace | Requests | `ess/requests` | — (check only) |
| 109 | My Workspace | Approvals | `ess/approvals` | — (check only) |
| 110 | My Workspace | Leave | `ess/leave` | — (check only) |
| 111 | My Workspace | Handover | `my-handover` | — (check only) |
| 112 | My Workspace | Onboarding Tasks | `my-onboarding-tasks` | — (check only) |
| 113 | My Workspace | Trainings | `my-trainings` | — (check only) |
| 114 | My Workspace | Resignation | `ess/resignation` | — (check only) |
| 115 | My Workspace | Exit Tasks | `ess/exit-tasks` | — (check only) |
| 116 | My Workspace | Exit Interview | `ess/exit-interview` | — (check only) |
| 117 | My Workspace | Attendance | `ess/attendance` | — (check only) |
| 118 | My Workspace | Shift | `ess/my-shift` | — (check only) |
| 119 | My Workspace | Locations | `ess/locations` | — (check only) |
| 120 | My Workspace | Documents | `ess/documents` | — (check only) |
| 121 | My Workspace | Letters | `ess/letters` | — (check only) |
| 122 | My Workspace | Pay | `ess/payslips` | — (check only) |
| 123 | My Workspace | Tax | `ess/my-tax` | — (check only) |
| 124 | My Workspace | Previous Employer (12B) | `ess/previous-employer` | — (check only) |
| 125 | My Workspace | Probation | `ess/probation` | — (check only) |
| 126 | Helpdesk | Support Tickets | `ess/helpdesk/my-tickets` | Raise a helpdesk ticket |
| 127 | Referral | Refer & Earn | `ess/referral` | Referral → assign opening → accept → interview → offer accepted → Hired → reward Pending (never paid) |
| 128 | Helpdesk | Helpdesk Dashboard | `ess/helpdesk/admin` | Ticket → In Progress → internal note → Resolved |

## Data a complete run creates (all disposable, realistic names + "(Auto DD-Mon HH.MM.SS)")
ONE employee (then profile, leave pattern, 2 approved leaves, a duty handover, a letter) · letter template · requisition (approved) · job opening · 2 candidates (one direct, one referred) with interviews and accepted offers · onboarding template · training course · leave type, leave pattern, holiday + assignment · 1 helpdesk ticket (resolved) · 1 referral (Hired, reward Pending).
**E-mails sent by the app** (reserved `@example.com` test addresses only, user-approved): 2 offer e-mails, 1 pre-boarding invite.
**Never done:** payroll runs, exit approval/clearance/settlement, reward approval/payment, edits to shared Payroll Policy or Reward Policy.

## Files to review before pushing
**Push (test suite):**
- `hrms/tests/00_linear/hrms_linear_run.spec.js` — the complete run
- `hrms/data/hrmsPages.js` (page list), `hrms/data/naming.js`, `hrms/data/testEmployee.js`
- `hrms/flows/pageCheck.js`, `linearActions.js`, `runEmployee.js`, `recruitmentFlow.js`, `leaveFlow.js`, `userSession.js`
- `hrms/pages/FormKit.js`, `hrms/pages/core-hr/EmployeesPage.js`, `hrms/pages/core-hr/WorkerDirectoryPage.js`
- `hrms/reporters/evidenceReporter.js`, `hrms/playwright.config.js`
- `hrms/fixtures/files/sample-cv.pdf`, `sample-doc.pdf`
- `hrms/docs/automation/` (this inventory, EXECUTION_RESULTS, COVERAGE_MAP, ISSUES, MANDATORY_FIELDS)

**Module specs from before the linear run** (`01_core_hr/*_workflow`, `employees_validation`, `02_recruitment/recruitment_workflow`, `03_onboarding`, `05_leave`, `06_attendance`, `07_referral`, `08_helpdesk`, `09_my_workspace`, `10_payroll`, `11_resignation`, `12_e2e`): their steps now live in the linear run — **decide whether to keep or drop them** before pushing (they are not part of the complete run).

**Suggest NOT pushing:** `hrms/exploration/_probe_*.js` and other one-off discovery scripts/screenshots, `.claude/launch.json`, `mobile-app-tests/`.

**Never pushed (git-ignored):** `.env`, `hrms/.auth/` (saved logins, run employee, run state), `reports/`, `test-results/`.
