# HRMS Positive-Workflow Automation — Mandatory-Field & Prerequisite Tables

**Application:** https://hrms-test.progbiz.in · **Tenant:** `pbhrms` · **Admin login:** `amit` (Amit Kumar)
**Discovered:** 2026-10-03 (live, read-only) via `hrms/exploration/08_discover_form.js` / `10_discover_all.js`.
Raw per-form dumps: `hrms/exploration/_forms/<group>__<route>.json`. Route map: `_forms/_nav_live.json`.

> Scope rule for this phase: fill **only mandatory + conditional-mandatory** fields; leave everything else at default.
> Only fields the app actually enforces are listed (asterisk, `required`, or disabled-until-dependency). Cascading
> selects (e.g. Designation disabled until Department) are **conditional mandatory** and noted as such.
> Selection rule "first valid" = pick the first non-placeholder option unless a specific value is needed downstream.

Legend — **Src** column cites the discovery dump file under `_forms/`.

---

## 3. Core HR

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **New Employee** (`/employee`) | Role Group | `Staff` | — | employees |
| | User Level | `Team Member` | — | |
| | Designation | `SOFTWARE TESTER` | — | |
| | Branch | `Main Branch` | — | |
| | First Name | letters only, e.g. `MeeraQxvbz` (unique per run) | — | |
| | Display Name | `<First> Nair` | — | |
| | Date of Birth | `1995-06-15` (adult, before joining) | — | |
| | Gender | `Female` | — | |
| | Marital Status | `Single` | — | |
| | Phone (code + number) | `+91` + unique 10-digit `9#########` | — | |
| | WhatsApp No | check **Same as Phone** (`#IsSameContact`) | mirrors Phone | |
| | Email Address | unique `<handle>@example.com` | — | |
| | Work Location | `Office` | — | |
| | Employment Type | `Full Time Employee` | — | |
| | Employee Status | `Active` (or `Pre-Employee` for HR-007) | — | |
| | Joining Date | a valid date (≥ DOB) | — | |
| | Present Country→State→City | `India` → first state → first city | cascade (State loads after Country, City after State) | |
| | Login Username | unique `<first><stamp>` | required even if Can Login off | |
| | Reports To | `Amit Kumar [progbiz0017]` | appears only after Role Group + User Level | |
| | *Dept/Blood/Nationality/Address* | set on **Edit** form `/employee/<id>` only | not on create form | [[hrms-employee-profile-structure]] |
| **Letter Template** (`/letters/templates` → New Template) | Template Name | `QA Auto Letter <stamp>` | — | letters_templates |
| | Letter is about | `Employee` | — | |
| | Subject | `QA Automated Letter` | — | |
| **Generate Letter** (`/letters/generate`) | Letter is about | `Employee` | — | letters_generate |
| | Template | `Appoinment` (existing) | — | |
| | Branch | `Main Branch` | — | |
| | Employee | the run employee | loads after Branch | |
| **Duty Handover** (`/employee-handover`) | Employee going away | disposable test employee | — | employee-handover |
| | Assign duties to | `Amit Kumar Shaji [progbiz0017]` | ≠ going-away employee | |
| | From / To | valid date range | — | |
| **HR Reminder Rule** (`/hrms/reminder-rules`) | *(inline form — fields load on New; capture at build time)* | — | — | reminder-rules |
| **Employee Excel Import** (`/upload-employee`) | file upload (official template) | populated template w/ 1 unique employee | — | upload-employee |

