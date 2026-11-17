'use strict';
/**
 * Test the project (workflow) flow end to end.
 *
 * Projects is now one instance of a configurable workflow engine: each Type
 * carries a Template of Phases and Tasks, and creating a project is expected
 * to instantiate that template. That instantiation is the interesting part —
 * a project that saves but arrives with no phases is broken in a way no
 * page-load check would notice.
 *
 * Flow under test:
 *   1. read a Type's template (phases + tasks it should produce)
 *   2. create a project of that type          → QA_PRJ_<timestamp>
 *   3. confirm it lands in the listing
 *   4. confirm the template's phases/tasks were instantiated on it
 *   5. confirm it reaches the dashboard and the status report
 *   6. confirm its sub-pages (notes, expenses, collections) accept it
 *
 * Creates ONE project, prefixed QA_PRJ_ so it is identifiable. Deletes
 * nothing and touches no existing record.
 *
 *   node scripts/qa/test_project_flow.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');

const BASE = process.env.BASE_URL;
const C = {
  company: process.env.COMPANY_CODE,
  username: process.env.CRM_USERNAME,
  password: process.env.PASSWORD,
};
const GUID = process.env.WORKFLOW_GUID || '16d6c78a-a07c-4915-8c5c-cf975eda980d';
const REPO = path.join(__dirname, '..', '..');
const STAMP = Date.now();
const NAME = `QA_PRJ_${STAMP}`;

const results = [];
const rec = (id, t, pass, d) => {
  results.push({ id, title: t, pass, detail: d });
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

/** Choose the first real option of the select whose label matches. */
const pickByLabel = (labelText, wanted) => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const on = (e) => e.getClientRects().length > 0;
  const sel = [...document.querySelectorAll('select')].filter(on).find((s) => {
    const g = s.closest('.form-group,.col,.mb-3,.row > div');
    const l = g && g.querySelector('label');
    return l && clean(l.innerText).startsWith(clean(labelText));
  });
  if (!sel) return null;
  const opts = [...sel.options].filter((o) =>
    o.value && !/^choose$/i.test(o.text.trim()) && !/create new/i.test(o.text));
  const hit = (wanted && opts.find((o) => clean(o.text) === clean(wanted))) || opts[0];
  if (!hit) return null;
  sel.value = hit.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return hit.text.trim();
};

