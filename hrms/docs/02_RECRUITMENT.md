# HRMS — Recruitment & Onboarding

## Overview

The Recruitment & Onboarding sub-module of the Progbiz HRMS ERP (https://hrms-erp.progbiz.in) covers the full hire-to-onboard lifecycle. It starts with internal manpower demand (`/requisition-list`), turns approved demand into published job openings (`/vacancy-list`), and exposes those openings on a public careers page (`/current-openings`, "Join Our Team"). Inbound applicants surface in `/job-applications-list` and are managed as candidates in `/candidates`, where they move through follow-up statuses (New → In Progress → Shortlisted → Selected / Rejected). Screening is supported by an assessment library (`/assessment-list`), scheduled interviews (`/interview-schedules`), and a per-vacancy Kanban board (`/recruitment-pipeline`) with stage configuration and scoring. Successful candidates receive offers in `/offer-list`; unsuccessful or parked candidates are archived and searchable in `/talent-pool`. Master-data pages — `/candidate-status` (followup statuses) and `/interview-rounds` (round names and ordering) — feed the candidate and interview screens, while `/communication-templates` holds reusable candidate emails/messages. Once an offer is accepted, onboarding is driven by checklists defined in `/onboarding-templates` and executed per new hire in `/onboarding-pipeline`.

## Page Index

| # | Page | Route | Purpose |
|---|------|-------|---------|
| 1 | Job Requisitions | `/requisition-list` | Raise and track manpower requests through an approval workflow |
| 2 | Hiring — Job Openings | `/vacancy-list` | Create, publish and manage job openings (vacancies) |
| 3 | Current Openings (public careers) | `/current-openings` | Public "Join Our Team" page where applicants browse openings and apply |
| 4 | Job Applications | `/job-applications-list` | Review inbound applicants; schedule interview or reject |
| 5 | Candidates | `/candidates` | Central candidate register with status-bucket tabs |
| 6 | Assessments | `/assessment-list` | Library of reusable assessments (type, max score, attachment) |
| 7 | Interview Schedule | `/interview-schedules` | Schedule and track interviews per candidate/round |
| 8 | Offer Management | `/offer-list` | Create and track offers (CTC, joining date, status) |
| 9 | Recruitment Pipeline (Kanban) | `/recruitment-pipeline` | Per-vacancy Kanban board with configurable stages and scoring |
| 10 | Communication Templates | `/communication-templates` | Reusable candidate communication templates (name, type, subject) |
| 11 | Talent Pool & Archive | `/talent-pool` | Search archived/active candidates by name, skill and pool |
| 12 | Candidate Followup Status (Settings) | `/candidate-status` | Master list of candidate followup statuses and their nature |
| 13 | Interview Rounds (Settings) | `/interview-rounds` | Master list of interview rounds and their order |
| 14 | Onboarding Templates | `/onboarding-templates` | Define reusable onboarding checklists/templates |
| 15 | Onboarding Pipeline | `/onboarding-pipeline` | Start and track active onboardings for new hires |

## Pages

### Job Requisitions (`/requisition-list`)

- **Purpose** — Entry point of the hiring process: departments raise manpower requests ("Manpower Requests" card) for a designation/branch, which travel through an approval workflow before becoming vacancies.
- **UI elements**
  - Button: `New Requisition` (opens the create-requisition form/modal).
  - Status filter select with options (from body text): `All Status`, `Draft`, `Submitted`, `Approved`, `Rejected`, `Returned`.
  - Text input with placeholder `Search designation...`.
  - Breadcrumb: "Job Requisitions › Recruitment › Requisitions".
- **Data grid** — Columns: `Sl.No`, `Designation`, `Department`, `Positions`, `Type`, `Work Type`, `Status`, `Branch`, `Action`. One row = one manpower request (a demand for N positions of a designation in a department/branch). Captured with 0 rows.
- **Connections** — Approved requisitions logically feed `/vacancy-list` (a requisition for a designation becomes a job opening). Status values (`Draft`/`Submitted`/`Approved`/`Rejected`/`Returned`) imply a submit-and-approve chain that gates vacancy creation.
- **Automation notes** — Table rendered empty (rowCount 0) on capture: tests must handle the no-rows state. Filter by status via the single native `<select>`; search via the `Search designation...` placeholder input. `New Requisition` is the only primary action button — expect a modal/form on click. Assert row counts after switching the status filter.

### Hiring — Job Openings (`/vacancy-list`)

- **Purpose** — The "Hiring" workspace for recruiters: manage job openings (vacancies), see candidate counts per opening, and control publishing state.
- **UI elements**
  - Tabs: `Job Openings`, `Candidates`, `Talent Pools` (in-page tab strip switching between hiring views).
  - Button: `Add Job Opening`.
  - Status filter select with options (from body text): `All`, `Open`, `Draft`, `On Hold`, `Filled`, `Cancelled`.
  - Summary/counter text: "0 published · 0 total · Show Draft & Open" — publishing counters plus a display toggle.
- **Data grid** — Columns: `Candidates`, `Job Opening`, `Hiring Lead`, `Created On`, `Status`, `Action`. One row = one vacancy/job opening with its owning hiring lead and candidate count. Captured with 0 rows.
- **Connections** — Fed by approved requisitions from `/requisition-list`. "Published" openings surface on the public `/current-openings` page. The `Candidates` tab connects to the `/candidates` register and the `Talent Pools` tab to `/talent-pool`. Each opening is also the vacancy selected on `/recruitment-pipeline`.
- **Automation notes** — The tab strip (`Job Openings` / `Candidates` / `Talent Pools`) switches content without route change — scope selectors to the active tab panel. "0 published · 0 total" text is a useful assertion target after publish/unpublish actions. `Add Job Opening` should open a create form/modal. Single native `<select>` drives the status filter; empty table state must be handled.

### Current Openings — public careers page (`/current-openings`)

- **Purpose** — Public-facing "Join Our Team" page where external applicants pick a published opening and apply. This is the applicant-side mirror of `/vacancy-list`.
- **UI elements**
  - Heading: `Join Our Team`.
  - A single select with id `selectbox` (default option `Choose`) listing published openings, next to a blue search/submit icon button (visible in screenshot).
  - No breadcrumb, no sidebar, no ERP shell — this page renders outside the authenticated app chrome.
- **Data grid** — None. Page is a picker; with no published vacancies it renders only the heading and empty select.
- **Connections** — Populated by openings published from `/vacancy-list`. Submitted applications land in `/job-applications-list` (whose rows carry `Position Applied For`).
- **Automation notes** — Use `#selectbox` as the selector for the opening picker. The page is public (no ERP navigation/breadcrumb captured) — tests can hit it without the logged-in storage state, but must seed a *published* opening first or the select stays on `Choose` with no options. The apply form only appears after choosing an opening, so end-to-end tests need `select → search button → form` sequencing.

### Job Applications (`/job-applications-list`)

- **Purpose** — Inbox of inbound applicants ("Applicant Details" card): review each application and either move it forward (schedule an interview) or reject it.
- **UI elements**
  - No buttons, tabs, filters or inputs were captured at page level — all actions live in the table's per-row action columns.
  - Breadcrumb/header: "Job Applications".
- **Data grid** — Columns: `Sl.No`, `Name`, `Position Applied For`, `Phone`, `Email`, `Details`, `Status`, `Schedule Interview`, `Reject`. One row = one application submitted for a specific position. Captured with 0 rows.
- **Connections** — Fed by applications from `/current-openings`. The `Schedule Interview` column action feeds `/interview-schedules`; progressed applicants appear as candidates in `/candidates`; rejected applicants logically flow to the archive in `/talent-pool`.
- **Automation notes** — Row-level actions (`Details`, `Schedule Interview`, `Reject`) are table columns, not toolbar buttons — target them per-row (e.g. `row.getByRole('button')` within the matching cell). Expect a confirmation or scheduling modal on `Schedule Interview` / `Reject`. Empty state must be handled; seeding requires an application submitted via the public page or API.

### Candidates (`/candidates`)

- **Purpose** — Central candidate register for the whole funnel, bucketed by followup status with per-bucket counts.
- **UI elements**
  - Button: `Add New` (manual candidate entry; the captured `Candidate Name` and `Phone Number` placeholder inputs belong to this add form/modal).
  - Status tabs rendered as buttons with live counts: `New 0`, `In Progress 0`, `Shortlisted 0`, `Selected 0`, `Rejected 0`.
  - Text input with placeholder `Search Name/Phone` (list search).
  - Form inputs captured: `Candidate Name`, `Phone Number` text inputs plus four unlabeled selects (branch/designation/status-type pickers on the add form and list filters).
- **Data grid** — Columns: `Sl.No`, `Name`, `Email`, `Phone`, `Branch`, `Designation`, `Skills`, `Status`, `Added On`, `Action`. One row = one candidate profile. Captured rowCount 1 with an empty first row (placeholder/empty-state row).
- **Connections** — Receives candidates from `/job-applications-list` and manual `Add New` entry; also reachable via the `Candidates` tab on `/vacancy-list`. `Status` values are governed by the `/candidate-status` master. Candidates flow onward to `/interview-schedules`, `/recruitment-pipeline`, `/assessment-list` usage, and — when `Selected` — to `/offer-list`. Archived/rejected candidates surface in `/talent-pool`.
- **Automation notes** — The status buckets (`New`/`In Progress`/`Shortlisted`/`Selected`/`Rejected`) are buttons, not links — click them and assert the count suffix in the button label (e.g. `Shortlisted 3`). The `Add New` flow exposes `Candidate Name` / `Phone Number` placeholders as stable selectors. Distinguish the list-filter selects from the add-form selects by scoping to the modal when it is open. The grid can render a single empty row — do not treat rowCount 1 as data present; assert on cell text.

### Assessments (`/assessment-list`)

- **Purpose** — "Assessment Library": reusable assessment definitions (tests/tasks) with a type, description, maximum score and optional attachment, used to evaluate candidates.
- **UI elements**
  - Button: `New Assessment`.
  - Breadcrumb: "Assessments › Recruitment › Assessments".
- **Data grid** — Columns: `Sl.No`, `Title`, `Type`, `Description`, `Max Score`, `Attachment`, `Action`. One row = one assessment definition. Captured first row showed `Loading...` (async fetch in progress).
- **Connections** — Assessments are consumed during candidate evaluation — logically feeding the `Score` action on `/recruitment-pipeline` and interview evaluation in `/interview-schedules`; scores ultimately show as the `Score` column in `/talent-pool`.
- **Automation notes** — The grid initially renders a `Loading...` row: tests must wait for that text to disappear (`expect(row).not.toHaveText('Loading...')`) before asserting data. `New Assessment` should open a create modal/form including a file attachment field (implied by the `Attachment` column) — plan for Playwright `setInputFiles`.

### Interview Schedule (`/interview-schedules`)

- **Purpose** — "Scheduled Interviews": create and track interview appointments per candidate, round, date/time and mode.
- **UI elements**
  - Button: `Schedule Interview` (opens scheduling form/modal).
  - Breadcrumb: "Interviews › Recruitment › Interview Schedule".
- **Data grid** — Columns: `Sl.No`, `Candidate`, `Round`, `Scheduled On`, `Mode`, `Status`, `Action`. One row = one scheduled interview for a candidate in a specific round. Captured with 0 rows.
- **Connections** — Reached from the `Schedule Interview` action on `/job-applications-list` and used for candidates from `/candidates`. The `Round` values come from the `/interview-rounds` master. Interview outcomes drive candidate status changes (`/candidate-status` values on `/candidates`) and stage moves on `/recruitment-pipeline`; passed candidates progress to `/offer-list`.
- **Automation notes** — Single primary button `Schedule Interview` → expect a modal with candidate, round, date and mode fields (Round options depend on `/interview-rounds` seed data). Empty grid on capture — handle no-rows state; after scheduling, assert a row with the chosen candidate and `Scheduled On` value.

### Offer Management (`/offer-list`)

- **Purpose** — "Offers": issue and track job offers with total CTC, joining date and offer status.
- **UI elements**
  - Button: `New Offer`.
  - Breadcrumb: "Offers › Recruitment › Offer Management".
- **Data grid** — Columns: `Sl.No`, `Candidate`, `Total CTC`, `Joining`, `Status`, `Action`. One row = one offer extended to a candidate. Captured with 0 rows.
- **Connections** — Fed by `Selected` candidates from `/candidates` (after interviews in `/interview-schedules`). An accepted offer with its `Joining` date is the logical trigger for `Start Onboarding` on `/onboarding-pipeline` (using a checklist from `/onboarding-templates`). Offer letters/communications draw on `/communication-templates`.
- **Automation notes** — `New Offer` opens the offer form (candidate picker + CTC + joining date expected). Empty state must be handled. `Total CTC` and `Joining` cells are good assertion targets after creation; `Status` transitions (offer accepted/declined) are the hook for onboarding tests.

### Recruitment Pipeline — Kanban (`/recruitment-pipeline`)

- **Purpose** — Kanban view of a vacancy's candidate funnel: pick a vacancy, see candidates as cards in configurable stage columns, score them and keep stages in sync.
- **UI elements**
  - `Vacancy` select with options `— Select a vacancy —` and `All vacancies` (plus one option per open vacancy).
  - Buttons: `Configure Stages` (top-right, opens stage configuration) and `Score` (rendered muted/inactive until a vacancy with candidates is selected — screenshot shows it greyed next to the vacancy picker with a refresh icon button beside it).
  - `Auto-Sync` toggle — checkbox with id `autoSync`.
- **Data grid** — None; this is a Kanban board. With no vacancy selected the board area is empty (screenshot confirms only the filter bar renders).
- **Connections** — Vacancies come from `/vacancy-list`; cards are candidates from `/candidates`. `Score` ties to the `/assessment-list` library and to the `Score` column in `/talent-pool`. Stage movement mirrors candidate followup statuses (`/candidate-status`) — the `Auto-Sync` toggle suggests automatic status↔stage synchronisation. End of pipeline feeds `/offer-list`.
- **Automation notes** — Mandatory filter: nothing renders until a vacancy is chosen in the `Vacancy` select — every pipeline test must first select a vacancy (or `All vacancies`). Use `#autoSync` for the toggle. `Configure Stages` opens a stage-editing UI — treat as modal/panel. Kanban drag-and-drop (stage moves) will need Playwright `dragTo`/manual mouse events; there are no table selectors, so target cards by candidate name text.

### Communication Templates (`/communication-templates`)

- **Purpose** — "Candidate Communication" template library: reusable messages (e.g. emails) with a name, type and subject for candidate outreach at each stage.
- **UI elements**
  - Button: `New Template`.
  - Breadcrumb: "Candidate Communication › Recruitment › Communication Templates".
- **Data grid** — Columns: `Sl.No`, `Name`, `Type`, `Subject`, `Action`. One row = one communication template. Captured first row showed `Loading...` (async fetch).
- **Connections** — Supporting/master page: templates are logically consumed when communicating with applicants and candidates from `/job-applications-list`, `/candidates`, `/interview-schedules` (invites) and `/offer-list` (offer letters).
- **Automation notes** — Wait out the `Loading...` first row before asserting. `New Template` should open a create form with name/type/subject and body fields — a rich-text editor is likely, so prefer `data-testid`/role-based selectors over CSS classes for the body area.

### Talent Pool & Archive (`/talent-pool`)

- **Purpose** — Searchable archive of candidates: query by name/email, skill and pool (archived vs active) to resurface past candidates for new openings.
- **UI elements**
  - Button: `Search` (explicit submit — results load on click, not on keystroke).
  - Text input with placeholder `Name or email`.
  - `Skill` select (default `— Any —`).
  - `Pool` select with options (from body text): `Archived (talent pool)`, `Active`, `All`.
- **Data grid** — Columns: `Sl.No`, `Name`, `Designation`, `Skills`, `Tags`, `Status`, `Score`, `Action`. One row = one pooled/archived candidate with skill tags and evaluation score. Captured first row showed `Loading...`.
- **Connections** — Fed by rejected/parked candidates from `/candidates` and `/job-applications-list`; also reachable via the `Talent Pools` tab on `/vacancy-list`. The `Score` column reflects assessment/pipeline scoring (`/assessment-list`, `/recruitment-pipeline`). Pool candidates can be re-engaged into new vacancies from `/vacancy-list`.
- **Automation notes** — Search is button-driven: fill `Name or email`, choose `Skill`/`Pool`, then click `Search` and wait for the grid refresh (initial `Loading...` row must clear). The `Pool` select defaults to the archived view — tests asserting active candidates must switch it. Two native selects + one text input make stable placeholder/option-text selectors.

### Candidate Followup Status — Settings (`/candidate-status`)

- **Purpose** — HRMS Settings master ("Status List"): define candidate followup statuses and their nature, which drive the candidate lifecycle buckets.
- **UI elements**
  - Button: `Add Followup Status`.
  - Breadcrumb: "Candidate Status › HRMS › Settings › Candidate Followup Status".
- **Data grid** — Columns: `Sl No`, `Status Name`, `Nature`, `Action`. One row = one followup status definition (its `Nature` maps it to a lifecycle bucket such as new/in-progress/positive/negative). Captured first row showed `Loading...`.
- **Connections** — Master data consumed by `/candidates` (the `Status` column and the New/In Progress/Shortlisted/Selected/Rejected buckets) and logically by `/recruitment-pipeline` stage sync.
- **Automation notes** — Note the header spelling `Sl No` (no dot) vs `Sl.No` elsewhere — keep column selectors page-specific. Wait for `Loading...` to clear. `Add Followup Status` opens a small create modal (name + nature). As shared master data, mutations here affect `/candidates` tests — prefer creating uniquely-named statuses and cleaning up via the `Action` column.

### Interview Rounds — Settings (`/interview-rounds`)

- **Purpose** — HRMS Settings master: define interview round names and their sequence (`Order`) used when scheduling interviews.
- **UI elements**
  - Button: `Add Round`.
  - Breadcrumb: "Interview Rounds › HRMS › Settings › Interview Rounds".
- **Data grid** — Columns: `Sl No`, `Round Name`, `Order`, `Action`. One row = one interview round definition. Captured first row showed `Loading...`.
- **Connections** — Master data for the `Round` column/picker in `/interview-schedules`; round ordering shapes the interview progression that ultimately feeds `/offer-list`.
- **Automation notes** — Same `Sl No` header spelling and `Loading...` async-row behaviour as `/candidate-status`. `Add Round` opens a create modal (round name + order). Seed rounds before any `/interview-schedules` test, since scheduling needs at least one round to exist.

### Onboarding Templates (`/onboarding-templates`)

- **Purpose** — Define reusable onboarding checklists ("Templates") that structure a new hire's onboarding tasks.
- **UI elements**
  - Button: `New Template`.
  - "Templates" card acting as a template list panel; empty-state texts: "No templates yet." and "Select a template or create a new one." — a master/detail layout (template list on the left, detail/editor on the right).
  - Breadcrumb: "Onboarding Templates › HRMS › Onboarding Templates".
- **Data grid** — None (list/detail panels rather than a table).
- **Connections** — Templates are consumed by `/onboarding-pipeline` when starting an onboarding for a hired candidate (post-`/offer-list`).
- **Automation notes** — Assert the dual empty-state strings ("No templates yet." / "Select a template or create a new one.") before creation. `New Template` likely opens an inline editor in the detail pane rather than a modal — after creating, select the template in the list panel and assert the detail pane populates. No table selectors exist; target list items by template name text.

### Onboarding Pipeline (`/onboarding-pipeline`)

- **Purpose** — Execute and track active onboardings: each started onboarding runs a new hire through the checklist stages defined by an onboarding template.
- **UI elements**
  - Button: `Start Onboarding` (top-right, primary).
  - Empty state text: "No active onboardings." (screenshot confirms an otherwise blank canvas).
  - Breadcrumb: "Onboarding Pipeline › HRMS › Onboarding Pipeline".
- **Data grid** — None captured; with zero active onboardings the page shows only the empty-state message.
- **Connections** — The terminus of the recruitment flow: candidates with accepted offers in `/offer-list` are started here, using a checklist from `/onboarding-templates`. Completed onboarding logically hands the person over to core HRMS employee records (outside this sub-module).
- **Automation notes** — Assert the exact empty state "No active onboardings." as the baseline. `Start Onboarding` should open a modal/wizard (candidate + template selection) — it requires both an offer-stage candidate and at least one onboarding template as preconditions, so seed `/offer-list` and `/onboarding-templates` first. Board/card layout after starting is unverified in captures — discover selectors at test time.

## Process flows

- **Demand → Opening → Publication**: `/requisition-list` (raise `New Requisition` → status `Draft` → `Submitted` → `Approved`) → `/vacancy-list` (`Add Job Opening`, status `Open`, counted in "published · total") → published opening appears in the `#selectbox` on public `/current-openings`.
- **Application intake**: applicant applies on `/current-openings` → row appears in `/job-applications-list` (`Position Applied For` links it to the opening) → per-row `Schedule Interview` (→ `/interview-schedules`) or `Reject` (→ archive in `/talent-pool`).
- **Candidate progression**: candidate exists in `/candidates` (via application intake or `Add New`) → moves through followup buckets `New` → `In Progress` → `Shortlisted` → `Selected`/`Rejected`, with the bucket vocabulary defined in `/candidate-status`.
- **Evaluation loop**: `/interview-schedules` rounds (round names/order from `/interview-rounds`) + assessments from `/assessment-list` → scores and stage moves visualised per vacancy on `/recruitment-pipeline` (`Configure Stages`, `Score`, `Auto-Sync` keeping stages and candidate statuses aligned).
- **Offer → Onboarding**: `Selected` candidate → `/offer-list` `New Offer` (Total CTC + Joining date) → on acceptance → `/onboarding-pipeline` `Start Onboarding` using a checklist from `/onboarding-templates` → completed hire exits the recruitment sub-module into core HRMS.
- **Recycling talent**: rejected/parked candidates accumulate in `/talent-pool` (filter `Archived (talent pool)` / `Active` / `All`, search by skill) and can be re-engaged against new openings from `/vacancy-list`.
- **Communication throughout**: templates from `/communication-templates` (name/type/subject) back candidate messaging at every stage — application acknowledgements, interview invites and offer letters.
