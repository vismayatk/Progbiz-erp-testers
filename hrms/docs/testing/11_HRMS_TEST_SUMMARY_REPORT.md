# HRMS Module — Test Summary Report (Template)

> Document ID: HRMS-QA-TSR-001 · Version 1.0 (template) · 2026-07-21
> Fill in per execution cycle. Pairs with the automated results in `reports/hrms-html/` and `reports/hrms-results.json`.

---

## 1. Report identity
- **Cycle / Build:** _<build id / date range>_
- **Environment:** https://hrms-erp.progbiz.in · tenant `Hrms` · _<headed | headless+--disable-http2>_
- **Prepared by / date:** _<qa>_ · _<yyyy-mm-dd>_
- **Test basis:** [Test Plan](00_HRMS_TEST_PLAN.md), [Scenarios](02_HRMS_TEST_SCENARIOS.md), module case docs 03–07.

## 2. Executive summary
_<2–4 sentences: what was tested, overall health, go/no-go recommendation.>_

## 3. Execution results

| Sub-module | Planned | Executed | Passed | Failed | Blocked | Pass % |
|---|---:|---:|---:|---:|---:|---:|
| Core HR | | | | | | |
| Recruitment | | | | | | |
| Attendance | | | | | | |
| Leave | | | | | | |
| ESS | | | | | | |
| E2E flows | | | | | | |
| **Total** | | | | | | |

## 4. Automated run snapshot
- Command: `npm run test:hrms` (or `test:hrms:smoke`)
- Total / passed / failed / flaky / skipped: _<from `reports/hrms-results.json`>_
- Duration: _<…>_ · Report: `reports/hrms-html/index.html`

## 5. Defect summary

| Severity | New | Open | Fixed | Closed |
|---|---:|---:|---:|---:|
| Blocker | | | | |
| Critical | | | | |
| Major | | | | |
| Minor | | | | |
| Cosmetic | | | | |

Top defects: _<list DEF-HRMS-### with one-liners; see [defect log](10_HRMS_DEFECT_LOG_AND_TEMPLATE.md)>_.

## 6. Coverage achieved
- Pages exercised: _<n>_ / 80 · Scenarios: _<n>_ · E2E flows: _<n>_ / 6
- See [coverage](09_HRMS_TEST_COVERAGE.md) and [RTM](08_HRMS_RTM.md).

## 7. Exit-criteria assessment

| Criterion | Met? | Notes |
|---|:--:|---|
| Smoke suite 100% green | ☐ | |
| All planned P1/P2 executed | ☐ | |
| No open Critical/Blocker | ☐ | |
| RTM & coverage updated | ☐ | |

## 8. Risks / observations / recommendation
_<residual risks, flakiness, environment notes, and the final go/no-go.>_

## 9. Sign-off
| Role | Name | Decision | Date |
|---|---|---|---|
| QA Lead | | ☐ Accept ☐ Reject | |
| Project Lead | | ☐ Accept ☐ Reject | |
