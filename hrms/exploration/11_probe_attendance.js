'use strict';
/** Probe shift-roster #activeOnlyCheck and timesheet date inputs. */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: 'hrms/.auth/state.json', viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500); };

  await page.goto('https://hrms-erp.progbiz.in/shift-roster', { waitUntil: 'domcontentloaded' }); await settle();
  const cb = await page.evaluate(() => {
    const el = document.querySelector('#activeOnlyCheck');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const label = document.querySelector('label[for="activeOnlyCheck"]');
    const topEl = r.width && r.height ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
    return {
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity, pointerEvents: cs.pointerEvents,
      coveredBy: topEl && topEl !== el ? (topEl.id || String(topEl.className).slice(0, 60) || topEl.tagName) : null,
      hasLabel: !!label, labelText: label ? label.innerText.trim() : null,
      inViewport: r.y >= 0 && r.y < 900,
    };
  });
  console.log('shift-roster #activeOnlyCheck:', JSON.stringify(cb, null, 1));

  await page.goto('https://hrms-erp.progbiz.in/timesheet', { waitUntil: 'domcontentloaded' }); await settle();
  const dates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.main-content input[type="date"]')).map(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const topEl = r.width && r.height ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
      return {
        id: el.id || null, cls: String(el.className).slice(0, 40), disabled: el.disabled, readOnly: el.readOnly,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        display: cs.display, visibility: cs.visibility,
        coveredBy: topEl && topEl !== el && !el.contains(topEl) ? (topEl.id || String(topEl.className).slice(0, 60) || topEl.tagName) : null,
        inViewport: r.y >= 0 && r.y < 900,
      };
    });
  });
  console.log('timesheet date inputs:', JSON.stringify(dates, null, 1));

  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
