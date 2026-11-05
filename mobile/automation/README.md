# Progbiz ERP — mobile automation

Four suites for the ERP Android app (`io.progbiz.erp`), run on the local emulators, plus one command that runs them all:

- **`erp_release.py` — release-note checks U1–U8** (Oct 2026 notes, first verified on v2.0.61). Read-only except U8, which may save up to two `QA_MOB_` leads.
- **`erp_scenarios.py` — creates test data** (`QA_MOB_<time>`): New Enquiry → Follow-up → Leads search → Quotation (with the quotation PDF checked) → Complaint, with checks on what the app shows after each Save. Refuses to run unless `--tenant` is a test tenant.
- **`erp_regression.py` — read-only**: re-checks issues found in earlier rounds (R1–R7; R8/R9 log out, only with `--logout`).
- **`erp_smoke.py` — read-only**: opens every screen (menus discovered from the app, so it works for any tenant/role).
- **`run_all.py`** — runs the four suites in order and writes one combined report.

Pure Python 3 + adb — no Appium/Maestro install, works on the release APK.

New machine? Start with **SETUP.md** (requirements, install, paths, first run, troubleshooting).

## Run everything (one command)

```bash
emu all 13 ncore_test
```

- With a new APK installed first (keeps the login): `emu all 13 ncore_test ~/Downloads/erp.apk`
- Only some suites: `emu all 13 ncore_test - release,crm` (`-` = no APK; suites: release, crm, regression, smoke)
- Just the release-note checks: `emu release 13 ncore_test`

It launches the app, taps "Maybe Later" on the Update Available prompt, and checks you are logged in. On the
login screen it fills the company code and `admin`, then waits up to 10 minutes for you to type the password.
For ncore_test it also checks the Profile shows "Ncore Builders" before any test data is created.
Takes about 60 minutes in all (smoke ≈ 35). Combined report:
`~/Progbiz/mobile-qa/reports/erp-all_<tenant>_<time>/index.html` — a table per suite, every FAIL/WARN with its
notes, and links to each suite's own report and log.

Keep the Mac lightly loaded while it runs: when the load average goes above ~25 (for example a big Playwright
run at the same time) the emulator's watchdog kills it, and after a crash it can come back on an old snapshot
with an older app version — check `versionName` before re-running.

## Release-note checks (`erp_release.py`)

| ID | Release note | How it is checked |
|---|---|---|
| U1 | Complaints: attach images, files, voice notes | New Complaint shows Attachments (0/10) with Photos/Camera/File/Voice note; a QA test photo is attached (1/10 + thumbnail) and removed; form cancelled |
| U2 | Cheque Management | Accounts → Cheque Collection (Collected / Ready for Deposit / Deposited) and Cheque Issue (Issued / Uncleared / Cheque Master) open; 3 add forms open and close |
| U3 | Work Flow Collection: next follow-up, opening collection, print | Collection ⋮ has Print (`--print` opens the PDF); Add Collection shows the FOLLOW-UP section; record → Collections → Add ▾ → Opening Collection form |
| U4 | Profile: Availability | Profile tab shows the Available toggle (never switched) |
| U5 | Work Flow custom fields | fields between Lead Source and the next section on each New <work flow> form |
| U6 | Solar section: Consumer field | only when a Solar work flow type exists (WARN otherwise) |
| U7 | Collection cards show "Added by" | Collections list card text; the detail's "Recorded by" is noted |
| U8 | Phone numbers 5–20 digits | Add Lead with 4 / 21 / 6 / 20 digits → blocked or saved; numbers matching an existing customer are skipped |

FAIL = not as in the release note · WARN = could not check / not testable on this tenant.

## Run one suite

1. Start an emulator and log in to the app (you type the password):
   `emu switch 13` → `emu install ~/Progbiz/mobile-qa/apks/<apk>`
2. Run the suite:

```bash
emu test 13
```

- One area only: `emu test 13 crm,projects` (matches group or screen name)
- Another Android version: `emu switch 16`, log in, `emu test 16`
- See the module map: `python3 erp_smoke.py --list`
- Scenario tests (create data on a test tenant): `emu scenarios 14 onetouch_test`
- Old-issue re-check: `python3 erp_regression.py --serial emulator-5554 --tenant ncore_test`

