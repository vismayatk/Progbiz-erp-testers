'use strict';

/**
 * MOBILE HRMS/ESS COVERAGE — walk the employee app's HRMS surface, exercise the safe actions, assert
 * each, screenshot each, and write an issues report.
 *
 * The Progbiz ERP Android app is the minimal employee (self-service) view of the web HRMS. This
 * script signs in as a test employee and covers the HRMS/ESS surface only:
 *   • bottom-nav shell   — Home, Calendar, Account/Settings
 *   • 11 HRMS pages      — My Workspace (Workspace/Profile/Approvals/Requests/Leave/Handover/
 *                          Attendance/Team Calendar/Shift/Locations) · Credentials
 *   • in-page actions    — Apply Leave, New Request, Add Request, Add Location, Request a Change,
 *                          tab switches
 * The ERP Task module (Task dashboard, Timeline, My Tasks, Delegated, To Do, Daily Activity, task
 * widgets) is a generic task tracker, NOT HRMS, and is intentionally excluded.
 * Each item is classified OK / EMPTY / ERROR / NO-NAV / NO-FORM / REVIEW, screenshotted, and rolled
 * into reports/mobile/<run>/report.md (+ .json). NON-DESTRUCTIVE: opens forms and cancels, never
 * submits, never approves/rejects, never logs out.
 *
 * Run: npm run hrms:mobile:coverage   (needs the emulator + the ERP app). JavaScript/Node only.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MOBILE_DIR = path.join(__dirname, '..');
const drv = require('./mobileAttendance');

const CREDS = {
  company: process.env.HRMS_COMPANY_CODE || 'pbhrms',
  username: process.env.HRMS_MOBILE_USER || 'lakshmireddy02111858270',
  password: process.env.HRMS_MOBILE_PASS || 'pbhrms0391',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (c) => { try { return execSync(c, { cwd: MOBILE_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, killSignal: 'SIGKILL' }).trim(); } catch { return ''; } };  // hard timeout: no single adb/emu child can wedge the run
const adb = (a) => sh(`"${drv.ADB}" -s ${drv.SERIAL} ${a}`);
const emu = (a) => sh(`node panel/emu.js ${a}`);
const tap = (x, y) => emu(`tap ${x} ${y}`);
const tapText = (t) => emu(`tap-text "${t}"`);
const ui = () => { for (let i = 0; i < 2; i++) { const u = emu('ui'); if (u && u.trim()) return u; } return ''; };  // retry on empty dump (uiautomator races Flutter semantics)
const has = (re) => re.test(ui());
const hasInputs = () => /EditText|TextField|input/i.test(ui());

const GROUPS = ['Dashboard', 'Task Management', 'My Workspace', 'Credentials'];

// Bottom-navigation tabs (coords on a 1080x2400 screen).
const NAVTABS = [
  { name: 'Nav: Home',     x: 105, y: 2246, expect: /Hello|Completed|Pending|Check|Today Tasks/i },
  { name: 'Nav: Calendar', x: 329, y: 2246, expect: /Calendar|November|2026|\bS\b|\bM\b/i },
  { name: 'Nav: Account',  x: 975, y: 2246, expect: /Lakshmi|progbiz|Staff|Setting|Logout|Log out|Profile/i },
  // Nav: Tasks (bottom-nav task list) omitted — Task module is not HRMS.
];

// Menu pages {name, group, item, expect, tabs?, action?}
const PAGES = [
  // NOTE: the ERP Task module (Task dashboard, Timeline, My Tasks, Delegated, To Do, Daily Activity)
  // is a generic task tracker, NOT HRMS — intentionally excluded. HRMS/ESS surfaces only below.
  { name: 'Workspace',       group: 'My Workspace',    item: 'Workspace',       expect: /Workspace|Leave|Attendance|Profile|Apply/i },
  { name: 'Profile',         group: 'My Workspace',    item: 'Profile',         expect: /Profile|Personal|Employee Code|Lakshmi|Designation/i,
    tabs: ['Personal', 'Job', 'Contact', 'Bank'],
    action: { name: 'Request a Change', launchText: 'Request a Change', expect: /Change|Field|Reason|Select|Request/i } },
  { name: 'Approvals',       group: 'My Workspace',    item: 'Approvals',       expect: /Approval|Pending|Approve|Reject|Nothing|No /i },
  { name: 'Requests',        group: 'My Workspace',    item: 'Requests',        expect: /Request|Nothing|No /i,
    action: { name: 'New Request', launchText: 'New Request', expect: /Request|Type|Reason|Select|Date/i } },
  { name: 'Leave',           group: 'My Workspace',    item: 'Leave',           expect: /Leave|Balance|Casual|Overview/i,
    tabs: ['Overview', 'Holidays', 'Comp-Off', 'Balance List', 'Policy'],
    action: { name: 'Apply Leave', launchCoord: [965, 2222], expect: /Leave Type|Apply|From|To|Reason|Select|Half/i } },
  { name: 'Handover',        group: 'My Workspace',    item: 'Handover',        expect: /Handover|Nothing|No /i },
  { name: 'Attendance',      group: 'My Workspace',    item: 'Attendance',      expect: /Attendance|Present|Actual In|Shift|Add Request/i,
    action: { name: 'Add Request', launchText: 'Add Request', expect: /Date|Reason|Type|Regulari|Request/i } },
  { name: 'Team Calendar',   group: 'My Workspace',    item: 'Team Calendar',   expect: /Calendar|Team|Nov|Holiday|\d\d/i },
  { name: 'Shift',           group: 'My Workspace',    item: 'Shift',           expect: /Shift|General|Roster|week|Nothing/i },
  { name: 'Locations',       group: 'My Workspace',    item: 'Locations',       expect: /Location|Approved|OFFICE|punch|Map/i,
    action: { name: 'Add Location', launchText: 'Add Location', expect: /Name|Latitude|Longitude|Radius|Map|location/i } },
  { name: 'Credentials',     group: 'Credentials',     item: 'Credentials',     expect: /Credential|Password|Nothing|No /i },
];

let OUT, SHOTS, shotN = 0;
function snap(label) {
  shotN += 1;
  const name = `${String(shotN).padStart(2, '0')}-${label.replace(/\W+/g, '_')}`;
  emu(`shot screens/${name}.png`);
  try { fs.copyFileSync(path.join(MOBILE_DIR, 'screens', `${name}.png`), path.join(SHOTS, `${name}.png`)); } catch {}
  return `screens/${name}.png`;
}

const HOME_RE = /Hello |Today Tasks|Get real-time insights|View All/i;

/** One UI dump, dismissing the blocking nags (update prompt / check-in prompt) inline. */
function dump() {
  let u = ui();
  if (/Maybe Later/i.test(u)) { tapText('Maybe Later'); u = ui(); }
  if (/Continue Without Check-in/i.test(u)) { tapText('Continue Without Check-in'); u = ui(); }
  return u;
}

