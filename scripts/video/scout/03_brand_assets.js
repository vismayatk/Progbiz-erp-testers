'use strict';
/**
 * UI scout, run 2 — BRAND ASSETS, unauthenticated, static only.
 * Opens the login page (nothing typed, nothing clicked), lists every <img> (visible or hidden),
 * renders each brand-logo image on a transparent background, and reads the layout/colour rules
 * that the app's own stylesheets DECLARE for the sidebar and the header.
 * Does not read PASSWORD.
 *
 * Run from the repo root:  node scripts/video/scout/03_brand_assets.js
 */
require('dotenv').config({ quiet: true });
const path = require('path');
const { chromium } = require('@playwright/test');
const L = require('./lib');

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');

(async () => {
  const stats = { http429: 0, http429Paths: [], httpErrors: [], pageErrors: [] };
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: L.VIEWPORT, deviceScaleFactor: L.DSF });
  const page = await ctx.newPage();
  L.watchNetwork(page, stats);
  const out = { startedAt: new Date().toISOString() };
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('#companycode').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    out.allImages = await page.evaluate(() => [...document.querySelectorAll('img')].map((e) => {
      const r = e.getBoundingClientRect();
      return { src: e.getAttribute('src'), currentSrc: e.currentSrc, alt: e.getAttribute('alt'), classes: e.className, naturalWidth: e.naturalWidth, naturalHeight: e.naturalHeight, renderedW: Math.round(r.width), renderedH: Math.round(r.height), visible: r.width > 0 && r.height > 0, parent: e.parentElement ? e.parentElement.tagName.toLowerCase() + '.' + e.parentElement.className : null };
    }));

    // what the stylesheets declare for the app shell
    out.shellRules = await page.evaluate(() => {
      const want = /(^|[\s,>])(\.app-sidebar|\.app-header|\.main-sidebar-header|\.main-sidebar|\.side-menu__item|\.side-menu__label|\.side-menu__icon|\.slide-menu|\.slide\b|\.main-content|\.app-content|\.header-content-left|\.header-content-right|\.header-link|\.header-logo|\.desktop-logo|\.desktop-dark|\.desktop-white|\.toggle-logo|\.toggle-dark|\.toggle-white|\.page-header-breadcrumb|\.custom-card|\.card\.custom-card|\.footer)\b/;
      const props = ['width', 'min-width', 'max-width', 'height', 'min-height', 'padding', 'padding-inline-start', 'margin-inline-start', 'margin-block-start', 'background', 'background-color', 'color', 'border', 'border-bottom', 'border-inline-end', 'border-radius', 'box-shadow', 'font-size', 'font-weight', 'letter-spacing', 'display', 'position', 'top', 'z-index', 'fill'];
      const res = [];
      const walk = (rules, href, media) => {
        for (const r of rules) {
          if (r.type === CSSRule.STYLE_RULE) {
            const sel = r.selectorText || '';
            if (sel.length < 220 && want.test(sel)) {
              const d = {};
              for (const p of props) { const v = r.style.getPropertyValue(p); if (v) d[p] = v.trim().slice(0, 160); }
              if (Object.keys(d).length && res.length < 1200) res.push({ sheet: href.split('/').pop(), media: media || null, selector: sel, decl: d });
            }
          } else if (r.cssRules) {
            try { walk(r.cssRules, href, r.conditionText || (r.media && r.media.mediaText) || media); } catch (_) {}
          }
        }
      };
      for (const s of document.styleSheets) { try { walk(s.cssRules, s.href || '(inline)', null); } catch (_) {} }
      return res;
    });

    // render each brand-logo image by itself, transparent background, 1200 CSS px wide (= 2400 px PNG)
    const logoSrcs = [...new Set(out.allImages.map((i) => i.currentSrc || '').filter((s) => /brand-logos/i.test(s)))];
    const icon = await page.evaluate(() => { const l = document.querySelector('link[rel~="icon"]'); return l ? l.href : null; });
    if (icon) logoSrcs.push(icon);
    out.rendered = [];
    const p2 = await ctx.newPage();
    // p2 stays on about:blank (an HTML document); the <img> uses the absolute asset URL
    for (const src of [...new Set(logoSrcs)]) {
      const name = src.split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9_-]+/gi, '_');
      const rec = { src, name };
      try {
        await p2.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="${src}" style="display:block"></body></html>`, { waitUntil: 'load' });
        const nat = await p2.evaluate(() => { const i = document.getElementById('i'); return { w: i.naturalWidth, h: i.naturalHeight }; });
        rec.naturalWidth = nat.w; rec.naturalHeight = nat.h;
        if (!nat.w) throw new Error('image did not load');
        const cssW = Math.min(1200, nat.w);
        await p2.evaluate((w) => { document.getElementById('i').style.width = w + 'px'; }, cssW);
        const f = `logo_${name}_${cssW * L.DSF}w.png`;
        await p2.locator('#i').screenshot({ path: path.join(L.OUT, 'brand', f), omitBackground: true, timeout: 10000 });
        rec.file = `brand/${f}`;
        // same logo on the app's dark menu colour, for a quick visual check
        await p2.evaluate(() => { document.body.style.background = 'rgb(7,21,39)'; document.body.style.padding = '40px'; });
        const f2 = `logo_${name}_on_menu_bg.png`;
        await p2.locator('body').screenshot({ path: path.join(L.OUT, 'brand', f2), timeout: 10000 });
        rec.previewOnDark = `brand/${f2}`;
      } catch (e) { rec.error = String(e.message).split('\n')[0].slice(0, 160); }
      out.rendered.push(rec);
    }
    await p2.close();
    out.ok = true;
  } catch (e) {
    out.ok = false; out.error = String(e.message).split('\n')[0];
  } finally {
    out.net = stats;
    L.writeJson(path.join(L.OUT, 'brand', 'brand_assets.json'), out);
    await ctx.close(); await browser.close();
    console.log(JSON.stringify({ ok: out.ok, error: out.error, images: out.allImages, rendered: out.rendered, shellRules: (out.shellRules || []).length, http429: stats.http429 }, null, 1));
  }
})();
