'use strict';
/**
 * Full CRM chain on one tenant: enquiry -> quotation -> follow-up, then
 * confirm each step surfaced where a user would look for it, ending on Home.
 *
 * The point is the CHAIN, not the individual saves. Each step consumes the
 * record the previous one produced, so a break anywhere shows up as a
 * specific link failing rather than a vague "CRM is broken".
 *
 * Creates one enquiry (QA_CHAIN_<ts>), converts it, and adds one follow-up.
 * Touches nothing pre-existing; deletes nothing.
 *
 *   node scripts/qa/full_crm_chain.js
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
const NAME = `QA_CHAIN_${STAMP}`;
const REPO = path.join(__dirname, '..', '..');

const R = [];
const rec = (id, t, pass, d) => {
  R.push({ id, title: t, pass, detail: d });
  console.log(`  ${pass === null ? '⚪' : pass ? '✅' : '❌'} ${id} ${t}${d ? ` — ${d}` : ''}`);
};

const grid = () => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const on = (e) => {
    if (e.getClientRects().length === 0) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const t = [...document.querySelectorAll('table')].filter(on)
    .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  if (!t) return { columns: [], rows: [] };
  return {
    columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    rows: [...t.querySelectorAll('tbody tr')]
      .map((r) => [...r.querySelectorAll('td')].map((c) => clean(c.innerText)))
      .filter((c) => !(c.length <= 2 && /no data|no record/i.test(c.join(' ')))),
  };
};
const mentions = (n) => (document.body.innerText || '').replace(/\s+/g, ' ').includes(n);

/**
 * Find a record across every status tab of a listing. Tab-scoped grids report
 * a false absence when only the default tab is read.
 */
async function findAcrossTabs(page, url, needle) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4500);
  const tabs = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const on = (e) => e.getClientRects().length > 0;
    return [...document.querySelectorAll('[id^="tab-"], .nav-link, [role="tab"]')].filter(on)
      .map((x) => ({ id: x.id || null, text: clean(x.innerText).slice(0, 26) }))
      .filter((x) => x.text && !/switcher|theme/i.test(x.id || ''));
  });
  const out = [];
  for (const t of (tabs.length ? tabs : [{ id: null, text: '(default)' }])) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3800);
    if (t.id || t.text !== '(default)') {
      await page.locator(t.id ? `#${t.id}` : `text="${t.text}"`).first()
        .click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    await page.selectOption('#page_size', '100').catch(() => {});
    await page.waitForTimeout(3000);
    const g = await page.evaluate(grid);
    const row = g.rows.find((r) => r.join(' ').includes(needle));
    out.push({ tab: t.text, rows: g.rows.length, found: !!row, row: row || null });
  }
  return out;
}

/**
 * Open the follow-up modal on a record's overview, fill it and save.
 * Targets #btn-add-followup by id FIRST: a text match on "Followup" also hits
 * the "Followups"/"Followup History" tab, and .first() would click that.
 */