The HTML report opens when done: `~/Progbiz/mobile-qa/reports/erp-smoke_android<ver>_<time>/report.html`
(+ `results.json` and full-size screenshots in `shots/`).

## What each check does

For every screen (home stat cards & tiles, bottom bar, and every drawer menu item):

| Check | FAIL / WARN when |
|---|---|
| Navigation | the screen doesn't change after tapping the menu item (FAIL) |
| Load time | still loading after 20 s, or > 5 s to settle (WARN) |
| On-screen errors | text like "Something went wrong", "null", "Exception", HTTP 4xx/5xx (WARN) |
| Crash / ANR | anything in the crash log, or the app leaves the foreground (FAIL) |
| Scrolling | lists are scrolled once and screenshotted again |
| Count check | home stat cards (Delayed/Pending/Completed): number on the card vs items in the list (WARN) |
| Empty states | "No data" / "No records" are noted |

## Safety (smoke suite is read-only)

`droid.DENY` blocks taps on Logout, Check In/Out, Delete, Approve/Reject, Save, Submit, Send,
Update, Create, Add, Start/Stop/Pause, Yes. "New …" forms are opened, screenshotted and closed
without typing. The smoke suite never types into fields.

## Scenario tests (`erp_scenarios.py`)

| ID | Flow | Checks |
|---|---|---|
| S1 | CRM → New Enquiry: phone, name, place, item search ("Bio"; "Test" on ncore_test), description, next follow-up (+2 days), assign to You → Save | Enquiry Overview shows ENQ number, name, phone, place, status New, assignee, follow-up date; Item Details shows item + description; save time |
| S2 | On that enquiry: ⋮ → Followup → Call not answering, Lead Quality Warm, next date (+4 days), description → Save | Follow-Up History shows status, date, description; save time |
| S3 | CRM → Leads → search the QA name + Enter | appears under "In Follow Up" with count 1 |
| S4 | On the QA enquiry: ⋮ → **Add Quotation** (pre-filled from the enquiry). Valid up to +15 days, item rate 1000 × qty 2, 10 % discount, description → Save | Quotation Overview shows the QUO number, customer, place, valid-up-to, status, sales executive; Item Details shows price 1000.00, total 2000.00, discount 10 %, **payable 1800.00**. Then **Files → View**: the quotation PDF is read and its 14 values are compared (number, date, expiry, customer, phone, item, description, rate, quantity, gross, discount, total, total in words, prepared by) |
| S5 | Complaints › **New Complaint**: type (first one the tenant has), subject `QA_complaint_<ts>`, priority High, the QA customer, description, a photo (Photos → test PNG) → Save | Complaint Overview: `CMP-n`, status **New**, subject, description, priority, type, customer, phone, logged by; the photo is listed under Attachments; timeline has "Complaint CMP-n logged" and "Routed to <team>"; the Complaints list shows it and its **All** count rose by 1. Never taps Acknowledge / Start / Resolve / Resume |

Quotation PDF check: the app writes the PDF into its cache; the script reads it with adb root (Google-APIs emulators) and extracts the text with macOS PDFKit (`osascript`), or `pdftotext` if installed.

Only the enquiry the run created is edited; nothing is deleted, approved, transferred, checked in/out.

## Files

- `run_all.py` — the one-command runner (`emu all`), combined report in `reports/erp-all_*`.
- `erp_release.py` — release-note checks U1–U8 above.
- `erp_regression.py` — re-checks of earlier issues.
- `droid.py` — small adb/uiautomator driver: find by accessibility label, tap, scroll, screenshot, crash log.
  `python3 droid.py` prints what's on screen (handy for adding new steps).
- `erp_scenarios.py` — the create/verify scenarios above (reuses the navigation from `erp_smoke.py`).
- `erp_smoke.py` — discovers the module map from the app (`--list` prints it), runs the checks, writes the HTML report.
  Steps look like `["≡", "+CRM", "Leads"]` — `≡` opens the drawer, `+CRM` expands a section.
