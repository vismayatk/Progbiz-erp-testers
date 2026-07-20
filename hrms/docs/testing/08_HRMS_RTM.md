# HRMS Module — Requirements Traceability Matrix (RTM)

> Document ID: HRMS-QA-RTM-001 · Version 1.0 · 2026-07-21
> Traces every HRMS page/feature → scenario → detailed test-case document → automation status.
> Automation legend: **Smoke** = covered by `tests/00_smoke/all_pages.spec.js` (reachability). **Func.** = deeper functional automation: ✅ automated · ◐ partial (`tests/0X_*/interactions.spec.js`) · ○ planned (manual for now).

All 80 pages are covered by the smoke suite. Detailed manual/planned cases are in the per-module docs (`TC-<PREFIX>-###`).

---

## Core HR → [03_TEST_CASES_CORE_HR.md](03_TEST_CASES_CORE_HR.md) · scenarios `SC-CHR-*`

| # | Page | Route | Scenario | Smoke | Func. |
|---:|---|---|---|:--:|:--:|
| 1 | Employees | `/employees` | SC-CHR-01 | ✅ | ◐ |
| 2 | Sections | `/sections` | SC-CHR-04 | ✅ | ◐ |
| 3 | Worker Directory | `/worker-directory` | SC-CHR-03 | ✅ | ○ |
| 4 | Salary Revisions | `/salary-revisions` | SC-CHR-05 | ✅ | ○ |
| 5 | Employee Salary Process | `/employee-salary-process` | SC-CHR-05 | ✅ | ○ |
| 6 | Employee Deductions | `/employee-deduction` | SC-CHR-06 | ✅ | ○ |
| 7 | Employee Remarks | `/employee-remark` | SC-CHR-07 | ✅ | ○ |
| 8 | Probation Dashboard | `/hrms/probation` | SC-CHR-08 | ✅ | ○ |
| 9 | Probation Templates | `/hrms/probation-templates` | SC-CHR-08 | ✅ | ○ |
| 10 | Probation Report | `/hrms/probation-report` | SC-CHR-08 | ✅ | ○ |
| 11 | Resigned Employees | `/resigned-employees` | SC-CHR-10 | ✅ | ○ |
| 12 | Employee Excel Import | `/upload-employee` | SC-CHR-02 | ✅ | ○ |
| 13 | Letter Templates | `/letters/templates` | SC-CHR-09 | ✅ | ○ |
| 14 | Generate Letter | `/letters/generate` | SC-CHR-09 | ✅ | ○ |
| 15 | My Approvals | `/approvals` | SC-CHR-11 / SC-WF-01 | ✅ | ○ |
| 16 | Approval Config | `/approval/config` | SC-WF-02 | ✅ | ○ |
| 17 | Deduction Report | `/employee-deduction-report` | SC-CHR-06 | ✅ | ○ |
| 18 | Remark Report | `/employee-remark-report` | SC-CHR-07 | ✅ | ○ |

## Recruitment & Onboarding → [04_TEST_CASES_RECRUITMENT.md](04_TEST_CASES_RECRUITMENT.md) · scenarios `SC-REC-*`

| # | Page | Route | Scenario | Smoke | Func. |
|---:|---|---|---|:--:|:--:|
| 19 | Job Requisitions | `/requisition-list` | SC-REC-01 | ✅ | ◐ |
| 20 | Job Board | `/vacancy-list` | SC-REC-02 | ✅ | ○ |
| 21 | Current Openings (public) | `/current-openings` | SC-REC-02 | ✅ | ○ |
| 22 | Job Applications | `/job-applications-list` | SC-REC-03 | ✅ | ○ |
| 23 | Candidates | `/candidates` | SC-REC-03 | ✅ | ◐ |
| 24 | Assessments | `/assessment-list` | SC-REC-04 | ✅ | ○ |
| 25 | Interview Schedules | `/interview-schedules` | SC-REC-04 | ✅ | ○ |
| 26 | Offers | `/offer-list` | SC-REC-06 | ✅ | ○ |
| 27 | Recruitment Pipeline | `/recruitment-pipeline` | SC-REC-05 | ✅ | ○ |
| 28 | Communication Templates | `/communication-templates` | SC-REC-09 | ✅ | ○ |
| 29 | Talent Pool | `/talent-pool` | SC-REC-08 | ✅ | ○ |
| 30 | Candidate Status | `/candidate-status` | SC-REC-09 | ✅ | ○ |
| 31 | Interview Rounds | `/interview-rounds` | SC-REC-09 | ✅ | ○ |
| 32 | Onboarding Templates | `/onboarding-templates` | SC-REC-07 | ✅ | ○ |
| 33 | Onboarding Pipeline | `/onboarding-pipeline` | SC-REC-07 | ✅ | ○ |

## Attendance & Time → [05_TEST_CASES_ATTENDANCE.md](05_TEST_CASES_ATTENDANCE.md) · scenarios `SC-ATT-*`

