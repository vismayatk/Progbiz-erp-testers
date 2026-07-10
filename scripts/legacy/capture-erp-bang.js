const { chromium } = require('@playwright/test');
const path = require('path');
const EV = 'C:/Users/PROBOOK/AppData/Local/Temp/claude/C--Users-PROBOOK-erp-tests-git-max/7ab0352e-1d83-4eb1-814d-6219ca09b978/scratchpad/site-audit/evidence';
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto('https://progbiz.io/solution/erp-software', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(3000);
  const el = p.getByText('slow you down', { exact: false }).first();
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(900);
  const bb = await el.boundingBox();
  await p.screenshot({ path: path.join(EV, 'W-erp-double-exclaim.png'), clip: { x: 0, y: Math.max(0, bb.y - 60), width: 1440, height: Math.min(bb.height + 140, 500) } });
  console.log('shot W-erp-double-exclaim.png; text =', JSON.stringify(await el.innerText()));
  await b.close();
})();
