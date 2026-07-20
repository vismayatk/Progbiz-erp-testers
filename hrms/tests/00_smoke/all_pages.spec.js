'use strict';

/**
 * HRMS smoke suite — one test per page (80 pages, data-driven).
 *
 * For every page in fixtures/page-manifest.js:
 *   1. navigate (authenticated via storageState) and wait for the SPA to settle
 *   2. assert we were not bounced to /login
 *   3. assert the page identity: title text visible in the content area
 *   4. assert its identity buttons are visible
 *   5. assert the first data grid's column headers (when the page has one)
 *   6. assert its tabs (when the page has them)
 *
 * Known build quirks (misspellings, copy-paste headers) are asserted AS-IS —
 * the manifest documents them via the `quirk` field.
 */
const { test, expect } = require('@playwright/test');
const { BasePage, escapeRe } = require('../../pages/BasePage');
const manifest = require('../../fixtures/page-manifest');

const byGroup = manifest.reduce((acc, e) => ((acc[e.group] = acc[e.group] || []).push(e), acc), {});

for (const [group, entries] of Object.entries(byGroup)) {
  test.describe(`smoke: ${group}`, () => {
    for (const entry of entries) {
      test(`/${entry.route} renders aligned`, async ({ page }) => {
        const po = new BasePage(page, entry.route);
        await po.goto();

        // Public/shell-less pages (e.g. /current-openings) have no <main> region —
        // fall back to body for all content-scoped assertions.
        const region = (await po.main.count()) ? po.main : page.locator('body');

        // 1. identity — title text somewhere prominent in the content area
        if (entry.title) {
          await expect(
            region.getByText(new RegExp(escapeRe(entry.title), 'i')).first(),
            `page title "${entry.title}" should be visible on /${entry.route}`,
          ).toBeVisible({ timeout: 25000 });
        }

        // 2. identity buttons
        for (const name of entry.buttons || []) {
          await expect(
            po.buttonContaining(name),
            `button "${name}" should be visible on /${entry.route}`,
          ).toBeVisible();
        }

        // 3. grid columns — subset check against the first table
        if (entry.columns && entry.columns.length) {
          const headers = await po.gridHeaderTexts();
          const missing = entry.columns.filter(c => !headers.some(h => h.toLowerCase() === c.toLowerCase()));
          expect(missing, `columns ${JSON.stringify(missing)} missing on /${entry.route} — saw ${JSON.stringify(headers)}`)
            .toEqual([]);
        }

        // 4. tabs
        for (const t of entry.tabs || []) {
          await expect(po.tab(t), `tab "${t}" should be visible on /${entry.route}`).toBeVisible();
        }
      });
    }
  });
}
