'use strict';

/**
 * Project Management module — smoke coverage.
 *   PM-01  Projects listing loads with the expected columns
 *   PM-02  Add New Project page loads
 *   PM-03  Project sub-pages (Notes / Attachments / Expenses / Collections) reachable
 *
 * Run:  npx playwright test erp/project-management
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../common/LoginPage');
const { ProjectPage } = require('../pages/ProjectPage');
const { screenshot } = require('../../common/helpers');

const C = {
  company:  process.env.COMPANY_CODE || 'lesol_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

async function arrive(page) {
  const lp = new LoginPage(page);
  await lp.goto();
  await lp.login(C.company, C.username, C.password);
  return new ProjectPage(page);
}

test.describe('Project Management', () => {
  test.describe.configure({ timeout: 150_000 });

  test('PM-01 | Projects listing loads with columns', async ({ page }) => {
    const pm = await arrive(page);
    await pm.gotoProjects();
    expect(page.url()).toContain('/projects');
    const cols = (await pm.columns()).join(' | ');
    console.log('  🧾 Projects columns:', cols);
    for (const c of ['Project Name', 'Project Type', 'Status']) {
      expect(cols, `column "${c}" missing`).toMatch(new RegExp(c, 'i'));
    }
    await screenshot(page, 'pm01_projects');
    console.log('  ✅ Projects listing loaded with expected columns');
  });

  test('PM-02 | Add New Project page loads', async ({ page }) => {
    const pm = await arrive(page);
    await pm.gotoAddProject();
    expect(page.url()).toContain('/project');
    expect(await pm.is404(), 'Add Project page 404').toBeFalsy();
    // form content actually rendered (stepped form starts with customer/section pickers)
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll('button, a.btn')].map(b => (b.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(t => /add customer|add section|save|create/i.test(t)));
    console.log('  🔧 form controls:', JSON.stringify(controls.slice(0, 5)));
    expect(controls.length, 'Add Project form controls not rendered').toBeGreaterThan(0);
    await screenshot(page, 'pm02_add_project');
    console.log('  ✅ Add New Project page reachable with form controls');
  });

  test('PM-03 | Project sub-pages reachable', async ({ page }) => {
    const pm = await arrive(page);
    const pages = [
      ['Notes', () => pm.gotoNotes(), 'project-notes'],
      ['Attachments', () => pm.gotoAttachments(), 'project-attachments'],
      ['Expenses', () => pm.gotoExpenses(), 'project-expenses'],
      ['Collections', () => pm.gotoIncomes(), 'project-incomes'],
    ];
    for (const [label, nav, slug] of pages) {
      await nav();
      expect(page.url(), `${label} did not load`).toContain(slug);
      // goto() doesn't throw on a soft-404/error page rendered at the same URL — assert it isn't one
      expect(await pm.is404(), `${label} shows a 404/not-found page`).toBeFalsy();
      console.log(`  ✅ ${label} reachable`);
    }
    await screenshot(page, 'pm03_subpages');
  });
});
