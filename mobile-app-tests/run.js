'use strict';

/**
 * Single-command launcher for the mobile-integrated attendance E2E.
 *   npm run hrms:mobile
 * Sets HRMS_MOBILE=1 (opt-in gate) and runs the mobile Playwright config, which drives web
 * (Playwright) + the Android emulator (adb) together.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const env = { ...process.env, HRMS_MOBILE: '1' };
const args = [
  'playwright', 'test',
  '-c', path.join('mobile-app-tests', 'playwright.config.js'),
  ...process.argv.slice(2),            // pass through extra flags (e.g. --headed, --debug)
];
const r = spawnSync('npx', args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status == null ? 1 : r.status);
