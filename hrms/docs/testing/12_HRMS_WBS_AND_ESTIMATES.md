# HRMS Module — Work Breakdown Structure (WBS) & Effort Estimates

> Document ID: HRMS-QA-WBS-001 · Version 1.0 · 2026-07-21
> Sub-module WBS with hour estimates for the HRMS QA effort (design → automation → execution → reporting), following the project's standing estimation practice. Log daily actuals against each task.

Estimates are in **person-hours**. Complexity weighting reflects page count and archetype mix (kanban/map/calendar/report pages cost more than simple list+modal pages).

---

## 1. Phase rollup

| WBS | Phase | Est. hours | Status |
|---|---|---:|---|
| 1 | Module study & live page catalog (80 pages) | 24 | ✅ Done |
| 2 | Test design — plan, strategy, scenarios, cases, RTM | 40 | ✅ Done (this doc set) |
| 3 | Automation framework (config, POM base, global-setup, smoke) | 20 | ◐ In progress (smoke done) |
| 4 | Automation build-out — functional + E2E per sub-module | 120 | ○ Planned |
| 5 | Test execution & regression cycles | 48 | ○ Planned |
| 6 | Defect management & retest | 24 | ○ Planned |
| 7 | Reporting & sign-off | 12 | ○ Planned |
| | **Total** | **288** | |

## 2. Test design (WBS 2) — by sub-module

| WBS | Sub-module | Pages | Design hrs | Status |
|---|---|---:|---:|---|
| 2.1 | Core HR | 18 | 9 | ✅ |
| 2.2 | Recruitment & Onboarding | 15 | 7.5 | ✅ |
| 2.3 | Attendance & Time | 15 | 7.5 | ✅ |
| 2.4 | Leave Management | 21 | 10.5 | ✅ |
| 2.5 | My Workspace (ESS) | 11 | 5.5 | ✅ |
| | **Subtotal** | **80** | **40** | |

## 3. Automation build-out (WBS 4) — by sub-module

Per-page cost blends POM + happy-path spec + negative/validation + wiring into the suite. Complex-page uplift applied for kanban/map/calendar/finalization/report-heavy pages.

| WBS | Sub-module | Pages | Base autom. hrs | Complex uplift | Total hrs | Status |
|---|---|---:|---:|---:|---:|---|
| 4.1 | Core HR | 18 | 27 | +6 (salary process, letters, approvals) | 33 | ○ |
| 4.2 | Recruitment | 15 | 22 | +8 (pipeline kanban, onboarding, public page) | 30 | ○ |
| 4.3 | Attendance | 15 | 22 | +6 (finalization, geofences, report pack) | 28 | ○ |
| 4.4 | Leave | 21 | 24 | +6 (calendar, analytics, accrual, sync) | 30 | ○ |
| 4.5 | ESS | 11 | 14 | +5 (map, round-trips to admin) | 19 | ○ |
| | **Subtotal** | **80** | **109** | **+31** | **~140*** | |

*Rollup capped/normalised to the 120 h phase figure in §1; the 140 h line shows the pre-normalisation sub-module sum — refine against actuals.

## 4. E2E flow automation (part of WBS 4)

| Flow | Est. hrs |
|---|---:|
| SC-E2E-01 Hire-to-Employee | 8 |
| SC-E2E-02 Daily attendance cycle | 8 |
| SC-E2E-03 Leave lifecycle | 6 |
| SC-E2E-04 Comp-off to encashment | 4 |
| SC-E2E-05 Salary & document admin | 6 |
| SC-E2E-06 ESS ↔ admin round-trips | 6 |
| **Subtotal** | **38** |

## 5. Execution & reporting (WBS 5–7)

| WBS | Task | Est. hrs |
|---|---|---:|
| 5.1 | Full manual execution pass (P1/P2) | 24 |
| 5.2 | Regression cycles (per build) | 16 |
| 5.3 | Cross-role/ESS-user execution | 8 |
| 6.1 | Defect logging & triage | 12 |
| 6.2 | Retest fixed defects | 12 |
| 7.1 | Test summary reports | 8 |
| 7.2 | Sign-off & handover | 4 |

## 6. Prerequisite / infra tasks (must-do before WBS 4 CI)

| Task | Est. hrs | Notes |
|---|---:|---|
| Fix headless Blazor load (`--disable-http2` in `hrms/playwright.config.js`) | 1 | unblocks CI (plan §5.1) |
| Provision a limited (non-admin) ESS user | 2 | role-based coverage |
| Seed-data fixtures (shifts/roster, leave config, requisition) | 6 | E2E prerequisites |

## 7. Daily actuals log (fill in)

| Date | WBS | Task | Planned hrs | Actual hrs | Notes |
|---|---|---|---:|---:|---|
| | | | | | |
