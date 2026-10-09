# HRMS Module — Test Coverage

> Document ID: HRMS-QA-COV-001 · Version 1.0 · 2026-07-21
> Coverage snapshot for the HRMS test set. Case counts per module are maintained in the per-module docs (03–07); update the totals below as those docs and the automated suites evolve.

---

## 1. Page coverage (by sub-module)

| Sub-module | Pages | Smoke (reachability) | Functional cases authored | E2E flows |
|---|---:|:--:|---|:--:|
| Core HR | 18 | 18 / 18 | see [03](03_TEST_CASES_CORE_HR.md) | SC-E2E-01/05 |
| Recruitment & Onboarding | 15 | 15 / 15 | see [04](04_TEST_CASES_RECRUITMENT.md) | SC-E2E-01 |
| Attendance & Time | 15 | 15 / 15 | see [05](05_TEST_CASES_ATTENDANCE.md) | SC-E2E-02 |
| Leave Management | 21 | 21 / 21 | see [06](06_TEST_CASES_LEAVE.md) | SC-E2E-03/04 |
| My Workspace (ESS) | 11 | 11 / 11 | see [07](07_TEST_CASES_ESS.md) | SC-E2E-06 |
| **Total** | **80** | **80 / 80 (100%)** | (rollup below) | 6 flows |

## 2. Coverage by test type

| Type | Status |
|---|---|
| Smoke / reachability | ✅ 100% — all 80 pages automated (`tests/00_smoke`) |
| Functional (positive) | ◐ Authored per module; automation partial (`tests/0X_*/interactions.spec.js`) |
| Negative / validation | ◐ Authored per module; automation planned |
| Report-filter | ◐ Authored (Attendance/Leave report pages); automation planned |
| End-to-end / integration | ○ 6 flows designed; automation planned |
| Regression | ✅ Smoke + interaction suites run per build |

## 3. Requirement coverage
- **Pages traced in RTM:** 80 / 80 (100%) — see [08_HRMS_RTM.md](08_HRMS_RTM.md).
- **Scenarios defined:** all sub-modules + 6 cross-module E2E — see [02_HRMS_TEST_SCENARIOS.md](02_HRMS_TEST_SCENARIOS.md).

## 4. Case-count rollup

| Sub-module | Scenarios | Test cases |
|---|---:|---:|
| Core HR | 12 | 107 |
| Recruitment & Onboarding | 15 | 92 |
| Attendance & Time | 15 | 77 |
| Leave Management | 14 | 97 |
| My Workspace (ESS) | 12 | 57 |
| **Total** | **68** | **430** |

> Module scenarios (68) are the per-sub-module `SC-<PREFIX>-##`; the [scenarios doc](02_HRMS_TEST_SCENARIOS.md) additionally defines cross-cutting (smoke/auth/workflow) and 6 cross-module `SC-E2E-##` flows. Update this rollup when module docs are edited.

## 5. Coverage gaps / follow-ups
- Functional & E2E automation to be built out (currently smoke-only + interaction seeds).
- Role-based ESS behaviour needs a limited (non-admin) user to fully cover.
- Payroll monetary correctness is out of scope here (needs finance oracle).
- Headless CI blocked until the Blazor `--disable-http2` fix lands (plan §5.1).
