'use strict';
/**
 * UI scout — the AUTHENTICATED part: /home, /crm-dashboard, sidebar, header.
 *
 * STATUS: written but NOT yet executed against the signed-in app (no saved session existed when it
 * was written). Treat the selectors below as best knowledge from reports/qa/raw/element-inventory-lesol_test.json
 * (2026-09-18) and from the frames of reports/video/raw/*.webm.
 *
 * Needs reports/video/scout/.auth/state.json (create it with 00_save_auth_state_manual.js).
 * This script does NOT log in and does not read PASSWORD. If the saved session is rejected it stops.
 *
 * STRICTLY READ-ONLY. The only clicks are navigation chrome:
 *   #nav-dashboards, #nav-crm (expand a sidebar group) and #mainHeaderProfile (open the profile menu,
 *   closed again with Escape). It never clicks Create New, Start / Resume / End, Save, Delete ...
 *
 * Run from the repo root:  node scripts/video/scout/02_app_scout.js
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const L = require('./lib');

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const STATE = path.join(L.OUT, '.auth', 'state.json');
const SESSION = path.join(L.OUT, '.auth', 'session.json');

async function bailIfRateLimited(page, stats) {
  const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
  if (stats.http429 > 0 || /too many (attempts|requests)/i.test(txt)) {
    const e = new Error('RATE_LIMITED'); e.rateLimited = true; throw e;
  }
}

/** Wait until the Blazor page is really populated; returns ms since t0 at which it first looked stable. */
async function waitHydrated(page, t0, readySelector) {
  await page.locator('#sidebar').waitFor({ state: 'visible', timeout: 60000 });
  if (readySelector) await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
  let stableSince = null; let last = ''; const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const main = document.querySelector('.main-content') || document.body;
      const loaders = [...main.querySelectorAll('.spinner-border,.spinner-grow,.loader,.loading,[class*="skeleton"],[class*="dot-flashing"],[class*="dot-pulse"],[class*="loading"]')].filter(vis).length;
      const t = document.body.innerText;
      return { loaders, loadingText: /Loading\.\.\./i.test(t), sig: t.length + ':' + document.querySelectorAll('svg path, canvas, tbody tr').length };
    });
    const ok = s.loaders === 0 && !s.loadingText;
    if (ok && s.sig === last) { if (stableSince === null) stableSince = Date.now(); if (Date.now() - stableSince >= 900) return { hydrate_ms: stableSince - t0, settled: true }; }
    else stableSince = null;
    last = s.sig;
    await page.waitForTimeout(300);
  }
  return { hydrate_ms: Date.now() - t0, settled: false };
}

/** Regions that may show a person's name / phone / e-mail, in viewport CSS px at the current scroll. */
function privateRegionsInPage() {
  const out = [];
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const inView = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const add = (why, e) => { if (!inView(e)) return; const t = clean(e.innerText); out.push({ why, text: t.slice(0, 80), safe: /^demo customer\b/i.test(t), bbox: bb(e) }); };
  const prof = document.querySelector('#mainHeaderProfile'); if (prof) add('header: signed-in user name + avatar', prof);
  document.querySelectorAll('.main-content h1,.main-content h2,.main-content h3,.main-content h4,.main-content h5,.main-content h6,.main-content .page-title').forEach((h) => { if (/^(hey|hi|hello|welcome)\b/i.test(clean(h.innerText))) add('greeting with the user name', h); });
  document.querySelectorAll('table').forEach((t) => {
    const heads = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText).toLowerCase());
    t.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        const txt = clean(td.innerText); if (!txt) return;
        const head = heads[i] || '';
        if (i === 0 && /name|executive|customer|user|staff|assigned/.test(heads[0] || '') && !/^total$/i.test(txt)) add('table cell: person name (column "' + (heads[0] || '') + '")', td);
        else if (/name|customer|executive|assigned|phone|mobile|email|contact/.test(head) && !/^[\d.,\s₹%-]+$/.test(txt)) add('table cell under "' + head + '"', td);
      });
    });
  });
  const rxPhone = /(?:\+?\d[\d\s-]{8,}\d)/; const rxMail = /[\w.+-]+@[\w-]+\.[\w.]+/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walker.nextNode())) {
    const t = clean(n.nodeValue); if (!t || t.length > 120) continue;
    if ((rxMail.test(t) || (rxPhone.test(t) && t.replace(/\D/g, '').length >= 10)) && n.parentElement && !n.parentElement.closest('script,style')) add('text looks like a phone number or e-mail', n.parentElement);
  }
  document.querySelectorAll('img.avatar, .avatar img, img[class*="avatar"], img[src*="profile"], img[src*="user"]').forEach((e) => add('avatar / profile picture', e));
  return out;
}

