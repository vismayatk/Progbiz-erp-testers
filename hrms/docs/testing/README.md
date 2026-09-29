# HRMS Module — Test Documentation

Complete QA documentation set for the **HRMS module** of the ProgBiz ERP
(https://hrms-erp.progbiz.in · tenant `Hrms`), grounded in the live page catalog
(`hrms/data/`) and module study docs (`hrms/docs/00–05`).

## Contents

| # | Document | Purpose |
|---|---|---|
| 00 | [Master Test Plan](00_HRMS_TEST_PLAN.md) | Scope, objectives, approach, environment, entry/exit, risks, deliverables |
| 01 | [Test Strategy](01_HRMS_TEST_STRATEGY.md) | Test types, prioritisation, automation & selector policy, quirk handling |
| 02 | [Test Scenarios](02_HRMS_TEST_SCENARIOS.md) | High-level scenario index (per module + 6 cross-module E2E) |
| 03 | [Test Cases — Core HR](03_TEST_CASES_CORE_HR.md) | 107 cases · 12 scenarios · 18 pages |
| 04 | [Test Cases — Recruitment](04_TEST_CASES_RECRUITMENT.md) | 92 cases · 15 scenarios · 15 pages |
| 05 | [Test Cases — Attendance](05_TEST_CASES_ATTENDANCE.md) | 77 cases · 15 scenarios · 15 pages |
| 06 | [Test Cases — Leave](06_TEST_CASES_LEAVE.md) | 97 cases · 14 scenarios · 21 pages |
| 07 | [Test Cases — ESS](07_TEST_CASES_ESS.md) | 57 cases · 12 scenarios · 11 pages |
| 08 | [Requirements Traceability Matrix](08_HRMS_RTM.md) | 80 pages → scenarios → cases → automation status |
| 09 | [Test Coverage](09_HRMS_TEST_COVERAGE.md) | Coverage by page, type, and rollup |
| 10 | [Defect Log & Template](10_HRMS_DEFECT_LOG_AND_TEMPLATE.md) | Bug template + pre-logged known issues |
| 11 | [Test Summary Report](11_HRMS_TEST_SUMMARY_REPORT.md) | Per-cycle execution report template |
| 12 | [WBS & Estimates](12_HRMS_WBS_AND_ESTIMATES.md) | Sub-module work breakdown + hour estimates |

## At a glance

- **80 pages** across 5 sub-modules (Core HR, Recruitment, Attendance, Leave, ESS) + a cross-cutting approval-workflow engine.
- **430 detailed test cases**, **68 module scenarios** + 6 cross-module E2E flows.
- **100% page traceability** in the RTM; smoke automation covers all 80 pages.

## How to run the automated suites

```powershell
# NOTE: HRMS is a Blazor WASM app — it fails to load in headless Chromium over HTTP/2.
# Run headed, OR add  use.launchOptions = { args: ['--disable-http2'] }  to hrms/playwright.config.js.
$env:HEADED=1; npm run test:hrms:smoke     # 80-page reachability smoke
$env:HEADED=1; npm run test:hrms           # full HRMS suite
npx playwright show-report reports/hrms-html
```

See the [Test Plan §5.1](00_HRMS_TEST_PLAN.md) for the headless/Blazor constraint and the [WBS §6](12_HRMS_WBS_AND_ESTIMATES.md) for the one-line config fix.

---
_Prepared 2026-07-21 · Version 1.0._
