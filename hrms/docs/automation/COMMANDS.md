# HRMS automation — commands & what each runs

Every runnable `npm` script for the HRMS suite, and exactly what it executes. All web runs target
`https://hrms-test.progbiz.in` (tenant `pbhrms`, admin `amit`); creds come from env
(`HRMS_BASE_URL`, `HRMS_COMPANY_CODE`, `HRMS_USERNAME`, `HRMS_PASSWORD`).

> Blazor WASM note: HRMS can fail to load in headless Chromium over HTTP/2. The suite runs headless
> by default and usually works; if you ever get a blank app, run headed (append `-- --headed`) or add
> `launchOptions.args: ['--disable-http2']` in `hrms/playwright.config.js` (not set by default).

## The one you probably want

| Command | What it runs |
|---|---|
| `npm run hrms:linear` | **The linear run ALONE** — one test, every HRMS page in one tab (`tests/00_linear`). Nothing else. |
| `npm run hrms:all` | **Full web regression** = the linear run **plus** 3 standalone module specs (resignation, WFH, meeting). So it *includes* `hrms:linear` but runs more — they are **not** the same. |
| `npm run hrms:all:mobile` | `hrms:all` **then** the mobile E2Es (only if an Android emulator is attached; else the mobile half is skipped with a note). Prints a pass/fail summary. |

## Full web suite

`npm run hrms:all` → `node hrms/scripts/run-module.js all` → Playwright over:

```
hrms/tests/00_linear   hrms/tests/11_resignation   hrms/tests/13_wfh   hrms/tests/14_meeting   --workers=1
```

- **`00_linear`** — ONE test that walks **every HRMS page** (`hrms/data/hrmsPages.js`, ~128 pages) in live sidebar order, in a single browser tab. It creates **one employee** and flows that employee through the whole lifecycle (profile → recruit a candidate → onboard → leave/ESS → exit). Each page is **health-checked** (loads, no app-error/"contact admin" crash screen, finishes loading, tables render) and, where a page's job is to add data, it does that **once** (`flows/linearActions.js`). Results → `page-results.json`; failures are soft so the walk never stops early. Blockers (app crash screens) are flagged `🚧`, plain failures `❌`.
- **`11_resignation` / `13_wfh` / `14_meeting`** — deep module specs too complex for the linear walk (full exit lifecycle incl. F&F; WFH; Meeting Management).

## Per-module (web) — slices of the linear run

Each runs `hrms/tests/00_linear` filtered to one sidebar section (`HRMS_SECTION`), `--workers=1`. The
run employee is bootstrapped if an earlier step was skipped.

| Command | Section walked |
|---|---|
| `npm run hrms:core-hr` | Core HR |
| `npm run hrms:recruitment` | Recruitment |
| `npm run hrms:onboarding` | Onboarding |
| `npm run hrms:attendance` | Attendance (base page checks) |
| `npm run hrms:leave` | Leave |
| `npm run hrms:ess` | My Workspace (ESS) |
| `npm run hrms:payroll` | Payroll (base page checks) |
| `npm run hrms:helpdesk` | Helpdesk |
| `npm run hrms:referral` | Referral |
| `npm run hrms:linear` | the **whole** linear run (all sections) — i.e. the complete `tests/00_linear` with no section filter, and **no** module specs (that is what `hrms:all` adds) |

## Standalone module specs (web)

These run their own spec file, not the linear run.

| Command | Spec |
|---|---|
| `npm run hrms:resignation` | `hrms/tests/11_resignation` — full exit lifecycle incl. F&F |
| `npm run hrms:wfh` | `hrms/tests/13_wfh` — Work From Home |
| `npm run hrms:meeting` | `hrms/tests/14_meeting` — Meeting Management |

## Mobile (Android emulator × web)

Need the emulator up (start the `emulator-panel` preview). Each is opt-in gated so it never runs in
the plain web suite. See `mobile-app-tests/` for the driver.

| Command | What it runs |
|---|---|
| `npm run hrms:mobile` | Attendance check-in E2E: web creates employee → mobile check-in → web verifies |
| `npm run hrms:mobile:inout` | Check-in **and** check-out ↔ web (`attendance_in_out_e2e`) |
| `npm run hrms:mobile:leave` | Leave applied both directions ↔ web (`leave_sync_e2e`) |
| `npm run hrms:mobile:coverage` | Walks the 14 HRMS mobile pages, asserts + screenshots each (`ess_coverage.js`) |

## Utility / raw

| Command | What it runs |
|---|---|
| `npm run hrms` | the module runner with no args → prints the list of module names |
| `npm run test:hrms` | raw Playwright over the whole `hrms/` config (all specs, not the curated run) |
| `npm run test:hrms:smoke` | `hrms/tests/00_smoke` — page-reachability smoke |

### Handy env flags (for the linear run)
- `HRMS_SECTION=leave,ess` — walk only those sections
- `HRMS_LINEAR_READONLY=1` — checks only, add nothing
- Extra args pass straight through, e.g. `npm run hrms:leave -- --headed`

See [`TEST_INVENTORY.md`](TEST_INVENTORY.md) for the full page/action breakdown.
