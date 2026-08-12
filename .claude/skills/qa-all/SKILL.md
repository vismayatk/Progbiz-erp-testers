---
name: qa-all
description: Run a full QA regression sweep across the entire Progbiz ERP — CRM, Task Management and HRMS in sequence — then write one combined severity-rated report plus a per-module report. Use this whenever the user asks to QA / test / check / audit the whole app, the entire ERP, all modules, or everything; wants a pre-release or post-build regression sweep; asks "is anything broken", "did the new build break anything", or wants a full issue report across modules — even if they do not say the words "QA" or "skill".
---

# Full-app QA sweep

Run the whole regression: CRM, then Task Management, then HRMS, then combine
the findings into one report a release decision can be made from.

**Read `docs/qa/QA_METHOD.md` first** for safety rules, severity rubric, and
report format.

## Set expectations before you start

This is long. Roughly 110 pages across three modules, two different tenants,
plus hands-on workflow testing. Tell the user up front that it will take a
while and ask whether they want the full sweep or a specific module — if they
only changed CRM, `/qa-crm` gives them an answer far sooner. Do not start a
multi-hour job the user did not realise they were asking for.

## Order, and why

Run in this order:

1. **CRM** (~20 pages, ERP tenant) — the module that changes most often and
   carries the most automated coverage, so drift shows up here first.
2. **Task Management** (~11 pages, same tenant, same session) — cheap to add
   once you are already logged into the ERP host.
3. **HRMS** (80 pages, separate tenant and login) — by far the longest, and the
   only module with a recorded baseline to diff against.

CRM and Task share a login; HRMS needs its own. Running them in this order
means one ERP session covers the first two.

## Execute

Follow each module's own skill rather than reinventing the method — the
module-specific knowledge in them is the point:

- `.claude/skills/qa-crm/SKILL.md`
- `.claude/skills/qa-task/SKILL.md`
- `.claude/skills/qa-hrms/SKILL.md`

Read each, then carry out its sweep and its hands-on workflow checks.

The three prober runs are independent, so start them and let them work:

```bash
node scripts/qa/qa-explore.js --module crm
node scripts/qa/qa-explore.js --module task
node scripts/qa/qa-explore.js --module hrms
```

Run these one at a time against the shared ERP tenant — concurrent admin
sessions on the same tenant can invalidate each other, and a sweep that
poisons its own session produces findings you cannot trust. HRMS is a separate
tenant, so it can safely overlap with the ERP ones if you want the wall-clock
saving.

## Report

Write the per-module reports as each module's skill specifies
(`reports/qa/crm-<date>.md`, `task-<date>.md`, `hrms-<date>.md`), then a
combined `reports/qa/full-sweep-<date>.md`:

```markdown
# Full ERP QA Sweep — <YYYY-MM-DD>

**Modules:** CRM · Task Management · HRMS
**Environments:** <ERP base URL> · <HRMS base URL>
**Pages checked:** <n> · **Issues:** <n> (<c> critical, <h> high, <m> medium, <l> low, <ch> changes)

## Release verdict
<One paragraph. Is this build shippable? If not, name the specific blockers.
This is the section people read; everything else is supporting evidence.>

## Blockers — critical and high, all modules
<Ranked across modules, most severe first. Each links to its per-module report.>

## Cross-module patterns
<The findings that only show up when you look at all three at once: a shared
component broken in several places, an icon-library migration hitting every
module, an auth or session problem that is not module-specific. These are
usually the highest-value findings in a full sweep and they are invisible from
inside any single module.>

## Per-module summary
| Module | Pages | Critical | High | Medium | Low | Changes | Report |
|---|---|---|---|---|---|---|---|

## Automation impact
<Which UI changes break which Playwright specs or page objects. Concrete
file:line references so someone can act without re-deriving the analysis.>
```

Then in chat: the verdict, the blockers, and links. Keep it short — the detail
is in the files.

## A note on honesty

A full sweep is long enough that there is real pressure to declare it done.
Resist that. If HRMS Leave did not get exercised by hand, say so in the
summary rather than letting the page count imply coverage that does not exist.
A report that states its gaps is one someone can build on; one that hides them
gets trusted once and then never again.
