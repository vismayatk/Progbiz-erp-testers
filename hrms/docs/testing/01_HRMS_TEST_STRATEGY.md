# HRMS Module — Test Strategy

> Document ID: HRMS-QA-STRAT-001 · Version 1.0 · 2026-07-21
> Companion to the [Master Test Plan](00_HRMS_TEST_PLAN.md). The plan says *what/when*; this strategy says *how*.

---

## 1. Testing philosophy

Ground every assertion in **observed reality** (the live crawl in `hrms/data/`), assert build quirks **AS-IS** rather than "fixing" them in tests, and prefer **stable, meaning-bearing selectors** (ids, roles, header/column/tab text) over brittle CSS/position. Automation follows the repo's **Page Object Model** convention (`hrms/pages/**`), one login per run via storage state.

## 2. Test types & why

| Type | Purpose | Where |
|---|---|---|
| Smoke / reachability | Every page mounts & shows identity — first line of defence on each build | `tests/00_smoke` (automated, all 80 pages) |
| Functional (positive) | Core CRUD/workflow per page works | module case docs §4; `tests/0X_*/interactions` |
| Negative / validation | Required fields, bad input, unauthorized paths rejected | module case docs §4 |
| UI / identity | Title, buttons, grid columns, tabs present & correct | smoke + case docs |
| Report-filter | Filter-first grids populate only after Filter/Run | Attendance & Leave report pages |
| End-to-end / integration | Cross-module business flows & ESS↔admin round-trips | module case docs §6 |
| Regression | Re-run automated suites each build | full `hrms/tests` |

## 3. Prioritisation

- **P1 (Critical):** login/auth, core masters (employees, leave config, shifts), request→approval→posting chains, payslip/salary inputs, anything blocking an E2E.
- **P2 (Major):** secondary CRUD, reports, filters, tabs, validation.
- **P3 (Minor):** cosmetic, rarely-used options, export formatting, known-label-bug documentation.

Execution order: Smoke → P1 functional → P1 E2E → P2 → P3.

## 4. Automation strategy

- **Framework:** Playwright `@playwright/test`, Chromium, POM (`hrms/pages`), data-driven smoke from `fixtures/page-manifest.js`.
- **Auth:** `global-setup` logs in once → `hrms/.auth/state.json` (git-ignored); every spec reuses it via `storageState`.
- **Config:** dedicated `hrms/playwright.config.js`, 150s test timeout, 1 retry, `list`+`html`+`json` reporters to `reports/hrms-*`.
- **Headless constraint:** Blazor WASM needs `--disable-http2` (or `HEADED=1`) — see plan §5.1. This must be fixed in config before CI.
- **Selector policy:** ids → roles/labels → header/column/tab text. Never assert on auto-generated/positional classes.
- **Waiting:** rely on web-first assertions + `networkidle`/explicit element waits; report pages must `click Filter` then wait for rows.
- **What to automate first:** the smoke sweep (done) → per-module happy-path CRUD → E2E chains. Negative/edge cases automated after positive coverage is green.

## 5. Handling the known build quirks (assert AS-IS)

From the crawl (do **not** "correct" these in assertions; document them):
- `/employee-remark` page header reads **"Employee Deduction"** (copy-paste).
- `/add-visit-report` header misspelled **"Add Vist Report"**.
- `/upload-employee` shows a stray **"Leave Request"** card title.
- Filter-first report pages render an **empty grid** until a filter is applied — expected, not a bug.

Each is captured as an explicit "AS-IS" test case in the relevant module doc §5 and logged as a **cosmetic defect** for the dev team (see [defect log](10_HRMS_DEFECT_LOG_AND_TEMPLATE.md)).

## 6. Entry/exit & defect flow

Entry/exit criteria per the plan §6. Defects logged with the template in [10_HRMS_DEFECT_LOG_AND_TEMPLATE.md](10_HRMS_DEFECT_LOG_AND_TEMPLATE.md); severity Blocker/Critical/Major/Minor/Cosmetic; retest on fix; regression-guard by adding/keeping an automated case.

## 7. Metrics tracked

Cases planned/executed/passed/failed/blocked, pass %, automation %, open defects by severity, requirement/page coverage (RTM), E2E-flow coverage. Reported in the [Test Summary Report](11_HRMS_TEST_SUMMARY_REPORT.md).

## 8. Tools

Playwright (execution), this Markdown set (design/trace), `reports/hrms-html` (results), the exploration scripts in `hrms/exploration/` (re-crawl the app when the build changes).
