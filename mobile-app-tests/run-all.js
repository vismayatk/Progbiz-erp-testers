'use strict';

/**
 * hrms:all:mobile — the full WEB regression (hrms:all) followed by the MOBILE E2Es, in sequence.
 *
 * The web suite always runs. The mobile E2Es run only when the Android emulator is attached — if it
 * is not, they are skipped with a note (so this command is safe to run without a phone). Each step
 * streams its own output; a pass/fail summary and an overall exit code are printed at the end.
 *
 *   npm run hrms:all:mobile
 *
 * Tip: start the emulator in the `emulator-panel` preview first so the mobile half runs too.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const mobile = require('./e2e/mobileAttendance');

const ROOT = path.join(__dirname, '..');            // repo root (Z:\HRMS)
const bar = '='.repeat(72);

function run(label, cmdArgs) {
  console.log(`\n${bar}\n▶ ${label}\n  node ${cmdArgs.join(' ')}\n${bar}`);
  const r = spawnSync('node', cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  console.log(`\n${ok ? '✅' : '❌'} ${label} — exit ${r.status}`);
  return { label, ok, status: r.status };
}

const results = [];

// 1) Full WEB regression (linear run + resignation + wfh + meeting).
results.push(run('WEB — hrms:all (full web regression)', ['hrms/scripts/run-module.js', 'all']));

// 2) MOBILE E2Es — only when the emulator is attached (else skip cleanly).
if (mobile.isBooted()) {
  results.push(run('MOBILE — attendance in/out (web↔mobile)', ['mobile-app-tests/run.js', 'attendance_in_out_e2e']));
  results.push(run('MOBILE — leave both-directions (web↔mobile)', ['mobile-app-tests/run.js', 'leave_sync_e2e']));
  results.push(run('MOBILE — HRMS coverage walk', ['mobile-app-tests/e2e/ess_coverage.js']));
} else {
  console.log('\n⏭  MOBILE E2Es skipped — no Android emulator attached.');
  console.log('   Start it in the emulator-panel preview, then re-run, or run them individually:');
  console.log('   npm run hrms:mobile:inout · npm run hrms:mobile:leave · npm run hrms:mobile:coverage');
}

// Summary + overall exit code.
console.log(`\n${bar}\nSUMMARY — hrms:all:mobile\n${bar}`);
for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.label}${r.ok ? '' : ` (exit ${r.status})`}`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n❌ ${failed.length} step(s) failed.` : '\n✅ All steps passed.');
process.exit(failed.length ? 1 : 0);
