'use strict';
/** Probe /employee-deduction Cancel button state after filling the form. */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: 'hrms/.auth/state.json', viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://hrms-erp.progbiz.in/employee-deduction', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await page.locator('input#amount').fill('1').catch(e => console.log('amount fill failed:', e.message.split('\n')[0]));

  const report = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('button')) {
      const t = (b.innerText || '').trim();
      if (!/cancel/i.test(t)) continue;
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const topEl = r.width && r.height
        ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        : null;
      out.push({
        text: t, cls: b.className.slice(0, 60), disabled: b.disabled,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        display: cs.display, visibility: cs.visibility, pointerEvents: cs.pointerEvents,
        coveredBy: topEl && topEl !== b && !b.contains(topEl) ? (topEl.id || topEl.className.toString().slice(0, 60) || topEl.tagName) : null,
        inSidebarFreeMain: !!b.closest('.main-content'),
      });
    }
    return out;
  });
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
