'use strict';
/**
 * Shared helpers for the beta.progbiz.io product-video scripts.
 * Opens a headless context that reuses the session saved by 00_sign_in.js.
 * READ-ONLY by design: helpers here only navigate, wait, read and screenshot.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE = 'https://beta.progbiz.io';
const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'reports', 'video', 'beta');
const AUTH = path.join(OUT, '.auth', 'state.json');

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

async function openApp({ dsf = 1, headless = true, viewport = { width: 1920, height: 1080 } } = {}) {
  if (!fs.existsSync(AUTH)) throw new Error('No saved session — run scripts/video/beta/00_sign_in.js first');
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, storageState: AUTH });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

/** Navigate to a route and wait until the Blazor page stops showing loaders. */
async function visit(page, route, { settleMs = 1500, maxMs = 30000 } = {}) {
  const t0 = Date.now();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const txt = document.body ? document.body.innerText : '';
    const busy = document.querySelectorAll('.spinner-border, .spinner-grow, .loading, .skeleton, [class*="loader"]:not([style*="display: none"])');
    const visibleBusy = [...busy].some(e => e.offsetParent !== null);
    return txt.length > 200 && !/^\s*Loading\.\.\.\s*$/m.test(txt) && !visibleBusy;
  }, null, { timeout: maxMs }).catch(() => {});
  await page.waitForTimeout(settleMs);
  const onLogin = /\/login/i.test(new URL(page.url()).pathname);
  return { ms: Date.now() - t0, url: page.url(), onLogin };
}

module.exports = { BASE, ROOT, OUT, AUTH, ensureDir, openApp, visit };
