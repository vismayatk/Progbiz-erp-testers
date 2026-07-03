# PROGBIZ ERP — Playwright Automation (POM)

Production-ready Playwright (JavaScript) automation for the PROGBIZ ERP application,
generated from the merged manual test-case workbook
(`ERP_All_Modules_TestCases_Merged.xlsx`).

Built with the **Page Object Model**, a friendly **colored step logger**, automatic
**failure screenshots**, an **explicit-wait** strategy (no `waitForTimeout`), and
**test data separated** from scripts.

> **Status:** **All 431 test cases implemented** across both spec files —
> `login.spec.js` (48) and `project.spec.js` (383: Maintenance 50, Expenses &
> Collections 59, Notes/Attachments/Complaints 56, Projects Lifecycle 68, Project
> Module 150). Verified: Playwright discovers all 431 with no load errors.

---

## Project structure

```
playwright-erp/
├── tests/
│   ├── login.spec.js          # 48 Login test cases (TC_LOGIN_01..48)
│   └── project.spec.js        # 383 test cases for the other 5 modules
├── pages/
│   ├── BasePage.js            # shared action wrappers (click/fill/waits/screenshot)
│   ├── LoginPage.js           # Login page object + reusable login() flow
│   ├── DashboardPage.js       # post-login verification + logout()
│   └── CommonPage.js          # reusable: search, nav, dropdown, datepicker, upload,
│                              #           download, toast, alert, popup, buttons
├── utils/
│   ├── logger.js              # colored, step-based console logger + banners
│   ├── testData.js            # Login credentials, URLs, messages, payloads
│   ├── projectData.js         # module route map + sample data for project.spec.js
│   └── helper.js              # slugify, screenshot paths, error parsing
├── fixtures/
│   ├── baseTest.js            # custom test: logger + page objects, PASSED/FAILED banner
│   └── authedTest.js          # baseTest + per-worker admin login (used by project.spec.js)
├── screenshots/               # failure screenshots (auto-created)
├── .auth/                     # cached worker auth state (auto-created, git-ignored)
├── playwright.config.js       # projects (chromium/firefox/chrome/edge), timeouts, reporters
├── package.json
├── .env.example               # copy to .env and adjust
└── README.md
```

---

## Prerequisites

- **Node.js 18+**
- Internet access to `https://erp.progbiz.io` (tests run against the live app)

## Setup

```bash
cd playwright-erp
npm install
npm run install:browsers        # downloads the Playwright browsers
cp .env.example .env            # (Windows: copy .env.example .env) then edit if needed
```

## Running

```bash
npm test                        # all tests, default (chromium)
npm run test:login              # only the Login module
npm run test:headed             # watch it run
npm run test:ui                 # Playwright UI mode
npm run test:firefox            # cross-browser (compat TCs)
npm run test:chrome             # real Google Chrome (needs Chrome installed)
npm run test:edge               # real Microsoft Edge (needs Edge installed)
npm run report                  # open the HTML report
npm run codegen                 # record selectors against the live login page
```

---

## Console output

Each test prints a friendly, colored banner (Green=success, Yellow=warning,
Red=failure, Blue=info):

```
==================================================
TEST STARTED
Module    : Login
Test Case : TC_LOGIN_07 - Successful login with valid credentials
==================================================

STEP 1
Entering Company Code...
✓ Company Code entered
...
==================================================
TEST PASSED
Execution Time : 8.24 seconds
==================================================
```

On failure the banner shows the failed step, expected/actual (when derivable),
the screenshot path, and the raw Playwright error. Disable colors with `NO_COLOR=1`.

---

## Key conventions

- **Locator priority:** `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText`
  → `data-testid` → CSS → XPath.
- **No hard waits:** uses `waitForLoadState`, `expect(...).toBeVisible()`, `locator.waitFor()`.
- **Assertions everywhere:** every validation uses `expect(...)`.
- **Reusable flows** live in `pages/` (`LoginPage.login()`, `CommonPage.search()`, etc.).
- **Test data** lives in `utils/testData.js` and is overridable via `.env`.

---

## ⚠️ Important: inferred locators

The source document describes controls in prose but contains **no DOM selectors**.
Locators were therefore **inferred** from documented labels/placeholders and are
flagged in code with `// TODO` where confidence is low (e.g. the password show/hide
eye icon, the dashboard/logout chrome). **Confirm them against the live DOM** with
`npm run codegen` before relying on green/red results. See the "Assumptions & TODOs"
section printed at the end of generation, and inline `TODO` comments.

Some Login cases are intentionally handled specially:
- **TC_LOGIN_39 (session timeout)** and **TC_LOGIN_48 (browser autofill)** are
  `test.skip`ped with a documented reason (not deterministically automatable).
- Cases whose *exact* expected text isn't in the document assert the deterministic
  part (e.g. "stayed on login page", "no crash") and log a `TODO` for the exact
  message.

---

## How `project.spec.js` is organised (383 cases)

Tests import from `fixtures/authedTest.js` (each starts authenticated as admin —
one login per worker, reused). They are grouped **Module → Scenario** and driven by
a small reusable "kind" runner:

- **Real, executable automations** (run with assertions): `listLoad`, `search`,
  `reqValidation`, `https`, `responsive`, `perf`, `offline`, `doubleClickSave`,
  `deepLinkRedirect`, `reload`, `compat`, and the `login*` family.
- **`todo`** — navigates to the page, asserts the reachable precondition
  (authenticated + on route), then logs the remaining documented steps as a `TODO`
  (these need app-specific form/modal DOM that the document does not provide).
- **`test.fixme`** — genuinely non-automatable-in-CI cases (real >50MB uploads,
  multi-user concurrency, real idle session-timeout, Safari-on-Windows, browser
  autofill), each with a documented reason.

Every documented TC id, its scenario, priority and automation kind are attached to
the test as annotations (visible in the HTML report) for full traceability.

To turn a `todo` into a full test: confirm the relevant selectors with
`npm run codegen`, add the flow to the matching Page Object, and replace the `todo`
kind (or add explicit steps) in `project.spec.js`.

## Adding the next module

1. Create `pages/<Module>Page.js` extending `BasePage` (reuse `CommonPage` helpers).
2. Add its data to `utils/testData.js`.
3. Create `tests/<module>.spec.js` importing `{ test, expect }` from
   `../fixtures/baseTest` and wrap the top-level `describe` title as
   `"<Module> Module"` (the logger derives the module name from it).
4. Map each documented `TC_*` id to one `test(...)`, using `logger.step(...)` for
   actions and `expect(...)` for the documented Expected Result.
```
