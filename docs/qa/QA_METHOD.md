# QA exploration method

Shared reference for the `/qa-crm`, `/qa-hrms`, `/qa-task` and `/qa-all` skills.
Read this once per QA run before touching the app.

---

## 1. Safety rules — read before clicking anything

These runs use a real admin session on a shared tenant. Other people's test
data lives there, and the suite's own fixtures depend on it. A QA sweep that
mutates the tenant destroys the next sweep's baseline, so the constraint is
not bureaucratic — it is what keeps repeat runs comparable.

**Never:**
- Click Delete, Remove, Deactivate, or Archive on any record.
- Click Save, Submit, Update, or Approve on a record you did not create.
- Change tenant settings, user permissions, roles, or passwords.
- Run against production. The prober allow-lists hosts whose **first DNS label**
  carries a non-production marker — `dev.erp…`, `test.erp…`, `devtest…`,
  `qa-…`, `staging-…`, `localhost`. Everything else is refused, including
  `erp.progbiz.io` and `erp.progbiz.in`.

  A host that is genuinely safe but unmarked must be opted into explicitly:

  ```bash
  QA_ALLOW_HOSTS=hrms-erp.progbiz.in node scripts/qa/qa-explore.js --module hrms
  ```

  `hrms-erp.progbiz.in` is blocked by default deliberately: it holds real
  employee records. Opt in only when you mean to, and never add a production
  host to that variable.

**Safe, and encouraged:**
- Navigate to any page.
- Open filter panels, modals, dropdowns, and tabs — then close them.
- Sort columns, page through listings, use search boxes.
- Type into a form to check validation, **as long as you never submit it**.

**If you must create a record** to test a flow end to end, name it with the
prefix `QA_` plus a timestamp (`QA_1785851441268`) so it is obviously
machine-made, and record it in the report's *Test data created* section so a
human can clean it up. Prefer not creating anything.

---

## 2. What actually counts as an issue

The prober reports signals; you decide which are defects. The distinction that
matters most: **is this the app misbehaving, or is this the tenant being
empty?** A listing with zero rows on a fresh tenant is not a bug. The same
listing throwing a 500 is.

Judge each signal in context rather than reporting it mechanically:

| Signal | Usually a real bug | Usually *not* |
|---|---|---|
| HTTP 4xx/5xx on navigation | Yes — page is broken | 404 on a route that was intentionally retired |
| Bounced to `/login` | Yes — session or permission bug | Whole run bounced → your login expired, not a bug |
| "Oops" / "Error Code" / stack trace on screen | Yes | — |
| Stuck on "Loading…" after 3s | Yes — usually a failed backend call | Genuinely slow tenant; re-check before filing |
| JS console error | Often — read the message | Third-party/analytics noise, theme switcher chatter |
| Failed network request (4xx/5xx) | Yes if it's an app API | Favicon, fonts, tracking pixels |
| Table column added/removed vs baseline | Yes — report as a **change**, not a failure | — |
| Broken image (`naturalWidth === 0`) | Usually — a missing asset | Avatars where the user has no photo |
| Zero rows in a listing | Only if the tenant is seeded | Empty tenant |
| Misspelled label | Yes, cosmetic severity | Already recorded in the manifest's `quirk` field |

Some pages carry a `quirk` note in `hrms/fixtures/page-manifest.js` — a known
build bug recorded during the original crawl (e.g. the header misspelled
"Add Vist Report"). Do not re-file those as new. Mention them once under
*Known quirks confirmed still present* so the reader knows they were checked.

**Then go beyond the prober.** It catches structural breakage. It cannot
notice that a Save button is present but does nothing, that a date picker
allows a follow-up in the past, or that a required field accepts blank input.
Spend your judgement there — open the two or three most important pages in the
module and actually exercise them the way a user would. That is where the
findings the automation can't reach come from.

---

## 3. Severity

Rate by user impact, not by how hard it was to find.

- **Critical** — data loss, a save that silently fails, a page that no user can
  load, wrong data shown to the wrong user. Blocks release.
- **High** — a core workflow is broken with no workaround (cannot create an
  enquiry; cannot approve leave).
