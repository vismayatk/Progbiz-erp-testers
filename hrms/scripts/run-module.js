#!/usr/bin/env node
'use strict';

/**
 * Run one HRMS module (or all) by name — a thin, cross-platform launcher around the existing
 * section filter (works the same in PowerShell, cmd and bash, unlike inline `VAR=... npx`).
 *
 *   node hrms/scripts/run-module.js <module> [extra playwright flags]
 *   node hrms/scripts/run-module.js leave
 *   node hrms/scripts/run-module.js onboarding --headed
 *   node hrms/scripts/run-module.js all
 *   node hrms/scripts/run-module.js list        # show the available modules
 *
 * A SECTION preset sets HRMS_SECTION and walks that slice of the linear run (tests/00_linear); a
 * SPEC preset runs its own file(s). Extra args after the module name pass straight to Playwright
 * (e.g. --headed, --retries=0, --workers=2). Defaults to --workers=1 (serial — safe on the shared
 * tenant) unless you pass your own --workers.
 */
const { spawnSync } = require('child_process');
const presets = require('../data/modulePresets');

const mod = (process.argv[2] || '').toLowerCase();
const extra = process.argv.slice(3);

const names = Object.keys(presets);
if (!mod || mod === 'list' || mod === 'help' || mod === '--help') {
  console.log('HRMS module runner — usage: node hrms/scripts/run-module.js <module> [playwright flags]');
  console.log('Modules:', names.join(', '));
  process.exit(mod && !['list', 'help', '--help'].includes(mod) ? 1 : 0);
}
if (!presets[mod]) {
  console.error(`Unknown module "${mod}". Available: ${names.join(', ')}`);
  process.exit(1);
}

const p = presets[mod];
const env = { ...process.env };
const specPaths = p.spec || ['hrms/tests/00_linear'];
if (p.section) env.HRMS_SECTION = p.section;

const hasWorkers = extra.some(a => a.startsWith('--workers'));
const args = ['playwright', 'test', '-c', 'hrms/playwright.config.js', ...specPaths,
  ...(hasWorkers ? [] : ['--workers=1']), ...extra];

console.log(`\n▶ hrms module "${mod}"${p.section ? ` — section "${p.section}"` : ` — ${specPaths.join(' ')}`}`);
console.log(`  npx ${args.join(' ')}\n`);
const r = spawnSync('npx', args, { stdio: 'inherit', env, shell: true });
process.exit(r.status === null ? 1 : r.status);
