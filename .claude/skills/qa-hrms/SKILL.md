---
name: qa-hrms
description: Act as a QA tester for the Progbiz HRMS — log into the live HRMS tenant, walk all 80 pages across Core HR, Recruitment, Attendance, Leave and ESS, exercise the controls, find bugs, and write a severity-rated issue report. Use this whenever the user asks to QA / test / check / audit / sweep HRMS, asks "are there bugs in HRMS", wants an HRMS issue report, wants to know if HRMS still works after a build, or mentions testing employees, payroll, attendance, leave, recruitment, appraisals or employee self-service — even if they do not say the words "QA" or "skill".
---

# QA the HRMS module

You are testing the Progbiz HRMS as a QA engineer would: open the real app,
use it, find what is broken, and write it up so a developer can act on it.

**Read `docs/qa/QA_METHOD.md` first** for the safety rules, severity rubric,
and report format. Everything below is HRMS-specific.

## 1. Orient — HRMS is a separate tenant

This is the trap. HRMS does **not** run on the ERP host. It has its own base
URL (`HRMS_BASE_URL`, default `https://hrms-erp.progbiz.in`), its own login
page object (`hrms/pages/HrmsLoginPage.js`), and its own Playwright config.
Pointing HRMS work at `devtest.progbiz.in` fails in confusing ways.

HRMS is also the best-organised part of this repo — every test navigates
independently and shares session state through `hrms/.auth/state.json` rather
than through leftover records. Preserve that when you test: do not create
dependencies between pages.

## 2. You already have a baseline — use it

`hrms/fixtures/page-manifest.js` records all 80 pages from a real crawl: route,
group, title, buttons, table columns, and a `quirk` field noting known build
bugs. `hrms/data/pages/*.json` has the fuller capture (cards, tabs, empty
states). `hrms/docs/0*.md` explains what each area is for.

This makes HRMS the one module where you can detect **change** precisely: the
prober diffs live columns and buttons against the manifest and reports what
moved. That diff is usually the most valuable part of an HRMS report, because
80 pages of drift is what quietly breaks 236 tests.

Known quirks are already recorded — the misspelled "Add Vist Report" header,
for instance. Do not re-file those. Confirm they are still present and list
them once under *Known quirks confirmed still present*.

## 3. Sweep

```bash
QA_ALLOW_HOSTS=hrms-erp.progbiz.in node scripts/qa/qa-explore.js --module hrms
```

The prober blocks `hrms-erp.progbiz.in` by default — it holds real employee
records, so it is not treated as a throwaway environment. The opt-in above is
deliberate; do not add it to `.env` where it would apply silently to every run.

All 80 pages; this takes a while. To work one area at a time:

```bash
node scripts/qa/qa-explore.js --module hrms --group leave
```

Groups are `core-hr` (18), `leave` (21), `attendance` (15), `recruitment` (15),
`ess` (11). Working group by group gives the user something to read sooner and
keeps each report focused.

Read the raw JSON in `reports/qa/raw/`, paying particular attention to the
`drift` block on each page — `columnsRemoved`, `buttonsMissing` and a failed
`titleMatches` are the signals that matter most here.

## 4. Exercise the workflows by hand

Structural probes cannot catch a wrong business rule, and HRMS is full of
rules. Drive at least one full flow per group:

- **Leave** — apply for leave, check the balance calculation, check that
  approval moves the request through its states. Look hard at boundary cases:
  leave spanning a weekend or holiday, a request longer than the balance, a
  backdated request. Balance arithmetic is where HRMS bugs hide.
- **Attendance** — check that worked hours, overtime and balance hours add up
  on `/attendance-log`. The columns are computed; verify a row by hand.
- **Core HR** — open an employee, check required-field validation on edit.
- **Recruitment** — walk a candidate through the status pipeline.
- **ESS** — `/ess/profile` and the self-service pages. These render per-user
  data, so check that the logged-in user only sees their own.

Two structural cautions from the audit, worth verifying rather than trusting:
`BasePage.grid` binds to the *first* table on the page, so any two-table page
(`/ess/leave`, `/salary-revisions`, `/leave-encashment`,
`/attendance-finalization`) may be asserting against the wrong grid. And 63
assertions in the HRMS specs are `expect(rowCount).toBeGreaterThanOrEqual(0)`,
which can never fail — those pages are effectively untested no matter what the
suite reports. Treat them as uncovered.

## 5. Report

Write `reports/qa/hrms-<YYYY-MM-DD>.md` using the template in
`docs/qa/QA_METHOD.md`. Number issues `HRMS-001`, `HRMS-002`, …

If you swept a single group, name it in the title (`hrms-leave-<date>.md`) and
say in the summary which groups were **not** covered. An HRMS report that
looks complete but only covered Leave is worse than one that admits its scope.

Then give the user the short version in chat: pages checked, issues found, and
the two or three worth acting on.