| # | Page | Route | Scenario | Smoke | Func. |
|---:|---|---|---|:--:|:--:|
| 34 | Shifts & Rules | `/shifts` | SC-ATT-01 | ✅ | ◐ |
| 35 | Shift Roster | `/shift-roster` | SC-ATT-02 | ✅ | ○ |
| 36 | Attendance Log | `/attendance-log` | SC-ATT-03 | ✅ | ○ |
| 37 | Data from Device | `/data-from-device` | SC-ATT-03 | ✅ | ○ |
| 38 | Add Visit Report | `/add-visit-report` | SC-ATT-03 | ✅ | ○ |
| 39 | Regularization | `/regularization` | SC-ATT-04 | ✅ | ○ |
| 40 | Overtime Approval | `/overtime-approval` | SC-ATT-05 | ✅ | ○ |
| 41 | Attendance Finalization | `/attendance-finalization` | SC-ATT-08 | ✅ | ○ |
| 42 | Geofences | `/geofences` | SC-ATT-09 | ✅ | ○ |
| 43 | Timesheet | `/timesheet` | SC-ATT-07 | ✅ | ○ |
| 44 | Attendance Report Pack | `/attendance-report-pack` | SC-ATT-10 | ✅ | ○ |
| 45 | Approval Operation | `/approval-operation` | SC-ATT-06 | ✅ | ○ |
| 46 | Approval Operation Report | `/approval-operation-report` | SC-ATT-10 | ✅ | ○ |
| 47 | Approval Absent | `/approval-absent` | SC-ATT-06 | ✅ | ○ |
| 48 | Approval Absent Report | `/approval-absent-report` | SC-ATT-10 | ✅ | ○ |

## Leave Management → [06_TEST_CASES_LEAVE.md](06_TEST_CASES_LEAVE.md) · scenarios `SC-LVE-*`

| # | Page | Route | Scenario | Smoke | Func. |
|---:|---|---|---|:--:|:--:|
| 49 | Leave Types | `/leave-types` | SC-LVE-01 | ✅ | ◐ |
| 50 | Leave Patterns | `/leave-patterns` | SC-LVE-01 | ✅ | ○ |
| 51 | Leave Policy | `/leave-policy` | SC-LVE-01 | ✅ | ○ |
| 52 | Leave Assignment | `/leave-assignment-list` | SC-LVE-01 | ✅ | ○ |
| 53 | Leave Request | `/leave-request-list` | SC-LVE-02 | ✅ | ○ |
| 54 | Leave Approval | `/leave-approval` | SC-LVE-02 | ✅ | ○ |
| 55 | My Leave Policy | `/my-leave-policy` | SC-LVE-10 | ✅ | ○ |
| 56 | Leave Balances | `/leave-balances` | SC-LVE-03 | ✅ | ○ |
| 57 | Leave Ledger | `/leave-ledger` | SC-LVE-03 | ✅ | ○ |
| 58 | Attendance Sync (LOP) | `/leave-attendance-sync` | SC-LVE-04 | ✅ | ○ |
| 59 | Leave Encashment | `/leave-encashment` | SC-LVE-06 | ✅ | ○ |
| 60 | Encashment Approval | `/leave-encashment-approval` | SC-LVE-06 | ✅ | ○ |
| 61 | Leave Delegation | `/leave-delegation` | SC-LVE-07 | ✅ | ○ |
| 62 | Employee Handover | `/employee-handover` | SC-LVE-07 | ✅ | ○ |
| 63 | Comp-Offs | `/comp-offs` | SC-LVE-05 | ✅ | ○ |
| 64 | Comp-Off Management | `/comp-off-management` | SC-LVE-05 | ✅ | ○ |
| 65 | Holidays | `/holiday-list` | SC-LVE-08 | ✅ | ○ |
| 66 | Holiday Assignment | `/holiday-assignment-list` | SC-LVE-08 | ✅ | ○ |
| 67 | Leave Reports | `/leave-reports` | SC-LVE-09 | ✅ | ○ |
| 68 | Absence Analytics | `/absence-analytics` | SC-LVE-09 | ✅ | ○ |
| 69 | Leave Calendar | `/leave-calendar` | SC-LVE-09 | ✅ | ○ |

## My Workspace (ESS) → [07_TEST_CASES_ESS.md](07_TEST_CASES_ESS.md) · scenarios `SC-ESS-*`

| # | Page | Route | Scenario | Smoke | Func. |
|---:|---|---|---|:--:|:--:|
| 70 | My Workspace | `/ess` | SC-ESS-01 | ✅ | ◐ |
| 71 | My Profile | `/ess/profile` | SC-ESS-02 | ✅ | ○ |
| 72 | My Requests | `/ess/requests` | SC-ESS-02 | ✅ | ○ |
| 73 | My Leave | `/ess/leave` | SC-ESS-03 | ✅ | ○ |
| 74 | My Handover | `/my-handover` | SC-ESS-09 | ✅ | ○ |
| 75 | My Attendance | `/ess/attendance` | SC-ESS-04 | ✅ | ○ |
| 76 | My Locations | `/ess/locations` | SC-ESS-05 | ✅ | ○ |
| 77 | My Documents | `/ess/documents` | SC-ESS-06 | ✅ | ○ |
| 78 | My Letters | `/ess/letters` | SC-ESS-07 | ✅ | ○ |
| 79 | My Pay | `/ess/payslips` | SC-ESS-08 | ✅ | ○ |
| 80 | My Probation | `/ess/probation` | SC-ESS-09 | ✅ | ○ |

## Cross-module E2E → scenarios `SC-E2E-*` (see [scenarios](02_HRMS_TEST_SCENARIOS.md) §7)

| E2E | Flow | Modules touched | Automation |
|---|---|---|:--:|
| SC-E2E-01 | Hire-to-Employee | Recruitment → Core HR | ○ |
| SC-E2E-02 | Daily attendance cycle | Attendance → Core HR | ○ |
| SC-E2E-03 | Leave lifecycle | Leave (+ ESS) | ○ |
| SC-E2E-04 | Comp-off to encashment | Leave → Core HR | ○ |
| SC-E2E-05 | Salary & document admin | Core HR → ESS | ○ |
| SC-E2E-06 | ESS ↔ admin round-trips | ESS ↔ all | ○ |

---

### Summary
- **Pages traced:** 80 / 80 (100%)
- **Smoke automation:** 80 / 80 (100%)
- **Functional automation:** partial per module (`interactions.spec.js` seeds); remainder planned — see [coverage](09_HRMS_TEST_COVERAGE.md).
