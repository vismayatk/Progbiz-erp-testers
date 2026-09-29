# HRMS Module — Master Test Plan

> Document ID: HRMS-QA-PLAN-001 · Version 1.0 · Prepared 2026-07-21
> App under test: **https://hrms-erp.progbiz.in** · Tenant company code `Hrms` · test user `vismaya`
> Related: [Test Strategy](01_HRMS_TEST_STRATEGY.md) · [Scenarios](02_HRMS_TEST_SCENARIOS.md) · [RTM](08_HRMS_RTM.md) · [Coverage](09_HRMS_TEST_COVERAGE.md) · [WBS & Estimates](12_HRMS_WBS_AND_ESTIMATES.md)

Follows an IEEE-829-style structure adapted to this project's Playwright + POM workflow.

---

## 1. Introduction

This plan governs functional and end-to-end testing of the **HRMS module** of the ProgBiz ERP. HRMS spans the complete employee lifecycle — **Recruitment & Onboarding, Core HR, Attendance & Time, Leave Management, and Employee Self-Service (ESS)** — with a cross-cutting **approval-workflow engine** (`/approval/config` → `/approvals`) threading through all sub-modules.

The module comprises **80 pages** across 5 sub-modules, captured from a live crawl on 2026-07-20 (raw data in [`hrms/data/`](../../data), study docs in [`hrms/docs/`](..)).

## 2. Objectives

- Verify every HRMS page loads (authenticated) and renders its intended identity, controls, grids, and tabs.
- Verify each sub-module's core CRUD/workflow operations behave correctly, including validation and negative paths.
- Verify the cross-module end-to-end flows (hire-to-employee, daily attendance cycle, leave lifecycle, salary/document admin, approval routing).
- Verify ESS ↔ admin round-trips (self-service action → admin queue → posted result).
- Establish a repeatable, automatable regression baseline (Playwright) and a traceable record of coverage.

## 3. Scope

### 3.1 In scope
| Sub-module | Pages | Representative areas |
|---|---:|---|
| Core HR | 18 | Employees, Sections, Worker Directory, Salary Revisions/Process, Deductions, Remarks, Probation, Letters, Approvals, Reports |
| Recruitment & Onboarding | 15 | Requisitions, Job Board, Candidates, Assessments, Interviews, Offers, Pipeline, Onboarding |
| Attendance & Time | 15 | Shifts, Roster, Attendance Log, Device/Visit punches, Regularization, OT, Finalization, Geofences, Timesheet, Reports |
| Leave Management | 21 | Leave Types/Patterns/Policy/Assignment, Requests/Approval, Balances/Ledger, Encashment, Comp-Offs, Holidays, Analytics |
| My Workspace (ESS) | 11 | Dashboard, Profile, Requests, Leave, Attendance, Locations, Documents, Letters, Pay, Probation |
| **Total** | **80** | plus the cross-cutting approval workflow engine |

Test types in scope: **Smoke/reachability, Functional (positive), Negative/validation, UI/identity, Report-filter, End-to-end/integration, Regression.**

### 3.2 Out of scope
- Load/performance and security/pen testing (tracked separately).
- Payroll monetary-calculation correctness beyond input/flow verification (needs finance sign-off / oracle data).
- Third-party integrations' internal behaviour (biometric device firmware, email delivery infrastructure, map tiles).
- Cross-browser matrix beyond Chromium (see §8 constraint on the Blazor/HTTP-2 headless issue).
- Mobile-native apps (only the responsive web ESS is covered).

## 4. Test approach & levels

- **Level 1 — Smoke (reachability):** every one of the 80 pages, authenticated, asserts it wasn't bounced to `/login`, shows its title, identity buttons, first-grid columns, and tabs. Automated: `hrms/tests/00_smoke/all_pages.spec.js` (data-driven from `fixtures/page-manifest.js`).
- **Level 2 — Functional / interaction:** per sub-module CRUD, validation, filters, tabs. Partly automated in `hrms/tests/01_core_hr … 05_ess/interactions.spec.js`; the detailed manual cases live in `03_…07_TEST_CASES_*.md`.
- **Level 3 — End-to-end / integration:** the cross-module business flows and ESS↔admin round-trips (§6 of each module doc).
- **Regression:** the automated smoke + interaction suites run on each build.

Design techniques: equivalence partitioning & boundary values (dates, numeric leave/OT/salary fields), decision tables (approval routing, leave eligibility), state transitions (candidate status, probation, leave request lifecycle), and error-guessing for the documented build quirks.

