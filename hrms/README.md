# HRMS — Playwright automation suite

Positive-workflow automation for the **HRMS module** of the ProgBiz ERP, against
`https://hrms-test.progbiz.in` (tenant `pbhrms`, admin `amit`). Creds come from env
(`HRMS_BASE_URL`, `HRMS_COMPANY_CODE`, `HRMS_USERNAME`, `HRMS_PASSWORD`).

## Quick start

```bash
npm run hrms:all           # full web regression (linear run + resignation + WFH + meeting)
npm run hrms:all:mobile    # the above, then the mobile E2Es (if an Android emulator is attached)
npm run hrms:leave         # one section only (core-hr | recruitment | onboarding | leave | ess | …)
```

**→ Full command reference: [docs/automation/COMMANDS.md](docs/automation/COMMANDS.md)** — every
`npm run hrms:*` script and exactly what it runs.

## How it works

- **The linear run** (`tests/00_linear/hrms_linear_run.spec.js`) is the backbone: ONE test that walks
  **every HRMS page** (`data/hrmsPages.js`, ~128 pages) in live sidebar order, in a single browser
  tab. It creates **one employee** and flows that employee through the whole lifecycle (profile →
  recruit a candidate → onboard → leave/ESS → exit + F&F). Each page is **health-checked** (loads, no
  app-error/crash screen, finishes loading, tables render); pages whose job is to add data do it
  **once** (`flows/linearActions.js`). Failures are soft so the walk never stops early; app-crash
  **blockers** are flagged separately from ordinary failures, and every page's result lands in
  `page-results.json`.
- **Deep module specs** cover flows too complex for the linear walk: `tests/11_resignation` (full exit
  lifecycle incl. F&F), `tests/13_wfh`, `tests/14_meeting`.
- **Mobile E2Es** (`../mobile-app-tests/`) drive the Android app × web together — see COMMANDS.md.

## Layout

```
hrms/
├── README.md                     ← you are here
├── playwright.config.js          ← HRMS config (global-setup admin login, storageState)
├── scripts/run-module.js         ← the `npm run hrms:<module>` runner (+ data/modulePresets.js)
├── tests/
│   ├── 00_linear/                ← the linear run (every page, one tab)   ← the main suite
│   ├── 00_smoke/                 ← page-reachability smoke
│   └── 01_… 15_…                 ← per-module specs (resignation, wfh, meeting, leave, ess, …)
├── flows/                        ← linearActions, runEmployee, recruitmentFlow, leaveFlow, pageCheck, …
├── pages/                        ← page objects (core-hr, recruitment, onboarding, resignation, ess, …)
├── data/                         ← hrmsPages.js (the page list), modulePresets.js, test data
└── docs/
    ├── automation/COMMANDS.md        ← command reference
    ├── automation/TEST_INVENTORY.md  ← full page/action breakdown of the run
    ├── testing/                      ← QA docs (test plan, strategy, cases, RTM, coverage)
    └── 00–05 *.md                    ← earlier module STUDY (page catalog on the old tenant; reference only)
```

## Scope & caveats

- **Positive flows + page health.** It proves pages load and the main actions work; it is **not**
  exhaustive negative/validation or business-rule-correctness testing (e.g. it won't catch a wrong
  F&F TDS calculation — see the defect log).
- **Attendance, Payroll, and the Exit lifecycle** are **page-level** in the linear run; their deep
  flows live in dedicated specs / are owned separately.
- Blazor WASM can fail to load in headless Chromium over HTTP/2 — if the app renders blank, run
  headed or add `--disable-http2` (see COMMANDS.md).

> The `docs/00–05` module-study markdown and `data/pages/*.json` captures were the earlier research
> phase (crawled on the old `hrms-erp.progbiz.in` tenant). They remain as reference; the live suite
> above targets `hrms-test.progbiz.in`.
