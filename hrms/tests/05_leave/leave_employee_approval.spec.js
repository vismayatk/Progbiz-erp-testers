'use strict';

/**
 * Leave — employee applies, manager approves (two actors, SERIAL, on the RUN EMPLOYEE).
 *
 *   LA2 The run employee has leave types (Standard Staff — assigned now if missing)  /leave-request-on-behalf
 *   LA3 The EMPLOYEE signs in (own session) and reads their Casual balance           /ess/leave
 *   LA4 The employee applies for 1 day of Casual Leave → Pending, 1 day reserved      /leave-request
 *   LA5 Amit (manager) approves it — row confirmed via View details                   /leave-approval
 *   LA6 The employee sees Approved; Casual available −1, used +1                      /ess/leave
 *
 * One employee per run: the second actor is the employee Core HR Step 1 created
 * (flows/runEmployee.js) — username set at creation, initial password = the employee code the app
 * assigns. Amit is their reporting manager, so the request lands in Amit's approval queue (unlike
 * his own requests, which the app excludes from his queue). This spec creates nobody; balances
 * are checked RELATIVE to what the employee had at LA3 (earlier specs may have used leave).
 */
const { test, expect } = require('@playwright/test');
const { FormKit } = require('../../pages/FormKit');
const { tagged } = require('../../data/naming');
const { BASE, futureWeekdayISO, assignLeavePattern, selectOnBehalfEmployee, leaveTypeSelect } = require('../../flows/leaveFlow');
const { withUser } = require('../../flows/userSession');
const { requireRunEmployee, credentials } = require('../../flows/runEmployee');
const fs = require('fs');
const path = require('path');

// The request's state (balance before, reason, date) is saved after each step so a later step can
// be run on its own (`--grep "LA5"`) — .auth/ is git-ignored. The employee comes from runEmployee.
const STATE = path.join(__dirname, '..', '..', '.auth', 'leave-approval-run.json');
const KEEP = ['code', 'before', 'reason', 'day'];
const saveState = run => fs.writeFileSync(STATE, JSON.stringify(Object.fromEntries(KEEP.map(k => [k, run[k]])), null, 2));
function ensureState(run) {
  if (!run.emp) {
    run.emp = requireRunEmployee();
    run.code = run.emp.code;
    run.creds = credentials(run.emp);
  }
  if (run.before || !fs.existsSync(STATE)) return;
  const saved = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
  if (saved.code === run.code) Object.assign(run, saved);   // only this employee's request
}

