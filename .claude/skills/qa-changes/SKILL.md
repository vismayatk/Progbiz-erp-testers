---
name: qa-changes
description: Find everything that changed on the Progbiz ERP since the last check — new pages and menu entries, new or removed buttons, tabs, fields, columns, dropdown options and Add forms, new or changed Client Settings options and values, and pages that got worse — then check which Playwright tests each change touches, understand and automate the new features, and write a change report. Use this whenever the user says a feature update / new build / new release / deployment happened, asks "what changed", "what's new", "anything new on the site", "did the update break anything", wants new features checked or automated, or wants the regular after-update check — even if they do not say "QA", "diff" or "skill".
---

# Check what changed after an ERP feature update

The ERP gets new features often, and each update can add pages, fields and
Client Settings options, or quietly move things the Playwright suite depends
on. This skill answers four questions after every update:

1. **What changed?** Every difference since the last check, down to a single
   button, column, dropdown option or setting.
2. **Is anything worse?** New errors, failed calls, pages that stopped opening.
3. **What does it break?** Which tests click, read or open the thing that changed.
4. **What is new, and is it automated?** New features understood, questions
   asked, tests written.

**Read `docs/qa/QA_METHOD.md` first** for the safety rules, severity rubric and
report format. This skill covers the ERP; for HRMS use `/qa-hrms`.

## 0. Before you start

Check the target without printing passwords:

```bash
grep -E '^(BASE_URL|COMPANY_CODE|CRM_USERNAME)=' .env
```

It must be `https://test.erp.progbiz.in`, tenant `onetouch_test`: all ERP
testing runs there. If it points anywhere else, stop and ask.

Make sure nothing else is running against the tenant. Two admin sessions at
once cause HTTP 429s and logouts, and the snapshot is then worthless:

```bash
pgrep -fl "playwright test|scripts/qa"
```

**Client Settings rule.** On `onetouch_test` only, a test may change a setting
to check its effect. It must restore the setting immediately afterwards, in a
`finally`, so a failure still restores it. Never change these without asking
the user first:

- **AI Call Analysis**: it spends AI wallet tokens.
- **Monitoring Agent**: it drives the desktop agent on real users' machines.

On any other tenant, never change settings.

## 1. Take a snapshot (read-only, about 7 minutes)

```bash
node scripts/qa/site_audit.js
```

Run it in the background. It logs in as the `.env` user and does the following:

1. Reads the live sidebar and the **Create New** menu.
2. Visits every page. It also re-visits pages that were in the previous
   snapshot's menu, so a removed entry shows up as "hidden but still opens" or
   as "gone".
3. Records each page's heading, tabs, buttons, fields (label, type, required,
   options, default), table columns, console errors, failed API calls and load
   time.
4. Opens the first Add / New / Create form, reads it and closes it. It never
   saves.
5. Reads every Client Settings option in every section, with its current value.

The output goes to `reports/qa/raw/site-audit-<company>-<YYYY-MM-DDTHH-MM>.json`.
If the run is stopped part-way, the snapshot is marked partial and the diff
ignores it.

## 2. Diff it against the last check

```bash
node scripts/qa/site_diff.js
```

This compares the newest complete snapshot with the one before it. It writes
`reports/qa/raw/site-diff-<company>-<stamp>.md` (plus `.json`) with these
sections:

1. **Problems**: pages that got worse.
2. **Changes that touch existing tests**, each with the `file:line` that
   references it.
3. **New features**: new pages in full (fields, buttons, columns, Add form)
   and whether any test opens them, plus new elements on existing pages.
4. **Client Settings**: new options, removed options, and values that changed.
5. **Removed or renamed** items that no test uses.
6. **Minor**: dropdown options, defaults, speed.
7. **Fixed since last check**.

Useful variants:

- `--list` shows the snapshots.
- `--base <file>` compares against an older snapshot, e.g. the one taken
  before the last release.
- `--strict` exits 2 when a page got worse.

If it says there is only one snapshot, that snapshot is now the baseline. In
that case report the current state the way the first whole-site audit did
(`reports/qa/site-audit-onetouch_test-2026-10-13.md`). The next run will have
something to diff against.

**What the diff deliberately ignores:** counts, row data, dates, text-field
values and page numbers. These change every day and are not features.

**What it cannot see:**

- Behaviour behind a Save.
- Detail pages reached by clicking a row, and second-level modals.
- Pages that are neither in the menu nor in an earlier snapshot.
- Anything only a non-admin user sees.

