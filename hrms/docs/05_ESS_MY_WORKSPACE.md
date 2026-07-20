# HRMS — My Workspace (Employee Self-Service)

> Sub-module study for Playwright automation · App: https://hrms-erp.progbiz.in · Tenant `Hrms`
> Source: live crawl 2026-07-20 (11 pages). Raw captures in [`hrms/data/pages/`](../data/pages), shots in [`hrms/screenshots/ess/`](../screenshots/ess).

## Overview

**My Workspace** is the employee-facing portal (Employee Self-Service / ESS). It is the counterpart to the admin HRMS modules: instead of HR acting *on* employees, the logged-in employee acts on their *own* record. From here an employee sees a personal dashboard, views/edits their profile (edits go to HR as approval requests), applies for and tracks leave, views and regularizes their own attendance, raises overtime, manages geo work-locations, uploads personal documents, requests and acknowledges letters/certificates, views payslips, sets up duty handovers, and checks their probation status.

Every self-service action that changes official data is **routed to an approval queue** rather than applied directly — profile edits → HR approval (`/ess/requests` → `/approvals`), leave → `/leave-approval`, regularization/OT → attendance approval queues, work-locations → geofence approval. So ESS is primarily a **request-origination surface**; the authoritative processing happens in the admin sub-modules. All ESS routes live under `/ess/*` except `/my-handover`.

## Page Index

| # | Page | Route | Purpose |
|---|------|-------|---------|
| 1 | My Workspace (Dashboard) | `/ess` | Personal home: KPI tiles, profile card, quick actions, holidays, birthdays |
| 2 | My Profile | `/ess/profile` | View own master data; submit field-change requests to HR |
| 3 | My Requests | `/ess/requests` | Track status of submitted profile-change requests |
| 4 | My Leave | `/ess/leave` | View leave balances and apply for / track leave |
| 5 | My Handover | `/my-handover` | Set up duty handover to a colleague during absence |
| 6 | My Attendance | `/ess/attendance` | View own daily attendance; regularize / raise OT |
| 7 | My Locations | `/ess/locations` | Register geo work-locations (map) for approval |
| 8 | My Documents | `/ess/documents` | Upload personal documents with expiry tracking |
| 9 | My Letters | `/ess/letters` | Request letters/certificates; acknowledge published ones |
| 10 | My Pay | `/ess/payslips` | View monthly payslips |
| 11 | My Probation | `/ess/probation` | View own probation status/reviews |

## Pages

### My Workspace — Dashboard (`/ess`)

- **Purpose** — the employee's landing page inside My Workspace; a read-only snapshot with shortcuts into the rest of ESS. Content loads asynchronously after a "Loading your workspace…" placeholder (relevant for test waits).
- **UI elements** —
  - **4 KPI tiles:** `Leave Available` (e.g. "0 days"), `Today's Attendance` (e.g. "Not marked"), `Pending Requests` (count), `Letters to Acknowledge` (count).
  - **My Profile** card: avatar, name, designation, `Employee Code`, `Branch`, `Email`, `Phone`, `Reports To`, `Joined`.
  - **Quick Actions** buttons: `Apply Leave`, `My Attendance`, `Payslips`, `Documents`, `Letters`, `Profile`.
  - **Upcoming Holidays** widget (holiday name + date, e.g. "Onam — 24-Aug").
  - **Birthdays This Week** widget.
- **Connections** — Quick Actions deep-link to `/ess/leave`, `/ess/attendance`, `/ess/payslips`, `/ess/documents`, `/ess/letters`, `/ess/profile`. KPI tiles reflect data owned by `/leave-balances`, `/attendance-log`, `/ess/requests`, `/ess/letters`. Upcoming Holidays is fed by `/holiday-list` + `/holiday-assignment-list`.
- **Automation notes** — wait for the loading placeholder to clear before asserting (`waitForFunction` on body text not matching `/loading/i`). KPI tiles and Quick Actions are the stable assertion targets; the widgets are personalised to the logged-in user (`Vismaya`, code `PB1053`, Main Branch).

### My Profile (`/ess/profile`)

- **Purpose** — read-only view of the employee's own master record, plus a controlled form to request changes to editable fields. Edits are **not applied directly** — they become HR approval requests.
- **UI elements** —
  - **Overview** section (read-only): `Employee Code` (PB1053), `Branch`, `Department`, `Designation`, `Reports To`, `Joined`, `Confirmed`, `Phone`.
  - **Request A Change** form with editable fields: `First Name`, `Last Name`, `Email`, `National / ID Number`, `Passport No`, `Blood Group`, and a `Reason` field.
  - Buttons: `Submit Change Request`, `View My Requests`.
  - Helper text: *"Edits to these fields are submitted to HR for approval before they take effect."*
