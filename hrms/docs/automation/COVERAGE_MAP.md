# HRMS Automation — Coverage Map (discovered page → test IDs → status)

Maps the baseline scenarios from the brief to **actual** hrms-test routes (live nav 2026-10-03,
see [[hrms-test-live-nav-map]]). Status: **Built** = positive workflow spec exists & passed · **Planned** =
to build this phase · **Read-only** = existing non-destructive `interactions.spec.js` asserts the page ·
**Blocked** = needs setup/2nd actor/dependency · **Preview-only** = calculation/preview, never committed.

| Module | Route(s) | Test IDs | POM | Status |
|---|---|---|---|---|
| **Auth/Nav** | `/login`, all modules | AUTH-001..005 | HrmsLoginPage, global-setup | Built (login) / Planned (per-role, refresh, sign-out) |
| **Core HR** | `/employees`, `/employee` | HR-001, HR-004, HR-005, HR-007 | EmployeesPage | **Built** (Step 1 create+register) |
| | `/worker-directory` | HR-006 | WorkerDirectoryPage | **Built** (Step 2) |
| | `/employee/<id>` (edit) | HR-002, HR-003 | EmployeesPage.completeProfile | **Built** (Step 3) |
| | `/document-compliance` | HR-010 | — (new) | Planned |
| | `/letters/templates`, `/letters/generate` | HR-011 | LetterTemplatesPage, GenerateLetterPage | Planned |
| | `/employee-handover` | HR-012 | EmployeeHandoverPage | Planned |
| | `/upload-employee` | HR-013 | UploadEmployeePage | Planned |
| | `/approvals`, `/approval/config` | HR-014 | ApprovalsPage, ApprovalConfigPage | Blocked (needs a raised change request) |
| | `/hrms/reminder-rules` | HR-015 | — (new) | Planned |
| | `HR-008` reporting rel. | set via create "Reports To" | EmployeesPage | **Built** (part of Step 1) |
| | `HR-009` employee doc | ESS upload (`/ess/documents`) | MyDocumentsPage | Planned |
| **Recruitment** | `/requisition-list` | REC-001, REC-002 | RequisitionListPage | Planned |
| | `/vacancy-list` | REC-003 | VacancyListPage | Planned |
| | `/candidates`, `/job-applications-list` | REC-004, REC-005 | CandidatesPage | Planned |
| | `/recruitment-pipeline` | REC-006 | RecruitmentPipelinePage | Planned |
| | `/interview-schedules`, `/interview-rounds` | REC-007, REC-008 | InterviewSchedulesPage | Planned |
| | `/offer-list`, `/offer-acceptance` | REC-009, REC-010, REC-011 | OfferListPage | Planned |
| **Onboarding** | `/onboarding-pipeline` | ONB-001, ONB-007 | OnboardingPipelinePage | Blocked (needs accepted candidate → chains from REC) |
| | `/onboarding-templates` | ONB-002 | OnboardingTemplatesPage | Planned |
| | `/preboarding-approvals` | ONB-003, ONB-005 | — (new) | Blocked (candidate-submitted link) |
| | `/onboarding-tasks`, `/onboarding-employees` | ONB-006, ONB-008 | — (new) | Planned |
| | `/training-courses` | (support) | — (new) | Planned |
| **Attendance** | `/shifts`, `/shift-roster` | ATT-001 | ShiftsPage, ShiftRosterPage | Planned |
| | `/ess/attendance` check-in/out | ATT-002, ATT-003 | MyAttendancePage | Blocked (device/geo/time setup) |
| | `/attendance-log`, `/attendance-finalization` | ATT-004, ATT-012 | AttendanceLogPage | Planned (read) |
| | `/regularization` + `/ess/requests` | ATT-005, ATT-006 | RegularizationPage | Blocked (needs attendance record) |
| | `/late-early-requests` | ATT-007, ATT-008 | — (new) | Blocked |
| | `/comp-off-approval` + ESS | ATT-009, ATT-010 | CompOffsPage | Blocked |
| | `/geofences` | ATT-011 | GeofencesPage | Planned |
| | `/attendance-test-data` | fixture for date-sensitive ATT | — (new) | Planned (supported test-data generator) |
| **Leave** | `/leave-types`, `/leave-patterns`, `/leave-policy`, `/leave-assignment-list` | (setup) | Leave POMs | Planned |
| | `/ess/leave` apply | LEV-001..004, LEV-007 | MyLeavePage | Planned (chains from assignment) |
| | `/leave-approval` | LEV-005 | LeaveApprovalPage | Blocked (self-approval exclusion — needs 2nd actor, [[hrms-leave-mgmt-sweep-2026-09]] LM-D) |
| | `/leave-ledger`, `/leave-calendar`, `/leave-attendance-sync` | LEV-006, LEV-010 | LeaveLedgerPage | Planned (read) |
| | `/holiday-list`, `/holiday-assignment-list` | (setup) | HolidayListPage | Planned |
| | `/leave-request-on-behalf` | LEV-002 (admin path) | — (new) | Planned |
| **My Workspace** | `/ess/profile` | WS-001, WS-002, WS-003 | MyProfilePage | Planned (view) / Blocked (change approval) |
| | `/ess/attendance`, `/ess/leave` | WS-004 | MyAttendancePage, MyLeavePage | Planned |
| | `/ess/approvals` | WS-005, WS-006 | — (new) | Blocked (needs assigned approval) |
| | `/ess/documents`, `/ess/payslips` | WS-007 | MyDocumentsPage, MyPayslipsPage | Planned |
| | `/ess/previous-employer` | WS-009, WS-010 | — (new) | Planned / Blocked (approval) |
| **Referral** | `/ess/referral` | REF-001, REF-002 | — (new) | Planned |
| | `/ess/referral/admin`, `/ess/referral/admin/policy` | REF-003..006 | — (new) | Planned (admin review) / Blocked (reward on hire) |
| **Helpdesk** | `/ess/helpdesk/my-tickets` | HD-001, HD-002 | — (new) | Planned |
| | `/ess/helpdesk/admin` | HD-003..009 | — (new) | Planned (assign/respond/resolve/close/reopen/reassign) |
| **Resignation & Exit** | `/ess/resignation` | EXIT-001 | — (new) | Planned (disposable employee) |
| | `/resignations` Initiate Exit, `/resignation-approval` | EXIT-002, EXIT-010..013 | — (new) | Planned |
| | `/exit-clearance`, `/exit-dashboard` | EXIT-003..005, EXIT-007, EXIT-008 | — (new) | Planned |
| | `/fnf-settlements` | EXIT-006 | — (new) | Preview-only |
| | login after exit | EXIT-009 | — | Blocked (needs ESS login as exited employee) |
| **Payroll** | `/payroll/components`, `/payroll/policies`, `/payroll/structures` | PAY-001 | — (new) | Planned (setup) |
| | `/payroll/employee-salary`, `/payroll/runs` | PAY-002..006 | — (new) | Preview-only |
| | `/payroll/payslips` | PAY-007 | — (new) | Preview-only |
| | `/fnf-settlements` | PAY-008 | — (new) | Preview-only |
| **E2E** | cross-module | E2E-001..007 | composed serial specs | Planned (after module specs green) |

