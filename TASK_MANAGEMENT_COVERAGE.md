# Task Management — Coverage Map (Documented Cases → Automation)

Maps the supplied **Test cases** (`TC_TASK_001..072`) and **Test scenarios** (`Scenario 1..15`)
to the Playwright tests that automate them.

- **Spec files:** [`tests/task_management.spec.js`](tests/task_management.spec.js) (TM‑01…TM‑08, `/task` route)
  · [`tests/task_management_modal.spec.js`](tests/task_management_modal.spec.js) (TM‑09…TM‑23, production *Create New → Task* modal)
- **Page object:** [`pages/TaskManagementPage.js`](pages/TaskManagementPage.js)
- **Target:** `devtest.progbiz.in` · company `Lesol_dev` · user `admin` (configured in `.env`)

Run everything: `npx playwright test tests/task_management.spec.js tests/task_management_modal.spec.js`

---

## Discovered UI facts (live)

| Thing | Selector / value |
|---|---|
| Open modal | `#new-task` (Create New) → `#new-task-item` (Task) → `#home-create-task-modal` ("Add Task") |
| Modes | `#instantBtn` (default) · `#laterBtn` · `#repeatBtn` |
| Branch | `<select>` options **Kannur**, Kasargod (Kannur default) |
| Task Type | `#taskType` → Choose / Call / Online Meeting / Offline Meeting / Activities / Project Task / Project Maintenance / Complaint |
| Priority | `#priority` → Normal / Medium / High |
| Task / Desc / Party | `#taskName` · `#description` · `#partySearch` (+ `.ri-search-line`, `.ri-add-fill`) |
| Participants / Hosts | `.ri-user-add-line` · `.add-host-btn` (Hosts appears in Later/Repeat) |
| Later scheduling | `#instantDeadlineToggle` / `#addEndTimeToggle` → `input[type=date]` + `input[type=time]` |
| Repeat | Start Time · End Time · From Date · To Date |
| Save / Clear | `#saveBtn` · `#clearBtn` |
| Row actions | `#edit-task-{id}` · `#delete-task-{id}` · `#overview-task-{id}` |
| Lifecycle (home) | `.ri-play-fill` start/resume · `.ri-pause-fill` hold · `.ri-stop-fill` end |
| ⚠️ Gotcha | `/home` holds **both** `#home-create-task-modal` and `#task-edit-modal` — they share field ids, so modal locators are scoped to the create modal. |

---

## Test Cases → Automation

| Doc TC | Title | Automated by | Note |
|---|---|---|---|
| TC_001 | Create New exposes Task/Enquiry/Quotation | **TM-09** | menu read |
| TC_002 | Task opens modal | **TM-09** | `#home-create-task-modal` visible |
| TC_003 | Instant default | **TM-09** | `activeMode()==='Instant'` |
| TC_004 | Task for Later radio present | **TM-09** | tab visible |
| TC_005/006/007 | Branch list / default / select | **TM-09** | options + Kannur default |
| TC_008/009 | Task Type options / select | **TM-09**, TM-10 | exact option set asserted |
| TC_010/011 | Priority options / select | **TM-09**, TM-10 | Normal/Medium/High |
| TC_012 | Enter task title | **TM-09** | fill + read-back |
| TC_013/014 | Party search / add (+) | **TM-09** | controls present (search+create best-effort) |
| TC_015/016/017 | Participants toggle / create with participant | **TM-09**, `addFirstParticipant()` | add control present |
| TC_025 | Description | **TM-09** | fill + read-back |
| TC_026/027/028 | Instant save / on homepage / starts | **TM-10** | create + list check |
| TC_029–034 | Task for Later / Host / schedule date-time | **TM-11** | Hosts + toggle + date/time |
| TC_043 | Scheduled task saves | **TM-11** | save asserted |
| TC_035–038 | Calendar sync of scheduled task | TM-22 (partial) | calendar reachable; cross-day match = manual |
| TC_039–042 | Unscheduled / Finish-Before | **TM-18** (page), TM-11 (deadline toggle) | unscheduled page + actions |
| TC_044–056 | Lifecycle: start/hold/resume/end + timers | **TM-20** | controls + sections present (non-destructive) |
| TC_057/058/059 | Pending / Overdue / Completed lists | **TM-19** | status tabs navigable |
| TC_060–064 | Notes / Documents | — | best-effort/manual (overview page) |
| TC_048–053 | Created Task page + columns + View/Delete | **TM-16** | page + row actions |
| TC_054–058 | My Task page + columns | **TM-15** | documented columns asserted |
| TC_062–068 | Unscheduled page + Edit/Schedule/Start/Delete | **TM-18** | page + row actions |
| TC_069–072 | Daily Activity Report | **TM-21** | loads with rows |
| TC_018–024 | Participant/Admin cross-user visibility | **TM-23** (skipped) | needs 2nd user login — manual |

## Scenarios → Automation

| Scenario | Automated by |
|---|---|
| 1 — Create Instant Task | **TM-10** |
| 2 — Create Scheduled Task (Task for Later) | **TM-11** |
| 3 — Create Unscheduled Task | **TM-18** + TM-11 (deadline) |
| 4 — Lifecycle Start/Hold/Resume/End | **TM-20** (controls present, non-destructive) |
| 5 — Visibility & Participant Access | **TM-23** (skipped — multi-user) |
| 6 — Admin Calendar & Timeline | **TM-22** (single-user part) |
| 7 — Notes & Document Upload | manual / best-effort |
| 8 — Created Task Page | **TM-16** |
| 9 — My Task Page | **TM-15** |
| 10 — Created vs My Task segregation | TM-15 + TM-16 |
| 11 — Unscheduled Task Page actions | **TM-18** |
| 12 — Daily Activity Report | **TM-21** |
| 13 — Edit an Existing Task | covered by row-action presence (TM-16/18); full edit = manual |
| 14 — Reschedule a Task | TM-11 (schedule) + manual verify |
| 15 — Add a Lead through a Task | manual (three-dots not present in this dev build) |

---

## Negatives (added beyond the doc)

| Test | Checks |
|---|---|
| **TM-13** | Save without **Task Type** → rejected (inline "Please choose valid task type") |
| **TM-14** | Save without **Task title** → rejected |

## Not automatable with current access

- **Multi-user** cases (TC_018–024, Scenarios 5 & 6 cross-login) need a **second non-admin user**; only `admin` is configured. Marked **skipped** (TM-23) with reason so reports stay honest.
- **Notes/Documents** (TC_060–064) and **full Edit/Reschedule round-trips** (Scenarios 13/14) and **Add-Lead-via-task** (Scenario 15) are left as manual/best-effort because they depend on per-task overview state and a three-dots menu not present in this dev build.
