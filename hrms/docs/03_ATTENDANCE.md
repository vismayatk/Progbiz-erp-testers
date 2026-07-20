# HRMS — Attendance & Time

## Overview

The Attendance & Time sub-module of the Progbiz HRMS ERP (https://hrms-erp.progbiz.in) covers everything from shift definition to month-end attendance lock. Administrators define shift masters on `/shifts` and map them to the organisation on `/shift-roster` using a scope hierarchy (Company → Branch → Department → Employee, most-specific wins). Raw punch data arrives from biometric devices (`/data-from-device`) and from mobile field check-ins (`/add-visit-report`), with geofence locations (`/geofences`) governing where mobile punches are valid. The processed day-level attendance is viewed on `/attendance-log`, corrected through `/regularization`, and pushed through approval queues: worked-day approval (`/approval-operation` → `/approval-operation-report`), absent-day approval (`/approval-absent` → `/approval-absent-report`) and overtime approval (`/overtime-approval`). `/timesheet` reconciles attendance hours against task hours, `/attendance-report-pack` produces an exportable Daily Register, and `/attendance-finalization` runs the pay-cycle cut-off that locks the period for payroll. For QA purposes the sub-module splits into two UI generations: newer "Attendance"-breadcrumb pages with inline filter bars and card layouts, and older "HRMS"-breadcrumb report pages whose grids stay empty until a `Filter` dialog is applied.

## Page Index

| # | Page | Route | Purpose |
|---|------|-------|---------|
| 1 | Shifts | `/shifts` | Define shift masters (name, type, timing, night flag) |
| 2 | Shift Roster | `/shift-roster` | Assign shifts to company/branch/department/employee with effective dates |
| 3 | Attendance Log | `/attendance-log` | Day-wise processed attendance report per employee |
| 4 | Data from device | `/data-from-device` | Raw biometric/device punch records with sync details |
| 5 | Add Visit Report | `/add-visit-report` | Mobile site-visit check-in/check-out log with location evidence |
| 6 | Regularization | `/regularization` | Raise and track attendance correction requests |
| 7 | Overtime Approval | `/overtime-approval` | Approve overtime minutes and mark payout/export status |
| 8 | Attendance Finalization | `/attendance-finalization` | Start/refresh and finalize a pay-cycle attendance run |
| 9 | Geofence Locations | `/geofences` | Maintain geofence points (lat/long/radius) for mobile punching |
| 10 | Timesheet | `/timesheet` | Compare daily attendance hours vs task hours per employee |
| 11 | Attendance Report Pack | `/attendance-report-pack` | Exportable Daily Register report with pagination |
| 12 | Approval Operation | `/approval-operation` | Approve worked-day attendance records (late/early/OT detail) |
| 13 | Approval Operation Report | `/approval-operation-report` | Review/delete already-approved worked-day records |
| 14 | Approval Absent | `/approval-absent` | Approve absent-day records |
| 15 | Approval Absent Report | `/approval-absent-report` | Review/delete already-approved absent-day records |

## Pages

### Shifts (`/shifts`)

- **Purpose** — Master screen for shift definitions: the catalogue of shifts (name, type, timing, night-shift flag, active state) that every other attendance calculation resolves against.
- **UI elements** — `New Shift` button (opens the create-shift form/modal); card titled `Shift Definitions`; text input with placeholder `Search by shift name`; two unlabeled single-select filters (type/active-style filters).
- **Data grid** — Columns: `Sl.No`, `Shift Name`, `Type`, `Timing`, `Night`, `Active`, `Action`. One row = one shift definition; `Action` holds per-row edit/manage controls.
- **Connections** — Feeds `/shift-roster` (a roster assignment picks a shift from this list); shift name surfaces again in `/overtime-approval` (`Shift` column) and `/timesheet` (`Shift` column). Breadcrumb group: Attendance.
- **Automation notes** — Capture shows `rowCount: 1` with an empty first row, i.e. the tbody renders a single empty/placeholder row when no data matches — assert on cell text, not row count. `Search by shift name` placeholder is a stable locator (`getByPlaceholder`). `New Shift` should open a creation dialog — test both create and the `Active` toggle round-trip.

### Shift Roster (`/shift-roster`)

- **Purpose** — Assigns a shift to an organisational scope for a date range. On-page help text states: "Pick the branch, department or employee for this assignment. The most-specific assignment wins when a shift is resolved. Sub-departments inherit the parent department's shift unless they have an assignment of their own."
- **UI elements** — Two cards: `Assign A Shift` (inline form) and `Current Assignments` (grid). Form fields: `Shift*` (select, default `-- select --`), `Scope*` (select with `Company` / `Branch` / `Department` / `Employee`), `Target` (text/lookup), `Effective From*` (date), `Effective To` (date), and the `Assign` submit button. Grid-side filters: text input `Search scope or shift...`, two selects, and checkbox `#activeOnlyCheck` (active-only toggle).
- **Data grid** — Columns: `Sl.No`, `Scope`, `Target`, `Shift`, `From`, `To`, `Active`. One row = one shift assignment at a given scope.
- **Connections** — Consumes shift masters from `/shifts`; resolved shift drives per-day expectations in `/attendance-log` (`Must Work Hour`), `/overtime-approval` and `/timesheet`.
- **Automation notes** — Mandatory fields marked `*`: Shift, Scope, Effective From — negative tests should submit with each missing. `Target` behaviour depends on chosen `Scope` (branch vs department vs employee lookup) — cover scope-switch re-rendering. `#activeOnlyCheck` is an id-based selector, rare and stable — use it. Precedence rule (most-specific wins, sub-department inheritance) is the key business assertion for E2E: create Company-level and Employee-level overlapping assignments and verify resolution.

### Attendance Log (`/attendance-log`)

- **Purpose** — Day-wise processed attendance report per employee: entry/exit, worked vs must-work hours, overtime and balance hours, plus per-day session details. Page header reads `Attendance Report`, breadcrumb `HRMS > Attendance Log`.
- **UI elements** — Single `Filter` button on the `Attendance Log` card; no inline inputs were captured, so filter criteria (employee/date range etc.) live inside a modal/offcanvas opened by `Filter`.
- **Data grid** — Columns: `SL.No`, `IDNumber`, `Employee Name`, `Date`, `Period`, `Employee Status`, `Entry Time`, `Exit Time`, `Worked Hours`, `Over Time Hours`, `Balance Working Hours`, `Must Work Hour`, `Fixed Hours`, `Total Hours`, `Session Details`. One row = one employee-day of computed attendance.
- **Connections** — Aggregates raw punches from `/data-from-device` and `/add-visit-report`; corrected by approved `/regularization` requests; its worked-day rows feed the `/approval-operation` queue and OT minutes feed `/overtime-approval`; locked by `/attendance-finalization`.
- **Automation notes** — Grid `rowCount: 0` in the capture: data appears only after applying the `Filter` dialog — treat the filter as effectively mandatory and drive tests through it. `Session Details` is a drill-down cell (expect a per-row expander/dialog). Column set is wide — use horizontal-scroll-safe cell locators (header-index mapping) rather than nth-cell assumptions.

### Data from device (`/data-from-device`)

- **Purpose** — Raw punch stream from biometric/attendance devices: every punch with recognition type, device, sync time, location and captured image, plus whether the punching person is registered in the system.
- **UI elements** — `Filter` button on the `Data From Device` card; no inline inputs (filter fields are inside the Filter modal/offcanvas).
- **Data grid** — Columns: `SL.No`, `ID Number`, `Employee Name`, `Punching Time`, `Punch Type`, `Recognition Type`, `Is Registered In System`, `Device Name`, `Punching Sync Time`, `Location`, `Image`. One row = one raw device punch event.
- **Connections** — Upstream source for `/attendance-log` (punches are paired into entry/exit and sessions). `Is Registered In System` flags orphan punches that will not post to any employee's log — a useful QA probe. `Location`/`Image` columns tie into the geofence/mobile capture story (`/geofences`).
- **Automation notes** — `rowCount: 0` until `Filter` is applied — same mandatory-filter pattern as `/attendance-log`. `Image` cell presumably renders a thumbnail/link — assert element presence, not text. Good page for data-driven verification after simulating device pushes: filter by a known employee + date and assert the punch row appears with correct `Device Name` and `Punch Type`.

### Add Visit Report (`/add-visit-report`)

- **Purpose** — Log of mobile/field site-visit check-ins and check-outs with site, purpose and location evidence. Note the on-screen header is spelled `Add Vist Report` (UI typo) while the breadcrumb reads `Add visit report`; the inner card is titled `Attendance Log`.
- **UI elements** — `Filter` button; no inline inputs (filters in a modal/offcanvas).
- **Data grid** — Columns: `SL.No`, `IDNumber`, `Employee Name`, `CheckIn Time`, `CheckOut Time`, `Punch Type`, `Site Name`, `Purpose`, `Site Image`, `Mobile Location`, `Location`. One row = one site visit (check-in/check-out pair) by an employee.
- **Connections** — Second upstream punch source for `/attendance-log` (field attendance); validated against `/geofences` locations (mobile punching); `Site Image`/`Mobile Location` are the audit evidence columns.
- **Automation notes** — Match the header with the exact typo `Add Vist Report` if using text locators (or prefer the route/breadcrumb). `rowCount: 0` until `Filter` applied. `Site Image` renders media — assert presence/attribute. Card title `Attendance Log` duplicates the one on `/attendance-log` — never use that card title as a page discriminator; use URL or `h1` text.

### Regularization (`/regularization`)

- **Purpose** — Employees/admins raise attendance correction requests (missed or wrong punches, manual entries) and track their approval status.
- **UI elements** — Two cards: `Raise A Correction` (form) and `Requests` (grid). Form fields: `Employee*` (select, default `-- select --`), `Date*` (date), `Type*` (select with options `Missed Punch`, `Wrong Punch`, `Missed Check In`, `Missed Check Out`, `Manual Entry`), `In Time` (datetime-local), `Out Time` (datetime-local), `Reason` (textarea), `Attachment` (file input); buttons `Submit` and `Clear`. Grid filters: text input `Search employee or reason...`, two selects (type/status style), and a from/to `date` pair.
- **Data grid** — Columns: `Sl.No`, `Employee`, `Date`, `Type`, `In`, `Out`, `Reason`, `Status`, `Action`. One row = one correction request with its lifecycle `Status` and per-row `Action` (approve/reject/withdraw style controls).
- **Connections** — An approved regularization adjusts the employee-day in `/attendance-log` (entry/exit/worked hours), which in turn changes what `/approval-operation`, `/overtime-approval` and `/attendance-finalization` see. `Pending` regularizations are exactly what the `Pending` column on `/attendance-finalization` gates on before locking a period.
- **Automation notes** — Mandatory: `Employee`, `Date`, `Type`. `In Time` / `Out Time` are `datetime-local` inputs — fill with `YYYY-MM-DDTHH:mm` strings. File `Attachment` — cover both with and without upload. `Clear` button resets the form (assert fields return to defaults). Status transitions in the `Requests` grid are the core E2E: submit → row appears with pending status → act via `Action` → status change reflected.

### Overtime Approval (`/overtime-approval`)

- **Purpose** — Approval queue for computed overtime: per employee-day OT minutes with eligibility, payout and export-to-payroll status.
- **UI elements** — Card `Overtime Queue`. Filters: text input `Search employee or shift...`, two selects (status/eligibility style), and a from/to `date` pair. No page-level buttons — actions are per-row in the `Action` column.
- **Data grid** — Columns: `Sl.No`, `Employee`, `Date`, `Shift`, `OT Min`, `Eligible`, `Payout`, `Status`, `Exported`, `Action`. One row = one employee-day overtime record.
- **Connections** — OT minutes originate from `/attendance-log` (`Over Time Hours`) against the shift resolved by `/shift-roster`; `Exported` indicates handoff to payroll after approval; finalization (`/attendance-finalization`) is the downstream lock.
- **Automation notes** — No global submit — all mutations happen via row-level `Action` controls, so tests must locate rows by `Employee` + `Date` text. `Eligible`/`Exported` are boolean-style cells (badge/toggle) — assert rendered state. Filter by date range to bound the queue deterministically. Empty-capture row (`rowCount: 1`, blank cells) means an empty placeholder row exists — do not count rows to assert emptiness.

### Attendance Finalization (`/attendance-finalization`)

- **Purpose** — Month-end pay-cycle control: start or refresh an attendance finalization run for a scope, with a cut-off date, then track run status and pending items before lock.
- **UI elements** — Two cards: `Start / Refresh A Pay-Cycle Run` (form) and `Runs` (grid). Form fields: `Month*` (select, `January` … `December`), `Year*` (select, `2023`–`2027`), `Scope*` (select: `Company` / `Branch` / `Department` / `Employee`), `Target *` (select, default `-- select branch --`), `Cut-Off*` (date); `Finalize` button. Grid filters: text input `Search branch, department or employee...` plus three selects (period/scope/status style).
- **Data grid** — Columns: `Sl.No`, `Period`, `Scope`, `Target`, `Cut-Off`, `Pending`, `Status`, `Action`. One row = one finalization run for a period+scope, with `Pending` (unresolved items blocking lock) and run `Status`.
- **Connections** — The terminal step of the sub-module: consumes the corrected `/attendance-log`, requires approval queues (`/regularization`, `/approval-operation`, `/approval-absent`, `/overtime-approval`) to be cleared (surfaced via `Pending`), and locks the period for payroll consumption.
- **Automation notes** — All five form fields are mandatory. `Target` select's default text changes with `Scope` (`-- select branch --` when Branch) — dynamic dependent dropdown, cover the cascade. `Finalize` on an already-run period should behave as "refresh" per the card title — test idempotency. `Pending > 0` vs `Status` interplay is the key business assertion (should a run finalize with pending regularizations?).

### Geofence Locations (`/geofences`)

- **Purpose** — Maintain the geofence points (latitude/longitude/radius) that constrain mobile attendance punching, scoped to parts of the organisation.
- **UI elements** — `Add Location` button (also appears in the breadcrumb trail as a nav element); card `Locations`; filters: text input `Search location or target...` and two selects (scope/status style).
- **Data grid** — Columns: `Sl.No`, `Scope`, `Applies To`, `Name`, `Lat`, `Long`, `Radius`, `Status`, `Active`. One row = one geofence location and who it applies to.
- **Connections** — Governs validity of mobile punches surfacing in `/add-visit-report` (`Mobile Location`) and device/mobile punches in `/data-from-device` (`Location`). Same Scope/Applies-To pattern as `/shift-roster`.
- **Automation notes** — `Add Location` opens the create flow (likely modal with a map/lat-long form — verify at runtime). `Lat`/`Long`/`Radius` are numeric cells — assert numeric formats. `Status` vs `Active` are distinct columns (approval state vs on/off) — don't conflate in assertions. Placeholder `Search location or target...` is a stable locator.

### Timesheet (`/timesheet`)

- **Purpose** — Daily reconciliation of attendance hours against task-management hours per employee ("Daily Worked Hours Vs Task Hours").
- **UI elements** — Card `Daily Worked Hours Vs Task Hours`; filters: text input `Search employee...`, two selects (shift/status style), and a from/to `date` pair. No action buttons — read-only comparison view.
- **Data grid** — Columns: `Sl.No`, `Date`, `Employee`, `Shift`, `Status`, `Attendance Hrs`, `Task Hrs`, `Tasks`. One row = one employee-day comparing attendance hours to logged task hours; `Tasks` is the drill-down into the task list behind `Task Hrs`.
- **Connections** — `Attendance Hrs` comes from `/attendance-log` (worked hours); `Task Hrs`/`Tasks` come from the Task Management module (cross-module link); `Shift` from `/shift-roster` resolution.
- **Automation notes** — Read-only page: tests are assertion-heavy, no mutations. Cross-module fixture needed (an attendance day plus logged task hours) to assert both columns on one row. `Tasks` cell likely expands or links — assert navigability. Empty placeholder row pattern applies (`rowCount: 1`, blank).

### Attendance Report Pack (`/attendance-report-pack`)

- **Purpose** — Report-pack page under the Reports breadcrumb (`Reports > Attendance`) producing a paginated, exportable `Daily Register`.
- **UI elements** — `Export` button; a filter icon-button on the card header (opens the filter panel containing the captured 8 inputs: four selects + a from/to `date` pair + two more selects — branch/department/employee/status-style criteria); pagination controls `Previous` / `Next` with `Page 1` indicator; `Rows per page` selector with options `50 100 250 500` (screenshot shows default `100`); empty state text `No records.`
- **Data grid** — No table markup was captured in the empty state; once criteria are applied the `Daily Register` renders rows (one row = one employee-day register entry).
- **Connections** — Reporting face of `/attendance-log` data for a chosen period/scope; `Export` produces the downloadable register (payroll/audit handoff). Sits in the Reports menu group rather than Attendance.
- **Automation notes** — Assert the exact empty state `No records.` before filtering. The filter UI is behind an icon button (no text label) — locate by role/aria or position within the `Daily Register` card header next to `Export`. `Export` triggers a file download — use Playwright's `waitForEvent('download')`. Pagination test: change `Rows per page` and assert `Page 1` reset.

### Approval Operation (`/approval-operation`)

- **Purpose** — Approval queue for worked-day attendance records: each employee-day with entry/exit, worked/OT/balance hours and late/early minutes awaiting an approval decision.
- **UI elements** — `Filter` button on the `Attendance Log` card (criteria live in the Filter modal/offcanvas); per-row `Approval` column carries the decision control.
- **Data grid** — Columns: `SL No`, `IDNumber`, `Employee Name`, `Branch`, `Date`, `Entry Time`, `Exit Time`, `Status`, `Period Name`, `Hours Employee Must Work`, `Worked Hours`, `Over Time Hours`, `Balance Hours`, `Entry Late Miutes`, `Exit Early Miutes`, `Approval`. One row = one worked employee-day pending approval. (Note the UI typos `Entry Late Miutes` / `Exit Early Miutes` — keep exact text in locators.)
- **Connections** — Rows come from processed `/attendance-log` days; approving a row posts it to `/approval-operation-report` (where `Fixed Hours` / `Final Hours` are recorded); clearing this queue reduces `Pending` on `/attendance-finalization`.
- **Automation notes** — `rowCount: 0` until `Filter` applied — mandatory-filter pattern. Column headers contain misspellings (`Miutes`) — copy header text verbatim into header-map helpers or tests will fail on "corrected" spelling. The `Approval` cell is the mutation point — locate row by `IDNumber` + `Date`. Card is titled `Attendance Log` like two other pages — discriminate by URL/`h1`.

### Approval Operation Report (`/approval-operation-report`)

- **Purpose** — Post-approval register of worked-day records: what was approved, with fixed/final hours, permission-hour discounts and remarks; supports viewing details and deleting an approval.
- **UI elements** — `Filter` button on the `Approval Operation Report` card (criteria in Filter modal/offcanvas); per-row `Details` and `Delete` columns.
- **Data grid** — Columns: `SL No`, `IDNumber`, `Employee Name`, `Date`, `Entry Time`, `Exit Time`, `Balance Hours`, `Fixed Hours`, `Fixed Date`, `Discount from Permission Hours`, `Remarks`, `Final Hours`, `Details`, `Delete`. One row = one approved worked-day record.
- **Connections** — Downstream of `/approval-operation` (its approvals land here). `Discount from Permission Hours` links attendance to the leave/permission side of HRMS. `Delete` reverses an approval, returning the day to the `/approval-operation` queue.
- **Automation notes** — `rowCount: 0` until `Filter` applied. `Delete` is destructive — expect a confirm dialog; test cancel and confirm paths, then verify the record reappears in `/approval-operation`. `Details` opens a per-row drill-down (modal). Assert `Final Hours` equals expected computation after an approval round-trip from `/approval-operation`.

### Approval Absent (`/approval-absent`)

- **Purpose** — Approval queue for absent days: employee-days with no attendance, listed with branch/department and the period's required hours, awaiting an absence-approval decision.
- **UI elements** — `Filter` button on the `Approval Absent` card (criteria in Filter modal/offcanvas); per-row `Approval` column carries the decision control.
- **Data grid** — Columns: `SL NO`, `IDNumber`, `Employee Name`, `Branch`, `Department`, `Date`, `Period Name`, `Period Type`, `Hours Employee Must Work`, `Approval`. One row = one absent employee-day pending approval.
- **Connections** — Absent days are the complement of worked days in `/attendance-log`; approving posts the record to `/approval-absent-report`; clearing the queue feeds the `Pending` gate on `/attendance-finalization`. Logically adjacent to the Leave module (an approved leave should not surface here).
- **Automation notes** — `rowCount: 0` until `Filter` applied. Header casing is inconsistent across sibling pages (`SL NO` here vs `SL No` / `SL.No` elsewhere) — normalise case-insensitively in shared helpers. Locate rows by `IDNumber` + `Date`; the `Approval` cell is the mutation point.

### Approval Absent Report (`/approval-absent-report`)

- **Purpose** — Post-approval register of absent-day records with fixed/final hours and remarks; supports details drill-down and deletion of an approval.
- **UI elements** — `Filter` button on the `Approval Absent Report` card (criteria in Filter modal/offcanvas); per-row `Details` and `Delete` columns.
- **Data grid** — Columns: `SL No`, `IDNumber`, `Employee Name`, `Date`, `Period Name`, `Start Time`, `End Time`, `Balance Hours`, `Fixed Hours`, `Fixed Date`, `Remarks`, `Final Hours`, `Details`, `Delete`. One row = one approved absent-day record.
- **Connections** — Downstream of `/approval-absent`; `Delete` reverses the approval back into the `/approval-absent` queue; finalized figures roll into `/attendance-finalization` / payroll.
- **Automation notes** — `rowCount: 0` until `Filter` applied. Mirrors `/approval-operation-report` structurally — share a page-object base class; the differing columns are `Period Name`/`Start Time`/`End Time` here vs `Entry Time`/`Exit Time`/`Discount from Permission Hours` there. `Delete` destructive-action pattern: confirm dialog, then assert reappearance in `/approval-absent`.

## Process flows

- **Shift setup → resolution**: `/shifts` (`New Shift` creates the master) → `/shift-roster` (`Assign` maps shift to Company/Branch/Department/Employee with `Effective From/To`; most-specific assignment wins, sub-departments inherit) → resolved shift drives `Must Work Hour` in `/attendance-log`, `Shift` in `/overtime-approval` and `/timesheet`.
- **Punch capture → daily log**: biometric punches land in `/data-from-device` (with `Is Registered In System` flagging orphans) and mobile field visits land in `/add-visit-report` (validated against `/geofences` locations) → punches are paired into entry/exit sessions and surface as employee-days on `/attendance-log`.
- **Correction loop**: missing/wrong punch noticed on `/attendance-log` → request raised on `/regularization` (`Raise A Correction`: Employee, Date, Type, In/Out, Reason, Attachment) → request approved via the `Requests` grid `Action` → corrected times reflected back in `/attendance-log`.
- **Worked-day approval chain**: filtered employee-days on `/approval-operation` → per-row `Approval` decision → approved record appears in `/approval-operation-report` with `Fixed Hours`/`Final Hours` (and `Discount from Permission Hours`) → `Delete` there reverses the approval back to the queue.
- **Absent-day approval chain**: absent employee-days on `/approval-absent` → per-row `Approval` decision → record appears in `/approval-absent-report` with `Fixed Hours`/`Final Hours` → `Delete` reverses back to the queue.
- **Overtime chain**: OT minutes computed on `/attendance-log` → queued on `/overtime-approval` (`OT Min`, `Eligible`, `Payout`) → approval sets `Status` → `Exported` marks handoff to payroll.
- **Month-end lock**: once regularizations and the three approval queues are cleared → `/attendance-finalization` `Start / Refresh A Pay-Cycle Run` (Month, Year, Scope, Target, Cut-Off) → `Finalize` → run tracked in `Runs` with `Pending` count and `Status` → period locked for payroll.
- **Reporting**: `/timesheet` reconciles `Attendance Hrs` vs Task Management `Task Hrs` per day; `/attendance-report-pack` (Reports menu) filters and `Export`s the paginated `Daily Register` for the finalized period.
