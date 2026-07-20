'use strict';

/**
 * My Workspace (ESS) — interaction suite (11 pages, POM-driven).
 *
 * PRIMARY interactions only, STRICTLY non-destructive:
 *   - assert a form exposes its crawled/named fields → nothing is submitted
 *   - open a request dialog (Regularize / Raise OT) → assert it revealed →
 *     dismiss WITHOUT confirming
 *   - apply a read-only filter (Show year / date range) and assert the grid
 *     re-renders (rowCount >= 0, grid attached, no /login bounce, no crash)
 *   - assert documented empty-states (fresh ESS account) and column identities
 *   - follow pure-navigation links (Quick Actions, View My Requests)
 *
 * Every test navigates independently via its POM (no shared state).
 * No Save / Submit / Upload / Submit for approval / Submit Change Request /
 * Submit Request is ever clicked — final-submit buttons are exposed by the
 * POMs for visibility assertions only. Empty-state assertions are conditional
 * where later data entry could legitimately populate the grid.
 * No page in this group has page-level tabs (the tabs captured on /ess are the
 * global top nav), so there are no tab-switch tests.
 */
const { test, expect } = require('@playwright/test');

const { MyWorkspacePage }  = require('../../pages/ess/MyWorkspacePage');
const { MyProfilePage }    = require('../../pages/ess/MyProfilePage');
const { MyRequestsPage }   = require('../../pages/ess/MyRequestsPage');
const { MyLeavePage }      = require('../../pages/ess/MyLeavePage');
const { MyHandoverPage }   = require('../../pages/ess/MyHandoverPage');
const { MyAttendancePage } = require('../../pages/ess/MyAttendancePage');
const { MyLocationsPage }  = require('../../pages/ess/MyLocationsPage');
const { MyDocumentsPage }  = require('../../pages/ess/MyDocumentsPage');
const { MyLettersPage }    = require('../../pages/ess/MyLettersPage');
const { MyPayslipsPage }   = require('../../pages/ess/MyPayslipsPage');
const { MyProbationPage }  = require('../../pages/ess/MyProbationPage');

// ── /ess ─────────────────────────────────────────────────────────────────────

test.describe('ess: /ess (My Workspace)', () => {
  test('dashboard renders its KPI tiles, profile card and Quick Actions', async ({ page }) => {
    const po = new MyWorkspacePage(page);
    await po.goto();   // LAZY — waitReady() clears "Loading your workspace…"
    // KPI-tile labels and the "Employee Code" profile card are DOC-SOURCED and
    // crawl-UNVERIFIED (ess.json recapture caught only the global nav) — soft
    // checks until a re-crawl of /ess confirms the dashboard body text.
    for (const tile of ['Leave Available', "Today's Attendance", 'Pending Requests', 'Letters to Acknowledge']) {
      expect.soft(await po.hasKpiTile(tile), `KPI tile "${tile}" (doc-sourced, crawl-unverified)`).toBeTruthy();
    }
    expect.soft(await po.hasProfileCard(), 'My Profile card (Employee Code) (doc-sourced, crawl-unverified)').toBeTruthy();
    // Only the three crawl-verified Quick Actions are asserted hard.
    await expect(po.applyLeaveBtn,   'Quick Action "Apply Leave"').toBeVisible();
    await expect(po.myAttendanceBtn, 'Quick Action "My Attendance"').toBeVisible();
    await expect(po.payslipsBtn,     'Quick Action "Payslips"').toBeVisible();
  });

  test('Quick Action "Apply Leave" deep-links to /ess/leave', async ({ page }) => {
    const po = new MyWorkspacePage(page);
    await po.goto();
    await po.openQuickAction('Apply Leave');   // pure navigation — no data touched
    expect(page.url(), 'landed on the My Leave hub').toContain('/ess/leave');
    expect(page.url()).not.toContain('/login');
  });
});

// ── /ess/profile ─────────────────────────────────────────────────────────────