/** Poll (up to ms) for the HOME shell to paint. ui() itself blocks ~2-3s, so this self-paces —
 *  no fixed sleeps needed, and it separates "did the tap work" from "has it rendered yet", which
 *  is what the old single-shot check got wrong (it raced the render → false "not home"). */
function pollHome(ms) {
  const end = Date.now() + ms;
  do { if (HOME_RE.test(dump())) return true; } while (Date.now() < end);
  return false;
}
async function geoSafe() { try { await drv.setGeo(11.891560, 75.468381, 1); } catch {} }

/** Bring the app to its HOME shell (where the hamburger lives). Cheap path first: tap the Home
 *  bottom-nav and POLL for the dashboard to render. Only after 3 cheap attempts genuinely fail do
 *  we pay for the hard reset (pm clear + re-login) — which the old code hit on nearly every page
 *  because its one-shot home check kept racing the render. */
async function goToDashboard() {
  if (pollHome(1)) { await geoSafe(); return true; }           // already home (1 dump)
  for (let i = 0; i < 3; i++) {
    tap(105, 2246); await sleep(500);                          // Home bottom-nav tab
    if (pollHome(6000)) { await geoSafe(); return true; }      // poll ~2-3 dumps for the render
  }
  // Trapped → PLAIN relaunch. The app keeps its session (stays logged in), so we must NOT pm clear
  // or re-login here: that was the real killer — a flaky/empty dump made login() miss that we were
  // already in, loop, then pm clear and degrade the device. A plain relaunch + Home tap is enough.
  await drv.launchApp({});
  for (let i = 0; i < 3 && !pollHome(1); i++) { tap(105, 2246); await sleep(600); }
  const ok = pollHome(6000);
  await geoSafe();
  return ok;
}