- **Data grid** — none (form + read-only overview).
- **Connections** — `Submit Change Request` creates a record shown on `/ess/requests`; `View My Requests` navigates there. The approval is actioned by HR via the workflow engine (`/approvals`). The authoritative record lives in admin `/employees`.
- **Automation notes** — this is the ESS write-path with a clear before/after: submit a change → assert it appears on `/ess/requests` with a pending status. Field labels above are reliable locators.

### My Requests (`/ess/requests`)

- **Purpose** — lists the employee's submitted **Profile Change Requests** and their approval status.
- **UI elements** — `Profile Change Requests` card. Empty state: *"You have no change requests."*
- **Data grid** — request list (populated once a change is submitted from `/ess/profile`).
- **Connections** — receives records from `/ess/profile`; each request is decided in the approval workflow (`/approvals`). Once approved, the change reflects on `/employees` / `/ess/profile`.
- **Automation notes** — assert the empty-state string on a fresh account; after submitting from `/ess/profile`, assert the new row appears here. Pairs with `/ess/profile` for the round-trip test.

### My Leave (`/ess/leave`)

- **Purpose** — the employee's leave hub: see balances and apply for leave.
- **UI elements** —
  - `Show` (refresh by year) and `Submit Request` buttons.
  - **Apply For Leave** form: leave-type select, `From`/`To` date pickers, `halfday` toggle, `Reason` textarea, year (number) input.
  - **Balances 2026** card and **My Leave Requests 2026** card.
- **Data grid** — two tables: **Balances** [`Leave Type`, `Balance`, `Reserved`, `Available`] and **Requests** [`Type`, `From`, `To`, `Days`, `Status`].
- **Connections** — `Submit Request` creates a leave request that also surfaces on admin `/leave-request-list` and is approved on `/leave-approval`; approval posts to `/leave-ledger` and updates `/leave-balances`. Balances shown here mirror `/leave-balances`. Half-day support depends on the `Is Support Half Day` flag from `/leave-types`.
- **Automation notes** — the primary ESS→admin E2E: apply here → approve on `/leave-approval` → verify balance decremented + ledger entry. Balance table's `Reserved` vs `Available` columns reflect pending requests.

### My Handover (`/my-handover`)