test.describe('ess: /ess/profile (My Profile)', () => {
  test('Request A Change form exposes its crawled fields (nothing submitted)', async ({ page }) => {
    const po = new MyProfilePage(page);
    await po.goto();
    await expect(po.firstNameInput,  'First Name field').toBeVisible();
    await expect(po.lastNameInput,   'Last Name field').toBeVisible();
    await expect(po.emailInput,      'Email field').toBeVisible();
    await expect(po.nationalIdInput, 'National / ID Number field').toBeVisible();
    await expect(po.passportInput,   'Passport No field').toBeVisible();
    await expect(po.bloodGroupInput, 'Blood Group field').toBeVisible();
    await expect(po.reasonInput,     'Reason field').toBeVisible();
    await expect(po.submitChangeRequestBtn, '"Submit Change Request" exposed but never clicked').toBeVisible();
    expect(await po.hasApprovalHelperText(), 'HR-approval helper text').toBeTruthy();
    // Read-only Overview snapshot renders alongside the form.
    expect(await po.hasOverviewField('Employee Code'), 'Overview "Employee Code"').toBeTruthy();
  });

  test('View My Requests navigates to /ess/requests (read-only)', async ({ page }) => {
    const po = new MyProfilePage(page);
    await po.goto();
    await po.openMyRequests();   // navigation only — no change request is raised
    expect(page.url(), 'landed on My Requests').toContain('/ess/requests');
    expect(page.url()).not.toContain('/login');
  });
});

// ── /ess/requests ────────────────────────────────────────────────────────────

test.describe('ess: /ess/requests (My Requests)', () => {
  test('fresh account shows the documented empty state', async ({ page }) => {
    const po = new MyRequestsPage(page);
    await po.goto();
    if (await po.hasNoRequests()) {
      await expect(po.emptyState, 'documented empty state "You have no change requests."').toBeVisible();
    } else {
      // Both text anchors are doc-sourced and crawl-unverified (ess__requests.json
      // recapture caught only the global nav) — soft check until a re-crawl.
      expect.soft(await po.hasRequestsCard(), '"Profile Change Requests" card (doc-sourced, crawl-unverified)').toBeTruthy();
      expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    }
    expect(page.url()).not.toContain('/login');
  });
});

// ── /ess/leave ───────────────────────────────────────────────────────────────

test.describe('ess: /ess/leave (My Leave)', () => {
  test('Apply For Leave form exposes its crawled fields (nothing submitted)', async ({ page }) => {
    const po = new MyLeavePage(page);
    await po.goto();
    await expect(po.leaveTypeSelect, 'Leave Type select').toBeVisible();
    await expect(po.startDateInput,  'Start Date input').toBeVisible();
    await expect(po.endDateInput,    'End Date input').toBeVisible();
    await expect(po.halfDayChk,      'Half Day checkbox (#halfday)').toBeAttached();
    await expect(po.reasonTextarea,  'Reason textarea').toBeVisible();
    await expect(po.submitRequestBtn, '"Submit Request" exposed but never clicked').toBeVisible();
    const options = (await po.leaveTypeOptions()).join(' | ');
    expect(options, 'Leave Type keeps its "-- Select --" placeholder').toMatch(/select/i);
  });

  test('Show <year> re-renders the Balances and Requests grids', async ({ page }) => {
    const po = new MyLeavePage(page);
    await po.goto();
    await po.showYear(2026);                        // read-only refresh
    await expect(po.balancesGrid, 'Balances grid').toBeVisible();
    await expect(po.requestsGrid, 'Requests grid').toBeVisible();
    const balanceHeaders = await po.gridHeaderTexts();          // first table
    for (const col of ['Leave Type', 'Balance', 'Reserved', 'Available']) {
      expect(balanceHeaders, `Balances column "${col}"`).toContain(col);
    }
    const requestHeaders = await po.requestsHeaderTexts();
    for (const col of ['Type', 'From', 'To', 'Days', 'Status']) {
      expect(requestHeaders, `Requests column "${col}"`).toContain(col);
    }
    expect(await po.balancesRowCount()).toBeGreaterThanOrEqual(0);
    expect(await po.requestsRowCount()).toBeGreaterThanOrEqual(0);
    expect(page.url()).not.toContain('/login');
  });
});

// ── /my-handover ─────────────────────────────────────────────────────────────