async function addFollowup(page, overviewPath, label) {
  const out = { target: overviewPath, label, modalOpen: false, saved: false };
  await page.goto(`${process.env.BASE_URL}${overviewPath}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6500);

  const btn = page.locator('#btn-add-followup');
  if (!(await btn.count().catch(() => 0))) {
    out.modalDetail = `#btn-add-followup not present on the ${label} overview`;
    out.saveDetail = 'not attempted';
    return out;
  }
  await btn.first().click({ timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(4000);
  out.modalOpen = await page.locator('#followupModal.show, .modal.show').first()
    .isVisible().catch(() => false);
  if (!out.modalOpen) {
    out.modalDetail = 'button clicked but no modal appeared';
    out.saveDetail = 'not attempted';
    return out;
  }
  out.modalDetail = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const m = document.querySelector('#followupModal.show, .modal.show');
    return `"${clean(m.querySelector('.modal-title')?.innerText)}" fields: ` +
      [...m.querySelectorAll('input,select,textarea')].filter((e) => e.type !== 'hidden')
        .map((e) => e.id || e.tagName.toLowerCase()).join(', ');
  }).catch(() => 'modal open');

  // This is a Blazor app: assigning .value from page.evaluate and dispatching a
  // synthetic 'change' does NOT update Blazor's bound model — it reconciles
  // from its own state and the control silently reverts to "Choose" on save,
  // leaving the modal open with no error. Drive the controls through
  // Playwright's native selectOption/fill, which raise the events Blazor binds to.
  const modal = page.locator('#followupModal.show, .modal.show').first();

  const statusSel = modal.locator('#followup-status');
  if (await statusSel.count().catch(() => 0)) {
    const opts = await statusSel.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
        .filter((o) => o.value && o.value !== '0' && !/^choose/i.test(o.text)));
    if (opts.length) {
      await statusSel.selectOption(opts[0].value);
      out.status = opts[0].text;
    }
  }
  // Choosing a status CONDITIONALLY renders "Lead Quality*" inside the modal.
  // It is required, starts unset, and blocks Save — with no visible message
  // (see finding CH-F1). It must be filled after the status, not before.
  await page.waitForTimeout(1500);
  const qualSel = modal.locator('#lead-quality');
  if (await qualSel.count().catch(() => 0)) {
    const qOpts = await qualSel.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
        .filter((o) => o.value && o.value !== '0' && !/^choose/i.test(o.text)));
    if (qOpts.length) {
      await qualSel.selectOption(qOpts[0].value).catch(() => {});
      out.leadQuality = qOpts[0].text;
    }
  }

  // Any other select in the modal, same treatment.
  const otherSels = modal.locator('select:not(#followup-status):not(#lead-quality)');
  for (let i = 0; i < await otherSels.count().catch(() => 0); i++) {
    const sel = otherSels.nth(i);
    const opts = await sel.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
        .filter((o) => o.value && o.value !== '0' && !/^choose|create new/i.test(o.text)));
    if (opts.length) await sel.selectOption(opts[0].value).catch(() => {});
  }
  const desc = modal.locator('#followup-description');
  if (await desc.count().catch(() => 0)) {
    await desc.fill('Automated chain follow-up — safe to delete').catch(() => {});
  }
  await page.waitForTimeout(1200);
  await page.locator('.modal.show button:has-text("Save")').first().click({ timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(6500);
  const st = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return {
      stillOpen: !!document.querySelector('#followupModal.show, .modal.show'),
      error: /oops|went wrong|error code/i.test(document.body.innerText),
      alert: clean([...document.querySelectorAll('.swal2-popup,.toast,.alert')].map((e) => e.innerText).join(' | ')).slice(0, 150),
    };
  }).catch(() => ({}));
  out.saved = !st.error && !st.stillOpen;
  out.saveDetail = `status="${out.status || '(none)'}" quality="${out.leadQuality || '(none)'}" modalClosed=${!st.stillOpen} error=${st.error}`;
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const ev = { tenant: C.company, name: NAME };
  const shot = async (n) => {
    const p = path.join(REPO, 'reports', 'qa', 'shots', 'chain', `${C.company}_${n}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);
    ev.user = await page.evaluate(() => {
      const m = (document.body.innerText || '').match(/Hey,\s*([^\n]{1,40})/);
      return m ? m[1].trim() : null;
    });
    console.log(`  logged in as ${ev.user} @ ${C.company}\n`);

    // Home BEFORE, so the counter deltas afterwards are meaningful.
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    ev.homeBefore = await page.evaluate(() => {
      const body = (document.body.innerText || '').replace(/\s+/g, ' ');
      const pick = (l) => { const m = body.match(new RegExp(l + '\\s+(\\d[\\d,]*)', 'i')); return m ? parseInt(m[1].replace(/,/g, ''), 10) : null; };
      return { newLeads: pick('New Leads'), followups: pick('Followups'), delayed: pick('Delayed'), completed: pick('Completed') };
    });
    console.log(`  home before: ${JSON.stringify(ev.homeBefore)}\n`);

    // ---- 1. ENQUIRY -------------------------------------------------------
    console.log('== 1. Enquiry ==');
    const enq = new EnquiryPage(page);
    await enq.openAddForm();
    await page.waitForTimeout(1500);
    await page.locator('#TxtCustomer').fill(NAME).catch(() => {});
    await page.locator('#customer-phone').fill(String(STAMP).slice(-10)).catch(() => {});
    ev.picked = {};
    for (const [id, key] of [['#assignto', 'assignee'], ['#leadsource', 'leadSource'], ['#followup', 'followupStatus']]) {
      ev.picked[key] = await page.locator(id).evaluate((s) => {
        const o = [...s.options].filter((x) => x.value && x.value !== '0');
        if (!o.length) return null;
        s.value = o[0].value; s.dispatchEvent(new Event('change', { bubbles: true }));
        return o[0].text.trim();
      }).catch(() => null);
    }
    // Lead Quality is CONDITIONALLY required: it renders only once a Followup
    // Status is chosen, so it must be filled after that select — not before.
    // Skipping it is what made the save fail with "Please choose lead quality".
    await page.waitForTimeout(1500);
    ev.picked.leadQuality = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      // Prefer the known id, else any visible select whose label mentions quality.
      const sel = [...document.querySelectorAll('select')].filter(on).find((s) =>
        s.id === 'lead-quality' ||
        /quality/i.test(clean(s.closest('.form-group,.col,.mb-3,.row > div')?.querySelector('label')?.innerText)));
      if (!sel) return null;
      const o = [...sel.options].filter((x) => x.value && x.value !== '0' && !/^choose/i.test(x.text));
      if (!o.length) return null;
      sel.value = o[0].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return o[0].text.trim();
    }).catch(() => null);
    let itemErr = null;
    try { await enq.addItem('Inverter', '2'); } catch (e) { itemErr = e.message.split('\n')[0].slice(0, 110); }
    rec('CH-01', 'Add line item to the enquiry', !itemErr, itemErr || 'item added');

    await page.locator('#btn-save-enquiry').click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(7000);
    ev.overviewUrl = page.url().replace(BASE, '');
    ev.enquirySaveAlert = await page.evaluate(() =>
      [...document.querySelectorAll('.swal2-popup,.toast,.alert')]
        .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 200)).catch(() => '');
    if (ev.enquirySaveAlert) console.log(`     save response: "${ev.enquirySaveAlert}"`);
    await shot('01_enquiry_saved');
    rec('CH-02', 'Enquiry saves and redirects to its overview',
      /enquiry-overview/.test(ev.overviewUrl),
      `${ev.overviewUrl} | source=${ev.picked.leadSource} assignee=${ev.picked.assignee}`);

    // The Leads listing is tab-scoped (New / In Follow Up / Won / Lost) and the
    // enquiry lands under whichever status was chosen — so searching only the
    // default tab reports a false absence. Walk every tab.
    ev.leadTabSearch = await findAcrossTabs(page, `${BASE}/leads`, NAME);
    const leadHit = ev.leadTabSearch.find((t) => t.found);
    ev.leadRow = leadHit ? leadHit.row : null;
    rec('CH-03', 'Enquiry appears in the Leads listing', !!leadHit,
      leadHit
        ? `under the "${leadHit.tab}" tab: ${(leadHit.row || []).slice(0, 6).join(' | ')}`
        : `absent from all ${ev.leadTabSearch.length} tab(s): ${ev.leadTabSearch.map((t) => `${t.tab}=${t.rows}`).join(', ')}`);

    // ---- 2. FOLLOW-UP ON THE ENQUIRY ------------------------------------
    // Order matters. Converting to a quotation MOVES the follow-up control to
    // the quotation (verified: #btn-add-followup disappears from the enquiry
    // overview once converted, and appears on /quotation-view with a
    // "Followup History" tab). So follow up while it is still an enquiry,
    // then again on the quotation — that is the real business sequence.
    console.log('\n== 2. Follow-up on the enquiry ==');
    ev.enquiryFollowup = await addFollowup(page, ev.overviewUrl, 'enquiry');
    rec('CH-08', 'Follow-up modal opens on the enquiry overview',
      ev.enquiryFollowup.modalOpen, ev.enquiryFollowup.modalDetail);
    rec('CH-09', 'Follow-up saves from the enquiry', ev.enquiryFollowup.saved,
      ev.enquiryFollowup.saveDetail);

    ev.followupTabSearch = await findAcrossTabs(page, `${BASE}/followups`, NAME);
    const fuHit = ev.followupTabSearch.find((t) => t.found);
    rec('CH-10', 'Record appears in the FollowUps listing', !!fuHit,
      fuHit ? `under "${fuHit.tab}": ${(fuHit.row || []).slice(2, 8).join(' | ')}`
            : `absent from all tab(s): ${ev.followupTabSearch.map((t) => `${t.tab}=${t.rows}`).join(', ')}`);

    // ---- 3. QUOTATION ----------------------------------------------------
    console.log('\n== 3. Quotation ==');
    if (/enquiry-overview/.test(ev.overviewUrl)) {
      await page.goto(`${BASE}${ev.overviewUrl}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(5500);

      // Create Quotation is not a top-level button: it sits inside the
      // #btn-enquiry-actions dropdown alongside Edit Enquiry, Transfer To
      // Branch and Merge Duplicate.
      await page.locator('#btn-enquiry-actions').click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2200);
      const qBtn = page.locator('.dropdown-menu.show a, .dropdown-menu.show button')
        .filter({ hasText: /create quotation/i }).first();
      if (!(await qBtn.count().catch(() => 0))) {
        rec('CH-11', 'Create Quotation available from the enquiry actions menu', false,
          'no Create Quotation item in the #btn-enquiry-actions menu');
      } else {
        await qBtn.click({ timeout: 12000 }).catch(() => {});
        await page.waitForTimeout(7000);
        ev.quotationFormUrl = page.url().replace(BASE, '');
        await shot('03_quotation_form');
        rec('CH-11', 'Enquiry -> Quotation form opens prefilled (via actions menu)',
          /quotation/i.test(ev.quotationFormUrl), ev.quotationFormUrl);

        ev.quotationForm = await page.evaluate(() => {
          const on = (e) => e.getClientRects().length > 0;
          const val = (sel) => { const e = document.querySelector(sel); return e ? e.value : null; };
          const t = [...document.querySelectorAll('table')].filter(on)[0];
          return {
            quotationNo: val('#quotation-no'),
            customer: val('#customerNameInput') || val('#TxtCustomer'),
            itemRows: t ? t.querySelectorAll('tbody tr').length : 0,
            saveBtn: !!document.querySelector('#btn-save-quotation'),
          };
        });
        rec('CH-12', 'Quotation inherits the customer and items from the enquiry',
          !!(ev.quotationForm.customer && ev.quotationForm.itemRows > 0),
          `no=${ev.quotationForm.quotationNo} customer="${ev.quotationForm.customer}" itemRows=${ev.quotationForm.itemRows}`);

        // Valid Upto is the one field the conversion does not auto-fill.
        await page.locator('#expdate').evaluate((e) => {
          const d = new Date(Date.now() + 30 * 864e5);
          e.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          e.dispatchEvent(new Event('input', { bubbles: true }));
          e.dispatchEvent(new Event('change', { bubbles: true }));
        }).catch(() => {});
        await page.waitForTimeout(700);
        await page.locator('#btn-save-quotation').click({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(7500);
        ev.quotationViewUrl = page.url().replace(BASE, '');
        ev.afterQuotation = {
          error: await page.evaluate(() => /oops|went wrong|error code/i.test(document.body.innerText)).catch(() => false),
          alert: await page.evaluate(() => [...document.querySelectorAll('.swal2-popup,.toast,.alert')]
            .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 180)).catch(() => ''),
        };
        await shot('04_quotation_saved');
        rec('CH-13', 'Quotation saves and opens its overview',
          !ev.afterQuotation.error && /quotation-view/.test(ev.quotationViewUrl),
          `url=${ev.quotationViewUrl} alert="${ev.afterQuotation.alert.slice(0, 60)}"`);

        ev.quotationTabSearch = await findAcrossTabs(page, `${BASE}/quotations`, NAME);
        const qHit = ev.quotationTabSearch.find((t) => t.found);
        rec('CH-14', 'Quotation appears in the Quotations listing', !!qHit,
          qHit ? `under "${qHit.tab}": ${(qHit.row || []).slice(0, 6).join(' | ')}`
               : `absent from all tab(s): ${ev.quotationTabSearch.map((t) => `${t.tab}=${t.rows}`).join(', ')}`);

        // ---- 3b. Follow-up MOVED to the quotation ----------------------
        ev.enquiryFollowupGone = await page.goto(`${BASE}${ev.overviewUrl}`,
          { waitUntil: 'domcontentloaded', timeout: 45000 })
          .then(() => page.waitForTimeout(6000))
          .then(() => page.evaluate(() => !document.querySelector('#btn-add-followup')))
          .catch(() => null);
        rec('CH-15', 'Follow-up control moves off the enquiry once converted',
          ev.enquiryFollowupGone === true,
          ev.enquiryFollowupGone
            ? '#btn-add-followup no longer on the enquiry overview (by design — it moves to the quotation)'
            : 'still present on the enquiry after conversion');

        if (ev.quotationViewUrl && /quotation-view/.test(ev.quotationViewUrl)) {
          ev.quotationFollowup = await addFollowup(page, ev.quotationViewUrl, 'quotation');
          rec('CH-16', 'Follow-up can be added on the quotation after conversion',
            ev.quotationFollowup.modalOpen && ev.quotationFollowup.saved,
            `${ev.quotationFollowup.modalDetail} | ${ev.quotationFollowup.saveDetail}`);
        }
      }
    } else {
      rec('CH-11', 'Enquiry -> Quotation', null, 'enquiry did not save, chain broken here');
    }

    // ---- 4. HOME ----------------------------------------------------------
    console.log('\n== 4. Home page ==');
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(7000);
    ev.homeAfter = await page.evaluate(() => {
      const body = (document.body.innerText || '').replace(/\s+/g, ' ');
      const pick = (l) => { const m = body.match(new RegExp(l + '\\s+(\\d[\\d,]*)', 'i')); return m ? parseInt(m[1].replace(/,/g, ''), 10) : null; };
      return {
        newLeads: pick('New Leads'), followups: pick('Followups'),
        delayed: pick('Delayed'), completed: pick('Completed'),
        scheduleText: (() => {
          const c = [...document.querySelectorAll('.card, section')]
            .find((x) => /today'?s schedule/i.test(x.innerText || ''));
          return c ? (c.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 260) : '';
        })(),
      };
    });
    ev.homeMentionsRecord = await page.evaluate(mentions, NAME).catch(() => false);
    await shot('05_home_after');
    console.log(`     home after: ${JSON.stringify({ ...ev.homeAfter, scheduleText: undefined })}`);
    console.log(`     today's schedule: "${ev.homeAfter.scheduleText.slice(0, 150)}"`);

    // Which counter moves depends on the follow-up status chosen: a lead saved
    // as "Contacted" is in-followup, not new, so asserting specifically on
    // "New Leads" would fail for a correct app. Assert that the dashboard
    // responded at all, and report every delta.
    const b = ev.homeBefore, a = ev.homeAfter;
    ev.homeDeltas = Object.fromEntries(Object.keys(b)
      .filter((k) => b[k] !== null && a[k] !== null)
      .map((k) => [k, a[k] - b[k]]));
    const moved = Object.entries(ev.homeDeltas).filter(([, d]) => d !== 0);
    rec('CH-17', 'Home counters respond to the new enquiry',
      moved.length > 0,
      `deltas ${JSON.stringify(ev.homeDeltas)} (status chosen: "${ev.picked.followupStatus}", quality "${ev.picked.leadQuality}")`);
    rec('CH-18', "Home Today's Schedule shows the new record", ev.homeMentionsRecord,
      ev.homeMentionsRecord ? `mentions ${NAME}` : 'record not shown on Home');

  } catch (e) {
    console.log('\nFATAL:', e.message);
    rec('FATAL', 'chain aborted', false, e.message.split('\n')[0].slice(0, 140));
  } finally {
    await browser.close();
  }

  const p = R.filter((r) => r.pass === true).length;
  const f = R.filter((r) => r.pass === false).length;
  const n = R.filter((r) => r.pass === null).length;
  console.log(`\n=== ${p} passed | ${f} failed | ${n} inconclusive ===`);
  console.log(`    created: ${NAME}`);
  const out = path.join(REPO, 'reports', 'qa', 'raw', `crm-chain-${C.company}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ results: R, evidence: ev }, null, 2));
  console.log(`    wrote ${path.relative(REPO, out)}`);
})();