Step 3 covers these by hand. Mention them as gaps if you didn't check them.

## 3. Triage, section by section

Treat the diff as a list of leads, not findings.

**Problems.** Reproduce each one by hand, twice. Use a small read-only script in
the scratchpad or the browser pane. Capture the console text, the failing URL
and status, and a screenshot. A real problem becomes an issue `ERP-<n>` with a
severity from QA_METHOD. If it doesn't reproduce, say "seen once" and don't
inflate it.

**Touches existing tests.** Run only the referenced spec files, one at a time:

```bash
npx playwright test erp/crm/tests/<file>.spec.js --retries=0
```

- **If the change is intended** (a renamed button, a moved field), update the
  page object or selector and keep what the test asserts. Never delete an
  assertion just to make a test pass.
- **If it looks unintended** (a column vanished, a required field lost its
  rule), report it and ask the user before changing the test.

**New features.** For each new page, form, button or field:

1. Open it and read it.
2. Try its validation without saving.
3. Work out what it is for.

Some things can't be seen from the UI. Write them down as questions and ask the
user with AskUserQuestion, up to 4 per call, before you automate rules you'd
otherwise be guessing. For example:

- Who should see the feature?
- What should Save do?
- Which Client Setting controls it?
- What other page shows its result?

**Client Settings.**

- **New option.** Find the pages it affects: its label usually names the field
  or page. Confirm the effect on `onetouch_test` with change → check → restore.
  Add it to the settings matrix in the report.
- **Existing option.** `erp/master/tests/client_settings_effects.spec.js`
  already checks 14 of them (what each shows or hides on `/enquiry`,
  `/quotation`, the sidebar and `/leads`). It uses
  `erp/master/pages/ClientSettingsPage.js`, whose `withSettings(values, check)`
  does the change → check → restore. To cover a new option, add one line to
  `FIELD_EFFECTS` (switch id, form, field selector) and one id to
  `KNOWN_OPTIONS`. If the option needs a saved record to show its effect,
  write a separate test and use `QA_` data.
- **Run the whole file after any Client Settings change** (about 7 minutes,
  one worker): `npx playwright test erp/master/tests/client_settings_effects.spec.js`.
  CSE-01 fails with the list of options that were removed or renamed, and
  CSE-99 fails if any test left a setting changed.
- **Changed value.** Someone changed the tenant. Tests that depend on the old
  value will behave differently. Known links:

  | Setting | Affected tests / pages |
  |---|---|
  | Need Lead Quality | ENQ-09 |
  | Need Business Value | Business Value checks |
  | Repeat Business | NP-03, NP-04 (B2B Dashboard, Repeat Accounts menu) |
  | AI Call Analysis | NM-03 |
  | Default Task On Enquiry | Task count checks |

  Ask the user whether the new value is intended before adapting tests to it.
  Not covered yet, because they need a saved record or a second user: Default
  Task On Enquiry, Quotation "Need Place" (its field isn't on the Quotation
  form for this tenant), the Require ... options blocking Save, First Response
  SLA, Search Only My Own Customers.

**Removed or renamed.** Confirm it in the UI. A menu entry that "still opens by
URL" is usually hidden by a Client Setting or a permission, not deleted. Say
which.

**Fixed.** Re-run the matching known-defect test (QT-F1, CH-F1, ST-06, NM-05,
NP-12). If it now passes, remove its `test.fail()` marker; Playwright fails
an expected failure that passes. Then mark the issue fixed in the report.

## 4. Automate the new features

**Page manifest (covers every page that has no hand-written test).**
`erp/common/fixtures/pages.<company>.json` lists, for each of those pages, its
heading, tabs, table columns, buttons, filter controls and Add-form fields.
`erp/common/pageSuite.js` checks every page against it, and the thin specs that
call it are:

| Spec | Pages |
|---|---|
| `erp/master/tests/master_pages.spec.js` | Master, Users, Customisation, Automation, Excel Upload, Top |
| `erp/crm/tests/crm_dashboards_extra.spec.js` | Executive Performance, Lead Forecast, Task Dashboard |
| `erp/task-management/tests/task_extra_pages.spec.js` | Calendar, To Do, Timeline, Daily Activity, Predefined Tasks |
| `erp/project-management/tests/project_pages.spec.js` | Projects, Work Flow |
| `erp/whatsapp/tests/whatsapp_pages.spec.js` | WhatsApp |

After the diff, bring the manifest up to date:

