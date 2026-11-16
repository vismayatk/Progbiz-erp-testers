# ERP automation coverage — onetouch_test (13 Oct 2026)

What the Playwright suite covers, how to run each part, what it deliberately leaves out, and how to keep
it current. Target for all ERP testing: `https://test.erp.progbiz.in`, tenant `onetouch_test`
(`.env`: `BASE_URL`, `COMPANY_CODE`, `CRM_USERNAME`, `PASSWORD`).

**Run one session at a time on the tenant.** Two sessions at once cause HTTP 429 ("Too many requests")
and logouts. Each new spec logs in once and shares the session for the same reason.

## What is covered

| Area | Spec | Tests | What it checks |
|---|---|---|---|
| **Client Settings effects** | `erp/master/tests/client_settings_effects.spec.js` | 15 | Flips one setting, checks the page it should change, restores it (in `finally`). 14 settings: Business Value, Lead Quality, Lead Source, Remark, Place, Quantity, Repeat Business (menu), Quotation Payment Term / Grouping / Quantity / Default T&C, Include Custom Fields in search. CSE-01 lists removed options; CSE-99 proves nothing was left changed. |
| **Pages with no deeper test (55)** | `master_pages`, `crm_dashboards_extra`, `task_extra_pages`, `project_pages`, `whatsapp_pages` | 119 (4 skip when a search box or filter sits in a collapsed panel) | Per page: heading, tabs (each tab opens), table columns, buttons, filter controls, no error text, no script error, no failed app call, nothing written. Per Add form: opens with its fields, required fields still required, closed without saving. Per list with a search box: nonsense finds nothing, clearing restores, page 2 differs. Per dashboard with a date range: every range loads. Expected structure lives in `erp/common/fixtures/pages.onetouch_test.json`. |
| **Create / edit / delete (masters)** | `erp/master/tests/master_crud.spec.js` | 12 | Item Packing Type, Department, Designation, Work Flow Cost Type, User Level, Team, Payment Term, Email Template, Custom Field (created inactive). Each makes a `QA_` record, finds it, edits it, deletes it through the confirmation, and cleans up in `finally`. Also: a Payment Term must add up to 100%, a blank name is refused, and MC-99 fails if any record is left behind. |
| **Customers and Custom Reports** | `erp/master/tests/master_customers.spec.js` | 5 | Tab counts add up (All = Suspect + Prospect + Customer); the Add form validates; one fixed fixture `QA_Customer_Fixture` is found by name and phone; View opens it; a Custom Report needs a field and a filter. |
| **Excel uploads** | `erp/master/tests/uploads.spec.js` | 8 | A non-spreadsheet is refused by the server on all five upload pages and nothing enters the upload history; Data Import offers a real `.xlsx` template for every import type; uploading with no file sends nothing. **No real data is ever imported.** |
| **Tracked script errors** | `erp/master/tests/script_errors.spec.js` | 2 | ERP-011 and ERP-012 as expected failures. |
| Everything from before | `erp/crm`, `erp/task-management`, `erp/item`, `erp/project-management` | ~150 | CRM enquiry / follow-up / quotation / chain, home, new modules, new pages; Task Management; Items; Work Flow. |

Repaired today: CH-10, NP-05, TM-09 (NM-03, NP-03, NP-04, NP-07 already passed).

## Accounts and Inventory (added 6 Nov 2026)

onetouch_test now has the Accounts, Sales, Purchase, Inventory and Production modules. These specs post real QA vouchers and
invoices, so they run on `onetouch_test` only (they skip on any other tenant) and never delete anything. Every money check
compares a balance **before and after** (or reads the Daily Report before and after), so the amounts already on the tenant do
not matter. Page objects live in `erp/accounts/pages/` and `erp/inventory/pages/`.

