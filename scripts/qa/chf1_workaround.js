require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
(async () => {
  const browser = await chromium.launch({ headless: true }); const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try { await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);
    // A · did the step-3 follow-up land on the enquiry?
    await page.goto(`${BASE}/enquiry-overview/396806`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
    const tab = page.locator('a,button,li').filter({ hasText: /^\s*Follow\s*-?\s*ups?\s*(\(\d+\))?\s*$/i }).first(); if (await tab.count()) { await tab.click().catch(() => {}); await page.waitForTimeout(2500); }
    const txt = await page.evaluate(() => document.body.innerText); const hits = (txt.match(/CH-F1 rootcause [ABC] \d+/g) || []);
    console.log(`A · enquiry 396806 follow-up entries found: ${JSON.stringify([...new Set(hits)])}  (expected only "rootcause B" — the one saved with a date)`);
    // B · workaround: tick "Not Required" on the date, keep the bad default → Save
    await page.locator('#btn-add-followup').click(); await page.waitForTimeout(3000); const m = page.locator('.modal.show').first();
    const s = m.locator('#followup-status'); const v = await s.locator('option').evaluateAll((os) => os.find((o) => o.textContent.trim() === 'Awaiting')?.value); await s.selectOption(v); await page.waitForTimeout(1500);
    const q = m.locator('#lead-quality'); const qv = await q.locator('option').evaluateAll((os) => os.find((o) => o.value && o.value !== '0' && !/^(choose|create)/i.test(o.textContent.trim()))?.value); await q.selectOption(qv);
    await m.locator('#followup-description').fill(`CH-F1 workaround D ${Date.now()}`);
    const before = await page.evaluate(() => { const e = document.querySelector('#next-followup-date'); return e ? { value: e.value, min: e.min, invalid: !e.validity.valid } : 'absent'; });
    const nr = m.locator('label:has-text("Not Required") input[type=checkbox], input[type=checkbox]').first(); await nr.check().catch(async () => m.locator('text=Not Required').click());
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => { const e = document.querySelector('#next-followup-date'); return e ? { present: true, visible: !!e.getClientRects().length, value: e.value, min: e.min, invalid: !e.validity.valid, disabled: e.disabled } : { present: false }; });
    const reqs = []; page.on('request', (r) => { if (/\/api\/crm\/save-followup/.test(r.url())) reqs.push(r.method() + ' save-followup'); });
    let status = null; page.on('response', (r) => { if (/save-followup/.test(r.url())) status = r.status(); });
    await m.locator('#btn-save-followup').click({ timeout: 8000 }).catch((e) => console.log('click:', e.message.split('\n')[0])); await page.waitForTimeout(6000);
    const open = await page.evaluate(() => !!document.querySelector('.modal.show'));
    console.log(`B · date before tick: ${JSON.stringify(before)}\n    after "Not Required": ${JSON.stringify(after)}\n    Save → ${reqs.join(', ') || 'NO REQUEST'}${status ? ' HTTP ' + status : ''} · modal ${open ? 'STILL OPEN' : 'CLOSED'}`);
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0]); } finally { await browser.close(); }
})();
