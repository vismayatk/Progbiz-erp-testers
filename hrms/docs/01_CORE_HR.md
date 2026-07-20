# HRMS — Core HR

## Overview

The Core HR sub-module of the HRMS ERP (https://hrms-erp.progbiz.in) is the system of record for the employee lifecycle. It covers employee master data (the `/employees` register, the `/sections` department-section master, and bulk onboarding via `/upload-employee`), a browsable `/worker-directory` with card and org-chart views, and a separation register at `/resigned-employees`. Compensation is handled through `/salary-revisions` (raise a gross-salary revision that carries a Status, implying an approval step), `/employee-salary-process` (monthly branch-wise payable computation), and `/employee-deduction` (ad-hoc deduction entries), with matching report pages for deductions and remarks. A probation suite (`/hrms/probation`, `/hrms/probation-templates`, `/hrms/probation-report`) tracks employees on probation from template definition through checkpoint reviews to a confirmed/terminated outcome. HR correspondence is produced through `/letters/templates` and `/letters/generate` using merge fields. Cross-cutting all of this is the workflow engine: `/approval/config` defines multi-level approval chains per document type (including `Salary Revision` and `Probation Decision`), and `/approvals` is the inbox where approvers action pending items. On the crawled tenant most grids were empty, so every list page's empty-state text is captured below — useful for zero-data assertions in Playwright.

## Page Index

| # | Page | Route | Purpose |
|---|------|-------|---------|
| 1 | Employees | `/employees` | Employee master register; create and manage employee records |
| 2 | Sections | `/sections` | Master data: define sections under departments |
| 3 | Worker Directory | `/worker-directory` | Browse employees as cards or an org chart |
| 4 | Salary Revisions | `/salary-revisions` | Raise gross-salary revisions and view revision history/status |
| 5 | Employee Salary Process | `/employee-salary-process` | Compute and save monthly payable amounts per branch |
| 6 | Employee Deduction | `/employee-deduction` | Record an ad-hoc salary deduction for a staff member |
| 7 | Employee Remark | `/employee-remark` | Record a dated remark/note against a staff member |
| 8 | Probation Dashboard | `/hrms/probation` | KPI dashboard and list of employees currently on probation |
| 9 | Probation Templates | `/hrms/probation-templates` | Define probation duration/checkpoint/criteria templates |
| 10 | Probation Report | `/hrms/probation-report` | Date-ranged probation outcome report with Excel export |
| 11 | Resigned Employees | `/resigned-employees` | Register of employees who have resigned |
| 12 | Employee Excel Import | `/upload-employee` | Bulk-create employees from an Excel file |
| 13 | Letter Templates | `/letters/templates` | Manage HR letter templates (with merge fields) |
| 14 | Generate Letter | `/letters/generate` | Generate/preview/email a letter for an employee from a template |
| 15 | My Approvals | `/approvals` | Approver inbox: pending decisions, own requests, history |
| 16 | Approval Configuration | `/approval/config` | Define per-type multi-level approval workflows |
| 17 | Employee Deduction Reports | `/employee-deduction-report` | Filterable report over recorded deductions |
| 18 | Employee Remark Reports | `/employee-remark-report` | Filterable report over recorded remarks |

## Pages

### Employees (`/employees`)

- **Purpose** — Employee master register. Lists all employees with their code, department and designation, and is the entry point for creating a new employee record.
- **UI elements** — Buttons: `Filter`, `New Employee`. Checkbox `Include archived` (`input#incl-archived`). Card: `Employees`.
- **Data grid** — Columns: `Sl.No`, `Employee Code`, `Employee Name`, `Department Name`, `Designation`, `Status`, `Actions`. One row = one employee record.
- **Connections** — Employee records created here populate `/worker-directory`, are selectable in the Employee dropdowns of `/salary-revisions`, `/employee-deduction`, `/employee-remark`, `/letters/generate`, and appear in `/employee-salary-process` payroll grids. Bulk alternative: `/upload-employee`. Separated employees end up in `/resigned-employees`; probation for new hires is tracked in `/hrms/probation`.
- **Automation notes** — `New Employee` likely opens a create form/modal; `Filter` likely toggles a filter panel. The `#incl-archived` checkbox is a stable selector for the archived toggle and implies soft-delete/archive behavior (test that archived employees appear only when it is checked). Grid rendered with headers but 0 rows on the crawl — assert on the header row for smoke tests.

### Sections (`/sections`)

- **Purpose** — Master-data maintenance page for sections: create a section under a department and view/edit the existing department-section list.
- **UI elements** — Cards: `Sections` (list) and `New Section` (form). Form fields: `Department :` (native `select`, default option `Choose`), `Section Name*` (`input#sectionname`, required). Buttons: `Save`, `Clear`.
- **Data grid** — Columns: `SlNo`, `Department Name`, `Section Name`, `Action`. One row = one section mapped to a department.
- **Connections** — Departments/sections defined here back the `Department Name` column on `/employees` and the department dimension used in directory search on `/worker-directory`.
- **Automation notes** — Single-page master (form + grid side by side), no modal. `Section Name*` is mandatory — assert validation on empty save. `#sectionname` is a stable input selector; the department `select` has no id, so target it by its `Department :` label. `Clear` resets the form.

### Worker Directory (`/worker-directory`)

- **Purpose** — Read-only employee directory for browsing people, with a card view and an organisation-chart view.
- **UI elements** — View toggle buttons (top-right): `Cards` | `Org Chart`. Filters: `Branch` select (default `-- All branches --`), search text box (placeholder `Name, designation or department`), `Search` button.
- **Data grid** — None; results render as employee cards (or an org chart in the `Org Chart` view).
- **Connections** — Displays records maintained in `/employees` / imported via `/upload-employee`. Org-chart hierarchy implies reporting-line data captured on the employee record.
- **Automation notes** — Empty state text: `No employees match the current filters.` — appears when no employees match (or on an empty tenant), good for a negative-search assertion. Search is button-triggered (`Search`), not live-typed. The `Cards`/`Org Chart` toggle switches rendering mode — verify both views. Search input is identified by its placeholder; the branch `select` has no id.

### Salary Revisions (`/salary-revisions`)

- **Purpose** — Raise a salary (gross) revision for an employee and track all revisions with their approval status.
- **UI elements** — Card `Raise A Revision` with fields: `Branch` select (`-- Select branch --`), `Employee` select (`-- Select employee --`), `New Gross` (number input), `Effective Date` (date input), `Reason` (textarea). Button: `Raise Revision`. Card `Revision History` holds the grid.
- **Data grid** — Columns: `Employee`, `Branch`, `Effective`, `Old`, `New`, `%`, `Status`. One row = one salary revision (old vs new gross, % change, workflow status). Empty-state row: `No revisions yet.`
- **Connections** — Employee list comes from `/employees` (filtered by Branch). The `Status` column ties into the workflow engine: a `Salary Revision` approval type exists in `/approval/config`, and pending revisions surface for approvers in `/approvals`. Approved revisions change the gross used by `/employee-salary-process`.
- **Automation notes** — Branch select likely gates the Employee select (cascading dropdowns) — select branch first in tests. `New Gross` is `type=number`, `Effective Date` is `type=date`. The history table renders `No revisions yet.` as a single row (rowCount 1), not a separate empty-state element — assert on cell text. After `Raise Revision`, expect a new row with a `Status` (pending if a workflow is configured, auto-approved if not — see `/approval/config` "No levels = direct").

### Employee Salary Process (`/employee-salary-process`)

- **Purpose** — Monthly payroll processing: pick branch/year/month, review each staff member's basic salary, leave count and computed payable amount, then save the run.
- **UI elements** — Filters: `Branch` select (`select#assignedToBranch`, default `All`), `Salary Year :` select and `Salary Month :` select (January–December; both selects share `name="narration-typ"`). Button: `Save`.
- **Data grid** — Columns: `Staff Name`, `Basic Salary`, `No of Leave`, `Payable Amount`. One row = one employee's salary computation for the chosen month. Empty-state row: `No Data`.
- **Connections** — Rows are employees from `/employees` for the selected branch; `Basic Salary` reflects the current (revised) salary from `/salary-revisions`; `No of Leave` is fed by the leave/attendance sub-module; deductions recorded in `/employee-deduction` logically reduce payable amounts.
- **Automation notes** — Grid shows `No Data` until branch/year/month yield results — treat year+month as effectively mandatory filters. `#assignedToBranch` is a stable selector; the year/month selects share a duplicate `name="narration-typ"`, so disambiguate by position or label, not by name. `Save` persists the whole displayed run (no per-row save button captured).

### Employee Deduction (`/employee-deduction`)

- **Purpose** — Entry form to record a salary deduction against a staff member (type, amount, date, payment mode, details).
- **UI elements** — Card `Employee Deduction` with fields: `Branch` select (`select#branch`, default `Choose`), `Staff` select (`select#employee`, default `Choose`), `Date` (`input#enquiry-date`, `type=date`, placeholder `Enter Date`), `Deduction Type *` (typeahead text input `#building-type`, placeholder `Enter deduction type and search`), `Pay Using` select (default `Choose`; captured with duplicate `id="employee"`), `Amount :` (`input#amount`), `Details` (textarea `#details-text-area`). Buttons: `Save`, `Cancel`.
- **Data grid** — None (pure entry form).
- **Connections** — Staff options come from `/employees` (branch-filtered). Saved deductions are queried on `/employee-deduction-report` and logically reduce the `Payable Amount` in `/employee-salary-process`.
- **Automation notes** — `Deduction Type *` is mandatory and is a search-as-you-type field, not a select — type a value and pick from suggestions. Beware duplicate DOM ids: both the `Staff` select and the `Pay Using` select were captured as `#employee` — use label-relative or nth-of selectors. Non-semantic ids reused from other modules (`#enquiry-date`, `#building-type`) are stable but misleading — prefer label-based locators for readability.

### Employee Remark (`/employee-remark`)

- **Purpose** — Entry form to record a dated remark (disciplinary/performance/general note) against a staff member.
- **UI elements** — Fields: `Branch` select (`select#branch`, default `Choose`), `Staff` select (`select#employee`, default `Choose`), `Date` (`input#enquiry-date`, `type=date`, placeholder `Enter Date`), `Details` (textarea `#details-text-area`). Buttons: `Save`, `Cancel`.
- **Data grid** — None (pure entry form).
- **Connections** — Staff options come from `/employees`. Saved remarks are reported on `/employee-remark-report`.
- **Automation notes** — Known label bug: the page header, breadcrumb and card title all read `Employee Deduction` even though the route is `/employee-remark` and the form is the remark form (no deduction-type/amount fields). Do not assert the page title equals "Employee Remark" on this build — assert on the URL plus the reduced field set instead. Same shared ids as the deduction form (`#branch`, `#employee`, `#enquiry-date`, `#details-text-area`).

### Probation Dashboard (`/hrms/probation`)

- **Purpose** — Landing dashboard for probation management: KPI tiles plus the live list of employees currently on probation with review scheduling.
- **UI elements** — Header actions: `Report` (link to `/hrms/probation-report`), `Templates` (link to `/hrms/probation-templates`), `Start Probation` button. KPI tiles: `On Probation`, `Reviews Due (7d)`, `Overdue Reviews`, `Ending Soon (30d)` (all `0` on the crawl). Card: `Employees On Probation`.
- **Data grid** — Columns: `Employee`, `Branch`, `Start`, `End`, `Reviews`, `Next Review`, `Days Left`, `Action`. One row = one employee's active probation with its review progress. Empty-state row: `No one on probation.`
- **Connections** — `Start Probation` places an `/employees` record onto a probation defined by a `/hrms/probation-templates` template; outcomes are analysed on `/hrms/probation-report`. The final confirm/terminate decision maps to the `Probation Decision` approval type in `/approval/config` and is actioned via `/approvals` (the report has an `Awaiting Approval` KPI).
- **Automation notes** — `Start Probation` is a button (not a link) — expect a modal/form to pick employee + template. `Report` and `Templates` are plain anchors (`href="/hrms/probation-report"`, `href="/hrms/probation-templates"`), good for navigation tests. KPI tiles render numeric values — assert `0` on a clean tenant, and increments after starting a probation.

### Probation Templates (`/hrms/probation-templates`)

- **Purpose** — Define reusable probation templates: duration, checkpoint review days, evaluation criteria, and which template is the default.
- **UI elements** — Button: `New Template`.
- **Data grid** — Columns: `Name`, `Duration`, `Checkpoints (days)`, `Criteria`, `Default`, `Active`, `Action`. One row = one probation template. Empty-state row: `No templates yet.`
- **Connections** — Templates are consumed by `Start Probation` on `/hrms/probation`; checkpoint days drive the `Reviews`/`Next Review` columns and the review-due KPIs there.
- **Automation notes** — `New Template` should open a create modal/form (no inline form inputs were captured on the list page). `Default` and `Active` columns imply toggle behaviors worth testing (only one default at a time; inactive templates hidden from Start Probation). Empty state is a table row with text `No templates yet.`

### Probation Report (`/hrms/probation-report`)

- **Purpose** — Analytical report over probations started in a date range: outcome KPIs, completion rate, and a detail grid, exportable to Excel.
- **UI elements** — Filters: `From (start date)` (date input), `To (start date)` (date input), `Branch` select (default `All branches`). Buttons: `Run Report`, `Export Excel`. KPI tiles: `Total`, `On Probation`, `Confirmed`, `Terminated`, `Awaiting Approval`, `Overdue Reviews`, `Completion Rate` (shown as `0%`). Card: `Details (0)` — the count in the title tracks result size.
- **Data grid** — Columns: `Employee`, `Branch`, `Start`, `End`, `Outcome`, `Reviews`, `Overdue`, `Decision`. One row = one probation record in range with its outcome and decision. Empty-state row: `No probations in this range.`
- **Connections** — Aggregates the probations run from `/hrms/probation` (using `/hrms/probation-templates` definitions); `Awaiting Approval` and `Decision` tie back to the `Probation Decision` workflow in `/approval/config` / `/approvals`.
- **Automation notes** — Report is pull-based: set filters then click `Run Report` (grid says `No probations in this range.` until then). `Export Excel` triggers a file download — use Playwright's download event. The `Details (0)` card title doubles as a row-count assertion target.

### Resigned Employees (`/resigned-employees`)

- **Purpose** — Read-only register of employees who have resigned/left, with their exit date and contact details.
- **UI elements** — Name filter text input (`input#filter-name`). No action buttons captured. Card: `Resigned Employees`.
- **Data grid** — Columns: `SlNo`, `Date`, `Name`, `Phone`, `Designation`, `Nationality`. One row = one resigned employee. (Crawl captured one blank row — treat empty-string rows as no data.)
- **Connections** — Populated when an employee from `/employees` is marked resigned/archived (see the `Include archived` toggle and `Status` column there). Resigned employees drop out of `/worker-directory` and active payroll in `/employee-salary-process`.
- **Automation notes** — No create/edit actions on this page — resignations are triggered from the employee record, so tests must set up data via `/employees`. `#filter-name` is the only interactive control; verify it filters the grid client-side. The empty grid rendered a row with empty cells rather than an explicit empty-state message.

### Employee Excel Import (`/upload-employee`)

- **Purpose** — Bulk onboarding: upload an Excel file of employees using the provided sample format.
- **UI elements** — File input (`input[type=file]`) labelled `Upload Recipient Excel File`; link `Download Sample Excel` (`href="/assets/images/EmployeeExcelImport.xlsx"`); buttons `Excel Rules`, `Upload`.
- **Data grid** — None.
- **Connections** — Successful imports create records in `/employees`, which then flow to `/worker-directory`, payroll and the rest of Core HR.
- **Automation notes** — Copy bug: the page card is titled `Leave Request` although the page is the employee import — do not assert on that card title. `Excel Rules` likely opens an info modal describing the required columns. Test flow: download `/assets/images/EmployeeExcelImport.xlsx`, fill it, `setInputFiles` on the file input, click `Upload`, then verify the rows appear in `/employees`. Include a negative test with a malformed sheet.

### Letter Templates (`/letters/templates`)

- **Purpose** — Manage reusable HR letter templates (offer letters, warnings, etc.) that are later merged with employee data.
- **UI elements** — Buttons/links: `Merge Fields` (link to `/letters/fields`), `Generate Letter` (link to `/letters/generate`), `New Template` button.
- **Data grid** — Columns: `Name`, `Owner`, `Type`, `Subject`, `Active`, `Action`. One row = one letter template. Empty-state row: `No templates yet.`
- **Connections** — Templates authored here (with placeholders from `/letters/fields`) are the `Template` options on `/letters/generate`.
- **Automation notes** — `New Template` opens the template editor (modal or route — no inline inputs captured). `Merge Fields` and `Generate Letter` are anchors with stable hrefs for navigation tests. `Active` column implies an enable/disable toggle affecting availability in the generate page.

### Generate Letter (`/letters/generate`)

- **Purpose** — Produce a letter for a specific employee from a template: preview the merged output, generate it, and optionally email it.
- **UI elements** — Selects: `Template` (`-- Select template --`), `Branch` (`-- Select branch --`), `Employee` (`-- Select employee --`). Checkbox `Email the letter` (`input#sendmail`). Buttons: `Preview`, `Generate`. Card: `Preview` with hint text `Select a template and employee, then Preview.`
- **Data grid** — None.
- **Connections** — Consumes templates from `/letters/templates` (and merge fields from `/letters/fields`); employee list from `/employees` (branch-filtered). Breadcrumb is `Letter Templates  Generate`, confirming it is a child of the templates page.
- **Automation notes** — Template + employee are effectively mandatory (preview hint enforces it); Branch likely filters the Employee select. `#sendmail` is a stable selector for the email toggle. Test sequence: select template → branch → employee → `Preview` (assert preview card fills) → `Generate`. On the empty tenant the Template select has no options — seed a template first via `/letters/templates`.

### My Approvals (`/approvals`)

- **Purpose** — The approver's workbench: items awaiting the signed-in user's decision, the user's own submitted requests, and a decision history.
- **UI elements** — Tabs: `Awaiting my decision (0)`, `My requests`, `History`. Button: `Refresh`. Card: `Awaiting My Decision (0)`.
- **Data grid** — Columns: `Type`, `Details`, `Level`, `As`, `Raised`, `Action`. One row = one pending approval item (its document type, chain level, and the role the user approves as). Empty-state row: `Nothing awaiting your approval.`
- **Connections** — Receives documents routed by the workflows defined in `/approval/config`. Within Core HR that includes `Salary Revision` items raised on `/salary-revisions` and `Probation Decision` items from `/hrms/probation`; approving updates the `Status`/`Decision` shown on those pages and on `/hrms/probation-report`.
- **Automation notes** — Tab labels embed live counts (`Awaiting my decision (0)`) — match with a regex, not exact text. Breadcrumb group is `Workflow`, not `HRMS`. The `Action` column will carry approve/reject controls once rows exist; multi-user tests are needed (raiser vs approver accounts). `Refresh` re-polls without navigation.

### Approval Configuration (`/approval/config`)

- **Purpose** — Define approval workflows: pick a document type, name the workflow, add ordered approval levels, and optionally mark it as the default for that type.
- **UI elements** — Card `New Workflow`: `Approval Type` select (`-- Select type --`) with options `Salary Revision`, `Leave Request`, `Expense Claim`, `Policy Publish`, `Job Requisition`, `Offer`, `Compensation Cycle`, `Document Verification`, `Benefit Enrollment`, `Attendance Regularization`, `Overtime`, `Material Purchase Request`, `Stock Transfer`, `Supplier PO`, `Sales Order`, `Quotation`, `Credit Limit Override`, `Sales Return`, `Profile Change Request`, `Com Off Request`, `Encashment Request`, `Geo Fence Request`, `Probation Decision`; `Workflow Name` text input (placeholder `e.g. Long Leave Approval`); checkbox `Default for this type` (`input#cfgDefault`); `+ Add level` button under `Approval Levels`; `Save Workflow` button. Card `Configured Workflows` holds the grid. Helper text: `No levels = direct (auto-approve, no approval step).`
- **Data grid** — Columns: `Type`, `Name`, `Approval chain`. One row = one configured workflow. Empty-state row: `No workflows configured yet.`
- **Connections** — Workflows configured here drive routing into `/approvals` for every listed type; within Core HR, `Salary Revision` governs `/salary-revisions` statuses and `Probation Decision` governs probation outcomes on `/hrms/probation` / `/hrms/probation-report`. Multiple named workflows per type are allowed; the default applies when a document doesn't pick a specific one.
- **Automation notes** — `+ Add level` appends approval-level rows dynamically — test 0-level (auto-approve), 1-level and multi-level chains. `#cfgDefault` is a stable checkbox selector. Key behavioral assertion from the page's own copy: with no levels the document auto-approves (no `/approvals` entry). Breadcrumb group is `Workflow`.

### Employee Deduction Reports (`/employee-deduction-report`)

- **Purpose** — Filterable report over deduction entries by deduction type, staff member and time period.
- **UI elements** — Filters: `Deduction Type` select (default `All`, `select#report-assignee`), `Staff` select (default `All`, also captured as `select#report-assignee` — duplicate id), `Period` select (`select#timePeriodSelect`; options `Choose`, `This Week`, `This Month`, `This Year`, `Custom`). Button: `View Report`.
- **Data grid** — None rendered until `View Report` is run (no table captured on load).
- **Connections** — Reports over entries created on `/employee-deduction`. Breadcrumb group: `HRMS  Reports`.
- **Automation notes** — Pull-based report: results only render after `View Report`. Duplicate `#report-assignee` id on both Deduction Type and Staff selects — locate by label or position, never by id alone. `Period = Custom` presumably reveals date inputs (not present in the initial capture) — verify dynamically. Seed a deduction via `/employee-deduction` before asserting report rows.

### Employee Remark Reports (`/employee-remark-report`)

- **Purpose** — Filterable report over remark entries by staff member and time period.
- **UI elements** — Filters: `Staff` select (default `All`, `select#report-assignee`), `Period` select (`select#timePeriodSelect`; options `Choose`, `This Week`, `This Month`, `This Year`, `Custom`). Button: `View Report`.
- **Data grid** — None rendered until `View Report` is run (no table captured on load).
- **Connections** — Reports over entries created on `/employee-remark`. Breadcrumb group: `HRMS  Reports`.
- **Automation notes** — Same pull-based pattern and same id scheme as the deduction report (`#report-assignee`, `#timePeriodSelect`) — shared page object is practical. Remember the source entry page `/employee-remark` carries the "Employee Deduction" title bug when writing end-to-end assertions. Test `Custom` period for dynamically revealed date range inputs.

## Process flows

- **Employee onboarding**: define masters in `/sections` (department → section) → create the employee via `/employees` (`New Employee`) or bulk-load via `/upload-employee` (download sample → fill → `Upload`) → record becomes visible in `/employees` grid and `/worker-directory` (Cards / Org Chart) → optionally `Start Probation` on `/hrms/probation`.
- **Probation lifecycle**: create a template on `/hrms/probation-templates` (duration, checkpoint days, criteria, default) → `Start Probation` on `/hrms/probation` for an employee → checkpoint reviews tracked on the dashboard (`Reviews`, `Next Review`, `Days Left`, due/overdue KPIs) → final confirm/terminate goes through the `Probation Decision` workflow (`/approval/config` → `/approvals`) → outcomes and completion rate analysed on `/hrms/probation-report` (`Run Report`, `Export Excel`).
- **Salary revision**: configure a `Salary Revision` workflow in `/approval/config` (0 levels = auto-approve) → raise the revision on `/salary-revisions` (branch → employee → new gross → effective date → reason) → item appears in the approver's `/approvals` inbox (`Awaiting my decision`) → decision updates the `Status` in the `Revision History` grid → the new gross feeds `Basic Salary` in `/employee-salary-process`.
- **Monthly payroll**: record any deductions in `/employee-deduction` → on `/employee-salary-process` pick Branch + `Salary Year` + `Salary Month` → review `Staff Name / Basic Salary / No of Leave / Payable Amount` grid → `Save` the run.
- **Deduction reporting**: `/employee-deduction` (Save entry) → `/employee-deduction-report` (Deduction Type / Staff / Period → `View Report`).
- **Remark reporting**: `/employee-remark` (Save entry) → `/employee-remark-report` (Staff / Period → `View Report`).
- **HR correspondence**: author a template on `/letters/templates` (`New Template`, placeholders from `Merge Fields` at `/letters/fields`) → `/letters/generate`: select Template + Branch + Employee → `Preview` → `Generate` (optionally `Email the letter`).
- **Separation**: employee is resigned/archived from their `/employees` record (`Status`, `Include archived` toggle) → appears in the `/resigned-employees` register → excluded from `/worker-directory` results and active payroll.