test.describe.configure({ mode: 'serial' });

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe('Leave — employee applies, manager approves', () => {
  const run = {};

  test('LA2 — the run employee has leave types (Standard Staff)', async ({ page }) => {
    test.setTimeout(150_000);
    ensureState(run);
    console.log(`  🔁 Two-user leave for this run's employee ${run.emp.display} (${run.code})`);
    // LV6 normally assigned the pattern earlier in the run; assign it here only if it is missing.
    await page.goto(`${BASE}/leave-request-on-behalf`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await selectOnBehalfEmployee(page, new RegExp(`\\[${run.code}\\]`));
    const lt = leaveTypeSelect(page);
    if (await lt.count() === 0) {
      const { via } = await assignLeavePattern(page, run.code);
      console.log(`  ✅ LA2 Standard Staff assigned now (${via})`);
    }
    await page.goto(`${BASE}/leave-request-on-behalf`, { waitUntil: 'domcontentloaded' });
    await selectOnBehalfEmployee(page, new RegExp(`\\[${run.code}\\]`));
    const types = (await leaveTypeSelect(page).locator('option').allTextContents()).map(t => t.trim()).filter(t => /Casual Leave/i.test(t));
    expect(types.length, 'the run employee should have Casual Leave to apply against').toBeGreaterThan(0);
    console.log(`  ✅ LA2 ${run.emp.display} has leave types: ${JSON.stringify(types)}`);
  });

  test('LA3 — the employee signs in and sees their leave balance', async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    ensureState(run);
    await withUser(browser, testInfo, run.creds, async page => {
      console.log(`  ✅ LA3 ${run.creds.username} signed in`);
      const bal = await myBalance(page, 'Casual Leave');
      expect(bal.available, 'Casual Leave should have at least 1 day available to apply for').toBeGreaterThan(0);
      run.before = bal;
      saveState(run);
      console.log(`  ✅ LA3 My Leave shows Casual Leave ${bal.available} available (used ${bal.used})`);
    });
  });

  test('LA4 — the employee applies for 1 day of Casual Leave', async ({ browser }, testInfo) => {
    test.setTimeout(240_000);   // sign-in (may retry) + apply + persisted check on a slow-loading page
    ensureState(run);
    expect(run.before, 'LA4 depends on LA3 (balance before)').toBeTruthy();
    run.reason = tagged('Family function at hometown');
    run.day = futureWeekdayISO(21);
    await withUser(browser, testInfo, run.creds, async page => {
      const fk = new FormKit(page);
      await fk.gotoReady(`${BASE}/ess/leave`, { ready: /Apply for Leave/i });
      await page.locator('a, button').filter({ hasText: /^\s*Apply for Leave\s*$/ }).first().click();
      await expect(page, 'Apply for Leave should open the leave request page').toHaveURL(/\/leave-request/, { timeout: 20000 });

      const type = page.locator('select').filter({ has: page.locator('option', { hasText: 'Casual Leave' }) }).first();
      await fk.setSelect(type, 'Casual Leave', 'Leave Type');
      await fk.setInput(page.locator('#remarks'), run.reason, 'Description');
      const fullDay = page.locator('button, label').filter({ hasText: /^\s*Full Day\s*$/ }).first();
      await fullDay.click();
      await fk.setInput(page.getByText(/Start Date \*/).first().locator('xpath=following::input[@type="date"][1]'), run.day, 'Start Date');
      await fk.setInput(page.getByText(/End Date \*/).first().locator('xpath=following::input[@type="date"][1]'), run.day, 'End Date');
      // The policy check runs as soon as the dates are picked — it must not report a violation.
      await page.waitForTimeout(2500);
      const policy = (await page.locator('body').innerText()).replace(/\s+/g, ' ').match(/Policy check.{0,200}/)?.[0] || '';
      expect(policy, 'the policy check should not block the request').not.toMatch(/not allowed|insufficient|exceed|violat|cannot/i);

      const apply = page.locator('button').filter({ hasText: /^\s*Apply\s*$/ }).first();
      await expect(apply, '"Apply" should be enabled').toBeEnabled();
      await apply.click();
      // The app answers with a SweetAlert (confirm and/or result) — confirm, and fail on a refusal.
      const deadline = Date.now() + 25000;
      let said = '';
      while (Date.now() < deadline) {
        said = (await page.locator('.swal2-popup, .toast, [role="alert"]').allInnerTexts().catch(() => [])).join(' | ').replace(/\s+/g, ' ');
        if (/conflict|overlap|insufficient|exceed|not allowed|failed|error/i.test(said)) throw new Error(`the leave request was refused: "${said}"`);
        if (/success|submitted|applied|sent for approval/i.test(said)) break;
        const ok = page.locator('.swal2-confirm');
        if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
        await page.waitForTimeout(500);
      }
      saveState(run);
      console.log(`  ✅ LA4 leave applied for ${run.day} — app said: ${said || '(no message)'}`);

      // Persisted: My Leave Requests lists the request as Pending, and 1 day is reserved.
      await expect.poll(async () => (await myRequestRow(page, run.day)).text,
        { timeout: 90000, intervals: [10000], message: 'My Leave Requests should list the request as Pending' })
        .toMatch(/Casual Leave.*Pending/i);
      const bal = await myBalance(page, 'Casual Leave');
      expect(bal.reserved, 'the pending day should be reserved').toBe(1);
      console.log(`  ✅ LA4 persisted — request Pending, Casual Leave reserved ${bal.reserved}`);
    });
  });

  test('LA5 — the manager (Amit) approves it from Leave Approval', async ({ page }) => {
    test.setTimeout(240_000);
    ensureState(run);
    expect(run.reason, 'LA5 depends on LA4').toBeTruthy();
    const fk = new FormKit(page);
    // Rows show only the employee's FIRST name (e.g. "Sneha"), which can repeat — open each such
    // Pending row's details until one carries this run's unique description, then approve THAT row.
    // Load the page once and wait for the row; reload only if it hasn't appeared (no rapid refreshes).
    const first = run.emp.first;
    const firstCell = new RegExp(`^\\s*\\d+\\s+${first}\\b`);
    let target = -1;
    await expect.poll(async () => {
      await fk.gotoReady(`${BASE}/leave-approval`, { ready: 'table tbody tr' });
      await page.locator('table tbody tr').filter({ hasText: new RegExp(`\\b${first}\\b`) }).first()
        .waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      const rows = await page.$$eval('table tbody tr', t => t.map(r => r.innerText.replace(/\s+/g, ' ').trim()));
      const mine = rows.map((t, i) => ({ t, i })).filter(x => firstCell.test(x.t) && /\bPending\b/.test(x.t));
      for (const { i } of mine) {
        const row = page.locator('table tbody tr').nth(i);
        await row.locator('[title="View details"], button, a').filter({ hasText: /View details/i })
          .or(row.locator('[title="View details"]')).first().click();
        const dlg = page.locator('.modal.show, .offcanvas.show').first();
        await expect(dlg, 'the leave details should open').toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(1000);
        const details = (await dlg.innerText()).replace(/\s+/g, ' ');
        await dlg.locator('button').filter({ hasText: /^\s*(Close|Cancel|×)\s*$/ }).first().click().catch(() => page.keyboard.press('Escape'));
        await expect(dlg, 'the leave details should close').toBeHidden({ timeout: 10000 });
        if (details.includes(run.reason)) { target = i; return true; }
      }
      return false;
    }, { timeout: 90000, intervals: [10000], message: `Leave Approval should list ${run.emp.display}'s request "${run.reason}"` }).toBe(true);
    console.log(`  ✅ LA5 found ${run.emp.display}'s request in Leave Approval (confirmed via View details)`);

    const row = page.locator('table tbody tr').nth(target);
    await row.locator('button, a').filter({ hasText: /^\s*Approve\s*$/ }).first().click();
    // "Approve Leave Request? — Are you sure you want to approve this leave request?" → Yes, Approve.
    const dlg = page.locator('.swal2-popup').filter({ hasText: /Approve Leave Request\?/i }).first();
    await expect(dlg, 'the "Approve Leave Request?" confirmation should appear').toBeVisible({ timeout: 10000 });
    await dlg.locator('button').filter({ hasText: /^\s*Yes, Approve\s*$/i }).first().click();
    await expect(dlg, 'the approval confirmation should close').toBeHidden({ timeout: 20000 });
    console.log(`  ✅ LA5 Amit approved ${run.emp.display}'s leave`);
  });

  test('LA6 — the employee sees the leave Approved and the balance reduced', async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    ensureState(run);
    expect(run.before, 'LA6 depends on LA3–LA5').toBeTruthy();
    await withUser(browser, testInfo, run.creds, async page => {
      await expect.poll(async () => (await myRequestRow(page, run.day)).text,
        { timeout: 90000, intervals: [10000], message: 'My Leave Requests should show the request as Approved' })
        .toMatch(/Casual Leave.*Approved/i);
      const bal = await myBalance(page, 'Casual Leave');
      expect(bal.used, `the approved day should be counted as used (${run.before.used} → ${run.before.used + 1})`).toBe(run.before.used + 1);
      expect(bal.available, `Casual Leave should drop from ${run.before.available} to ${run.before.available - 1}`).toBe(run.before.available - 1);
      console.log(`  ✅ LA6 employee sees Approved — Casual Leave ${run.before.available} → ${bal.available} (used ${bal.used})`);
    });
  });
});


