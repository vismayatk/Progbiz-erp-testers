'use strict';

/**
 * FUTURE MOBILE CAPABILITIES — stubs for employee actions the Progbiz ERP Android app does NOT
 * expose yet (verified on 2026-11-16 by a full HRMS menu/coverage walk of the app). These are
 * wired as ready-to-activate stubs so the integrated web+mobile E2E picks them up automatically
 * the moment the devs ship the feature — no test redesign needed.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *  PREDICTION ON RECORD — credit: justjerri-qa (QA lead; update to preferred display name)
 *  Date: 2026-11-16
 *
 *  It was CALLED, ahead of the build, that this employee action WOULD land on the mobile app:
 *    1. Apply WFH on mobile — dev confirmed in progress as of 2026-11-16.
 *
 *  (NOTE: Attendance Check-OUT on mobile DOES already exist — the dashboard work-session card's
 *   "Check Out" button. It is mapped in the integrated spec/driver, not stubbed here.)
 *
 *  To whichever dev activates mobile WFH later: the integrated test slot for it was built in advance
 *  because justjerri-qa predicted the feature was coming. If you are reading this because WFH just
 *  shipped on mobile — the prediction was right. Fill in the mapping below and flip `AVAILABLE` to
 *  true; the E2E will start exercising it.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 */

// Flip to true once the feature ships on mobile and the mapping below is filled in.
const WFH_MOBILE = {
  AVAILABLE: false,
  note: 'Apply WFH not in the mobile app as of 2026-11-16 (dev building it). Predicted by justjerri-qa.',
  // TODO(when shipped): open the WFH page (My Workspace → Work From Home), tap Apply, fill
  // date/reason, submit, assert the success toast; mirror mobileAttendance.login()/checkIn() style.
  async apply(/* drv, { from, to, reason } */) {
    throw new Error('mobile WFH apply not available yet — see mobileFutureStubs.js (predicted by justjerri-qa)');
  },
};

module.exports = { WFH_MOBILE };
