'use strict';
/**
 * Creates the saved session that the authenticated scout (02_app_scout.js) needs.
 *
 * TO BE RUN BY A PERSON, not by the automation agent:
 *   - a visible Chromium window opens on the login page,
 *   - YOU type the company code, user name and password and press "Sign In",
 *   - as soon as the app leaves /login the session is written to
 *       reports/video/scout/.auth/state.json      (cookies + localStorage)
 *       reports/video/scout/.auth/session.json    (sessionStorage of the app origin)
 *     and the window closes.
 *
 * This script never reads PASSWORD from .env, never types and never prints a credential.
 * Both output files are session secrets: they sit under reports/ and .auth/, which are git-ignored.
 *
 * Run from the repo root:  node scripts/video/scout/00_save_auth_state_manual.js
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const L = require('./lib');

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const AUTH_DIR = path.join(L.OUT, '.auth');

(async () => {
  if (!BASE) { console.log('BASE_URL is missing in .env'); process.exit(2); }
  L.ensureDir(AUTH_DIR);
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Please sign in in the browser window (you have 5 minutes) ...');
    await page.waitForFunction(() => !/\/login/i.test(location.pathname), null, { timeout: 300000 });
    await page.locator('#sidebar').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(2000);
    await ctx.storageState({ path: path.join(AUTH_DIR, 'state.json') });
    const session = await page.evaluate(() => { const o = {}; for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); o[k] = sessionStorage.getItem(k); } return o; });
    fs.writeFileSync(path.join(AUTH_DIR, 'session.json'), JSON.stringify({ origin: new URL(page.url()).origin, items: session }));
    console.log('Saved. localStorage/cookies -> state.json ; sessionStorage keys saved:', Object.keys(session).length);
  } catch (e) {
    console.log('Not saved:', String(e.message).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await ctx.close(); await browser.close();
  }
})();
