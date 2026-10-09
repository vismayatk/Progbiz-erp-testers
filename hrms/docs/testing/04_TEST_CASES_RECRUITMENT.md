# HRMS Test Cases — Recruitment & Onboarding

> Part of the HRMS test-documentation set (`hrms/docs/testing/`). App: https://hrms-erp.progbiz.in · tenant `Hrms`.
> Grounded in hrms/docs/02_RECRUITMENT.md + hrms/data/pages/*.json (live crawl 2026-07-20).
> IDs: test cases `TC-REC-###` · scenarios `SC-REC-##`. Priority P1/P2/P3. Type: Functional / UI / Negative / E2E / Report. Automation: Automated (smoke) / Planned / Manual.

---

## 1. Scope — pages covered

| # | Page | Route | Archetype |
|---|------|-------|-----------|
| 1 | Job Requisitions | `/requisition-list` | List + create-modal, status filter + search, empty grid |
| 2 | Hiring — Job Openings | `/vacancy-list` | Tabbed (3 tabs) + list + create-modal + status filter + publish counter |
| 3 | Current Openings (public careers) | `/current-openings` | Public picker page, no ERP shell (reachable without auth) |
| 4 | Job Applications | `/job-applications-list` | Inbox list, per-row actions (Details / Schedule Interview / Reject) |
| 5 | Candidates | `/candidates` | Tabbed status buckets (5) + inline add-form + grid |
| 6 | Assessments | `/assessment-list` | List + create-modal (file attachment), async `Loading…` row |
| 7 | Interview Schedule | `/interview-schedules` | List + create-modal |
| 8 | Offer Management | `/offer-list` | List + create-modal |
| 9 | Recruitment Pipeline | `/recruitment-pipeline` | Kanban board, mandatory vacancy filter, Configure Stages / Score / Auto-Sync |
| 10 | Communication Templates | `/communication-templates` | List + create-modal (rich body), async `Loading…` row |
| 11 | Talent Pool & Archive | `/talent-pool` | Filter-first search page + grid, async `Loading…` row |
| 12 | Candidate Followup Status (Settings) | `/candidate-status` | Settings master, list + add-modal, async `Loading…` row |
| 13 | Interview Rounds (Settings) | `/interview-rounds` | Settings master, list + add-modal, async `Loading…` row |
| 14 | Onboarding Templates | `/onboarding-templates` | Master/detail list (no grid), dual empty-state |
| 15 | Onboarding Pipeline | `/onboarding-pipeline` | Board/kanban, empty-state, Start-Onboarding wizard |

---

## 2. Prerequisites & test data

**Environment**
- App: https://hrms-erp.progbiz.in · tenant / company code `Hrms` · test user `vismaya`.
- Login form: `#companycode`, `#signin-username`, `#signin-password`, `button[type=submit]`. Success = URL leaves `/login` and lands on `/home`.
- Authenticated pages run with a saved Playwright `storageState`. `/current-openings` is the exception — it is public and MUST be exercised **without** the logged-in storage state (see TC-REC-016).

**Seeding / dependency order** (mirrors the config chains in the overview doc)
1. Master data first: `/candidate-status` (followup statuses + nature) and `/interview-rounds` (at least one round) — these feed candidate buckets and interview scheduling.
2. `/requisition-list` → `/vacancy-list` (create and **publish** an opening) before any public application or pipeline test.
3. A published opening must exist before `/current-openings` shows options and before `/job-applications-list` can receive rows.
4. `/onboarding-templates` (at least one template) and an offer-stage candidate in `/offer-list` before `/onboarding-pipeline`.

**Test-data hygiene**
- Use unique, timestamped values for shared master data (designation names, candidate names/phones, template/round/status names) to avoid collisions across parallel runs — mutations on `/candidate-status`, `/interview-rounds`, `/communication-templates`, `/onboarding-templates` are global.
- Clean up created master rows via the grid `Action` column after each spec.
- Candidate seeds: `Candidate Name` + `Phone Number` (add-form placeholders). Offer seeds require a `Selected` candidate.

**Cross-cutting UI behaviours to expect** (see §5 for the assert-as-is list)
- Several grids render a first row of literal text `Loading…` on mount — wait for it to clear before asserting data.
- `/candidates` grid can render `rowCount 1` with an empty first row — that is an empty state, not data.
- Tabs on `/candidates` and `/vacancy-list` switch content **without a route change** — scope selectors to the active panel.

---

## 3. Scenarios (high level)

| Scenario ID | Title | Pages involved | Priority |
|-------------|-------|----------------|----------|
| SC-REC-01 | Raise and track a job requisition through its status workflow | `/requisition-list` | P1 |
| SC-REC-02 | Create and publish a job opening | `/vacancy-list` | P1 |
| SC-REC-03 | Public careers page reachable and usable without authentication | `/current-openings` | P1 |
| SC-REC-04 | Public application intake lands in the applications inbox | `/current-openings`, `/job-applications-list` | P1 |
| SC-REC-05 | Manage the candidate register across the five status buckets | `/candidates`, `/candidate-status` | P1 |
| SC-REC-06 | Build and reuse the assessment library | `/assessment-list` | P2 |
| SC-REC-07 | Schedule and track interviews per round | `/interview-schedules`, `/interview-rounds` | P1 |
| SC-REC-08 | Extend and track an offer (CTC, joining, status) | `/offer-list` | P1 |
| SC-REC-09 | Manage a vacancy's funnel on the Kanban pipeline | `/recruitment-pipeline`, `/vacancy-list`, `/candidates` | P2 |
| SC-REC-10 | Maintain reusable candidate communication templates | `/communication-templates` | P3 |
| SC-REC-11 | Search, archive and re-engage candidates in the talent pool | `/talent-pool`, `/vacancy-list` | P2 |
| SC-REC-12 | Configure recruitment master data (statuses + rounds) | `/candidate-status`, `/interview-rounds` | P2 |
| SC-REC-13 | Define reusable onboarding checklists/templates | `/onboarding-templates` | P2 |
| SC-REC-14 | Execute and track an active onboarding for a new hire | `/onboarding-pipeline`, `/onboarding-templates` | P1 |
| SC-REC-15 | Full hire-to-onboard chain end to end | all Recruitment pages → `/employees` | P1 |

---

## 4. Detailed test cases

> Steps are grounded in the captured element names. Where an inner form/modal field was not captured (forms open on click and were not crawled), the step is kept generic ("fill required fields") rather than inventing field names.

### 4.1 Job Requisitions — `/requisition-list`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-001 | Page loads with Manpower Requests card and grid columns | Logged in | 1) Navigate to `/requisition-list`<br>2) Read breadcrumb, card, grid headers | Breadcrumb "Job Requisitions › Recruitment › Requisitions"; card `Manpower Requests`; grid columns `Sl.No, Designation, Department, Positions, Type, Work Type, Status, Branch, Action`; `New Requisition` button visible | P2 | UI | Automated (smoke) |
| TC-REC-002 | New Requisition opens the create form/modal | On `/requisition-list` | 1) Click `New Requisition` | A create-requisition form/modal opens with designation, department, positions, type, work type and branch fields | P1 | Functional | Planned |
| TC-REC-003 | Create a requisition (happy path) | Create form open; a Designation/Department master exists | 1) Fill all required fields<br>2) Save | New row appears in the grid with the entered Designation/Department/Positions and status `Draft` | P1 | Functional | Planned |
| TC-REC-004 | Create requisition with missing mandatory fields | Create form open | 1) Leave required fields blank<br>2) Attempt Save | Save is blocked; inline validation errors shown; no new grid row | P2 | Negative | Planned |
| TC-REC-005 | Status filter narrows the grid | ≥1 requisition per status where possible | 1) Select each option in the status `<select>` (`All Status`, `Draft`, `Submitted`, `Approved`, `Rejected`, `Returned`)<br>2) Read row count after each | Grid shows only rows matching the selected status; `All Status` shows all; row count changes consistently with the filter | P2 | Functional | Planned |
| TC-REC-006 | Search filters by designation | ≥1 requisition exists | 1) Type a known designation into `Search designation…`<br>2) Observe grid | Grid narrows to rows whose Designation matches; clearing the box restores the list | P3 | Functional | Planned |
| TC-REC-007 | Empty grid renders gracefully | No requisitions | 1) Load page with no data | Grid renders headers with 0 data rows and no error/spinner stuck on screen | P3 | UI | Automated (smoke) |

### 4.2 Hiring — Job Openings — `/vacancy-list`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-008 | Job Openings tab loads with publish counter and grid | Logged in | 1) Navigate to `/vacancy-list` | Tabs `Job Openings / Candidates / Talent Pools` visible; counter text "0 published · 0 total · Show Draft & Open"; grid columns `Candidates, Job Opening, Hiring Lead, Created On, Status, Action`; `Add Job Opening` visible | P2 | UI | Automated (smoke) |
| TC-REC-009 | Add Job Opening opens the create form | On `Job Openings` tab | 1) Click `Add Job Opening` | A create-opening form/modal opens (title, hiring lead, status, etc.) | P1 | Functional | Planned |
| TC-REC-010 | Create a job opening (happy path) | Create form open | 1) Fill required fields<br>2) Save | New row appears with entered `Job Opening` name and `Status` (Open/Draft); the "· N total" counter increments by 1 | P1 | Functional | Planned |
| TC-REC-011 | Create opening with missing required fields | Create form open | 1) Leave required fields blank<br>2) Save | Save blocked; validation shown; counter unchanged | P2 | Negative | Planned |
| TC-REC-012 | Status filter narrows openings | ≥1 opening exists | 1) Select each status option (`All`, `Open`, `Draft`, `On Hold`, `Filled`, `Cancelled`)<br>2) Read rows | Grid shows only openings in the selected status | P2 | Functional | Planned |
| TC-REC-013 | Candidates tab switches panel without route change | On `/vacancy-list` | 1) Click `Candidates` tab | Content switches to the candidate view (mirrors `/candidates`); URL stays `/vacancy-list`; selectors scoped to the active panel | P2 | UI | Planned |
| TC-REC-014 | Talent Pools tab switches panel without route change | On `/vacancy-list` | 1) Click `Talent Pools` tab | Content switches to the talent-pool view (mirrors `/talent-pool`); URL stays `/vacancy-list` | P2 | UI | Planned |
| TC-REC-015 | Publishing an opening updates the "published" counter | ≥1 Draft opening exists | 1) Publish/open a Draft opening via its `Action`<br>2) Read counter | The "N published" figure increments; the opening's `Status` reflects Open/published | P2 | Functional | Planned |

### 4.3 Current Openings — public careers — `/current-openings`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-016 | Public page reachable WITHOUT authentication | Use a browser context with **no** storage state | 1) Navigate to `/current-openings` without logging in | Page loads the `Join Our Team` heading and the `#selectbox` picker; **no** ERP sidebar/breadcrumb/app shell; not redirected to `/login` | P1 | Functional | Planned |
| TC-REC-017 | Opening picker lists published openings | ≥1 published opening (seed via `/vacancy-list`) | 1) Open `#selectbox` | Default option is `Choose`; published openings appear as options | P2 | Functional | Planned |
| TC-REC-018 | No published vacancy → picker stays empty | No published openings | 1) Load page<br>2) Open `#selectbox` | Only the `Choose` option is present; no opening options; page does not error | P2 | Negative | Planned |
| TC-REC-019 | Selecting an opening reveals the apply form | ≥1 published opening | 1) Choose an opening in `#selectbox`<br>2) Click the search/submit icon button beside it | The application form appears for the chosen opening | P1 | Functional | Planned |
| TC-REC-020 | Submit application with missing required fields | Apply form open | 1) Leave required fields blank<br>2) Submit | Submission blocked with validation; no application created | P2 | Negative | Planned |
| TC-REC-021 | Submit a valid application | Apply form open for a published opening | 1) Fill name/phone/email etc.<br>2) Submit | Success acknowledgement; a matching row later appears in `/job-applications-list` with the correct `Position Applied For` | P1 | E2E | Planned |

### 4.4 Job Applications — `/job-applications-list`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-022 | Page loads with Applicant Details card and columns | Logged in | 1) Navigate to `/job-applications-list` | Card `Applicant Details`; grid columns `Sl.No, Name, Position Applied For, Phone, Email, Details, Status, Schedule Interview, Reject`; no page-level toolbar buttons | P2 | UI | Automated (smoke) |
| TC-REC-023 | Empty inbox renders gracefully | No applications | 1) Load page with 0 rows | Grid renders headers, 0 data rows, no error | P3 | UI | Automated (smoke) |
| TC-REC-024 | Details row action opens applicant details | ≥1 application (seed via TC-REC-021) | 1) In a row, click the `Details` cell control | Applicant detail view/modal opens with the application's data | P2 | Functional | Planned |
| TC-REC-025 | Schedule Interview row action creates an interview | ≥1 application; ≥1 interview round exists | 1) In a row, click the `Schedule Interview` cell control<br>2) Complete the scheduling modal (round, date, mode)<br>3) Save | A scheduled interview row appears in `/interview-schedules` for that candidate | P1 | E2E | Planned |
| TC-REC-026 | Reject row action archives the application | ≥1 application | 1) Click the `Reject` cell control<br>2) Confirm | Application `Status` becomes rejected; the applicant logically flows to `/talent-pool` archive | P2 | Functional | Planned |
| TC-REC-027 | Cancelling Reject keeps the application | ≥1 application | 1) Click `Reject`<br>2) Cancel/dismiss the confirmation | Application remains unchanged in the grid | P3 | Negative | Planned |

### 4.5 Candidates — `/candidates`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-028 | Page loads with five status-bucket tabs and counts | Logged in | 1) Navigate to `/candidates` | Buttons `New`, `In Progress`, `Shortlisted`, `Selected`, `Rejected` each render with a numeric count suffix; grid columns `Sl.No, Name, Email, Phone, Branch, Designation, Skills, Status, Added On, Action`; `Add New` visible | P1 | UI | Automated (smoke) |
| TC-REC-029 | Add New candidate (happy path) | On `/candidates` | 1) Click `Add New`<br>2) Fill `Candidate Name` + `Phone Number` and the branch/designation/status selects<br>3) Save | Candidate appears in the grid; the `New` bucket count increments by 1 | P1 | Functional | Planned |
| TC-REC-030 | Add New with blank name/phone | Add form open | 1) Leave `Candidate Name` / `Phone Number` blank<br>2) Save | Save blocked; validation shown; no new row; counts unchanged | P2 | Negative | Planned |
| TC-REC-031 | Add New with duplicate phone | A candidate with a known phone already exists | 1) Add another candidate with the same `Phone Number`<br>2) Save | Duplicate is rejected or flagged (dedup validation) | P3 | Negative | Planned |
| TC-REC-032 | Each status tab filters the grid and shows its count | ≥1 candidate in ≥1 bucket | 1) Click `New`, then `In Progress`, `Shortlisted`, `Selected`, `Rejected` in turn<br>2) After each, read the count suffix and grid rows | For each tab the grid shows only that bucket's candidates and the count in the button label matches the visible rows | P1 | UI | Planned |
| TC-REC-033 | Search filters by name/phone | ≥1 candidate | 1) Type into `Search Name/Phone`<br>2) Observe grid | Grid narrows to matching candidates; clearing restores the list | P2 | Functional | Planned |
| TC-REC-034 | Status transition moves candidate across buckets | ≥1 candidate in `New` | 1) Change a candidate's status New → In Progress → Shortlisted → Selected (via `Action`/status control)<br>2) After each, check bucket counts | Candidate leaves the old bucket and appears in the new one; both counts update accordingly | P1 | Functional | Planned |
| TC-REC-035 | Empty first row is not treated as data | No candidates | 1) Load page with no candidates | Grid may show `rowCount 1` with an empty first row — assert on cell text (empty), not row count; buckets read `0` | P3 | Negative | Automated (smoke) |

### 4.6 Assessments — `/assessment-list`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-036 | Async `Loading…` row clears before data | Logged in | 1) Navigate to `/assessment-list`<br>2) Wait for the first row to stop reading `Loading…` | The `Loading…` placeholder disappears and real rows (or an empty grid) render | P2 | UI | Automated (smoke) |
| TC-REC-037 | New Assessment opens create form with attachment field | On `/assessment-list` | 1) Click `New Assessment` | Create form opens with Title, Type, Description, Max Score and a file-attachment control (implied by the `Attachment` column) | P1 | Functional | Planned |
| TC-REC-038 | Create an assessment (happy path) | Create form open | 1) Fill Title/Type/Description/Max Score<br>2) Optionally attach a file (`setInputFiles`)<br>3) Save | New row appears with the entered Title/Type/Max Score in the `Assessment Library` grid | P1 | Functional | Planned |
| TC-REC-039 | Max Score rejects non-numeric / negative values | Create form open | 1) Enter a non-numeric or negative Max Score<br>2) Save | Validation error on Max Score; save blocked | P2 | Negative | Planned |
| TC-REC-040 | Create with missing Title | Create form open | 1) Leave Title blank<br>2) Save | Save blocked; Title validation shown | P2 | Negative | Planned |
| TC-REC-041 | Attachment upload reflects in the grid | Create form open | 1) Attach a file via `setInputFiles`<br>2) Save | The row's `Attachment` cell shows the uploaded file (link/icon) | P3 | Functional | Planned |

### 4.7 Interview Schedule — `/interview-schedules`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-042 | Page loads with Scheduled Interviews card and grid | Logged in | 1) Navigate to `/interview-schedules` | Card `Scheduled Interviews`; grid columns `Sl.No, Candidate, Round, Scheduled On, Mode, Status, Action`; `Schedule Interview` button visible | P2 | UI | Automated (smoke) |
| TC-REC-043 | Schedule Interview opens the scheduling modal | On `/interview-schedules` | 1) Click `Schedule Interview` | Modal opens with candidate, round, date/time and mode fields | P1 | Functional | Planned |
| TC-REC-044 | Schedule an interview (happy path) | ≥1 candidate and ≥1 interview round exist | 1) Open the modal<br>2) Pick candidate, round, date/time, mode<br>3) Save | New row appears with the chosen `Candidate` and `Scheduled On` value; `Status` set (e.g. Scheduled) | P1 | Functional | Planned |
| TC-REC-045 | Round picker depends on `/interview-rounds` seed | No interview rounds defined | 1) Open the modal<br>2) Inspect the round picker | Round options are empty/unavailable, preventing scheduling — asserts the master-data dependency | P2 | Negative | Planned |
| TC-REC-046 | Schedule with missing candidate / past date | Modal open | 1) Leave candidate blank or set a past date/time<br>2) Save | Validation error; save blocked; no new row | P2 | Negative | Planned |

### 4.8 Offer Management — `/offer-list`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-047 | Page loads with Offers card and grid | Logged in | 1) Navigate to `/offer-list` | Card `Offers`; grid columns `Sl.No, Candidate, Total CTC, Joining, Status, Action`; `New Offer` button visible | P2 | UI | Automated (smoke) |
| TC-REC-048 | New Offer opens the offer form | On `/offer-list` | 1) Click `New Offer` | Form opens with a candidate picker, Total CTC and Joining date fields | P1 | Functional | Planned |
| TC-REC-049 | Create an offer (happy path) | ≥1 `Selected` candidate exists | 1) Open the form<br>2) Pick candidate, enter CTC and Joining date<br>3) Save | New row appears with the entered `Total CTC` and `Joining`; `Status` set (e.g. Offered) | P1 | Functional | Planned |
| TC-REC-050 | Create offer with invalid CTC / past joining date | Form open | 1) Enter non-numeric CTC or a past Joining date<br>2) Save | Validation error; save blocked | P2 | Negative | Planned |
| TC-REC-051 | Offer status transition enables onboarding | ≥1 offer exists | 1) Move the offer `Status` to Accepted (via `Action`) | Status updates to Accepted; the candidate becomes eligible for `Start Onboarding` on `/onboarding-pipeline` | P2 | Functional | Planned |

### 4.9 Recruitment Pipeline — `/recruitment-pipeline` (Kanban)

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-052 | Board is empty until a vacancy is selected | Logged in | 1) Navigate to `/recruitment-pipeline`<br>2) Observe the board with the `Vacancy` select on `— Select a vacancy —` | Only the filter bar renders (Vacancy select, `Configure Stages`, `Score`, `Auto-Sync`); no stage columns/cards until a vacancy is chosen; `Score` appears muted/disabled | P1 | UI | Planned |
| TC-REC-053 | Selecting a vacancy renders stage columns with cards | ≥1 vacancy with candidates | 1) Choose a vacancy in the `Vacancy` select | Stage columns render; candidates appear as cards in their current stage | P1 | Functional | Planned |
| TC-REC-054 | "All vacancies" aggregates the board | ≥2 vacancies with candidates | 1) Choose `All vacancies` | Board shows cards across all vacancies | P2 | Functional | Planned |
| TC-REC-055 | Drag a candidate card across stages | Vacancy selected with ≥1 card | 1) Drag a card from one stage column to another (Playwright `dragTo` / manual mouse)<br>2) Reload | Card persists in the new stage; the candidate's followup status reflects the move | P1 | E2E | Planned |
| TC-REC-056 | Configure Stages opens the stage editor | On `/recruitment-pipeline` | 1) Click `Configure Stages`<br>2) Add / rename / reorder a stage<br>3) Save | Stage-editing panel/modal opens; changes persist and the board columns update | P2 | Functional | Planned |
| TC-REC-057 | Score becomes active and opens scoring | Vacancy with candidate cards selected | 1) Select a vacancy with candidates<br>2) Click `Score` | `Score` is enabled (no longer muted); a scoring UI opens tied to the `/assessment-list` library | P2 | Functional | Planned |
| TC-REC-058 | Auto-Sync toggle syncs stage ↔ candidate status | Vacancy selected | 1) Toggle `#autoSync` on<br>2) Move a card between stages | Candidate followup status on `/candidates` updates automatically to match the stage; toggling off breaks the auto link | P2 | Functional | Planned |

### 4.10 Communication Templates — `/communication-templates`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-059 | Async `Loading…` row clears before data | Logged in | 1) Navigate to `/communication-templates`<br>2) Wait for the first row to stop reading `Loading…` | Placeholder clears; real rows or an empty grid render | P2 | UI | Automated (smoke) |
| TC-REC-060 | New Template opens the create form | On page | 1) Click `New Template` | Form opens with Name, Type, Subject and a body/message editor (likely rich-text) | P1 | Functional | Planned |
| TC-REC-061 | Create a template (happy path) | Create form open | 1) Fill Name/Type/Subject + body<br>2) Save | New row appears in the `Templates` grid with the entered `Name`, `Type`, `Subject` | P1 | Functional | Planned |
| TC-REC-062 | Create with blank Name/Subject | Create form open | 1) Leave Name or Subject blank<br>2) Save | Save blocked; validation shown; no new row | P2 | Negative | Planned |

### 4.11 Talent Pool & Archive — `/talent-pool`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-063 | Page loads with search bar; Pool defaults to Archived | Logged in | 1) Navigate to `/talent-pool` | `Name or email` input, `Skill` select (default `— Any —`), `Pool` select (default `Archived (talent pool)`), `Search` button; grid columns `Sl.No, Name, Designation, Skills, Tags, Status, Score, Action` | P2 | UI | Automated (smoke) |
| TC-REC-064 | Search is button-driven and clears the `Loading…` row | Logged in | 1) Click `Search`<br>2) Wait for the first row to stop reading `Loading…` | Results load only on `Search` click (not on keystroke); `Loading…` placeholder clears | P1 | Functional | Planned |
| TC-REC-065 | Search by name/email | ≥1 pooled candidate | 1) Type into `Name or email`<br>2) Click `Search` | Grid returns candidates matching the query | P2 | Functional | Planned |
| TC-REC-066 | Filter by skill | ≥1 candidate with a known skill | 1) Choose a value in `Skill` (not `— Any —`)<br>2) Click `Search` | Grid returns only candidates with that skill; `— Any —` returns all | P3 | Functional | Planned |
| TC-REC-067 | Switch Pool between Archived / Active / All | Candidates in both pools | 1) Select `Archived (talent pool)`, then `Active`, then `All`<br>2) Click `Search` after each | Result set changes per pool; `All` is the union of archived + active | P2 | Functional | Planned |
| TC-REC-068 | Score column reflects assessment/pipeline scoring | A pooled candidate that was scored | 1) Search and read the `Score` cell | `Score` shows the value carried over from `/assessment-list` / `/recruitment-pipeline` scoring | P3 | Report | Planned |

### 4.12 Candidate Followup Status — Settings — `/candidate-status`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-069 | Grid loads; header spelling is page-specific `Sl No` | Logged in | 1) Navigate to `/candidate-status`<br>2) Wait for `Loading…` to clear | Card `Status List`; columns `Sl No, Status Name, Nature, Action` — note `Sl No` (no dot), distinct from `Sl.No` elsewhere | P3 | UI | Automated (smoke) |
| TC-REC-070 | Add Followup Status (happy path) | On page | 1) Click `Add Followup Status`<br>2) Enter a unique Status Name + Nature<br>3) Save | New row appears with the entered name and nature | P1 | Functional | Planned |
| TC-REC-071 | Add with blank Status Name | Add modal open | 1) Leave name blank<br>2) Save | Save blocked; validation shown | P2 | Negative | Planned |
| TC-REC-072 | New status/nature reflects in candidate buckets | A new status created | 1) Create a status with a lifecycle nature<br>2) Open `/candidates` | The candidate `Status` options / buckets reflect the master change | P2 | Functional | Planned |
| TC-REC-073 | Edit/Delete via Action column (cleanup) | A test status row exists | 1) Use the row `Action` to edit then delete the status | Edit persists; delete removes the row — leaves master data clean for other tests | P3 | Functional | Planned |

### 4.13 Interview Rounds — Settings — `/interview-rounds`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-074 | Grid loads; header spelling `Sl No` | Logged in | 1) Navigate to `/interview-rounds`<br>2) Wait for `Loading…` to clear | Card `Interview Rounds`; columns `Sl No, Round Name, Order, Action` | P3 | UI | Automated (smoke) |
| TC-REC-075 | Add Round (happy path) | On page | 1) Click `Add Round`<br>2) Enter a unique Round Name + Order<br>3) Save | New row appears with the entered name and order | P1 | Functional | Planned |
| TC-REC-076 | Add with blank name / duplicate order | Add modal open | 1) Leave Round Name blank, or reuse an existing Order<br>2) Save | Validation error (missing name and/or order conflict); save blocked | P2 | Negative | Planned |
| TC-REC-077 | New round appears in the interview scheduler | A new round created | 1) Create a round<br>2) Open the `Schedule Interview` modal on `/interview-schedules` | The new round is selectable in the round picker | P2 | Functional | Planned |

### 4.14 Onboarding Templates — `/onboarding-templates`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-078 | Dual empty-state strings render | No templates | 1) Navigate to `/onboarding-templates` | List shows "No templates yet."; detail pane shows "Select a template or create a new one."; `New Template` visible | P2 | UI | Automated (smoke) |
| TC-REC-079 | New Template opens the editor in the detail pane | On page | 1) Click `New Template` | An inline editor opens in the detail pane (master/detail layout — not a separate table modal) | P1 | Functional | Planned |
| TC-REC-080 | Create a template (happy path) | Editor open | 1) Enter a template name and save | Template appears in the left list panel; selecting it populates the detail/editor pane; the two empty-state strings disappear | P1 | Functional | Planned |
| TC-REC-081 | Create with blank name | Editor open | 1) Leave name blank<br>2) Save | Save blocked; validation shown; empty-state persists | P2 | Negative | Planned |
| TC-REC-082 | Add checklist items to a template | ≥1 template exists | 1) Select the template<br>2) Add one or more checklist/task items<br>3) Save | Items persist in the template detail and are available when starting an onboarding | P3 | Functional | Planned |

### 4.15 Onboarding Pipeline — `/onboarding-pipeline`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-083 | Empty-state baseline "No active onboardings." | No active onboardings | 1) Navigate to `/onboarding-pipeline` | Blank canvas with exactly "No active onboardings."; `Start Onboarding` button visible | P2 | UI | Automated (smoke) |
| TC-REC-084 | Start Onboarding opens the wizard/modal | On page | 1) Click `Start Onboarding` | A modal/wizard opens with candidate selection and onboarding-template selection | P1 | Functional | Planned |
| TC-REC-085 | Start an onboarding (happy path) | An offer-stage candidate exists AND ≥1 onboarding template exists | 1) Open the wizard<br>2) Pick the candidate and a template<br>3) Start | An active onboarding card/board appears; the "No active onboardings." message disappears | P1 | E2E | Planned |
| TC-REC-086 | Start blocked without candidate or template | No template (or no eligible candidate) | 1) Open the wizard<br>2) Attempt to start with a missing selection | Start is blocked/validated (cannot proceed without both candidate and template) | P2 | Negative | Planned |
| TC-REC-087 | Progress an onboarding to completion | An active onboarding exists | 1) Advance the onboarding through its checklist stages<br>2) Complete it | Onboarding is marked complete; the hire logically hands over to core HRMS employee records (`/employees`) | P2 | E2E | Planned |

---

## 5. Known build quirks asserted AS-IS

These reflect the live 2026-07-20 capture and MUST be asserted as-is (do not "correct" them in expectations):

1. **Async `Loading…` first row** — `/assessment-list`, `/communication-templates`, `/talent-pool`, `/candidate-status`, `/interview-rounds` all render a literal `Loading…` first row on mount. Tests must wait for it to clear (`expect(firstRow).not.toHaveText('Loading…')`) before asserting data. (TC-REC-036, 059, 064, 069, 074)
2. **Empty-but-present candidate row** — `/candidates` can report `rowCount 1` with an empty first row when there is no data. Assert on cell text, not row count; buckets read `0`. (TC-REC-035)
3. **`Sl No` vs `Sl.No` header spelling** — the settings masters `/candidate-status` and `/interview-rounds` use `Sl No` (no dot), whereas every other Recruitment grid uses `Sl.No`. Keep column selectors page-specific. (TC-REC-069, 074)
4. **Public page renders outside the ERP shell** — `/current-openings` has no breadcrumb, sidebar or app chrome and is reachable without the authenticated storage state. Assert the absence of the shell and reachability without login. (TC-REC-016)
5. **Mandatory vacancy filter on the Kanban** — `/recruitment-pipeline` renders only the filter bar until a vacancy is selected; `Score` is muted/disabled until a vacancy with candidates is chosen. Every pipeline test must select a vacancy (or `All vacancies`) first. (TC-REC-052, 057)
6. **Publish counter text** — `/vacancy-list` shows "N published · N total · Show Draft & Open"; this string is the assertion target for publish/create actions rather than a dedicated badge. (TC-REC-008, 010, 015)
7. **Tabs switch content without a route change** — `/candidates` (5 buckets) and `/vacancy-list` (3 tabs) swap panels in place; the URL does not change, so scope selectors to the active panel. (TC-REC-013, 014, 032)
8. **Row-level actions are table columns, not toolbar buttons** — on `/job-applications-list`, `Details` / `Schedule Interview` / `Reject` are per-row cells; target them within the matching row, not as page buttons. (TC-REC-024, 025, 026)

---

## 6. End-to-end / integration cases

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-REC-088 | Full hire-to-onboard chain | Clean tenant; masters seedable | 1) `/requisition-list`: raise + progress a requisition to Approved<br>2) `/vacancy-list`: `Add Job Opening` and publish it<br>3) `/current-openings`: apply for the published opening (public)<br>4) `/job-applications-list`: the application appears<br>5) `/candidates`: candidate progresses New → In Progress → Shortlisted → Selected<br>6) `/assessment-list`: score the candidate<br>7) `/interview-schedules`: schedule + complete interview round(s)<br>8) `/offer-list`: `New Offer` (CTC + Joining), mark Accepted<br>9) `/onboarding-pipeline`: `Start Onboarding` with a template<br>10) complete onboarding | Each hand-off carries the candidate forward with consistent identity; a completed onboarding hands over to `/employees`. Mirrors overview flow 4.1 | P1 | E2E | Planned |
| TC-REC-089 | Public apply → applications inbox → candidate | ≥1 published opening | 1) Submit an application on `/current-openings`<br>2) Confirm the row in `/job-applications-list` with correct `Position Applied For`<br>3) Use the row `Schedule Interview` action<br>4) Confirm the candidate/interview surfaces downstream | Application flows from the public page into the inbox and onward into the candidate/interview screens without data loss | P1 | E2E | Planned |
| TC-REC-090 | Master data drives dependent screens | Empty masters | 1) Create a status on `/candidate-status` and a round on `/interview-rounds`<br>2) Open `/candidates` and confirm the new status is usable<br>3) Open the `/interview-schedules` scheduler and confirm the new round is selectable | New master rows immediately populate the candidate status options and the interview round picker | P2 | E2E | Planned |
| TC-REC-091 | Reject → talent-pool archive → re-engage | ≥1 application/candidate | 1) `Reject` an application on `/job-applications-list` (or reject a candidate)<br>2) Find the archived candidate on `/talent-pool` (Pool = `Archived (talent pool)`)<br>3) Re-engage them against a new opening from `/vacancy-list` | Rejected/parked candidates are searchable in the pool with `Skills`/`Tags`/`Score` and can be pulled back into a new vacancy | P2 | E2E | Planned |
| TC-REC-092 | Offer accepted → onboarding → employee record | A `Selected` candidate + ≥1 onboarding template | 1) `/offer-list`: create an offer and mark it Accepted<br>2) `/onboarding-pipeline`: `Start Onboarding` for that candidate using the template<br>3) Progress checklist stages to completion | Accepted offer becomes the onboarding trigger; completed onboarding produces/links a core HRMS employee record (`/employees`) | P1 | E2E | Planned |

---

_Coverage: 15 pages · 92 test cases (TC-REC-001 … TC-REC-092) · 15 scenarios (SC-REC-01 … SC-REC-15)._
