# HRMS Test Cases — My Workspace (ESS)

> Part of the HRMS test-documentation set (`hrms/docs/testing/`). App: https://hrms-erp.progbiz.in · tenant `Hrms`.
> Grounded in hrms/docs/05_ESS_MY_WORKSPACE.md + hrms/data/pages/*.json (live crawl 2026-07-20).
> IDs: test cases `TC-ESS-###` · scenarios `SC-ESS-##`. Priority P1/P2/P3. Type: Functional / UI / Negative / E2E / Report. Automation: Automated (smoke) / Planned / Manual.

---

## 1. Scope — pages covered

| # | Page | Route | Archetype |
|---|------|-------|-----------|
| 1 | My Workspace (Dashboard) | `/ess` | Async dashboard — KPI tiles + profile card + quick actions + widgets |
| 2 | My Profile | `/ess/profile` | Read-only overview + "Request A Change" form (ESS write-path → approval) |
| 3 | My Requests | `/ess/requests` | List / empty-state card |
| 4 | My Leave | `/ess/leave` | Inline form + two grids; `Show` / `Submit Request` |
| 5 | My Handover | `/my-handover` | Inline form + grid; `Save` / `Clear` |
| 6 | My Attendance | `/ess/attendance` | Filter-first grid; `Show` + `Regularize` / `Raise OT` |
| 7 | My Locations | `/ess/locations` | Leaflet map + form; `Use my location` / `Submit for approval` |
| 8 | My Documents | `/ess/documents` | Upload form (file input) + grid |
| 9 | My Letters | `/ess/letters` | Request card + Published Letters grid |
| 10 | My Pay | `/ess/payslips` | Filter-first grid; `Show` |
| 11 | My Probation | `/ess/probation` | Read-only status / empty-state |

---

## 2. Prerequisites & test data

- **Auth:** login at `/login` with company code `Hrms`, test user `vismaya` — selectors `#companycode`, `#signin-username`, `#signin-password`, `button[type=submit]`. Success = URL leaves `/login` and lands on `/home`.
- **Test employee:** `Vismaya`, Employee Code **PB1053**, Branch **Main Branch**, Designation **Testing Team lead**, Phone **+919747832341**, status **Confirmed** (used to assert the "not on probation" state). Data reflected on `/ess/profile` and the `/ess` profile card.
- **Fixtures:** file upload uses `erp/common/sample-document.txt` for `/ess/documents` (`setInputFiles`).
- **Admin counterpart access** required for section 6 round-trips: `/leave-request-list`, `/leave-approval`, `/regularization`, `/overtime-approval`, `/geofences`, `/approvals`, `/letters/generate`, `/employee-salary-process`, `/employee-handover`.
- **Async-load waits:** `/ess` and `/ess/probation` show a "Loading your workspace…" placeholder — wait for it to clear (`waitForFunction` on body text not matching `/loading/i`) before asserting.
- **Filter-first pages:** `/ess/attendance`, `/ess/payslips`, `/ess/leave` render empty grids until `Show` (date/period/year) is applied — apply filters before asserting rows.
- **State note:** on the fresh/confirmed test user, most ESS grids are empty (`No balances.`, `No leave requests.`, `No attendance in range.`, `No documents on file.`, `No letters published to you.`, `No payslips found.`, `No handovers set up.`, `You have no change requests.`). Positive/write cases seed their own data or run in section 6 round-trips.

---

## 3. Scenarios (high level)

| Scenario ID | Title | Pages involved | Priority |
|---|---|---|---|
| SC-ESS-01 | Employee logs in and views the personalized ESS dashboard | `/ess` | P1 |
| SC-ESS-02 | Employee views own profile and submits a field-change request | `/ess/profile`, `/ess/requests` | P1 |
| SC-ESS-03 | Employee tracks the status of submitted change requests | `/ess/requests` | P2 |
| SC-ESS-04 | Employee views leave balances and applies for leave | `/ess/leave` | P1 |
| SC-ESS-05 | Employee sets up a duty handover to a colleague | `/my-handover` | P2 |
| SC-ESS-06 | Employee reviews own attendance and raises regularization / OT | `/ess/attendance` | P1 |
| SC-ESS-07 | Employee registers a geo work-location for approval | `/ess/locations` | P2 |
| SC-ESS-08 | Employee uploads a personal document with expiry | `/ess/documents` | P2 |
| SC-ESS-09 | Employee views and acknowledges letters / certificates | `/ess/letters` | P2 |
| SC-ESS-10 | Employee views monthly payslips | `/ess/payslips` | P2 |
| SC-ESS-11 | Employee checks own probation status | `/ess/probation` | P3 |
| SC-ESS-12 | ESS → admin round-trips (leave, profile, attendance, location, letters, pay) | ESS + admin counterparts | P1 |

---

## 4. Detailed test cases

### 4.1 My Workspace — Dashboard — `/ess`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-001 | Dashboard loads after async placeholder clears | Logged in as `vismaya` | 1. Navigate to `/ess`. 2. Wait for "Loading your workspace…" placeholder to disappear. | Placeholder clears; dashboard content (KPI tiles + profile card) renders; no error. | P1 | Functional | Automated (smoke) |
| TC-ESS-002 | Four KPI tiles present | On `/ess`, loaded | 1. Read the KPI tile row. | Tiles `Leave Available`, `Today's Attendance`, `Pending Requests`, `Letters to Acknowledge` are all shown, each with a value (e.g. "0 days", "Not marked", counts). | P2 | UI | Planned |
| TC-ESS-003 | Profile card shows logged-in employee identity | On `/ess`, loaded | 1. Read the `My Profile` card. | Card shows the user's name, designation and `Employee Code` PB1053, `Branch` Main Branch, plus `Email`, `Phone`, `Reports To`, `Joined`. | P2 | UI | Planned |
| TC-ESS-004 | Quick Actions deep-link to the correct ESS routes | On `/ess`, loaded | 1. Click each Quick Action (`Apply Leave`, `My Attendance`, `Payslips`, `Documents`, `Letters`, `Profile`). | Each navigates respectively to `/ess/leave`, `/ess/attendance`, `/ess/payslips`, `/ess/documents`, `/ess/letters`, `/ess/profile`. | P1 | Functional | Planned |
| TC-ESS-005 | Holidays & Birthdays widgets render | On `/ess`, loaded | 1. Locate `Upcoming Holidays` and `Birthdays This Week` widgets. | Both widgets render; Upcoming Holidays shows name + date rows (e.g. "Onam — 24-Aug") when holidays are assigned. | P3 | UI | Manual |

### 4.2 My Profile — `/ess/profile`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-006 | Overview read-only fields render master data | Logged in | 1. Open `/ess/profile`. 2. Read the `Overview` section. | Read-only fields shown: `Employee Code` PB1053, `Branch` Main Branch, `Department`, `Designation` Testing Team lead, `Reports To`, `Joined`, `Confirmed`, `Phone` +919747832341. | P2 | UI | Automated (smoke) |
| TC-ESS-007 | Submit a profile change request (happy path) | On `/ess/profile` | 1. In `Request A Change`, edit `First Name` (and/or `Last Name`, `Email`, `National / ID Number`, `Passport No`, `Blood Group`). 2. Enter a `Reason`. 3. Click `Submit Change Request`. | Request accepted (success toast/confirmation); a corresponding row appears on `/ess/requests` with a Pending status. No change applied directly to the Overview yet. | P1 | Functional | Planned |
| TC-ESS-008 | Submit change request without a Reason | On `/ess/profile` | 1. Edit an editable field. 2. Leave `Reason` empty. 3. Click `Submit Change Request`. | Submission is blocked / validation prompts for the required `Reason`; no request is created. | P2 | Negative | Planned |
| TC-ESS-009 | Approval helper text is shown | On `/ess/profile` | 1. Read the helper text under `Request A Change`. | Text reads "Edits to these fields are submitted to HR for approval before they take effect." | P3 | UI | Manual |
| TC-ESS-010 | View My Requests navigation | On `/ess/profile` | 1. Click `View My Requests`. | Navigates to `/ess/requests`. | P2 | Functional | Planned |

### 4.3 My Requests — `/ess/requests`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-011 | Empty state on a fresh account | Logged in, no change requests submitted | 1. Open `/ess/requests`. | `Profile Change Requests` card shows empty state "You have no change requests." | P2 | Functional | Automated (smoke) |
| TC-ESS-012 | Submitted change request appears here | A change request was submitted via TC-ESS-007 | 1. Open `/ess/requests`. | The submitted request is listed as a row with a Pending status; empty-state string is gone. | P1 | Functional | Planned |
| TC-ESS-013 | Profile Change Requests card renders | Logged in | 1. Open `/ess/requests`. | `Profile Change Requests` card is present and readable. | P3 | UI | Manual |

### 4.4 My Leave — `/ess/leave`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-014 | Leave hub renders both cards and grids | Logged in | 1. Open `/ess/leave`. | `Balances 2026` card with table headers `Leave Type`, `Balance`, `Reserved`, `Available`; `My Leave Requests 2026` card with headers `Type`, `From`, `To`, `Days`, `Status`; `Apply For Leave` form present. | P2 | UI | Automated (smoke) |
| TC-ESS-015 | Show refreshes balances by year | On `/ess/leave` | 1. Set the year (number) input. 2. Click `Show`. | Balances and Requests tables reload for the selected year without error. | P2 | Functional | Planned |
| TC-ESS-016 | Apply for leave (happy path) | Employee has a leave type assigned with balance | 1. In `Apply For Leave` select a `Leave Type`. 2. Set `Start Date` / `End Date`. 3. Enter `Reason`. 4. Click `Submit Request`. | Request accepted; a new row appears in `My Leave Requests` with a Status (e.g. Pending) and computed `Days`; the same request surfaces on admin `/leave-request-list`. | P1 | Functional | Planned |
| TC-ESS-017 | Half-day leave toggle | Leave type has `Is Support Half Day` enabled | 1. Select a half-day-eligible `Leave Type`. 2. Enable the `Half Day` (`#halfday`) toggle. 3. Set dates + `Reason`. 4. `Submit Request`. | Request submits as a half-day; `Days` reflects the half-day value (e.g. 0.5). | P2 | Functional | Planned |
| TC-ESS-018 | Apply with End Date before Start Date | On `/ess/leave` | 1. Set `End Date` earlier than `Start Date`. 2. Fill other fields. 3. `Submit Request`. | Submission blocked / validation error; no leave request created. | P2 | Negative | Planned |
| TC-ESS-019 | Apply without selecting a leave type | On `/ess/leave` | 1. Leave `Leave Type` at `-- Select --`. 2. Set dates + reason. 3. `Submit Request`. | Submission blocked; `Leave Type` flagged required; no request created. | P2 | Negative | Planned |
| TC-ESS-020 | Empty-state strings on fresh user | No balances/requests for user | 1. Open `/ess/leave`. | Balances table shows "No balances."; Requests table shows "No leave requests." | P3 | UI | Automated (smoke) |

### 4.5 My Handover — `/my-handover`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-021 | Set up a handover (happy path) | Logged in; a colleague exists to assign | 1. In `Set Up Handover`, pick an `Assignee` ("Assign my duties to"). 2. Set `From` / `To` dates. 3. Tick `Cover my approvals` and/or `Cover my HRMS tasks`. 4. Optional `Note`. 5. Click `Save`. | A new row appears in `My Handovers` [`#`, `Assignee`, `From`, `To`, `Covers`, `Active`, `Action`] with `Active` = yes. | P1 | Functional | Planned |
| TC-ESS-022 | Save with no assignee selected | On `/my-handover` | 1. Leave `Assign my duties to` at `-- Select assignee --`. 2. Set dates. 3. Click `Save`. | Submission blocked; assignee flagged required; no handover row created. | P2 | Negative | Planned |
| TC-ESS-023 | Clear resets the form | Handover form partly filled | 1. Fill some fields. 2. Click `Clear`. | Assignee, dates, checkboxes and note are reset to empty/default. | P3 | Functional | Planned |
| TC-ESS-024 | Empty state on fresh user | No handovers set up | 1. Open `/my-handover`. | `My Handovers` grid shows "No handovers set up." | P3 | UI | Automated (smoke) |
| TC-ESS-025 | Cover selections reflected in Covers column | A handover was saved | 1. Save a handover with `Cover my approvals` (`#ca`) and `Cover my HRMS tasks` (`#ct`) ticked. 2. Read the `Covers` column. | `Covers` column reflects the selected cover types (approvals / HRMS tasks). Sales/CRM duties are never handed over per the on-page note. | P2 | Functional | Planned |

### 4.6 My Attendance — `/ess/attendance`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-026 | Show applies a date range and loads history | Logged in; punches exist in range | 1. Open `/ess/attendance`. 2. Set `From` / `To` dates. 3. Click `Show`. | `Attendance History` grid renders rows with columns `Date`, `Entry`, `Exit`, `Worked (min)`, `OT (min)`, `Status` (or the empty-state if no data). | P1 | Functional | Automated (smoke) |
| TC-ESS-027 | Grid columns present | On `/ess/attendance` | 1. Read the grid header. | Columns exactly: `Date`, `Entry`, `Exit`, `Worked (min)`, `OT (min)`, `Status`. | P2 | UI | Planned |
| TC-ESS-028 | Regularize a day → admin queue | A day with a missed/incorrect punch is visible | 1. Select a day. 2. Click `Regularize`. 3. Complete the correction request flow. | Regularization request submitted; it appears in admin `/regularization` queue for approval. | P1 | E2E | Planned |
| TC-ESS-029 | Raise OT → admin queue | A day with extra worked time is visible | 1. Select a day. 2. Click `Raise OT`. 3. Complete the OT request flow. | OT request submitted; it appears in admin `/overtime-approval` queue. | P1 | E2E | Planned |
| TC-ESS-030 | Empty state before/without data | No attendance in the chosen range | 1. Open `/ess/attendance` (or apply a range with no data). | Grid shows "No attendance in range." | P3 | UI | Automated (smoke) |

### 4.7 My Locations — `/ess/locations`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-031 | Add a work location and submit for approval | Logged in | 1. In `Add A Work Location`, enter `Location Name*` (e.g. "Home"), `Latitude*`, `Longitude*`, `Radius (m)*`. 2. Click `Submit for approval`. | A new row appears in `My Locations` [`Sl.No`, `Name`, `Lat`, `Long`, `Radius`, `Status`] with `Status` Pending; the location is sent to admin `/geofences`. | P1 | Functional | Planned |
| TC-ESS-032 | Leaflet map renders | On `/ess/locations` | 1. Locate the "Location on map" area. | Map renders with `Leaflet | © OpenStreetMap contributors` attribution and a draggable pin. (Assert the form/attribution, not map internals — Leaflet is a third-party asset.) | P2 | UI | Manual |
| TC-ESS-033 | Submit with missing required fields | On `/ess/locations` | 1. Leave `Name` / `Lat` / `Long` / `Radius` blank. 2. Click `Submit for approval`. | Submission blocked; the missing required fields (marked `*`) are flagged; no location row created. | P2 | Negative | Planned |
| TC-ESS-034 | Use my location (geolocation) | On `/ess/locations`, mobile/GPS context | 1. Click `Use my location`. | Browser requests geolocation permission; on grant, `Lat`/`Long` are auto-filled and the pin moves. (May be blocked headless — mark environment-dependent.) | P3 | Functional | Manual |
| TC-ESS-035 | My Locations grid columns | On `/ess/locations` | 1. Read the `My Locations` grid header. | Columns exactly: `Sl.No`, `Name`, `Lat`, `Long`, `Radius`, `Status`. | P3 | UI | Planned |

### 4.8 My Documents — `/ess/documents`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-036 | Upload a document (happy path) | Logged in; `sample-document.txt` fixture available | 1. In `Upload A Document`, select `Document Type`. 2. Enter `Number`. 3. Set `Expiry` date. 4. Choose a `File` (setInputFiles fixture). 5. Click `Upload`. | Upload succeeds; a new row appears in `Documents` [`Type`, `Number`, `Category`, `Expiry`, `Status`] with the chosen `Type`/`Number`/`Expiry`. | P1 | Functional | Planned |
| TC-ESS-037 | Upload with no type or no file | On `/ess/documents` | 1. Leave `Document Type` at `-- Select --` and/or omit the file. 2. Click `Upload`. | Upload blocked; required `Type`/`File` flagged; no document row created. | P2 | Negative | Planned |
| TC-ESS-038 | Expiry is tracked in the grid | A document with an expiry was uploaded | 1. Upload a document with an `Expiry` date. 2. Read the `Documents` grid. | Row shows the `Expiry` value; expiry drives HR compliance reminders. | P2 | Functional | Planned |
| TC-ESS-039 | Empty state on fresh user | No documents on file | 1. Open `/ess/documents`. | `Documents` grid shows "No documents on file." | P3 | UI | Automated (smoke) |

### 4.9 My Letters — `/ess/letters`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-040 | Published Letters grid renders | Logged in | 1. Open `/ess/letters`. | `Published Letters` card with columns `Letter`, `Type`, `Issued`, `Acknowledged`; empty state "No letters published to you." on a fresh user. | P2 | UI | Automated (smoke) |
| TC-ESS-041 | Request A Letter / Certificate card | On `/ess/letters` | 1. Read the `Request A Letter / Certificate` card. | Card present; when no self-service letter types are configured it shows "No self-service letter types are available." | P3 | UI | Manual |
| TC-ESS-042 | Acknowledge a published letter | HR has published a letter to this employee (see TC-ESS-055) | 1. Open `/ess/letters`. 2. Acknowledge the published letter. | `Acknowledged` column flips to acknowledged for that row; the `Letters to Acknowledge` KPI on `/ess` decrements. | P1 | E2E | Planned |

### 4.10 My Pay — `/ess/payslips`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-043 | Show loads payslips for a period | Logged in; payslips processed | 1. Open `/ess/payslips`. 2. Set the year/period (number) input. 3. Click `Show`. | `Payslips` grid renders rows with columns `Period`, `Basic`, `Deductions`, `Net`, `Payable`, `Paid` (or empty-state if none). | P1 | Functional | Automated (smoke) |
| TC-ESS-044 | Grid columns present | On `/ess/payslips` | 1. Read the grid header. | Columns exactly: `Period`, `Basic`, `Deductions`, `Net`, `Payable`, `Paid`. | P2 | UI | Planned |
| TC-ESS-045 | Empty state on fresh user | No payslips for user | 1. Open `/ess/payslips`. | Grid shows "No payslips found." | P3 | UI | Automated (smoke) |
| TC-ESS-046 | PDF-not-available note shown AS-IS | On `/ess/payslips` | 1. Read the note under the grid. | Note reads "Payslip PDF download is not yet available — see your HR department for a stamped copy." (asserted as-is, no download action). | P3 | Report | Manual |

### 4.11 My Probation — `/ess/probation`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|
| TC-ESS-047 | Confirmed employee sees "not on probation" | Logged in as confirmed user `Vismaya` | 1. Open `/ess/probation`. 2. Wait for async load to clear. | `My Probation` panel shows "You are not currently on probation." | P2 | Functional | Automated (smoke) |
| TC-ESS-048 | My Probation section title renders | On `/ess/probation` | 1. Read the section heading. | `My Probation` title present. | P3 | UI | Automated (smoke) |
| TC-ESS-049 | Populated probation state | An employee with an active probation record | 1. Log in as an on-probation employee. 2. Open `/ess/probation`. | Panel shows review checkpoints/status (mirrors admin `/hrms/probation`). Requires a seeded probation record. | P3 | Functional | Manual |

---

## 5. Known build quirks asserted AS-IS

These are intentional assertions of current build behaviour — do NOT "fix" them in test expectations.

| # | Quirk | Where | Assertion |
|---|---|---|---|
| Q1 | Payslip PDF download disabled | `/ess/payslips` | Assert the literal note "Payslip PDF download is not yet available — see your HR department for a stamped copy." No download control expected (TC-ESS-046). |
| Q2 | No self-service letter types configured | `/ess/letters` | `Request A Letter / Certificate` shows "No self-service letter types are available." on the current tenant (TC-ESS-041). |
| Q3 | ESS writes never apply directly | `/ess/profile`, `/ess/leave`, `/ess/attendance`, `/ess/locations` | Every write creates an approval request; assert the request/queue, not an immediate change to the read-only data (TC-ESS-007, -016, -028, -029, -031). |
| Q4 | Filter-first empty grids | `/ess/attendance`, `/ess/payslips`, `/ess/leave` | Grids are empty until `Show` is clicked; assert empty-state strings before filtering and rows after (TC-ESS-020, -030, -045). |
| Q5 | Async loading placeholder | `/ess`, `/ess/probation` | "Loading your workspace…" must clear before asserting; do not assert on placeholder text (TC-ESS-001, -047). |
| Q6 | Leaflet is third-party | `/ess/locations` | Assert form fields + row `Status`, not Leaflet map internals; `Use my location` may be blocked headless (TC-ESS-032, -034). |

---

## 6. End-to-end / integration cases (ESS ↔ admin)

Drives the ESS↔admin page-pairing table (overview §5). Each case is a full round-trip: the employee raises a request in ESS and the authoritative processing happens in the admin counterpart, then the result reflects back in ESS.

| ID | Title | ESS side | Admin counterpart | Steps (abridged) | Expected result | Priority | Type | Automation |
|---|---|---|---|---|---|---|---|---|
| TC-ESS-050 | Profile-change request round-trip | `/ess/profile` → `/ess/requests` | `/approvals` → `/employees` | 1. Submit change request on `/ess/profile` (TC-ESS-007). 2. Confirm Pending on `/ess/requests`. 3. HR approves in `/approvals`. 4. Reopen `/ess/profile`. | After approval the changed field reflects on `/ess/profile` and `/employees`; the request status moves from Pending to approved on `/ess/requests`. | P1 | E2E | Planned |
| TC-ESS-051 | Leave apply → approve → balance decrement | `/ess/leave` | `/leave-request-list` → `/leave-approval` → `/leave-ledger` + `/leave-balances` | 1. Apply for leave on `/ess/leave` (TC-ESS-016). 2. Find it on `/leave-request-list`. 3. Approve on `/leave-approval`. 4. Reopen `/ess/leave` and `/ess`. | Approval posts a `/leave-ledger` entry, decrements `/leave-balances`; `/ess/leave` Balances (`Available`) updates and the `/ess` `Leave Available` KPI reflects the change; request `Status` becomes approved. | P1 | E2E | Planned |
| TC-ESS-052 | Regularization round-trip | `/ess/attendance` (`Regularize`) | `/regularization` | 1. Regularize a day on `/ess/attendance` (TC-ESS-028). 2. Approve in `/regularization`. 3. Reopen `/ess/attendance` / `/attendance-log`. | Approved correction updates the day log shown on `/attendance-log` and `/ess/attendance` (`Entry`/`Exit`/`Status`). | P1 | E2E | Planned |
| TC-ESS-053 | Overtime round-trip | `/ess/attendance` (`Raise OT`) | `/overtime-approval` | 1. Raise OT on `/ess/attendance` (TC-ESS-029). 2. Approve in `/overtime-approval`. 3. Reopen `/ess/attendance`. | Approved OT reflects in the `OT (min)` column / OT payout queue; request routes back as approved. | P2 | E2E | Planned |
| TC-ESS-054 | Work-location → geofence round-trip | `/ess/locations` (`Submit for approval`) | `/geofences` | 1. Submit a location on `/ess/locations` (TC-ESS-031). 2. Approve/activate on `/geofences`. 3. Perform a geo punch; check `/ess/attendance`. | Approved location becomes an active geofence punch-zone; geo punches gated by it surface in `/attendance-log` / `/ess/attendance`; row `Status` moves Pending → approved. | P2 | E2E | Planned |
| TC-ESS-055 | Letter publish → acknowledge round-trip | `/ess/letters` | `/letters/generate` (+ `/letters/templates`) | 1. HR generates + publishes a letter to the employee via `/letters/generate`. 2. Employee acknowledges on `/ess/letters` (TC-ESS-042). | Published letter appears in `/ess/letters`; acknowledging flips `Acknowledged` and decrements the `/ess` `Letters to Acknowledge` KPI. | P2 | E2E | Planned |
| TC-ESS-056 | Payslip visibility round-trip | `/ess/payslips` | `/employee-salary-process` | 1. HR runs salary process for the period (`/employee-salary-process`). 2. Employee opens `/ess/payslips` and clicks `Show`. | Processed pay produces payslip rows on `/ess/payslips` with `Basic`/`Deductions`/`Net`/`Payable`/`Paid` tying back to the salary-process output. | P2 | E2E | Planned |
| TC-ESS-057 | Handover covers approver duties | `/my-handover` | `/employee-handover`, `/leave-delegation`, `/leave-approval` | 1. Set up a handover with `Cover my approvals` on `/my-handover` (TC-ESS-021). 2. During the From–To window raise an approval that routes to the delegate. | While the employee is away, the assignee can see and act on the employee's HRMS approvals/tasks; the self-service handover aligns with admin `/employee-handover` / `/leave-delegation`. | P3 | E2E | Planned |