- **Medium** — a workflow is broken but has a workaround, or a secondary
  feature fails (filter returns wrong rows; export throws).
- **Low** — cosmetic. Misspelling, misalignment, inconsistent date format.
- **Change** — not a defect. The app differs from the recorded baseline
  (new column, renamed button). These are what break automation, so they
  matter even though nothing is "wrong".

Be honest about confidence. If you could not reproduce something twice, say so
rather than inflating the count — a report padded with unreproducible findings
gets ignored, which costs more than the missing finding would have.

---

## 4. Report format

Write to `reports/qa/<module>-<YYYY-MM-DD>.md`. Use this structure:

```markdown
# QA Report — <Module> · <YYYY-MM-DD>

**Environment:** <base URL> · tenant `<company code>` · user `<username>`
**Pages checked:** <n> · **Issues found:** <n> (<critical> critical, <high> high, …)
**Run by:** /qa-<module>

## Summary
<Three or four sentences. What is the overall health of this module? What is
the single most important thing for the reader to act on? If nothing is
broken, say that plainly — a clean report is a useful result.>

## Issues

### <ID> · <one-line title>
- **Severity:** Critical | High | Medium | Low | Change
- **Page:** `/route` — <page name>
- **Steps to reproduce:**
  1. …
  2. …
- **Expected:** <what should happen>
- **Actual:** <what happened>
- **Evidence:** `reports/qa/shots/<module>/<route>.png`, console error text,
  failing request URL + status — whatever proves it
- **Confidence:** Confirmed (reproduced twice) | Probable (seen once)

## Changes vs baseline
<Table of drift: page, what changed, which automated test it affects.
This section is what keeps the Playwright suite honest — link each change to
the spec or page object that will break because of it.>

## Known quirks confirmed still present
<Short list, from the manifest `quirk` fields. Confirms they were checked.>

## Pages checked, no issues
<Compact list. Proves coverage — an absent page here means it was not tested.>

## Test data created
<Any QA_* records left behind, so someone can clean them up. "None" is the
preferred answer.>
```

Number issues `<MODULE>-001`, `<MODULE>-002` (e.g. `CRM-001`, `HRMS-014`) so
they can be referenced in conversation and in tickets.

---

## 5. Working method

1. **Run the prober first.** `node scripts/qa/qa-explore.js --module <m>`.
   It takes a few minutes and gives you the structural picture, so you spend
   your attention on judgement rather than on clicking through 80 pages.
2. **Read the raw JSON** it writes to `reports/qa/raw/`. Sort pages by how
   suspicious they look.
3. **Open the worst offenders yourself** and confirm before filing. A finding
   you have not reproduced is a rumour.
4. **Exercise the module's main workflow** by hand — the thing users do all day
   (create an enquiry, approve a leave request, assign a task). Structural
   probes never catch a broken business rule.
5. **Diff against the baseline** and note every change, even harmless-looking
   ones. Renamed buttons and reordered columns are exactly what silently break
   the Playwright suite.
6. **Write the report**, then tell the user the two or three things that
   actually matter. Do not make them read the whole file to find the fire.

## 6. Where the page knowledge lives

Read these before exploring a module — they tell you what each page is *for*,
which is what turns "this button does nothing" from a guess into a finding.

| Module | Source | What it gives you |
|---|---|---|
| HRMS | `hrms/fixtures/page-manifest.js` | 80 pages: route, title, buttons, columns, known quirks |
| HRMS | `hrms/data/pages/*.json` | Fuller per-page crawl: cards, tabs, empty states, body snippet |
| HRMS | `hrms/docs/0*.md` | Narrative docs per area (core HR, recruitment, attendance, leave, ESS) |
| CRM | `docs/CRM_MODULE_DOCUMENTATION.md` | Nav map, routes, global UI conventions, known slow spots |
| CRM | `docs/CRM_TESTCASE_COVERAGE.md` | Which scenarios are automated and which are not |
| Task | `docs/TASK_MANAGEMENT_COVERAGE.md` | Task Management scenario coverage |
| All | `scripts/discovery_report.json` | Live crawl of all 128 routes, grouped by nav section |