## Build order (this phase)
1. **Core HR** finish (letters, handover, reminder, import, ESS doc) — POMs mostly exist.
2. **Recruitment** chain (requisition→vacancy→candidate→interview→offer) — the backbone for Onboarding & E2E-001.
3. **Onboarding** (chains from accepted candidate).
4. **Leave** setup→assign→apply (chains to ESS); approval needs 2nd actor.
5. **Attendance** (shifts, geofence, test-data generator for date-sensitive).
6. **My Workspace / Referral / Helpdesk** (self-service + admin).
7. **Resignation & Exit** (disposable employees).
8. **Payroll preview** + **E2E** integration specs last.

## Session 2026-10-07 additions (status deltas)
- **Payroll** — `tests/10_payroll/payroll_workflow.spec.js`: PAY1 Salary Component **Built** (additive write, persisted). PAY2 Policy / PAY3 Structures / PAY4 Runs+Payslips **Read-only** (rendered; shared Payroll Policy NOT modified; no run created/finalised).
- **Resignation & Exit** — `tests/11_resignation/resignation_exit_workflow.spec.js`: RE1 disposable employee + RE2 HR Initiate Exit (Resignation → On Notice) **Built**. Approve→clearance→F&F→close intentionally **out of scope** (irreversible/statutory).
- **Leave** — `tests/05_leave/leave_apply_workflow.spec.js`: LV5 employee + LV6 pattern assignment **Built** (verified: employee gains Casual 3d / Medical 1d). LV7 apply+approve on-behalf **Built & GREEN** (Casual balance 3→2; the earlier "APP-06" was an automation bug — see ISSUES.md).
- **Recruitment / Referral / Handover** — R1–R6, RF1–RF3, CH2 **GREEN** (the earlier APP-01/02/03 were automation bugs, fixed 2026-10-07/08).
- **E2E** — `tests/12_e2e/e2e_employee_lifecycle.spec.js` **Built & GREEN**: E1 hire → E2 assign leave policy (verified hire gains Casual 3d / Medical 1d) → E3 initiate resignation → On Notice, one employee across 3 modules. The hire-to-ONBOARD chain (E2E-001) is now buildable on the green recruitment chain once R9 (offer acceptance) is mapped.

## Known blockers carried from prior sweeps (not re-litigated here)
- Leave approval self-exclusion needs a 2nd employee's request in the queue (LM-D).
- Pre-Employee members silently skipped by accrual (LM-G).
- Attendance check-in/out needs device/geo/time context — use `/attendance-test-data` where possible, never arbitrary sleeps.
- Candidate-submitted preboarding link is emailed & not automatable (ONB-003 partial).
