'use strict';
/**
 * UI scout, run 1 — the LOGIN PAGE, unauthenticated, before anything is typed.
 * Read-only: this script never types, clicks or submits. It does not read PASSWORD at all.
 *
 * Run from the repo root:  node scripts/video/scout/01_login_scout.js
 * Output: reports/video/scout/
 */
require('dotenv').config({ quiet: true });
const path = require('path');
const { chromium } = require('@playwright/test');
const L = require('./lib');

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');

(async () => {
  if (!BASE) { console.log('BASE_URL missing'); process.exit(2); }
  L.ensureDir(L.OUT); L.ensureDir(path.join(L.OUT, 'brand'));
  const stats = { http429: 0, http429Paths: [], httpErrors: [], pageErrors: [] };
  const resources = [];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: L.VIEWPORT, deviceScaleFactor: L.DSF });
  const page = await ctx.newPage();
  L.watchNetwork(page, stats);
  page.on('response', (r) => {
    const t = r.request().resourceType();
    if (['stylesheet', 'image', 'font'].includes(t)) {
      let u = r.url(); try { const x = new URL(u); u = x.origin + x.pathname; } catch (_) {}
      resources.push({ type: t, status: r.status(), url: u.slice(0, 300) });
    }
  });

  const result = { page: 'login', route: '/login', startedAt: new Date().toISOString() };
  try {
    const t0 = Date.now();
    await page.goto(`${BASE}/login`, { waitUntil: 'commit', timeout: 60000 });
    result.t_commit_ms = Date.now() - t0;
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
    result.t_domcontentloaded_ms = Date.now() - t0;
    await page.locator('#companycode, input[type="password"]').first().waitFor({ state: 'visible', timeout: 60000 });
    result.t_form_visible_ms = Date.now() - t0;
    // hydrated = form visible AND no "Loading..." text AND fonts ready
    await page.waitForFunction(() => !/Loading\.\.\./i.test(document.body.innerText) && document.fonts.status === 'loaded', null, { timeout: 30000 }).catch(() => {});
    result.hydrate_ms = Date.now() - t0;
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    result.t_networkidle_ms = Date.now() - t0;
    await page.waitForTimeout(800);

    result.finalUrlPath = new URL(page.url()).pathname;
    result.title = await page.title();
    const dims = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight,
      bodyScrollHeight: document.body.scrollHeight, innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio,
    }));
    result.dims = dims;

    // screenshots
    result.screenshots = [];
    const maxY = Math.max(0, dims.scrollHeight - dims.innerHeight);
    const ys = [0]; for (let y = 700; y < maxY + 700 && maxY > 0; y += 700) ys.push(Math.min(y, maxY));
    for (const y of [...new Set(ys)]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(350);
      const real = await page.evaluate(() => Math.round(window.scrollY));
      const f = `01_login_s${real}.png`;
      await page.screenshot({ path: path.join(L.OUT, f) });
      result.screenshots.push(f);
    }
    await page.evaluate(() => window.scrollTo(0, 0));

    // text + elements
    L.writeText(path.join(L.OUT, 'login.text.txt'), await page.evaluate(() => document.body.innerText));
    const elements = await page.evaluate(L.collectElementsInPage);
    L.writeJson(path.join(L.OUT, 'login.elements.json'), { route: '/login', viewport: L.VIEWPORT, dsf: L.DSF, measuredAtScrollY: 0, count: elements.length, elements });

    // are any fields pre-filled?
    result.prefilled = elements.filter((e) => e.kind === 'input').map((e) => ({ selector: e.selector, type: e.type, valueLength: e.valueLength }));

    // head metadata
    result.head = await page.evaluate(() => ({
      icons: [...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]')].map((l) => ({ rel: l.rel, href: l.getAttribute('href'), sizes: l.getAttribute('sizes') })),
      metaTheme: (document.querySelector('meta[name="theme-color"]') || {}).content || null,
      htmlAttrs: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`),
      bodyClass: document.body.className,
      loadedFonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`),
      declaredFonts: [...new Set([...document.fonts].map((f) => f.family))],
    }));

    // brand colours (computed) on the login page
    const styles = await page.evaluate(L.stylesForSelectorsInPage, {
      html: 'html', body: 'body',
      primaryButton: 'button[type="submit"]',
      anyBtnPrimary: '.btn-primary',
      firstLink: 'a[href]',
      companyInput: '#companycode',
      usernameInput: '#signin-username',
      firstHeading: 'h1,h2,h3,h4,h5',
      firstLabel: 'label',
      card: '.card, .card-body, [class*="login"], [class*="auth"]',
    });
    const allLinks = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => a.getBoundingClientRect().width > 0).map((a) => {
      const cs = getComputedStyle(a); return { text: (a.innerText || '').trim().slice(0, 60), href: a.getAttribute('href'), colorRaw: cs.color };
    }));
    const sheetProbe = await page.evaluate(L.stylesheetProbeInPage);
    L.writeJson(path.join(L.OUT, 'brand', 'login_computed_styles.json'), { styles, allLinks });
    L.writeJson(path.join(L.OUT, 'brand', 'stylesheet_probe.json'), sheetProbe);
    L.writeJson(path.join(L.OUT, 'brand', 'login_resources.json'), resources);

    // logo candidates: <img>, large inline <svg>, elements with a CSS background-image
    const logos = await page.evaluate(() => {
      const out = [];
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
      const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      let i = 0;
      document.querySelectorAll('img').forEach((e) => { if (!vis(e)) return; e.setAttribute('data-scout-logo', String(++i)); out.push({ n: i, how: 'img', src: e.getAttribute('src'), currentSrc: e.currentSrc, alt: e.getAttribute('alt'), naturalWidth: e.naturalWidth, naturalHeight: e.naturalHeight, classes: e.className, id: e.id || null, bbox: bb(e), parentClasses: e.parentElement ? e.parentElement.className : null }); });
      document.querySelectorAll('svg').forEach((e) => { if (!vis(e) || e.getBoundingClientRect().width < 40) return; e.setAttribute('data-scout-logo', String(++i)); out.push({ n: i, how: 'inline-svg', viewBox: e.getAttribute('viewBox'), classes: e.getAttribute('class'), bbox: bb(e) }); });
      document.querySelectorAll('body *').forEach((e) => {
        const bg = getComputedStyle(e).backgroundImage;
        if (bg && bg !== 'none' && /url\(/.test(bg) && vis(e)) { e.setAttribute('data-scout-logo', String(++i)); out.push({ n: i, how: 'css-background', backgroundImage: bg.slice(0, 400), tag: e.tagName.toLowerCase(), classes: typeof e.className === 'string' ? e.className : '', bbox: bb(e) }); }
      });
      return out;
    });
    for (const lg of logos) {
      const f = `logo_login_${String(lg.n).padStart(2, '0')}_${lg.how}.png`;
      try {
        await page.locator(`[data-scout-logo="${lg.n}"]`).screenshot({ path: path.join(L.OUT, 'brand', f), timeout: 8000 });
        lg.file = `brand/${f}`;
      } catch (e) { lg.file = null; lg.error = String(e.message).split('\n')[0].slice(0, 160); }
    }

    // render each <img> logo on its own at natural size with a transparent background
    const p2 = await ctx.newPage();
    for (const lg of logos.filter((l) => l.how === 'img' && l.currentSrc && l.naturalWidth > 0)) {
      try {
        await p2.goto(`${BASE}/favicon.ico`, { waitUntil: 'commit', timeout: 15000 }).catch(() => {});
        await p2.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="${lg.currentSrc}" style="display:block"></body></html>`, { waitUntil: 'load' });
        const f = `logo_login_${String(lg.n).padStart(2, '0')}_img_natural_transparent.png`;
        await p2.locator('#i').screenshot({ path: path.join(L.OUT, 'brand', f), omitBackground: true, timeout: 8000 });
        lg.naturalFile = `brand/${f}`;
      } catch (e) { lg.naturalError = String(e.message).split('\n')[0].slice(0, 160); }
    }
    await p2.close();
    L.writeJson(path.join(L.OUT, 'brand', 'login_logos.json'), logos);
    result.logoCount = logos.length;

    // What does an unauthenticated visitor get on /home ? (one navigation, nothing typed)
    const t1 = Date.now();
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => /\/login/i.test(location.pathname) || document.querySelector('input[type="password"]'), null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    result.unauthenticatedHome = {
      endedOnPath: new URL(page.url()).pathname,
      ms: Date.now() - t1,
      passwordFieldPresent: await page.locator('input[type="password"]').count() > 0,
      textHead: (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200),
    };
    await page.screenshot({ path: path.join(L.OUT, '01_home_unauthenticated_s0.png') });

    result.tooManyText = /too many (attempts|requests)/i.test(await page.evaluate(() => document.body.innerText));
    result.ok = true;
  } catch (e) {
    result.ok = false;
    result.error = String(e.message).split('\n')[0];
  } finally {
    result.net = stats;
    L.writeJson(path.join(L.OUT, 'login.run.json'), result);
    await ctx.close(); await browser.close();
    console.log(JSON.stringify({ ok: result.ok, error: result.error, hydrate_ms: result.hydrate_ms, t_form_visible_ms: result.t_form_visible_ms, t_networkidle_ms: result.t_networkidle_ms, title: result.title, dims: result.dims, screenshots: result.screenshots, logoCount: result.logoCount, unauth: result.unauthenticatedHome, http429: stats.http429, httpErrors: stats.httpErrors.slice(0, 10), pageErrors: stats.pageErrors.slice(0, 5) }, null, 1));
  }
})();