```bash
node scripts/qa/make_page_manifest.js      # adds new uncovered pages, refreshes the others, keeps hand-written keys
```

Read the manifest diff (`git diff erp/common/fixtures`). Each line that changed
is a change the page really made. If it is intended, keep it. If it is not,
report it and ask before changing the manifest. A new page needs no new test
code: regenerating the manifest adds its PAGE and FORM tests. Then run the
suites for the groups that changed.

Beyond structure, these specs cover behaviour (see `docs/qa/ERP_AUTOMATION_COVERAGE.md`
for the full table, the run commands and what is deliberately not automated):

| Spec | What it does |
|---|---|
| `erp/master/tests/master_crud.spec.js` | create → edit → delete of a `QA_` record on 9 masters, plus validation; `MasterListPage` holds the per-master config, so a new simple master is one entry in `MASTERS` |
| `erp/master/tests/master_customers.spec.js` | Customers (one fixed `QA_Customer_Fixture`, since customers cannot be deleted) and Custom Report validation |
| `erp/master/tests/uploads.spec.js` | the five Excel upload pages; never imports real data |
| `erp/master/tests/script_errors.spec.js` | tracked front-end errors as expected failures |

When a diff shows a changed form, button or confirmation wording on one of these
pages, update the page object or the config entry, not the assertion.
After any run that creates data, check for leftovers:

```bash
node scripts/qa/find_qa_leftovers.js     # read-only: lists QA_ records on the tenant
```

A page with a tracked defect gets a `known` entry (id, console regex, reason),
which becomes its own expected-fail test, such as ERP-001 for `/chat`.

Work in the order the user agreed on 13 Oct 2026:

1. Client Settings effects
2. Uncovered CRM / Master pages
3. WhatsApp, Projects, Uploads

New features join that queue where they belong, unless the user says otherwise.

Rules for every new or changed test:

- Specs go in `erp/<module>/tests/*.spec.js` (the config only matches
  `**/tests/**/*.spec.js`). Page objects go in `erp/<module>/pages/`.
- Tenant data comes from `erp/common/tenantData.js` (`tenant()`). Never
  hard-code executives, items, statuses or branches. When you add a field to a
  profile, add it to every profile.
- Create only `QA_<timestamp>` records. Only edit or delete what the test
  created. Never transfer, approve or delete real leads, tasks or customers.
- A record that cannot be deleted from the UI (customers, enquiries) must not be
  created once per run. Use one fixed fixture (`QA_Customer_Fixture`), created
  when missing and reused.
- Cleanup goes in `finally`, and a last test fails if anything is left behind
  (`MC-99`). Wording changes in confirmation dialogs ("delete" vs "remove") break
  cleanup silently, so match both.
- Searches in this app run on Enter, not as you type. Press Enter after filling a
  search box, and use the page's own box, never the sidebar's "Search menu".
- A real product defect gets `test.fail(...)` plus its issue ID and a comment
  saying what is wrong. It doesn't get a weakened assertion.
- A settings test changes → checks → restores in `finally`.
- Run every new spec twice with `--retries=0` before calling it stable.
- The tenant throttles bursts with a "Too many requests" dialog. Log in once
  per spec file (`beforeAll` with a shared page), not once per test, and use
  `dismissRateLimit` from `erp/common/helpers.js` after page loads that follow
  many saves.
- Don't commit or push unless the user asks.

## 5. Report

Write `reports/qa/changes-<company>-<YYYY-MM-DD>.md` using the QA_METHOD
template, with these additions:

- **What's new**, at the top: one plain line per new feature, written for
  someone who hasn't seen the update.
- **Changes vs last check**: the verified diff, each change linked to the
  `file:line` it affects.
- **Client Settings**: new options and changed values, with the pages each
  affects.
- **Automation**: tests updated, tests added (with pass results), and features
  still without tests.
- **Questions for the product team**: anything still unanswered.

In chat, give the short version: what's new, what got worse, what broke in the
suite, what you automated, and the open questions. Link the report and don't
paste it.

## Housekeeping

- Each complete snapshot becomes the next baseline automatically. To compare
  across a whole release, note the pre-release snapshot's name and pass it with
  `--base`.
- Snapshots and diffs live in `reports/`, which is git-ignored. They contain
  tenant data (names in dropdowns, first table rows), so don't commit them or
  paste them anywhere public.
- For a regular check, the snapshot and diff can run on a schedule. `--strict`
  makes the diff's exit code report a page that got worse.
