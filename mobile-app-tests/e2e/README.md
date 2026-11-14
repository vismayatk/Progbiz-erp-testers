# Mobile automation — Android app + web attendance E2E

Self-contained mobile automation for the Progbiz ERP Android app (`io.progbiz.erp`), run on a
local emulator and verified against the hrms-test web app.

## Run it
```bash
npm run hrms:mobile
```
(or directly: `npx playwright test -c mobile-app-tests/playwright.config.js`)

Needs the Android emulator available (`Z:\Android\Sdk`) with the ERP app installed. The command
boots the AVD if it isn't already running.

## Language / tooling
- **JavaScript (Node.js)** — all logic. **Not TypeScript.**
- **Playwright (JS)** — the web half (create employee, verify attendance).
- **adb + uiautomator** — drives the phone (taps, typing, GPS, screenshots), via `../panel/emu.js`.
- No Python.

## What it does (one command, one run)
1. **WEB** — create a fresh Core HR employee with login enabled (password = employee code).
2. **MOBILE ∥ WEB** — boot emulator, reset the app, log in as that employee (parallel with a web branch).
3. **MOBILE** — inject GPS inside the company OFFICE geofence → tap **Check-In**.
4. **WEB** — log in as the employee and verify ESS *My Attendance* shows **Present** + **Actual In**.

## Files
| File | Purpose |
|---|---|
| `attendance_checkin.spec.js` | the orchestrator (the 4 steps above) |
| `mobileAttendance.js` | the emulator driver — `ensureBooted / launchApp / login / setGeo / checkIn` |
| `../playwright.config.js` | mobile Playwright config (reuses the HRMS admin login + `.env`) |
| `../run.js` | launcher behind `npm run hrms:mobile` (sets `HRMS_MOBILE=1`) |

## Notes / gotchas (baked into the driver)
- App reaches **hrms-test via company code `pbhrms`**; auto-password = employee code (no reset/OTP).
- Check-in is **geofence-gated** — out-of-area is correctly rejected. OFFICE coords
  (`11.891560, 75.468381`) apply company-wide; override with `HRMS_PUNCH_LAT` / `HRMS_PUNCH_LNG`.
- A freshly created employee auto-gets "Test General Shift", so check-in is accepted immediately.
- Fresh launch throws notification + location permission dialogs and an "Update Available" nag around
  the login form; the driver pre-grants permissions (`pm grant`) and poll-dismisses the update nag.
- **WFH is not in the mobile app yet** (web ESS only). Leave/Approvals/Requests/Handover/Shift
  **are** in the app and could be automated next.

## Scope guard
The spec skips unless `HRMS_MOBILE=1` (set by `npm run hrms:mobile`) or an emulator is already
attached — so it never runs inside `npm run hrms:all` or a plain web suite pass unintentionally.