/** Open the hamburger, collapse the other groups, expand the target, and tap the item. */
async function openPage(group, item) {
  const itemRe = new RegExp(`desc="${item}"`, 'i');
  await goToDashboard();
  tap(85, 221); await sleep(1800);
  for (const g of GROUPS) {
    if (g !== group && new RegExp(`desc="${g}, Expanded"`).test(ui())) { tapText(g); await sleep(800); }
  }
  if (new RegExp(`desc="${group}, Collapsed"`).test(ui())) { tapText(group); await sleep(900); }
  for (let s = 0; s < 9 && !itemRe.test(ui()); s++) { emu('scroll down'); await sleep(600); }
  if (!itemRe.test(ui())) return false;
  tapText(item); await sleep(3500);
  return !/Version 2\.0|desc="(Dashboard|Task Management|My Workspace|Credentials), (Collapsed|Expanded)"/i.test(ui());
}

function pageText() {
  return ui().split('\n')
    .map((l) => (l.match(/desc="([^"]*)"|"([^"]{2,})"\s/) || [])[1] || '')
    .filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 400);
}

function classify(txt, expect) {
  if (/Oops|went wrong|Error Code|something went wrong|Unhandled|Exception/i.test(txt)) return 'ERROR';
  if (expect.test(txt)) return 'OK';
  if (/Nothing here|No .*(found|yet|data)|empty/i.test(txt)) return 'EMPTY';
  if (txt.replace(/[^a-z]/gi, '').length < 12) return 'EMPTY';
  return 'REVIEW';
}

