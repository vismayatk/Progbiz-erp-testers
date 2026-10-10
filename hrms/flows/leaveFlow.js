'use strict';

/**
 * Leave flow — shared helpers for the leave specs (admin side).
 *
 *   assignLeavePattern(page, code)   /leave-assignment-list → New Leave Assignment (Employee)
 *   selectOnBehalfEmployee(page, re) /leave-request-on-behalf employee picker
 *   leaveTypeSelect(page)            the select offering Casual/Medical Leave
 *   availableDays(page, code, type)  fresh read of "<n> d available" for an employee's leave type
 */
const { expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../pages/FormKit');

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

/** A weekday `days` ahead (skip Sat/Sun so the leave has >0 working days), as YYYY-MM-DD. */
function futureWeekdayISO(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Select an employee in an async-loading on-behalf dropdown (options stream in). */
async function selectOnBehalfEmployee(page, nameRe) {
  const sel = page.getByText(/Employee \*/i).first().locator('xpath=following::select[1]');
  await expect(sel, 'the on-behalf Employee select should render').toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await sel.locator('option').count()), { timeout: 20000, message: 'employee options should load' }).toBeGreaterThan(5);
  const opt = (await sel.locator('option').allTextContents()).find(t => nameRe.test(t));
  expect(opt, `an on-behalf option matching ${nameRe}`).toBeTruthy();
  await sel.selectOption({ label: opt });
  await page.waitForTimeout(2500);
  return opt;
}

/** The on-behalf "Leave Type" select — the one offering Casual/Medical Leave. */
function leaveTypeSelect(page) {
  return page.locator('select').filter({ has: page.locator('option', { hasText: /Casual Leave|Medical Leave/i }) }).first();
}