function kpiAndChartsInPage() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const sel = (e) => (e.id ? '#' + CSS.escape(e.id) : null);
  const charts = [...document.querySelectorAll('.apexcharts-canvas, canvas')].filter(vis).map((c) => {
    const host = c.closest('[id]:not([id^="apexcharts"]):not([id^="Svgjs"])');
    const card = c.closest('.card');
    const title = card ? clean((card.querySelector('.card-title, .card-header, h5, h6') || {}).innerText) : '';
    return { hostSelector: host ? sel(host) : null, title, cardText: card ? clean(card.innerText).slice(0, 400) : '', bbox: bb(c), cardBbox: card ? bb(card) : null, scrollY: Math.round(scrollY) };
  });
  // leaf-ish boxes whose text is "label + number(s)"
  const cards = [];
  document.querySelectorAll('.main-content .card, .main-content a[id*="card"], .main-content [class*="card"], .main-content [id^="leads-followup"]').forEach((e) => {
    if (!vis(e)) return; const t = clean(e.innerText);
    if (!t || t.length > 90 || !/\d/.test(t)) return;
    if ([...e.querySelectorAll('.card, [class*="card"]')].some((k) => k !== e && vis(k) && clean(k.innerText) === t)) return;
    cards.push({ text: t, selector: sel(e) || (e.closest('[id]') ? sel(e.closest('[id]')) + ' (ancestor)' : null), classes: (typeof e.className === 'string' ? e.className : '').slice(0, 120), bbox: bb(e), scrollY: Math.round(scrollY) });
  });
  const filters = [...document.querySelectorAll('.main-content select, .main-content input, .main-content [id*="filter"]')].filter(vis).map((e) => ({
    selector: sel(e), tag: e.tagName.toLowerCase(), type: e.getAttribute('type'), placeholder: e.getAttribute('placeholder'),
    selectedText: e.tagName === 'SELECT' && e.selectedOptions[0] ? clean(e.selectedOptions[0].text) : null,
    optionCount: e.tagName === 'SELECT' ? e.options.length : null, // option texts may be staff/branch names: counted, not listed
    text: e.tagName === 'SELECT' ? null : clean(e.innerText).slice(0, 60), bbox: bb(e), scrollY: Math.round(scrollY),
  }));
  return { charts, cards, filters };
}

function sidebarTreeInPage() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const sb = document.querySelector('#sidebar'); if (!sb) return null;
  const cs = getComputedStyle(sb);
  const html = document.documentElement;
  const tree = [];
  const tops = sb.querySelectorAll('ul.main-menu > li');
  (tops.length ? [...tops] : [...sb.querySelectorAll('li.slide')]).forEach((li) => {
    const a = li.querySelector(':scope > a'); if (!a) { const t = clean(li.innerText); if (t) tree.push({ category: t }); return; }
    const kids = [...li.querySelectorAll(':scope > ul a')].map((k) => ({ label: clean(k.textContent), id: k.id || null, href: k.getAttribute('href'), visible: k.getBoundingClientRect().height > 0, bbox: bb(k) }));
    tree.push({ label: clean(a.textContent), id: a.id || null, selector: a.id ? '#' + CSS.escape(a.id) : null, href: a.getAttribute('href'), hasChildren: kids.length > 0, expanded: kids.some((k) => k.visible), classes: a.className, bbox: bb(a), children: kids });
  });
  return {
    width: Math.round(sb.getBoundingClientRect().width), height: Math.round(sb.getBoundingClientRect().height),
    backgroundColorRaw: cs.backgroundColor,
    htmlDataAttrs: [...html.attributes].filter((x) => x.name.startsWith('data-')).map((x) => `${x.name}=${x.value}`),
    collapsedByDefault: /close|icon|overlay/.test(html.getAttribute('data-toggled') || '') || sb.getBoundingClientRect().width < 120,
    searchInput: (() => { const i = sb.querySelector('input'); return i ? { placeholder: i.getAttribute('placeholder'), selector: i.id ? '#' + i.id : '#sidebar input', bbox: bb(i) } : null; })(),
    tree,
  };
}

