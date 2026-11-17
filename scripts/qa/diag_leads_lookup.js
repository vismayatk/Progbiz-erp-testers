require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const NEEDLES = (process.argv[2] || 'QA_CHAIN_1788796109060,QA_FLOW_1788793303678').split(',');
(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const vp of [{ width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
    const page = await (await browser.newContext({ viewport: vp })).newPage();
    try { await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(1500);
      await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
      console.log(`\n── viewport ${vp.width}x${vp.height} ──`);
      const tabs = await page.evaluate(() => [...document.querySelectorAll('[id^="tab-"], .nav-link, [role="tab"]')].filter((e) => e.getClientRects().length).map((b) => ({ id: b.id || null, text: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 34) })).filter((b) => b.text && !/switcher|theme/i.test(b.id || '')));
      console.log('  tabs:', JSON.stringify(tabs));
      for (const t of [{ id: null, text: '(default)' }, ...tabs]) {
        if (t.text !== '(default)') { await page.locator(t.id ? `#${t.id}` : `text="${t.text}"`).first().click({ timeout: 8000 }).catch((e) => console.log('   click fail', t.text, e.message.split('\n')[0])); await page.waitForTimeout(3000); }
        const ps = await page.locator('#page_size').count(); await page.selectOption('#page_size', '100').catch((e) => console.log('   page_size fail:', e.message.split('\n')[0])); await page.waitForTimeout(2500);
        const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
        const found = NEEDLES.map((n) => `${n.slice(0, 12)}…=${rows.some((r) => r.includes(n)) ? 'FOUND@' + (rows.findIndex((r) => r.includes(n)) + 1) : 'no'}`).join(' ');
        console.log(`  ${t.text.padEnd(18)} page_size=${ps} rows=${String(rows.length).padStart(3)} · ${found} · first: ${rows[0]?.slice(0, 50)}`); }
      // the listing's own search box
      await page.locator('input[placeholder*="Search" i]').first().fill(NEEDLES[0]); await page.keyboard.press('Enter'); await page.waitForTimeout(3500);
      const sr = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
      console.log(`  search "${NEEDLES[0]}" → ${sr.length} rows: ${sr[0]?.slice(0, 90) || '-'}`);
    } catch (e) { console.log('FATAL:', e.message.split('\n')[0]); } finally { await page.context().close(); }
  }
  await browser.close();
})();