/** My Leave renders "Loading balances…" / "Loading…" placeholders first — wait until both are gone. */
async function waitMyLeaveLoaded(page) {
  await expect(page.getByText(/Loading balances|^\s*Loading\.{0,3}…?\s*$/i).first(),
    'My Leave should finish loading its balances and requests').toBeHidden({ timeout: 45000 }).catch(() => {});
}

/** Employee view: fresh My Leave load → { available, balance, reserved, used } for a leave type. */
async function myBalance(page, type) {
  const fk = new FormKit(page);
  await fk.gotoReady(`${BASE}/ess/leave`, { ready: /My Leave Requests/i });
  await waitMyLeaveLoaded(page);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const m = text.match(new RegExp(`${type}.*?(\\d+) available Balance (\\d+) Reserved (\\d+) Used (\\d+)`));
  expect(m, `My Leave should show a ${type} balance card`).toBeTruthy();
  return { available: Number(m[1]), balance: Number(m[2]), reserved: Number(m[3]), used: Number(m[4]) };
}

/** Employee view: fresh My Leave load → the "My Leave Requests" row for this request's date (dd/mm/yyyy). */
async function myRequestRow(page, dayISO) {
  const fk = new FormKit(page);
  const [y, m, d] = dayISO.split('-');
  const shown = `${d}/${m}/${y}`;
  await fk.gotoReady(`${BASE}/ess/leave`, { ready: /My Leave Requests/i });
  await waitMyLeaveLoaded(page);
  // Wait on this load for the request row to render before reading (no extra reload needed).
  await page.locator('table tbody tr').filter({ hasText: shown }).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const rows = await page.$$eval('table tbody tr', t => t.map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  return { text: rows.find(r => r.includes(shown)) || '' };
}
