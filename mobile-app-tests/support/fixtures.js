'use strict';

/**
 * Fixtures shared by every spec — import `test` / `expect` from here, never from @playwright/test.
 *
 *   web target      playwright.config.js: Playwright device emulation (Pixel 7, iPhone 14, …)
 *   android target  playwright.android.config.js (sets MOBILE_TARGET=android): real Chrome on an
 *                   adb-connected emulator/phone via Playwright's experimental _android API.
 *                   The same specs run on both.
 *
 * Option    test.use({ loggedIn: false })  start without the saved session (login/session specs)
 * Fixtures  mobile    platform actions (offline, background/resume, rotate, geolocation), same api
 *                     on both targets; whatever a test changes is restored afterwards
 *           evidence  (auto) on failure captures screenshot(s), DOM, accessibility tree, console and
 *                     network logs (+ device screenshot, logcat, uiautomator dump on Android) BEFORE
 *                     anything is restored or torn down → artifacts/<run>/<project>/<id>/attempt-<n>/
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const base = require('@playwright/test');
const { BASE_URL } = require('./env');
const { AUTH_STATE, artifactsDir, attemptDir, testIdOf } = require('./paths');
const { redactPII, redactUrl, scrub } = require('./redact');
const { webPlatform, androidPlatform } = require('./platform');

const TARGET = process.env.MOBILE_TARGET === 'android' ? 'android' : 'web';
const EMPTY_STATE = { cookies: [], origins: [] };

const hostInfo = () => `${os.type()} ${os.release()} (${os.arch()})`;

function writeEnvInfo(project, info) {
  const dir = path.join(artifactsDir(), '_env');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${project}.json`), JSON.stringify({ project, ...info }, null, 2));
}

function watchPage(page) {
  const logs = { console: [], network: [] };
  const at = () => new Date().toISOString();
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') {
      logs.console.push({ at: at(), type: m.type(), text: scrub(m.text()).slice(0, 2000), page: redactUrl(page.url()) });
    }
  });
  page.on('pageerror', e => logs.console.push({ at: at(), type: 'pageerror', text: scrub((e && e.stack) || String(e)).slice(0, 4000) }));
  page.on('requestfailed', r => logs.network.push({ at: at(), method: r.method(), url: redactUrl(r.url()), failure: (r.failure() || {}).errorText }));
  page.on('response', r => {
    if (r.status() >= 400) logs.network.push({ at: at(), method: r.request().method(), url: redactUrl(r.url()), status: r.status() });
  });
  return logs;
}

async function captureFailure({ page, testInfo, logs, device }) {
  const dir = attemptDir(testInfo.project.name, testInfo.title, testInfo.retry);
  fs.mkdirSync(dir, { recursive: true });
  const files = {};
  const problems = {};
  const grab = async (key, file, fn) => {
    try { await fn(path.join(dir, file)); files[key] = file; }
    catch (e) { problems[key] = scrub(String(e.message).split('\n')[0]); }
  };

  // What the user saw at the failing moment — first, before anything else can change the screen.
  await grab('screenshot', 'screenshot.png', p => page.screenshot({ path: p, timeout: 10_000 }));
  if (device) await grab('device-screenshot', 'device-screen.png', p => device.screenshot({ path: p }));
  await grab('full-page', 'screenshot-fullpage.png', p => page.screenshot({ path: p, fullPage: true, timeout: 15_000 }));
  await grab('dom', 'dom.html', async p => fs.writeFileSync(p, redactPII(await page.content())));
  await grab('ui-hierarchy', 'ui-hierarchy.aria.yml',
    async p => fs.writeFileSync(p, redactPII(await page.locator('body').ariaSnapshot({ timeout: 10_000 }))));
  if (device) {
    await grab('logcat', 'logcat.txt',
      async p => fs.writeFileSync(p, scrub((await device.shell('logcat -d -v time -t 2000')).toString())));
    await grab('android-ui-hierarchy', 'android-window-dump.xml', async p => {
      await device.shell('uiautomator dump /sdcard/window_dump.xml');
      fs.writeFileSync(p, redactPII((await device.shell('cat /sdcard/window_dump.xml')).toString()));
    });
  }
  await grab('console', 'console.json', async p => fs.writeFileSync(p, JSON.stringify(logs.console, null, 2)));
  await grab('network', 'network.json', async p => fs.writeFileSync(p, JSON.stringify(logs.network, null, 2)));

  const err = testInfo.error || {};
  fs.writeFileSync(path.join(dir, 'failure.json'), JSON.stringify({
    testId: testIdOf(testInfo.title),
    title: testInfo.titlePath.slice(1).join(' › '),
    project: testInfo.project.name,
    attempt: testInfo.retry + 1,
    capturedAt: new Date().toISOString(),
    status: testInfo.status,
    url: redactUrl(page.url()),
    viewport: page.viewportSize(),
    error: scrub(err.message || ''),
    stack: scrub(err.stack || ''),
    location: err.location || null,
    files,
    captureProblems: problems,
  }, null, 2));
  for (const [name, file] of Object.entries(files)) await testInfo.attach(name, { path: path.join(dir, file) });
}

/** Android Chrome keeps its profile between launches: reset site data, then seed the saved session. */
async function seedSession(context, loggedIn) {
  const state = loggedIn ? JSON.parse(fs.readFileSync(AUTH_STATE, 'utf8')) : EMPTY_STATE;
  await context.clearCookies();
  if (state.cookies.length) await context.addCookies(state.cookies);
  await context.addInitScript(({ origins, nonce }) => {
    try {
      if (sessionStorage.getItem('__mobileSeed') === nonce) return;   // once per launch, so logout still works
      localStorage.clear();
      const entry = origins.find(o => o.origin === location.origin);
      if (entry) for (const { name, value } of entry.localStorage) localStorage.setItem(name, value);
      sessionStorage.setItem('__mobileSeed', nonce);
    } catch { /* opaque origins (about:blank, chrome://) */ }
  }, { origins: state.origins || [], nonce: `${Date.now()}-${Math.random()}` });
}

