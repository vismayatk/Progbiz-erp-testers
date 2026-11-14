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
const sh = (cmd) => execSync(cmd, { cwd: MOBILE_DIR, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
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

/** Current on-screen element dump (role/text) from uiautomator via emu.js. */
function ui() { return tryEmu('ui'); }
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

module.exports = {
  ADB, SERIAL, PKG, isBooted, ensureBooted, setGeo, ui, screenHas, shot,
  resetAppData, launchApp, login, checkIn,
};
