'use strict';

/**
 * Mobile attendance driver — the emulator half of the single-command attendance E2E.
 *
 * Wraps the exact adb + panel/emu.js sequence proven to work on the Progbiz ERP Android app
 * (io.progbiz.erp): boot the AVD, launch the app, dismiss the "Update Available" nag, log in with
 * a Core-HR employee's credentials (company code + username + password = employee code), inject a
 * mock GPS fix inside an approved geofence, and tap attendance Check-In. The web side (Playwright)
 * creates the employee and verifies the punch — see hrms/tests/17_mobile_attendance.
 *
 * Why adb + emu.js: the login + check-in buttons are Flutter-rendered (no stable a11y text on
 * first paint), the soft keyboard occludes the lower fields, and BACK exits the app — so we drive
 * fields by focus + Tab, submit by hiding the keyboard then tapping "Log in", and check-in is
 * geofence-gated (an out-of-area fix is correctly rejected).
 *
 * All methods are async (awaitable sleeps) so a caller can run web work in parallel with the
 * emulator's long wait periods. Everything is non-destructive and repeatable.
 */
const { execSync } = require('child_process');
const path = require('path');

const MOBILE_DIR = path.join(__dirname, '..');                 // Z:\HRMS\mobile-app-tests
const ADB = process.env.HRMS_ADB || 'Z:\\Android\\Sdk\\platform-tools\\adb.exe';
const SERIAL = process.env.HRMS_EMULATOR_SERIAL || 'emulator-5554';
const PKG = 'io.progbiz.erp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Hard per-command timeout: an adb/uiautomator/input child occasionally blocks forever, and with no
// timeout execSync would wedge the whole run on that one call (the cause of the login-line hangs).
const sh = (cmd) => execSync(cmd, { cwd: MOBILE_DIR, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL' }).trim();
const trySh = (cmd) => { try { return sh(cmd); } catch { return ''; } };
const adb = (args) => sh(`"${ADB}" -s ${SERIAL} ${args}`);
const tryAdb = (args) => trySh(`"${ADB}" -s ${SERIAL} ${args}`);
const emu = (args) => sh(`node panel/emu.js ${args}`);
const tryEmu = (args) => trySh(`node panel/emu.js ${args}`);
const key = (k) => tryAdb(`shell input keyevent ${k}`);

/** True when an emulator device is attached and fully booted. */
function isBooted() {
  const devices = trySh(`"${ADB}" devices`);
  if (!new RegExp(`${SERIAL}\\s+device`).test(devices)) return false;
  return tryAdb('shell getprop sys.boot_completed') === '1';
}

/** Boot the AVD if nothing is attached, and wait until it is fully booted (up to ~3 min). */
async function ensureBooted() {
  if (isBooted()) return;
  tryEmu('start');                                             // panel/emu.js boots the default AVD
  for (let i = 0; i < 30; i++) { if (isBooted()) return; await sleep(6000); }
  throw new Error('emulator did not boot within ~3 minutes');
}

/** adb emu geo fix takes LONGITUDE then LATITUDE. Push a few times — the fix can lapse. */
async function setGeo(lat, lng, times = 3) {
  for (let i = 0; i < times; i++) { tryAdb(`emu geo fix ${lng} ${lat}`); await sleep(900); }
}

/** Current on-screen element dump (role/text) from uiautomator via emu.js. The dump intermittently
 *  comes back empty (uiautomator races the Flutter semantics tree); since every detection keys off
 *  this text, an empty result silently flips decisions (e.g. "not logged in"). Retry on empty —
 *  each emu('ui') spawns node (~1-2s), which naturally spaces the retries. */
function ui() {
  for (let i = 0; i < 2; i++) { const u = tryEmu('ui'); if (u && u.trim()) return u; }
  return '';
}
function screenHas(re) { return re.test(ui()); }
function shot(name) { tryEmu(`shot screens/${name}`); return path.join(MOBILE_DIR, 'screens', name); }

/** Runtime permissions the app would otherwise prompt for on first launch (Android 13+). */
const PERMS = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
];

/** Wipe the app's data (clean account switch) AND pre-grant its permissions so no system
 *  permission dialog interrupts the login flow. */
function resetAppData() {
  tryAdb(`shell pm clear ${PKG}`);
  for (const p of PERMS) tryAdb(`shell pm grant ${PKG} ${p}`);
}

/** Tap through any Android permission dialog that still appears (belt-and-braces to pre-granting). */
async function grantPermissionDialogs(maxChecks = 3) {
  for (let i = 0; i < maxChecks; i++) {
    const u = ui();
    if (/permission_allow_button|Allow Progbiz|While using the app/i.test(u)) {
      tryEmu('tap-text "While using the app"'); tryEmu('tap-text "Allow"'); await sleep(1200);
    } else return;
  }
}

/** Dismiss the "Update Available" nag whenever it is on screen. It can appear seconds after launch
 *  AND re-appear over the filled login form, so callers dismiss it before filling and before submit. */
async function dismissUpdate(maxChecks = 6) {
  for (let i = 0; i < maxChecks; i++) {
    if (screenHas(/Update Available|Maybe Later/i)) { tryEmu('tap-text "Maybe Later"'); await sleep(1500); }
    else return true;
  }
  return !screenHas(/Update Available|Maybe Later/i);
}

/** Launch the ERP app and clear any permission / "Update Available" dialogs. */
async function launchApp({ fresh = false } = {}) {
  if (fresh) { resetAppData(); await sleep(1500); }
  tryEmu(`launch ${PKG}`);
  await sleep(9000);
  await grantPermissionDialogs();
  await dismissUpdate();
}

/** Coordinates of the on-screen text fields (EditText), top-to-bottom: [company, username, password]. */
function fieldCoords() {
  const coords = [];
  for (const line of ui().split('\n')) {
    const m = line.match(/^\s*(\d+),(\d+)\s+EditText/);
    if (m) coords.push([Number(m[1]), Number(m[2])]);
  }
  return coords;
}

/** Clear the focused field and type value (field must already be focused). */
function fillFocused(value) {
  key('KEYCODE_MOVE_END');
  for (let i = 0; i < 40; i++) key('KEYCODE_DEL');
  tryEmu(`text "${value}"`);
}

/**
 * Log in with a Core-HR employee's credentials.
 * @param {{company:string, username:string, password:string}} creds
 * @returns {Promise<boolean>} true once the post-login screen (greeting + Check-In) is reached.
 */
async function login({ company, username, password }) {
  const loggedIn = () => screenHas(/Check-In|Good (Morning|Afternoon|Evening)|Hello /i) && !screenHas(/Company Code/i);
  if (loggedIn()) return true;
  await dismissUpdate();                                        // clear any nag before touching fields
  // The login form's fields render a beat after launch — wait for them before reading coordinates
  // (the form also shifts with prefill / error labels, so never hardcode the position).
  let fields = [];
  for (let i = 0; i < 12 && fields.length < 1; i++) {
    await dismissUpdate(1);
    fields = fieldCoords();
    if (fields.length < 1) await sleep(1500);
  }
  if (fields.length < 1) { shot('mob-login-no-fields.png'); return false; }
  const [cx, cy] = fields[0];
  tryEmu(`tap ${cx} ${cy}`); await sleep(1000); fillFocused(company);
  key('KEYCODE_TAB'); await sleep(800); fillFocused(username);
  key('KEYCODE_TAB'); await sleep(800); fillFocused(password);
  await sleep(600);
  key('KEYCODE_ENTER');                                         // closes keyboard (does NOT submit)
  await sleep(1200);
  // Submit, then clear the permission + update interstitials that appear after login, and poll for
  // the dashboard. Retry the tap if a dialog had covered the button.
  for (let attempt = 0; attempt < 2 && !loggedIn(); attempt++) {
    await dismissUpdate();
    try { emu('tap-text "Log in"'); } catch { tryEmu('tap 540 1746'); }
    for (let i = 0; i < 8 && !loggedIn(); i++) {
      await sleep(1500);
      await grantPermissionDialogs(1);
      await dismissUpdate(1);
    }
  }
  shot('mob-after-login.png');
  return loggedIn();
}

/**
 * Tap attendance Check-In at an approved geofence. Sets GPS first when lat/lng given.
 * @returns {Promise<{ok:boolean, detail:string}>} ok=true when accepted (left the interstitial);
 *   detail carries the geofence/location rejection message when ok=false.
 */
async function checkIn(lat, lng) {
  if (lat != null && lng != null) await setGeo(lat, lng, 3);
  if (!screenHas(/Check-In/i)) return { ok: false, detail: 'no Check-In button on screen (already checked in?)' };
  try { emu('tap-text "Check-In"'); } catch { tryEmu('tap 540 1582'); }
  if (lat != null && lng != null) await setGeo(lat, lng, 3);
  await sleep(3500);
  const dump = ui();
  shot('mob-after-checkin.png');
  const reject = dump.match(/outside the approved punch locations|Couldn.?t find your location/i);
  if (reject) {
    tryEmu('tap-text "Dismiss"'); tryEmu('tap-text "Cancel"');
    return { ok: false, detail: reject[0] };
  }
  const ok = /Hello |Good (Morning|Afternoon|Evening)|Completed|Pending/i.test(dump) && !/Check-In/i.test(dump);
  return { ok, detail: ok ? 'check-in accepted' : 'unclear — see screens/mob-after-checkin.png' };
}

/**
 * Tap attendance Check-Out at an approved geofence. Check-OUT is the dashboard work-session card's
 * "Check Out" button (the one beside the live "HH:MM:SSs" counter that runs from check-in) — NOT a
 * second interstitial. Requires being checked in already (card shows "Check Out"). Geofenced like
 * check-in, so we set GPS first. The authoritative confirmation is the WEB side (ESS attendance
 * Actual Out populates) — the caller verifies that; here we just report the on-device outcome.
 * @returns {Promise<{ok:boolean, detail:string}>}
 */
async function checkOut(lat, lng) {
  if (lat != null && lng != null) await setGeo(lat, lng, 3);
  await dismissUpdate(2);
  if (!screenHas(/Check[\s-]?Out/i)) return { ok: false, detail: 'no Check Out button on the dashboard (not checked in, or not on home?)' };
  // Tapping the work-session "Check Out" card button opens a confirmation: "Are you sure to
  // Check-out?" with [Cancel] [Check-out]. We must tap the filled "Check-out" confirm button.
  try { emu('tap-text "Check Out"'); } catch { tryEmu('tap-text "Check-Out"'); }
  await sleep(1800);
  if (screenHas(/Are you sure to Check-?out/i)) {
    if (lat != null && lng != null) await setGeo(lat, lng, 2);   // geofence is enforced on confirm
    // The dialog contains BOTH the title text and the button "Check-out" → tap the filled confirm
    // button by coordinate (bottom-right of the dialog) to avoid hitting the title text.
    tryEmu('tap 742 1302');
    tryEmu('tap-text "Check-out"');
  }
  if (lat != null && lng != null) await setGeo(lat, lng, 3);
  await sleep(3500);
  const dump = ui();
  shot('mob-after-checkout.png');
  const reject = dump.match(/outside the approved punch locations|Couldn.?t find your location/i);
  if (reject) { tryEmu('tap-text "Dismiss"'); tryEmu('tap-text "Cancel"'); return { ok: false, detail: reject[0] }; }
  if (/Are you sure to Check-?out/i.test(dump)) return { ok: false, detail: 'confirmation dialog still open — confirm tap missed' };
  // Success: dialog gone and the card flipped away from "Check Out" (back to Check-In) or a toast.
  const ok = /Check-In/i.test(dump) || /checked out|success/i.test(dump) || !/Check[\s-]?Out/i.test(dump);
  return { ok, detail: ok ? 'check-out confirmed (verify via web Actual Out)' : 'unclear — see screens/mob-after-checkout.png' };
}

// ── Navigation + ESS Leave (mobile) ──────────────────────────────────────────────────────────
const tapEmu = (x, y) => tryEmu(`tap ${x} ${y}`);
const tapText = (t) => { try { emu(`tap-text "${t}"`); return true; } catch { return false; } };

/** Reach the dashboard where the menu lives, from ANY prior state. Does a plain relaunch first (the
 *  app stays logged in) for a deterministic starting screen, clears the update nag, then dismisses
 *  the attendance interstitial if it is shown. Relaunch is what makes menu navigation reliable when
 *  the app has been idle (e.g. between a mobile and a web test step). */
async function goHome() {
  await launchApp({});                                 // plain relaunch → known state (stays logged in)
  await sleep(1500);
  await dismissUpdate(2);
  if (screenHas(/Continue Without Check-in/i)) { tapText('Continue Without Check-in'); await sleep(3000); }
  await dismissUpdate(1);
}

/** Open the drawer and tap a menu item under a group (e.g. "My Workspace" → "Leave"). Robust:
 *  waits for the drawer, expands the group (verifying the Collapsed→Expanded flip and retrying),
 *  then scrolls to and taps the item. */
async function openMenuItem(group, item) {
  await goHome();
  // Open the drawer and wait until its groups have rendered.
  for (let i = 0; i < 3 && !screenHas(/, (Collapsed|Expanded)"/); i++) { tapEmu(85, 221); await sleep(2500); }
  const collapsed = new RegExp(`desc="${group}, Collapsed"`);
  const expanded = new RegExp(`desc="${group}, Expanded"`);
  // Expand the target group — retry until it reports Expanded (the tap can race the slide-in).
  for (let i = 0; i < 4 && !expanded.test(ui()); i++) {
    if (collapsed.test(ui())) tapText(`${group}, Collapsed`) || tapText(group);
    await sleep(1400);
  }
  if (!expanded.test(ui())) return false;
  const itemRe = new RegExp(`desc="${item}"`);
  for (let s = 0; s < 6 && !itemRe.test(ui()); s++) { tryEmu('scroll down'); await sleep(600); }
  if (!itemRe.test(ui())) return false;
  const ok = tapText(item); await sleep(3500);
  return ok;
}

/** Full-date accessibility desc used by the Material date picker, e.g. "18, Wednesday, November 18, 2026". */
function dayDesc(dt) {
  const wd = dt.toLocaleDateString('en-US', { weekday: 'long' });
  const mo = dt.toLocaleDateString('en-US', { month: 'long' });
  return `${dt.getDate()}, ${wd}, ${mo} ${dt.getDate()}, ${dt.getFullYear()}`;
}

/**
 * Apply for leave from the mobile ESS Leave page. Navigates Leave → Apply (FAB) → picks type, a
 * Start/End date (Material picker, selected by full-date desc), fills the description, submits, and
 * asserts the new request shows as pending ("Awaiting Level 1" / Pending). Confirm on web separately.
 * @param {{leaveType?:string, start:Date, end?:Date, description?:string}} o
 * @returns {Promise<{ok:boolean, detail:string}>}
 */
async function applyLeave({ leaveType = 'Casual Leave', start, end, description = 'Automated mobile leave test' }) {
  end = end || start;
  if (!await openMenuItem('My Workspace', 'Leave')) return { ok: false, detail: 'could not navigate to the Leave page' };
  tapEmu(965, 2222); await sleep(3000);               // Apply-Leave FAB
  if (!screenHas(/Apply for Leave/i)) return { ok: false, detail: 'Apply for Leave sheet did not open' };
  tapText('Choose'); await sleep(1500);               // Leave Type dropdown
  if (!tapText(leaveType)) { tryEmu('tap-text "Dismiss"'); return { ok: false, detail: `leave type "${leaveType}" not offered` }; }
  await sleep(2500);
  tapEmu(834, 898); await sleep(2000);                // Start Date → picker
  tapText(dayDesc(start)); await sleep(800); tapText('OK'); await sleep(2500);
  tapEmu(834, 1025); await sleep(2000);               // End Date → picker
  tapText(dayDesc(end)); await sleep(800); tapText('OK'); await sleep(2500);
  if (screenHas(/can.?t apply|rule.*not|blackout|cool-?off|exceeds/i) && !screenHas(/You can apply/i)) {
    shot('mob-leave-policy-block.png');
    return { ok: false, detail: 'policy check blocked the chosen dates — see screens/mob-leave-policy-block.png' };
  }
  // Fill Description. Its position shifts by leave type (Medical adds a Document field above it),
  // so target the description EditText via fieldCoords() rather than a fixed coordinate; scroll it
  // into view first if needed.
  for (let s = 0; s < 3 && fieldCoords().length < 1; s++) { tryEmu('scroll down'); await sleep(600); }
  const fc = fieldCoords();
  if (fc.length) tryEmu(`tap ${fc[fc.length - 1][0]} ${fc[fc.length - 1][1]}`);
  else { tapText('Tap to Enter') || tapEmu(540, 2100); }
  await sleep(1200);
  tryEmu(`text "${description}"`); await sleep(1200);
  key('KEYCODE_BACK');                                // close the keyboard (BACK here dismisses the IME, not the app)
  await sleep(1500);
  tapText('Apply'); await sleep(5000);                // submit
  const dump = ui();
  shot('mob-after-apply-leave.png');
  if (/Please Enter Description|Apply for Leave/i.test(dump) && !/Awaiting|Pending/i.test(dump)) {
    return { ok: false, detail: 'the form is still open after Apply — a required field may be missing' };
  }
  const ok = /Awaiting Level 1|Pending|Leave Requests|Cancel request/i.test(dump);
  return { ok, detail: ok ? 'leave submitted (pending approval — verify on web)' : 'unclear — see screens/mob-after-apply-leave.png' };
}

module.exports = {
  ADB, SERIAL, PKG, isBooted, ensureBooted, setGeo, ui, screenHas, shot,
  resetAppData, launchApp, login, checkIn, checkOut,
  goHome, openMenuItem, applyLeave,
};