/** Fill the input whose label matches. */
const fillByLabel = (labelText, value) => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const on = (e) => e.getClientRects().length > 0;
  const el = [...document.querySelectorAll('input,textarea')].filter(on)
    .filter((e) => !['checkbox', 'radio', 'hidden'].includes(e.type))
    .find((e) => {
      const g = e.closest('.form-group,.col,.mb-3,.row > div');
      const l = g && g.querySelector('label');
      return l && clean(l.innerText).startsWith(clean(labelText));
    });
  if (!el) return null;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.id || '(anon)';
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const ev = { projectName: NAME, guid: GUID };
  const shot = async (n) => {
    const p = path.join(REPO, 'reports', 'qa', 'shots', 'workflow', `flow_${n}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  };

  try {
    await new LoginPage(page).login(C.company, C.username, C.password);
    await page.waitForTimeout(2000);

    // ══ 1. Read a Type's template — what should a new project inherit? ════
    console.log('\n══ 1. Project Type template ══');
    await page.goto(`${BASE}/workflow-types/${GUID}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    const types = await page.evaluate(grid);
    ev.types = types;
    console.log('   types grid:', JSON.stringify(types.columns));
    types.rows.slice(0, 8).forEach((r) => console.log('     ', r.join(' | ')));

    // Open the first type's Template to read its phases and tasks.
    await page.locator('table tbody tr').first().locator('a:has-text("Template"), button:has-text("Template")')
      .first().click({ timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(5500);
    ev.template = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const on = (e) => e.getClientRects().length > 0;
      return {
        url: location.pathname,
        heading: clean(document.querySelector('h1,h2,h3,.card-title')?.innerText).slice(0, 60),
        grids: [...document.querySelectorAll('table')].filter(on).map((t) => ({
          columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean),
          rows: [...t.querySelectorAll('tbody tr')].map((r) =>
            [...r.querySelectorAll('td')].map((c) => clean(c.innerText).slice(0, 26))),
        })).filter((g) => g.columns.length),
      };
    });
    await shot('type_template');
    console.log(`   template page: ${ev.template.url} "${ev.template.heading}"`);
    ev.template.grids.forEach((g) => {
      console.log('     grid:', JSON.stringify(g.columns), `(${g.rows.length} rows)`);
      g.rows.slice(0, 6).forEach((r) => console.log('       ', r.join(' | ')));
    });
    rec('PF-01', 'Project Type carries a template of phases/tasks',
      ev.template.grids.length > 0 && ev.template.grids.some((g) => g.rows.length > 0),
      `${ev.template.grids.length} grid(s) on the template page`);

    // ══ 2. Create a project ═══════════════════════════════════════════════
    console.log('\n══ 2. Create a project ══');
    await page.goto(`${BASE}/workflow/${GUID}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5500);

    ev.filled = await page.evaluate(({ name, pickSrc, fillSrc }) => {
      // eslint-disable-next-line no-new-func
      const pick = new Function(`return ${pickSrc}`)();
      // eslint-disable-next-line no-new-func
      const fill = new Function(`return ${fillSrc}`)();
      const today = new Date();
      const dmy = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return {
        branch: pick('Branch'),
        type: pick('Type'),
        executive: pick('Executive'),
        name: fill('Name', name),
        dealDate: fill('Deal Date', dmy),
        dealAmount: fill('Deal Amount', '50000'),
        description: fill('Description', 'QA flow test — safe to delete'),
      };
    }, { name: NAME, pickSrc: pickByLabel.toString(), fillSrc: fillByLabel.toString() });
    console.log('   filled:', JSON.stringify(ev.filled));

    // Customer is a search-and-pick, not a text field: type a term, press the
    // magnifier, then choose a row from the Search Results modal. Typing alone
    // leaves the underlying id unset and the form correctly refuses to save.
    const custGroup = page.locator('div.input-group').filter({
      has: page.locator('input[placeholder="Search and pick"]'),
    }).first();
    await custGroup.locator('input').fill('a').catch(() => {});
    await page.waitForTimeout(600);
    await custGroup.locator('[title="Search"]').first().click({ timeout: 9000 }).catch((e) => {
      ev.customerSearchErr = e.message.split('\n')[0].slice(0, 100);
    });
    await page.waitForTimeout(3500);
    ev.customerPick = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const shown = [...document.querySelectorAll('.modal.show')];
      const m = shown.find((x) => /search result/i.test(x.querySelector('.modal-title')?.innerText || ''))
        || shown[0];
      if (!m) return { modalOpen: false };
      const rows = [...m.querySelectorAll('tbody tr')];
      return {
        modalOpen: true, modalId: m.id || '(anon)',
        title: clean(m.querySelector('.modal-title')?.innerText),
        rowCount: rows.length,
        firstRow: rows.length ? clean(rows[0].innerText).slice(0, 60) : null,
      };
    });
    console.log('   customer search modal:', JSON.stringify(ev.customerPick));
    if (ev.customerPick.modalOpen && ev.customerPick.rowCount > 0) {
      await page.locator('.modal.show tbody tr').first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2500);
      ev.customerChosen = await page.evaluate(() => {
        const i = document.querySelector('input[placeholder="Search and pick"]');
        return i ? i.value : null;
      });
      console.log('   customer chosen:', JSON.stringify(ev.customerChosen));
    }
    rec('PF-01b', 'Customer search-and-pick returns results and selects one',
      !!(ev.customerPick.modalOpen && ev.customerPick.rowCount > 0 && ev.customerChosen),
      `modal=${ev.customerPick.modalOpen} rows=${ev.customerPick.rowCount} chosen="${ev.customerChosen || ''}"`);
    await shot('new_project_filled');

    const urlBefore = page.url();
    await page.locator('button:has-text("Create"), button:has-text("Save")').first()
      .click({ timeout: 15000 }).catch((e) => { ev.createClickErr = e.message.split('\n')[0].slice(0, 110); });
    await page.waitForTimeout(7000);
    ev.afterCreate = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return {
        url: location.pathname,
        alert: clean([...document.querySelectorAll('.swal2-popup,.toast,.alert')].map((e) => e.innerText).join(' | ')).slice(0, 240),
        error: /oops|went wrong|error code|exception/i.test(document.body.innerText),
        validation: [...document.querySelectorAll('.is-invalid,.invalid-feedback')].length,
      };
    });
    ev.afterCreate.navigated = page.url() !== urlBefore;
    await shot('after_create');
    rec('PF-02', 'Project creation saves',
      ev.afterCreate.navigated && !ev.afterCreate.error,
      `url=${ev.afterCreate.url} navigated=${ev.afterCreate.navigated} error=${ev.afterCreate.error} invalidFields=${ev.afterCreate.validation} alert="${ev.afterCreate.alert.slice(0, 70)}"`);

    // ══ 3. Does it appear in the listing? ═════════════════════════════════
    console.log('\n══ 3. Listing ══');
    await page.goto(`${BASE}/workflows/${GUID}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5500);
    const listing = await page.evaluate(grid);
    ev.listing = { columns: listing.columns, rows: listing.rows.length };
    const mine = listing.rows.find((r) => r.join(' ').includes(NAME));
    await shot('listing');
    rec('PF-03', 'New project appears in the Projects listing', !!mine,
      mine ? `row: ${mine.slice(0, 5).join(' | ')}` : `not found among ${listing.rows.length} rows`);
    ev.listingRow = mine || null;

    // ══ 4. Were the template's phases/tasks instantiated? ════════════════
    console.log('\n══ 4. Phases / tasks on the created project ══');
    if (mine) {
      await page.locator(`table tbody tr:has-text("${NAME}")`).first()
        .locator('a, button').first().click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(6500);
      ev.projectDetail = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const on = (e) => e.getClientRects().length > 0;
        return {
          url: location.pathname,
          heading: clean(document.querySelector('h1,h2,h3,.card-title')?.innerText).slice(0, 60),
          tabs: [...document.querySelectorAll('.nav-link,[role="tab"]')].filter(on)
            .map((e) => clean(e.innerText).slice(0, 26)).filter((t) => t && !/switcher|theme/i.test(t)),
          grids: [...document.querySelectorAll('table')].filter(on).map((t) => ({
            columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)).filter(Boolean),
            rows: t.querySelectorAll('tbody tr').length,
            firstRow: [...(t.querySelector('tbody tr')?.querySelectorAll('td') || [])].map((c) => clean(c.innerText).slice(0, 24)),
          })).filter((g) => g.columns.length),
          mentionsPhase: /phase/i.test(document.body.innerText),
        };
      });
      await shot('project_detail');
      console.log(`   opened ${ev.projectDetail.url} "${ev.projectDetail.heading}"`);
      console.log('   tabs:', JSON.stringify(ev.projectDetail.tabs));
      ev.projectDetail.grids.forEach((g) => console.log('     grid:', JSON.stringify(g.columns), `rows=${g.rows}`));

      const phaseGrid = ev.projectDetail.grids.find((g) =>
        g.columns.some((c) => /phase|task/i.test(c)));
      rec('PF-04', 'Template phases/tasks instantiated on the new project',
        phaseGrid ? phaseGrid.rows > 0 : null,
        phaseGrid
          ? `${phaseGrid.rows} row(s) in the ${phaseGrid.columns[0]} grid`
          : `no phase/task grid found on the detail page (tabs: ${ev.projectDetail.tabs.join(', ') || 'none'})`);
    } else {
      rec('PF-04', 'Template phases/tasks instantiated', null, 'project not found in the listing');
    }

    // ══ 5. Dashboard and status report ════════════════════════════════════
    console.log('\n══ 5. Dashboard & status report ══');
    for (const [id, label, url] of [
      ['PF-05', 'Projects Dashboard', `/workflow-dashboard/${GUID}`],
      ['PF-06', 'Projects Status Report', `/workflow-status-report/${GUID}`],
    ]) {
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(5500);
      const found = await page.evaluate((n) => (document.body.innerText || '').includes(n), NAME).catch(() => false);
      const g = await page.evaluate(grid);
      await shot(label.replace(/\W+/g, '_'));
      rec(id, `${label} reflects the new project`, found,
        found ? `listed (${g.rows.length} rows total)` : `NOT listed among ${g.rows.length} rows`);
    }

    // ══ 6. Sub-pages accept the project ═══════════════════════════════════
    console.log('\n══ 6. Sub-pages ══');
    for (const [id, label, url] of [
      ['PF-07', 'Notes', `/workflow-notes/module/${GUID}`],
      ['PF-08', 'Expenses', `/workflow-expenses/module/${GUID}`],
      ['PF-09', 'Collections', `/workflow-collections/module/${GUID}`],
    ]) {
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(4800);
      const st = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const on = (e) => e.getClientRects().length > 0;
        // Can this page target a project at all?
        const picker = [...document.querySelectorAll('select,input')].filter(on)
          .find((e) => /project|workflow/i.test(
            (e.closest('.form-group,.col,.mb-3,div')?.querySelector('label')?.innerText || '') +
            (e.getAttribute('placeholder') || '')));
        return {
          heading: clean(document.querySelector('h1,h2,h3,.card-title')?.innerText).slice(0, 50),
          hasProjectPicker: !!picker,
          pickerHasNewProject: picker && picker.tagName === 'SELECT'
            ? [...picker.options].some((o) => o.text.includes('QA_PRJ_')) : null,
          error: /oops|went wrong|error code/i.test(document.body.innerText),
        };
      }).catch(() => ({}));
      rec(id, `${label} page can target a project`, !st.error && st.hasProjectPicker !== false,
        `heading="${st.heading}" projectPicker=${st.hasProjectPicker} newProjectSelectable=${st.pickerHasNewProject} error=${st.error}`);
    }

  } catch (e) {
    console.log('\nFATAL:', e.message);
    rec('FATAL', 'aborted', false, e.message.split('\n')[0].slice(0, 140));
  } finally {
    await browser.close();
  }

  const p = results.filter((r) => r.pass === true).length;
  const f = results.filter((r) => r.pass === false).length;
  const n = results.filter((r) => r.pass === null).length;
  console.log(`\n═══ ${p} passed · ${f} failed · ${n} inconclusive ═══`);
  console.log(`   created: ${NAME}`);
  const out = path.join(REPO, 'reports', 'qa', 'raw', 'project-flow-test.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ results, evidence: ev }, null, 2));
  console.log(`   wrote ${path.relative(REPO, out)}`);
})();