## 4. Recruitment

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **Job Requisition** (`/requisition-list` → New Requisition) | Department | `SOFTWARE DEVELOPMENT` | — | requisition-list |
| | Designation | first valid | **disabled until Department** | |
| | Branch | `Main Branch` | — | |
| | Positions | `1` | — | |
| | Employee Type | `Full Time Employee` | — | |
| | Work Type | `Office` | — | |
| **Job Opening** (`/vacancy-list` → Add Job Opening) | Designation | `SOFTWARE TESTER` | — | vacancy-list |
| | Employment Type | `FullTime` | — | |
| | Department | `SOFTWARE DEVELOPMENT` | — | |
| | Status | `Open` | — | |
| | Work Type | `Office` | — | |
| | Branch | `Main Branch` | — | |
| | Number of Vacancies | `1` | — | |
| **Candidate** (`/candidates` → Add New) | Name | `QA Automation Candidate <stamp>` | — | candidates |
| | Email | unique controlled test email | — | |
| | Gender | `Male` | — | |
| | Phone (code + number) | `+91` + unique number | — | |
| | Source | `Manual` | — | |
| | Department | `SOFTWARE DEVELOPMENT` | — | |
| | Designation | first valid | **disabled until Department** | |
| | Apply to Job Opening | the opening created above | **disabled until Designation** | |
| | Resume | `hrms/fixtures/files/sample-cv.pdf` | **file upload** | |
| **Interview Round** (`/interview-rounds` → Add Round) | Designation | matching the opening | — | interview-rounds |
| | Round Name | `QA Round 1` | — | |
| **Schedule Interview** (`/interview-schedules`) | Designation | matching the candidate | then candidate/date/interviewer load | interview-schedules |
| **Offer** (`/offer-list` → New Offer) | Designation (`#offerDesignation`) | `SOFTWARE TESTER` | — | offer-list |
| | Job Opening (`#offerOpening`) | the opening | **disabled until Designation** | |
| | Candidate (`#offerCandidate`) | the candidate | **disabled until Job Opening** | |
| | Branch (`#offerBranch`) | `Main Branch` | — | |
| | Joining Date (`#offerJoining`) | valid future date | — | |
| | Total CTC (`#offerTotal`) | `600000` | — | |
| | User Level (`#offerUserLevel`) | `Team Member` | — | |

## 5. Onboarding

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **Start Onboarding** (`/onboarding-pipeline`) | Template | an existing template (e.g. `Frontend Developer`) | — | onboarding-pipeline |
| | New Hire (Hired Candidate) | a candidate whose offer is **Accepted** | list only shows hired/accepted | |
| | Joining Date | valid date | — | |
| **Training Course** (`/training-courses` → New Course) | Course Name | `QA Onboarding Course <stamp>` | — | training-courses |
| | Provider/Instructor | `Self` | — | |
| **Onboarding Template** (`/onboarding-templates` → New Template) | *(wizard — capture at build time)* | — | — | onboarding-templates |

## 6. Attendance

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **New Shift** (`/shifts`) | Shift Name | `QA Shift <stamp>` | — | shifts |
| | Type | `Standard` | — | |
| | Start Time / End Time | `09:00` / `18:00` | — | |
| **Shift Roster assign** (`/shift-roster` → Assign) | *(assign form — capture at build time)* | shift + employee + date | — | shift-roster |
| **Geofence** (`/geofences` → Add Location) | Scope | `Employee` | — | geofences |
| | Employee | the run employee | shown when Scope=Employee | |
| | Location Name | `QA Test Location` | — | |
| | Latitude / Longitude | `10.0` / `76.3` | — | |
| | Radius (m) | `100` | — | |
| Regularization / Late-Early / Comp-Off / OT | **employee self-service requests** — forms live in ESS (`/ess/attendance`, `/ess/requests`); admin pages are approval queues | needs an attendance record first | regularization, late-early-requests, overtime-approval |

## 7. Leave Management

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **Leave Type** (`/leave-types`, inline) | Leave Type Name | `QA Auto Leave <stamp>` | letters only, no digits ([[hrms-leave-mgmt-sweep-2026-09]] LM-7) | leave-types |
| **Leave Pattern** (`/leave-patterns` → New) | Leave Pattern Name | `QA Auto Pattern` (**no digits**) | — | leave-patterns |
| | Effective From / To | `2026-01-01` / `2026-12-31` (From ≤ To) | — | |
| **Leave Assignment** (`/leave-assignment-list` → New) | Assignment Type | `Employee` | — | leave-assignment-list |
| | Pattern | `Standard Staff` (existing) | — | |
| | *(target employee/branch/dept)* | the run employee | loads after type | |
| **Holiday** (`/holiday-list` → New) | Holiday Name | `QA Holiday <stamp>` | — | holiday-list |
| | Calendar Type | `All employees` | — | |
| | From / To Date | same valid date | — | |
| **Holiday Assignment** (`/holiday-assignment-list` → New) | Assignment Type | `Branch` | — | holiday-assignment-list |
| | Holidays | the holiday created above | — | |
| **Apply for Leave** (`/ess/leave` → Apply for Leave) | Leave Type | an **assigned** type (empty until policy assigned — [[hrms-leave-mgmt-sweep-2026-09]] LM-9) | — | ess_leave |
| | Dates | valid working day(s) | appear after choosing type | |
| | Description | `QA automated leave request` | — | |
| **Apply Leave for Employee** (`/leave-request-on-behalf`) | Employee | the run employee | — | leave-request-on-behalf |

