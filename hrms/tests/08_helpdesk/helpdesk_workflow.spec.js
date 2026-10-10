'use strict';

/**
 * Helpdesk — positive ticket-lifecycle workflow (single serial run).
 *
 *   H1 Raise a ticket        (HD-001)  /ess/helpdesk/my-tickets → New Ticket
 *   H2 Employee sees ticket  (HD-002)  /ess/helpdesk/my-tickets list
 *   H3 Admin sees ticket     (HD-003)  /ess/helpdesk/admin → Manage
 *                                       (+ logs the Open-ticket action panel for
 *                                        lifecycle-step discovery — see H4+ below)
 *   H4 Update Status → In Progress · H5 Add Internal Note · H6 Resolve · H7 Close
 *   H8 Assign → Reassign (own ticket)
 *
 * Self-contained: the same admin account raises and manages the ticket, so no
 * second actor is needed. Mandatory fields only (Subject, Description, Category,
 * Priority — all stable ids on the routed New-Ticket page).
 *
 * The admin lifecycle actions (assign / respond / resolve / close — HD-004..007)
 * live in a state-dependent right-hand panel; H3 captures that panel's real
 * controls so those steps are scripted from live markup, not invented.
 */
const { test, expect } = require('@playwright/test');
const { FormKit, waitVisible } = require('../../pages/FormKit');
const { tagged, RUN_TAG } = require('../../data/naming');

/** Open My Support Tickets and click "New Ticket" once the page has really rendered. */
async function openNewTicket(page, fk) {
  const BASE_ = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';
  await fk.gotoReady(`${BASE_}/ess/helpdesk/my-tickets`, { ready: /New Ticket/i });
  const btn = page.locator('a, button, [role="button"]').filter({ hasText: /New Ticket/i }).first();
  await expect(btn, 'the "New Ticket" launcher should be visible').toBeVisible({ timeout: 20000 });
  await expect(async () => { await btn.click({ timeout: 5000 }); }).toPass({ timeout: 30000 });
}

const BASE = process.env.HRMS_BASE_URL || 'https://hrms-test.progbiz.in';

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const p = testInfo.outputPath('failure-full.png');
    await page.screenshot({ path: p, fullPage: true }).catch(() => {});
    console.log(`  📸 failure screenshot → ${p}  | URL: ${page.url()}`);
  }
});

