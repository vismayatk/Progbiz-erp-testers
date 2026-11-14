'use strict';

/**
 * MOBILE ESS COVERAGE (complete) — walk the WHOLE employee app, exercise the safe actions, assert
 * each, screenshot each, and write an issues report.
 *
 * The Progbiz ERP Android app is the minimal employee (self-service) view of the web HRMS. This
 * script signs in as a test employee and covers the entire surface:
 *   • 4 bottom-nav tabs  — Home, Calendar, Tasks, Account/Settings
 *   • 17 menu pages      — Dashboard · Task Management (Timeline/My Tasks/Delegated/To Do/Daily
 *                          Activity) · My Workspace (Workspace/Profile/Approvals/Requests/Leave/
 *                          Handover/Attendance/Team Calendar/Shift/Locations) · Credentials
 *   • in-page actions    — Apply Leave, New Request, Add Request, Add Location, Request a Change,
 *                          Approve/Reject (present-only), create-task, tab switches
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
const sh = (c) => { try { return execSync(c, { cwd: MOBILE_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };
const adb = (a) => sh(`"${drv.ADB}" -s ${drv.SERIAL} ${a}`);
const emu = (a) => sh(`node panel/emu.js ${a}`);
const tap = (x, y) => emu(`tap ${x} ${y}`);
const tapText = (t) => emu(`tap-text "${t}"`);
const ui = () => emu('ui');
const has = (re) => re.test(ui());
const hasInputs = () => /EditText|TextField|input/i.test(ui());

const GROUPS = ['Dashboard', 'Task Management', 'My Workspace', 'Credentials'];

// Bottom-navigation tabs (coords on a 1080x2400 screen).
const NAVTABS = [
  { name: 'Nav: Home',     x: 105, y: 2246, expect: /Hello|Completed|Pending|Check|Today Tasks/i },
  { name: 'Nav: Calendar', x: 329, y: 2246, expect: /Calendar|November|2026|\bS\b|\bM\b/i },
  { name: 'Nav: Tasks',    x: 751, y: 2246, expect: /Task|Unscheduled|Nothing here/i },
  { name: 'Nav: Account',  x: 975, y: 2246, expect: /Lakshmi|progbiz|Staff|Setting|Logout|Log out|Profile/i },
];

// Menu pages {name, group, item, expect, tabs?, action?}
const PAGES = [
  { name: 'Dashboard',       group: 'Dashboard',       item: 'Task',            expect: /Dashboard|Status|HIGH|Task|Overview/i },
  { name: 'Timeline',        group: 'Task Management', item: 'Timeline',        expect: /Timeline|Calendar|November|task|Nothing/i },
  { name: 'My Tasks',        group: 'Task Management', item: 'My Tasks',        expect: /My Tasks|task|Nothing|Unscheduled/i },
  { name: 'Delegated Tasks', group: 'Task Management', item: 'Delegated Tasks', expect: /Delegat|task|Nothing/i },
  { name: 'To Do',           group: 'Task Management', item: 'To Do',           expect: /To.?Do|task|Nothing/i },
  { name: 'Daily Activity',  group: 'Task Management', item: 'Daily Activity',  expect: /Daily Activity|report|Nothing|Apply/i },
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

const atHome = () => /Hello |Today Tasks|Get real-time insights/i.test(ui());
function dismissDialogs() {
  if (has(/Maybe Later/i)) tapText('Maybe Later');
  if (has(/Continue Without Check-in/i)) tapText('Continue Without Check-in');
}

/** Bring the app to its HOME dashboard. The app restores its last route and the Task sub-module
 *  traps navigation, so: (1) back out of any form, (2) tap the Home bottom-nav, (3) if still not
 *  home, do a full reset (pm clear + re-login) which always escapes to the dashboard. */
async function goToDashboard() {
  for (let i = 0; i < 2 && !atHome(); i++) { tap(74, 228); await sleep(1200); }   // exit a form/detail
  dismissDialogs();
  for (let i = 0; i < 4 && !atHome(); i++) { tap(105, 2246); await sleep(1800); }  // Home tab
  dismissDialogs();
  if (!atHome()) {                                                                 // trapped → hard reset
    await drv.launchApp({ fresh: true });
    await drv.login(CREDS);
    for (let i = 0; i < 3 && !atHome(); i++) { tap(105, 2246); await sleep(1800); }
  }
  try { await drv.setGeo(11.891560, 75.468381, 1); } catch {}
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
  for (let s = 0; s < 6 && !itemRe.test(ui()); s++) { emu('scroll down'); await sleep(600); }
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

  console.log('• ensuring emulator + login…');
  await drv.ensureBooted();
  if (!await drv.login(CREDS)) { await drv.launchApp({ fresh: true }); await drv.login(CREDS); }

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

  // ---- 3. dashboard widgets (present-only checks) ----
  process.stdout.write('• Dashboard widgets … ');
  await goToDashboard();
  const dtxt = pageText(), du = ui();
  const widgets = [
    { name: 'Task work-timer (Check In/Out)', ok: /Check Out|Check In|\d\d:\d\d:\d\d/i.test(du) },
    { name: 'Task status tiles', ok: /Completed|Delayed|Pending/i.test(dtxt) },
    { name: 'Today Tasks / View All', ok: /Today Tasks|View All/i.test(dtxt) },
    { name: 'Create-task (+) FAB', ok: /desc=""/.test(du) || /\+|Add|Create/i.test(du) },
    { name: 'Menu (hamburger)', ok: /85,221/.test(du) },
  ];
  const dshot = snap('Dashboard-widgets');
  results.push({ kind: 'widgets', name: 'Dashboard widgets', status: widgets.every((w) => w.ok) ? 'OK' : 'REVIEW', snippet: widgets.map((w) => `${w.ok ? '✓' : '✗'} ${w.name}`).join(' · '), shot: dshot, extra: widgets.map((w) => ({ name: w.name, status: w.ok ? 'OK' : 'MISSING' })) });
  console.log('done');

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
