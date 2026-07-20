# HRMS Test Cases — Leave Management

> Part of the HRMS test-documentation set (`hrms/docs/testing/`). App: https://hrms-erp.progbiz.in · tenant `Hrms`.
> Grounded in hrms/docs/04_LEAVE_MANAGEMENT.md + hrms/data/pages/*.json (live crawl 2026-07-20).
> IDs: test cases `TC-LVE-###` · scenarios `SC-LVE-##`. Priority P1/P2/P3. Type: Functional / UI / Negative / E2E / Report. Automation: Automated (smoke) / Planned / Manual.

---

## 1. Scope — pages covered

| # | Page | Route | Archetype |
|---|------|-------|-----------|
| 1 | Leave Types | `/leave-types` | Inline create-form + grid (`Save`/`Clear`) |
| 2 | Leave Patterns | `/leave-patterns` | List + `New X` modal |
| 3 | Leave Policy Configuration | `/leave-policy` | Gated select-driven config form |
| 4 | Leave Assignment List | `/leave-assignment-list` | List + `Filter` + `New X` modal |
| 5 | Leave Request | `/leave-request-list` | List + `New X` modal |
| 6 | Leave Approval | `/leave-approval` | Approver worklist (bulk, filter, delegate) |
| 7 | My Leave Policy | `/my-leave-policy` | Filter-first read-only (Year + `Show`) |
| 8 | My Leave Balance | `/leave-balances` | Filter-first grid + action (`Run Accrual`) |
| 9 | Leave Ledger | `/leave-ledger` | Filter-first report + `Export` |
| 10 | Leave ↔ Attendance Sync | `/leave-attendance-sync` | Filter-first + action (`Recalculate period`) |
| 11 | Leave Encashment | `/leave-encashment` | Inline request-form + history grid (ESS) |
| 12 | Encashment Approvals | `/leave-encashment-approval` | Filter-first approver worklist (row actions) |
| 13 | Leave Approval Delegation | `/leave-delegation` | Read-only registry grid |
| 14 | Employee Duty Handover | `/employee-handover` | Inline create-form + grid (`Save`/`Clear`) |
| 15 | Comp-Off | `/comp-offs` | List + `Request` modal (ESS) |
| 16 | Comp-Off Management | `/comp-off-management` | Worklist w/ row `Grant`/`Reject` + checkbox filter |
| 17 | Holiday | `/holiday-list` | List + `New X` modal + `Calendar` toggle + `Export` |
| 18 | Holiday Assignment | `/holiday-assignment-list` | List + `Filter` + `New X` modal |
| 19 | Leave Reports | `/leave-reports` | Report hub (type buttons + filters, run-first) |
| 20 | Absence Analytics | `/absence-analytics` | Analytics dashboard (KPI tiles + charts + risk table) + `Export` |
| 21 | Leave Calendar | `/leave-calendar` | Async calendar visualisation (filters + `Show`) |

---

## 2. Prerequisites & test data

**Environment / auth**
- Login form: `#companycode` = `Hrms`, `#signin-username`, `#signin-password`, then `button[type=submit]`. Success = URL leaves `/login` and lands on `/home`.
- Two role contexts are needed: an **HR/admin** user (config + approvals) and an **employee/ESS** user (self-service requests). Test employee referenced in live data: `vismaya`; live comp-off/analytics data belongs to `Akshay` (`ASK112`, department `Dotnet`).

**Config chain (mandatory ordering — nothing downstream works without it)**
1. `/leave-types` — at least one leave type (e.g. `Casual leave`); create one encashable type for encashment tests.
2. `/leave-patterns` — at least one named pattern.
3. `/leave-policy` — configure rules (entitlement/accrual/encashability) for that pattern.
4. `/leave-assignment-list` — assign the pattern to a branch/department/employee target.
   Only after step 4 do `/my-leave-policy`, `/leave-balances` and typed requests on `/leave-request-list` become usable.

**Holiday chain**
- `/holiday-list` — at least one holiday in a named calendar (live: `Onam`, `24/08/2026`, calendar `State - Kerala`).
- `/holiday-assignment-list` — assign the calendar to a target.

**Shared filter masters (present on this environment)**
- Branch: `All Branches`, `Main Branch`, `Chennai`.
- Department: `All Departments`, `2D`, `DigitalMarkrting` (misspelled — copy verbatim), `Dotnet`, `Sales`, `SEO`.
- Leave Type (reports filter): `All Types`, `Casual leave`, `Earned leave`, `Maternity leave`, `Medical leave`, `Paternity leave`.

**Selector hazards to encode once**
- `/leave-types`: both checkboxes share id `checkebox-sb` — select by label text / DOM order, never by id.
- `/leave-approval`: three filter selects share id `selectbox` — disambiguate by index or wrapping label; delegate input id `custodianname`.
- `/employee-handover`: stable checkbox ids `ca` (Cover approvals), `ct` (Cover HRMS tasks), `active`.
- `/comp-off-management`: pending filter checkbox id `reqOnly`.
- `/ess/leave` apply form: half-day checkbox id `halfday`.
- Empty grids render **header rows only** (leave-types/patterns/assignment/request) or a single in-table message row (balances/ledger/sync/encashment) — assert on the message string / data-row count, not table presence.

---

## 3. Scenarios (high level)

| Scenario ID | Title | Pages involved | Priority |
|---|---|---|---|
| SC-LVE-01 | Configure leave building blocks (types → patterns → policy → assignment) | `/leave-types`, `/leave-patterns`, `/leave-policy`, `/leave-assignment-list`, `/my-leave-policy` | P1 |
| SC-LVE-02 | Configure holiday calendars and assignment | `/holiday-list`, `/holiday-assignment-list` | P2 |
| SC-LVE-03 | Employee raises and tracks a leave request | `/ess/leave`, `/leave-request-list` | P1 |
| SC-LVE-04 | Approver processes leave requests (bulk + single) | `/leave-approval`, `/leave-request-list` | P1 |
| SC-LVE-05 | Approval continuity via delegation & handover | `/leave-approval`, `/leave-delegation`, `/employee-handover` | P2 |
| SC-LVE-06 | Balance computation & accrual | `/leave-balances`, `/leave-ledger` | P1 |
| SC-LVE-07 | Ledger integrity, filtering & export | `/leave-ledger` | P2 |
| SC-LVE-08 | Leave ↔ Attendance LOP reconciliation & recalculation | `/leave-attendance-sync`, `/holiday-list` | P1 |
| SC-LVE-09 | Encashment request & approval | `/leave-encashment`, `/leave-encashment-approval`, `/leave-balances` | P2 |
| SC-LVE-10 | Comp-off earn/request & grant | `/comp-offs`, `/comp-off-management`, `/leave-balances` | P2 |
| SC-LVE-11 | Leave reporting (Register / Balance / Utilization) | `/leave-reports` | P2 |
| SC-LVE-12 | Absence analytics & Bradford Factor risk | `/absence-analytics` | P3 |
| SC-LVE-13 | Leave calendar oversight for approvers | `/leave-calendar` | P3 |
| SC-LVE-14 | Full leave lifecycle end-to-end (config → request → approve → ledger/balance/sync) | all core Leave pages | P1 |

---

## 4. Detailed test cases

### 4.1 Leave Types — `/leave-types`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-001 | Page loads with grid + inline create card | Logged in as HR | 1. Open `/leave-types` | Breadcrumb `Leave Types HRMS Leave Types`; cards `Leave Types` and `Add LeaveType` visible; grid headers `SlNo, Leave Type Name, Is Support Half Day, Is Need Document, Action`; no data rows (headers only) | P2 | UI | Automated (smoke) |
| TC-LVE-002 | Create a leave type (happy path) | On `/leave-types` | 1. Enter `Casual leave` in `Leave Type Name*` (`#leavetypename`) 2. Click `Save` | Row appears in `Leave Types` grid with the name; `Is Support Half Day` / `Is Need Document` show No; form clears | P1 | Functional | Planned |
| TC-LVE-003 | Create with Support HalfDay + Need Document flags | On `/leave-types` | 1. Enter name `Medical leave` 2. Tick `Support HalfDay` 3. Tick `Need Document` 4. `Save` | New row shows both flags as Yes/true; type now offers half-day and document-required behaviour downstream | P2 | Functional | Planned |
| TC-LVE-004 | Reject save with empty mandatory name | On `/leave-types` | 1. Leave `Leave Type Name*` blank 2. Click `Save` | Validation blocks save (field is starred/mandatory); no new row added | P1 | Negative | Planned |
| TC-LVE-005 | Duplicate-id checkboxes resolved by label, not id | On `/leave-types` | 1. Inspect the two checkboxes 2. Tick only `Support HalfDay` via its label 3. `Save` | Only Support-HalfDay is set (Need-Document stays false) — proves selection is label/DOM-order based despite shared id `checkebox-sb` | P2 | UI | Planned |
| TC-LVE-006 | Clear resets the create form | Name typed + flags ticked | 1. Click `Clear` | Name input emptied and both checkboxes unticked; grid unchanged | P3 | Functional | Automated (smoke) |

### 4.2 Leave Patterns — `/leave-patterns`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-007 | Page loads with grid + New button | Logged in as HR | 1. Open `/leave-patterns` | Card `Leave Patterns`; button `New Leave Pattern`; grid headers `Sl.No, Leave Pattern Name, Details, Action`; no data rows | P2 | UI | Automated (smoke) |
| TC-LVE-008 | New Leave Pattern opens a create modal | On `/leave-patterns` | 1. Click `New Leave Pattern` 2. Wait for dialog | A modal/form appears (no inline inputs on the list page) — test must wait for the dialog before interacting | P2 | UI | Planned |
| TC-LVE-009 | Create a leave pattern (happy path) | Modal open | 1. Enter a pattern name (+ details if present) 2. Submit | New pattern row appears in the grid; pattern is now selectable on `/leave-policy` and `/leave-assignment-list` | P1 | Functional | Planned |
| TC-LVE-010 | Reject empty pattern submission | Modal open | 1. Submit with name blank | Validation blocks creation; no new row; modal stays open | P2 | Negative | Planned |

### 4.3 Leave Policy Configuration — `/leave-policy`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-011 | Initial gated state (no pattern chosen) | Logged in as HR | 1. Open `/leave-policy` | Breadcrumb `Leave Policy Configuration HRMS Leave Policy`; only card `Choose A Leave Pattern` with a single `Leave Pattern` select defaulted to `Choose`; **no buttons, no tables** render | P2 | UI | Automated (smoke) |
| TC-LVE-012 | Choosing a pattern reveals the policy form | ≥1 pattern seeded (TC-LVE-009) | 1. Select a pattern from the `Leave Pattern` select | Policy configuration controls appear beneath the selector (were hidden while `Choose`) | P1 | Functional | Planned |
| TC-LVE-013 | Configure & save policy rules for a pattern | Pattern selected | 1. Set entitlement/accrual/encashability rules 2. Save | Rules persist for that pattern; re-selecting the pattern reloads saved values; downstream `Run Accrual` and encashment eligibility honour them | P1 | Functional | Planned |
| TC-LVE-014 | No pattern seeded → selector shows only `Choose` | Fresh tenant, no patterns | 1. Open `/leave-policy` 2. Open the `Leave Pattern` select | Select contains only the `Choose` placeholder; confirms policy page depends on `/leave-patterns` seeding | P2 | Negative | Planned |

### 4.4 Leave Assignment List — `/leave-assignment-list`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-015 | Page loads with grid + action buttons | Logged in as HR | 1. Open `/leave-assignment-list` | Card `Leave Assignment`; buttons `Filter`, `New Leave Assignment`; grid headers `Sl.No, Assignment Type, Assignment Target Name, Leave Pattern, Action`; no data rows | P2 | UI | Automated (smoke) |
| TC-LVE-016 | Assign a pattern to a target (happy path) | ≥1 pattern seeded | 1. Click `New Leave Assignment` 2. Choose assignment type + target + leave pattern 3. Save | New row shows `Assignment Type`, `Assignment Target Name` and the chosen `Leave Pattern` | P1 | Functional | Planned |
| TC-LVE-017 | Filter the assignment list | ≥1 assignment exists | 1. Click `Filter` 2. Apply a filter (type/target) 3. Apply | Grid narrows to matching assignments | P2 | Functional | Planned |
| TC-LVE-018 | Cannot assign without an available pattern | No patterns seeded | 1. Click `New Leave Assignment` 2. Open the Leave Pattern chooser | No pattern is selectable (empty options) — assignment cannot be completed | P2 | Negative | Planned |
| TC-LVE-019 | Assignment makes downstream policy non-empty | Employee target chosen in TC-LVE-016 | 1. Log in as that employee 2. Open `/my-leave-policy`, set year, `Show` | The "No leave policy is assigned to you yet…" empty state is replaced by assigned types/balances/rules | P1 | Functional | Planned |

### 4.5 Leave Request — `/leave-request-list`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-020 | Page loads with grid + New button | Logged in as employee | 1. Open `/leave-request-list` | Card `Leave Request List`; button `New Leave Request`; grid headers `Sl.No, Leave Type, Start Date, End Date, Approval Status, Remarks, Action`; no data rows | P2 | UI | Automated (smoke) |
| TC-LVE-021 | Raise a leave request (happy path) | Employee has an assigned policy | 1. Click `New Leave Request` 2. Pick leave type, start/end dates, remarks 3. Submit | New row appears with the type, dates and `Approval Status` = Pending; request surfaces in `/leave-approval` | P1 | Functional | Planned |
| TC-LVE-022 | Submitted request shows Pending status | TC-LVE-021 done | 1. Reload `/leave-request-list` | The request row persists; `Approval Status` column = Pending until acted on in `/leave-approval` | P1 | Functional | Planned |
| TC-LVE-023 | Request blocked without assigned policy | Employee with NO policy assigned | 1. Click `New Leave Request` 2. Open Leave Type dropdown | No leave types available (types come via the assigned pattern) — request cannot be completed | P1 | Negative | Planned |
| TC-LVE-024 | Reject end-date-before-start-date | Create form open | 1. Set End Date earlier than Start Date 2. Submit | Validation blocks submission; no row created | P2 | Negative | Planned |

### 4.6 Leave Approval — `/leave-approval`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-025 | Approver worklist loads with bulk controls | Logged in as approver | 1. Open `/leave-approval` | Breadcrumb `Leave Approval Leave Leave Approval`; helper text "Bulk actions— tick the rows you want, then approve or reject them together"; buttons `Delegate approvals, Filter, Approve Selected, Reject Selected, Clear`; grid headers `SL.No, Employee Name, Leave Type, Details, Leave Status, Action`; select-all checkbox present | P2 | UI | Automated (smoke) |
| TC-LVE-026 | Bulk approve selected requests | ≥1 pending request exists | 1. Tick one or more row checkboxes 2. Click `Approve Selected` | Selected rows move to approved; each posts a ledger txn to `/leave-ledger` and updates `/leave-balances` (`Used`) | P1 | Functional | Planned |
| TC-LVE-027 | Bulk reject selected requests | ≥1 pending request exists | 1. Tick rows 2. Click `Reject Selected` | Selected requests marked rejected; requester's `/leave-request-list` `Approval Status` = Rejected; no `Used` deduction | P1 | Functional | Planned |
| TC-LVE-028 | Clear resets the selection | Rows ticked | 1. Click `Clear` | All row checkboxes and select-all clear; no approve/reject performed | P3 | Functional | Automated (smoke) |
| TC-LVE-029 | Filter the worklist (shared-id selects) | Multiple pending rows | 1. Click `Filter` 2. Set each of the three `#selectbox` selects (disambiguated by index) 3. Apply | Grid narrows to matching rows; confirms all three same-id selects are independently addressable | P2 | Functional | Planned |
| TC-LVE-030 | Delegate approvals to a custodian | Approver on page | 1. Click `Delegate approvals` 2. Enter custodian in `#custodianname` + date window 3. Save | Delegation is created; a matching row appears in `/leave-delegation` (`From/To`, date window, `Active`) | P2 | Functional | Planned |

### 4.7 My Leave Policy — `/my-leave-policy`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-031 | Empty-state shown when no policy assigned | Employee with no assignment | 1. Open `/my-leave-policy` | Exact text "No leave policy is assigned to you yet. Once HR assigns a leave pattern, your leave types, balances and rules appear here." is shown; `Year` number input + `Show` button present | P1 | UI | Automated (smoke) |
| TC-LVE-032 | Show loads policy after assignment | Pattern assigned to this employee | 1. Enter the year 2. Click `Show` | Empty state disappears; assigned leave types, balances and rules render for the chosen year | P1 | Functional | Planned |
| TC-LVE-033 | Show with no policy keeps empty state | No policy assigned | 1. Enter a year 2. Click `Show` | Empty-state sentence persists (nothing to display) | P2 | Negative | Planned |

### 4.8 My Leave Balance — `/leave-balances`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-034 | Empty-state balances render both messages | Employee, year with no balances | 1. Open `/leave-balances` | Card title interpolates year `Balance Detail — 2026`; page banner "No balances found for 2026." and in-table "No balances found."; grid headers `Sl.No, Leave Type, Opening, Accrued, Carried Fwd, Used, Encashed, Reserved, Available, Liability`; footnotes about live computation + Liability formula present | P2 | UI | Automated (smoke) |
| TC-LVE-035 | Show balances for a year with data | Employee has ledger activity | 1. Enter year 2. Click `Show` | One row per leave type with numeric `Opening/Accrued/Carried Fwd/Used/Encashed/Reserved/Available/Liability` | P1 | Functional | Planned |
| TC-LVE-036 | Run Accrual mutates balances + ledger | Policy with accrual rules assigned | 1. Set year 2. Click `Run Accrual` | `Accrued`/`Available` increase per policy; new `Accrue` rows appear in `/leave-ledger` for the year | P1 | Functional | Planned |
| TC-LVE-037 | Liability computed from encashable balance | Row with encashable `Available` | 1. `Show` balances | `Liability` = encashable available × (active monthly gross ÷ 30), matching the footnote formula | P3 | Functional | Manual |
| TC-LVE-038 | Year with no data shows year-interpolated banner | Any employee | 1. Enter a future/empty year 2. `Show` | Banner reads "No balances found for <year>." with the entered year interpolated | P2 | Negative | Automated (smoke) |

### 4.9 Leave Ledger — `/leave-ledger`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-039 | Ledger loads with append-only banner (empty) | Logged in as HR | 1. Open `/leave-ledger` | Banner "Append-only — rows are never edited or deleted. Corrections post a new Adjust or Reverse entry referencing the original."; grid headers `Date, Employee, Leave Type, Txn, Days, Source Ref, Balance after, Posted by`; in-table "No transactions."; buttons `Filter`, `Export` | P2 | UI | Automated (smoke) |
| TC-LVE-040 | Filter by employee / type / date range | Ledger has rows | 1. Type into employee search (placeholder `All (search name / ID)`) 2. Pick a leave type in the select 3. Set from/to `date` inputs 4. `Filter` | Grid shows only matching transactions within the date window | P2 | Functional | Planned |
| TC-LVE-041 | Export ledger | Ledger has rows | 1. Click `Export` | A file download is triggered (asserted at request/download level, not persisted to the user's disk) | P3 | Functional | Manual |
| TC-LVE-042 | Corrections post as new Adjust/Reverse rows | Existing usage txn to correct | 1. Trigger a correction upstream 2. Reload ledger | Original row is unchanged; a new `Adjust` or `Reverse` row appears referencing the original — never an in-place edit/delete | P1 | Functional | Manual |
| TC-LVE-043 | Source Ref traces txn back to its request | Approved leave produced a txn | 1. Locate the usage row 2. Read `Source Ref` | `Source Ref` identifies the originating request (traceability for E2E assertions) | P2 | Functional | Planned |

### 4.10 Leave ↔ Attendance Sync — `/leave-attendance-sync`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-044 | Sync page loads with footnotes (empty) | Logged in as HR | 1. Open `/leave-attendance-sync` | Grid headers `Leave Ref, Employee, Dates, Attendance rows, LOP, Sync status`; in-table "No leave in this period."; footnotes about `IsLOP = 1` flowing to payroll and using `Recalculate period` after retroactive changes; buttons `Filter`, `Recalculate period` | P2 | UI | Automated (smoke) |
| TC-LVE-045 | Filter by period / branch / department | Approved leave exists | 1. Set the `number` year input + the three selects (period, branch, dept) 2. `Filter` | Grid lists approved leaves in the filtered month with their attendance rows and `LOP` flag | P2 | Functional | Planned |
| TC-LVE-046 | Recalculate period recomputes the filtered month | Filtered month has leave | 1. Set filters 2. Click `Recalculate period` | Engine re-runs for that month; `LOP`/`Sync status` values refresh to reflect current holiday/policy | P1 | Functional | Planned |
| TC-LVE-047 | Retroactive holiday changes LOP after recalc | Approved leave overlapping a new holiday | 1. Add a holiday overlapping an approved leave in `/holiday-list` 2. On sync page, filter that month 3. `Recalculate period` | Overlapping day drops from LOP (now a holiday); `Sync status`/`LOP` change accordingly | P1 | Functional | Manual |

### 4.11 Leave Encashment — `/leave-encashment`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-048 | Encashment page loads (no eligible type) | Employee, policy without encashable type | 1. Open `/leave-encashment` | Card `Request Encashment` with `Leave Type` select (`Choose`), `Days`, `Per Day Rate`, `Amount: 0`, `Submit Request`; inline notice "No leave type in your policy allows encashment."; card `My Requests` grid headers `SlNo, Leave Type, Days, Amount, Status` with "No requests." | P2 | UI | Automated (smoke) |
| TC-LVE-049 | Amount auto-computes (Days × Per Day Rate) | Encashable type in policy | 1. Choose leave type 2. Enter `Days` = 3 3. Enter `Per Day Rate` = 1000 | `Amount:` display updates to 3000 live on input change | P2 | Functional | Planned |
| TC-LVE-050 | Submit an encashment request (happy path) | Encashable type + available balance | 1. Fill type/days/rate 2. Click `Submit Request` | New row in `My Requests` with `Status` = pending; request appears in `/leave-encashment-approval` | P2 | Functional | Planned |
| TC-LVE-051 | Cannot submit with no encashable type | Policy allows no encashment | 1. Open form | The "No leave type in your policy allows encashment." notice is shown and the `Leave Type` select has no eligible options — form unusable | P1 | Negative | Automated (smoke) |
| TC-LVE-052 | Reject days exceeding available balance | Encashable type, small balance | 1. Enter `Days` greater than `Available` on `/leave-balances` 2. Submit | Submission blocked / rejected (cannot encash more than available) | P2 | Negative | Planned |

### 4.12 Encashment Approvals — `/leave-encashment-approval`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-053 | Approval worklist loads with five filters (empty) | Logged in as approver | 1. Open `/leave-encashment-approval` | Card `Encashment Requests`; button `Filter`; five native selects (year/branch/dept/type/status); grid headers `SlNo, Employee, Leave Type, Days, Amount, Status, Action`; in-table "No requests." | P2 | UI | Automated (smoke) |
| TC-LVE-054 | Approve an encashment request (row action) | Pending encashment exists | 1. Locate the request row 2. Approve via its `Action` control | Status → approved; posts an encashment txn to `/leave-ledger` and increments `Encashed` (and shrinks `Liability`) on `/leave-balances`; employee sees updated status on `/leave-encashment` | P2 | Functional | Planned |
| TC-LVE-055 | Reject an encashment request (row action) | Pending encashment exists | 1. Reject via the row `Action` | Status → rejected; no ledger/balance change; employee `My Requests` reflects rejection | P2 | Functional | Planned |
| TC-LVE-056 | Filter requests by status/type | Multiple requests exist | 1. Set the status + type selects 2. `Filter` | Grid narrows to matching requests (all five selects are unlabelled — target by position) | P3 | Functional | Planned |

### 4.13 Leave Approval Delegation — `/leave-delegation`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-057 | Registry loads read-only (empty) | Logged in as HR | 1. Open `/leave-delegation` | Card `Active & Past Delegations`; grid headers `SlNo, From, To, From Date, To Date, Active, Action`; in-table "No delegations."; **no create button on this page** | P2 | UI | Automated (smoke) |
| TC-LVE-058 | Delegation created via /leave-approval appears here | TC-LVE-030 executed | 1. Create a delegation from `/leave-approval` (`Delegate approvals` + `#custodianname`) 2. Open `/leave-delegation` | A new row shows `From`, `To`, the date window and `Active` = true | P2 | Functional | Planned |
| TC-LVE-059 | Deactivate a delegation (row Action) | An active delegation exists | 1. Use the row `Action` to deactivate | `Active` flips to false; the delegate no longer sees the delegated `/leave-approval` worklist | P3 | Functional | Manual |

### 4.14 Employee Duty Handover — `/employee-handover`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-060 | Handover page loads with inline form (empty) | Logged in as HR | 1. Open `/employee-handover` | Card `Set Up Handover` with selects `Employee going away` (`-- Select employee --`) + `Assign duties to` (`-- Select assignee --`), `From`/`To` dates, checkboxes `Cover approvals` (`#ca`), `Cover HRMS tasks` (`#ct`), `Active` (`#active`), `Note (optional)` textarea, `Save`/`Clear`; helper text "…Sales/CRM duties are never handed over."; card `All Handovers` grid headers `#, From, To, From Date, To Date, Covers, Active, Action` with "No handovers." | P2 | UI | Automated (smoke) |
| TC-LVE-061 | Create a handover (happy path) | Two employees exist | 1. Pick away employee + assignee 2. Set `From`/`To` 3. Tick `Cover approvals` + `Active` 4. `Save` | New row in `All Handovers` with both names, dates, `Active` = true | P1 | Functional | Planned |
| TC-LVE-062 | Covers cell reflects the ticked checkboxes | TC-LVE-061, with `#ca` + `#ct` ticked | 1. Tick both `Cover approvals` and `Cover HRMS tasks` 2. `Save` | The `Covers` cell lists both approvals and HRMS tasks (matches the ticked ids `ca`/`ct`) | P2 | Functional | Planned |
| TC-LVE-063 | Reject save with missing employee/assignee/dates | Form partly filled | 1. Leave `Employee going away` unset (or omit dates) 2. `Save` | Validation blocks save; no row added | P2 | Negative | Planned |
| TC-LVE-064 | Clear resets the handover form | Fields filled | 1. Click `Clear` | Selects return to placeholders, dates cleared, checkboxes unticked, note emptied; grid unchanged | P3 | Functional | Automated (smoke) |

### 4.15 Comp-Off — `/comp-offs`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-065 | Comp-off page loads with helper + empty state | Logged in as employee | 1. Open `/comp-offs` | Card `My Comp-Off Credits`; helper "Credits are earned automatically when you work an approved off-day / holiday, or you can request one below."; button `Request Comp-Off`; grid headers `Earned, Source, Days, Expiry, Status, Action`; in-table "No comp-off credits yet. Worked an off-day? Request one above." | P2 | UI | Automated (smoke) |
| TC-LVE-066 | Request a comp-off (happy path) | Employee worked an off-day/holiday | 1. Click `Request Comp-Off` 2. Fill the request (source/date/days) 3. Submit | New credit row appears with `Status` = Requested | P2 | Functional | Planned |
| TC-LVE-067 | Requested comp-off surfaces to management console | TC-LVE-066 done | 1. Log in as HR 2. Open `/comp-off-management` | The employee's credit appears with `Status` = Requested and `Grant`/`Reject` actions | P2 | Functional | Planned |

### 4.16 Comp-Off Management — `/comp-off-management`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-068 | Console loads with live data present | Logged in as HR | 1. Open `/comp-off-management` | Card `Comp-Off Credits — All Employees`; grid headers `SlNo, Employee, Earned, Source, Days, Expiry, Status, Action`; live row `Akshay ASK112 · 19/07/26 · worked in holiday · 1 · 17/10/26 · Requested · Grant Reject` present (do not assume an empty grid) | P2 | UI | Automated (smoke) |
| TC-LVE-069 | Grant a Requested credit | A `Requested` row exists | 1. On that row click `Grant` | Status → Granted; credit becomes usable balance (visible downstream in balances/ledger); employee sees the change on `/comp-offs` | P1 | Functional | Planned |
| TC-LVE-070 | Reject a Requested credit | A `Requested` row exists | 1. On that row click `Reject` | Status → Rejected; credit is not usable; employee `/comp-offs` reflects rejection | P2 | Functional | Planned |
| TC-LVE-071 | Pending-grant-only filter | Mixed statuses in grid | 1. Tick `Pending grant only` (`#reqOnly`) | Grid shows only `Requested` rows (e.g. Akshay's); unticking restores all rows | P2 | Functional | Automated (smoke) |

### 4.17 Holiday — `/holiday-list`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-072 | Holiday list loads with live row | Logged in as HR | 1. Open `/holiday-list` | Card `Holiday Calendar — 2026`; buttons `Calendar`, `Export`, `New Holiday`; search input (placeholder `Search by Holiday Name`); grid headers `Sl.No, Holiday Name, Dates, Calendar, Action`; live row `Onam · 24/08/2026 · State - Kerala` | P2 | UI | Automated (smoke) |
| TC-LVE-073 | Create a holiday in a named calendar | On `/holiday-list` | 1. Click `New Holiday` 2. Enter name + date + pick a calendar 3. Save | New holiday row appears with the chosen calendar in the `Calendar` column | P1 | Functional | Planned |
| TC-LVE-074 | Search by holiday name | ≥1 holiday exists | 1. Type `Onam` in the search input | Grid filters to matching holidays only | P2 | Functional | Automated (smoke) |
| TC-LVE-075 | Calendar view toggle | On `/holiday-list` | 1. Click `Calendar` | View switches to a calendar visualisation of the same holidays (list ↔ calendar toggle) | P2 | UI | Planned |
| TC-LVE-076 | Export holiday list | ≥1 holiday exists | 1. Click `Export` | A download is triggered (assert at request/download level) | P3 | Functional | Manual |

### 4.18 Holiday Assignment — `/holiday-assignment-list`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-077 | Assignment list loads with grid + buttons | Logged in as HR | 1. Open `/holiday-assignment-list` | Card `Holiday Assignment List`; buttons `Filter`, `New Holiday Assignment`; grid headers `Sl.No, Assignment Type, Assigned Target Name, Action` (note `Assigned Target Name`, not `Assignment Target Name`); no data rows | P2 | UI | Automated (smoke) |
| TC-LVE-078 | Assign a holiday calendar to a target | ≥1 calendar exists | 1. Click `New Holiday Assignment` 2. Choose assignment type + target 3. Save | New row shows the assignment type and `Assigned Target Name` | P1 | Functional | Planned |
| TC-LVE-079 | Filter holiday assignments | ≥1 assignment exists | 1. Click `Filter` 2. Apply a filter | Grid narrows to matching assignments | P2 | Functional | Planned |

### 4.19 Leave Reports — `/leave-reports`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-080 | Report hub loads with run-first placeholder | Logged in as HR | 1. Open `/leave-reports` | Report-type buttons `Register`, `Balance`, `Utilization`; `Filter`; filters `Year`, `Branch`, `Department`, `Leave Type`; card `Leave Register` showing "Choose a report type and click Run Report." (no result grid yet) | P2 | UI | Automated (smoke) |
| TC-LVE-081 | Run the Register report | Leave data exists | 1. Click `Register` 2. Set Year/Branch/Department/Leave Type 3. `Filter` (run) | Register result grid renders for the filter set; placeholder text disappears | P2 | Report | Planned |
| TC-LVE-082 | Run the Balance report | Leave data exists | 1. Click `Balance` 2. Set filters 3. `Filter` | Card title switches to the Balance report and its grid renders | P2 | Report | Planned |
| TC-LVE-083 | Run the Utilization report | Leave data exists | 1. Click `Utilization` 2. Set filters 3. `Filter` | Card switches to Utilization and renders its result | P2 | Report | Planned |
| TC-LVE-084 | Filter option integrity (incl. misspelling) | On `/leave-reports` | 1. Open Department select 2. Open Leave Type select | Department options are exactly `All Departments, 2D, DigitalMarkrting, Dotnet, Sales, SEO` (copy `DigitalMarkrting` verbatim); Leave Type options are `All Types, Casual leave, Earned leave, Maternity leave, Medical leave, Paternity leave` | P3 | UI | Automated (smoke) |

### 4.20 Absence Analytics — `/absence-analytics`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-085 | Dashboard loads with KPIs, charts & risk table | Logged in as HR | 1. Open `/absence-analytics` | KPI tiles `Absence rate` (% of scheduled days), `Unplanned share` (sick + same-day alerts), `Bradford alerts` (score > 250 YTD), `Avg days / employee`; chart cards `Monthly Absence Trend` and `Absence Rate By Department`; risk card `Bradford Factor — Highest Risk (S² × D)` with thresholds `Alert > 250 / Monitor > 125 / Normal`; table headers `SL No, Employee, Department, Spells (S), Days (D), Score (S²·D), Signal`; live row `Akshay · Dotnet · S=1 D=1 Score=1 · Normal` | P2 | UI | Automated (smoke) |
| TC-LVE-086 | Filter analytics by year/branch/department | On `/absence-analytics` | 1. Set `Year` + `Branch` + `Department` 2. `Filter` | KPI tiles, charts and the Bradford table recompute for the filter set | P3 | Report | Planned |
| TC-LVE-087 | Bradford signal follows S²·D thresholds | A row with known Spells/Days | 1. Read `Spells (S)`, `Days (D)`, `Score` 2. Compare `Signal` to thresholds | `Signal` = `Normal` (≤125), `Monitor` (>125), `Alert` (>250) — deterministically computable from S²·D (e.g. S=1,D=1 → Score 1 → Normal) | P2 | Functional | Planned |
| TC-LVE-088 | Export the risk table | On `/absence-analytics` | 1. Click `Export` | A download of the Bradford risk table is triggered | P3 | Functional | Manual |

### 4.21 Leave Calendar — `/leave-calendar`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-089 | Calendar loads asynchronously | Logged in as HR/manager | 1. Open `/leave-calendar` | Breadcrumb `Leave Calendar HRMS Leave Management Leave Calendar`; filters `Branch` (`All Branches`), `Department` (`All Departments`), `Employee` (placeholder `Type a name to filter…`), `Show`; "Loading calendar…" spinner appears then resolves to the calendar body (allow generous timeout) | P2 | UI | Planned |
| TC-LVE-090 | Show re-queries with branch/department filters | Approved leave exists | 1. Pick a `Branch` + `Department` 2. Click `Show` | Calendar re-renders showing only leave for the filtered scope | P3 | Functional | Planned |
| TC-LVE-091 | Filter by employee name | Approved leave exists | 1. Type an employee name in the `Employee` filter 2. `Show` | Calendar narrows to that employee's leave entries | P3 | Functional | Planned |

---

## 5. Known build quirks asserted AS-IS

These are captured behaviours of the current DEV build. Tests must assert them exactly, **not** "fix" them.

| Quirk | Where | Assert as |
|---|---|---|
| Two checkboxes share id `checkebox-sb` | `/leave-types` (`Support HalfDay`, `Need Document`) | Select by label / DOM order; never `#checkebox-sb` |
| Three filter selects share id `selectbox` | `/leave-approval` | Disambiguate by index/label (TC-LVE-029) |
| Five unlabelled native selects | `/leave-encashment-approval` | Target by position (TC-LVE-056) |
| Header wording differs between the two assignment lists | `Assignment Target Name` (`/leave-assignment-list`) vs `Assigned Target Name` (`/holiday-assignment-list`) | Keep selectors page-specific (TC-LVE-015 / TC-LVE-077) |
| Department option misspelled `DigitalMarkrting` | `/leave-reports`, `/absence-analytics` | Copy verbatim in selectors (TC-LVE-084) |
| Empty grids render header rows only OR a single message row | most Leave grids | Assert message string / data-row count, not table presence (throughout §4) |
| Live seeded data exists — grids are NOT empty | `/comp-off-management` (Akshay ASK112, Requested), `/holiday-list` (Onam), `/absence-analytics` (Akshay/Dotnet) | Do not assume empty grids (TC-LVE-068 / 072 / 085) |
| Append-only ledger — no edits/deletes | `/leave-ledger` | Corrections appear as new `Adjust`/`Reverse` rows referencing the original (TC-LVE-042) |
| Calendar body loads async behind "Loading calendar…" | `/leave-calendar` | Wait for spinner to clear before asserting (TC-LVE-089) |
| Breadcrumb group is `Leave` (not `HRMS`) on approval pages | `/leave-approval` (`Leave » Leave Approval`) | Page-specific breadcrumb assertions |
| Card title interpolates the year | `/leave-balances` (`Balance Detail — 2026`), `/leave-balances` banner "No balances found for <year>." | Assert with the interpolated year (TC-LVE-034 / 038) |

---

## 6. End-to-end / integration cases

| ID | Title | Chain (pages) | Steps (condensed) | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-LVE-092 | Full leave lifecycle — config → request → approve → ledger/balance/sync | `/leave-types` → `/leave-patterns` → `/leave-policy` → `/leave-assignment-list` → `/ess/leave` (or `/leave-request-list`) → `/leave-approval` → `/leave-ledger` + `/leave-balances` + `/leave-attendance-sync` | 1. Seed a leave type, pattern, policy rules, and assign the pattern to the employee 2. Employee applies for leave via `/ess/leave` `Apply For Leave` (or `New Leave Request`) 3. Approver ticks the row and `Approve Selected` on `/leave-approval` 4. Verify ledger + balances + sync | Request shows Pending → Approved; a usage txn posts to `/leave-ledger` (with `Source Ref` back to the request); `/leave-balances` `Used` increases and `Available` drops; `/leave-attendance-sync` materialises the leave onto attendance rows with correct `LOP`/`Sync status` | P1 | E2E | Planned |
| TC-LVE-093 | Accrual posts to ledger and updates balances | `/leave-policy` → `/leave-balances` → `/leave-ledger` | 1. Ensure the assigned policy has accrual rules 2. Click `Run Accrual` on `/leave-balances` for the year 3. Inspect ledger | `Accrue` rows appear in `/leave-ledger`; `Accrued`/`Available` on `/leave-balances` reflect the accrued amount | P1 | E2E | Planned |
| TC-LVE-094 | Encashment lifecycle to payroll | `/leave-balances` → `/leave-encashment` → `/leave-encashment-approval` → `/leave-ledger` + `/leave-balances` → `/employee-salary-process` | 1. Confirm encashable `Available` balance 2. Employee submits on `/leave-encashment` (Amount = Days × Per Day Rate) 3. Approver approves on `/leave-encashment-approval` 4. Verify ledger/balance and payroll input | Request Status → Approved; encashment txn posts to `/leave-ledger`; `/leave-balances` `Encashed` rises and `Liability` shrinks; encashed amount is available as salary input in `/employee-salary-process` | P2 | E2E | Planned |
| TC-LVE-095 | Comp-off earn/request → grant → usable balance | `/comp-offs` → `/comp-off-management` → `/leave-balances` (→ request/approval/ledger) | 1. Employee requests a comp-off on `/comp-offs` (or auto-earn from a worked holiday) 2. HR `Grant`s it on `/comp-off-management` 3. Verify usable balance | `/comp-offs` status → Granted; the credit becomes usable balance (visible in balances/ledger) until its `Expiry`; can then be consumed through the request → approval → ledger chain | P2 | E2E | Planned |
| TC-LVE-096 | Retroactive holiday → attendance-sync recalculation | `/holiday-list` → `/leave-attendance-sync` (→ payroll finalization) | 1. Approve a leave overlapping a working day 2. Add a holiday on that day in `/holiday-list` 3. On `/leave-attendance-sync` filter that month and `Recalculate period` | The overlapped day flips (holiday, not LOP); `LOP`/`Sync status` update; corrected `IsLOP` flags flow to payroll at finalization | P1 | E2E | Manual |
| TC-LVE-097 | Approver continuity — delegation & handover | `/leave-approval` → `/leave-delegation`; `/employee-handover` → `/leave-approval` | 1. Approver A `Delegate approvals` to custodian B (verify row in `/leave-delegation`) 2. Separately, HR sets up `/employee-handover` with `Cover approvals` for A's window 3. Log in as the delegate/assignee | Delegate/assignee sees and can action A's `/leave-approval` worklist during the active window; Sales/CRM duties are never included; deactivating the delegation/handover removes access | P2 | E2E | Manual |

---

**Totals:** 97 test cases (`TC-LVE-001` … `TC-LVE-097`) across 21 pages; 14 scenarios (`SC-LVE-01` … `SC-LVE-14`).
