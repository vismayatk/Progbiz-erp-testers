'use strict';

/**
 * Platform actions with ONE api for both targets, so specs never branch on the platform.
 * Anything a spec changes (network, orientation) is undone by restore() after the test —
 * which runs only AFTER the evidence fixture has captured a failing screen.
 *
 *                 web (emulation)                     android (real device via adb)
 *  setOffline     context.setOffline                  airplane mode
 *  background     switch to another tab and back      HOME key, then relaunch Chrome
 *  rotate         swap viewport width/height          system user_rotation
 *  geolocation    grant + emulate coordinates         grant + emulate coordinates (CDP)
 */

function webPlatform(page, context, baseURL) {
  const state = { offline: false, rotated: false, viewport: page.viewportSize() };
  return {
    name: 'web',
    async setOffline(on) {
      await context.setOffline(on);
      state.offline = on;
      await page.waitForFunction(o => navigator.onLine === !o, on, { timeout: 10_000, polling: 200 }).catch(() => {});
    },
    async background(ms = 3000) {
      const other = await context.newPage();
      await other.bringToFront();
      await other.waitForTimeout(ms);          // time spent in the background IS the scenario
      await page.bringToFront();
      await other.close();
    },
    async rotate(orientation) {
      const { width, height } = state.viewport;
      const long = Math.max(width, height);
      const short = Math.min(width, height);
      const landscape = orientation === 'landscape';
      await page.setViewportSize(landscape ? { width: long, height: short } : { width: short, height: long });
      state.rotated = landscape;
    },
    async setGeolocation(coords) {
      await context.grantPermissions(['geolocation'], { origin: baseURL });
      await context.setGeolocation(coords);
    },
    async denyGeolocation() {
      await context.clearPermissions();        // Playwright denies any permission not granted
    },
    async restore() {
      if (state.offline) await context.setOffline(false).catch(() => {});
      if (state.rotated && state.viewport) await page.setViewportSize(state.viewport).catch(() => {});
    },
  };
}

function androidPlatform(page, context, device, baseURL) {
  const state = { offline: false, rotated: false };
  const sh = cmd => device.shell(cmd).then(b => b.toString());
  return {
    name: 'android',
    async setOffline(on) {
      await sh(`cmd connectivity airplane-mode ${on ? 'enable' : 'disable'}`);
      state.offline = on;
      await page.waitForFunction(o => navigator.onLine === !o, on, { timeout: 20_000, polling: 250 }).catch(() => {});
    },
    async background(ms = 3000) {
      await sh('input keyevent KEYCODE_HOME');
      await page.waitForFunction(() => document.visibilityState === 'hidden', null, { timeout: 10_000, polling: 250 }).catch(() => {});
      await page.waitForTimeout(ms);           // time spent in the background IS the scenario
      await sh('monkey -p com.android.chrome -c android.intent.category.LAUNCHER 1');
      await page.waitForFunction(() => document.visibilityState === 'visible', null, { timeout: 15_000, polling: 250 });
    },
    async rotate(orientation) {
      const landscape = orientation === 'landscape';
      await sh(`settings put system accelerometer_rotation 0; settings put system user_rotation ${landscape ? 1 : 0}`);
      state.rotated = landscape;
      await page.waitForFunction(l => (window.innerWidth > window.innerHeight) === l, landscape, { timeout: 15_000, polling: 250 });
    },
    async setGeolocation(coords) {
      await context.grantPermissions(['geolocation'], { origin: baseURL });
      await context.setGeolocation(coords);
    },
    async denyGeolocation() {
      await context.clearPermissions();
    },
    async restore() {
      if (state.offline) await sh('cmd connectivity airplane-mode disable').catch(() => {});
      if (state.rotated) await sh('settings put system user_rotation 0').catch(() => {});
    },
  };
}

module.exports = { webPlatform, androidPlatform };