| Area | Spec | Tests | What it checks |
|---|---|---|---|
| **Bank Deposit / Withdrawal** | `erp/accounts/tests/accounts_bank_deposit.spec.js` | 7 | AB-01 withdrawal: bank down, cash up, contra shows Cash Dr / Bank Cr with the narration. AB-02 deposit, and the voucher number moves on by one. AB-03 no cash account: refused, nothing written. AB-04 amount 0: refused. AB-05 bank-to-bank (another bank account). AB-06 bank list / other-bank list. AB-07 Clear. |
| **Staff Cash** | `erp/accounts/tests/accounts_staff_cash.spec.js` | 7 | SC-01 give cash, SC-02 collect cash (staff balance and cash account both move), SC-03 collecting more than held asks first and "No, Cancel" saves nothing, SC-04 "Collect all", SC-05 no staff chosen, SC-06 amount 0, SC-07 staff list (records identical entries as OBS-04). |
| **Daily Report** | `erp/accounts/tests/accounts_daily_report.spec.js` | 5 | DR-01 an old date lists exactly this company's cash and bank ledgers, all zero. DR-02 opening of a day = closing of the day before. DR-03 a voucher today raises today's closing but not today's opening, tomorrow opens on it, yesterday does not move. DR-04 the form opens on today (5:30 am rule). DR-05 debit = credit. |
| **ERP items** | `erp/inventory/tests/inventory_items.spec.js` | 6 | IT-01 list, IT-02 "Add More Variant" needs a name, IT-03 exactly one Variant Name box, IT-04 the QA item (created once), IT-05 duplicate refused, IT-06 no name refused. |
| **Purchase and sales invoices** | `erp/inventory/tests/inventory_purchase_sales.spec.js` | 7 | PS-01 purchase 10 x 60 in cash (cash credit and Purchase debit +600). PS-02 Selling Price modal cost and profit % (red below cost). PS-03 cost with a 10% invoice discount (recorded as OBS-01, not asserted). PS-04 sales Cash 60 + Credit 40, quantity 1 to 2: Credit rises to 140, cash stays 60, saved, Cash +60, customer +140, Sales +200. PS-05 payments above the total refused. PS-06 more than the stock refused, nothing posted. PS-07 line totals. |

```bash
npm run test:accounts        # 19 tests, about 3 minutes
npm run test:inventory       # 13 tests, about 4 minutes
npx playwright test erp/accounts erp/inventory --workers=1     # both
```

**Test data these specs leave on onetouch_test** (nothing can be deleted from the UI, and the specs do not try):
- Created once and reused: bank ledgers `QA_Bank_Fixture` and `QA_Bank_Fixture_2`, `QA_Supplier_Fixture`, `QA_Item_Fixture`, and `QA_Customer_Fixture` (shared with `master_customers.spec.js`).
- Added on every full run: 6 contra vouchers (AB-01, AB-02, AB-05, SC-01, SC-02, DR-03), 1 purchase invoice (stock +10) and 1 sales invoice (stock -2). Every voucher and invoice is also written to the User Log.

**Learned while building them:** the Deposit / Withdrawal / Give Cash tabs carry an arrow icon that becomes part of their accessible name, so match the word (`\bWithdrawal\b`), not the whole name. The Daily Report keeps the last report in `sessionStorage` (`report-state:daily-report`) and its "Go Back" is an `<a>` with no href (no link role). The party and item pickers search on every key press, and typing key by key trips the "Too many requests" throttle, so the page objects fill once and back off when the dialog shows. A phone number used by another party asks "Do you still want to save?" and the page objects answer yes for the QA fixtures.

**Not automated yet:** cancelling a voucher, opening balances, a second branch, foreign-currency invoices, Receipts / Payments / Journals / Credit and Debit Notes, Cheques, Bank Reconciliation, Stock Movements, Production, POS (switching it on is a Tenant Setting, change then restore), and the read-only page checks for the new Accounts / Sales / Purchase / Inventory menu pages (run `node scripts/qa/site_audit.js`, then `node scripts/qa/make_page_manifest.js --keep`, to give them page, form and list tests with no new code).