function headerInPage() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const hd = document.querySelector('header.app-header, .app-header'); if (!hd) return null;
  const items = [...hd.querySelectorAll('a, button, img, span, h1, h2, h3, h4, h5, h6, p, div')].filter((e) => {
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && clean(n.nodeValue));
    return own || e.tagName === 'A' || e.tagName === 'BUTTON' || e.tagName === 'IMG';
  }).map((e) => ({ tag: e.tagName.toLowerCase(), id: e.id || null, classes: (typeof e.className === 'string' ? e.className : '').slice(0, 100), text: clean(e.innerText).slice(0, 80), title: e.getAttribute('title') || e.getAttribute('aria-label'), src: e.tagName === 'IMG' ? e.getAttribute('src') : null, bbox: bb(e) }));
  return { bbox: bb(hd), backgroundColorRaw: getComputedStyle(hd).backgroundColor, items };
}

(async () => {
  if (!BASE) { console.log('BASE_URL missing'); process.exit(2); }
  if (!fs.existsSync(STATE)) { console.log('NO_SAVED_SESSION: ' + STATE + ' does not exist. A person must run 00_save_auth_state_manual.js first.'); process.exit(3); }
  const stats = { http429: 0, http429Paths: [], httpErrors: [], pageErrors: [] };
  const run = { startedAt: new Date().toISOString(), pages: {} };
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: L.VIEWPORT, deviceScaleFactor: L.DSF, storageState: STATE });
  if (fs.existsSync(SESSION)) {
    const s = JSON.parse(fs.readFileSync(SESSION, 'utf8'));
    await ctx.addInitScript((d) => { try { if (location.origin === d.origin) for (const [k, v] of Object.entries(d.items)) if (sessionStorage.getItem(k) === null) sessionStorage.setItem(k, v); } catch (_) {} }, s);
  }
  const page = await ctx.newPage();
  L.watchNetwork(page, stats);
  let shotNo = 1;

  async function scoutPage(name, route, readySelector) {
    const rec = { route };
    const t0 = Date.now();
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const bounced = await Promise.race([
      page.locator('#sidebar').waitFor({ state: 'visible', timeout: 60000 }).then(() => false),
      page.locator('#signin-password').waitFor({ state: 'visible', timeout: 60000 }).then(() => true),
    ]).catch(() => null);
    if (bounced !== false) { const e = new Error(bounced ? 'SESSION_REJECTED: the app showed the login form' : 'APP_SHELL_NOT_VISIBLE'); e.auth = true; throw e; }
    await bailIfRateLimited(page, stats);
    Object.assign(rec, await waitHydrated(page, t0, readySelector));
    await page.waitForTimeout(1200); // chart animations
    rec.finalPath = new URL(page.url()).pathname;

    const dims = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight, vh: innerHeight }));
    rec.documentHeight = dims.docH;
    const maxY = Math.max(0, dims.docH - dims.vh);
    const ys = [0]; for (let y = 700; y < maxY + 700 && maxY > 0; y += 700) ys.push(Math.min(y, maxY));
    rec.screenshots = []; const priv = [];
    for (const y of [...new Set(ys)]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(500);
      const real = await page.evaluate(() => Math.round(scrollY));
      const f = `${String(shotNo).padStart(2, '0')}_${name}_s${real}.png`;
      await page.screenshot({ path: path.join(L.OUT, f) });
      rec.screenshots.push(f);
      priv.push({ screenshot: f, scrollY: real, regions: await page.evaluate(privateRegionsInPage) });
    }
    shotNo += 1;
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    L.writeText(path.join(L.OUT, `${name}.text.txt`), await page.evaluate(() => document.body.innerText));
    const elements = await page.evaluate(L.collectElementsInPage);
    const extra = await page.evaluate(kpiAndChartsInPage);
    L.writeJson(path.join(L.OUT, `${name}.elements.json`), { route, viewport: L.VIEWPORT, dsf: L.DSF, measuredAtScrollY: 0, note: 'bbox is viewport-relative at scrollY 0; add scrollY for document coordinates', count: elements.length, kpiCards: extra.cards, charts: extra.charts, filters: extra.filters, elements });
    L.writeJson(path.join(L.OUT, `${name}.private.json`), priv);
    run.pages[name] = rec;
    return rec;
  }

  try {
    L.ensureDir(path.join(L.OUT, 'brand'));
    shotNo = 2; await scoutPage('home', '/home', '#todayScheduletask');

    // header + sidebar, measured on /home
    const header = await page.evaluate(headerInPage);
    const sidebarDefault = await page.evaluate(sidebarTreeInPage);
    await page.locator('#sidebar').screenshot({ path: path.join(L.OUT, '04_sidebar_default.png') });
    if (header) await page.screenshot({ path: path.join(L.OUT, '04_header.png'), clip: { x: 0, y: 0, width: 1920, height: Math.max(68, header.bbox.h) } });
    const shell = await page.evaluate(L.stylesForSelectorsInPage, {
      sidebar: '#sidebar', sidebarHeader: '#sidebar .main-sidebar-header', navItem: '#nav-crm', navItemActive: '#sidebar .side-menu__item.active', navHome: '#nav-home',
      header: '.app-header', headerProfile: '#mainHeaderProfile', body: 'body', mainContent: '.main-content',
      primaryButton: '#new-task', card: '.main-content .card', link: '.main-content a[href]', footer: 'footer, .footer', pageTitle: '.main-content h1, .main-content h2, .main-content h3, .main-content h4, .main-content h5',
    });
    L.writeJson(path.join(L.OUT, 'brand', 'app_computed_styles.json'), shell);
    const sbLogos = await page.evaluate(() => [...document.querySelectorAll('#sidebar img, .app-header img')].map((e, i) => { const r = e.getBoundingClientRect(); e.setAttribute('data-scout-img', String(i)); return { i, src: e.getAttribute('src'), classes: e.className, visible: r.width > 0, bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }; }));
    for (const lg of sbLogos.filter((l) => l.visible && /logo/i.test((l.src || '') + l.classes))) {
      await page.locator(`[data-scout-img="${lg.i}"]`).screenshot({ path: path.join(L.OUT, 'brand', `logo_app_${lg.i}.png`) }).then(() => { lg.file = `brand/logo_app_${lg.i}.png`; }).catch(() => {});
    }

    // expand Dashboards, then CRM (navigation chrome only)
    const expanded = {};
    for (const [key, sel] of [['dashboards', '#nav-dashboards'], ['crm', '#nav-crm']]) {
      const a = page.locator(sel);
      if (await a.count()) {
        await a.scrollIntoViewIfNeeded().catch(() => {});
        await a.click({ timeout: 8000 });
        await page.waitForTimeout(900);
        expanded[key] = await page.evaluate(sidebarTreeInPage);
        await page.screenshot({ path: path.join(L.OUT, `04_sidebar_${key}_expanded.png`) });
        await page.locator('#sidebar').screenshot({ path: path.join(L.OUT, `04_sidebar_${key}_expanded_crop.png`) });
      } else expanded[key] = { error: `${sel} not found` };
    }
    // profile menu: open, look, close with Escape
    let profileMenu = null;
    const prof = page.locator('#mainHeaderProfile');
    if (await prof.count()) {
      await prof.click({ timeout: 8000 }); await page.waitForTimeout(600);
      profileMenu = await page.evaluate(() => [...document.querySelectorAll('.app-header .dropdown-menu.show a, .app-header .dropdown-menu.show button, .app-header .dropdown-menu.show li')].map((e) => { const r = e.getBoundingClientRect(); return { text: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60), href: e.getAttribute('href'), bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }; }));
      await page.screenshot({ path: path.join(L.OUT, '04_header_profile_menu.png') });
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      if (await page.locator('.app-header .dropdown-menu.show').count()) { await prof.click({ timeout: 8000 }).catch(() => {}); }
    }
    L.writeJson(path.join(L.OUT, 'shell.json'), { header, profileMenu, sidebarDefault, sidebarExpanded: expanded, logos: sbLogos });

    await page.waitForTimeout(1500);
    shotNo = 3; await scoutPage('crm-dashboard', '/crm-dashboard', '#lead-count-summary-chart');
    run.ok = true;
  } catch (e) {
    run.ok = false; run.error = String(e.message).split('\n')[0];
    if (e.rateLimited) run.rateLimited = true;
    if (e.auth) run.sessionRejected = true;
  } finally {
    run.net = stats;
    L.writeJson(path.join(L.OUT, 'app.run.json'), run);
    await ctx.close(); await browser.close();
    console.log(JSON.stringify(run, null, 1));
    if (!run.ok) process.exitCode = run.sessionRejected ? 4 : run.rateLimited ? 5 : 1;
  }
})();