## 5. Test environment

| Item | Value |
|---|---|
| URL | https://hrms-erp.progbiz.in |
| Tenant / company code | `Hrms` |
| Test user | `vismaya` (admin-level); ESS uses the same session unless a limited-role user is provisioned |
| Runner | Playwright `@playwright/test` ^1.60, Chromium |
| Config | `hrms/playwright.config.js` (own config; base `HRMS_BASE_URL`, storageState from `global-setup`) |
| Auth | One login per run via `hrms/fixtures/global-setup.js` → `hrms/.auth/state.json` (git-ignored) |
| Credentials | `HRMS_BASE_URL`, `HRMS_COMPANY_CODE`, `HRMS_USERNAME`, `HRMS_PASSWORD` env vars (defaults baked into `HrmsLoginPage`) |
| Reports | `reports/hrms-html/` (HTML), `reports/hrms-results.json` (JSON) |

### 5.1 Known environment constraint (must-fix for headless/CI)
The HRMS front end is a **Blazor WebAssembly (.NET)** app. In **headless** Chromium its `_framework/*.wasm` runtime assets fail to download over HTTP/2 (`net::ERR_HTTP2_PROTOCOL_ERROR`), so the app never mounts and login times out. Run with **`HEADED=1`**, or add **`--disable-http2`** to the Chromium launch args in `hrms/playwright.config.js`. (Verified 2026-07-20.)

## 6. Entry & exit criteria

**Entry:** test build deployed to the HRMS tenant; login works; test data seed order available (see §7); this plan + module case docs reviewed.

**Exit:** all planned P1/P2 cases executed; smoke suite 100% green; no open **Critical/Blocker** defects; open Major defects triaged with owners; RTM and coverage updated; test summary report issued.

**Suspension:** login/global-setup failure, tenant down, or a Blocker defect preventing >30% of a sub-module — suspend that sub-module until resolved.

## 7. Test data & seeding order

E2E flows require data seeded in dependency order (from the crawl observations):
- **Recruitment:** requisition → job opening → application → candidate → offer → onboarding → employee.
- **Attendance:** shifts → shift-roster → punches → attendance-log (before any attendance assertion).
- **Leave:** leave-types → leave-patterns → leave-policy → leave-assignment (before any leave request).
- **Core HR:** employees (or upload-employee) exist before salary/probation/deduction/letters.

Tests create uniquely-named records per run and should clean up or tolerate residue (data-driven, timestamped names).

## 8. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Blazor WASM headless load failure | Blocks all automation | `--disable-http2` / headed (§5.1) |
| Slow/unstable backend on the tenant | Flaky runs | generous timeouts (150s), 1 retry, retry-on-server-error |
| Filter-first report pages read empty | False negatives | apply Filter/Run before asserting rows |
| Documented label bugs (copy-paste/misspelling) | Wrong assertions | assert AS-IS; listed per module doc §5 |
| Shared admin session for ESS | Role-specific behaviour untested | provision a limited ESS user where role matters |
| Test data coupling across E2E steps | Cascade failures | seed order §7; independent fixtures where possible |

## 9. Deliverables

This document set under [`hrms/docs/testing/`](.):
1. Master Test Plan (this doc) · 2. Test Strategy · 3. Test Scenarios · 4–8. Detailed test cases (Core HR, Recruitment, Attendance, Leave, ESS) · 9. RTM · 10. Coverage · 11. Defect log + template · 12. Test summary report · 13. WBS & estimates. Plus the automated suites under `hrms/tests/`.

## 10. Roles & responsibilities

| Role | Responsibility |
|---|---|
| QA Lead | Owns plan, strategy, sign-off, defect triage |
| QA Engineer(s) | Author/execute cases, automate, log defects, update RTM |
| Dev team | Fix defects, provide test-tenant access & seed data, confirm build quirks |
| Product/BA | Clarify expected behaviour, prioritise |

## 11. Schedule

Effort and phased breakdown are in [12_HRMS_WBS_AND_ESTIMATES.md](12_HRMS_WBS_AND_ESTIMATES.md). Phases: Study (done) → Test design (this set) → Automation build-out → Execution & regression → Reporting/sign-off.

## 12. Approvals

| Name / Role | Decision | Date |
|---|---|---|
| _QA Lead_ | ☐ Approved ☐ Rejected | |
| _Project Lead_ | ☐ Approved ☐ Rejected | |
