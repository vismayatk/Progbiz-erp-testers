# HRMS Test Cases — Core HR

> Part of the HRMS test-documentation set (`hrms/docs/testing/`). App: https://hrms-erp.progbiz.in · tenant `Hrms`.
> Grounded in hrms/docs/01_CORE_HR.md + hrms/data/pages/*.json (live crawl 2026-07-20).
> IDs: test cases `TC-CHR-###` · scenarios `SC-CHR-##`. Priority P1 (critical) / P2 (major) / P3 (minor). Type: Functional / UI / Negative / E2E / Report. Automation: Automated (smoke) / Planned / Manual.

---

## 1. Scope — pages covered

| # | Page | Route | Archetype |
|---|------|-------|-----------|
| 1 | Employees | `/employees` | list + modal (`New Employee`) |
| 2 | Sections | `/sections` | inline-form + grid |
| 3 | Worker Directory | `/worker-directory` | special — Cards / Org Chart, button-triggered search |
| 4 | Salary Revisions | `/salary-revisions` | inline-form + grid |
| 5 | Employee Salary Process | `/employee-salary-process` | filter-first grid (branch + year + month) |
| 6 | Employee Deduction | `/employee-deduction` | inline entry form (no grid) |
| 7 | Employee Remark | `/employee-remark` | inline entry form (no grid) — label bug |
| 8 | Probation Dashboard | `/hrms/probation` | KPI dashboard + list + modal (`Start Probation`) |
| 9 | Probation Templates | `/hrms/probation-templates` | list + modal (`New Template`) |
| 10 | Probation Report | `/hrms/probation-report` | filter-first report + Excel export |
| 11 | Resigned Employees | `/resigned-employees` | read-only list + name filter |
| 12 | Employee Excel Import | `/upload-employee` | special — file upload — label bug |
| 13 | Letter Templates | `/letters/templates` | list + modal (`New Template`) |
| 14 | Generate Letter | `/letters/generate` | special — cascading selects + preview |
| 15 | My Approvals | `/approvals` | tabbed (3 tabs, live counts) |
| 16 | Approval Configuration | `/approval/config` | inline-form + grid — dynamic chain builder |
| 17 | Employee Deduction Reports | `/employee-deduction-report` | filter-first report |
| 18 | Employee Remark Reports | `/employee-remark-report` | filter-first report |

---

## 2. Prerequisites & test data

- **Login** — company code `Hrms`, user `vismaya`. Selectors: `#companycode`, `#signin-username`, `#signin-password`, `button[type=submit]`. Success = URL leaves `/login` and lands on `/home`. All test cases below assume an authenticated session unless a case states otherwise.
- **Roles / multi-user** — approval-routing cases (`/approvals`, `/salary-revisions` status, `/hrms/probation` decision) need a raiser account and a separate approver account. On a single account, assert the item lands in the correct inbox rather than approving one's own request.
- **Seed / data order** (mirrors the Core HR process chains):
  1. Master data: `/sections` (Department → Section) before employee create.
  2. Employees: `/employees` (`New Employee`) **or** bulk `/upload-employee` before any downstream page (directory, salary, deductions, remarks, probation, letters).
  3. Workflow: `/approval/config` — a `Salary Revision` and a `Probation Decision` workflow must exist before those documents route to `/approvals` (0 levels = auto-approve, no inbox entry).
  4. Compensation: an approved `/salary-revisions` gross before it shows as `Basic Salary` in `/employee-salary-process`.
  5. Probation: a `/hrms/probation-templates` template before `Start Probation` on `/hrms/probation`.
  6. Letters: a `/letters/templates` template before it is selectable in `/letters/generate`.
- **On the crawled tenant most grids were empty** — empty-state strings are exact and are captured as assertion targets throughout (e.g. `No revisions yet.`, `No one on probation.`, `Nothing awaiting your approval.`).
- **Cross-module masters** — `Department` (from Master → `/department`) must exist for `/sections`; branches come from company setup and back every `Branch` select on these pages.
- **Excel asset** — sample import file is served at `/assets/images/EmployeeExcelImport.xlsx`.

---

## 3. Scenarios (high level)

| Scenario ID | Title | Pages involved | Priority |
|-------------|-------|----------------|----------|
| SC-CHR-01 | Section master → create employee → appears in directory | `/sections`, `/employees`, `/worker-directory` | P1 |
| SC-CHR-02 | Bulk employee onboarding via Excel import | `/upload-employee`, `/employees`, `/worker-directory` | P1 |
| SC-CHR-03 | Salary revision → approval → monthly salary process | `/approval/config`, `/salary-revisions`, `/approvals`, `/employee-salary-process`, `/ess/payslips` | P1 |
| SC-CHR-04 | Probation lifecycle (template → start → review → decision → report) | `/hrms/probation-templates`, `/hrms/probation`, `/approval/config`, `/approvals`, `/hrms/probation-report`, `/ess/probation` | P1 |
| SC-CHR-05 | Deduction entry → deduction report | `/employee-deduction`, `/employee-deduction-report` | P2 |
| SC-CHR-06 | Remark entry → remark report | `/employee-remark`, `/employee-remark-report` | P2 |
| SC-CHR-07 | Letter template → generate → email → employee acknowledges | `/letters/templates`, `/letters/fields`, `/letters/generate`, `/ess/letters` | P1 |
| SC-CHR-08 | Approval workflow configuration drives the inbox | `/approval/config`, `/approvals` | P1 |
| SC-CHR-09 | Employee separation → resigned register | `/employees`, `/resigned-employees`, `/worker-directory` | P2 |
| SC-CHR-10 | Worker directory browse — Cards & Org Chart | `/worker-directory` | P3 |
| SC-CHR-11 | Known build label-bug regression sweep | `/employee-remark`, `/upload-employee` | P3 |
| SC-CHR-12 | Core HR navigation & empty-state smoke (all 18 pages) | all Core HR pages | P2 |

---

## 4. Detailed test cases

### 4.1 Employees — `/employees`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-001 | Employees page loads with register grid | Logged in | 1. Navigate to `/employees` | Page renders card `Employees`; buttons `Filter` and `New Employee` visible; grid header row shows `Sl.No`, `Employee Code`, `Employee Name`, `Department Name`, `Designation`, `Status`, `Actions`; `Include archived` checkbox (`#incl-archived`) present | P1 | UI | Automated (smoke) |
| TC-CHR-002 | Open New Employee create form | On `/employees` | 1. Click `New Employee` | A create form/modal opens for a new employee record (name/code/department/designation inputs) | P1 | Functional | Planned |
| TC-CHR-003 | Create employee — happy path | Department/section seeded | 1. Click `New Employee`<br>2. Fill required fields (name, code, department, designation)<br>3. Save | Record saved; new row appears in the grid with a `Status` and populated `Employee Code` / `Employee Name` / `Department Name` / `Designation` | P1 | Functional | Planned |
| TC-CHR-004 | Create employee — required-field validation | On create form | 1. Click `New Employee`<br>2. Leave mandatory fields empty<br>3. Attempt Save | Save blocked; validation messages shown on required fields; no new grid row added | P2 | Negative | Planned |
| TC-CHR-005 | Include archived toggle reveals archived employees | ≥1 archived/resigned employee exists | 1. Confirm archived employee is absent from grid<br>2. Check `#incl-archived`<br>3. Observe grid | With `#incl-archived` unchecked the archived record is hidden; checking it adds the archived row(s) to the grid | P2 | Functional | Planned |
| TC-CHR-006 | Filter panel toggles | On `/employees` | 1. Click `Filter` | A filter panel/controls appear (or toggle) without navigating away from `/employees` | P3 | UI | Planned |

### 4.2 Sections — `/sections`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-007 | Sections page loads (form + grid) | Logged in | 1. Navigate to `/sections` | Cards `Sections` and `New Section` render; form shows `Department :` select (default `Choose`) and `Section Name*` (`#sectionname`); buttons `Save`, `Clear`; grid header `SlNo`, `Department Name`, `Section Name`, `Action` | P2 | UI | Automated (smoke) |
| TC-CHR-008 | Create section — happy path | ≥1 department exists | 1. Select a department in `Department :`<br>2. Type a name in `#sectionname`<br>3. Click `Save` | Section saved; new row appears in grid mapping the chosen `Department Name` to the `Section Name` | P1 | Functional | Planned |
| TC-CHR-009 | Section Name required validation | On `/sections` | 1. Leave `#sectionname` empty<br>2. Click `Save` | Save blocked; validation flags the mandatory `Section Name*`; no row added | P2 | Negative | Planned |
| TC-CHR-010 | Department not chosen validation | On `/sections` | 1. Leave `Department :` on default `Choose`<br>2. Type a section name<br>3. Click `Save` | Save blocked / department required message; no row added | P2 | Negative | Planned |
| TC-CHR-011 | Clear resets the form | Form partly filled | 1. Enter department + section name<br>2. Click `Clear` | `#sectionname` cleared and `Department :` returns to `Choose`; no save performed | P3 | UI | Planned |

### 4.3 Worker Directory — `/worker-directory`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-012 | Directory loads in Cards view | Logged in | 1. Navigate to `/worker-directory` | Page shows `Cards` / `Org Chart` toggle, `Branch` select (default `-- All branches --`), search box (placeholder `Name, designation or department`) and `Search` button; Cards is the default view | P3 | UI | Automated (smoke) |
| TC-CHR-013 | Empty-search / no-match empty state | Empty tenant OR nonsense query | 1. Type an unmatchable string<br>2. Click `Search` | Message `No employees match the current filters.` is displayed; no cards render | P2 | Negative | Automated (smoke) |
| TC-CHR-014 | Search returns matching cards | ≥1 employee seeded | 1. Type an existing name/designation<br>2. Click `Search` | Matching employee card(s) render (search is button-triggered, not live-typed) | P2 | Functional | Planned |
| TC-CHR-015 | Switch to Org Chart view | ≥1 employee with reporting line | 1. Click `Org Chart` | View switches from cards to an org-chart rendering; toggling `Cards` returns to card view | P3 | UI | Planned |
| TC-CHR-016 | Branch filter narrows results | Employees across ≥2 branches | 1. Select a specific `Branch`<br>2. Click `Search` | Only employees of the chosen branch are shown; `-- All branches --` shows all | P3 | Functional | Planned |

### 4.4 Salary Revisions — `/salary-revisions`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-017 | Page loads with empty history | Logged in | 1. Navigate to `/salary-revisions` | Card `Raise A Revision` with `Branch`, `Employee`, `New Gross` (number), `Effective Date` (date), `Reason` (textarea) and `Raise Revision` button; card `Revision History` grid header `Employee`, `Branch`, `Effective`, `Old`, `New`, `%`, `Status`; single row reads `No revisions yet.` | P2 | UI | Automated (smoke) |
| TC-CHR-018 | Branch gates Employee (cascade) | ≥1 employee under a branch | 1. Note Employee select before choosing branch<br>2. Select a `Branch`<br>3. Open `Employee` | Employee options populate only after a branch is chosen (cascading dropdowns) | P2 | Functional | Planned |
| TC-CHR-019 | Raise a revision — happy path | Employee with existing gross; `Salary Revision` workflow configured | 1. Select `Branch`<br>2. Select `Employee`<br>3. Enter `New Gross`<br>4. Pick `Effective Date`<br>5. Enter `Reason`<br>6. Click `Raise Revision` | New row appears in `Revision History` with `Old`/`New`/`%` computed and a `Status` (pending if a chain exists, auto-approved if 0-level) | P1 | Functional | Planned |
| TC-CHR-020 | Raise revision — required-field validation | On `/salary-revisions` | 1. Click `Raise Revision` with Branch/Employee/New Gross empty | Save blocked; required-field validation; grid still shows `No revisions yet.` | P2 | Negative | Planned |
| TC-CHR-021 | New Gross rejects non-positive / non-numeric | Branch + Employee selected | 1. Enter `0` or a negative/blank in `New Gross`<br>2. Click `Raise Revision` | Revision rejected or `%` cannot be computed; no valid revision row created (New Gross is `type=number`) | P2 | Negative | Planned |
| TC-CHR-022 | Revision status reflects workflow | `Salary Revision` chain with ≥1 level configured | 1. Raise a revision<br>2. Inspect `Status` cell | `Status` shows a pending/awaiting state and a matching item appears in the approver's `/approvals` inbox | P1 | E2E | Planned |

### 4.5 Employee Salary Process — `/employee-salary-process`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-023 | Page loads showing No Data until filtered | Logged in | 1. Navigate to `/employee-salary-process` | Filters `Branch` (`#assignedToBranch`, default `All`), `Salary Year :`, `Salary Month :` (January–December) and a `Save` button render; grid header `Staff Name`, `Basic Salary`, `No of Leave`, `Payable Amount`; single row reads `No Data` | P2 | UI | Automated (smoke) |
| TC-CHR-024 | Compute payroll for a month | Employees + salary in selected branch | 1. Select `Branch` in `#assignedToBranch`<br>2. Select `Salary Year :`<br>3. Select `Salary Month :` | Grid populates one row per employee with `Basic Salary`, `No of Leave`, `Payable Amount`; `No Data` row is replaced | P1 | Functional | Planned |
| TC-CHR-025 | Year/Month selects disambiguated (duplicate name) | On `/employee-salary-process` | 1. Locate the two selects sharing `name="narration-typ"`<br>2. Set year on the first, month on the second (by position/label) | Both selects operate independently; grid recomputes for the chosen year+month (must not target by `name` alone) | P2 | Functional | Planned |
| TC-CHR-026 | Save the salary run | Grid populated for a month | 1. Populate grid<br>2. Click `Save` | Whole displayed run persists (no per-row save); success confirmation; re-opening the same branch/year/month shows saved values | P1 | Functional | Planned |
| TC-CHR-027 | Basic Salary reflects approved revision | An approved `/salary-revisions` gross exists | 1. Select that employee's branch + a month on/after the effective date | The employee's `Basic Salary` matches the revised gross from `/salary-revisions` | P2 | E2E | Planned |
| TC-CHR-028 | Save with No Data blocked | No employees for chosen filters | 1. Choose a branch/month with no employees<br>2. Click `Save` | Grid stays on `No Data`; save is a no-op / blocked (nothing to persist) | P3 | Negative | Planned |

### 4.6 Employee Deduction — `/employee-deduction`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-029 | Deduction entry form loads | Logged in | 1. Navigate to `/employee-deduction` | Card `Employee Deduction`; fields `Branch` (`#branch`, `Choose`), `Staff` (`Choose`), `Date` (`#enquiry-date`), `Deduction Type *` (typeahead `#building-type`, placeholder `Enter deduction type and search`), `Pay Using` (`Choose`), `Amount :` (`#amount`), `Details` (`#details-text-area`); buttons `Save`, `Cancel` | P2 | UI | Automated (smoke) |
| TC-CHR-030 | Record a deduction — happy path | ≥1 employee under branch | 1. Select `Branch`<br>2. Select `Staff`<br>3. Pick `Date`<br>4. Type in `Deduction Type *` and pick a suggestion<br>5. Select `Pay Using`<br>6. Enter `Amount :`<br>7. Add `Details`<br>8. Click `Save` | Deduction saved (success confirmation); entry is later retrievable on `/employee-deduction-report` | P1 | Functional | Planned |
| TC-CHR-031 | Deduction Type required (typeahead) | Branch + Staff selected | 1. Leave `#building-type` empty (do not pick a suggestion)<br>2. Click `Save` | Save blocked; `Deduction Type *` flagged mandatory (it is search-as-you-type, not a select — a free-typed value with no suggestion selected should not save) | P2 | Negative | Planned |
| TC-CHR-032 | Duplicate `#employee` id — Staff vs Pay Using | On `/employee-deduction` | 1. Inspect DOM: `Staff` and `Pay Using` both captured as `id="employee"`<br>2. Set each via label/position-relative locator | Both selects can be set independently; a locator using `#employee` alone is ambiguous (documented DOM defect) | P3 | Negative | Planned |
| TC-CHR-033 | Cancel discards the entry | Form partly filled | 1. Fill some fields<br>2. Click `Cancel` | Form is cleared/reset; no deduction saved | P3 | UI | Planned |

### 4.7 Employee Remark — `/employee-remark`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-034 | Remark form loads with reduced field set | Logged in | 1. Navigate to `/employee-remark` | Fields `Branch` (`#branch`), `Staff` (`#employee`), `Date` (`#enquiry-date`), `Details` (`#details-text-area`); buttons `Save`, `Cancel`; **no** Deduction Type / Amount / Pay Using fields | P2 | UI | Automated (smoke) |
| TC-CHR-035 | Label bug — header reads "Employee Deduction" (assert AS-IS) | On `/employee-remark` | 1. Read page header, breadcrumb and card title | All three read `Employee Deduction` even though the route is `/employee-remark`; assert URL = `/employee-remark` + reduced field set, **not** a title of "Employee Remark" | P3 | UI | Automated (smoke) |
| TC-CHR-036 | Record a remark — happy path | ≥1 employee under branch | 1. Select `Branch`<br>2. Select `Staff`<br>3. Pick `Date`<br>4. Enter `Details`<br>5. Click `Save` | Remark saved (success confirmation); entry later retrievable on `/employee-remark-report` | P1 | Functional | Planned |
| TC-CHR-037 | Remark required-field validation | On `/employee-remark` | 1. Click `Save` with Staff/Details empty | Save blocked; required-field validation; nothing saved | P2 | Negative | Planned |
| TC-CHR-038 | Cancel discards the remark | Form partly filled | 1. Fill some fields<br>2. Click `Cancel` | Form reset; no remark saved | P3 | UI | Planned |

### 4.8 Probation Dashboard — `/hrms/probation`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-039 | Dashboard loads with KPI tiles and list | Logged in | 1. Navigate to `/hrms/probation` | Header actions `Report`, `Templates`, `Start Probation`; KPI tiles `On Probation`, `Reviews Due (7d)`, `Overdue Reviews`, `Ending Soon (30d)`; card `Employees On Probation`; grid header `Employee`, `Branch`, `Start`, `End`, `Reviews`, `Next Review`, `Days Left`, `Action` | P2 | UI | Automated (smoke) |
| TC-CHR-040 | Empty state and zero KPIs on clean tenant | No one on probation | 1. Observe KPI tiles and grid | All four KPI tiles read `0`; grid single row reads `No one on probation.` | P2 | UI | Automated (smoke) |
| TC-CHR-041 | Report link navigates | On `/hrms/probation` | 1. Click `Report` | Navigates to `/hrms/probation-report` (anchor `href="/hrms/probation-report"`) | P3 | UI | Automated (smoke) |
| TC-CHR-042 | Templates link navigates | On `/hrms/probation` | 1. Click `Templates` | Navigates to `/hrms/probation-templates` (anchor `href="/hrms/probation-templates"`) | P3 | UI | Automated (smoke) |
| TC-CHR-043 | Start Probation opens picker | ≥1 template active; ≥1 employee | 1. Click `Start Probation` | A modal/form opens to pick an employee + probation template | P1 | Functional | Planned |
| TC-CHR-044 | Start Probation — happy path & KPI increment | Active template + eligible employee | 1. Click `Start Probation`<br>2. Choose employee + template<br>3. Confirm | Employee appears as a grid row with `Start`/`End`/`Reviews`/`Next Review`/`Days Left`; `On Probation` KPI increments from `0` to `1` | P1 | E2E | Planned |

### 4.9 Probation Templates — `/hrms/probation-templates`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-045 | Templates list loads (empty state) | Logged in | 1. Navigate to `/hrms/probation-templates` | Button `New Template`; grid header `Name`, `Duration`, `Checkpoints (days)`, `Criteria`, `Default`, `Active`, `Action`; single row reads `No templates yet.` | P2 | UI | Automated (smoke) |
| TC-CHR-046 | New Template opens editor | On page | 1. Click `New Template` | A create modal/form opens (duration, checkpoint days, criteria, default, active) | P2 | Functional | Planned |
| TC-CHR-047 | Create a template — happy path | On editor | 1. Click `New Template`<br>2. Enter name, duration, checkpoint days, criteria<br>3. Save | New row appears with the entered `Duration`, `Checkpoints (days)`, `Criteria`; `No templates yet.` row gone | P1 | Functional | Planned |
| TC-CHR-048 | Default flag is single-select across templates | ≥2 templates | 1. Mark template B as `Default` | Only one template shows `Default = true` at a time (setting B clears the previous default) | P2 | Functional | Planned |
| TC-CHR-049 | Inactive template excluded from Start Probation | ≥1 template with `Active = false` | 1. Set a template inactive<br>2. Open `Start Probation` on `/hrms/probation` | The inactive template is not offered in the Start-Probation template picker | P2 | Functional | Planned |

### 4.10 Probation Report — `/hrms/probation-report`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-050 | Report loads; grid empty until run | Logged in | 1. Navigate to `/hrms/probation-report` | Filters `From (start date)`, `To (start date)`, `Branch` (default `All branches`); buttons `Run Report`, `Export Excel`; KPI tiles `Total`, `On Probation`, `Confirmed`, `Terminated`, `Awaiting Approval`, `Overdue Reviews`, `Completion Rate` (shows `0%`); card `Details (0)`; grid single row `No probations in this range.` | P2 | UI | Automated (smoke) |
| TC-CHR-051 | Run Report populates grid + KPIs | Probations exist in range | 1. Set `From`/`To`<br>2. Optionally pick `Branch`<br>3. Click `Run Report` | Grid rows render (`Employee`, `Branch`, `Start`, `End`, `Outcome`, `Reviews`, `Overdue`, `Decision`); KPI tiles and `Completion Rate` update; `Details (n)` title reflects the row count | P2 | Report | Planned |
| TC-CHR-052 | Empty range keeps empty state | Range with no probations | 1. Pick a range known to have none<br>2. Click `Run Report` | Grid stays `No probations in this range.`; `Details (0)`; KPIs `0` | P2 | Negative | Planned |
| TC-CHR-053 | Export Excel triggers download | Report has rows | 1. Run report with data<br>2. Click `Export Excel` | A file download starts (capture via download event) | P2 | Report | Planned |
| TC-CHR-054 | Details (n) count matches grid rows | Report has rows | 1. Run report<br>2. Compare `Details (n)` to grid row count | Card title count `n` equals the number of data rows in the grid | P3 | Report | Planned |

### 4.11 Resigned Employees — `/resigned-employees`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-055 | Resigned register loads | Logged in | 1. Navigate to `/resigned-employees` | Card `Resigned Employees`; name filter (`#filter-name`); grid header `SlNo`, `Date`, `Name`, `Phone`, `Designation`, `Nationality`; no create/edit buttons | P2 | UI | Automated (smoke) |
| TC-CHR-056 | Empty grid renders blank row (no explicit empty text) | No resigned employees | 1. Observe grid | Grid shows a single row of empty cells (no explicit empty-state message) — treat empty-string first cell as "no data" | P3 | UI | Automated (smoke) |
| TC-CHR-057 | Name filter narrows the list | ≥1 resigned employee | 1. Type a name fragment in `#filter-name` | Grid filters client-side to matching `Name` rows | P2 | Functional | Planned |
| TC-CHR-058 | Read-only — no create/edit actions | On page | 1. Inspect page for action buttons | No `New`/`Edit`/`Delete` controls — resignations are driven from the `/employees` record, not here | P3 | UI | Automated (smoke) |

### 4.12 Employee Excel Import — `/upload-employee`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-059 | Import page loads | Logged in | 1. Navigate to `/upload-employee` | File input labelled `Upload Recipient Excel File`; link `Download Sample Excel`; buttons `Excel Rules`, `Upload` | P2 | UI | Automated (smoke) |
| TC-CHR-060 | Label bug — card titled "Leave Request" (assert AS-IS) | On page | 1. Read the card title | Card title reads `Leave Request` (copy-paste bug) although this is the employee import page — assert AS-IS; do **not** assert a correct title | P3 | UI | Automated (smoke) |
| TC-CHR-061 | Download Sample Excel | On page | 1. Click `Download Sample Excel` | Downloads `EmployeeExcelImport.xlsx` (href `/assets/images/EmployeeExcelImport.xlsx`) | P3 | Functional | Planned |
| TC-CHR-062 | Excel Rules info dialog | On page | 1. Click `Excel Rules` | An info dialog opens describing the required columns/format | P3 | UI | Planned |
| TC-CHR-063 | Bulk import — happy path | Filled sample file | 1. `setInputFiles` on the file input with a valid filled sheet<br>2. Click `Upload` | Success message; the imported employees appear as rows in `/employees` (and then `/worker-directory`) | P1 | E2E | Planned |
| TC-CHR-064 | Malformed sheet rejected | Sheet with missing/invalid columns | 1. Upload a malformed file<br>2. Click `Upload` | Import rejected with a clear error; no partial/garbage records created in `/employees` | P2 | Negative | Planned |

### 4.13 Letter Templates — `/letters/templates`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-065 | Templates list loads (empty state) | Logged in | 1. Navigate to `/letters/templates` | Buttons/links `Merge Fields`, `Generate Letter`, `New Template`; grid header `Name`, `Owner`, `Type`, `Subject`, `Active`, `Action`; single row reads `No templates yet.` | P2 | UI | Automated (smoke) |
| TC-CHR-066 | New Template opens editor | On page | 1. Click `New Template` | Template editor opens (name/type/subject/body with placeholders) | P2 | Functional | Planned |
| TC-CHR-067 | Create a template — happy path | On editor | 1. Create a template with name/type/subject/body<br>2. Save | New row appears in the grid with `Name`/`Owner`/`Type`/`Subject` and `Active` set | P1 | Functional | Planned |
| TC-CHR-068 | Merge Fields link navigates | On page | 1. Click `Merge Fields` | Navigates to `/letters/fields` (placeholder catalogue) | P3 | UI | Automated (smoke) |
| TC-CHR-069 | Generate Letter link navigates | On page | 1. Click `Generate Letter` | Navigates to `/letters/generate` | P3 | UI | Automated (smoke) |

### 4.14 Generate Letter — `/letters/generate`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-070 | Generate page loads with preview hint | Logged in | 1. Navigate to `/letters/generate` | Selects `Template` (`-- Select template --`), `Branch` (`-- Select branch --`), `Employee` (`-- Select employee --`); checkbox `Email the letter` (`#sendmail`); buttons `Preview`, `Generate`; card `Preview` with hint `Select a template and employee, then Preview.`; breadcrumb `Letter Templates  Generate` | P2 | UI | Automated (smoke) |
| TC-CHR-071 | Template select empty on unseeded tenant | No templates authored | 1. Open `Template` select | `Template` has no selectable options (seed a template via `/letters/templates` first) | P3 | Negative | Automated (smoke) |
| TC-CHR-072 | Branch gates Employee (cascade) | Template + employees seeded | 1. Select `Template`<br>2. Select `Branch`<br>3. Open `Employee` | Employee options populate after Branch is chosen | P2 | Functional | Planned |
| TC-CHR-073 | Preview merged letter | Template + employee selectable | 1. Select `Template`<br>2. Select `Branch`<br>3. Select `Employee`<br>4. Click `Preview` | The `Preview` card fills with merged content (hint text replaced) reflecting the employee's data | P1 | Functional | Planned |
| TC-CHR-074 | Generate without preview requires template + employee | On page | 1. Click `Generate` with Template/Employee empty | Generate blocked; required-selection validation (preview hint enforces template + employee) | P2 | Negative | Planned |
| TC-CHR-075 | Generate with Email the letter | Preview succeeded; `#sendmail` supported | 1. Check `#sendmail`<br>2. Click `Generate` | Letter generated and emailed; result becomes visible to the employee on `/ess/letters` | P1 | E2E | Planned |

### 4.15 My Approvals — `/approvals`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-076 | Approvals inbox loads (Awaiting default) | Logged in | 1. Navigate to `/approvals` | Tabs `Awaiting my decision (0)`, `My requests`, `History`; button `Refresh`; card `Awaiting My Decision (0)`; grid header `Type`, `Details`, `Level`, `As`, `Raised`, `Action`; breadcrumb group `Workflow` | P2 | UI | Automated (smoke) |
| TC-CHR-077 | Empty inbox state | Nothing pending | 1. Observe the Awaiting grid | Single row reads `Nothing awaiting your approval.` and tab count is `(0)` | P2 | UI | Automated (smoke) |
| TC-CHR-078 | Tab counts matched by regex not exact text | On page | 1. Read `Awaiting my decision (n)` label | Assert the label via regex `Awaiting my decision \(\d+\)` (count is dynamic) | P3 | UI | Automated (smoke) |
| TC-CHR-079 | My requests tab | Signed-in user raised ≥1 request | 1. Click `My requests` | Tab shows the user's own submitted approval requests (e.g. a salary revision they raised) | P2 | Functional | Planned |
| TC-CHR-080 | History tab | ≥1 actioned item | 1. Click `History` | Tab shows previously decided items (approved/rejected history) | P3 | Functional | Planned |
| TC-CHR-081 | Approve a pending item (multi-user) | Raiser submitted; approver logged in | 1. As approver, open `Awaiting my decision`<br>2. Use the `Action` control to approve | Item leaves the inbox; source document status updates (e.g. `/salary-revisions` `Status`, `/hrms/probation-report` `Decision`) | P1 | E2E | Planned |

### 4.16 Approval Configuration — `/approval/config`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-082 | Config page loads with type options | Logged in | 1. Navigate to `/approval/config` | Card `New Workflow`: `Approval Type` select (`-- Select type --`) including `Salary Revision`, `Probation Decision`, `Leave Request`, etc.; `Workflow Name` input (placeholder `e.g. Long Leave Approval`); checkbox `Default for this type` (`#cfgDefault`); `+ Add level`, `Save Workflow`; card `Configured Workflows` grid header `Type`, `Name`, `Approval chain`; single row `No workflows configured yet.` | P2 | UI | Automated (smoke) |
| TC-CHR-083 | Approval Type list includes Core-HR types | On page | 1. Open `Approval Type` | Options include `Salary Revision` and `Probation Decision` (the two Core-HR-relevant types) among the full list | P3 | UI | Automated (smoke) |
| TC-CHR-084 | + Add level appends chain rows | On `New Workflow` | 1. Click `+ Add level` twice | Two approval-level rows are appended dynamically under `Approval Levels` | P2 | Functional | Planned |
| TC-CHR-085 | Save 0-level workflow = auto-approve | On page | 1. Select `Approval Type`<br>2. Enter `Workflow Name`<br>3. Add **no** levels<br>4. Click `Save Workflow` | Workflow saved; per page copy `No levels = direct (auto-approve, no approval step)` — documents of this type auto-approve and create **no** `/approvals` entry | P1 | Functional | Planned |
| TC-CHR-086 | Save multi-level workflow | On page | 1. Select type<br>2. Name it<br>3. `+ Add level` ×2 and configure approvers<br>4. `Save Workflow` | New row appears in `Configured Workflows` with the `Type`, `Name` and a visible multi-step `Approval chain` | P1 | Functional | Planned |
| TC-CHR-087 | Default for this type flag | ≥1 workflow of a type | 1. Check `#cfgDefault`<br>2. Save | Workflow is marked default for that type (used when a document doesn't pick a specific workflow) | P2 | Functional | Planned |
| TC-CHR-088 | Save without type/name blocked | On page | 1. Click `Save Workflow` with `-- Select type --` and empty name | Save blocked; required-field validation; grid still `No workflows configured yet.` | P2 | Negative | Planned |

### 4.17 Employee Deduction Reports — `/employee-deduction-report`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-089 | Report page loads; no grid until run | Logged in | 1. Navigate to `/employee-deduction-report` | Filters `Deduction Type` (default `All`), `Staff` (default `All`), `Period` (`#timePeriodSelect`: `Choose`, `This Week`, `This Month`, `This Year`, `Custom`); button `View Report`; no results table rendered on load | P2 | UI | Automated (smoke) |
| TC-CHR-090 | View Report renders results | ≥1 deduction saved | 1. Set filters (e.g. `Period = This Month`)<br>2. Click `View Report` | Results grid renders with the seeded deduction row(s) | P2 | Report | Planned |
| TC-CHR-091 | Custom period reveals date inputs | On page | 1. Set `Period = Custom` | From/To date inputs appear dynamically (not present until `Custom` chosen) | P2 | Functional | Planned |
| TC-CHR-092 | Filter by Deduction Type | ≥2 deduction types recorded | 1. Choose a specific `Deduction Type`<br>2. `View Report` | Only deductions of the chosen type are listed | P3 | Report | Planned |
| TC-CHR-093 | Duplicate `#report-assignee` id — Deduction Type vs Staff | On page | 1. Inspect DOM: `Deduction Type` and `Staff` both `id="report-assignee"`<br>2. Set each via label/position locator | Both selects operate independently; `#report-assignee` alone is ambiguous (documented DOM defect) | P3 | Negative | Planned |

### 4.18 Employee Remark Reports — `/employee-remark-report`

| ID | Title | Preconditions | Steps | Expected result | Priority | Type | Automation |
|----|-------|---------------|-------|-----------------|----------|------|------------|
| TC-CHR-094 | Report page loads; no grid until run | Logged in | 1. Navigate to `/employee-remark-report` | Filters `Staff` (default `All`, `#report-assignee`), `Period` (`#timePeriodSelect`: `Choose`, `This Week`, `This Month`, `This Year`, `Custom`); button `View Report`; no results table on load | P2 | UI | Automated (smoke) |
| TC-CHR-095 | View Report renders results | ≥1 remark saved | 1. Set `Period`/`Staff`<br>2. Click `View Report` | Results grid renders with the seeded remark row(s) | P2 | Report | Planned |
| TC-CHR-096 | Custom period reveals date inputs | On page | 1. Set `Period = Custom` | From/To date inputs appear dynamically | P2 | Functional | Planned |
| TC-CHR-097 | Filter by Staff | Remarks for ≥2 staff | 1. Select a specific `Staff`<br>2. `View Report` | Only that staff member's remarks are listed | P3 | Report | Planned |
| TC-CHR-098 | Shared page-object parity with deduction report | Both report pages available | 1. Compare filter ids across `/employee-remark-report` and `/employee-deduction-report` | Both use `#report-assignee` + `#timePeriodSelect` and the same pull-based pattern — a shared page object is valid | P3 | UI | Planned |

---

## 5. Known build quirks asserted AS-IS

These are captured behaviours on the crawled DEV build. Tests assert them **as they are** and flag them as known defects — they must not be "corrected" in expectations.

| Quirk | Page / Route | Assert AS-IS | Covered by |
|-------|--------------|--------------|------------|
| Page header, breadcrumb and card title all read **"Employee Deduction"** on the remark page | `/employee-remark` | Assert URL = `/employee-remark` + reduced field set (`Branch`, `Staff`, `Date`, `Details`; no Deduction Type/Amount/Pay Using). Do NOT assert a title of "Employee Remark". | TC-CHR-035 |
| Card title reads **"Leave Request"** on the employee import page | `/upload-employee` | Assert the card title string is `Leave Request` (copy-paste bug); do not expect a correct import title. | TC-CHR-060 |
| Duplicate DOM id `#employee` on both `Staff` and `Pay Using` selects | `/employee-deduction` | Locate each by label/position, never by `#employee` alone. | TC-CHR-032 |
| Duplicate DOM id `#report-assignee` on both `Deduction Type` and `Staff` selects | `/employee-deduction-report` | Locate each by label/position, never by `#report-assignee` alone. | TC-CHR-093 |
| Non-semantic ids reused from other modules (`#enquiry-date` for Date, `#building-type` for Deduction Type) | `/employee-deduction`, `/employee-remark` | Stable but misleading; prefer label-based locators. | TC-CHR-029, TC-CHR-034 |
| Two Year/Month selects share `name="narration-typ"` | `/employee-salary-process` | Disambiguate by position/label, not by `name`. | TC-CHR-025 |
| Empty resigned grid renders a blank-cell row rather than an empty-state message | `/resigned-employees` | Treat empty-string first cell as "no data" (no `No ...` text). | TC-CHR-056 |
| `/employee-remark` header bug means E2E remark assertions must not rely on page title | `/employee-remark` → `/employee-remark-report` | Assert via URL + field set + saved report row. | SC-CHR-06, TC-CHR-035 |

---

## 6. End-to-end / integration cases

| ID | Title | Chain | Steps (compact) | Expected result | Priority | Type | Automation |
|----|-------|-------|-----------------|-----------------|----------|------|------------|
| TC-CHR-099 | Hire-to-directory (single) | `/sections` → `/employees` → `/worker-directory` | 1. Create a Section under a Department (`/sections`)<br>2. `New Employee` on `/employees` with that department<br>3. Save<br>4. Go to `/worker-directory`, search the name | Employee row present in `/employees` grid; same person surfaces as a card in `/worker-directory` (Cards view) and in `Org Chart` | P1 | E2E | Planned |
| TC-CHR-100 | Bulk import to directory | `/upload-employee` → `/employees` → `/worker-directory` | 1. Download sample, fill valid rows<br>2. Upload on `/upload-employee`<br>3. Verify rows in `/employees`<br>4. Search them in `/worker-directory` | Imported employees appear in both the register and the directory | P1 | E2E | Planned |
| TC-CHR-101 | Salary revision → approval → payroll | `/approval/config` → `/salary-revisions` → `/approvals` → `/employee-salary-process` → `/ess/payslips` | 1. Configure a `Salary Revision` chain (≥1 level)<br>2. Raise a revision (branch → employee → new gross → effective → reason)<br>3. As approver, approve it in `/approvals`<br>4. Revision `Status` becomes approved<br>5. Run `/employee-salary-process` for that branch/month<br>6. Check `/ess/payslips` | Revision routes to `/approvals`; on approval `Status` updates and the new gross drives `Basic Salary` in the salary process; payslip reflects it | P1 | E2E | Planned |
| TC-CHR-102 | 0-level workflow auto-approves | `/approval/config` → `/salary-revisions` → `/approvals` | 1. Configure a `Salary Revision` workflow with **no** levels<br>2. Raise a revision<br>3. Inspect `Status` and `/approvals` | Revision is auto-approved directly; **no** item appears in the `/approvals` inbox (`No levels = direct`) | P1 | E2E | Planned |
| TC-CHR-103 | Probation lifecycle end-to-end | `/hrms/probation-templates` → `/hrms/probation` → `/approval/config` → `/approvals` → `/hrms/probation-report` → `/ess/probation` | 1. Create an active template<br>2. `Start Probation` for an employee<br>3. Progress checkpoint reviews<br>4. Confirm/terminate via `Probation Decision` workflow (`/approvals`)<br>5. `Run Report` on `/hrms/probation-report`<br>6. Check `/ess/probation` | KPI `On Probation` increments; decision routes through `/approvals`; outcome + `Completion Rate` appear in the report; employee sees own probation in ESS | P1 | E2E | Planned |
| TC-CHR-104 | Deduction entry → report | `/employee-deduction` → `/employee-deduction-report` | 1. Save a deduction (branch, staff, date, deduction type, amount)<br>2. Open `/employee-deduction-report`<br>3. Filter + `View Report` | The saved deduction appears in the report grid under the matching type/staff/period | P2 | E2E | Planned |
| TC-CHR-105 | Remark entry → report | `/employee-remark` → `/employee-remark-report` | 1. Save a remark (branch, staff, date, details) — remember the "Employee Deduction" header bug<br>2. Open `/employee-remark-report`<br>3. Filter + `View Report` | The saved remark appears in the report grid under the matching staff/period | P2 | E2E | Planned |
| TC-CHR-106 | Letter template → generate → ESS | `/letters/templates` (+ `/letters/fields`) → `/letters/generate` → `/ess/letters` | 1. Author a template with merge fields<br>2. On `/letters/generate` select Template → Branch → Employee → `Preview`<br>3. Check `Email the letter` → `Generate`<br>4. As the employee, open `/ess/letters` | Preview shows merged data; generated letter is emailed and visible/acknowledgeable on `/ess/letters` | P1 | E2E | Planned |
| TC-CHR-107 | Separation → resigned register | `/employees` → `/resigned-employees` → `/worker-directory` | 1. Mark an employee resigned/archived from their `/employees` record<br>2. Open `/resigned-employees`<br>3. Search the same person in `/worker-directory` | Person appears in the resigned register with exit `Date`; they drop out of active `/worker-directory` results | P2 | E2E | Planned |

---

**Totals — 107 test cases (TC-CHR-001 … TC-CHR-107), 12 scenarios (SC-CHR-01 … SC-CHR-12).**