/** Assign the "Standard Staff" leave pattern to the employee with this code; verify it took effect. */
async function assignLeavePattern(page, code, pattern = 'Standard Staff') {
  const fk = new FormKit(page);
  await page.goto(`${BASE}/leave-assignment-list`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator('a, button, [role="button"]').filter({ hasText: /^\s*New Leave Assignment\s*$/i }).first().click();
  const form = await fk.scope({ ready: 'select' });

  await fk.setSelect(fk.selectWithOption(form, 'Tenant'), 'Employee', 'Assignment Type', { loose: true });
  await page.waitForTimeout(1200);
  await fk.pickByOption(form, `[${code}]`, 'Employee (target)');
  await fk.setSelect(fk.selectWithOption(form, pattern), pattern, 'Leave Pattern', { loose: true });

  const assignBtn = fk.saveButton(form, /^\s*assign\s*$|save|submit/i);
  const via = await fk.saveAndConfirm(assignBtn, { name: 'Assign', successRe: /success|assigned|saved|created|added/i });

  // Persisted check (functional): the employee now has selectable leave types with balance.
  await page.goto(`${BASE}/leave-request-on-behalf`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await selectOnBehalfEmployee(page, new RegExp(`\\[${code}\\]`));
  const lt = leaveTypeSelect(page);
  await expect(lt, 'a Leave Type select should appear for the assigned employee').toBeVisible({ timeout: 20000 });
  const types = (await lt.locator('option').allTextContents()).map(t => t.trim()).filter(t => !/^choose/i.test(t));
  expect(types.length, `the assigned employee should have leave types (got: ${JSON.stringify(types)})`).toBeGreaterThan(0);
  return { via, types };
}

/**
 * Fresh read of an employee's available days for a leave type (admin, on-behalf page). Re-opens
 * the page and re-selects the employee so the balance is re-fetched from the server.
 */
async function availableDays(page, code, typeRe = /Casual Leave/i) {
  await page.goto(`${BASE}/leave-request-on-behalf`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await selectOnBehalfEmployee(page, new RegExp(`\\[${code}\\]`));
  const opt = (await leaveTypeSelect(page).locator('option').allTextContents()).find(t => typeRe.test(t)) || '';
  return Number((opt.match(/(\d+)\s*d available/i) || [])[1] ?? NaN);
}

/**
 * Admin "Apply Leave for Employee" → Apply and Approve, 1 day of Casual Leave on `day`.
 * Fails on a refusal; verifies the Casual balance drops by 1 on a fresh read. → { day, before, after }
 */
async function applyOnBehalf(page, code, day) {
  const fk = new FormKit(page);
  const nameRe = new RegExp(`\\[${code}\\]`);
  await page.goto(`${BASE}/leave-request-on-behalf`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await selectOnBehalfEmployee(page, nameRe);
  const lt = leaveTypeSelect(page);
  await expect(lt, 'Leave Type select should be present').toBeVisible({ timeout: 20000 });
  const casual = (await lt.locator('option').allTextContents()).find(t => /Casual Leave/i.test(t));
  expect(casual, 'Casual Leave with an available balance').toBeTruthy();
  const before = Number((casual.match(/(\d+)\s*d available/i) || [])[1] ?? NaN);
  expect(Number.isNaN(before), 'Casual Leave should show "<n> d available"').toBe(false);
  await lt.selectOption({ label: casual });
  await page.waitForTimeout(1500);
  await fk.setInput(page.getByText(/Start Date \*/i).first().locator('xpath=following::input[@type="date"][1]'), day, 'Start Date');
  await fk.setInput(page.getByText(/End Date \*/i).first().locator('xpath=following::input[@type="date"][1]'), day, 'End Date');
  await fk.setInput(page.locator('#onbehalf-reason'), 'Personal work — applied by HR on the employee\'s behalf', 'Reason');
  await page.locator('button, a.btn').filter({ hasText: /Apply and Approve/i }).first().click();
  // SweetAlert: confirm, then the result — fail loudly on a refusal.
  let said = '';
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    said = (await page.locator('.swal2-popup, .toast, .toast-body, [role="alert"]').allInnerTexts().catch(() => [])).join(' | ').replace(/\s+/g, ' ');
    if (/balance is updated|applied for .* and approved/i.test(said)) break;
    if (/conflict|overlap|insufficient|exceed|not enough/i.test(said)) throw new Error(`"Apply and Approve" was refused: "${said}"`);
    const ok = page.locator('.swal2-confirm');
    if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  expect(said, 'the app should confirm the leave was applied and approved').toMatch(/balance is updated|applied for .* and approved/i);
  const after = await availableDays(page, code);
  expect(after, `Casual Leave available should drop from ${before} to ${before - 1}`).toBe(before - 1);
  return { day, before, after };
}

// ── Employee self-service (run inside a withUser() session) ──

/** My Leave renders "Loading balances…" / "Loading…" placeholders first — wait until both are gone. */
async function waitMyLeaveLoaded(page) {
  await expect(page.getByText(/Loading balances|^\s*Loading\.{0,3}…?\s*$/i).first(),
    'My Leave should finish loading its balances and requests').toBeHidden({ timeout: 45000 }).catch(() => {});
}

/** Employee: fresh My Leave load → { available, balance, reserved, used } for a leave type. */
async function myBalance(page, type) {
  await new FormKit(page).gotoReady(`${BASE}/ess/leave`, { ready: /My Leave Requests/i });
  await waitMyLeaveLoaded(page);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const m = text.match(new RegExp(`${type}.*?(\\d+) available Balance (\\d+) Reserved (\\d+) Used (\\d+)`));
  expect(m, `My Leave should show a ${type} balance card`).toBeTruthy();
  return { available: Number(m[1]), balance: Number(m[2]), reserved: Number(m[3]), used: Number(m[4]) };
}

/** Employee: fresh My Leave load → the "My Leave Requests" row for this request's date (dd/mm/yyyy). */
async function myRequestRow(page, dayISO) {
  const [y, m, d] = dayISO.split('-');
  const shown = `${d}/${m}/${y}`;
  await new FormKit(page).gotoReady(`${BASE}/ess/leave`, { ready: /My Leave Requests/i });
  await waitMyLeaveLoaded(page);
  await page.locator('table tbody tr').filter({ hasText: shown }).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const rows = await page.$$eval('table tbody tr', t => t.map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  return { text: rows.find(r => r.includes(shown)) || '' };
}

/** Employee: My Leave → Apply for Leave → type, description, Full Day, date → Apply (fails on a refusal). */
async function employeeApplies(page, { type, reason, day }) {
  const fk = new FormKit(page);
  // Use My Leave if it is already open (e.g. right after reading the balance) — loading it a second
  // time straight away has hung on the app's full-page spinner. Navigate only when not already there.
  const applyBtn = page.locator('a, button').filter({ hasText: /^\s*Apply for Leave\s*$/ }).first();
  if (!/\/ess\/leave/.test(page.url()) || !(await waitVisible(applyBtn, 5000))) {
    await fk.gotoReady(`${BASE}/ess/leave`, { ready: /My Leave Requests/i, timeout: 45000 });
  }
  await expect(applyBtn, '"Apply for Leave" should be offered on My Leave').toBeVisible({ timeout: 30000 });
  await applyBtn.click();
  await expect(page, 'Apply for Leave opens the leave request page').toHaveURL(/\/leave-request/, { timeout: 20000 });
  await fk.setSelect(page.locator('select').filter({ has: page.locator('option', { hasText: type }) }).first(), type, 'Leave Type');
  await fk.setInput(page.locator('#remarks'), reason, 'Description');
  await page.locator('button, label').filter({ hasText: /^\s*Full Day\s*$/ }).first().click();
  await fk.setInput(page.getByText(/Start Date \*/).first().locator('xpath=following::input[@type="date"][1]'), day, 'Start Date');
  await fk.setInput(page.getByText(/End Date \*/).first().locator('xpath=following::input[@type="date"][1]'), day, 'End Date');
  await page.waitForTimeout(2500);   // the policy check runs once the dates are picked
  const policy = (await page.locator('body').innerText()).replace(/\s+/g, ' ').match(/Policy check.{0,200}/)?.[0] || '';
  expect(policy, 'the policy check should not block the request').not.toMatch(/not allowed|insufficient|exceed|violat|cannot/i);
  await page.locator('button').filter({ hasText: /^\s*Apply\s*$/ }).first().click();
  let said = '';
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    said = (await page.locator('.swal2-popup, .toast, [role="alert"]').allInnerTexts().catch(() => [])).join(' | ').replace(/\s+/g, ' ');
    if (/conflict|overlap|insufficient|exceed|not allowed|failed|error/i.test(said)) throw new Error(`the leave request was refused: "${said}"`);
    if (/success|submitted|applied|sent for approval/i.test(said)) break;
    const ok = page.locator('.swal2-confirm');
    if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  expect(said, 'the app should confirm the leave request').toMatch(/success|submitted|applied|sent for approval/i);
  return said;
}

/**
 * Manager (admin page): find the employee's Pending request on Leave Approval — rows show only the
 * FIRST name, so each candidate row's View details is opened until one carries `reason` — then
 * "Approve" → "Yes, Approve". One page load, waiting for the row; reload only if it isn't there.
 */
async function managerApproves(page, firstName, reason) {
  const firstCell = new RegExp(`^\\s*\\d+\\s+${firstName}\\b`);
  let target = -1;
  await expect.poll(async () => {
    await new FormKit(page).gotoReady(`${BASE}/leave-approval`, { ready: 'table tbody tr' });
    await page.locator('table tbody tr').filter({ hasText: new RegExp(`\\b${firstName}\\b`) }).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const rows = await page.$$eval('table tbody tr', t => t.map(r => r.innerText.replace(/\s+/g, ' ').trim()));
    for (const { i } of rows.map((t, i) => ({ t, i })).filter(x => firstCell.test(x.t) && /\bPending\b/.test(x.t))) {
      const row = page.locator('table tbody tr').nth(i);
      await row.locator('[title="View details"]').or(row.locator('button, a').filter({ hasText: /View details/i })).first().click();
      const dlg = page.locator('.modal.show, .offcanvas.show').first();
      await expect(dlg, 'the leave details open').toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(1000);
      const details = (await dlg.innerText()).replace(/\s+/g, ' ');
      await dlg.locator('button').filter({ hasText: /^\s*(Close|Cancel|×)\s*$/ }).first().click().catch(() => page.keyboard.press('Escape'));
      await expect(dlg, 'the leave details close').toBeHidden({ timeout: 10000 });
      if (details.includes(reason)) { target = i; return true; }
    }
    return false;
  }, { timeout: 90000, intervals: [10000], message: `Leave Approval should list ${firstName}'s request "${reason}"` }).toBe(true);
  await page.locator('table tbody tr').nth(target).locator('button, a').filter({ hasText: /^\s*Approve\s*$/ }).first().click();
  const dlg = page.locator('.swal2-popup').filter({ hasText: /Approve Leave Request\?/i }).first();
  await expect(dlg, '"Approve Leave Request?" confirmation').toBeVisible({ timeout: 10000 });
  await dlg.locator('button').filter({ hasText: /^\s*Yes, Approve\s*$/i }).first().click();
  await expect(dlg, 'the approval confirmation closes').toBeHidden({ timeout: 20000 });
}

module.exports = {
  BASE, futureWeekdayISO, selectOnBehalfEmployee, leaveTypeSelect, assignLeavePattern, availableDays,
  applyOnBehalf, waitMyLeaveLoaded, myBalance, myRequestRow, employeeApplies, managerApproves,
};
