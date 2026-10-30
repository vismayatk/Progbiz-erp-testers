'use strict';
/**
 * One-time sign-in for the beta product-video capture.
 *
 * A visible Chromium window opens on the beta login page. A PERSON types the
 * company code, user name and password and presses "Sign In". This script never
 * types, reads or prints a credential. Once the app leaves /login, the browser
 * session is saved so the headless capture scripts can reuse it:
 *   reports/video/beta/.auth/state.json    (cookies + localStorage)
 *   reports/video/beta/.auth/session.json  (sessionStorage of the app origin)
 * Both are session secrets; reports/ is git-ignored.
 *
 * Run from the repo root:  node scripts/video/beta/00_sign_in.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE = 'https://beta.progbiz.io';
const AUTH_DIR = path.join(__dirname, '..', '..', '..', 'reports', 'video', 'beta', '.auth');

(async () => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.bringToFront();
    console.log('Waiting for you to sign in in the browser window (10 minutes) ...');
    await page.waitForFunction(() => !/\/login/i.test(location.pathname), null, { timeout: 600000 });
    await page.waitForTimeout(5000); // let the app store its session
    await ctx.storageState({ path: path.join(AUTH_DIR, 'state.json') });
    const session = await page.evaluate(() => {
      const o = {};
      for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); o[k] = sessionStorage.getItem(k); }
      return o;
    });
    fs.writeFileSync(path.join(AUTH_DIR, 'session.json'),
      JSON.stringify({ origin: new URL(page.url()).origin, items: session }));
    console.log('SIGNED_IN_AND_SAVED landed on', new URL(page.url()).pathname,
      '| sessionStorage keys:', Object.keys(session).length);
  } catch (e) {
    console.log('NOT_SAVED:', String(e.message).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