// ── web target ──────────────────────────────────────────────────────────────
const webTest = base.test.extend({
  loggedIn: [true, { option: true }],
  storageState: async ({ loggedIn }, use) => use(loggedIn ? AUTH_STATE : EMPTY_STATE),

  _envInfo: [async ({ browser, browserName }, use, workerInfo) => {
    const p = workerInfo.project;
    writeEnvInfo(p.name, {
      target: 'emulated', device: (p.metadata && p.metadata.device) || p.name, browserName,
      browserVersion: browser.version(), viewport: p.use.viewport, isMobile: !!p.use.isMobile,
      hasTouch: !!p.use.hasTouch, userAgent: p.use.userAgent, host: hostInfo(),
    });
    await use();
  }, { scope: 'worker', auto: true }],

  mobile: async ({ page, context }, use) => {
    const m = webPlatform(page, context, BASE_URL);
    await use(m);
    await m.restore();
  },

  // Depends on `mobile` so its teardown (the capture) runs BEFORE mobile.restore().
  evidence: [async ({ page, mobile }, use, testInfo) => {
    const logs = watchPage(page);
    await use(logs);
    if (testInfo.status !== testInfo.expectedStatus) await captureFailure({ page, testInfo, logs });
  }, { auto: true }],
});

// ── android target ──────────────────────────────────────────────────────────
const androidTest = base.test.extend({
  loggedIn: [true, { option: true }],

  device: [async ({}, use, workerInfo) => {
    if (process.env.MOBILE_ANDROID_BLOCKED) return use(null);
    const { _android } = require('playwright');
    const all = await _android.devices();
    const wanted = process.env.ANDROID_SERIAL;
    const device = (wanted ? all.find(d => d.serial() === wanted) : all[0]) || null;
    for (const d of all) if (d !== device) await d.close();
    if (device) {
      const sh = async cmd => (await device.shell(cmd)).toString().trim();
      writeEnvInfo(workerInfo.project.name, {
        target: 'real-device', device: device.model(), serial: device.serial(),
        emulator: device.serial().startsWith('emulator-') || (await sh('getprop ro.kernel.qemu')) === '1',
        android: await sh('getprop ro.build.version.release'), api: await sh('getprop ro.build.version.sdk'),
        browserName: 'Chrome for Android',
        browserVersion: ((await sh('dumpsys package com.android.chrome')).match(/versionName=(\S+)/) || [])[1] || 'unknown',
        screen: await sh('wm size'), density: await sh('wm density'), host: hostInfo(),
      });
    }
    await use(device);
    if (device) await device.close();
  }, { scope: 'worker' }],

  context: async ({ device, loggedIn }, use, testInfo) => {
    if (!device) testInfo.skip(true, `BLOCKED: ${process.env.MOBILE_ANDROID_BLOCKED || 'no Android device/emulator connected'}`);
    await device.shell('am force-stop com.android.chrome');
    await device.shell('logcat -c').catch(() => {});
    const context = await device.launchBrowser();
    context.setDefaultTimeout(20_000);
    context.setDefaultNavigationTimeout(45_000);
    await seedSession(context, loggedIn);
    await use(context);
    await context.close().catch(() => {});
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    for (const p of context.pages()) if (p !== page) await p.close().catch(() => {});   // tabs restored by Chrome
    await use(page);
  },

  mobile: async ({ page, context, device }, use) => {
    const m = androidPlatform(page, context, device, BASE_URL);
    await use(m);
    await m.restore();
  },

  evidence: [async ({ page, mobile, device }, use, testInfo) => {
    const logs = watchPage(page);
    await use(logs);
    if (testInfo.status !== testInfo.expectedStatus) await captureFailure({ page, testInfo, logs, device });
  }, { auto: true }],
});

module.exports = {
  test: TARGET === 'android' ? androidTest : webTest,
  expect: base.expect,
  TARGET,
  BASE_URL,
};