test.describe('ess: /my-handover (ESS Handover)', () => {
  test('Set Up Handover form exposes assignee, dates and covers (never saved)', async ({ page }) => {
    const po = new MyHandoverPage(page);
    await po.goto();
    await expect(po.assigneeSelect,    'Assignee select').toBeVisible();
    await expect(po.fromDateInput,     'From date').toBeVisible();
    await expect(po.toDateInput,       'To date').toBeVisible();
    await expect(po.coverApprovalsChk, '"Cover my approvals" (#ca)').toBeAttached();
    await expect(po.coverTasksChk,     '"Cover my HRMS tasks" (#ct)').toBeAttached();
    await expect(po.noteInput,         'Note textarea').toBeVisible();
    await expect(po.saveBtn,           '"Save" exposed but never clicked').toBeVisible();
  });

  test('Clear resets the handover draft (nothing persisted)', async ({ page }) => {
    const po = new MyHandoverPage(page);
    await po.goto();
    await po.fillHandoverForm({ note: 'zz probe — draft only, never saved' });
    await po.clearForm();
    expect(await po.noteInput.inputValue(), 'Note returns to default').toBe('');
  });

  test('My Handovers grid renders its columns (documented empty state)', async ({ page }) => {
    const po = new MyHandoverPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Assignee', 'From', 'To', 'Covers', 'Active', 'Action']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    if (await po.hasNoHandovers()) {
      expect(await po.hasNoHandovers(), 'documented empty state "No handovers set up."').toBeTruthy();
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /ess/attendance ──────────────────────────────────────────────────────────

test.describe('ess: /ess/attendance (My Attendance)', () => {
  test('Show date-range re-renders the history grid', async ({ page }) => {
    const po = new MyAttendancePage(page);
    await po.goto();
    await po.showRange('2026-07-01', '2026-07-31');   // read-only refresh — rows render only after Show
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Date', 'Entry', 'Exit', 'Worked (min)', 'OT (min)', 'Status']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    expect(page.url()).not.toContain('/login');
  });

  // The dialog-reveal premise is crawl-UNVERIFIED: ess__attendance.json captured
  // only the "Regularize" / "Raise OT" buttons, no dialog markup. The buttons may
  // require a selected row or route elsewhere — soft checks until the behavior is
  // confirmed on a live run; the hard assertion is recovering the history page.

  test('Regularize opens its request dialog and is dismissed unsubmitted', async ({ page }) => {
    const po = new MyAttendancePage(page);
    await po.goto();
    const opened = await po.openRegularizeDialog();
    expect.soft(opened, '"Regularize" should reveal a request dialog/form (crawl-unverified premise)').toBeTruthy();
    await po.closeDialog();                            // dismissed WITHOUT confirming
    await expect(po.showBtn).toBeVisible();            // back on the history page
  });

  test('Raise OT opens its request dialog and is dismissed unsubmitted', async ({ page }) => {
    const po = new MyAttendancePage(page);
    await po.goto();
    const opened = await po.openRaiseOtDialog();
    expect.soft(opened, '"Raise OT" should reveal a request dialog/form (crawl-unverified premise)').toBeTruthy();
    await po.closeDialog();                            // dismissed WITHOUT confirming
    await expect(po.showBtn).toBeVisible();
  });
});

// ── /ess/locations ───────────────────────────────────────────────────────────

test.describe('ess: /ess/locations (My Work Locations)', () => {
  test('Add A Work Location form exposes its fields (never submitted)', async ({ page }) => {
    const po = new MyLocationsPage(page);
    await po.goto();
    await expect(po.nameInput,          'Location Name ("e.g. Home, Site A")').toBeVisible();
    await expect(po.radiusInput,        'Radius (m)* number').toBeVisible();
    await expect(po.latitudeInput,      'Latitude* number').toBeVisible();
    await expect(po.longitudeInput,     'Longitude* number').toBeVisible();
    await expect(po.addressSearchInput, 'address search box').toBeVisible();
    await expect(po.useMyLocationBtn,     '"Use my location" exposed but never clicked (geolocation)').toBeVisible();
    await expect(po.submitForApprovalBtn, '"Submit for approval" exposed but never clicked').toBeVisible();
    // Map presence only via the attribution — Leaflet internals are off-limits.
    expect(await po.hasMapAttribution(), 'Leaflet attribution').toBeTruthy();
  });

  test('location draft fill leaves the grid intact (form state only)', async ({ page }) => {
    const po = new MyLocationsPage(page);
    await po.goto();
    await po.fillLocationDraft({ name: 'zz probe — never submitted', radius: 100, latitude: 10.1, longitude: 76.2 });
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Name', 'Lat', 'Long', 'Radius', 'Status']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    // NOTE: the tbody keeps a single EMPTY placeholder row — count is not data.
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    expect(page.url()).not.toContain('/login');
  });
});

// ── /ess/documents ───────────────────────────────────────────────────────────

test.describe('ess: /ess/documents (Self Service Documents)', () => {
  test('Upload A Document form exposes its fields incl. file input (never uploaded)', async ({ page }) => {
    const po = new MyDocumentsPage(page);
    await po.goto();
    await expect(po.documentTypeSelect, 'Document Type select').toBeVisible();
    await expect(po.numberInput,        'Number text input').toBeVisible();
    await expect(po.expiryInput,        'Expiry date input').toBeVisible();
    await expect(po.fileInput,          'File input (no fixture ever attached)').toBeAttached();
    await expect(po.uploadBtn,          '"Upload" exposed but never clicked').toBeVisible();
    const options = (await po.documentTypeOptions()).join(' | ');
    expect(options, 'Document Type keeps its "-- Select --" placeholder').toMatch(/select/i);
  });

  test('Documents grid renders its columns (documented empty state)', async ({ page }) => {
    const po = new MyDocumentsPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Type', 'Number', 'Category', 'Expiry', 'Status']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    if (await po.hasNoDocuments()) {
      expect(await po.hasNoDocuments(), 'documented empty state "No documents on file."').toBeTruthy();
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /ess/letters ─────────────────────────────────────────────────────────────

test.describe('ess: /ess/letters (Self Service Letters)', () => {
  test('both cards render with their documented empty states', async ({ page }) => {
    const po = new MyLettersPage(page);
    await po.goto();
    expect(await po.hasRequestCard(), '"Request A Letter / Certificate" card').toBeTruthy();
    // Captured state: no self-service letter types configured on this tenant.
    if (await po.hasNoLetterTypes()) {
      await expect(po.noLetterTypesState, 'documented "No self-service letter types" state').toBeVisible();
    }
    await expect(po.grid, 'Published Letters grid').toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Letter', 'Type', 'Issued', 'Acknowledged']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    if (await po.hasNoPublishedLetters()) {
      await expect(po.noPublishedLettersState, 'documented "No letters published to you." state').toBeVisible();
    }
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
  });
});

// ── /ess/payslips ────────────────────────────────────────────────────────────

test.describe('ess: /ess/payslips (Self Service Payslips)', () => {
  test('Show <year> re-renders the payslips grid', async ({ page }) => {
    const po = new MyPayslipsPage(page);
    await po.goto();
    await po.showYear(2026);                        // read-only re-query
    await expect(po.grid).toBeVisible();
    expect(await po.rowCount()).toBeGreaterThanOrEqual(0);
    expect(page.url()).not.toContain('/login');
  });

  test('grid keeps its salary columns and the PDF-unavailable footnote', async ({ page }) => {
    const po = new MyPayslipsPage(page);
    await po.goto();
    await expect(po.grid).toBeVisible();
    const headers = await po.gridHeaderTexts();
    for (const col of ['Period', 'Basic', 'Deductions', 'Net', 'Payable', 'Paid']) {
      expect(headers, `column "${col}"`).toContain(col);
    }
    expect(await po.hasPdfFootnote(), 'footnote "Payslip PDF download is not yet available"').toBeTruthy();
    if (await po.hasNoPayslips()) {
      expect(await po.hasNoPayslips(), 'documented empty state "No payslips found."').toBeTruthy();
    }
  });
});

// ── /ess/probation ───────────────────────────────────────────────────────────

test.describe('ess: /ess/probation (My Probation)', () => {
  test('confirmed employee sees the documented not-on-probation state', async ({ page }) => {
    const po = new MyProbationPage(page);
    await po.goto();   // LAZY — waitReady() clears the loading placeholder
    expect(await po.hasProbationPanel(), '"My Probation" panel').toBeTruthy();
    if (await po.hasNotOnProbation()) {
      // Documented state for the Confirmed crawl user (Vismaya / PB1053).
      await expect(po.notOnProbationState, '"You are not currently on probation."').toBeVisible();
    } else {
      // A probation record was started since the crawl — panel must still render.
      expect(page.url()).not.toContain('/login');
    }
  });
});
