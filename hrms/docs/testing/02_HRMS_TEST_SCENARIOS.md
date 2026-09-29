# HRMS Module — Test Scenarios

> Document ID: HRMS-QA-SCEN-001 · Version 1.0 · 2026-07-21
> High-level scenario index. Detailed step-by-step cases live in the per-module docs (03–07); the cross-module flows are expanded in each module doc's §6. Traceability in the [RTM](08_HRMS_RTM.md).

Scenario ID scheme: `SC-<MODULE>-##` (CHR / REC / ATT / LVE / ESS) and `SC-E2E-##` for cross-module business flows.

---

## 1. Cross-cutting / smoke

| ID | Scenario | Priority |
|---|---|---|
| SC-SMK-01 | Every one of the 80 HRMS pages loads authenticated (no bounce to `/login`) and shows its identity (title, buttons, grid columns, tabs) | P1 |
| SC-AUTH-01 | Login with valid `Hrms` company code / user / password lands on `/home` | P1 |
| SC-AUTH-02 | Invalid credentials are rejected on `/login` | P2 |
| SC-WF-01 | Approval workflow engine: a request routes to `/approvals`, approver acts, result posts back to the source module | P1 |
| SC-WF-02 | `/approval/config` chain builder — define type + levels, save, chain is applied to new requests | P2 |

## 2. Core HR (details → [03_TEST_CASES_CORE_HR.md](03_TEST_CASES_CORE_HR.md))

| ID | Scenario | Key pages | Priority |
|---|---|---|---|
| SC-CHR-01 | Create / edit / view an employee master record | `/employees` | P1 |
| SC-CHR-02 | Bulk employee import via Excel | `/upload-employee` | P2 |
| SC-CHR-03 | Worker directory — cards & org-chart views | `/worker-directory` | P3 |
| SC-CHR-04 | Manage sections | `/sections` | P2 |
| SC-CHR-05 | Raise a salary revision and run monthly salary process | `/salary-revisions`, `/employee-salary-process` | P1 |
| SC-CHR-06 | Employee deductions + deduction report | `/employee-deduction`, `/employee-deduction-report` | P2 |
| SC-CHR-07 | Employee remarks + remark report | `/employee-remark`, `/employee-remark-report` | P3 |
| SC-CHR-08 | Probation lifecycle — dashboard, templates, report | `/hrms/probation*` | P2 |
| SC-CHR-09 | Letter templates → generate → send | `/letters/*` | P2 |
| SC-CHR-10 | Resigned employees list & exit handling | `/resigned-employees` | P3 |
| SC-CHR-11 | Approvals inbox — approve/reject/history | `/approvals`, `/approval/config` | P1 |

## 3. Recruitment & Onboarding (details → [04_TEST_CASES_RECRUITMENT.md](04_TEST_CASES_RECRUITMENT.md))

| ID | Scenario | Key pages | Priority |
|---|---|---|---|
| SC-REC-01 | Raise & approve a job requisition | `/requisition-list` | P1 |
| SC-REC-02 | Publish a job opening; public careers page renders | `/vacancy-list`, `/current-openings` | P2 |
| SC-REC-03 | Application → candidate record, status transitions (New→…→Selected/Rejected) | `/job-applications-list`, `/candidates` | P1 |
| SC-REC-04 | Assessments & interview scheduling (rounds) | `/assessment-list`, `/interview-schedules` | P2 |
| SC-REC-05 | Recruitment pipeline kanban — move stages, score | `/recruitment-pipeline` | P2 |
| SC-REC-06 | Create & send an offer | `/offer-list` | P1 |
| SC-REC-07 | Onboarding from template → pipeline → employee | `/onboarding-templates`, `/onboarding-pipeline` | P1 |
| SC-REC-08 | Talent pool archive of rejected candidates | `/talent-pool` | P3 |
| SC-REC-09 | Recruitment settings — candidate status, interview rounds, comms templates | `/candidate-status`, `/interview-rounds`, `/communication-templates` | P2 |

## 4. Attendance & Time (details → [05_TEST_CASES_ATTENDANCE.md](05_TEST_CASES_ATTENDANCE.md))

