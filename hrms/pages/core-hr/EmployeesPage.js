'use strict';

const { test, expect } = require('@playwright/test');
const { BasePage } = require('../BasePage');

/**
 * /employees — Employee master register (Core HR) + the /employee create form.
 *
 * Register grid: Sl.No | Employee Code | Employee Name | Department Name | Designation | Status | Actions.
 * "New Employee" routes to /employee — a tabbed form (Basic Details · Documents ·
 * Emergency · History · Lifecycle · Probation · Background Verification) with a
 * single Save. The Documents/Emergency sub-forms only populate for a SAVED
 * employee, so they are not reachable from the create flow.
 *
 * Read-only helpers (openCreateModal / closeCreateForm / …) never save.
 * createEmployee() is the ONE destructive helper: it fills every mandatory field
 * with valid, unique data and clicks Save once, returning the created employee so
 * later steps of a full-module run can act on it.
 */
class EmployeesPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, 'employees');

    // ── Register actions/filters (crawled) ─────────────────────────────────
    this.filterBtn          = this.button('Filter');
    // "New Employee" is an <a> link that is slow/flaky to become actionable on this
    // Blazor build — page-scoped so it matches regardless of button-vs-link markup.
    this.newEmployeeBtn     = page.locator('a, button, [role="button"]').filter({ hasText: /^\s*New Employee\s*$/i }).first();
    this.includeArchivedChk = page.locator('#incl-archived');   // stable crawled id
    this.searchInput        = page.locator('input[placeholder*="Name, code" i]').first(); // "Name, code, phone or email"

    // ── Create-form field locators (route: /employee) — ids observed on the live build ──
    this.employeeCodeInput = page.locator('#employee-code');    // auto-generated → disabled
    this.honorificInput    = page.locator('#honorific');        // combobox-style <input>
    this.firstNameInput    = page.locator('#firstname');
    this.lastNameInput     = page.locator('#lastname');
    this.displayNameInput  = page.locator('#emp-display-name');
    this.dobInput          = page.locator('#dob');              // <input type="date">
    this.emailInput        = page.locator('#emp-email');        // "Email Address*" (was #custodianname — stale)
    this.phoneInput        = page.locator('#emp-phone');
    this.whatsappInput     = page.locator('#emp-whatsapp');
    this.presentPincode    = page.locator('#present-pincode');
    this.joiningDateInput  = page.locator('#joining-date');
    this.usernameInput     = page.locator('#emp-username');     // "Login Username*"
    this.sameAsContactChk  = page.locator('#IsSameContact');    // "Whatsapp No* : Same as Phone"
    this.canLoginChk       = page.locator('#emp-can-login-checkbox');
    this.allBranchesChk    = page.locator('#emp-branch-checkbox-all');

    // Selects with stable ids.
    this.userLevelSelect   = page.locator('#emp-level-dropdown');       // Administrator / Manager / Team Lead / Team Member
    this.reportsToSelect   = page.locator('#emp-reportperson-dropdown'); // appears after Role Group + User Level are chosen
    this.branchSelect      = page.locator('#emp-branch');               // Main Branch / Kannur
    this.statusSelect      = page.locator('#emp-status');               // Active / Pre-Employee

    // Edit-form extras (present on /employee/<id>, NOT on the create form).
    this.departmentDropdown = page.locator('#emp-department-dropdown'); // Department (only fillable after the employee exists)
    this.nationalitySelect  = page.locator('#emp-nationality');         // Nationality

    // Legacy option-anchored selects (tenant-specific option text; kept for older specs).
    this.workTypeSelect    = page.locator('select').filter({ has: page.locator('option', { hasText: 'ClientSite' }) }).first();
    this.designationSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '.Net Developer' }) }).first();
    this.departmentSelect  = page.locator('select').filter({ has: page.locator('option', { hasText: 'DigitalMarkrting' }) }).first();

    // "Same as Contact" toggle label (bug HRMS-12 wants "Same as Phone Number").
    this.sameAsContactLabel = page.locator('label, span, div').filter({ hasText: /Same as (Contact|Phone)/i }).first();

    // Form buttons. NOTE: a generic "Save" match hits a hidden sub-form Save
    // (#cf-new-option-save) first — the real employee Save is the VISIBLE submit button.
    this.saveBtn         = page.locator('button, a.btn, [role="button"]').filter({ hasText: /^\s*Save\s*$/i }).first();  // legacy (never clicked)
    this.employeeSaveBtn = page.locator('button[type="submit"]').filter({ hasText: /^\s*Save\s*$/i }).filter({ visible: true }).first();
    this.goBackBtn       = page.locator('button, a.btn, [role="button"]').filter({ hasText: /^\s*Go Back\s*$/i }).first();
  }

  // ── Register helpers (kept for interactions.spec.js) ───────────────────────

  /** Open the create UI behind "New Employee". Returns true when a form revealed. */
  async openCreateModal() {
    const before = await this._visibleControlCount();
    await this.newEmployeeBtn.click();
    const modalShown = await this.modal.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    await this.waitReady();
    if (modalShown) return true;
    if (this._currentPath() !== this.route) return true;         // routed to a create page
    return (await this._visibleControlCount()) > before;         // inline form expanded
  }

  /** Dismiss the create UI WITHOUT saving (close/cancel button, else Escape). */
  async closeModal() {
    if (await this.modal.isVisible().catch(() => false)) {
      const dismiss = this.modal
        .locator('.btn-close, [aria-label="Close"], button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await dismiss.count()) await dismiss.click({ timeout: 5000 }).catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    } else if (this._currentPath() !== this.route) {
      await this.goto();   // "New Employee" routed away — return to the register
    }
    await this.page.waitForTimeout(300);
  }

  /** Toggle "Include archived" and let the grid re-render. */
  async toggleIncludeArchived() { await this.includeArchivedChk.click(); await this.waitReady(); }

  /** Toggle the filter panel via the "Filter" button (no query is applied). */
  async toggleFilterPanel() { await this.filterBtn.click(); await this.waitReady(); }

  /**
   * Search the register ("Name, code, phone or email") and return the matching
   * rows as arrays of cell text: [SlNo, Code, Name, Department, Designation, Status, ...].
   */
  async searchRegister(term, timeout = 15000) {
    await this._submitSearch(term);
    // The grid is empty/stale for a moment after Enter (empty-on-load quirk) — poll
    // until rows are present, then give it a short settle.
    const deadline = Date.now() + timeout;
    let rows = [];
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(700);
      rows = await this._registerRows();
      if (rows.length) break;
    }
    await this.page.waitForTimeout(500);
    return this._registerRows();
  }

  /**
   * Find one employee's register row: search by `term` (email/phone/code/name) and
   * POLL until a row whose cells contain `nameMatch` appears (the filtered grid
   * renders asynchronously). Returns the cells or null.
   */
  async findEmployeeRow(term, nameMatch, timeout = 15000) {
    await this._submitSearch(term);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(700);
      const rows = await this._registerRows();
      const hit = rows.find(cells => cells.some(c => c.includes(nameMatch)));
      if (hit) return hit;
    }
    return null;
  }

  /** Go to the register and submit a search term. */
  async _submitSearch(term) {
    await this.goto();
    await this.searchInput.waitFor({ state: 'visible', timeout: 30000 });
    await this.searchInput.fill(String(term));
    await this.page.keyboard.press('Enter');
  }

  /** Current register rows as arrays of cell text. */
  async _registerRows() {
    return this.page.locator('table tbody tr').evaluateAll(trs =>
      trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())));
  }

  /**
   * IDEMPOTENT get-or-create: return the canonical test employee if it already
   * exists in the register, otherwise create it ONCE. This guarantees the suite
   * only ever adds a SINGLE test user, no matter how many times it runs.
   */
  async getOrCreateEmployee(profile) {
    const row = await test.step(`Look up "${profile.display}" in the register (by email)`, async () => {
      return this.findEmployeeRow(profile.email, profile.first);
    });
    if (row) {
      // Found → the lookup above IS the register verification; no second search needed.
      const found = { ...profile, code: row[1] || '', row, existed: true };
      console.log(`  ♻️  Reusing existing employee — "${profile.display}" code=${found.code} (no new record created)`);
      return found;
    }
    console.log(`  ➕ "${profile.display}" not found — creating it (this happens only once)`);
    const created = await this.createEmployee(profile);
    // First-ever create: one confirm lookup so we verify it landed and read the app-assigned code.
    const newRow = await test.step(`Confirm "${profile.display}" now appears in the register`, async () => {
      const r = await this.findEmployeeRow(profile.email, profile.first);
      expect(r, `a register row should contain "${profile.first}"`).toBeTruthy();
      return r;
    });
    return { ...created, code: newRow[1] || created.code, row: newRow, existed: false };
  }

  // ── Create-form helpers ────────────────────────────────────────────────────

  /**
   * Navigate to the register and open the New Employee create form. Waits for the
   * form to render (Blazor renders it lazily after routing to /employee).
   * @returns {Promise<boolean>} true once the create form (#firstname) is visible
   */
  async openCreateForm() {
    await this.goto();
    await this.newEmployeeBtn.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.newEmployeeBtn.click({ timeout: 15000 }).catch(() => {});
      if (await this.firstNameInput.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)) break;
      await this.newEmployeeBtn.evaluate(el => el.click()).catch(() => {});   // fallback: dispatch a real DOM click
      if (await this.firstNameInput.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) break;
    }
    await this.waitReady();
    return this.firstNameInput.isVisible().catch(() => false);
  }

  /** Leave the create form WITHOUT saving (Go Back, else navigate to the register). */
  async closeCreateForm() {
    if (await this.goBackBtn.isVisible().catch(() => false)) {
      await this.goBackBtn.click().catch(() => {});
    } else {
      await this.goto().catch(() => {});
    }
    await this.page.waitForTimeout(300);
  }

  /** Type a value into a field and blur it so the form runs its validation. */
  async fillAndBlur(locator, value) {
    await locator.click().catch(() => {});
    await locator.fill('').catch(() => {});
    await locator.fill(String(value)).catch(() => {});
    await locator.evaluate(el => el.blur()).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /** Clear a field and blur it (for mandatory-blank checks). */
  async clearAndBlur(locator) {
    await locator.click().catch(() => {});
    await locator.fill('').catch(() => {});
    await locator.evaluate(el => el.blur()).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /** Ensure the WhatsApp field is editable (Same-as-Contact OFF). */
  async ensureWhatsappEditable() {
    if (await this.sameAsContactChk.isChecked().catch(() => false)) {
      await this.sameAsContactChk.uncheck()
        .catch(async () => { await this.sameAsContactChk.click({ force: true }).catch(() => {}); });
      await this.page.waitForTimeout(300);
    }
  }

  /** Ensure Same-as-Contact is ON (WhatsApp should mirror Phone). */
  async enableSameAsContact() {
    if (!(await this.sameAsContactChk.isChecked().catch(() => false))) {
      await this.sameAsContactChk.check()
        .catch(async () => { await this.sameAsContactChk.click({ force: true }).catch(() => {}); });
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Does this field currently carry a validation error? Checks the control and up
   * to 4 ancestors for a Bootstrap-style invalid signal (is-invalid / error class)
   * or a visible feedback message (.invalid-feedback / .text-danger …).
   * NOTE: ancestors are shared across fields on this form, so a neighbouring
   * still-empty required field can yield a false positive — use for single-field
   * negative checks, not inside a full create flow.
   */
  async hasValidationError(locator) {
    return locator.evaluate(el => {
      const bad = n => n && /(^|\s)(is-invalid|invalid|has-error|error)(\s|$)/i.test(n.className || '');
      const vis = n => { const s = getComputedStyle(n); return s.display !== 'none' && s.visibility !== 'hidden'; };
      if (bad(el)) return true;
      let n = el.parentElement, hop = 0;
      while (n && hop < 4) {
        if (bad(n)) return true;
        const msg = n.querySelector('.invalid-feedback, .text-danger, .field-validation-error, .validation-message, [class*="invalid" i], [class*="error" i]');
        if (msg && vis(msg) && (msg.innerText || '').trim()) return true;
        n = n.parentElement; hop++;
      }
      return false;
    }).catch(() => false);
  }

  /** Concatenated text of every currently-visible validation message on the page. */
  async visibleErrorText() {
    const els = this.page.locator('.invalid-feedback, .text-danger, .field-validation-error, .validation-message, [class*="invalid" i], [class*="error" i]');
    const n = await els.count().catch(() => 0);
    const out = [];
    for (let i = 0; i < Math.min(n, 40); i++) {
      if (await els.nth(i).isVisible().catch(() => false)) {
        const t = (await els.nth(i).innerText().catch(() => '')).trim();
        if (t) out.push(t);
      }
    }
    return out.join(' | ');
  }

  /** Click the Honorific control and report how many suggestion options appear. */
  async honorificOptionCount() {
    await this.honorificInput.click().catch(() => {});
    await this.page.waitForTimeout(700);
    return this.page.locator('[role="option"], .dropdown-item, .dropdown-menu li, ul.options li, datalist option')
      .count().catch(() => 0);
  }

  // ── Create flow (the ONE destructive helper) ───────────────────────────────

  /**
   * Build a valid, unique employee profile for one run. Names/display stay
   * letters-only (the form rejects digits); username/email/phone are unique
   * (phone must be unique; WhatsApp mirrors it). Override any field via `overrides`.
   */
  static newEmployeeData(overrides = {}) {
    const stamp   = Date.now().toString().slice(-6);
    const abc     = 'abcdefghijklmnopqrstuvwxyz';
    const letters = n => Array.from({ length: n }, () => abc[Math.floor(Math.random() * 26)]).join('');
    const tag     = letters(5);
    const first   = 'Meera' + tag[0].toUpperCase() + tag.slice(1);   // e.g. "MeeraQxvbz"
    const last    = 'Nair';
    const base    = {
      first, last,
      display:        `${first} ${last}`,
      username:       `${first.toLowerCase()}${stamp}`,
      email:          `${first.toLowerCase()}${stamp}@example.com`,
      phone:          '9' + String(Date.now()).slice(-9),
      dob:            '1995-06-15',
      gender:         'Female',
      marital:        'Single',
      roleGroup:      'Staff',
      userLevel:      'Team Member',
      reportsTo:      'Amit Kumar [progbiz0017]',
      designation:    'SOFTWARE TESTER',
      branch:         'Main Branch',
      workLocation:   'Office',
      employmentType: 'Full Time Employee',
      status:         'Active',
      joiningDate:    '2026-09-11',
      country:        'India',
      canLogin:       true,
      allBranches:    true,
    };
    return { ...base, ...overrides };
  }

  /**
   * Create ONE employee end-to-end (fills every mandatory field, clicks Save once)
   * and return the created profile — including the app's auto-generated Employee
   * Code — so later steps in a full-module run can use this employee.
   *
   * Every field/action is a named test.step with assertions inside, so the report
   * shows exactly which step worked or failed.
   * NOTE: the create form has NO Department field on this build (a real gap), so
   * department cannot be set here.
   */
  async createEmployee(overrides = {}) {
    const d = EmployeesPage.newEmployeeData(overrides);
    const page = this.page;

    await test.step('Open the New Employee create form', async () => {
      const ready = await this.openCreateForm();
      expect(ready, 'the New Employee create form should open (#firstname visible)').toBeTruthy();
      await expect(page, 'should be on the /employee create route').toHaveURL(/\/employee(\b|$)/);
    });

    await test.step('Employee Code is auto-generated (read-only)', async () => {
      await expect(this.employeeCodeInput, 'Employee Code should be visible').toBeVisible();
      await expect(this.employeeCodeInput, 'Employee Code is auto-generated (disabled)').toBeDisabled();
    });

    // Identity / role
    await this._selectByAnchor('Staff',  d.roleGroup, 'Role Group');
    await this._selectById(this.userLevelSelect, d.userLevel, 'User Level');
    let pickedReportsTo = d.reportsTo;   // the manager actually selected (tenant labels drift, e.g. "Amit Kumar [progbiz0017]" → "Amit Kumar Shaji")
    await test.step(`Select "Reports To" ≈ ${d.reportsTo}`, async () => {
      await expect(this.reportsToSelect, '"Reports To" should appear for a Staff / Team Member').toBeVisible({ timeout: 10000 });
      // The manager list loads asynchronously after Role Group + User Level — poll until it is populated.
      await expect.poll(async () => this.reportsToSelect.locator('option').count(),
        { timeout: 15000, message: '"Reports To" options should load after choosing Role Group + User Level' }).toBeGreaterThan(1);
      // Prefer the exact requested label; else fall back to the bare name (suffix/display can differ on the tenant).
      const wantName = d.reportsTo.split(' [')[0];
      const opts  = (await this.reportsToSelect.locator('option').allTextContents()).map(t => t.trim());
      const label = opts.find(o => o === d.reportsTo) || await this._optionMatching(this.reportsToSelect, wantName);
      expect(label, `a "Reports To" option matching "${wantName}" should exist`).toBeTruthy();
      await this.reportsToSelect.selectOption({ label });
      pickedReportsTo = await this._picked(this.reportsToSelect);   // record what was really chosen
      expect(pickedReportsTo, '"Reports To" should now be set').toMatch(new RegExp(wantName, 'i'));
    });
    await this._selectByAnchor('Business Analyst', d.designation, 'Designation');
    await this._selectById(this.branchSelect, d.branch, 'Branch');

    // Personal
    await this._fill(this.firstNameInput,   d.first,   'First Name');
    await this._fill(this.lastNameInput,    d.last,    'Last Name');
    await this._fill(this.displayNameInput, d.display, 'Display Name');     // letters only
    await this._fill(this.dobInput,         d.dob,     'Date of Birth');
    await this._selectByAnchor('Male',    d.gender,  'Gender');
    await this._selectByAnchor('Married', d.marital, 'Marital Status');

    // Contact
    await this._fill(this.phoneInput, d.phone, 'Phone');
    await test.step('WhatsApp mirrors Phone ("Same as Phone" ON)', async () => {
      await this.enableSameAsContact();
      await expect(this.sameAsContactChk, '"Same as Phone" should be ON').toBeChecked();
    });
    await this._fill(this.emailInput, d.email, 'Email');

    // Employment
    await this._selectByAnchor('Remote',     d.workLocation,   'Work Location');
    await this._selectByAnchor('Consultant', d.employmentType, 'Employment Type');
    await this._selectById(this.statusSelect, d.status, 'Employee Status');
    await this._fill(this.joiningDateInput, d.joiningDate, 'Joining Date');

    // Address
    await this._pickPresentAddress(d.country);
    await test.step('Permanent address = Same as Present', async () => {
      const chk = page.locator('label, span, div').filter({ hasText: /Same as Present/i })
        .locator('xpath=.//input[@type="checkbox"] | ./preceding::input[@type="checkbox"][1]').first();
      await chk.check().catch(async () => { await page.getByText(/Same as Present/i).first().click().catch(() => {}); });
      await page.waitForTimeout(300);
    });

    // Login & access
    await this._fill(this.usernameInput, d.username, 'Login Username');
    if (d.canLogin)    await this._ensureChecked(this.canLoginChk,    'Can Login');
    if (d.allBranches) await this._ensureChecked(this.allBranchesChk, 'All Branches access');

    // Read the auto-generated code (may only be assigned on save — the register step re-reads it)
    const codeBefore = (await this.employeeCodeInput.inputValue().catch(() => '') || '').trim();

    await test.step('Save the employee', async () => {
      await expect(this.employeeSaveBtn, 'the employee-form Save button should be visible').toBeVisible();
      await this.employeeSaveBtn.scrollIntoViewIfNeeded().catch(() => {});
      await this.employeeSaveBtn.click();
    });

    const how = await test.step('Confirm the employee was created', async () => {
      const ok = await Promise.race([
        page.waitForURL(/\/employees(\b|$)/, { timeout: 30000 }).then(() => 'redirected').catch(() => null),
        page.getByText(/success|added|created|saved/i).first().waitFor({ state: 'visible', timeout: 30000 }).then(() => 'toast').catch(() => null),
      ]);
      if (!ok) {
        const errs = await this.visibleErrorText();
        throw new Error(`Save did not confirm success. Visible validation/errors: ${errs || '(none captured)'}`);
      }
      expect(ok, 'employee create should confirm (redirect to register or success toast)').toBeTruthy();
      return ok;
    });

    const created = { ...d, reportsTo: pickedReportsTo, code: codeBefore, confirmedVia: how };
    console.log(`  ✅ Employee created (${how}) — "${d.display}", user=${d.username}, phone=${d.phone}${codeBefore ? `, code=${codeBefore}` : ''}`);
    return created;
  }

  /**
   * Open the EDIT form for an already-saved employee. `profileHref` is the
   * "/employee-view/<guid>" link from the register/Worker Directory; the edit
   * route is the same guid under "/employee/<guid>".
   */
  async openEditForm(profileHref) {
    const editPath = profileHref.replace('/employee-view/', '/employee/');   // keeps its leading "/"
    await this.page.goto(`${this.baseUrl}${editPath}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.firstNameInput.waitFor({ state: 'visible', timeout: 30000 });
    await this.waitReady();
    return editPath;
  }

  /**
   * Fill the profile fields that the CREATE form can't set — Department, Blood
   * Group, Nationality, Honorific and the Present address (lines + pincode) —
   * on the employee Edit form, then Save once and confirm. Values come from the
   * profile object (see data/testEmployee.js). Nothing sensitive (no bank/ID).
   *
   * @param {object} profile  the run employee, must carry `profileHref`
   */
  async completeProfile(profile) {
    const page = this.page;
    expect(profile.profileHref, 'completeProfile needs the employee profile link').toBeTruthy();

    await test.step('Open the employee Edit form', async () => {
      const editPath = await this.openEditForm(profile.profileHref);
      expect(editPath, 'should navigate to the /employee/<id> edit route').toMatch(/\/employee\/[0-9a-f-]{36}$/i);
      await expect(this.firstNameInput, 'the Edit form should render (#firstname visible)').toBeVisible();
      await expect(this.firstNameInput, 'the Edit form should be pre-filled with the first name').toHaveValue(profile.first);
    });

    if (profile.department) {
      await test.step(`Set Department ≈ "${profile.department}"`, async () => {
        await expect(this.departmentDropdown, 'the Department dropdown should be present on the Edit form').toBeVisible();
        const label = await this._optionMatching(this.departmentDropdown, profile.department);
        expect(label, `a Department option matching "${profile.department}" should exist`).toBeTruthy();
        await this.departmentDropdown.selectOption({ label });
        expect(await this._picked(this.departmentDropdown), 'Department should be set').toMatch(new RegExp(profile.department, 'i'));
      });
    }
    if (profile.honorific)   await this._selectById(this.honorificInput,    profile.honorific,   'Honorific');
    if (profile.nationality) await this._selectById(this.nationalitySelect, profile.nationality, 'Nationality');
    if (profile.bloodGroup)  await this._selectByAnchor('A+', profile.bloodGroup, 'Blood Group');

    if (profile.addressLine1 || profile.addressLine2 || profile.presentPincode) {
      await test.step('Fill the Present address (lines + pincode)', async () => {
        if (profile.presentPincode) await this.fillAndBlur(this.presentPincode, profile.presentPincode);
        // The two present address-line inputs render right after #present-pincode.
        const line1 = this.presentPincode.locator('xpath=following::input[@type="text"][1]');
        const line2 = this.presentPincode.locator('xpath=following::input[@type="text"][2]');
        if (profile.addressLine1) await this.fillAndBlur(line1, profile.addressLine1);
        if (profile.addressLine2) await this.fillAndBlur(line2, profile.addressLine2);
        if (profile.presentPincode) await expect(this.presentPincode, 'Pincode should hold the value entered').toHaveValue(String(profile.presentPincode));
      });
    }

    await test.step('Save the completed profile', async () => {
      await expect(this.employeeSaveBtn, 'the Edit-form Save button should be visible').toBeVisible();
      await this.employeeSaveBtn.scrollIntoViewIfNeeded().catch(() => {});
      await this.employeeSaveBtn.click();
    });

    const how = await test.step('Confirm the profile update was saved', async () => {
      const ok = await Promise.race([
        page.waitForURL(/\/employee(s|-view)\b/, { timeout: 30000 }).then(() => 'redirected').catch(() => null),
        page.getByText(/success|updated|saved|added/i).first().waitFor({ state: 'visible', timeout: 30000 }).then(() => 'toast').catch(() => null),
      ]);
      if (!ok) {
        const errs = await this.visibleErrorText();
        throw new Error(`Profile save did not confirm. Visible validation/errors: ${errs || '(none captured)'}`);
      }
      return ok;
    });
    console.log(`  ✅ Profile completed (${how}) — dept≈${profile.department}, blood=${profile.bloodGroup}, nationality=${profile.nationality}`);
    return { ...profile, profileCompletedVia: how };
  }

  /** The exact option label of `sel` whose text matches `term` (case-insensitive substring), or ''. */
  async _optionMatching(sel, term) {
    const labels = await sel.locator('option').allTextContents();
    const re = new RegExp(term, 'i');
    const hit = labels.map(t => t.trim()).find(t => re.test(t) && !/^choose$/i.test(t));
    return hit || '';
  }

  // ── private helpers ────────────────────────────────────────────────────────

  /** Fill as a named step and assert the value stuck. */
  async _fill(locator, value, name) {
    await test.step(`Fill "${name}" = "${value}"`, async () => {
      await expect(locator, `"${name}" should be visible`).toBeVisible();
      await expect(locator, `"${name}" should be editable`).toBeEditable();
      await this.fillAndBlur(locator, value);
      await expect(locator, `"${name}" should hold "${value}"`).toHaveValue(String(value));
    });
  }

  /** Select on the <select> identified by an always-present `anchor` option (dup #selectbox ids). */
  async _selectByAnchor(anchor, label, name) {
    await test.step(`Select "${name}" = "${label}"`, async () => {
      const sel = this.page.locator('select').filter({ has: this.page.locator('option', { hasText: anchor }) }).first();
      await expect(sel, `the "${name}" <select> (offering "${anchor}") should be visible`).toBeVisible();
      await sel.selectOption({ label });
      await this.page.waitForTimeout(150);
      expect(await this._picked(sel), `"${name}" should now show "${label}"`).toContain(label);
    });
  }

  /** Select on an id-located <select> and assert the choice. */
  async _selectById(sel, label, name) {
    await test.step(`Select "${name}" = "${label}"`, async () => {
      await expect(sel, `the "${name}" select should be visible`).toBeVisible();
      await sel.selectOption({ label });
      await this.page.waitForTimeout(150);
      expect(await this._picked(sel), `"${name}" should now show "${label}"`).toContain(label);
    });
  }

  /** Tick a checkbox (if not already) and assert it. */
  async _ensureChecked(chk, name) {
    await test.step(`Enable "${name}"`, async () => {
      await chk.scrollIntoViewIfNeeded().catch(() => {});
      if (!(await chk.isChecked().catch(() => false))) {
        await chk.check().catch(async () => { await chk.click({ force: true }).catch(() => {}); });
      }
      await expect(chk, `"${name}" should be enabled`).toBeChecked();
    });
  }

  /** Present address: Country (exact) → State → City, each loading async. */
  async _pickPresentAddress(country) {
    await test.step(`Present address: ${country} → State → City cascade`, async () => {
      const anchor  = this.joiningDateInput;
      const cSel = anchor.locator('xpath=following::select[1]');
      const sSel = anchor.locator('xpath=following::select[2]');
      const tSel = anchor.locator('xpath=following::select[3]');

      await expect(cSel, 'Present Country select should be visible').toBeVisible();
      await cSel.selectOption({ label: country });                       // exact — fuzzy /India/ hit "British Indian Ocean Territory"
      expect(await this._picked(cSel), `Present Country should be "${country}"`).toBe(country);

      await expect.poll(async () => sSel.locator('option').count(),
        { timeout: 10000, message: 'Present State should populate after choosing Country' }).toBeGreaterThan(1);
      await sSel.selectOption({ index: 1 });
      expect(await this._picked(sSel), 'Present State should not be "Choose"').not.toMatch(/^choose$/i);

      await expect.poll(async () => tSel.locator('option').count(),
        { timeout: 10000, message: 'Present City should populate after choosing State' }).toBeGreaterThan(1);
      await tSel.selectOption({ index: 1 });
      expect(await this._picked(tSel), 'Present City should not be "Choose"').not.toMatch(/^choose$/i);
    });
  }

  /** Text of the currently selected option. */
  async _picked(sel) {
    return (await sel.locator('option:checked').textContent().catch(() => '') || '').trim();
  }

  _currentPath() { return new URL(this.page.url()).pathname.replace(/^\//, '').replace(/\/$/, ''); }
  _visibleControlCount() { return this.page.locator('input:visible, select:visible, textarea:visible').count(); }
}

module.exports = { EmployeesPage };
