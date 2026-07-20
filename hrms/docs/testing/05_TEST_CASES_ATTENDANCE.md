# HRMS Test Cases — Attendance & Time

> Part of the HRMS test-documentation set (`hrms/docs/testing/`). App: https://hrms-erp.progbiz.in · tenant `Hrms`.
> Grounded in hrms/docs/03_ATTENDANCE.md + hrms/data/pages/*.json (live crawl 2026-07-20).
> IDs: test cases `TC-ATT-###` · scenarios `SC-ATT-##`. Priority P1/P2/P3. Type: Functional / UI / Negative / E2E / Report. Automation: Automated (smoke) / Planned / Manual.

---

## 1. Scope — pages covered

| # | Page | Route | Archetype |
|---|------|-------|-----------|
| 1 | Shifts | `/shifts` | Config/list — `New Shift` button + grid |
| 2 | Shift Roster | `/shift-roster` | Inline-form (`Assign A Shift`) + grid |
| 3 | Attendance Log | `/attendance-log` | Filter-first report (`Filter` modal, empty until applied) |
| 4 | Data from device | `/data-from-device` | Filter-first report |
| 5 | Add Visit Report | `/add-visit-report` | Filter-first report (header typo `Add Vist Report`) |
| 6 | Regularization | `/regularization` | Inline-form (`Raise A Correction`) + grid |
| 7 | Overtime Approval | `/overtime-approval` | Inline-filter queue + per-row `Action` |
| 8 | Attendance Finalization | `/attendance-finalization` | Inline-form (`Start / Refresh A Pay-Cycle Run`) + grid |
| 9 | Geofence Locations | `/geofences` | Config/list — `Add Location` button + grid |
| 10 | Timesheet | `/timesheet` | Inline-filter, read-only comparison grid |
| 11 | Attendance Report Pack | `/attendance-report-pack` | Report/export with pagination (Reports menu) |
| 12 | Approval Operation | `/approval-operation` | Filter-first approval queue (per-row `Approval`) |
| 13 | Approval Operation Report | `/approval-operation-report` | Filter-first report + `Details`/`Delete` |
| 14 | Approval Absent | `/approval-absent` | Filter-first approval queue (per-row `Approval`) |
| 15 | Approval Absent Report | `/approval-absent-report` | Filter-first report + `Details`/`Delete` |

Two UI generations coexist: newer "Attendance"-breadcrumb pages (inline filter bars, card layouts) and older "HRMS"-breadcrumb report pages whose grids stay empty until a `Filter` dialog is applied.

---

## 2. Prerequisites & test data

**Environment / auth**
- URL `https://hrms-erp.progbiz.in`; login form fields `#companycode` = `Hrms`, `#signin-username` = `vismaya`, `#signin-password` = (test secret), `button[type=submit]`.
- Success criterion: URL leaves `/login` and lands on `/home`; the Attendance menu group is reachable from the sidebar.
- Role: an admin/HR user with Attendance module rights (create shifts, run finalization, act on approval queues).

**Seed data (create in this order — config chains before any attendance assertion)**
1. At least one **shift** on `/shifts` (e.g. `General 09-18`, day type, timing `09:00–18:00`, night = No, Active = Yes).
2. At least one **shift-roster** assignment on `/shift-roster` mapping that shift to a Company/Branch/Department/Employee scope with `Effective From` covering the test period. *Nothing on `/attendance-log`, `/overtime-approval`, `/timesheet` resolves without a roster.*
3. Optional **geofence** on `/geofences` if exercising mobile/field punches.
4. Punch data for the test employee-day: a biometric push visible on `/data-from-device` and/or a field visit on `/add-visit-report` (or via `/ess/attendance`).
5. A known **employee** with `IDNumber` (used as the row locator across report grids).

**Test-data notes**
- Date/period: pick a bounded range (e.g. a single day or the current pay month) so filtered grids are deterministic.
- `datetime-local` fields (regularization In/Out) take `YYYY-MM-DDTHH:mm` strings.
- Empty grids: several config grids render **one blank placeholder row** (`rowCount: 1`, empty cells). Assert on cell text, never on row count, to decide "empty".
- Report grids render `rowCount: 0` until their `Filter` dialog / criteria are applied.

**Locator conventions**
- Prefer route/URL and `h1` header text to discriminate pages; the card title `Attendance Log` is reused by `/attendance-log`, `/add-visit-report` and `/approval-operation` — never use it as a page discriminator.
- Copy column-header text **verbatim including typos** (`Entry Late Miutes`, `Exit Early Miutes`, `SL NO`) into header-map helpers.
- Stable placeholder/id locators: `Search by shift name`, `Search scope or shift...`, `#activeOnlyCheck`, `Search employee or reason...`, `Search employee or shift...`, `Search branch, department or employee...`, `Search location or target...`, `Search employee...`.

---

## 3. Scenarios (high level)

| Scenario ID | Title | Pages involved | Priority |
|---|---|---|---|
| SC-ATT-01 | Shift master lifecycle — create, search, toggle Active | `/shifts` | P1 |
| SC-ATT-02 | Roster assignment & most-specific precedence resolution | `/shift-roster`, `/attendance-log` | P1 |
| SC-ATT-03 | View computed day-log via mandatory Filter | `/attendance-log` | P1 |
| SC-ATT-04 | Biometric punch ingestion & orphan (`Is Registered`) detection | `/data-from-device` | P2 |
| SC-ATT-05 | Mobile field-visit reporting (with header typo) | `/add-visit-report`, `/geofences` | P2 |
| SC-ATT-06 | Regularization correction-request lifecycle | `/regularization`, `/attendance-log` | P1 |
| SC-ATT-07 | Overtime approval & payroll export | `/overtime-approval` | P2 |
| SC-ATT-08 | Pay-cycle finalization & period lock (pending gate) | `/attendance-finalization` | P1 |
| SC-ATT-09 | Geofence location management | `/geofences` | P2 |
| SC-ATT-10 | Timesheet attendance-vs-task reconciliation | `/timesheet` | P2 |
| SC-ATT-11 | Daily Register export & pagination | `/attendance-report-pack` | P2 |
| SC-ATT-12 | Worked-day approval queue → report → reversal | `/approval-operation`, `/approval-operation-report` | P1 |
| SC-ATT-13 | Absent-day approval queue → report → reversal | `/approval-absent`, `/approval-absent-report` | P1 |
| SC-ATT-14 | Daily attendance cycle end-to-end | all Attendance + `/employee-salary-process` | P1 |
| SC-ATT-15 | Filter-first empty-grid contract across report pages | `/attendance-log`, `/data-from-device`, `/add-visit-report`, `/approval-*`, `/timesheet`, `/attendance-report-pack` | P1 |

---

## 4. Detailed test cases

### 4.1 Shifts — `/shifts`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-001 | Create a new shift (happy path) | Logged in; on `/shifts` | 1. Click `New Shift`<br>2. In the create form/modal enter shift name, type, timing (start/end), night flag<br>3. Submit | Shift saved; a new row appears in the `Shift Definitions` grid with the entered `Shift Name`, `Type`, `Timing`, `Night`, `Active` = active | P1 | Functional | Automated (smoke) |
| TC-ATT-002 | New Shift — required-field validation | On `/shifts`; `New Shift` form open | 1. Click `New Shift`<br>2. Leave shift name (and timing) blank<br>3. Attempt to submit | Submission blocked; validation message shown; no new row added to the grid | P2 | Negative | Planned |
| TC-ATT-003 | Search by shift name filters grid | ≥2 shifts exist | 1. Type an existing shift name into `Search by shift name`<br>2. Observe grid | Only rows whose `Shift Name` matches the search text remain; non-matching rows are hidden | P2 | Functional | Automated (smoke) |
| TC-ATT-004 | Toggle Active state round-trip | ≥1 shift exists | 1. In a row's `Action`, toggle `Active` off<br>2. Reload / re-query row<br>3. Toggle back on | `Active` cell reflects each new state and persists after reload | P2 | Functional | Planned |
| TC-ATT-005 | Empty-grid placeholder handled correctly | No shift matches current search | 1. Search for a non-existent name | Grid shows a single blank placeholder row (`rowCount:1`, empty cells); assertion is on absence of matching cell text, not row count | P3 | UI | Planned |

### 4.2 Shift Roster — `/shift-roster`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-006 | Assign a shift at Company scope | ≥1 shift on `/shifts`; on `/shift-roster` | 1. In `Assign A Shift` pick `Shift*`, `Scope*` = `Company`, set `Effective From*`<br>2. Click `Assign` | New row in `Current Assignments` with `Scope` = Company, chosen `Shift`, `From` date, `Active` = active | P1 | Functional | Automated (smoke) |
| TC-ATT-007 | Mandatory-field validation | On `/shift-roster` | 1. Leave `Shift*` = `-- select --`, `Scope*` unset, `Effective From*` empty<br>2. Click `Assign` | Submission blocked; each missing required field (`Shift`, `Scope`, `Effective From`) flagged; no row added | P1 | Negative | Planned |
| TC-ATT-008 | Scope switch re-renders Target | On `/shift-roster` | 1. Set `Scope*` = `Company`, note `Target`<br>2. Change `Scope*` to `Branch`, then `Department`, then `Employee` | `Target` field re-renders per scope (branch vs department vs employee lookup); prior selection cleared/updated on each change | P2 | Functional | Planned |
| TC-ATT-009 | Filter grid + active-only toggle | ≥2 assignments incl. one inactive | 1. Type into `Search scope or shift...`<br>2. Check `#activeOnlyCheck` | Grid filters to matching scope/shift text; with `#activeOnlyCheck` checked only `Active` assignments remain | P2 | Functional | Automated (smoke) |
| TC-ATT-010 | Effective To before Effective From | On `/shift-roster` | 1. Set `Effective From*` = a date<br>2. Set `Effective To` = an earlier date<br>3. Click `Assign` | Submission rejected or `To` validated as ≥ `From`; no invalid-range row created | P2 | Negative | Planned |

### 4.3 Attendance Log — `/attendance-log`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-011 | Grid empty until Filter applied | On `/attendance-log`; no filter run | 1. Load page<br>2. Inspect grid body | Grid renders headers only, `rowCount: 0` — no data rows before `Filter` is applied | P1 | UI | Automated (smoke) |
| TC-ATT-012 | Apply Filter renders employee-days | Seeded roster + punches for a known employee/day | 1. Click `Filter`<br>2. Set employee + date range in the dialog<br>3. Apply | Grid renders one row per employee-day with `IDNumber`, `Employee Name`, `Date`, `Entry Time`, `Exit Time`, `Worked Hours`, `Must Work Hour`, etc. | P1 | Functional | Automated (smoke) |
| TC-ATT-013 | Session Details drill-down | ≥1 row after filter | 1. Click the `Session Details` cell of a row | A per-row session detail (expander/dialog) opens showing the paired punch sessions for that employee-day | P2 | Functional | Planned |
| TC-ATT-014 | Filter with no match yields empty grid | On `/attendance-log` | 1. Click `Filter`, set criteria with no data (e.g. future date)<br>2. Apply | No data rows rendered; page stays in empty/`rowCount:0` state; no error | P2 | Negative | Planned |
| TC-ATT-015 | Page identity — header vs breadcrumb | On `/attendance-log` | 1. Read `h1` and breadcrumb | `h1` = `Attendance Report`; breadcrumb = `HRMS > Attendance Log`; card title `Attendance Log` is NOT used to discriminate the page (reused elsewhere) | P3 | UI | Planned |

### 4.4 Data from device — `/data-from-device`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-016 | Grid empty until Filter applied | On `/data-from-device` | 1. Load page<br>2. Inspect grid | Headers only, `rowCount: 0` before `Filter` is applied | P1 | UI | Automated (smoke) |
| TC-ATT-017 | Filter renders raw punch row | A known biometric punch exists for employee+date | 1. Click `Filter`, set employee + date<br>2. Apply | Row appears with correct `ID Number`, `Punching Time`, `Punch Type`, `Device Name`, `Recognition Type`, `Punching Sync Time` | P2 | Functional | Automated (smoke) |
| TC-ATT-018 | Orphan punch flagged not-registered | A punch from an unregistered person exists | 1. Filter to include that punch | `Is Registered In System` reads the not-registered state for that punch (orphan that will not post to any employee log) | P2 | Functional | Planned |
| TC-ATT-019 | Image cell renders media | ≥1 punch row with captured image | 1. Inspect the `Image` cell of a row | Cell renders a thumbnail/link element; assert element/attribute presence, not text | P3 | UI | Planned |

### 4.5 Add Visit Report — `/add-visit-report`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-020 | Header typo asserted AS-IS | On `/add-visit-report` | 1. Read the page `h1` header | Header text is exactly `Add Vist Report` (misspelled) while breadcrumb reads `Add visit report` — assert the typo verbatim, do NOT "correct" it | P2 | UI | Automated (smoke) |
| TC-ATT-021 | Grid empty until Filter applied | On `/add-visit-report` | 1. Load page<br>2. Inspect grid | Headers only, `rowCount: 0` before `Filter` is applied | P1 | UI | Automated (smoke) |
| TC-ATT-022 | Filter renders site-visit row | A field visit exists for employee+date | 1. Click `Filter`, set employee + date<br>2. Apply | Row appears with `CheckIn Time`, `CheckOut Time`, `Punch Type`, `Site Name`, `Purpose`, `Mobile Location` | P2 | Functional | Planned |
| TC-ATT-023 | Site Image renders media | ≥1 visit row with image | 1. Inspect `Site Image` cell | Media element present; assert presence/attribute, not text | P3 | UI | Planned |
| TC-ATT-024 | Card title not a page discriminator | On `/add-visit-report` | 1. Note inner card title | Card title is `Attendance Log` (same as `/attendance-log`); page identity must be established via URL or `h1`, never this card title | P3 | UI | Planned |

### 4.6 Regularization — `/regularization`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-025 | Raise a correction (happy path) | On `/regularization`; test employee exists | 1. In `Raise A Correction` pick `Employee*`, `Date*`, `Type*` = `Missed Punch`<br>2. Fill `In Time`/`Out Time` (`YYYY-MM-DDTHH:mm`), `Reason`<br>3. Click `Submit` | Request saved; new row in `Requests` grid with the employee, date, type and a pending `Status`; per-row `Action` present | P1 | Functional | Automated (smoke) |
| TC-ATT-026 | Mandatory-field validation | On `/regularization` | 1. Leave `Employee*` = `-- select --`, `Date*` empty, `Type*` unset<br>2. Click `Submit` | Submission blocked; `Employee`, `Date`, `Type` flagged required; no row added | P1 | Negative | Planned |
| TC-ATT-027 | Type options present | On `/regularization` | 1. Open the `Type*` select | Options are exactly `Missed Punch`, `Wrong Punch`, `Missed Check In`, `Missed Check Out`, `Manual Entry` | P3 | UI | Automated (smoke) |
| TC-ATT-028 | Clear resets the form | Form partially filled | 1. Fill several fields<br>2. Click `Clear` | All form fields reset to defaults (`Employee*` back to `-- select --`, dates/times cleared, `Reason` empty) | P2 | Functional | Planned |
| TC-ATT-029 | Attachment optional | On `/regularization` | 1. Submit one request with no `Attachment`<br>2. Submit another with a file uploaded | Both submit successfully; attachment is optional, and the uploaded evidence is associated where provided | P2 | Functional | Planned |
| TC-ATT-030 | Act on request changes Status | ≥1 pending request in `Requests` | 1. Use the row `Action` to approve (or reject)<br>2. Observe `Status` | Row `Status` transitions from pending to the acted state and persists | P1 | Functional | Planned |
| TC-ATT-031 | Filter the Requests grid | ≥2 requests of differing type/status/date | 1. Type into `Search employee or reason...`<br>2. Set the type/status selects and the from/to `date` pair | Grid narrows to rows matching text + type/status + date range | P2 | Functional | Planned |

### 4.7 Overtime Approval — `/overtime-approval`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-032 | Filter OT queue by date range | OT rows exist (from `/attendance-log` OT minutes) | 1. Set the from/to `date` pair in `Overtime Queue`<br>2. Observe grid | Queue bounded to the date range; rows show `Shift`, `OT Min`, `Eligible`, `Payout`, `Status`, `Exported` | P2 | Functional | Planned |
| TC-ATT-033 | Approve OT via row Action | ≥1 OT row (locate by `Employee`+`Date`) | 1. In the target row's `Action`, approve the OT | Row `Status` updates to approved; no global submit button exists — mutation is per-row | P2 | Functional | Planned |
| TC-ATT-034 | Eligible / Exported state rendered | ≥1 OT row | 1. Inspect `Eligible` and `Exported` cells | Both render boolean-style state (badge/toggle); `Exported` reflects payroll handoff after approval | P3 | UI | Planned |
| TC-ATT-035 | Search employee or shift filters queue | ≥2 OT rows | 1. Type into `Search employee or shift...` | Grid narrows to rows matching the employee/shift text | P2 | Functional | Planned |
| TC-ATT-036 | Empty placeholder row handled | Empty queue | 1. Filter so no OT rows match | Grid shows a single blank placeholder row (`rowCount:1`, empty cells); emptiness asserted by cell text, not row count | P3 | UI | Planned |

### 4.8 Attendance Finalization — `/attendance-finalization`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-037 | Start a pay-cycle run (happy path) | Roster + attendance data for the period | 1. In `Start / Refresh A Pay-Cycle Run` set `Month*`, `Year*`, `Scope*` = `Branch`, `Target *`, `Cut-Off*`<br>2. Click `Finalize` | New row in `Runs` for that Period+Scope with a `Cut-Off`, a `Pending` count and a run `Status` | P1 | Functional | Automated (smoke) |
| TC-ATT-038 | All-mandatory validation | On `/attendance-finalization` | 1. Leave any of the five fields (`Month`, `Year`, `Scope`, `Target`, `Cut-Off`) unset<br>2. Click `Finalize` | Submission blocked; each missing field flagged; no run created | P1 | Negative | Planned |
| TC-ATT-039 | Scope → Target cascade | On `/attendance-finalization` | 1. Set `Scope*` = `Branch` and note `Target *` placeholder (`-- select branch --`)<br>2. Switch `Scope*` to `Department`, then `Employee` | `Target *` options and default text change to match the chosen scope (dependent dropdown cascade) | P2 | Functional | Planned |
| TC-ATT-040 | Finalize existing period = refresh | A run already exists for a period+scope | 1. Re-run `Finalize` with the same Month/Year/Scope/Target | Behaves as a refresh per the card title (no duplicate conflicting run; existing run's status/pending recomputed) — idempotent | P2 | Functional | Planned |
| TC-ATT-041 | Pending gate vs Status | Period with an open regularization/approval | 1. Ensure `Pending > 0` for a run<br>2. Attempt to finalize/lock | Run cannot lock while `Pending > 0` (or is clearly flagged); the business rule is that unresolved items block the lock | P1 | Functional | Manual |
| TC-ATT-042 | Filter the Runs grid | ≥2 runs | 1. Type into `Search branch, department or employee...`<br>2. Set the period/scope/status selects | Grid narrows to matching runs | P3 | Functional | Planned |

### 4.9 Geofence Locations — `/geofences`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-043 | Add a geofence location (happy path) | On `/geofences` | 1. Click `Add Location`<br>2. In the create flow set scope/applies-to, `Name`, `Lat`, `Long`, `Radius`<br>3. Save | New row in `Locations` with `Scope`, `Applies To`, `Name`, numeric `Lat`/`Long`/`Radius`, `Status`, `Active` | P2 | Functional | Automated (smoke) |
| TC-ATT-044 | Lat/Long/Radius numeric validation | `Add Location` form open | 1. Enter non-numeric / out-of-range lat-long or empty radius<br>2. Save | Submission rejected; numeric validation enforced on `Lat`, `Long`, `Radius`; no invalid row created | P2 | Negative | Planned |
| TC-ATT-045 | Search location or target filters grid | ≥2 locations | 1. Type into `Search location or target...` | Grid narrows to matching location name / applies-to target | P3 | Functional | Planned |
| TC-ATT-046 | Status vs Active are distinct | ≥1 location | 1. Inspect `Status` and `Active` columns of a row | The two columns are independent (approval/state vs on-off); assertions must not conflate them | P3 | UI | Planned |

### 4.10 Timesheet — `/timesheet`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-047 | Filter renders comparison rows | Attendance day + logged task hours for an employee | 1. Set `Search employee...`, shift/status selects, from/to `date` pair | Grid renders per employee-day rows with `Date`, `Employee`, `Shift`, `Status`, `Attendance Hrs`, `Task Hrs`, `Tasks` | P2 | Functional | Planned |
| TC-ATT-048 | Attendance Hrs vs Task Hrs on one row | Cross-module fixture seeded | 1. Locate the seeded employee-day row<br>2. Compare the two hour columns | `Attendance Hrs` (from `/attendance-log`) and `Task Hrs` (from Task Management) both populate on the same row with the expected values | P2 | Functional | Manual |
| TC-ATT-049 | Tasks cell drill-down | ≥1 row with task hours | 1. Click/expand the `Tasks` cell | The underlying task list behind `Task Hrs` is shown/navigable | P3 | Functional | Planned |
| TC-ATT-050 | Read-only page — no mutations | On `/timesheet` | 1. Inspect the page for action buttons | No mutation controls present (read-only comparison view); tests are assertion-only | P3 | UI | Automated (smoke) |

### 4.11 Attendance Report Pack — `/attendance-report-pack`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-051 | Empty state before filtering | On `/attendance-report-pack`, no criteria applied | 1. Load page<br>2. Read the `Daily Register` card body | Exact empty-state text `No records.` is shown; no register rows before criteria are applied | P1 | UI | Automated (smoke) |
| TC-ATT-052 | Apply filter renders Daily Register | Finalized/attendance data for a period+scope | 1. Open the filter panel (icon button next to `Export`)<br>2. Set branch/department/employee/status + from/to `date`<br>3. Apply | `Daily Register` renders one row per employee-day register entry; `No records.` no longer shown | P2 | Report | Planned |
| TC-ATT-053 | Export downloads the register | Register has rows | 1. Click `Export` | A file download is triggered (use `waitForEvent('download')`); downloaded register corresponds to the applied criteria | P2 | Report | Planned |
| TC-ATT-054 | Rows-per-page resets to Page 1 | Register has more than one page | 1. Change `Rows per page` among `50 / 100 / 250 / 500` (default `100`) | Page indicator resets to `Page 1`; page size updates accordingly | P3 | UI | Planned |
| TC-ATT-055 | Pagination Previous / Next | Multi-page register | 1. Click `Next`, then `Previous` | `Next` advances beyond `Page 1`; `Previous` returns; controls disabled appropriately at bounds | P3 | UI | Planned |

### 4.12 Approval Operation — `/approval-operation`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-056 | Grid empty until Filter applied | On `/approval-operation` | 1. Load page<br>2. Inspect grid | Headers only, `rowCount: 0` before `Filter` is applied | P1 | UI | Automated (smoke) |
| TC-ATT-057 | Approve a worked-day record | Worked employee-days exist after filter | 1. Click `Filter`, set employee/date, apply<br>2. Locate row by `IDNumber` + `Date`<br>3. Act via the `Approval` cell | The record is approved (leaves the pending queue); decision persists | P1 | Functional | Planned |
| TC-ATT-058 | Column-typo headers asserted AS-IS | On `/approval-operation` | 1. Read the header row | Headers include the exact misspellings `Entry Late Miutes` and `Exit Early Miutes` — copied verbatim into header maps; do NOT correct them | P2 | UI | Automated (smoke) |
| TC-ATT-059 | Approved row posts to report | An approved row from TC-ATT-057 | 1. Navigate to `/approval-operation-report`, filter to same criteria | The approved worked-day now appears in `/approval-operation-report` (with `Fixed Hours`/`Final Hours`) and no longer in the `/approval-operation` queue | P1 | Functional | Planned |

### 4.13 Approval Operation Report — `/approval-operation-report`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-060 | Grid empty until Filter applied | On `/approval-operation-report` | 1. Load page<br>2. Inspect grid | Headers only, `rowCount: 0` before `Filter` is applied | P1 | UI | Automated (smoke) |
| TC-ATT-061 | Details drill-down | ≥1 approved row after filter | 1. Click the `Details` control on a row | A per-row detail modal opens showing the approved record's breakdown | P2 | Functional | Planned |
| TC-ATT-062 | Delete reverses the approval | ≥1 approved row | 1. Click `Delete`; in the confirm dialog choose Cancel (assert no change)<br>2. Click `Delete` again; choose Confirm | Cancel keeps the row; Confirm removes it and returns the day to the `/approval-operation` queue | P1 | Functional | Manual |
| TC-ATT-063 | Final Hours equals expected | Known approval round-trip from `/approval-operation` | 1. Inspect `Fixed Hours`, `Discount from Permission Hours`, `Final Hours` | `Final Hours` equals the expected computed value (fixed hours minus permission discount) for the approved day | P2 | Functional | Manual |

### 4.14 Approval Absent — `/approval-absent`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-064 | Grid empty until Filter applied | On `/approval-absent` | 1. Load page<br>2. Inspect grid | Headers only, `rowCount: 0` before `Filter` is applied | P1 | UI | Automated (smoke) |
| TC-ATT-065 | Approve an absent-day record | Absent employee-days exist after filter | 1. Click `Filter`, set employee/date, apply<br>2. Locate row by `IDNumber` + `Date`<br>3. Act via the `Approval` cell | Absent day approved; leaves the queue and posts to `/approval-absent-report` | P1 | Functional | Planned |
| TC-ATT-066 | Header casing asserted AS-IS | On `/approval-absent` | 1. Read the header row | First column header is exactly `SL NO` (upper-case, differs from `SL No`/`SL.No` on sibling pages); normalise case-insensitively in shared helpers | P3 | UI | Planned |
| TC-ATT-067 | Approved leave should not surface | Employee with an approved leave for the date | 1. Filter `/approval-absent` to that employee/date | A day already covered by approved leave does not appear as an absent-day pending approval (leave-module adjacency) | P2 | Negative | Manual |

### 4.15 Approval Absent Report — `/approval-absent-report`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-068 | Grid empty until Filter applied | On `/approval-absent-report` | 1. Load page<br>2. Inspect grid | Headers only, `rowCount: 0` before `Filter` is applied | P1 | UI | Automated (smoke) |
| TC-ATT-069 | Details drill-down | ≥1 approved absent row | 1. Click `Details` on a row | A per-row detail modal opens for the approved absent record | P2 | Functional | Planned |
| TC-ATT-070 | Delete reverses back to queue | ≥1 approved absent row | 1. Click `Delete`, Cancel (assert no change)<br>2. Click `Delete`, Confirm | Confirm removes the record and returns the day to the `/approval-absent` queue | P1 | Functional | Manual |
| TC-ATT-071 | Column set differs from operation report | On `/approval-absent-report` | 1. Read the header row | Columns include `Period Name`, `Start Time`, `End Time` (vs `Entry Time`/`Exit Time`/`Discount from Permission Hours` on `/approval-operation-report`); shared page-object base must account for the difference | P3 | UI | Planned |

---

## 5. Known build quirks asserted AS-IS

These are captured live-crawl behaviours. Tests assert them verbatim so that a future "fix" is caught as an intentional change, not a silent regression.

| Quirk | Where | Asserted by |
|---|---|---|
| Header misspelled `Add Vist Report` (breadcrumb correctly `Add visit report`) | `/add-visit-report` `h1` | TC-ATT-020 |
| Column headers `Entry Late Miutes` / `Exit Early Miutes` (missing "n") | `/approval-operation` | TC-ATT-058 |
| First-column casing `SL NO` (vs `SL No` / `SL.No` on sibling pages) | `/approval-absent` | TC-ATT-066 |
| Card title `Attendance Log` reused on 3 pages — must not be a page discriminator | `/attendance-log`, `/add-visit-report`, `/approval-operation` | TC-ATT-015, TC-ATT-024 |
| Config grids render one blank placeholder row when empty (`rowCount:1`, empty cells) — assert on cell text, not row count | `/shifts`, `/shift-roster`, `/overtime-approval`, `/attendance-finalization`, `/geofences`, `/timesheet` | TC-ATT-005, TC-ATT-036 |
| Report grids render `rowCount:0` until a `Filter` dialog / criteria are applied | `/attendance-log`, `/data-from-device`, `/add-visit-report`, `/approval-*` | TC-ATT-011, TC-ATT-016, TC-ATT-021, TC-ATT-056, TC-ATT-060, TC-ATT-064, TC-ATT-068 |
| Exact empty-state string `No records.` before filtering | `/attendance-report-pack` | TC-ATT-051 |
| `h1` = `Attendance Report` but breadcrumb `HRMS > Attendance Log` | `/attendance-log` | TC-ATT-015 |

---

## 6. End-to-end / integration cases

> Seeding order for all E2E cases: **shifts → shift-roster** must exist before any attendance assertion (nothing resolves `Must Work Hour` / `Shift` without a roster). Punch data next, then the correction/approval queues, then finalization.

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ATT-072 | Daily attendance cycle (full happy path) | Clean test employee + branch | 1. `/shifts` → create shift (`New Shift`)<br>2. `/shift-roster` → `Assign` shift to the employee's scope with `Effective From`<br>3. Seed punches: `/data-from-device` (biometric) and/or `/add-visit-report` (field) and/or `/ess/attendance`<br>4. `/attendance-log` → `Filter` to employee/day; verify computed `Entry/Exit`, `Worked Hours`, `Must Work Hour`<br>5. `/approval-operation` → `Filter`, approve the worked day<br>6. `/overtime-approval` → approve any OT row<br>7. `/attendance-finalization` → `Finalize` the period with `Pending = 0`<br>8. `/employee-salary-process` → attendance feeds salary input | Each stage produces the expected downstream artefact; the finalized period is locked and consumed by `/employee-salary-process` | P1 | E2E | Manual |
| TC-ATT-073 | Regularization correction loop | An employee-day with a missed punch on `/attendance-log` | 1. Note the wrong/missing time on `/attendance-log`<br>2. `/regularization` → `Raise A Correction` (Employee, Date, Type, In/Out, Reason) → `Submit`<br>3. Approve via the `Requests` grid `Action`<br>4. Re-filter `/attendance-log` for the same day | Approved correction adjusts the employee-day (entry/exit/worked hours) on `/attendance-log`; the pending regularization is cleared so it no longer blocks finalization | P1 | E2E | Manual |
| TC-ATT-074 | Worked-day approval chain + reversal | Worked employee-days pending on `/approval-operation` | 1. `/approval-operation` → `Filter`, approve a row (locate by `IDNumber`+`Date`)<br>2. Verify it appears in `/approval-operation-report` with `Fixed Hours`/`Final Hours`<br>3. `/approval-operation-report` → `Delete` (confirm)<br>4. Re-check `/approval-operation` | Approval posts the record to the report; `Delete` reverses it, returning the day to the `/approval-operation` queue | P1 | E2E | Manual |
| TC-ATT-075 | Absent-day approval chain + reversal | Absent employee-days pending on `/approval-absent` | 1. `/approval-absent` → `Filter`, approve a row<br>2. Verify it appears in `/approval-absent-report`<br>3. `/approval-absent-report` → `Delete` (confirm)<br>4. Re-check `/approval-absent` | Approval posts to the absent report; `Delete` reverses it back to the `/approval-absent` queue; a day covered by approved leave never enters this queue | P1 | E2E | Manual |
| TC-ATT-076 | Overtime → payroll export chain | Roster + attendance producing OT minutes | 1. Confirm OT on `/attendance-log` (`Over Time Hours`)<br>2. `/overtime-approval` → `Filter`, approve the OT row → `Status` approved<br>3. Verify `Exported` reflects payroll handoff | OT minutes flow from log to queue; approval sets `Status`; `Exported` marks the payroll handoff | P2 | E2E | Planned |
| TC-ATT-077 | Month-end finalization gating | A period with at least one open regularization / approval | 1. Leave one regularization pending<br>2. `/attendance-finalization` → attempt `Finalize` for the period<br>3. Clear the pending item, re-`Finalize` | With pending items the run shows `Pending > 0` and does not lock; after all queues (`/regularization`, `/approval-operation`, `/approval-absent`, `/overtime-approval`) are cleared, `Pending = 0` and the period locks for payroll | P1 | E2E | Manual |

---

_Coverage: 15 Attendance pages · 77 test cases (TC-ATT-001…TC-ATT-077) · 15 scenarios (SC-ATT-01…SC-ATT-15). Every page has a happy-path primary action, at least one negative/validation or archetype check, and the filter-first empty-grid contract is asserted on all report pages._
