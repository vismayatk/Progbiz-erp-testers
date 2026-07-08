'use strict';
/** QA verify ERP-1467: CRM Dynamic Report -> Task Report -> "Finish Before" filter
 *  should be a DATE-field structure (currently a period-type dropdown). */
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../erp/common/LoginPage');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };

async function findFinishBefore(page) {
  return page.evaluate(() => {
    // find a label/field referencing "finish before"
    const labels = [...document.querySelectorAll('label,th,span,div,button,option')].filter(e => /finish\s*before/i.test(e.textContent || ''));
    const out = [];
    for (const l of labels.slice(0, 6)) {
      const container = l.closest('div,td,th,.filter,.form-group') || l.parentElement;
      const field = container && (container.querySelector('input,select') || container.parentElement?.querySelector('input,select'));
      out.push({
        labelText: (l.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
        fieldTag: field ? field.tagName : null,
        fieldType: field ? (field.type || 'select') : null,
        // period-type dropdowns list options like All/Today/This Week
        options: field && field.tagName === 'SELECT' ? [...field.options].map(o => o.textContent.trim()).slice(0, 8) : null,
      });
    }
    return out;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const login = new LoginPage(page);
  try {
    await login.login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);
    // try likely routes for the CRM dynamic/task report
    const routes = ['dynamic-report', 'task-report', 'crm-report', 'reports', 'report', 'dynamic-reports'];
    let found = null;
    for (const r of routes) {
      await page.goto(`${login.baseUrl}/${r}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1800);
      const has404 = await page.evaluate(() => /nothing at this address|not found|404/i.test(document.body.innerText));
      const hasFinish = await page.evaluate(() => /finish\s*before/i.test(document.body.innerText));
      const title = await page.evaluate(() => (document.querySelector('h1,h2,h3,h4,.page-title,.breadcrumb')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40));
      console.log(`  /${r} → 404=${has404} finishBefore=${hasFinish} title="${title}"`);
      if (!has404 && hasFinish) { found = r; break; }
    }
    if (found) {
      const fb = await findFinishBefore(page);
      console.log('\nFinish Before field(s):', JSON.stringify(fb, null, 1));
      const isDate = fb.some(f => f.fieldType === 'date' || f.fieldType === 'datetime-local' || /date/i.test(f.fieldType || ''));
      const isPeriod = fb.some(f => f.fieldTag === 'SELECT' && (f.options || []).some(o => /today|this week|this month|all|custom|period/i.test(o)));
      console.log('VERDICT:', isDate ? 'FIXED — Finish Before is now a date field'
        : (isPeriod ? 'NOT FIXED — Finish Before is still a period-type dropdown'
                    : 'INCONCLUSIVE — could not classify the Finish Before filter'));
    } else {
      console.log('\nVERDICT: INCONCLUSIVE — could not locate the Task Report / Finish Before filter via common routes');
    }
    await page.screenshot({ path: 'screenshots/qa_1467.png', fullPage: true }).catch(() => {});
  } catch (e) { console.log('ERR:', e.message); } finally { await browser.close(); }
})();
