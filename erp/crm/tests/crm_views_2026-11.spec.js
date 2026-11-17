'use strict';

/**
 * CRM — the views added by the Nov 2026 redesign show the same data everywhere  (CV-01 .. CV-07)
 *
 * The 12 Nov 2026 build gave the CRM lists more than one way to look at the same records: Leads has
 * Nature / Status views and a Kanban, Follow-ups an Agenda, a List and a Kanban, Quotations a Board
 * and a Table, the Enquiry Overview a summary strip above its details. Each view prints counts.
 * These tests check that a count is what is actually listed, and that two views of the same records
 * agree. They are data checks, not structure checks (the page-structure suite covers structure).
 *
 *   CV-01  Leads › Nature View: each chip's count equals the rows listed under it
 *   CV-02  Leads › Status View: each status chip's count equals its rows; the Kanban columns carry the same counts
 *   CV-03  Follow-ups › Agenda: each day lists as many follow-ups as the week strip says; Missed = List View's Delayed
 *   CV-04  Follow-ups › List View and Kanban: chip counts equal rows; the Kanban total equals its columns and the chips
 *   CV-05  Quotations: the Board columns and the Table tabs carry the same counts; cards and rows match them
 *   CV-06  Enquiry Overview: the summary strip, the page heading and the Enquiry Details card agree; every tab opens
 *   CV-07  New Enquiry form: sections are numbered in order and Cancel / Save stay in view while scrolling
 *
 * Read-only: nothing is saved. A view choice is kept in the browser (localStorage), so it does not
 * outlive this run; each test still puts the view back the way it found it.
 * One login for the file: the tenant throttles bursts ("Too many requests").
 *
 * Run:  npx playwright test erp/crm/tests/crm_views_2026-11.spec.js
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { EnquiryPage } = require('../pages/EnquiryPage');
const { dismissRateLimit } = require('../../common/helpers');

const BASE = process.env.BASE_URL || 'https://test.erp.progbiz.in';
const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};
const PAGE_MAX = 100;   // the largest page size the lists offer

test.describe('CRM — Nov 2026 views show the same data', () => {
  test.describe.configure({ timeout: 240_000 });

  /** @type {import('@playwright/test').Page} */
  let page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    await new LoginPage(page).login(C.company, C.username, C.password);
  });
  test.afterAll(async () => { await page?.close(); });

  async function go(path) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(2500);
      if (!(await dismissRateLimit(page, 400))) return;
      await page.waitForTimeout(15000 * (attempt + 1));
    }
  }
  const settle = async (ms = 1800) => { await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(ms); };
  /** The number at the end of an element's text ("In Follow Up 17" -> 17); 0 when it shows none ("Won"). */
  const countOf = (selector) => page.locator(selector).first().evaluate((e) => {
    const m = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().match(/(\d[\d,]*)\s*$/);
    return m ? Number(m[1].replace(/,/g, '')) : 0;
  });
  /** Data rows of the widest visible table (an empty-state row is not a data row). */
  const dataRows = () => page.evaluate(() => {
    const t = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length)
      .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
    if (!t) return 0;
    return [...t.querySelectorAll('tbody tr')].filter((r) => r.querySelectorAll('td').length > 2).length;
  });
  /** Show up to 100 rows a page, so a count below 100 must be listed in full. */
  async function showMax() {
    const size = page.locator('#page_size:visible').first();
    if (await size.count().catch(() => 0)) { await size.selectOption('100').catch(() => {}); await settle(2200); }
  }
  /** Click a chip / tab and compare its count with the rows then listed. */
  async function chipListsItsRows(selector, label) {
    const n = await countOf(selector);
    await page.locator(selector).first().click({ timeout: 10000 });
    await settle();
    await showMax();
    const rows = await dataRows();
    console.log(`  ${label}: chip ${n} → ${rows} row(s)`);
    expect(rows, `${label}: the chip says ${n} but ${rows} row(s) are listed`).toBe(Math.min(n, PAGE_MAX));
    return n;
  }

  test('CV-01 | Leads › Nature View: each chip\'s count equals the rows listed under it', async () => {
    await go('/leads');
    const nature = page.locator('#btn-view-nature');
    if (await nature.count()) { await nature.click(); await settle(); }
    for (const [id, label] of [['tab-lead-new', 'New'], ['tab-lead-infollowup', 'In Follow Up'], ['tab-lead-won', 'Won'], ['tab-lead-lost', 'Lost']]) {
      await expect(page.locator(`#${id}`), `the "${label}" chip is missing from Leads`).toBeVisible();
      await chipListsItsRows(`#${id}`, `Leads › ${label}`);
    }
    await page.locator('#tab-lead-new').click().catch(() => {});
  });

  test('CV-02 | Leads › Status View: each status chip\'s count equals its rows, and the Kanban columns carry the same counts', async () => {
    await go('/leads');
    const statusView = page.locator('#btn-view-status');
    test.skip(!(await statusView.count()), 'this build has no Status View on Leads');
    await statusView.click();
    await settle(2500);
    try {
      const chips = await page.evaluate(() => [...document.querySelectorAll('[id^="tab-lead-status-"]')].map((b) => {
        const t = (b.innerText || '').replace(/\s+/g, ' ').trim(); const m = t.match(/^(.*?)\s*(\d[\d,]*)$/);
        return { id: b.id, name: m ? m[1].trim() : t, count: m ? Number(m[2].replace(/,/g, '')) : 0 };
      }));
      console.log(`  status chips: ${chips.map((c) => `${c.name} ${c.count}`).join(' · ')}`);
      expect(chips.length, 'Status View shows no status chips').toBeGreaterThan(0);
      expect(new Set(chips.map((c) => c.name)).size, 'two status chips carry the same name').toBe(chips.length);
      for (const c of chips.slice(0, 8)) await chipListsItsRows(`#${c.id}`, `Leads › status "${c.name}"`);

      // Kanban layout of the same view: one column per status with the same count
      const kanban = page.locator('#btn-status-layout-board');
      if (await kanban.count()) {
        await kanban.click();
        await settle(3000);
        const cols = await page.evaluate(() => [...document.querySelectorAll('.kb-column')].filter((c) => c.getClientRects().length).map((c) => ({
          name: ((c.querySelector('.kb-column-title') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
          count: Number(((c.querySelector('.kb-column-count') || {}).textContent || '').replace(/[^\d]/g, '') || 0),
          cards: c.querySelectorAll('.kb-card').length,
        })));
        console.log(`  kanban: ${cols.map((c) => `${c.name} ${c.count} (${c.cards} cards)`).join(' · ') || '(no .kb-column found)'}`);
        if (cols.length) {
          for (const c of chips) {
            const col = cols.find((k) => k.name.toLowerCase() === c.name.toLowerCase());
            expect(col, `the Kanban has no column for status "${c.name}"`).toBeTruthy();
            expect(col.count, `status "${c.name}": the chip says ${c.count}, the Kanban column says ${col.count}`).toBe(c.count);
          }
        } else {
          test.info().annotations.push({ type: 'gap', description: 'Leads Kanban drew no .kb-column: its columns were not compared with the status chips' });
        }
        await page.locator('#btn-status-layout-list').click().catch(() => {});
        await settle();
      }
    } finally {
      await page.locator('#btn-view-nature').click().catch(() => {});
      await settle(1200);
    }
  });

  test('CV-03 | Follow-ups › Agenda: each day lists as many follow-ups as the week strip says, and Missed equals List View\'s Delayed', async () => {
    await go('/followups');
    const agenda = page.locator('#btn-view-agenda');
    test.skip(!(await agenda.count()), 'this build has no Agenda on Follow-ups');
    if (!(await agenda.evaluate((b) => b.classList.contains('active')))) { await agenda.click(); await settle(2500); }

    const days = await page.evaluate(() => [...document.querySelectorAll('[id^="btn-agenda-day-"]')].map((b) => {
      const t = (b.innerText || '').replace(/\s+/g, ' ').trim(); const m = t.match(/(\d+)\s*followups?/i);
      return { id: b.id, text: t, count: m ? Number(m[1]) : null, today: b.classList.contains('today') };
    }));
    console.log(`  week: ${days.map((d) => d.text).join(' | ')}`);
    expect(days.length, 'the Agenda week strip should show seven days').toBe(7);
    expect(days.filter((d) => d.today).length, 'exactly one day is marked Today').toBe(1);
    for (const d of days) expect(d.count, `"${d.text}" shows no follow-up count`).not.toBeNull();

    // open up to four days that have follow-ups (and today) and count what each lists
    const toOpen = [...days.filter((d) => d.count > 0).slice(0, 4), ...days.filter((d) => d.today && d.count === 0)];
    for (const d of toOpen) {
      await page.locator(`#${d.id}`).click({ timeout: 10000 });
      await settle(2000);
      const listed = await page.locator('[id^="chk-agenda-"]').count();
      console.log(`  ${d.text} → ${listed} listed`);
      expect(listed, `${d.text}: the strip says ${d.count} but the day lists ${listed}`).toBe(d.count);
    }
    const missed = await countOf('#btn-agenda-missed').catch(() => null);
    // the strip's "Missed 33 Delayed" keeps its number before the word: read the first number instead
    const missedN = await page.locator('#btn-agenda-missed').evaluate((b) => { const m = (b.innerText || '').match(/(\d+)/); return m ? Number(m[1]) : null; }).catch(() => missed);

    await page.locator('#btn-view-list').click();
    await settle(2500);
    try {
      const delayed = await countOf('#tab-followup-overdue');
      console.log(`  Agenda Missed ${missedN} | List View Delayed ${delayed}`);
      expect(missedN, `the Agenda says ${missedN} missed, List View says ${delayed} delayed`).toBe(delayed);
    } finally {
      await page.locator('#btn-view-agenda').click().catch(() => {});
      await settle(1200);
    }
  });

  test('CV-04 | Follow-ups › List View and Kanban: chip counts equal rows, and the Kanban total equals its columns and the chips', async () => {
    await go('/followups');
    const list = page.locator('#btn-view-list');
    test.skip(!(await list.count()), 'this build has no List View switch on Follow-ups');
    await list.click();
    await settle(2500);
    try {
      const counts = {};
      for (const [id, label] of [['tab-followup-today', "Today's"], ['tab-followup-overdue', 'Delayed'], ['tab-followup-upcoming', 'Upcoming'], ['tab-followup-nonfollowup', 'Non Followup']]) {
        await expect(page.locator(`#${id}`), `the "${label}" chip is missing from the Follow-ups list`).toBeVisible();
        counts[label] = await chipListsItsRows(`#${id}`, `Follow-ups › ${label}`);
      }

      await page.locator('#btn-view-kanban').click();
      await settle(3500);
      const kb = await page.evaluate(() => {
        const info = ((document.querySelector('.kb-board-info') || {}).innerText || '').replace(/\s+/g, ' ');
        const total = (info.match(/Total:\s*(\d+)/i) || [])[1]; const ncols = (info.match(/Columns:\s*(\d+)/i) || [])[1];
        return {
          info, total: total === undefined ? null : Number(total), ncols: ncols === undefined ? null : Number(ncols),
          cols: [...document.querySelectorAll('.kb-column')].filter((c) => c.getClientRects().length).map((c) => ({
            name: ((c.querySelector('.kb-column-title') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
            count: Number(((c.querySelector('.kb-column-count') || {}).textContent || '').replace(/[^\d]/g, '') || 0),
            cards: c.querySelectorAll('.kb-card').length,
          })),
        };
      });
      console.log(`  kanban: ${kb.info} | ${kb.cols.map((c) => `${c.name} ${c.count} (${c.cards} cards)`).join(' · ')}`);
      expect(kb.total, 'the Kanban shows no "Total: n followups"').not.toBeNull();
      expect(kb.cols.length, `the Kanban says ${kb.ncols} columns but draws ${kb.cols.length}`).toBe(kb.ncols);
      expect(kb.cols.reduce((a, c) => a + c.count, 0), `the column counts do not add up to Total ${kb.total}`).toBe(kb.total);
      for (const c of kb.cols) expect(c.cards, `Kanban column "${c.name}": the count says ${c.count} but ${c.cards} card(s) are drawn`).toBe(c.count);
      const chipTotal = Object.values(counts).reduce((a, n) => a + n, 0);
      expect(kb.total, `the Kanban total (${kb.total}) should equal Today's + Delayed + Upcoming + Non Followup (${chipTotal})`).toBe(chipTotal);
    } finally {
      await page.locator('#btn-view-agenda').click().catch(() => {});
      await settle(1200);
    }
  });

  test('CV-05 | Quotations: the Board columns and the Table tabs carry the same counts; cards and rows match them', async () => {
    await go('/quotations');
    const boardBtn = page.locator('#quot-view-board');
    test.skip(!(await boardBtn.count()), 'this build has no Board on Quotations');
    if (!(await boardBtn.evaluate((b) => b.classList.contains('active')))) { await boardBtn.click(); await settle(2500); }
    const cols = await page.evaluate(() => [...document.querySelectorAll('.qb-col')].map((c) => {
      const title = c.querySelector('.qb-col-title'); const count = c.querySelector('.qb-count');
      const name = [...title.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      return { id: c.id, name, count: Number((count ? count.textContent : '0').replace(/[^\d]/g, '') || 0), cards: c.querySelectorAll('.qb-card').length };
    }));
    console.log(`  board: ${cols.map((c) => `${c.name} ${c.count} (${c.cards} cards)`).join(' · ')}`);
    expect(cols.map((c) => c.name), 'board columns').toEqual(['New', 'In Follow Up', 'Won', 'Lost']);
    for (const c of cols) expect(c.cards, `Board column "${c.name}": the count says ${c.count} but ${c.cards} card(s) are drawn`).toBe(c.count);

    await page.locator('#quot-view-table').click();
    await settle(2500);
    try {
      const tabs = {};
      for (const [id, label] of [['quot-tab-all', 'All'], ['quot-tab-0', 'New'], ['quot-tab-1', 'In Follow Up'], ['quot-tab-2', 'Won'], ['quot-tab-3', 'Lost']]) tabs[label] = await countOf(`#${id}`);
      console.log(`  table tabs: ${JSON.stringify(tabs)}`);
      for (const c of cols) expect(tabs[c.name], `"${c.name}": the Board says ${c.count}, the Table tab says ${tabs[c.name]}`).toBe(c.count);
      expect(tabs.New + tabs['In Follow Up'] + tabs.Won + tabs.Lost, `the tabs do not add up to All (${tabs.All})`).toBe(tabs.All);
      await chipListsItsRows('#quot-tab-all', 'Quotations › All');
    } finally {
      await page.locator('#quot-view-board').click().catch(() => {});
      await settle(1200);
    }
  });

  test('CV-06 | Enquiry Overview: the summary strip, the heading and the Enquiry Details card agree, and every tab opens', async () => {
    const enq = new EnquiryPage(page);
    await enq.openFirstEnquiry();
    await settle(2500);
    const o = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const pairs = (root) => { const out = {}; if (!root) return out; for (const k of root.querySelectorAll('span.k')) { const v = k.nextElementSibling; const key = clean(k.textContent); if (key && !(key in out)) out[key] = v ? clean(v.textContent) : ''; } return out; };
      const strip = [...document.querySelectorAll('.card')].find((c) => c.querySelector('span.k') && !c.querySelector('.card-title, .nav-tabs') && c.getClientRects().length);
      const details = [...document.querySelectorAll('.ev-card')].find((c) => /^enquiry details$/i.test(clean((c.querySelector('.card-title') || {}).textContent)));
      const h1 = document.querySelector('h1.page-title');
      return {
        heading: h1 ? [...h1.querySelectorAll('.badge')].map((b) => clean(b.textContent)) : [],
        strip: pairs(strip), details: pairs(details),
        tabs: [...document.querySelectorAll('.ev-tabs .nav-link')].map((t) => ({ id: t.id, label: clean(t.textContent).replace(/\s*\d+$/, '') })),
      };
    });
    console.log(`  heading ${JSON.stringify(o.heading)} | strip ${JSON.stringify(o.strip)} | details ${JSON.stringify({ Status: o.details.Status, Assignee: o.details.Assignee, 'Lead Quality': o.details['Lead Quality'] })}`);
    test.skip(!Object.keys(o.strip).length, 'this build has no summary strip on the Enquiry Overview (older layout)');
    for (const k of ['Status', 'Lead Quality', 'Assignee', 'Added']) expect(o.strip, `the summary strip has no "${k}"`).toHaveProperty(k);
    expect(o.strip.Status, 'the summary strip shows no status').toBeTruthy();
    expect(o.heading, `the page heading does not carry the status "${o.strip.Status}"`).toContain(o.strip.Status);
    expect(o.details.Status, 'Status: summary strip vs Enquiry Details').toBe(o.strip.Status);
    expect(o.details.Assignee, 'Assignee: summary strip vs Enquiry Details').toBe(o.strip.Assignee);
    if (o.details['Lead Quality'] !== undefined) expect(o.details['Lead Quality'], 'Lead Quality: summary strip vs Enquiry Details').toBe(o.strip['Lead Quality']);

    expect(o.tabs.map((t) => t.label), 'overview tabs').toEqual(expect.arrayContaining(['Enquiry Details', 'Followup History', 'Assignment History', 'Notes']));
    for (const t of o.tabs) {
      await page.locator(`#${t.id}`).click({ timeout: 8000 });
      await page.waitForTimeout(1200);
      const pane = page.locator('.tab-pane.active').first();
      const text = (await pane.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      expect(text, `tab "${t.label}" shows an error`).not.toMatch(/oops|something went wrong|error code|unhandled/i);
      expect(text.length > 0 || (await pane.locator('img').count()) > 0, `tab "${t.label}" is blank`).toBe(true);
    }
    await page.locator('#basic-info-tab').click().catch(() => {});
  });

  test('CV-07 | New Enquiry form: sections are numbered in order and Cancel / Save stay in view while scrolling', async () => {
    await go('/enquiry');
    await page.locator('#btn-save-enquiry').waitFor({ state: 'visible', timeout: 30000 });
    const sections = await page.evaluate(() => [...document.querySelectorAll('.enq-card')].filter((c) => c.getClientRects().length).map((c) => ({
      step: ((c.querySelector('.enq-step') || {}).textContent || '').trim(), title: ((c.querySelector('.card-title') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    })));
    console.log(`  sections: ${sections.map((s) => `${s.step}. ${s.title}`).join(' · ')}`);
    test.skip(!sections.length, 'this build has no numbered sections on the Enquiry form (older layout)');
    expect(sections.map((s) => s.step), 'the sections should be numbered 1, 2, 3 … with no gap').toEqual(sections.map((_, i) => String(i + 1)));
    expect(sections.map((s) => s.title), 'the form should have Customer and Requirement sections').toEqual(expect.arrayContaining(['Customer', 'Requirement']));
    for (const s of sections) expect(s.title, `section ${s.step} has no title`).toBeTruthy();

    // sticky action bar: Save and Cancel are on screen at the top of the form and at the bottom
    const inView = () => page.evaluate(() => ['btn-save-enquiry', 'btn-cancel-enquiry'].map((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    expect(await inView(), 'Save / Cancel are not on screen at the top of the form').toEqual([true, true]);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    expect(await inView(), 'Save / Cancel are not on screen at the bottom of the form').toEqual([true, true]);
    // leave without saving
    await page.locator('#btn-cancel-enquiry').click().catch(() => {});
  });
});
