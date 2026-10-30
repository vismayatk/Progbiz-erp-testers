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
| ERP-001 | `/chat` throws `null.addEventListener` on load | `pages.onetouch_test.json` → `/chat` |
| ERP-002 | `/whatsapp-accounts` throws a .NET `ValidationMessage` exception | `pages.onetouch_test.json` → `/whatsapp-accounts` |
| ERP-010 | 12 Add / New buttons carry a stale `data-bs-toggle="dropdown"` and throw on click | `pages.onetouch_test.json`, one per page |
| ERP-011 | First load of `/home` after login throws `removeEventListener` of null | `script_errors.spec.js` |
| ERP-012 | Reopening an Edit modal throws `Object.values(undefined)` from Bootstrap Tooltip | `script_errors.spec.js` |
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