## 8. My Workspace (ESS)

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **Upload Document** (`/ess/documents` → Upload) | Category | `ID Proof` | — | ess_documents |
| | Document Type | loads after Category | conditional | |
| | File (front) | `hrms/fixtures/files/sample-doc.pdf` | **file upload** (no PAN/Aadhaar — non-sensitive sample only) | |
| View-only pages | `/ess/profile`, `/ess/requests`, `/ess/approvals`, `/ess/attendance`, `/ess/leave`, `/ess/payslips` | assert own records render | — | ess |

## 9. Referral Program

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **Refer a Candidate** (`/ess/referral`) | Full name | `QA Referral Candidate <stamp>` | — | ess_referral |
| | Email | unique controlled test email | — | |
| | Gender | `Male` | — | |
| | Phone (code + number) | `+91` + unique number | — | |
| | How do you know the candidate? | `Former colleague` | — | |
| | Resume / CV | `hrms/fixtures/files/sample-cv.pdf` | **file upload** | |
| **Reward Policy** (`/ess/referral/admin/policy`) | Programme name | `QA Referral Programme` | — | ess_referral_admin_policy |
| | Reward after probation | `5000` | — | |

## 10. Helpdesk

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **New Ticket** (`/ess/helpdesk/my-tickets`) | Subject | `QA Auto Ticket <stamp>` | — | ess_helpdesk_my-tickets |
| | Description | `Raised by automated positive-flow test.` | — | |
| | Category | first valid (loads async) | — | |
| | Priority | `Medium` | — | |
| Admin (`/ess/helpdesk/admin`) | assign / respond / resolve / close | act on the ticket created above | workflow states | ess_helpdesk_admin |

## 11. Resignation & Exit

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **Submit Resignation** (`/ess/resignation`) | Reason for Leaving | `Better Opportunity` | — | ess_resignation |
| | *(resignation + last working date)* | valid dates | capture remaining at build | |
| **Initiate Exit** (`/resignations` → Initiate Exit) | employee + exit type + LWD | disposable employee; `Resignation`; valid LWD | modal/wizard — capture at build | resignations |
| **Notice Period Rule** (`/notice-period-rules`) | Applies to | `All` (restore tenant baseline after — [[hrms-resignation-exit-module]]) | — | notice-period-rules |
| | Notice Days | `30` | — | |

> Use a **separate disposable employee** for every resignation/termination/retirement/contract-end flow.
> Never run a destructive exit against the admin login account. See [[hrms-resignation-exit-module]].

## 12. Payroll (safe calculation & preview only)

| Form (route) | Mandatory Field | Valid Test Value / Selection Rule | Conditional | Src |
|---|---|---|---|---|
| **Salary Component** (`/payroll/components`) | Code | `QABASIC` | — | payroll_components |
| | Name | `QA Basic` | — | |
| | Type | `Earning` | — | |
| | Calculation | `Fixed amount` | — | |
| **Payroll Policy** (`/payroll/policies`) | Period type | `Full calendar month (1st to last day)` | — | payroll_policies |
| Salary Structure / Employee Salary / Runs / Payslips | assign structure → preview period → preview payslip | **preview/calculate only — never finalise, pay, or submit statutory** | existing structure `Sample Structure` | payroll_* |

---

### Conditional / cascade dependencies to script carefully
- **Country → State → City** (employee), **Department → Designation → Job Opening** (requisition, candidate, offer): parent select populates child asynchronously — poll `option` count > 1 before selecting the child (the existing `EmployeesPage._pickPresentAddress` pattern).
- **File uploads** (Candidate Resume, Referral CV, ESS Document): need fixture files in `hrms/fixtures/files/` — sample PDF/image only, nothing sensitive.
- **Leave apply** requires an assigned leave policy first, else the Leave Type dropdown is empty (LM-9).
- **Onboarding** needs a candidate whose offer is **Accepted**; **Offer** needs a candidate who **applied** to an opening — the recruitment chain must run in order (E2E-001).
