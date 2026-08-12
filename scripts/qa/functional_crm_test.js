'use strict';
/**
 * Functional CRM test — drives the app the way a user does, then checks the
 * data it gets back is actually correct.
 *
 * The interesting assertion here is filter correctness: apply a filter, then
 * verify EVERY returned row genuinely matches it. A filter that quietly
 * ignores its input still returns rows and still looks fine on screen, so
 * nothing but a row-by-row check will catch it.
 *
 * Creates one enquiry (QA_<timestamp>) and one follow-up on it. Deletes
 * nothing, touches no other record.
 *
 *   node scripts/qa/functional_crm_test.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const { EnquiryPage } = require('../../erp/crm/pages/EnquiryPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};

const STAMP = Date.now();
const CUSTOMER = `QA_${STAMP}`;
const results = [];

function record(id, title, pass, detail) {
  results.push({ id, title, pass, detail });
  console.log(`  ${pass ? '✅' : '❌'} ${id} ${title}${detail ? ` — ${detail}` : ''}`);
}

/** dd/mm/yyyy for "today", matching the grid's display format. */
function todayDMY() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Read the visible grid as {columns, rows:[{col:value}]}. */
const readGrid = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const onScreen = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const tables = [...document.querySelectorAll('table')].filter(onScreen);
  // The listing grid is the visible table with the most header cells.
  const t = tables.sort((a, b) =>
    b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { columns: [], rows: [] };
  const columns = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
  const rows = [...t.querySelectorAll('tbody tr')].map((r) => {
    const cells = [...r.querySelectorAll('td')].map((c) => clean(c.innerText));
    const o = {};
    columns.forEach((c, i) => { o[c || `col${i}`] = cells[i] ?? ''; });
    o.__raw = cells.join(' | ');
    return o;
  });
  return { columns, rows };
};

/**
 * Choose an option in the filter panel by the control's visible LABEL rather
 * than its id — several filter selects share id="inputState", so selecting by
 * id would drive the wrong control.
 */
async function setFilterByLabel(page, labelText, optionText) {
  return page.evaluate(({ labelText, optionText }) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const onScreen = (e) => {
      if (e.getClientRects().length === 0) return false;
      const s = getComputedStyle(e);
      return s.display !== 'none' && s.visibility !== 'hidden';
    };
    const panel = [...document.querySelectorAll('.offcanvas.show, .modal.show')].filter(onScreen)[0]
      || document.body;
    const selects = [...panel.querySelectorAll('select')].filter(onScreen);
    const want = clean(labelText);
    const target = selects.find((s) => {
      const grp = s.closest('.form-group, .col, .mb-3, div');
      const lbl = grp && grp.querySelector('label');
      return lbl && clean(lbl.innerText) === want;
    });
    if (!target) return { ok: false, why: `no select labelled "${labelText}"` };
    const opt = [...target.options].find((o) => clean(o.text) === clean(optionText));
    if (!opt) {
      return { ok: false, why: `no option "${optionText}"`, available: [...target.options].map((o) => o.text.trim()).slice(0, 10) };
    }
    target.value = opt.value;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, chose: opt.text.trim(), id: target.id };
  }, { labelText, optionText });
}

