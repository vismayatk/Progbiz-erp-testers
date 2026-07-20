# HRMS — Leave Management

## Overview

The Leave Management sub-module of the Progbiz HRMS ERP (https://hrms-erp.progbiz.in) covers the full leave lifecycle: HR first defines the building blocks (leave types, leave patterns, pattern-level policy rules, holiday calendars) and assigns them to organisational targets (branch / department / employee). Employees then raise leave requests, comp-off requests and encashment requests from self-service pages, while approvers process them on dedicated approval screens with bulk approve/reject and delegation support. Every approved movement posts to an append-only leave ledger, from which employee balances (Opening / Accrued / Used / Encashed / Available / Liability) are computed live. A Leave ↔ Attendance Sync engine reconciles approved leave with attendance rows, flags LOP days (IsLOP = 1) that flow to payroll at finalization, and can recalculate a period after retroactive holiday or policy changes. Continuity tooling (approval delegation and employee duty handover) keeps approvals moving when an approver is away. Finally, reporting surfaces — Leave Reports (Register / Balance / Utilization), Absence Analytics (Bradford Factor, absence rate by department) and a team Leave Calendar — give HR oversight of absence across the organisation.

## Page Index

| # | Page | Route | Purpose |
|---|------|-------|---------|
| 1 | Leave Types | `/leave-types` | Master list of leave types (half-day support, document requirement) |
| 2 | Leave Patterns | `/leave-patterns` | Define named leave patterns (bundles of leave rules) |
| 3 | Leave Policy Configuration | `/leave-policy` | Configure policy rules for a chosen leave pattern |
| 4 | Leave Assignment List | `/leave-assignment-list` | Assign leave patterns to targets (branch/department/employee) |
| 5 | Leave Request | `/leave-request-list` | Employee self-service: raise and track leave requests |
| 6 | Leave Approval | `/leave-approval` | Approver worklist: approve/reject leave requests, bulk actions, delegation |
| 7 | My Leave Policy | `/my-leave-policy` | Employee view of their assigned leave policy per year |
| 8 | My Leave Balance | `/leave-balances` | Employee balance detail per leave type, computed from the ledger |
| 9 | Leave Ledger | `/leave-ledger` | Append-only transaction ledger of all leave movements |
| 10 | Leave ↔ Attendance Sync | `/leave-attendance-sync` | Reconcile approved leave with attendance rows, LOP flags, recalculation |
| 11 | Leave Encashment | `/leave-encashment` | Employee self-service: request encashment of eligible balance |
| 12 | Encashment Approvals | `/leave-encashment-approval` | Approver worklist for encashment requests |
| 13 | Leave Approval Delegation | `/leave-delegation` | View active & past approval delegations |
| 14 | Employee Duty Handover | `/employee-handover` | Hand an away employee's approvals/tasks to an assignee for a date window |
| 15 | Comp-Off | `/comp-offs` | Employee self-service: view/request comp-off credits |
| 16 | Comp-Off Management | `/comp-off-management` | HR/manager grant or reject comp-off credits for all employees |
| 17 | Holiday | `/holiday-list` | Holiday calendar master for the year |
| 18 | Holiday Assignment | `/holiday-assignment-list` | Assign holiday calendars to targets |
| 19 | Leave Reports | `/leave-reports` | Report hub: Register / Balance / Utilization reports |
| 20 | Absence Analytics | `/absence-analytics` | KPI dashboard: absence rate, Bradford Factor risk table |
| 21 | Leave Calendar | `/leave-calendar` | Visual calendar of leave across branch/department/employee |

## Pages

### Leave Types (`/leave-types`)

- **Purpose** — Master screen for defining leave types (e.g. casual, medical) and their per-type behaviour flags: whether half-day leave is supported and whether a supporting document is required.
- **UI elements** — Two cards on one page: `Leave Types` (grid) and `Add LeaveType` (inline create form). Form fields: text input `Leave Type Name*` (id `leavetypename`), checkboxes `Support HalfDay` and `Need Document` (both share id `checkebox-sb` — a duplicate-id hazard for selectors). Buttons: `Save`, `Clear`.
- **Data grid** — Columns: `SlNo`, `Leave Type Name`, `Is Support Half Day`, `Is Need Document`, `Action`. A row = one leave type definition. Captured with 0 rows.
- **Connections** — Leave types defined here populate the type dropdowns across the module: leave requests (`/leave-request-list`), policy configuration (`/leave-policy`), encashment (`/leave-encashment`), reports (`/leave-reports` shows `Casual leave`, `Earned leave`, `Maternity leave`, `Medical leave`, `Paternity leave` in its Leave Type filter) and ledger/balance views.
- **Automation notes** — Create form is inline (no modal). The two checkboxes have the *same* id `checkebox-sb`; select by label text or DOM order, not by id. `Leave Type Name*` is mandatory (starred). Table renders headers even when empty — assert on row count, not table presence.

### Leave Patterns (`/leave-patterns`)

- **Purpose** — List and create leave patterns — the named rule bundles that leave policy is configured against and that get assigned to employees.
- **UI elements** — Button `New Leave Pattern` (implies a create modal/form). Card: `Leave Patterns`.
- **Data grid** — Columns: `Sl.No`, `Leave Pattern Name`, `Details`, `Action`. A row = one leave pattern. Captured with 0 rows.
- **Connections** — Patterns created here are the input to `/leave-policy` (its only control is a `Leave Pattern` chooser) and to `/leave-assignment-list` (grid has a `Leave Pattern` column). An assigned pattern is what surfaces to the employee on `/my-leave-policy` ("Once HR assigns a leave pattern, your leave types, balances and rules appear here").
- **Automation notes** — No inputs captured on the list page itself, so `New Leave Pattern` almost certainly opens a modal — wait for the dialog after clicking. Empty grid renders headers only.

### Leave Policy Configuration (`/leave-policy`)

- **Purpose** — Configure the policy rules (entitlements, accrual etc.) attached to a leave pattern.
- **UI elements** — Single card `Choose A Leave Pattern` containing one native `select` labelled `Leave Pattern` with placeholder option `Choose` (confirmed by screenshot). No other controls render until a pattern is picked.
- **Data grid** — None on initial load.
- **Connections** — Consumes patterns from `/leave-patterns`; the configured policy governs what employees see on `/my-leave-policy`, which types are encashable on `/leave-encashment` ("No leave type in your policy allows encashment" when none qualify), and accrual behaviour behind `Run Accrual` on `/leave-balances`.
- **Automation notes** — The page is gated on the pattern select: the policy form only appears after choosing a value, so tests must seed at least one leave pattern first. Initial state has no buttons or tables — a good precondition assertion. Breadcrumb: `HRMS » Leave Policy`.

### Leave Assignment List (`/leave-assignment-list`)

- **Purpose** — Assign leave patterns to organisational targets so employees inherit a leave policy.
- **UI elements** — Buttons: `Filter`, `New Leave Assignment`. Card: `Leave Assignment`.
- **Data grid** — Columns: `Sl.No`, `Assignment Type`, `Assignment Target Name`, `Leave Pattern`, `Action`. A row = one pattern-to-target assignment (the `Assignment Type` column implies targets can be different entity kinds, mirroring `/holiday-assignment-list`).
- **Connections** — Consumes patterns from `/leave-patterns` (+ rules from `/leave-policy`). An assignment is the trigger that makes `/my-leave-policy` and `/leave-balances` non-empty for an employee, and enables raising typed requests on `/leave-request-list`.
- **Automation notes** — `New Leave Assignment` and `Filter` imply modal/panel interactions (no inline inputs captured). Empty grid renders headers only. Assert assignment visibility downstream via `/my-leave-policy` empty-state disappearing.

### Leave Request (`/leave-request-list`)

- **Purpose** — Employee self-service list to raise new leave requests and track their approval status.
- **UI elements** — Button: `New Leave Request`. Card: `Leave Request List`.
- **Data grid** — Columns: `Sl.No`, `Leave Type`, `Start Date`, `End Date`, `Approval Status`, `Remarks`, `Action`. A row = one leave request by the logged-in employee with its current approval status. Captured with 0 rows.
- **Connections** — Requires the employee to have an assigned policy (types come from `/leave-types` via the assigned pattern). Submitted requests appear in the approver worklist `/leave-approval`; on approval they post to `/leave-ledger`, reduce `Available` on `/leave-balances`, and surface in `/leave-attendance-sync`, `/leave-reports`, `/absence-analytics` and `/leave-calendar`.
- **Automation notes** — `New Leave Request` opens the create flow (expect a modal/form — no inline inputs captured on the list). `Approval Status` is the key column for end-to-end assertions after acting on `/leave-approval`. Empty grid = headers only, no empty-state text.

### Leave Approval (`/leave-approval`)

- **Purpose** — Approver worklist for pending leave requests, with bulk approve/reject and approval delegation.
- **UI elements** — Buttons: `Delegate approvals`, `Filter`, `Approve Selected`, `Reject Selected`, `Clear`. Helper text: "Bulk actions— tick the rows you want, then approve or reject them together". Inputs: a header row checkbox (select-all), three `select` filters all sharing id `selectbox`, and a text input id `custodianname` (delegate/custodian name — part of the `Delegate approvals` flow).
- **Data grid** — Columns: `SL.No`, `Employee Name`, `Leave Type`, `Details`, `Leave Status`, `Action`. A row = one employee leave request awaiting the approver's decision, with a per-row checkbox for bulk actions.
- **Connections** — Fed by `/leave-request-list` submissions. Approval posts a ledger transaction to `/leave-ledger` (Source Ref) and updates `/leave-balances` and `/leave-attendance-sync`. `Delegate approvals` creates records visible in `/leave-delegation`; `/employee-handover` with `Cover approvals` routes this worklist to an assignee.
- **Automation notes** — Bulk flow: tick checkboxes → `Approve Selected` / `Reject Selected` (`Clear` resets selection). Three selects share id `selectbox` — disambiguate by index or wrapping label. `custodianname` is a stable id for the delegation input. Breadcrumb group here is `Leave » Leave Approval` (unlike most pages which sit under `HRMS`).

### My Leave Policy (`/my-leave-policy`)

- **Purpose** — Read-only employee view of the leave policy (types, balances and rules) assigned to them for a chosen year.
- **UI elements** — `Year` number input + `Show` button. Empty state text: "No leave policy is assigned to you yet. Once HR assigns a leave pattern, your leave types, balances and rules appear here."
- **Data grid** — None captured (policy content renders only once a pattern is assigned).
- **Connections** — Populated by the `/leave-patterns` → `/leave-policy` → `/leave-assignment-list` chain. Companion self-service page to `/leave-balances`.
- **Automation notes** — The exact empty-state sentence is a reliable assertion for the "no policy assigned" precondition. `Year` is a plain `input[type=number]`; results load only after clicking `Show` (mandatory filter).

### My Leave Balance (`/leave-balances`)

- **Purpose** — Employee's per-leave-type balance sheet for a year, computed live from the leave ledger, including monetary liability.
- **UI elements** — `Year` number input, buttons `Show` and `Run Accrual`. Card: `Balance Detail — 2026`. Footnotes: "Balances are computed live from the leave ledger." and "Liability = encashable available balance × (active monthly gross ÷ 30)."
- **Data grid** — Columns: `Sl.No`, `Leave Type`, `Opening`, `Accrued`, `Carried Fwd`, `Used`, `Encashed`, `Reserved`, `Available`, `Liability`. A row = one leave type's balance breakdown for the selected year. Captured empty with in-table message "No balances found." plus banner "No balances found for 2026."
- **Connections** — Derived entirely from `/leave-ledger` transactions; `Used` reflects approvals from `/leave-approval`, `Encashed` reflects `/leave-encashment` → `/leave-encashment-approval`, `Accrued` is driven by policy rules (`/leave-policy`) and the `Run Accrual` action. `Available` gates what `/leave-encashment` allows.
- **Automation notes** — Two empty-state strings to assert: page-level "No balances found for 2026." (year-interpolated) and table cell "No balances found.". `Run Accrual` is a state-mutating action — after it, expect new `Accrue` rows in `/leave-ledger` and non-zero `Accrued` here. Card title interpolates the year (`Balance Detail — <year>`).

### Leave Ledger (`/leave-ledger`)

- **Purpose** — Append-only audit ledger of every leave transaction; the single source of truth balances are computed from.
- **UI elements** — Buttons: `Filter`, `Export`. Filters: employee text search (placeholder `All (search name / ID)`), one `select` (leave type/txn), and two `date` inputs (from/to). Banner: "Append-only — rows are never edited or deleted. Corrections post a new Adjust or Reverse entry referencing the original."
- **Data grid** — Columns: `Date`, `Employee`, `Leave Type`, `Txn`, `Days`, `Source Ref`, `Balance after`, `Posted by`. A row = one immutable ledger transaction (e.g. accrual, usage, encashment, adjust, reverse) with a running balance and originating reference. Captured empty ("No transactions.").
- **Connections** — Written to by approvals on `/leave-approval` and `/leave-encashment-approval`, by `Run Accrual` on `/leave-balances`, and by comp-off grants (`/comp-off-management`) where credits enter balance. Read by `/leave-balances` (live computation) and reporting pages.
- **Automation notes** — Never assert row edits/deletes — corrections appear as new `Adjust`/`Reverse` rows referencing the original (per the banner). `Source Ref` links a txn back to its originating request — useful for end-to-end traceability assertions. Employee filter placeholder `All (search name / ID)` is a stable selector hook. `Export` triggers a download.

### Leave ↔ Attendance Sync (`/leave-attendance-sync`)

- **Purpose** — Reconciliation screen showing how each approved leave maps onto attendance rows, with LOP flags and a period recalculation tool.
- **UI elements** — Buttons: `Filter`, `Recalculate period`. Filters: one `number` input (year) and three `select`s (period/month, branch, department per the filter pattern used module-wide). Footnotes: "LOP days carry IsLOP = 1 on the attendance row and flow to payroll at finalization." and "Use Recalculate period after a retroactive holiday/policy change to re-run the engine for the filtered month."
- **Data grid** — Columns: `Leave Ref`, `Employee`, `Dates`, `Attendance rows`, `LOP`, `Sync status`. A row = one approved leave and its attendance-side materialisation. Captured empty ("No leave in this period.").
- **Connections** — Consumes approved leave from `/leave-approval` (via the ledger). `LOP` output feeds payroll at finalization (cross-module). Retroactive changes to `/holiday-list` or `/leave-policy` are the documented trigger for `Recalculate period`.
- **Automation notes** — `Recalculate period` is a bulk recomputation for the *filtered month* — set filters first. Good regression test: approve leave overlapping a newly added holiday, run `Recalculate period`, assert `Sync status`/`LOP` changes. Empty state text: "No leave in this period."

### Leave Encashment (`/leave-encashment`)

- **Purpose** — Employee self-service page to convert encashable leave balance into money and track those requests.
- **UI elements** — Card `Request Encashment` with: `Leave Type` select (placeholder `Choose`), `Days` number input, `Per Day Rate` number input, computed display `Amount: 0`, and button `Submit Request`. Card `My Requests` for history. Inline notice when nothing is eligible: "No leave type in your policy allows encashment."
- **Data grid** — `My Requests` columns: `SlNo`, `Leave Type`, `Days`, `Amount`, `Status`. A row = one encashment request by the logged-in employee. Captured empty ("No requests.").
- **Connections** — Eligibility comes from the assigned policy (`/leave-policy` via `/leave-assignment-list`) and available balance on `/leave-balances`. Submitted requests go to `/leave-encashment-approval`; approval posts to `/leave-ledger` and increments `Encashed` on `/leave-balances` (which also computes `Liability` from encashable balance).
- **Automation notes** — `Amount` is auto-computed (Days × Per Day Rate) — assert the recalculation on input change. The "No leave type in your policy allows encashment" notice is the precondition empty-state; seeding an encashable type in the policy is required before the form is usable. Status transitions in `My Requests` after acting on the approval page are the key E2E assertion.

### Encashment Approvals (`/leave-encashment-approval`)

- **Purpose** — Approver worklist to approve or reject employee encashment requests.
- **UI elements** — Button: `Filter`. Five `select` filter controls (consistent with year/branch/department/type/status filtering). Card: `Encashment Requests`.
- **Data grid** — Columns: `SlNo`, `Employee`, `Leave Type`, `Days`, `Amount`, `Status`, `Action`. A row = one pending/processed encashment request across employees. Captured empty ("No requests.").
- **Connections** — Fed by `/leave-encashment` submissions. Approval posts an encashment transaction to `/leave-ledger` and updates `Encashed`/`Available`/`Liability` on `/leave-balances`.
- **Automation notes** — Row-level approve/reject actions live in the `Action` column (no bulk buttons captured, unlike `/leave-approval`). All five filter selects are unlabelled native selects — target by position or surrounding text. Empty state: "No requests."

### Leave Approval Delegation (`/leave-delegation`)

- **Purpose** — Registry of leave-approval delegations: who has handed approval authority to whom and for which date window.
- **UI elements** — Card: `Active & Past Delegations`. No create buttons on this page — delegations are created via `Delegate approvals` on `/leave-approval` (which carries the `custodianname` input).
- **Data grid** — Columns: `SlNo`, `From`, `To`, `From Date`, `To Date`, `Active`, `Action`. A row = one delegation record with its validity window and active flag. Captured empty ("No delegations.").
- **Connections** — Created from `/leave-approval` (`Delegate approvals`); while active, the delegate sees/actions the `/leave-approval` worklist. Related to (but distinct from) `/employee-handover`, which covers broader duty handover.
- **Automation notes** — Read/manage-only page: to test creation, drive the `Delegate approvals` flow on `/leave-approval` and assert the new row here. `Active` column + `Action` column suggest deactivation is done per-row. Empty state: "No delegations."

### Employee Duty Handover (`/employee-handover`)

- **Purpose** — HR tool to hand an away employee's HRMS approvals and HRMS/recruitment tasks to an assignee for a date window (explicitly excludes Sales/CRM duties).
- **UI elements** — Card `Set Up Handover`: selects `Employee going away` (`-- Select employee --`) and `Assign duties to` (`-- Select assignee --`), `From` / `To` date inputs, checkboxes `Cover approvals` (id `ca`), `Cover HRMS tasks` (id `ct`), `Active` (id `active`), textarea `Note (optional)`, buttons `Save` / `Clear`. Helper text: "Hand an away employee's HRMS approvals and HRMS/recruitment tasks to an assignee for a date window. Sales/CRM duties are never handed over." Card `All Handovers` (grid).
- **Data grid** — Columns: `#`, `From`, `To`, `From Date`, `To Date`, `Covers`, `Active`, `Action`. A row = one handover record showing what is covered and whether it is active. Captured empty ("No handovers.").
- **Connections** — With `Cover approvals` ticked, the assignee effectively receives the away employee's `/leave-approval` (and other HRMS approval) queues — the broader sibling of `/leave-delegation`. `Cover HRMS tasks` extends to HRMS/recruitment task queues outside this sub-module.
- **Automation notes** — Inline create form with stable checkbox ids `ca`, `ct`, `active` — good selectors. Date window (`From`/`To`) plus `Active` govern effectiveness; assert the `Covers` cell reflects the ticked checkboxes. Empty state: "No handovers."

### Comp-Off (`/comp-offs`)

- **Purpose** — Employee self-service view of compensatory-off credits earned by working off-days/holidays, with the ability to request a credit manually.
- **UI elements** — Button: `Request Comp-Off`. Card: `My Comp-Off Credits`. Helper text: "Credits are earned automatically when you work an approved off-day / holiday, or you can request one below."
- **Data grid** — Columns: `Earned`, `Source`, `Days`, `Expiry`, `Status`, `Action`. A row = one comp-off credit (auto-earned or requested) with its expiry and grant status. Captured empty with in-table message "No comp-off credits yet. Worked an off-day? Request one above."
- **Connections** — Requests raised here appear in `/comp-off-management` with `Status` `Requested` for grant/reject. Auto-earn is driven by attendance on days marked as holidays (`/holiday-list`) or off-days. Granted credits become usable leave balance (comp-off usage then flows through the request → approval → ledger chain).
- **Automation notes** — `Request Comp-Off` opens the request flow (no inline inputs captured — expect a modal). Distinct, quirky empty-state sentence is a reliable assertion. Status column transitions (`Requested` → granted/rejected) after acting on `/comp-off-management` are the E2E check.

### Comp-Off Management (`/comp-off-management`)

- **Purpose** — HR/manager console listing comp-off credits for all employees, to grant or reject pending requests.
- **UI elements** — Buttons: `Grant`, `Reject` (row-level actions). Checkbox filter `Pending grant only` (id `reqOnly`). Card: `Comp-Off Credits — All Employees`.
- **Data grid** — Columns: `SlNo`, `Employee`, `Earned`, `Source`, `Days`, `Expiry`, `Status`, `Action`. A row = one employee's comp-off credit. Captured with 1 live row: `Akshay ASK112` | earned `19/07/26` | source `worked in holiday` | `1` day | expiry `17/10/26` | status `Requested` | actions `Grant Reject`.
- **Connections** — Fed by `/comp-offs` requests and automatic earning (source `worked in holiday` ties back to `/holiday-list` + attendance). Granting turns the credit into usable balance (visible downstream in balances/ledger); the employee sees the status change on `/comp-offs`.
- **Automation notes** — `reqOnly` checkbox is a stable id for the pending-only filter. `Grant`/`Reject` are per-row buttons inside the `Action` cell of `Requested` rows. Real data exists on this environment (Akshay ASK112) — tests should not assume an empty grid. `Source` values like `worked in holiday` are free-text-ish labels; match loosely.

### Holiday (`/holiday-list`)

- **Purpose** — Maintain the organisation's holiday calendar(s) for the year — the base data for working-day maths, comp-off earning and attendance sync.
- **UI elements** — Buttons: `Calendar` (view toggle), `Export`, `New Holiday`. Search input with placeholder `Search by Holiday Name`. Card: `Holiday Calendar — 2026`.
- **Data grid** — Columns: `Sl.No`, `Holiday Name`, `Dates`, `Calendar`, `Action`. A row = one holiday with the calendar it belongs to. Captured with 1 row: `Onam` | `24/08/2026` | calendar `State - Kerala`.
- **Connections** — Holiday calendars are assigned to targets via `/holiday-assignment-list`. Holidays feed comp-off earning (`worked in holiday` source on `/comp-off-management`), the `/leave-attendance-sync` engine (retroactive holiday changes require `Recalculate period`), and scheduled-day denominators in `/absence-analytics`.
- **Automation notes** — `New Holiday` implies a create modal. `Calendar` button toggles a calendar visualisation of the same data. The `Calendar` *column* (e.g. `State - Kerala`) shows holidays are grouped into named calendars — create tests must pick one. Search input placeholder is a stable selector. `Export` triggers a download.

### Holiday Assignment (`/holiday-assignment-list`)

- **Purpose** — Assign holiday calendars to organisational targets so the right holiday set applies to each employee group.
- **UI elements** — Buttons: `Filter`, `New Holiday Assignment`. Card: `Holiday Assignment List`.
- **Data grid** — Columns: `Sl.No`, `Assignment Type`, `Assigned Target Name`, `Action`. A row = one calendar-to-target assignment. Captured with 0 rows.
- **Connections** — Consumes calendars from `/holiday-list`. The effective holiday set per employee drives `/leave-attendance-sync` results, comp-off auto-earning and working-day calculations in reports/analytics. Structural twin of `/leave-assignment-list`.
- **Automation notes** — `New Holiday Assignment` implies a modal (no inline inputs captured). Empty grid renders headers only. Note the header wording difference vs. leave assignments: `Assigned Target Name` here vs. `Assignment Target Name` there — keep selectors page-specific.

### Leave Reports (`/leave-reports`)

- **Purpose** — Report hub for leave data: pick a report type (Register / Balance / Utilization), set filters, and run it.
- **UI elements** — Report-type buttons: `Register`, `Balance`, `Utilization`; action button `Filter`. Filters: `Year` number input, `Branch` select (`All Branches`, `Main Branch`, `Chennai`), `Department` select (`All Departments`, `2D`, `DigitalMarkrting`, `Dotnet`, `Sales`, `SEO`), `Leave Type` select (`All Types`, `Casual leave`, `Earned leave`, `Maternity leave`, `Medical leave`, `Paternity leave`). Card: `Leave Register`. Hint: "Pick a report, set your filters, then run." / "Choose a report type and click Run Report."
- **Data grid** — None on initial load; the result grid renders only after running a report.
- **Connections** — Reads the data produced by the request/approval/ledger chain (`/leave-request-list` → `/leave-approval` → `/leave-ledger`) and balances. Leave Type options mirror `/leave-types` masters; Branch/Department options come from org masters shared with `/absence-analytics` and `/leave-calendar`.
- **Automation notes** — Running a report is a two-step interaction: click a report-type button, then `Filter`/run — the initial card shows the "Choose a report type and click Run Report." placeholder to assert against. Note the misspelled department option `DigitalMarkrting` — copy it exactly in selectors. Card title changes with the selected report (default `Leave Register`).

### Absence Analytics (`/absence-analytics`)

- **Purpose** — Analytics dashboard for absence health: KPI tiles, monthly trend, per-department absence rate and a Bradford Factor risk table.
- **UI elements** — Buttons: `Filter`, `Export`. Filters: `Year` number input, `Branch` select, `Department` select. KPI tiles: `Absence rate` (healthy, "% of scheduled days"), `Unplanned share` (watch, "sick + same-day alerts"), `Bradford alerts` ("score > 250 YTD"), `Avg days / employee`. Chart cards: `Monthly Absence Trend` (Jan–Dec, % of yearly total, current month highlighted) and `Absence Rate By Department` ("Absence rate = leave days ÷ scheduled working days (per department)"). Risk card: `Bradford Factor — Highest Risk (S² × D)` with thresholds `Alert > 250`, `Monitor > 125`, `Normal`.
- **Data grid** — Bradford table columns: `SL No`, `Employee`, `Department`, `Spells (S)`, `Days (D)`, `Score (S²·D)`, `Signal`. A row = one employee's Bradford Factor score and risk signal. Captured with 1 row: `Akshay` | `Dotnet` | S=1, D=1, Score=1 | `Normal`.
- **Connections** — Aggregates approved leave (ledger/attendance-sync data) against scheduled working days (holiday calendars from `/holiday-list`). Shares Branch/Department filter masters with `/leave-reports` and `/leave-calendar`.
- **Automation notes** — KPI values render as plain numbers/percentages in headers (`0%`, `0`, `0.01`) — snapshot-style assertions are fragile; prefer asserting tile labels + numeric format. Bradford `Signal` values (`Normal`, and by thresholds `Monitor`/`Alert`) are deterministic from Spells/Days — computable expected values. `Export` downloads the risk table. Live data exists (Akshay/Dotnet).

### Leave Calendar (`/leave-calendar`)

- **Purpose** — Visual calendar showing who is on leave, filterable by branch, department and employee name.
- **UI elements** — Filters: `Branch` select (`All Branches`), `Department` select (`All Departments`), `Employee` text input (placeholder `Type a name to filter…`), button `Show`. Screenshot confirms the calendar body loads asynchronously with a spinner and "Loading calendar…" text; breadcrumb `HRMS » Leave Management » Leave Calendar`.
- **Data grid** — None; the content is a calendar visualisation, not a table.
- **Connections** — Renders approved leave from the request/approval chain plus holidays; useful to managers before approving on `/leave-approval` (overlap awareness). Shares Branch/Department masters with `/leave-reports` and `/absence-analytics`.
- **Automation notes** — Async load: wait for the "Loading calendar…" spinner to disappear before asserting calendar content — the capture caught it mid-load, so allow generous timeouts. `Show` re-queries with current filters. Employee filter placeholder `Type a name to filter…` is a stable selector.

## Process flows

- **Policy setup (HR admin)**: define types in `/leave-types` → create a pattern in `/leave-patterns` → configure its rules in `/leave-policy` (page is gated on choosing a pattern) → assign the pattern to branch/department/employee in `/leave-assignment-list` → employee's `/my-leave-policy` empty state ("No leave policy is assigned to you yet…") is replaced by their types, balances and rules.
- **Holiday setup**: create holidays/calendars in `/holiday-list` (e.g. `Onam`, `State - Kerala`) → assign calendars to targets in `/holiday-assignment-list` → holidays drive working-day maths in attendance sync, comp-off earning and analytics; a retroactive holiday change requires `Recalculate period` on `/leave-attendance-sync`.
- **Leave request lifecycle**: employee raises a request via `New Leave Request` on `/leave-request-list` → it appears in the approver worklist `/leave-approval` (single or bulk `Approve Selected` / `Reject Selected`) → approval posts an immutable transaction to `/leave-ledger` (with `Source Ref` back to the request) → `/leave-balances` recomputes `Used`/`Available` live from the ledger → `/leave-attendance-sync` materialises the leave onto attendance rows (LOP days get `IsLOP = 1` and flow to payroll) → the leave shows up in `/leave-reports`, `/absence-analytics` and `/leave-calendar`.
- **Accrual**: `Run Accrual` on `/leave-balances` applies the pattern's accrual rules → posts `Accrue` transactions to `/leave-ledger` → `Accrued` and `Available` columns update.
- **Encashment lifecycle**: employee submits on `/leave-encashment` (`Leave Type` must be encashable per policy; `Amount` = Days × Per Day Rate) → request lands in `/leave-encashment-approval` → approval posts to `/leave-ledger` → `/leave-balances` shows it under `Encashed` and `Liability` shrinks (Liability = encashable available balance × monthly gross ÷ 30).
- **Comp-off lifecycle**: employee works an approved off-day/holiday (auto-earn) or clicks `Request Comp-Off` on `/comp-offs` → credit appears as `Requested` in `/comp-off-management` (e.g. Akshay ASK112, source `worked in holiday`, with expiry) → HR clicks `Grant` or `Reject` → granted credit becomes usable balance until its `Expiry` date.
- **Approver continuity**: approver clicks `Delegate approvals` on `/leave-approval` (custodian name input) → delegation recorded in `/leave-delegation` (`From`/`To`/date window/`Active`) → alternatively HR sets up a broader `/employee-handover` with `Cover approvals` / `Cover HRMS tasks` for a date window (Sales/CRM duties never handed over) → the assignee works the away employee's approval queues.
- **Oversight loop**: `/leave-reports` (Register / Balance / Utilization) and `/absence-analytics` (absence rate, unplanned share, Bradford Factor S²·D with Alert > 250 / Monitor > 125) surface aggregate outcomes of all the flows above; `/leave-calendar` gives managers a visual overlap check before approving new requests.
