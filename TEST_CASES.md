# CRM Test Cases — IDs & Run Commands

> **Auto-generated** by `scripts/gen-testcases.js` from the Playwright test titles.
> Do not edit by hand — it regenerates before every `npm test` (the `pretest` hook), or run `npm run docs`.
> Last generated: 2026-06-26T16:21:34.741Z · 43 test cases in 4 spec file(s).

Run all (headless): `npm test` · Run all (visible browser): `npm run test:headed` · Interactive: `npx playwright test --ui`

| Test Case ID | Description | Headless command | Headed (browser) command |
|---|---|---|---|
| TC-01 | Login with valid credentials | `npx playwright test -g "TC-01 \|"` | `npx playwright test --headed -g "TC-01 \|"` |
| TC-02 | Create a new enquiry with valid data | `npx playwright test -g "TC-02 \|"` | `npx playwright test --headed -g "TC-02 \|"` |
| TC-02B | Create enquiry for an existing customer (search & choose) | `npx playwright test -g "TC-02B \|"` | `npx playwright test --headed -g "TC-02B \|"` |
| TC-03 | Open the created enquiry from the list | `npx playwright test -g "TC-03 \|"` | `npx playwright test --headed -g "TC-03 \|"` |
| TC-04 | Add a follow-up to the enquiry | `npx playwright test -g "TC-04 \|"` | `npx playwright test --headed -g "TC-04 \|"` |
| TC-05 | Verify follow-up is visible in the follow-up listing | `npx playwright test -g "TC-05 \|"` | `npx playwright test --headed -g "TC-05 \|"` |
| TC-06 | Convert enquiry to quotation | `npx playwright test -g "TC-06 \|"` | `npx playwright test --headed -g "TC-06 \|"` |
| TC-07 | Verify quotation appears in quotation listing | `npx playwright test -g "TC-07 \|"` | `npx playwright test --headed -g "TC-07 \|"` |
| TC-08 | Update enquiry status to "In Follow-up" | `npx playwright test -g "TC-08 \|"` | `npx playwright test --headed -g "TC-08 \|"` |
| TC-09 | Update enquiry status to "Won" | `npx playwright test -g "TC-09 \|"` | `npx playwright test --headed -g "TC-09 \|"` |
| TC-10 | Update enquiry status to "Lost" | `npx playwright test -g "TC-10 \|"` | `npx playwright test --headed -g "TC-10 \|"` |
| TC-11 | Verify records are visible in enquiry listing | `npx playwright test -g "TC-11 \|"` | `npx playwright test --headed -g "TC-11 \|"` |
| TC-12 | Lead Transfer — transfer a lead to an executive and verify the new assignee | `npx playwright test -g "TC-12 \|"` | `npx playwright test --headed -g "TC-12 \|"` |
| TC-13 | Lead Sources (Settings) — create a lead source and verify it lists | `npx playwright test -g "TC-13 \|"` | `npx playwright test --headed -g "TC-13 \|"` |
| TC-14 | Lead Status (Settings) — create a followup status with a Nature | `npx playwright test -g "TC-14 \|"` | `npx playwright test --headed -g "TC-14 \|"` |
| TC-15 | Item Categories — create a category and verify duplicates are rejected | `npx playwright test -g "TC-15 \|"` | `npx playwright test --headed -g "TC-15 \|"` |
| TC-16 | Items — create a Product, verify duplicates are rejected, then delete | `npx playwright test -g "TC-16 \|"` | `npx playwright test --headed -g "TC-16 \|"` |
| TM-01 | My Tasks page loads with status tabs | `npx playwright test -g "TM-01 \|"` | `npx playwright test --headed -g "TM-01 \|"` |
| TM-02 | Create a task and verify it is listed | `npx playwright test -g "TM-02 \|"` | `npx playwright test --headed -g "TM-02 \|"` |
| TM-03 | All Task-Management pages are reachable | `npx playwright test -g "TM-03 \|"` | `npx playwright test --headed -g "TM-03 \|"` |
| TM-04 | Create a scheduled task (Task for Later) | `npx playwright test -g "TM-04 \|"` | `npx playwright test --headed -g "TM-04 \|"` |
| TM-05 | Creating a task without Task Type is rejected | `npx playwright test -g "TM-05 \|"` | `npx playwright test --headed -g "TM-05 \|"` |
| TM-06 | Create task (Online Meeting, High priority) | `npx playwright test -g "TM-06 \|"` | `npx playwright test --headed -g "TM-06 \|"` |
| TM-07 | My Tasks status tabs are navigable | `npx playwright test -g "TM-07 \|"` | `npx playwright test --headed -g "TM-07 \|"` |
| TM-08 | Daily Activity Report loads with data | `npx playwright test -g "TM-08 \|"` | `npx playwright test --headed -g "TM-08 \|"` |
| TM-09 | Create New menu + Add Task modal structure | `npx playwright test -g "TM-09 \|"` | `npx playwright test --headed -g "TM-09 \|"` |
| TM-10 | Create an Instant Task via the modal (Scenario 1) | `npx playwright test -g "TM-10 \|"` | `npx playwright test --headed -g "TM-10 \|"` |
| TM-11 | Create a Task for Later — Hosts + scheduling (Scenario 2) | `npx playwright test -g "TM-11 \|"` | `npx playwright test --headed -g "TM-11 \|"` |
| TM-12 | Repeat mode exposes recurring schedule fields | `npx playwright test -g "TM-12 \|"` | `npx playwright test --headed -g "TM-12 \|"` |
| TM-13 | Negative — Save without Task Type is rejected | `npx playwright test -g "TM-13 \|"` | `npx playwright test --headed -g "TM-13 \|"` |
| TM-14 | Negative — Save without Task title is rejected | `npx playwright test -g "TM-14 \|"` | `npx playwright test --headed -g "TM-14 \|"` |
| TM-15 | My Task page columns (TC_054-055) | `npx playwright test -g "TM-15 \|"` | `npx playwright test --headed -g "TM-15 \|"` |
| TM-16 | Created Task page loads with actions (TC_048-053) | `npx playwright test -g "TM-16 \|"` | `npx playwright test --headed -g "TM-16 \|"` |
| TM-17 | Delegated Tasks shows Assignees column | `npx playwright test -g "TM-17 \|"` | `npx playwright test --headed -g "TM-17 \|"` |
| TM-18 | Unscheduled Task page + row actions (TC_062-068, Scenario 11) | `npx playwright test -g "TM-18 \|"` | `npx playwright test --headed -g "TM-18 \|"` |
| TM-19 | Status tabs Pending/Overdue/Completed navigable (TC_057-059) | `npx playwright test -g "TM-19 \|"` | `npx playwright test --headed -g "TM-19 \|"` |
| TM-20 | Task lifecycle controls on dashboard (Scenario 4) | `npx playwright test -g "TM-20 \|"` | `npx playwright test --headed -g "TM-20 \|"` |
| TM-21 | Daily Activity Report (TC_069-072, Scenario 12) | `npx playwright test -g "TM-21 \|"` | `npx playwright test --headed -g "TM-21 \|"` |
| TM-22 | Calendar & Timeline reachable (Scenario 6 — single user) | `npx playwright test -g "TM-22 \|"` | `npx playwright test --headed -g "TM-22 \|"` |
| TM-23 | Multi-user participant/admin visibility (TC_018-024, Scenarios 5 & 6) | `npx playwright test -g "TM-23 \|"` | `npx playwright test --headed -g "TM-23 \|"` |
| MU-01 | Host-assigned Task-for-Later is visible to the assignee (Scenario 10) | `npx playwright test -g "MU-01 \|"` | `npx playwright test --headed -g "MU-01 \|"` |
| MU-02 | Participant on an Instant task sees it (Scenario 5) | `npx playwright test -g "MU-02 \|"` | `npx playwright test --headed -g "MU-02 \|"` |
| MU-03 | Admin sees the assigned task in Calendar & Timeline (Scenario 6) | `npx playwright test -g "MU-03 \|"` | `npx playwright test --headed -g "MU-03 \|"` |

**Tips**
- Run several at once: `npx playwright test -g "TC-13|TC-14|TC-15|TC-16"`.
- Watch with slow-mo: prefix `HEADED=1` (PowerShell: `$env:HEADED=1; ...`).
- Use installed Chrome: prefix `CHANNEL=chrome` (PowerShell: `$env:CHANNEL="chrome"; ...`).
- Run from the project root (`erp-tests`), not `git_max`.