## After the Nov 2026 redesign (14 Nov 2026)

The 12 Nov 2026 build redesigned the Task and CRM lists and brought more modules into the `onetouch_test` menu (336 pages,
was 245). The suite was brought in line on 14 Nov 2026; details in `reports/qa/changes-onetouch_test-2026-11-14.md`.

**What moved, and where the suite now looks**

| Page | Before | Now | Where it is handled |
|---|---|---|---|
| My Tasks | status tabs + table | week planner: Delayed and Unscheduled trays, seven day columns, cards | `TaskManagementPage` "listing pages": `taskCards()`, `plannerState()`, `findOnPlanner()`, `plannerWeek()`, `showCompleted()`, `searchTasks()` |
| Delegated Tasks | status tabs + table | status board: "When" chips over five columns of cards | `TaskManagementPage`: `clickTab()` (chips), `boardColumns()`, `findInDelegated()` |
| `/created-tasks`, `/unscheduled-tasks`, `/bulk-lead-transfer` | pages | removed (dead routes) | TM-16 skips; TM-18 checks the Unscheduled tray; TC-12 transfers from the Leads list (`LeadTransferPage`) |
| Follow-ups | tabs + table | Agenda by default; the table is behind List View; a Kanban | `CrmChainPage.findAcrossTabs()` and Home_05 switch to List View |
| CRM Dashboard | one page, two grids | seven tabs; grids on Team and Sources & ROI | `CrmDashboardPage`: `openTab()`, `allGrids()`, `columnLabels()`, `leadsSummary()`, `followupSummary()`, `attentionRows()` |
| Enquiry Overview | "Status : value" lines | label / value pairs (`span.k` + next element) and a summary strip | `EnquiryPage.getCurrentStatus()` |
| Leads list | plain table | checkbox column, bulk bar, Nature / Status views, Kanban | `EnquiryPage.openFirstEnquiry()` finds cells by column heading |
| Quotations | table | Board by default; the table is behind "Table" | `QuotationPage.gotoQuotationList()` |
| Complaints | table + form with dropdowns | tiles, List / Board, form with type choices and priority buttons | `ComplaintsPage`: `tiles()`, `boardColumns()`, `complaintTypeField()`, `priorityField()` |
| Sales / purchase invoice | card layout on 12 Nov | plain layout again on 14 Nov | `InvoicePage.summary()`, `payArea`, `paymentSnapshot()` read both |

**Tests added on 14 Nov 2026**

| Area | Spec | Tests | What it checks |
|---|---|---|---|
| **CRM views show the same data** | `erp/crm/tests/crm_views_2026-11.spec.js` | 7 | CV-01 each Leads chip lists as many rows as it counts. CV-02 the same for every status chip, and the Kanban columns carry the same counts. CV-03 each Agenda day lists what the week strip counts; Missed = List View's Delayed. CV-04 Follow-ups chips = rows; Kanban total = its columns = the chips. CV-05 Quotations Board columns = Table tabs = cards / rows. CV-06 Enquiry Overview strip = heading = Enquiry Details card; every tab opens. CV-07 New Enquiry sections numbered in order, Save / Cancel stay in view. Read-only. |
| **CRM Dashboard** | `erp/crm/tests/crm_dashboard.spec.js` (rewritten) | 6 | DB-01 seven tabs open, both grids render. DB-02 cells line up with the grouped header. DB-03 the Team grid adds up (row totals, Total row). DB-04 exports present. DB-05 Overview tiles and follow-up ring = Team grid totals. DB-06 Needs attention badge = rows listed; delayed follow-ups = Overview. |
| **Task planner and board** | `task_management.spec.js`, `task_management_modal.spec.js` (TM-01, 04, 06, 07, 15, 17, 18, 19 rewritten) | 8 | Planner structure; tray badge = cards in the tray; "n tasks" = cards in the day; week navigation; Show completed; search; a scheduled task sits under its day with its time; board columns and counts; assignees on every card; each "When" chip = cards shown. |
| **Complaints** | `erp/crm/tests/crm_complaints.spec.js` (CMP-02 rewritten, CMP-05 new) | 2 | New form fields; tiles, inbox chips, list rows and board columns agree. |
| **New module pages (80 pages)** | `erp/accounts/tests/accounts_pages.spec.js`, `erp/inventory/tests/inventory_pages.spec.js`, plus new groups in `master_pages` and `hrms_pages` | about 200 | The page-structure suite (PAGE / FORM / LIST / FILTER, read-only) for Accounts, Cheque Collection / Issue, Inventory masters, Sales, Purchase, Production, Stock Movements, Policy Management, Candidates, Locations, Credentials, Quick Links, Help & Support. Manifest regenerated from the 14 Nov snapshot: 290 pages (was 210). |

