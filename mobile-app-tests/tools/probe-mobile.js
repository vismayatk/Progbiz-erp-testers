'use strict';

/**
 * Read-only exploration: how does the HRMS web app behave on phone-sized screens?
 * Logs in on an emulated Pixel 7 (Chromium) and iPhone 14 (WebKit), visits the ESS
 * pages and records screenshots + layout facts (horizontal overflow, nav toggle,
 * touch-target sizes, console errors) to exploration/<device>/.
 *
 *   node tools/probe-mobile.js
 *   $env:HEADED=1; node tools/probe-mobile.js
 */
const fs = require('fs');
const path = require('path');
const { chromium, webkit, devices } = require('@playwright/test');
const { BASE_URL, creds } = require('../support/env');

const OUT = path.join(__dirname, '..', 'exploration');
const ROUTES = ['ess', 'ess/attendance', 'ess/leave', 'ess/payslips', 'ess/requests'];
const TARGETS = [
  { name: 'android-pixel7', engine: chromium, device: devices['Pixel 7'] },
  { name: 'ios-iphone14',   engine: webkit,   device: devices['iPhone 14'] },
];

async function waitReady(page) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForFunction(() => !/loading/i.test((document.body.innerText || '').slice(0, 500)),
    null, { timeout: 15000 }).catch(() => {});
}

function layoutFacts(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const visible = el => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const label = el => (el.innerText || el.getAttribute('aria-label') || el.title || el.value || '')
      .toString().trim().replace(/\s+/g, ' ').slice(0, 40);
    const cls = el => (typeof el.className === 'string' ? el.className : '').slice(0, 80);
    const inScroller = el => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
      }
      return false;
    };
    const offenders = [...document.querySelectorAll('body *')]
      .filter(el => visible(el) && el.getBoundingClientRect().right > vw + 2 && !inScroller(el));
    const outermost = offenders.filter(el => !offenders.includes(el.parentElement));

    const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button]')]
      .filter(visible);
    const box = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; };
    const small = controls.filter(el => { const b = box(el); return b.w < 24 || b.h < 24; });
    const sidebar = document.querySelector('nav, aside, .sidebar, [class*="sidebar" i]');

    return {
      path: location.pathname, vw, vh: window.innerHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      metaViewport: (document.querySelector('meta[name=viewport]') || {}).content || null,
      overflow: outermost.slice(0, 10).map(el => ({ tag: el.tagName.toLowerCase(), cls: cls(el), text: label(el), right: Math.round(el.getBoundingClientRect().right) })),
      smallTargetCount: small.length,
      smallTargets: small.slice(0, 20).map(el => ({ tag: el.tagName.toLowerCase(), text: label(el), ...box(el) })),
      topControls: controls.filter(el => el.getBoundingClientRect().top < 90).slice(0, 15)
        .map(el => ({ tag: el.tagName.toLowerCase(), text: label(el), aria: el.getAttribute('aria-label'), id: el.id, cls: cls(el), ...box(el) })),
      sidebar: sidebar && { tag: sidebar.tagName.toLowerCase(), cls: cls(sidebar), visible: visible(sidebar), ...box(sidebar) },
      headings: [...document.querySelectorAll('h1, h2, h3, h4')].filter(visible).map(label).slice(0, 12),
      buttons: controls.filter(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.classList.contains('btn'))
        .map(label).filter(Boolean).slice(0, 30),
      tables: [...document.querySelectorAll('table')].filter(visible).map(t => ({
        scrollW: t.scrollWidth, shownW: Math.round(t.getBoundingClientRect().width), inScroller: inScroller(t),
        headers: [...t.querySelectorAll('thead th')].map(th => th.innerText.trim()).slice(0, 12),
      })),
      inputs: [...document.querySelectorAll('input, select, textarea')].filter(visible).slice(0, 15).map(el => ({
        tag: el.tagName.toLowerCase(), id: el.id, name: el.name, type: el.type, placeholder: el.placeholder,
        autocomplete: el.autocomplete, hasLabel: !!(el.labels && el.labels.length), aria: el.getAttribute('aria-label'), ...box(el),
      })),
    };
  });
}

async function probe({ name, engine, device }) {
  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await engine.launch({ headless: !process.env.HEADED });
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  const consoleErrors = []; const failedRequests = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ path: new URL(page.url()).pathname, text: m.text().slice(0, 300) }); });
  page.on('requestfailed', r => failedRequests.push({ url: r.url().slice(0, 150), error: r.failure() && r.failure().errorText }));
  page.on('response', r => { if (r.status() >= 400) failedRequests.push({ url: r.url().slice(0, 150), status: r.status() }); });

  const facts = { device: name, userAgent: device.userAgent, viewport: device.viewport, pages: {} };
  const t0 = Date.now();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#companycode').waitFor({ state: 'visible', timeout: 60000 });
  facts.loginLoadMs = Date.now() - t0;
  facts.pages.login = await layoutFacts(page);
  await page.screenshot({ path: path.join(dir, 'login.png') });

  const { company, username, password } = creds();
  await page.locator('#companycode').fill(company);
  await page.locator('#signin-username').fill(username);
  await page.locator('#signin-password').fill(password);
  const t1 = Date.now();
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 45000 });
  await waitReady(page);
  facts.loginMs = Date.now() - t1;
  facts.landing = new URL(page.url()).pathname;
  facts.pages.landing = await layoutFacts(page);
  await page.screenshot({ path: path.join(dir, 'landing.png') });

  for (const route of ROUTES) {
    const t = Date.now();
    await page.goto(`${BASE_URL}/${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitReady(page);
    facts.pages[route] = { loadMs: Date.now() - t, ...(await layoutFacts(page)) };
    await page.screenshot({ path: path.join(dir, `${route.replace(/\//g, '__')}.png`) });
  }

  facts.consoleErrors = consoleErrors.slice(0, 40);
  facts.failedRequests = failedRequests.slice(0, 40);
  fs.writeFileSync(path.join(dir, 'facts.json'), JSON.stringify(facts, null, 2));
  await browser.close();
  console.log(`${name}: landing=${facts.landing} loginMs=${facts.loginMs} consoleErrors=${consoleErrors.length} failedRequests=${failedRequests.length}`);
}

(async () => {
  for (const target of TARGETS) {
    try { await probe(target); }
    catch (e) { console.error(`${target.name}: PROBE FAILED — ${e.message.split('\n')[0]}`); process.exitCode = 1; }
  }
})();
