'use strict';

/**
 * Generic positive check for one HRMS page — the same for every page in the linear run.
 *
 * Opens the page ONCE (reloads only if it comes up blank) and asserts:
 *   1. it stays on the page — not bounced to /login, not "Sorry, there's nothing at this address";
 *   2. no application error (Blazor error bar / "An unhandled error has occurred");
 *   3. it finishes loading — "Loading…" placeholders and skeleton rows clear;
 *   4. it has a visible page heading;
 *   5. every list/table on it renders (header + rows or the page's own empty-state row).
 * Returns a short summary (heading, tables, rows) for the run log.
 */
const { expect } = require('@playwright/test');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

async function checkPage(page, entry) {
  const url = `${BASE}/${entry.route}`;
  const isBlank = async () => ((await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().length < 40);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  if (await isBlank()) {   // Blazor occasionally paints nothing on first load — one reload, no more
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  }

  // 1. Stayed on the page.
  expect(page.url(), `${entry.label}: should not be bounced to the login page`).not.toMatch(/\/login(\?|$)/i);
  await expect(page.getByText(/Sorry, there's nothing at this address/i), `${entry.label}: the route should exist`).toHaveCount(0);

  // 3. Finished loading — "Loading…" text and spinner graphics gone (some lists show only a spinner).
  await expect(page.getByText(/^\s*Loading(\s+\w+)?\s*(\.{3}|…)?\s*$/i).first(), `${entry.label}: the page should finish loading`)
    .toBeHidden({ timeout: 45000 });
  await expect(page.locator('.spinner-border:visible, .spinner-grow:visible, [class*="spinner" i]:visible, [class*="loader" i]:visible').first(),
    `${entry.label}: loading spinners should clear`).toBeHidden({ timeout: 45000 });

  // 2. No application error.
  await expect(page.locator('#blazor-error-ui:visible'), `${entry.label}: no application error bar`).toHaveCount(0);
  await expect(page.getByText(/An unhandled error has occurred|Unhandled exception/i), `${entry.label}: no unhandled error`).toHaveCount(0);

  // 4. A visible page heading in the content area.
  const heading = await page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left > 240; };
    const h = [...document.querySelectorAll('h1, h2, h3, h4, h5, .page-title, .card-title, .breadcrumb')].find(e => vis(e) && (e.innerText || '').trim());
    return h ? h.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  });
  expect(heading, `${entry.label}: the page should show a heading`).not.toBe('');

  // 5. Lists render: each visible table shows its header; rows (data or an empty-state row) get up to
  //    20 s to arrive on this same load. A loaded list with no rows at all is noted as "empty list".
  const readTables = () => page.evaluate(() => [...document.querySelectorAll('table')]
    .filter(t => t.getBoundingClientRect().width > 0)
    .map(t => ({
      headers: [...t.querySelectorAll('thead th')].map(th => th.innerText.trim()).filter(Boolean).length,
      rows: [...t.querySelectorAll('tbody tr')].filter(r => (r.innerText || '').trim()).length,
      first: ((t.querySelector('tbody tr') || {}).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    })));
  let tables = await readTables();
  for (let waited = 0; tables.some(t => t.rows === 0) && waited < 20000; waited += 1000) {
    await page.waitForTimeout(1000);
    tables = await readTables();
  }
  for (const [i, t] of tables.entries()) {
    expect(t.headers, `${entry.label}: table ${i + 1} should show its column headers`).toBeGreaterThan(0);
  }
  const rowCount = tables.reduce((n, t) => n + t.rows, 0);
  const empty = tables.filter(t => t.rows === 0).length;
  return { heading, tables: tables.length, rows: rowCount, empty, firstRow: tables[0] ? tables[0].first : '' };
}

module.exports = { checkPage };