| ID | Scenario | Key pages | Priority |
|---|---|---|---|
| SC-ATT-01 | Define shifts & rules | `/shifts` | P1 |
| SC-ATT-02 | Assign roster (branch/dept/employee scope) | `/shift-roster` | P1 |
| SC-ATT-03 | Punch capture → computed day log | `/data-from-device`, `/add-visit-report`, `/attendance-log` | P1 |
| SC-ATT-04 | Missed-punch regularization | `/regularization` | P2 |
| SC-ATT-05 | Overtime approval | `/overtime-approval` | P2 |
| SC-ATT-06 | Worked/late/OT & absent hour approval | `/approval-operation`, `/approval-absent` | P2 |
| SC-ATT-07 | Timesheet — attendance hrs vs task hrs | `/timesheet` | P3 |
| SC-ATT-08 | Finalize pay cycle (cut-off, pending = 0) | `/attendance-finalization` | P1 |
| SC-ATT-09 | Geofences for location punches | `/geofences` | P2 |
| SC-ATT-10 | Attendance report pack & approval reports | `/attendance-report-pack`, `/approval-*-report` | P2 |

## 5. Leave Management (details → [06_TEST_CASES_LEAVE.md](06_TEST_CASES_LEAVE.md))

| ID | Scenario | Key pages | Priority |
|---|---|---|---|
| SC-LVE-01 | Configure leave: types → patterns → policy → assignment | `/leave-types`, `/leave-patterns`, `/leave-policy`, `/leave-assignment-list` | P1 |
| SC-LVE-02 | Raise & approve a leave request | `/leave-request-list`, `/leave-approval` | P1 |
| SC-LVE-03 | Balances (Run Accrual) & ledger reflect approvals | `/leave-balances`, `/leave-ledger` | P1 |
| SC-LVE-04 | LOP ↔ attendance sync recalculation | `/leave-attendance-sync` | P2 |
| SC-LVE-05 | Comp-off request → grant → balance | `/comp-offs`, `/comp-off-management` | P2 |
| SC-LVE-06 | Leave encashment → approval → payout | `/leave-encashment`, `/leave-encashment-approval` | P2 |
| SC-LVE-07 | Delegation & duty handover cover approvers | `/leave-delegation`, `/employee-handover` | P3 |
| SC-LVE-08 | Holidays & holiday assignment | `/holiday-list`, `/holiday-assignment-list` | P2 |
| SC-LVE-09 | Leave analytics — reports, absence (Bradford), calendar | `/leave-reports`, `/absence-analytics`, `/leave-calendar` | P2 |
| SC-LVE-10 | My leave policy view | `/my-leave-policy` | P3 |

## 6. My Workspace / ESS (details → [07_TEST_CASES_ESS.md](07_TEST_CASES_ESS.md))

| ID | Scenario | Key pages | Priority |
|---|---|---|---|
| SC-ESS-01 | ESS dashboard renders self-service tiles | `/ess` | P2 |
| SC-ESS-02 | View & request profile change | `/ess/profile`, `/ess/requests` | P2 |
| SC-ESS-03 | View balances & apply for leave | `/ess/leave` | P1 |
| SC-ESS-04 | View attendance; Regularize & Raise OT | `/ess/attendance` | P2 |
| SC-ESS-05 | Work locations on map; submit for approval | `/ess/locations` | P2 |
| SC-ESS-06 | Documents upload with expiry | `/ess/documents` | P3 |
| SC-ESS-07 | Letters acknowledge | `/ess/letters` | P3 |
| SC-ESS-08 | Payslips view/download | `/ess/payslips` | P2 |
| SC-ESS-09 | Probation self-view & handover | `/ess/probation`, `/my-handover` | P3 |

## 7. End-to-end / integration business flows

| ID | Scenario | Chain | Priority |
|---|---|---|---|
| SC-E2E-01 | **Hire-to-Employee** | requisition → opening → application → candidate → assessment → interview → offer → onboarding → employee → probation | P1 |
| SC-E2E-02 | **Daily attendance cycle** | shifts → roster → punches → attendance-log → regularization/OT/approval → finalization → salary process | P1 |
| SC-E2E-03 | **Leave lifecycle** | leave config → request (ESS/admin) → approval → ledger + balances + LOP sync | P1 |
| SC-E2E-04 | **Comp-off to encashment** | comp-offs → comp-off-management → balances → encashment → encashment-approval → salary process | P2 |
| SC-E2E-05 | **Salary & document admin** | salary-revision → approval → salary process → payslip; letters template → generate → ESS acknowledge | P1 |
| SC-E2E-06 | **ESS ↔ admin round-trips** | ess/leave↔leave-request; ess/attendance↔regularization/OT; ess/locations↔geofences; ess/requests↔approvals | P1 |