- **Purpose** — the employee sets up a **duty handover** to a colleague who will cover their responsibilities during an absence.
- **UI elements** — **Set Up Handover** form: `Assignee` select, `From`/`To` date pickers, `Covers` (ca/ct) selects, `Reason` textarea; `Save` / `Clear` buttons. **My Handovers** card lists existing handovers.
- **Data grid** — [`#`, `Assignee`, `From`, `To`, `Covers`, `Active`, `Action`].
- **Connections** — the ESS-side twin of admin `/employee-handover`; a handover can cover an approver so that leave/approvals route to the delegate (relates to `/leave-delegation`, `/leave-approval`).
- **Automation notes** — self-service version has an `Assignee` picker (vs admin's `From`/`To` employees). Save then assert the new row in **My Handovers** with `Active` = yes.

### My Attendance (`/ess/attendance`)

- **Purpose** — the employee views their own daily attendance history and raises corrections.
- **UI elements** — `Show` (date-range filter with `From`/`To` dates), `Regularize`, `Raise OT` buttons. **Attendance History** card.
- **Data grid** — [`Date`, `Entry`, `Exit`, `Worked (min)`, `OT (min)`, `Status`].
- **Connections** — `Regularize` feeds admin `/regularization`; `Raise OT` feeds `/overtime-approval`. The underlying data is the same computed log shown in admin `/attendance-log`. Punches originate from `/data-from-device`, mobile/geo punches (`/geofences`, `/ess/locations`) and `/add-visit-report`.
- **Automation notes** — must click `Show` (apply date range) before rows render. `Regularize`/`Raise OT` open request flows whose results appear in the corresponding admin approval queues — good for ESS→admin assertions.

### My Locations (`/ess/locations`)

- **Purpose** — the employee registers **geo work-locations** (e.g. home, a site) that, once approved, become valid mobile punch zones.
- **UI elements** — **Add A Work Location** form: `Name` (e.g. "Home, Site A"), `Lat`/`Long`/`Radius` numbers, an address search box that moves a **Leaflet map**; `Use my location` and `Submit for approval` buttons. **My Locations** card.
- **Data grid** — [`Sl.No`, `Name`, `Lat`, `Long`, `Radius`, `Status`].
- **Connections** — `Submit for approval` sends the location to admin `/geofences`; once active it gates geo-based attendance punches that feed `/attendance-log` / `/ess/attendance`.
- **Automation notes** — contains a third-party **Leaflet** map (external `leafletjs.com` asset) — avoid asserting on map internals; assert on the form fields and the resulting row `Status` (e.g. Pending → approved geofence). `Use my location` needs geolocation permission (may not be grantable headless).

### My Documents (`/ess/documents`)

- **Purpose** — the employee uploads personal documents (IDs, certificates) with category and expiry tracking.
- **UI elements** — **Upload A Document** form: `Type` select, `Number` text, `Category`, `Expiry` date, `file` input; `Upload` button. **Documents** card.
- **Data grid** — [`Type`, `Number`, `Category`, `Expiry`, `Status`].
- **Connections** — uploaded docs attach to the employee master (`/employees`) and are visible to HR; expiry drives compliance reminders.
- **Automation notes** — a `file` input is present — use `setInputFiles` with a fixture (reuse `erp/common/sample-document.txt`). Assert the uploaded row appears with the chosen `Type`/`Expiry`.

### My Letters (`/ess/letters`)

- **Purpose** — the employee requests HR letters/certificates and acknowledges letters HR has published to them.
- **UI elements** — **Request A Letter / Certificate** card and **Published Letters** card.
- **Data grid** — [`Letter`, `Type`, `Issued`, `Acknowledged`].
- **Connections** — HR generates letters via `/letters/templates` → `/letters/generate`; published letters land here for the employee to acknowledge (the `Letters to Acknowledge` KPI on `/ess` counts these).
- **Automation notes** — the acknowledge action flips the `Acknowledged` column and decrements the dashboard KPI — a clean before/after assertion. Requesting a letter creates an HR-side task.

### My Pay (`/ess/payslips`)

- **Purpose** — the employee views their monthly payslips.
- **UI elements** — `Show` button (year/period filter, number input). **Payslips** card.
- **Data grid** — [`Period`, `Basic`, `Deductions`, `Net`, `Payable`, `Paid`].
- **Connections** — payslip rows are produced by admin `/employee-salary-process` (which consumes `/salary-revisions`, `/employee-deduction`, and finalized attendance from `/attendance-finalization`). Leave encashment (`/leave-encashment`) and LOP (`/leave-attendance-sync`) also affect the figures.
- **Automation notes** — click `Show` to load a period before asserting. Columns tie directly back to the salary-process output — useful as the terminal assertion of a payroll E2E.

### My Probation (`/ess/probation`)

- **Purpose** — the employee's read-only view of their own probation status and reviews.
- **UI elements** — a status panel. Empty state for a confirmed employee: *"You are not currently on probation."*
- **Data grid** — none when not on probation; shows review checkpoints when active.
- **Connections** — mirrors admin `/hrms/probation` (dashboard) and `/hrms/probation-report`; probation is started for new hires via `/hrms/probation` using `/hrms/probation-templates`.
- **Automation notes** — assert the "not currently on probation" string for the confirmed test user (`Vismaya` is `Confirmed`). To test the populated state, an employee with an active probation record is required.

## Process flows

- **Profile change round-trip:** `/ess/profile` (edit + Reason → `Submit Change Request`) → record on `/ess/requests` (Pending) → HR decides via `/approvals` → approved change reflects on `/ess/profile` & `/employees`.
- **Leave self-service:** `/ess/leave` (Apply For Leave) → admin `/leave-request-list` / `/leave-approval` → on approve: `/leave-ledger` entry + `/leave-balances` decrement → balances update back on `/ess/leave` and the `/ess` KPI tile.
- **Attendance correction:** `/ess/attendance` (`Regularize` / `Raise OT`) → admin `/regularization` / `/overtime-approval` → approved correction updates the day log shown on `/attendance-log` & `/ess/attendance`.
- **Work-location approval:** `/ess/locations` (map + `Submit for approval`) → `/geofences` (approve) → active geofence enables mobile punches → punches surface in `/ess/attendance`.
- **Letters:** HR `/letters/generate` → published to `/ess/letters` → employee acknowledges → `/ess` "Letters to Acknowledge" KPI decrements.
- **Pay visibility:** `/employee-salary-process` (admin) → payslip rows on `/ess/payslips`.
- **Handover during absence:** `/my-handover` (set assignee) ↔ admin `/employee-handover` / `/leave-delegation` so approvals/duties are covered while the employee is away.

## Automation quick-reference (ESS)

| Behaviour | Where | Test implication |
|---|---|---|
| Async "Loading…" placeholder | `/ess`, `/ess/probation` | wait for placeholder to clear before asserting |
| Filter/`Show` before data renders | `/ess/attendance`, `/ess/payslips`, `/ess/leave` | click `Show` / apply dates first |
| `file` upload input | `/ess/documents` | `setInputFiles` with a fixture |
| Leaflet map + geolocation | `/ess/locations` | assert form/row, not map; geolocation may be blocked headless |
| Empty states as assertions | `/ess/requests` ("no change requests"), `/ess/probation` ("not currently on probation") | reliable on the fresh/confirmed test user |
| Write actions create approval requests | profile, leave, attendance, locations | verify the request appears in the matching admin queue, not an immediate data change |