```bash
npx playwright test erp/crm/tests/crm_views_2026-11.spec.js erp/crm/tests/crm_dashboard.spec.js --workers=1   # the new CRM data checks, about 6 minutes
npx playwright test erp/accounts/tests/accounts_pages.spec.js erp/inventory/tests/inventory_pages.spec.js --workers=1
npx playwright test erp/hrms-in-erp/tests/hrms_pages.spec.js -g "My Workspace" --workers=1
```

**Switched off:** PS-06 (`test.fixme`). Defect ERP-020: a sales invoice for more than the stock on hand now saves although
"Allow Negative Stock" is off, so every run of PS-06 posted a 999,999-unit cash sale. See the comment above the test for how
to bring it back.

## Asset Management (added 17 Nov 2026)

The 16 Nov 2026 build added the Asset Management module. It was tested by hand against the 69 checks of the Asset Testing
Guide (report: `Progbiz_ERP_Asset_Module_Test_Report_onetouch_test_2026-11-17.docx`, 20 bugs AST-001 to AST-020) and these
specs were written afterwards. The module's controls have steady ids (`asset-entry-*`, `asset-view-action-*`,
`asset-action-submit`, ...), so the page object `erp/asset/pages/AssetPage.js` works by id.

| Area | Spec | Tests | What it checks |
|---|---|---|---|
| **Every page opens** | `erp/asset/tests/asset_pages.spec.js` | 31 | AP-01 each of the 27 asset pages: heading, columns, no Access Denied / Oops / script error / failed call. AP-02 the menu holds every entry of the guide. AP-03 Reports hub cards and six reports with Excel and PDF. AP-04 Data Import offers Assets. Read-only. |
| **Register, custody, maintenance, depreciation** | `erp/asset/tests/asset_register.spec.js` | 17 | AR-01 required fields. AR-02 new asset: next code of its category, data kept after a reload. AR-03 five form rules. AR-04 unique serial. AR-05 Mark Lost / Found and History. AR-06 assign to a location, Receive Back. AR-07 work order opened and completed. AR-08 depreciation preview = (cost - salvage) / life. AR-09 delete, Recycle Bin, restore. AR-10 deactivate, reactivate. |
| **Who can do what** | `erp/asset/tests/asset_access.spec.js` | 3 | AA-01 view-only user, AA-02 staff user (only My Assets), AA-03 custom role (quick-add only where allowed, Preview without Post). Read-only. |

```bash
npm run test:asset           # 51 tests, 13 to 15 minutes, one worker
```

- **Own data on every run:** a category `QA_Category_<stamp>` (life 36 months, salvage 5%, unique serials), a location and two
  assets. An asset with a history cannot be deleted, so the run deactivates its assets; the category and location then go inactive.
- **Nothing is posted:** depreciation is previewed, never posted; no disposal is completed.
- **QA users** (made 16 Nov 2026, each with its own access role; logins in `.env`): `QA_ASSET_LIMITED_USER`,
  `QA_ASSET_RAHUL_USER`, `QA_ASSET_CUSTOM_USER`, `QA_ASSET_APPROVER_USER`, each with `_PASSWORD`. A test skips when its login is missing.