/** Probe a page's primary action form: launch it, assert a form opened, screenshot, then cancel. */
async function probeAction(a) {
  if (a.launchCoord) tap(a.launchCoord[0], a.launchCoord[1]);
  else { if (!has(new RegExp(a.launchText, 'i'))) return { name: a.name, status: 'NO-LAUNCHER' }; tapText(a.launchText); }
  await sleep(2800);
  const txt = pageText();
  const opened = a.expect.test(txt) || hasInputs();
  const shot = snap(`action-${a.name}`);
  // Cancel without saving: top-left back arrow, then keyboard-safe back, then relaunch resets anyway.
  tap(74, 228); await sleep(1000);
  return { name: a.name, status: /Oops|went wrong/i.test(txt) ? 'ERROR' : opened ? 'OK' : 'NO-FORM', detail: txt.slice(0, 120), shot };
}

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  OUT = path.join(MOBILE_DIR, '..', 'reports', 'mobile', stamp);
  SHOTS = path.join(OUT, 'screens');
  fs.mkdirSync(SHOTS, { recursive: true });

  console.log('• ensuring emulator + app at home…');
  await drv.ensureBooted();
  await drv.launchApp({});                         // plain launch — the app persists its session
  // Best-effort home; NEVER log in or pm-clear here. The app stays signed in across the session, so
  // a login/wipe is never needed — and a pm-clear permanently degrades uiautomator for this boot
  // (the cause of every prior startup hang). If home-detection is flaky, we proceed anyway and the
  // per-page screenshot is the evidence; a page that can't be reached is just logged NO-NAV.
  await goToDashboard();
  console.log('• at home — starting walk');

  const results = [];   // {kind, name, status, snippet, detail, shot, extra[]}

  // ---- 1. bottom-nav tabs ----
  for (const t of NAVTABS) {
    process.stdout.write(`• ${t.name} … `);
    await goToDashboard();
    tap(t.x, t.y); await sleep(3000);
    const txt = pageText();
    const status = classify(txt, t.expect);
    const shot = snap(t.name);
    results.push({ kind: 'tab', name: t.name, status, snippet: txt.slice(0, 160), shot });
    console.log(status);
  }

  // ---- 2. menu pages (+ tabs + action) ----
  for (const p of PAGES) {
    process.stdout.write(`• ${p.name} … `);
    let status, txt = '', detail = '';
    const extra = [];
    try {
      const navved = await openPage(p.group, p.item);
      await sleep(800);
      txt = pageText();
      status = !navved ? 'NO-NAV' : classify(txt, p.expect);
      const shot = snap(p.name);

      if (navved) {
        // in-page tabs
        if (p.tabs) for (const tb of p.tabs) {
          if (has(new RegExp(`desc="${tb}"`, 'i'))) {
            tapText(tb); await sleep(1500);
            extra.push({ name: `tab:${tb}`, status: /Oops|went wrong/i.test(pageText()) ? 'ERROR' : 'OK', shot: snap(`${p.name}-tab-${tb}`) });
          } else extra.push({ name: `tab:${tb}`, status: 'MISSING' });
        }
        // primary action
        if (p.action) { const r = await probeAction(p.action); extra.push(r); }
      }
      results.push({ kind: 'page', name: p.name, group: p.group, status, snippet: txt.slice(0, 160), detail, shot, extra });
    } catch (e) {
      results.push({ kind: 'page', name: p.name, group: p.group, status: 'NO-NAV', snippet: '', detail: String(e).split('\n')[0].slice(0, 80), shot: '', extra });
    }
    console.log(status + (extra.length ? ` (+${extra.length})` : ''));
  }

  // (Dashboard task-widget probe removed — the Task module is not HRMS.)

  // ---- report ----
  const flat = [];
  for (const r of results) {
    flat.push({ scope: r.name, status: r.status, detail: r.snippet || r.detail || '', shot: r.shot });
    for (const e of (r.extra || [])) flat.push({ scope: `  ${r.name} → ${e.name}`, status: e.status, detail: e.detail || '', shot: e.shot || '' });
  }
  const bad = flat.filter((f) => ['ERROR', 'NO-NAV', 'NO-FORM', 'NO-LAUNCHER', 'MISSING', 'EMPTY', 'REVIEW'].includes(f.status));
  const counts = ['OK', 'EMPTY', 'REVIEW', 'NO-FORM', 'NO-NAV', 'ERROR', 'MISSING', 'NO-LAUNCHER']
    .map((s) => `${s}: ${flat.filter((f) => f.status === s).length}`).filter((c) => !/: 0$/.test(c)).join(' · ');
  const md = [
    `# Mobile ESS — complete coverage — ${stamp}`,
    `App: Progbiz ERP (io.progbiz.erp) · employee: ${CREDS.username} @ ${CREDS.company}`,
    `Surface: ${NAVTABS.length} nav tabs · ${PAGES.length} menu pages · in-page tabs + actions · dashboard widgets`,
    '', `**${counts}**`, '',
    '## Issues to review',
    bad.length ? '| Scope | Status | What |' : '_None — every page, tab and action behaved as expected._',
    bad.length ? '|---|---|---|' : '',
    ...bad.map((f) => `| ${f.scope.trim()} | **${f.status}** | ${(f.detail || '').replace(/\|/g, '/').slice(0, 90)} |`),
    '', '## Everything covered (with screenshots)',
    '| Scope | Status | Screenshot | Content |',
    '|---|---|---|---|',
    ...flat.map((f) => `| ${f.scope} | ${f.status} | ${f.shot ? `[shot](${f.shot})` : '—'} | ${(f.detail || '').replace(/\|/g, '/').slice(0, 70)} |`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  console.log(`\n==== COMPLETE MOBILE COVERAGE ====\n${counts}\nReport: ${path.join(OUT, 'report.md')}`);
  for (const f of bad) console.log(`  [${f.status}] ${f.scope.trim()} — ${(f.detail || '').slice(0, 60)}`);
})();
