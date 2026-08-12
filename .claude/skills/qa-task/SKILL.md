---
name: qa-task
description: Act as a QA tester for the Progbiz ERP Task Management module — log into the live app, walk every task page (My Tasks, Delegated, Created, Unscheduled, To-Do, Daily Activity Report, Task Dashboard, Calendar, Task Timeline), exercise task creation and the task-details actions, find bugs, and write a severity-rated issue report. Use this whenever the user asks to QA / test / check / audit / sweep task management, asks "are there bugs in tasks", wants a task module issue report, or mentions testing task assignment, delegation, task scheduling, to-do lists or the task timeline — even if they do not say the words "QA" or "skill".
---

# QA the Task Management module

You are testing Task Management as a QA engineer would: open the real app, use
it, find what is broken, and write it up so a developer can act on it.

**Read `docs/qa/QA_METHOD.md` first** for the safety rules, severity rubric,
and report format. Everything below is Task-Management-specific.

## 1. Read this before you click anything

Task Management has the repo's worst data-safety problem, and you must not
repeat it. The existing specs TM-24..28
(`erp/task-management/tests/task_management_details.spec.js`) operate on a
**pre-existing tenant task** rather than one they create: TM-25 permanently
renames a real task and TM-28 ends a real running task. Each run consumes the
next run's fixture.

So when you test task-details actions — edit, reschedule, add note, attach
document, start/end — **create your own task first** (`QA_<timestamp>`) and
operate on that. Never edit or end a task you did not create. Someone is using
those.

Also note `TaskManagementPage.js:573-630` click-storms every control in a row
until a modal appears. Do not imitate that pattern by hand; on real data it can
trigger a destructive action.

## 2. Orient

Confirm `.env` points at a test tenant, then read
`docs/TASK_MANAGEMENT_COVERAGE.md` for what is already automated (31 tests
across 4 specs) and where the gaps are.

One known environment landmine: `TaskManagementPage.js:52` and `:64` select the
branch by the literal string **"Kannur"**, wrapped in `.catch(() => {})`. On any
tenant without that branch, task creation silently proceeds with no branch set.
If task creation behaves oddly, check that first.

## 3. Sweep

```bash
node scripts/qa/qa-explore.js --module task
```

About 11 pages. Read `reports/qa/raw/task-<timestamp>.json` for the detail.

Four of these routes no longer appear in the sidebar but still respond with
HTTP 200: `/task`, `/created-tasks`, `/unscheduled-tasks`, and (in the sibling
Project module) `/projects`. Unlinked but reachable is worth reporting as a
**Change** — either the nav lost an entry it should have, or these are
deprecated routes the suite should stop targeting. Both are useful to know; do
not assume which.

## 4. Exercise the workflows by hand

- **Create a task** via the Create New → Task modal. Check required-field
  validation, the branch/party selectors, and that the created task appears in
  My Tasks without a manual refresh.
- **Delegate a task** and confirm it shows under Delegated for the assigner and
  My Tasks for the assignee. Multi-user visibility is only covered by three
  env-gated tests (MU-01..03) that usually skip, so this is effectively
  untested — a good place to look.
- **Task details** on a task you created: notes, attachments, reschedule, edit,
  and the start/end lifecycle. Check that reschedule updates the date
  everywhere it is displayed, not just on the details pane.
- **Task Dashboard** (`/task-dashboard`) and **Task Timeline**
  (`/redirect/task-timeline`) — newer, no automated coverage. Check the counts
  on the dashboard actually match the underlying listings; mismatched
  aggregates are a classic and high-value find.
- **Daily Activity Report** (`/daily-activity-report`) — verify a row against
  the tasks it summarises.

## 5. Known weak assertions — treat these pages as uncovered

The audit found several Task tests that cannot fail, so a green suite says
nothing about them:

- **TM-21** counts raw `tbody tr`, which a "No records found" placeholder row
  satisfies. TM-08 was fixed to use `dataRowCount()`; TM-21 never was.
- **TM-07 and TM-19 are byte-identical** apart from the screenshot name.
- **TM-09** picks the active mode tab by ranking CSS background-colour
  *blueness* — it silently returns the wrong tab when the theme changes.
- Validation oracles across the module are full-DOM text scrapes matched
  against English copy regexes, and they **fail open**: no match reads as
  success. TM-02/04/05/06/10/11/12/13/14 and MU-01..03 all decide pass/fail
  this way.

Test these areas by hand and report what you find on their merits — do not let
the suite's green tick stand in for evidence.

## 6. Report

Write `reports/qa/task-<YYYY-MM-DD>.md` using the template in
`docs/qa/QA_METHOD.md`. Number issues `TASK-001`, `TASK-002`, …

List any `QA_*` tasks you created under *Test data created* so they can be
cleaned up. Then give the user the short version in chat: pages checked, issues
found, and the two or three worth acting on.