- **Tracked defects (expected failures):** AST-004 future assignment date, AST-006 category salvage 101%, AST-013 a PDF named
  .jpg as photo, AST-016 script error on Deliveries & Pick-ups.
- **Not automated yet:** rental, lease, disposal completion, physical audit, posting, Excel import. They post to Accounts or
  cannot be undone.
- Report pictures: `node scripts/qa/asset_shots_2026-11-17.js` (read-only capture). The Word report is built with
  `scripts/qa/make_bug_report_docx.js` from a data file that is kept out of the repository, like every report (it holds tenant data).

## Run it

```bash
cd ~/Progbiz/ERP/Progbiz-erp-testers

# everything added on 13 Oct: 161 tests, about 28 minutes (157 pass, 4 skip, 0 unexpected failures on the last full run)
npx playwright test erp/master/tests erp/crm/tests/crm_dashboards_extra.spec.js erp/task-management/tests/task_extra_pages.spec.js erp/project-management/tests/project_pages.spec.js erp/whatsapp/tests/whatsapp_pages.spec.js --workers=1

# one part
npx playwright test erp/master/tests/client_settings_effects.spec.js --workers=1     # ~7 min
npx playwright test erp/master/tests/master_crud.spec.js --workers=1                 # ~8 min
npx playwright test erp/master/tests/uploads.spec.js --workers=1                     # ~1.5 min
npx playwright test erp/master/tests/master_pages.spec.js --workers=1                # pages, forms, lists
npx playwright test erp/master/tests/master_pages.spec.js -g "Customers"             # one page

# after any run: list the QA_ records still on the tenant (read-only)
node scripts/qa/find_qa_leftovers.js
```

## Test data these tests leave on the tenant

- **Nothing** from the master create/edit/delete tests: each deletes what it made, and MC-99 fails otherwise.
- **`QA_Customer_Fixture`** (one customer, phone 9000000099): created once, reused. Customers cannot be deleted from the UI.
- Older, not from today's specs: `QA_CHAIN_*` customers, enquiries and quotations (the CRM chain test makes one per run), `QA_MOB_*` (mobile tests), and `QA_customer_1791879460872` (one probe).
- Every settings save and every create/delete is written to **User Log** (the audit trail), so its count grows with each run.

## Deliberately not automated, and why

| Area | Reason |
|---|---|
| Users, Branches, Access Roles: create / edit / delete | Tenant structure, logins and permissions. The QA rules say never change these. Their pages and Add forms are covered read-only. |
| Reset Password, Profile save | Passwords and the signed-in user's own account. |
| Customers: delete | The UI has no delete (only View and Block number). |
| Predefined Tasks create | The required assignee list is real users. Page and form are covered. |
| Field Mapping create | Changes integration field mappings. |
| Automations create | A live automation can send WhatsApp or email when its trigger fires. |
| Knowledge Base, Chat Bots, AI Assistant | They spend AI wallet tokens. AI Call Analysis is also off in Client Settings and is never switched on without asking. |
| WhatsApp / Messenger / Website Chat accounts, Templates, Broadcasts: save or send | No account is connected on this tenant, and a template save goes to Meta for approval. Pages and forms are covered. |
| Projects: Collections, Expenses, Notes, Attachments, Maintenance: save | They write to a real project's accounts. Pages and forms are covered. |
| Excel uploads with a real spreadsheet | Would create customers, enquiries or items that cannot be deleted. |
| Monitoring Agent settings | They drive the desktop agent on real users' machines. |
| Search Only My Own Customers, List Only Assignable Executive | Need a second, non-admin user (waiting for the credentials). |

## Defects the suite tracks (expected failures until fixed)