async function openFilter(page) {
  await page.locator('#btn-toggle-filter, button:has-text("Filter")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
async function applyFilter(page) {
  await page.locator('#btn-apply-filter').click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(3500);
}
async function clearFilter(page) {
  await openFilter(page);
  await page.locator('#btn-clear-filter').click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const evidence = { customer: CUSTOMER, stamp: STAMP, today: todayDMY() };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(1500);

    // ══ 1. Create a lead ═══════════════════════════════════════════════════
    console.log('\n── 1. Create lead ──');
    const enq = new EnquiryPage(page);
    await enq.openAddForm();
    await page.waitForTimeout(1500);
    await page.locator('#TxtCustomer').fill(CUSTOMER).catch(() => {});
    await page.locator('#customer-phone').fill(String(STAMP).slice(-10)).catch(() => {});

    const chosen = {};
    for (const [id, key] of [['#assignto', 'assignee'], ['#leadsource', 'leadSource']]) {
      chosen[key] = await page.locator(id).evaluate((s) => {
        const o = [...s.options].filter((x) => x.value && x.value !== '0');
        if (!o.length) return null;
        s.value = o[0].value; s.dispatchEvent(new Event('change', { bubbles: true }));
        return o[0].text.trim();
      }).catch(() => null);
    }
    await enq.addItem('Inverter', '1').catch(() => {});
    await page.locator('#btn-save-enquiry').click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const overviewUrl = page.url();
    record('T-01', 'Create lead saves and redirects', /enquiry-overview/.test(overviewUrl),
      `${overviewUrl.replace(BASE, '')} · source=${chosen.leadSource} assignee=${chosen.assignee}`);
    evidence.created = { overviewUrl: overviewUrl.replace(BASE, ''), ...chosen };

    // ══ 2. Lead appears in /leads ══════════════════════════════════════════
    console.log('\n── 2. Lead appears in listing ──');
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    let grid = await page.evaluate(readGrid);
    const mine = grid.rows.find((r) => r.__raw.includes(CUSTOMER));
    record('T-02', 'New lead is listed in /leads', !!mine, mine ? `row: ${mine['Number']} ${mine['Customer Name']}` : 'not found');
    evidence.leadRow = mine || null;
    const unfilteredCount = grid.rows.length;

    // ══ 3. Filter correctness — /leads ═════════════════════════════════════
    console.log('\n── 3. Filter correctness on /leads ──');

    // 3a. Lead Source — every returned row must carry that source.
    const srcWanted = chosen.leadSource;
    await openFilter(page);
    const setSrc = await setFilterByLabel(page, 'Lead Source', srcWanted);
    await applyFilter(page);
    grid = await page.evaluate(readGrid);
    if (!setSrc.ok) {
      record('T-03', 'Filter by Lead Source', false, setSrc.why);
    } else {
      const bad = grid.rows.filter((r) => (r['Lead Source'] || '').trim() !== srcWanted);
      record('T-03', `Filter Lead Source = "${srcWanted}" returns only matching rows`,
        grid.rows.length > 0 && bad.length === 0,
        `${grid.rows.length} row(s), ${bad.length} mismatched` +
        (bad.length ? ` → e.g. "${bad[0]['Lead Source']}"` : ''));
      evidence.filterLeadSource = { wanted: srcWanted, returned: grid.rows.length, mismatched: bad.length,
        sample: bad.slice(0, 3).map((r) => r.__raw.slice(0, 90)) };
    }
    await clearFilter(page);

    // 3b. Date Added = Today — every row's Date Added must be today.
    await openFilter(page);
    const setDate = await setFilterByLabel(page, 'Date Added', 'Today');
    await applyFilter(page);
    grid = await page.evaluate(readGrid);
    if (!setDate.ok) {
      record('T-04', 'Filter by Date Added = Today', false, setDate.why);
    } else {
      const t = todayDMY();
      const bad = grid.rows.filter((r) => !(r['Date Added'] || '').startsWith(t));
      record('T-04', `Filter Date Added = Today (${t}) returns only today's rows`,
        bad.length === 0, `${grid.rows.length} row(s), ${bad.length} not today` +
        (bad.length ? ` → e.g. "${bad[0]['Date Added']}"` : ''));
      const hasMine = grid.rows.some((r) => r.__raw.includes(CUSTOMER));
      record('T-05', 'Lead created today appears under Date Added = Today', hasMine,
        hasMine ? 'present' : 'MISSING from today filter');
      evidence.filterDateToday = { today: t, returned: grid.rows.length, mismatched: bad.length,
        containsNewLead: hasMine, sample: bad.slice(0, 3).map((r) => r['Date Added']) };
    }
    await clearFilter(page);

    // 3c. Assigned To — every row's Assignee must match.
    await openFilter(page);
    const setAsg = await setFilterByLabel(page, 'Assigned To', chosen.assignee === 'You' ? 'Biju' : chosen.assignee);
    await applyFilter(page);
    grid = await page.evaluate(readGrid);
    if (!setAsg.ok) {
      record('T-06', 'Filter by Assigned To', false, setAsg.why + (setAsg.available ? ` (have: ${setAsg.available.join(', ')})` : ''));
    } else {
      const want = setAsg.chose;
      const bad = grid.rows.filter((r) => !(r['Assignee'] || '').toLowerCase().includes(want.toLowerCase().split(' ')[0]));
      record('T-06', `Filter Assigned To = "${want}" returns only their leads`,
        bad.length === 0, `${grid.rows.length} row(s), ${bad.length} mismatched` +
        (bad.length ? ` → e.g. "${bad[0]['Assignee']}"` : ''));
      evidence.filterAssignee = { wanted: want, returned: grid.rows.length, mismatched: bad.length };
    }
    await clearFilter(page);

    // 3d. Name search — every row must contain the search term.
    await openFilter(page);
    await page.evaluate((term) => {
      const onScreen = (e) => e.getClientRects().length > 0;
      const panel = [...document.querySelectorAll('.offcanvas.show')].filter(onScreen)[0] || document.body;
      const box = [...panel.querySelectorAll('input[type="text"], input:not([type])')].filter(onScreen)[0];
      if (box) { box.value = term; box.dispatchEvent(new Event('input', { bubbles: true })); box.dispatchEvent(new Event('change', { bubbles: true })); }
    }, CUSTOMER);
    await applyFilter(page);
    grid = await page.evaluate(readGrid);
    const allMatch = grid.rows.length > 0 && grid.rows.every((r) => r.__raw.includes(CUSTOMER));
    record('T-07', `Name search "${CUSTOMER}" returns only that customer`,
      allMatch, `${grid.rows.length} row(s)` + (grid.rows.length && !allMatch ? ' — some rows do NOT match' : ''));
    evidence.filterSearch = { term: CUSTOMER, returned: grid.rows.length, allMatch };
    await clearFilter(page);

    // 3e. Clear must restore the unfiltered set.
    grid = await page.evaluate(readGrid);
    record('T-08', 'Clear filter restores the full listing',
      grid.rows.length === unfilteredCount,
      `before=${unfilteredCount} after-clear=${grid.rows.length}`);

    // ══ 4. Follow-up ═══════════════════════════════════════════════════════
    console.log('\n── 4. Follow-up ──');
    await page.goto(`${BASE}${evidence.created.overviewUrl}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);
    const fuOpened = await page.locator('#followupModal').isVisible().catch(() => false) ||
      await page.locator('button:has-text("Followup"), a:has-text("Followup")').first()
        .click({ timeout: 8000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(2500);
    const modalVisible = await page.locator('#followupModal').isVisible().catch(() => false);
    record('T-09', 'Follow-up modal opens from enquiry overview', modalVisible,
      modalVisible ? '#followupModal visible' : 'modal did not open');

    if (modalVisible) {
      await page.locator('#followupModal select').first().evaluate((s) => {
        const o = [...s.options].filter((x) => x.value && x.value !== '0');
        if (o.length) { s.value = o[0].value; s.dispatchEvent(new Event('change', { bubbles: true })); }
      }).catch(() => {});
      await page.locator('#followupModal textarea, #followupModal input[type="text"]').first()
        .fill(`QA follow-up ${STAMP}`).catch(() => {});
      await page.locator('#followupModal button:has-text("Save"), #followupModal .btn-primary').first()
        .click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(5000);
      const afterText = await page.evaluate(() => document.body.innerText).catch(() => '');
      record('T-10', 'Follow-up saves without an error dialog',
        !/oops|error code|went wrong/i.test(afterText), 'checked page for error text');
    }

    // ══ 5. /followups filter correctness ═══════════════════════════════════
    console.log('\n── 5. Filter correctness on /followups ──');
    await page.goto(`${BASE}/followups`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4500);
    const fuGrid = await page.evaluate(readGrid);
    evidence.followupColumns = fuGrid.columns;
    record('T-11', 'Follow-ups listing renders rows', fuGrid.rows.length > 0, `${fuGrid.rows.length} row(s)`);

    await openFilter(page);
    const setNext = await setFilterByLabel(page, 'Next Followup Date', 'Today');
    await applyFilter(page);
    const fu2 = await page.evaluate(readGrid);
    if (!setNext.ok) {
      record('T-12', 'Filter Next Followup Date = Today', false, setNext.why);
    } else {
      const t = todayDMY();
      const col = fu2.columns.find((c) => /next followup/i.test(c)) || 'Next Followup Date';
      const bad = fu2.rows.filter((r) => !(r[col] || '').startsWith(t));
      record('T-12', `Filter Next Followup = Today (${t}) returns only today's rows`,
        bad.length === 0, `${fu2.rows.length} row(s), ${bad.length} not today` +
        (bad.length ? ` → e.g. "${bad[0][col]}"` : ''));
      evidence.filterNextFollowup = { today: t, returned: fu2.rows.length, mismatched: bad.length,
        sample: bad.slice(0, 3).map((r) => r[col]) };
    }

    // ══ 6. Home page — Today's Schedule ════════════════════════════════════
    console.log("\n── 6. Home page Today's Schedule ──");
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    const home = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const cards = [...document.querySelectorAll('.card, section, .panel')];
      const sched = cards.find((c) => /today'?s schedule/i.test(c.innerText || ''));
      return {
        found: !!sched,
        text: sched ? clean(sched.innerText).slice(0, 600) : '',
        entryCount: sched ? sched.querySelectorAll('li, .schedule-item, tbody tr, .list-group-item').length : 0,
      };
    });
    record('T-13', "Home page shows a Today's Schedule section", home.found,
      home.found ? `${home.entryCount} entry element(s)` : 'section not found');
    record('T-14', "Today's Schedule lists the follow-up just created", home.text.includes(CUSTOMER),
      home.text.includes(CUSTOMER) ? `mentions ${CUSTOMER}` : 'new follow-up NOT shown');
    evidence.homeSchedule = home;
    await page.screenshot({ path: 'reports/qa/shots/crm/_functional_home.png', fullPage: true }).catch(() => {});

  } catch (e) {
    console.log('\nFATAL:', e.message);
    record('FATAL', 'test run aborted', false, e.message.split('\n')[0].slice(0, 160));
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n═══ ${passed}/${results.length} checks passed ═══`);
  const out = path.join(__dirname, '..', '..', 'reports', 'qa', 'raw', 'crm-functional.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ results, evidence }, null, 2));
  console.log(`wrote ${path.relative(path.join(__dirname, '..', '..'), out)}`);
})();
