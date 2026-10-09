# HRMS Positive-Workflow Automation — Execution Results

**App:** https://hrms-test.progbiz.in · **Login:** company `pbhrms`, user `amit` (password from env `HRMS_PASSWORD`).
**Runner:** Playwright, headed, `--workers=1 --retries=0`. Last full regression: **2026-10-08**. Every spec below was run green on that date, except the Core HR lifecycle spec (its code didn't change, and the same employee-create flow passed in LV5, RE1 and E1).
Legend: ✅ Passed · ⏭️ Fixme (control not yet mapped) · 🔒 Read-only preview.

## Spec files
| Module | Spec | Result (2026-10-08) |
|---|---|---|
| Core HR (lifecycle) | `tests/01_core_hr/employees_validation.spec.js` | ✅ create → Worker Directory → profile (earlier run; code unchanged) |
| Core HR (extras) | `tests/01_core_hr/corehr_extras_workflow.spec.js` | CH1 ✅ generate letter · CH2 ✅ duty handover (persisted, found by unique note) · CH3 ✅ letter template |
| Recruitment | `tests/02_recruitment/recruitment_workflow.spec.js` | R1 ✅ requisition (listed) · R7 ✅ requisition approved · R2 ✅ job opening · R3 ✅ candidate (found by e-mail) · R4 ✅ interview round · R5 ✅ interview scheduled · R8 ✅ evaluation → interview Completed · R6 ✅ offer (Draft, 600000.00) · R9 ✅ offer submitted → approved · R9c ✅ Send Offer → Sent → Track Response "Accepted" → listed in Offer Acceptance · R9d ✅ pre-boarding Send Invite → "Invited expires …" + Resend Invite |
| Leave (setup) | `tests/05_leave/leave_setup_workflow.spec.js` | LV1 ✅ type · LV2 ✅ pattern · LV3 ✅ holiday · LV4 ✅ holiday assignment |
| Leave (apply) | `tests/05_leave/leave_apply_workflow.spec.js` | LV5 ✅ employee · LV6 ✅ pattern assigned (employee gains leave types) · LV7 ✅ apply + approve on behalf (app: "approved — their balance is updated"; Casual 3 → 2) |
| Leave (two actors) | `tests/05_leave/leave_employee_approval.spec.js` | LA1 ✅ employee with login (reports to Amit) · LA2 ✅ pattern · LA3 ✅ employee signs in, sees balance · LA4 ✅ employee applies → Pending, 1 day reserved · LA5 ✅ Amit approves from Leave Approval (row confirmed via View details) · LA6 ✅ employee sees Approved, Casual 3 → 2 |
| Attendance | `tests/06_attendance/attendance_workflow.spec.js` | AT1 ✅ shift · AT2 ✅ geofence (unique point per run) |
| Referral | `tests/07_referral/referral_workflow.spec.js` | RF1 ✅ submit · RF2 ✅ visible in My Referrals · RF3 ✅ admin sees it · RF4 ✅ assign opening → Accept & add to pipeline → In Pipeline; candidate in register (Source Referral) · RF5 ✅ interview + evaluation → referral tracks ATS stage (INTERVIEW) · RF6 ✅ offer approved, sent, accepted → referral **Hired** · RF7 ✅ reward raised automatically (Pending — never approved/paid) |
| Onboarding | `tests/03_onboarding/onboarding_setup_workflow.spec.js` | ON1 ✅ template with 1 stage + 1 task (list shows "1 stage(s) · 1 task(s)") · ON2 ✅ training course |
| Helpdesk | `tests/08_helpdesk/helpdesk_workflow.spec.js` | H1 ✅ raise · H2 ✅ employee view · H3 ✅ admin view · H4 ✅ status → In Progress (checked in list) · H6 ✅ resolve (checked in list) · H7 ✅ terminal · H5 ✅ internal note (on the ticket after reload) · H8 ✅ assign → reassign (checked after reload) |
| My Workspace | `tests/09_my_workspace/my_workspace.spec.js` | WS1–WS6 ✅ |
| Payroll (safe) | `tests/10_payroll/payroll_workflow.spec.js` | PAY1 ✅ salary component · PAY2–PAY4 ✅ 🔒 read-only (shared policy untouched) |
| Resignation & Exit | `tests/11_resignation/resignation_exit_workflow.spec.js` | RE1 ✅ disposable employee · RE2 ✅ Initiate Exit → On Notice |
| E2E (lifecycle) | `tests/12_e2e/e2e_employee_lifecycle.spec.js` | E1 ✅ hire → E2 ✅ leave policy → E3 ✅ resignation → On Notice |

## Tally
- **All built steps pass.** There are **no open application defects** from this phase (see ISSUES.md: APP-01/02/03/06 were automation bugs and are now fixed).
- **Fixme:** none — H5, ON1 and RF4–RF7 were built on 2026-10-08.
- **Out of positive scope by design:** the exit chain after On Notice (approve → clearance → F&F → close), payroll runs and finalisation.
- **Next:** "Start Onboarding" unlocks only after the candidate submits their details via the e-mailed pre-boarding portal link (candidate-side; the link goes to an unreachable @example.com inbox), so the hire-to-onboard E2E (E2E-001) stops at Invited.
- **Earlier false passes fixed (2026-10-08):** R1, R5 and R6 had been checking only for a toast and never actually saved — R1 never answered the app's "Requisition Already Exists — raise anyway?" dialog, R5 never clicked "+ Add" for the interviewer (and booked a past slot), R6 treated the Candidate type-ahead as a dropdown and ran before the candidate was interview-cleared. All three now end with a persisted check on a fresh page load.

## Framework changes this phase
- `flows/userSession.js` `loginAs()`: a second actor in its own browser session — a test-created employee (username set by the test, initial password = the employee code the app assigns). `flows/leaveFlow.js`: shared leave helpers.
- Serial specs save their chain state under `.auth/` (git-ignored) so a single step can be re-run alone with `--grep`.
- `flows/recruitmentFlow.js`: the hiring steps (round, interview, evaluation, offer, approval, send + acceptance, pre-boarding invite) as shared functions — the recruitment spec and the referral spec (RF5–RF6 drive the referred candidate) both use them.
- Referral status follows the recruitment ATS once a referral is accepted ("Status updates automatically as the candidate advances"); a manual status is overwritten by the next "Pipeline update", so RF5–RF6 advance the candidate through real recruitment steps rather than the status dropdown.
- `FormKit.waitVisible(locator, ms)`: a real wait. Playwright's `isVisible({timeout})` ignores the timeout, and that caused the false LV7 "defect".
- `FormKit.scope()`: recognises offcanvas panels, and races a modal opening against the form's ready control.
- `FormKit.gotoReady(url, {ready})`: navigates, settles, reloads if the page comes up blank, then waits for an anchor.
- Global timeouts raised in `playwright.config.js`: navigation 90 s, action 30 s, assertion 30 s, test 210 s.

## Evidence for failures and blockers (from 2026-10-08)
Every run keeps proof of anything that goes wrong in **`reports/hrms-evidence/<run date time>/index.html`** (local only, `reports/` is git-ignored):
- **FAILED step** (a bug, an app refusal or a timeout): a folder with the **screen recording** (`video.webm`, plus `recording-<user>.webm` for a second user such as the employee in LA3–LA6), **screenshots** (including that user's screen at the moment of failure), the Playwright **trace** (`npx playwright show-trace trace.zip`), a page snapshot, and **`error.txt`** (what failed, where, and the step log).
- **BLOCKED step** (could not run because an earlier step in its chain failed): listed in the index.
- `index.html` shows every failure with its recordings and screenshots inline. If nothing failed, no evidence folder is created.
- **Full evidence run** (recordings and screenshots of EVERY step, passed or not): `HRMS_EVIDENCE=all npx playwright test -c hrms/playwright.config.js hrms/tests/<module>`.
- The evidence reporter is in the config, so plain `npx playwright test -c hrms/playwright.config.js …` uses it. If you pass `--reporter=…` yourself, add it: `--reporter=line,./hrms/reporters/evidenceReporter.js`.

## Run commands
```bash
# One module (headed, single worker, no retries):
HEADED=1 HRMS_WORKERS=1 npx playwright test -c hrms/playwright.config.js hrms/tests/08_helpdesk/helpdesk_workflow.spec.js --workers=1 --retries=0

# One step within a module:
HEADED=1 npx playwright test -c hrms/playwright.config.js hrms/tests/02_recruitment/recruitment_workflow.spec.js --grep "R1" --workers=1

# Whole HRMS suite:
npx playwright test -c hrms/playwright.config.js

# HTML report:
npx playwright show-report reports/hrms-html
```
Auth: `hrms/fixtures/global-setup.js` logs in once and saves `hrms/.auth/state.json` (gitignored). Refresh if idle >~1h.

## Test-data naming standard (from 2026-10-08)
All data the suite creates follows `hrms/data/naming.js`:
- **People** get realistic names, e.g. employee *Rohan Varghese*, candidate *Pranav Das*, referral *Revathi Shenoy*. They are identified by employee code / e-mail, never by name.
- **Records** get a business name plus a readable run tag: *Technical Round 1 (Auto 08-Oct 14.12.36)*, *General Shift (Auto …)*, *Unable to connect to office VPN from home (Auto …)*, *Experience Letter (Auto …)*, requisition justification *Additional Software Tester for Q4 delivery (Auto …)*.
- **Letters-only names** (leave type, pattern, holiday) get a realistic name plus a place: *Study Leave Kochi*, *Branch Leave Pattern Kochi*, *Company Foundation Day Kochi*.
- **Codes / e-mails** carry the run id (DDMMHHMMSS): salary component *SPLALW08101412*, *pranav.das.08101412360@example.com*.

## Test-data created on the tenant (all disposable)
Records created before 2026-10-08 used the old stamps (`QAAuto<n>`, `QA Shift <n>`, `Meera<xxxxx> Nair`, …); newer ones follow the standard above. Includes: onboarding templates, helpdesk internal notes, referrals driven to Hired with a Pending reward (never approved/paid; Reward Policy untouched), shifts, geofences (unique coordinates), duty handovers (Rahul Sharma → Amit, unique future dates), candidates and referrals, a job opening per recruitment run, interview schedules + evaluations, offers driven to Approved, and from 2026-10-08 sent + accepted + pre-boarding invited (to reserved @example.com addresses), approved requisitions, leave types/patterns, holidays, helpdesk tickets (driven to Resolved), letter templates, interview rounds, **salary components**, **disposable employees (leave + exit chains)**, **one leave-pattern assignment per leave-chain employee**, **one Resignation exit initiated → On Notice (never approved/closed; stops before F&F)**. No deletions; no payments; no statutory submissions; **no exit was approved, cleared, settled, or closed**; the shared Payroll Policy was NOT modified.