| ID | What | Where tracked |
|---|---|---|
| ERP-002 | `/whatsapp-accounts` throws a .NET `ValidationMessage` exception | `pages.onetouch_test.json` → `/whatsapp-accounts` |
| ERP-010 | 21 Add / New buttons carry a stale `data-bs-toggle="dropdown"` and throw on click (14 Nov 2026: fixed on Users and WhatsApp Templates, new on Dealers and Suppliers) | `pages.onetouch_test.json`, one per page |
| ERP-011 | First load of `/home` after login throws `removeEventListener` of null | `script_errors.spec.js` |
| ERP-012 | Reopening an Edit modal throws `Object.values(undefined)` from Bootstrap Tooltip | `script_errors.spec.js` |
| ERP-013 to ERP-016, ERP-018 | HRMS-side pages (leave approval, exit dashboard, exit approvals, my resignation, document search). ERP-017 (notice rules search) and ERP-019 (Job Board Candidates tab) stopped reproducing on 14 Nov 2026 and their markers were removed | `pages.onetouch_test.json` (`known` / `knownList`) |
| ERP-020 | A sales invoice for more than the stock on hand saves although "Allow Negative Stock" is off | `inventory_purchase_sales.spec.js` PS-06 (switched off, see above) |
| ERP-021 | Payment Pending Leads (`/payment-pending-leads`, `/won-leads`): Enter in the quick search box does not filter the list | `pages.onetouch_test.json` (`knownList`) |
| ERP-022 | Item Settings: the Need Images and Need Video switches share the id `need-image-1` | not automated (found by the settings comparison in `scripts/qa/bug_shots_2026-11-14.js`) |
| QT-F1, CH-F1, ST-06, NM-05, NP-12 | Earlier findings | their own specs |

When a fix lands, its test reports "expected to fail but passed": remove the `test.fail` marker (or the `known`
entry) and mark the issue fixed in the next QA report.

## Performance

`scripts/qa/site_perf.js` measures the site as one user (read-only; it is not a load test). It reports the empty-cache
first visit (files, MB, what is uncompressed or uncached), every menu page opened by URL and by sidebar click (time until
content, time until data, FCP / LCP, page weight, DOM size), every API call grouped by endpoint (median / p95 / max), and
JS heap growth over the walk. A later run is compared with the previous one.

```bash
node scripts/qa/site_perf.js              # 2 direct + 3 in-app runs per page, about 20 min
node scripts/qa/site_perf.js --quick      # 1 + 1 runs, about 8 min
node scripts/qa/site_perf.js --only leads # only pages whose path contains "leads"
node scripts/qa/site_perf.js --net slow4g --direct 1 --inapp 2   # slow 4G (1.6 Mbps, 150 ms), about 20 min; add --cpu 4 for a slow phone CPU
```

`scripts/qa/site_perf_actions.js` times the repeat actions on every page that offers them (search with a matching and a non-matching word, clearing it, tabs, page 2, 100 rows, filter drawer, date ranges, calendar months), until the data has finished loading. Read-only: it types in list search boxes, picks dropdown options and clicks tabs / pagers / Apply / Clear only, never on Profile, Client Settings or password pages, and stops if it sees a write request caused by an action.

```bash
node scripts/qa/site_perf_actions.js                   # all pages, about 15 min
node scripts/qa/site_perf_actions.js --only my-tasks --passes 3   # confirm a slow page
node scripts/qa/site_perf_actions.js --net slow4g      # on Slow 4G
```

Output: `reports/qa/raw/site-perf-<company>-<stamp>.md` and `.json` (and `site-perf-actions-…` for actions). Run it with no other session on the tenant.
Verdicts: direct load good <= 2.5 s, fair <= 4 s (when the data has finished loading); in-app click good <= 1.5 s, fair <= 3 s; API call good <= 1 s, fair <= 3 s.

## Keeping it current

After every feature update run `/qa-changes`. It snapshots the whole site, diffs against the last snapshot and says
which tests each change touches. For the 55 manifest pages, `node scripts/qa/make_page_manifest.js` then refreshes
the expected structure, and a new page gets its tests with no new code.
