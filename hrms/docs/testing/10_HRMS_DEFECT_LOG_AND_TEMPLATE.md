# HRMS Module — Defect Log & Report Template

> Document ID: HRMS-QA-DEF-001 · Version 1.0 · 2026-07-21
> Standard bug-report template + the running defect log for HRMS testing.

---

## 1. Defect report template

Copy this block per defect:

```
### DEF-HRMS-000 — <short title>
- Summary: <one line>
- Module / Page: <sub-module> · <route>
- Related test case: TC-<PREFIX>-###   (Scenario SC-<...>)
- Severity: Blocker | Critical | Major | Minor | Cosmetic
- Priority: P1 | P2 | P3
- Environment: https://hrms-erp.progbiz.in · tenant Hrms · <browser/headed|headless>
- Build / Date: <build id> · <yyyy-mm-dd>
- Preconditions: <state/data needed>
- Steps to reproduce:
   1. …
   2. …
- Expected result: <…>
- Actual result: <…>
- Evidence: <screenshot / trace / video path in reports/hrms-html>
- Status: New | Open | In Progress | Fixed | Retest | Closed | Deferred | Won't Fix
- Reported by / Assigned to: <qa> / <dev>
- Notes: <…>
```

### Severity guide
| Severity | Meaning |
|---|---|
| Blocker | Halts testing of a sub-module (login, page won't load, save impossible) |
| Critical | Core function broken, no workaround (approval doesn't post, salary process fails) |
| Major | Important function broken, workaround exists |
| Minor | Small functional issue, low impact |
| Cosmetic | Label/spelling/layout only |

---

## 2. Known issues found during the study/crawl (pre-logged)

These were observed during the 2026-07-20 crawl. They are asserted **AS-IS** in the test cases and logged here for the dev team.

### DEF-HRMS-001 — `/employee-remark` page header reads "Employee Deduction"
- Module / Page: Core HR · `/employee-remark`
- Related test case: Core HR §5 (AS-IS)
- Severity: Cosmetic · Priority: P3
- Expected: header should read "Employee Remark(s)"
- Actual: header reads "Employee Deduction" (copy-paste bug)
- Status: New

### DEF-HRMS-002 — `/add-visit-report` header misspelled "Add Vist Report"
- Module / Page: Attendance · `/add-visit-report`
- Related test case: Attendance §5 (AS-IS)
- Severity: Cosmetic · Priority: P3
- Expected: "Add Visit Report"
- Actual: "Add Vist Report"
- Status: New

### DEF-HRMS-003 — `/upload-employee` shows a stray "Leave Request" card title
- Module / Page: Core HR · `/upload-employee`
- Related test case: Core HR §5 (AS-IS)
- Severity: Cosmetic · Priority: P3
- Expected: no unrelated "Leave Request" card on the Excel-import page
- Actual: stray "Leave Request" card title present
- Status: New

### DEF-HRMS-004 — HRMS app fails to load in headless Chromium (Blazor WASM over HTTP/2)
- Module / Page: Platform-wide (login/`_framework/*.wasm`)
- Severity: Major (test-infra) · Priority: P1
- Expected: app mounts headless
- Actual: `net::ERR_HTTP2_PROTOCOL_ERROR` on `_framework/*.wasm` → app never starts → login times out
- Workaround: run headed (`HEADED=1`) or launch Chromium with `--disable-http2`
- Status: Open (mitigation known; config fix recommended)

> Additional cosmetic/empty-state and filter-first observations per module are noted in each module doc's §5 — promote any that are genuine defects into this log using the template above.

---

## 3. Live defect log

| ID | Title | Module/Page | Severity | Priority | Test case | Status | Reported | Assigned |
|---|---|---|---|---|---|---|---|---|
| DEF-HRMS-001 | Remark header says "Employee Deduction" | Core HR /employee-remark | Cosmetic | P3 | CHR §5 | New | 2026-07-20 | — |
| DEF-HRMS-002 | "Add Vist Report" misspelling | Attendance /add-visit-report | Cosmetic | P3 | ATT §5 | New | 2026-07-20 | — |
| DEF-HRMS-003 | Stray "Leave Request" card on import | Core HR /upload-employee | Cosmetic | P3 | CHR §5 | New | 2026-07-20 | — |
| DEF-HRMS-004 | Headless WASM/HTTP-2 load failure | Platform | Major | P1 | Plan §5.1 | Open | 2026-07-20 | — |
