'use strict';
/**
 * Read-only: what does the My Tasks "Action" anchor (send-plane icon) open?
 * Tries one normal task (Task Type ≠ "Enquiry Followup") and one Enquiry
 * Followup task, records whether #task-overview-modal opens or the page
 * navigates, and what the overview contains. Only the view anchor is
 * clicked — never start/hold/end/edit/delete.
 *
 *   node scripts/qa/diag_my_tasks_opener.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const REPO = path.join(__dirname, '..', '..');
const BASE = process.env.BASE_URL;
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const SHOTS = path.join(REPO, 'reports', 'qa', 'shots', 'drift-2026-09-18');
const OUT = { attempts: [] };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);
    const KINDS = { plain: /^(call|online meeting|activities|meeting)$/i, project: /^project task$/i, complaint: /^complaint$/i };
    const want = { plain: null, project: null, complaint: null };

    for (const tab of ['Today', 'Delayed', 'Upcoming', 'Completed']) {
      if (Object.values(want).every(Boolean)) break;
      await page.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3500);
      await page.locator('li.nav-item').filter({ hasText: new RegExp(`^\\s*${tab}\\s*\\d*\\s*$`, 'i') })
        .locator('button, a').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.selectOption('#page_size', '100').catch(() => {});
      await page.waitForTimeout(2000);
      const rows = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const t = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length)
          .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
        if (!t) return [];
        const hs = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
        const ti = hs.findIndex((h) => /^task type$/i.test(h)), si = hs.findIndex((h) => /^status$/i.test(h)), ni = hs.findIndex((h) => /^task$/i.test(h));
        return [...t.querySelectorAll('tbody tr')].map((r, i) => {
          const c = [...r.querySelectorAll('td')].map((td) => clean(td.innerText));
          return { i, type: c[ti], status: c[si], name: c[ni] };
        });
      });
      const types = {}; rows.forEach((r) => { types[r.type] = (types[r.type] || 0) + 1; });
      console.log(`  tab ${tab}: ${rows.length} rows · task types ${JSON.stringify(types)}`);
      OUT[`tab_${tab}`] = { rows: rows.length, types };

      for (const kind of Object.keys(KINDS)) {
        if (want[kind]) continue;
        const r = rows.find((x) => KINDS[kind].test((x.type || '').trim()));
        if (!r) continue;
        const before = page.url();
        await page.locator('table tbody tr').nth(r.i).locator('td').first().locator('a.btn').first().click({ timeout: 5000 }).catch((e) => console.log('   click err', e.message.split('\n')[0]));
        const opened = await page.locator('#task-overview-modal').waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
        await page.waitForTimeout(1500);
        const after = page.url();
        const inside = await page.evaluate(() => {
          const vis = (s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; };
          const m = document.querySelector('#task-overview-modal');
          return {
            txtChat: vis('#txtChat'), fileInputDocument: !!document.querySelector('#file-input-document'),
            paperclip: vis('#task-overview-modal .fe-paperclip'), moreVertical: vis('#task-overview-modal .fe-more-vertical'),
            btnSend: vis('#task-overview-modal .btn-send'),
            heading: (m?.querySelector('.modal-title, h5, h4')?.innerText || '').trim().slice(0, 60),
            icons: m ? [...new Set([...m.querySelectorAll('i')].map((e) => String(e.className)).filter(Boolean))].slice(0, 30) : [],
          };
        });
        const att = { kind, tab, row: r, opened, navigated: after !== before, urlAfter: after.replace(BASE, ''), ...inside };
        OUT.attempts.push(att); want[kind] = att;
        console.log(`   [${kind}] "${(r.name || '').slice(0, 40)}" type=${r.type} status=${r.status} → overviewOpened=${opened} navigated=${att.navigated} url=${att.urlAfter}`);
        console.log(`      txtChat=${inside.txtChat} file-input-document=${inside.fileInputDocument} paperclip=${inside.paperclip} ⋮=${inside.moreVertical} send=${inside.btnSend} heading="${inside.heading}"`);
        if (!inside.paperclip || !inside.moreVertical) console.log(`      modal icons: ${JSON.stringify(inside.icons)}`);
        await page.screenshot({ path: path.join(SHOTS, `A2_${kind}.png`) }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        await page.locator('#task-overview-modal .btn-close').first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(700);
        if (att.navigated) break; // page changed under us — reload the tab on the next loop pass
      }
    }
  } catch (e) {
    console.log('\nFATAL:', e.message.split('\n')[0].slice(0, 200));
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(REPO, 'reports', 'qa', 'raw', 'diag-my-tasks-opener.json'), JSON.stringify(OUT, null, 2));
})();
