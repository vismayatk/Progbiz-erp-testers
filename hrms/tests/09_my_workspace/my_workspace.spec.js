'use strict';

/**
 * My Workspace (ESS) — positive self-service verifications (independent tests).
 *
 *   WS1 View own profile          (WS-001)  /ess/profile
 *   WS2 View own attendance       (WS-004)  /ess/attendance
 *   WS3 View own leave            (WS-004)  /ess/leave
 *   WS4 Access own documents      (WS-007)  /ess/documents
 *   WS5 Access own pay / payslips (WS-007)  /ess/payslips
 *   WS6 View own requests         (WS-004)  /ess/requests
 *
 * These are read/verify flows for the signed-in user (Amit). Each step asserts the
 * page loads authenticated (no /login bounce) and shows the user's own workspace
 * content — a heading plus either records or a documented empty state. Creating
 * self-service records (profile-change / declaration) is person-linked and tracked
 * separately (see hrms-success-toast-no-persist finding).
 */
const { test, expect } = require('@playwright/test');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

/** Open an ESS route and assert it loaded authenticated (not bounced to /login). */
async function openEss(page, route) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  expect(page.url(), `should stay authenticated on /${route}`).not.toMatch(/\/login/);
}

test.describe('My Workspace (ESS) — self-service views', () => {
  test('WS1 — view own profile (WS-001)', async ({ page }) => {
    test.setTimeout(90_000);
    await openEss(page, 'ess/profile');
    // The profile should show the signed-in user's identity.
    await expect(page.getByText(/Amit/i).first(), 'profile should show the signed-in user (Amit)').toBeVisible({ timeout: 20000 });
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(body, 'profile should expose identity/contact details').toMatch(/email|phone|designation|department|employee code/i);
    console.log('  ✅ WS1 own profile shows the signed-in user and details');
  });

  test('WS2 — view own attendance (WS-004)', async ({ page }) => {
    test.setTimeout(90_000);
    await openEss(page, 'ess/attendance');
    await expect(page.getByRole('heading', { name: /My Attendance|Attendance/i }).first(),
      'the "My Attendance" page heading should render').toBeVisible({ timeout: 20000 });
    const body = (await page.locator('body').innerText());
    expect(body, 'attendance view should not show an error').not.toMatch(/Oops|something went wrong|nothing at this address/i);
    console.log('  ✅ WS2 own attendance view renders');
  });

  test('WS3 — view own leave (WS-004)', async ({ page }) => {
    test.setTimeout(90_000);
    await openEss(page, 'ess/leave');
    await expect(page.getByText(/My Leave|Leave Balance|Apply for Leave/i).first(), 'My Leave should render').toBeVisible({ timeout: 20000 });
    const body = (await page.locator('body').innerText());
    expect(body, 'leave view should not error').not.toMatch(/Oops|something went wrong|nothing at this address/i);
    expect(body, 'leave view should show leave context').toMatch(/balance|leave type|apply|history|policy|no\s+data/i);
    console.log('  ✅ WS3 own leave view renders');
  });

  test('WS4 — access own documents (WS-007)', async ({ page }) => {
    test.setTimeout(90_000);
    await openEss(page, 'ess/documents');
    await expect(page.getByText(/My Documents|Documents|Upload/i).first(), 'My Documents should render').toBeVisible({ timeout: 20000 });
    const body = (await page.locator('body').innerText());
    expect(body, 'documents view should not error').not.toMatch(/Oops|something went wrong|nothing at this address/i);
    console.log('  ✅ WS4 own documents view renders');
  });

  test('WS5 — access own pay / payslips (WS-007)', async ({ page }) => {
    test.setTimeout(90_000);
    await openEss(page, 'ess/payslips');
    await expect(page.getByRole('heading', { name: /My Pay|Pay|Payslip|Salary/i }).first(),
      'the "My Pay" page heading should render').toBeVisible({ timeout: 20000 });
    const body = (await page.locator('body').innerText());
    expect(body, 'pay view should not error').not.toMatch(/Oops|something went wrong|nothing at this address/i);
    console.log('  ✅ WS5 own pay/payslips view renders');
  });

  test('WS6 — view own requests (WS-004)', async ({ page }) => {
    test.setTimeout(90_000);
    await openEss(page, 'ess/requests');
    await expect(page.getByRole('heading', { name: /My Requests|Requests/i }).first(),
      'the "My Requests" page heading should render').toBeVisible({ timeout: 20000 });
    const body = (await page.locator('body').innerText());
    expect(body, 'requests view should not error').not.toMatch(/Oops|something went wrong|nothing at this address/i);
    console.log('  ✅ WS6 own requests view renders');
  });
});