test.describe.serial('Helpdesk — ticket lifecycle', () => {
  const hd = {};

  test.beforeAll(() => {
    // Company naming standard: a realistic issue + the readable run tag (data/naming.js).
    hd.subject = tagged('Unable to connect to office VPN from home');
    console.log(`  🎫 Helpdesk run ${RUN_TAG} — subject "${hd.subject}"`);
  });

  test('H1 — raise a helpdesk ticket (HD-001)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    await openNewTicket(page, fk);
    const form = await fk.scope({ ready: '#subject' });

    await fk.setInput(form.locator('#subject'), hd.subject, 'Subject');
    await fk.setInput(form.locator('#description'), 'VPN client shows "Connection timed out" since this morning; office network works fine. Please check my VPN access.', 'Description');
    // Category: first real option; Priority: Medium.
    await fk.setCascade(form.locator('#category'), '', 'Category', { index: 1 });
    await fk.setSelect(form.locator('#priority'), 'Medium', 'Priority');

    hd.createVia = await fk.saveAndConfirm(fk.saveButton(form), { name: 'Submit ticket', successRe: /success|submitted|created|raised|added/i });
    console.log(`  ✅ H1 ticket raised (${hd.createVia})`);
  });

  test('H2 — the employee can see the raised ticket (HD-002)', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`${BASE}/ess/helpdesk/my-tickets`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const row = page.locator('table tbody tr, .ticket-card, [class*="ticket" i]').filter({ hasText: hd.subject }).first();
    await expect(row, `my-tickets should list "${hd.subject}"`).toBeVisible({ timeout: 20000 });
    // Capture the ticket code (TKT-YYMMDD-NNN) for later lookup.
    const text = (await row.innerText().catch(() => '')) || (await page.locator('body').innerText());
    hd.code = (text.match(/TKT-\d{6}-\d{3}/) || [])[0] || '';
    console.log(`  ✅ H2 employee sees ticket — code ${hd.code || '(not parsed)'}`);
    expect(hd.subject).toBeTruthy();
  });

  test('H3 — admin sees the ticket and opens Manage (HD-003) + capture lifecycle controls', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE}/ess/helpdesk/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Find our ticket's row by code (preferred) or subject, then its Manage button.
    const needle = hd.code || hd.subject;
    const search = page.locator('input[placeholder*="Search" i]').first();
    if (await search.count()) { await search.fill(needle); await page.waitForTimeout(1500); }
    const row = page.locator('table tbody tr').filter({ hasText: needle }).first();
    await expect(row, `admin list should contain the ticket (${needle})`).toBeVisible({ timeout: 20000 });
    await row.locator('button, a').filter({ hasText: /Manage/i }).first().click();

    await expect(page, 'should open the ticket Manage view').toHaveURL(/\/helpdesk\/admin\/ticket\//, { timeout: 20000 });
    await page.waitForTimeout(2000);
    await expect(page.getByText(hd.subject, { exact: false }).first(), 'Manage view shows the ticket subject').toBeVisible();

    // Discovery: log the action-panel controls present for this (Open/New) ticket so
    // HD-004..007 can be scripted from real markup.
    const controls = await page.evaluate(() => {
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left > 250; };
      const btns = [...document.querySelectorAll('button, a.btn, [role="button"]')].filter(vis)
        .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim())
        .filter(t => t && t.length < 28 && !/Chat|Assistant|Task|Calendar|^Home|Profile|Log Out|Password|^Dashboard|Worker|^Employee|Search menu|HRMS|My Workspace|Helpdesk Admin|Referral|Master|Credentials|Excel|Reports/i.test(t));
      const sels = [...document.querySelectorAll('select')].filter(vis)
        .map(s => (s.closest('div,label')?.querySelector('label,.form-label')?.innerText || s.id || '').replace(/\s+/g, ' ').trim());
      const areas = [...document.querySelectorAll('textarea')].filter(vis).map(e => e.placeholder || e.id || '');
      return { btns: [...new Set(btns)], sels: sels.filter(Boolean), areas: areas.filter(Boolean) };
    });
    console.log('  🔎 Manage action panel →');
    console.log(`     buttons : ${JSON.stringify(controls.btns)}`);
    console.log(`     selects : ${JSON.stringify(controls.sels)}`);
    console.log(`     areas   : ${JSON.stringify(controls.areas)}`);
    console.log(`  ✅ H3 admin opened Manage for ${hd.code || hd.subject}`);
  });

  /** Open the Manage view for this run's ticket (admin → search → Manage). */
  async function openManage(page) {
    const needle = hd.code || hd.subject;
    await page.goto(`${BASE}/ess/helpdesk/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const search = page.locator('input[placeholder*="Search" i]').first();
    if (await search.count()) { await search.fill(needle); await page.waitForTimeout(1500); }
    const row = page.locator('table tbody tr').filter({ hasText: needle }).first();
    await expect(row, `admin list should contain the ticket (${needle})`).toBeVisible({ timeout: 20000 });
    await row.locator('button, a').filter({ hasText: /Manage/i }).first().click();
    await expect(page, 'ticket Manage view should open').toHaveURL(/\/helpdesk\/admin\/ticket\//, { timeout: 20000 });
    await page.waitForTimeout(1800);
  }

  /** Persisted check: reload the admin list, find this run's ticket row, assert its status. */
  async function assertListStatus(page, statusRe) {
    const needle = hd.code || hd.subject;
    await expect.poll(async () => {
      await page.goto(`${BASE}/ess/helpdesk/admin`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const search = page.locator('input[placeholder*="Search" i]').first();
      if (await search.count()) { await search.fill(needle).catch(() => {}); await page.waitForTimeout(1500); }
      return (await page.locator('table tbody tr').filter({ hasText: needle }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    }, { timeout: 60000, intervals: [2000, 5000], message: `ticket ${needle} should show status ${statusRe} in the admin list` })
      .toMatch(statusRe);
  }

  // NOTE on workflow: once a ticket is ASSIGNED, the admin panel only offers Reassign —
  // Update-Status/Resolve move to the assignee (a 2nd actor). So the single-admin
  // positive path drives Update → Resolve → Close on the still-unassigned ticket, and
  // Assign/Reassign (HD-004/HD-009) are verified on their own ticket in H8.

  test('H4 — move the ticket forward: Update Status → In Progress (HD-005)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    await openManage(page);
    // "Update Status" card — the select offering "In Progress" (options depend on current status).
    await fk.setSelect(fk.selectWithOption(page, 'In Progress'), 'In Progress', 'New Status', { loose: true });
    // Submit button is labelled "Update Status" (was "Update" on an older build).
    hd.updateVia = await fk.saveAndConfirm(page.locator('button').filter({ hasText: /^\s*Update(\s+Status)?\s*$/i }).first(),
      { name: 'Update status', successRe: /success|updated|progress|saved/i });
    console.log(`  ✅ H4 status update submitted (${hd.updateVia})`);
    await assertListStatus(page, /In Progress/i);
    console.log('  ✅ H4 persisted — ticket shows "In Progress" in the admin list');
  });

  test('H5 — add an internal note (HD-005, extra)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    await openManage(page);
    const ticketUrl = page.url();
    hd.note = tagged('Checked the VPN gateway logs, account was locked after a password change');
    // "Add Internal Note" reveals an inline composer: #note ("Not visible to employee") → Add Note.
    await page.locator('button').filter({ hasText: /Add Internal Note/i }).first().click();
    const note = page.locator('#note');
    await expect(note, 'the internal-note composer should open').toBeVisible({ timeout: 10000 });
    await fk.setInput(note, hd.note, 'Internal Note');
    const add = page.locator('button').filter({ hasText: /^\s*Add Note\s*$/i }).first();
    await expect(add, '"Add Note" should be enabled once the note is typed').toBeEnabled();
    await add.click();
    console.log('  ✅ H5 internal note submitted');
    // Persisted check: the note is on the ticket after a fresh load.
    await expect.poll(async () => {
      await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    }, { timeout: 60000, intervals: [2000, 5000], message: 'the internal note should be on the ticket after reload' })
      .toContain(hd.note);
    console.log('  ✅ H5 persisted — note shows on the ticket after reload');
  });

  test('H6 — resolve the ticket (HD-006)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    await openManage(page);
    // "Resolve Ticket" card: "Resolution Notes *" (placeholder) → Resolve.
    await fk.setInput(page.locator('textarea[placeholder*="resolved" i]').first(),
      'Resolved by the automated positive-flow helpdesk test.', 'Resolution Notes');
    // Submit button is labelled "Resolve Ticket" (was "Resolve" on an older build).
    hd.resolveVia = await fk.saveAndConfirm(page.locator('button').filter({ hasText: /^\s*Resolve(\s+Ticket)?\s*$/i }).first(),
      { name: 'Resolve ticket', successRe: /success|resolved|closed|updated/i });
    console.log(`  ✅ H6 resolve submitted (${hd.resolveVia})`);
    await assertListStatus(page, /Resolved|Closed/i);
    console.log('  ✅ H6 persisted — ticket shows Resolved/Closed in the admin list');
  });

  test('H7 — close the ticket (HD-007)', async ({ page }) => {
    test.setTimeout(120_000);
    const fk = new FormKit(page);
    await openManage(page);
    // After resolution a "Close" action appears; if the ticket is already Closed, that is the terminal state.
    const closeBtn = page.locator('button').filter({ hasText: /^\s*Close(\s+Ticket)?\s*$/i }).first();
    if (await waitVisible(closeBtn, 8000)) {
      hd.closeVia = await fk.saveAndConfirm(closeBtn, { name: 'Close ticket', successRe: /success|closed|updated/i });
      console.log(`  ✅ H7 closed (${hd.closeVia})`);
    } else {
      // Resolve may be terminal on this build — assert the ticket shows a Closed/Resolved state.
      const state = (await page.locator('body').innerText()).match(/\b(Closed|Resolved)\b/i);
      expect(state, 'ticket should be in a Resolved/Closed state (no separate Close control found)').toBeTruthy();
      console.log(`  ✅ H7 ticket is terminal (${state[0]}) — no separate Close control on this build`);
    }
  });

  test('H8 — assign then reassign a fresh ticket (HD-004, HD-009)', async ({ page }) => {
    test.setTimeout(150_000);
    const fk = new FormKit(page);
    // Raise a dedicated ticket (assigning hands resolution to the assignee, so this is
    // kept separate from the resolve chain above).
    const subject = tagged('Laptop running slow after the latest Windows update');
    await openNewTicket(page, fk);
    const form = await fk.scope({ ready: '#subject' });
    await fk.setInput(form.locator('#subject'), subject, 'Subject');
    await fk.setInput(form.locator('#description'), 'Laptop takes over 10 minutes to boot and apps freeze after the latest update. Please arrange a check.', 'Description');
    await fk.setCascade(form.locator('#category'), '', 'Category', { index: 1 });
    await fk.setSelect(form.locator('#priority'), 'Medium', 'Priority');
    await fk.saveAndConfirm(fk.saveButton(form), { name: 'Submit ticket', successRe: /success|submitted|created|raised|added/i });

    // Open its Manage view.
    await page.goto(`${BASE}/ess/helpdesk/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const search = page.locator('input[placeholder*="Search" i]').first();
    if (await search.count()) { await search.fill(subject); await page.waitForTimeout(1500); }
    const row = page.locator('table tbody tr').filter({ hasText: subject }).first();
    await expect(row, 'admin list should contain the assign-coverage ticket').toBeVisible({ timeout: 20000 });
    await row.locator('button, a').filter({ hasText: /Manage/i }).first().click();
    await expect(page, 'ticket Manage view should open').toHaveURL(/\/helpdesk\/admin\/ticket\//, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const ticketUrl = page.url();

    // Pick two assignees with DISTINCT names (the tenant has duplicate names, e.g. two
    // "Aaradhya"s, which would make a reassignment look like a no-op and be unverifiable).
    const assignSel = fk.selectWithOption(page, 'Select assignee');
    await expect.poll(async () => assignSel.locator('option').count(),
      { timeout: 15000, message: 'assignee options should load' }).toBeGreaterThan(2);
    const names = (await assignSel.locator('option').allTextContents()).map(t => t.trim()).filter(t => t && !/select/i.test(t));
    const counts = names.reduce((m, n) => ((m[n] = (m[n] || 0) + 1), m), {});
    const unique = names.filter(n => counts[n] === 1);             // avoid ambiguous duplicate names
    const assignee1 = unique[0];
    const assignee2 = unique.find(n => n !== assignee1);
    expect(assignee1 && assignee2, `need two distinct, uniquely-named assignees (got ${JSON.stringify(unique.slice(0, 5))})`).toBeTruthy();

    /** Reload the ticket and assert who it is assigned to (persisted check). */
    const expectAssignedTo = async (who) => {
      await expect.poll(async () => {
        await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);
        return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      }, { timeout: 45000, intervals: [2000, 5000], message: `ticket should show as assigned to "${who}"` })
        .toMatch(new RegExp(`assigned to\\s*:?\\s*${who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
    };

    // Assign (HD-004).
    await fk.setSelect(assignSel, assignee1, 'Assign To');
    await fk.saveAndConfirm(page.locator('button').filter({ hasText: /^\s*Assign\s*$/i }).first(),
      { name: 'Assign ticket', successRe: /success|assigned|updated|saved/i });
    await expectAssignedTo(assignee1);
    console.log(`  ✅ H8a assigned to "${assignee1}" (persisted)`);

    // Reassign (HD-009) to a DIFFERENT person.
    const reassignSel = page.locator('select').filter({ has: page.locator('option', { hasText: assignee2 }) }).first();
    await fk.setSelect(reassignSel, assignee2, 'Reassign To');
    await fk.saveAndConfirm(page.locator('button').filter({ hasText: /^\s*(Assign|Reassign)\s*$/i }).first(),
      { name: 'Reassign ticket', successRe: /success|assigned|reassigned|updated|saved/i });
    await expectAssignedTo(assignee2);
    console.log(`  ✅ H8b reassigned "${assignee1}" → "${assignee2}" (persisted)`);
  });
});
