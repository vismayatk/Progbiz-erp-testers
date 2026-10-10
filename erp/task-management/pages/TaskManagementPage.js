'use strict';

const { tenant } = require('../../common/tenantData');

/**
 * Task Management module.
 *
 * Two entry points to the Add-Task form:
 *   1) Modal  — Home → "Create New" (#new-task) → "Task" (#new-task-item)
 *               opens the #home-create-task-modal ("Add Task"). This is the
 *               documented production flow (TC_TASK_001..002).
 *   2) Route  — /task renders the same fields standalone (legacy helper).
 *
 *  Add-Task modal fields:
 *    Branch* (select, default "Kannur") · #taskType* (Choose/Call/Online Meeting/
 *    Offline Meeting/Activities/Project Task/Project Maintenance/Complaint) ·
 *    #priority (Normal/Medium/High) · #taskName · #description ·
 *    #partySearch (+ .ri-search-line search, .ri-add-fill add) ·
 *    Participants (.ri-user-add-line) · Hosts (.add-host-btn) · #saveBtn / #clearBtn.
 *  Modes (buttons): #instantBtn (default) · #laterBtn (adds Hosts + deadline
 *    toggles #instantDeadlineToggle/#addEndTimeToggle → date/time pickers) ·
 *    #repeatBtn (Start/End Time + From/To Date).
 *
 *  Listing pages: My Tasks (/my-tasks), Created Tasks (/created-tasks),
 *    Delegated Tasks (/delegated-tasks), To Do List (/todo-list),
 *    Unscheduled Tasks (/unscheduled-tasks), Calendar (/calendar),
 *    Daily Activity Report (/daily-activity-report), Task Timeline.
 *  Row actions (Action column, no ids since the Sep-2026 build): a red delete
 *    button (i.ri-delete-bin-5-fill) FIRST on deletable tasks, then the
 *    send-plane (i.ri-send-plane-2-line) that opens #task-overview-modal — or,
 *    for Enquiry/Quotation Followup and Complaint task types, navigates to the
 *    source record. The old #edit-task-{id} / #delete-task-{id} /
 *    #overview-task-{id} ids are gone. See _openRowOverview().
 *  Dashboard lifecycle controls: .ri-play-fill (start/resume),
 *    .ri-pause-fill (hold), .ri-stop-fill (end).
 */
class TaskManagementPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://test.erp.progbiz.in';

    // ── Add-Task modal ──
    // NOTE: /home holds BOTH #home-create-task-modal (create) and #task-edit-modal
    // (edit), which share field ids (#taskName, #taskType, …). All modal-field
    // locators MUST be scoped to the create modal to avoid strict-mode clashes.
    // The "Create New" toggle is #new-task on some renders and #new-lead-type on others
    // (DEV /home) — match either. Its menu item #new-task-item is consistent.
    this.createNewBtn = page.locator('#new-task, #new-lead-type').first();
    this.newTaskItem  = page.locator('#new-task-item');
    // The create-task modal is #home-create-task-modal on some renders and
    // #crm-home-create-task-modal on others (DEV /home). Match either (only one
    // exists per page, so child-locator scoping stays unambiguous).
    this.modal        = page.locator('#home-create-task-modal, #crm-home-create-task-modal');
    this.tabInstant   = this.modal.locator('#instantBtn');
    this.tabLater     = this.modal.locator('#laterBtn');
    this.tabRepeat    = this.modal.locator('#repeatBtn');

    // modal-scoped fields
    this.branchSelect   = this.modal.locator('select').filter({ has: page.locator('option', { hasText: tenant().branch }) }).first();
    this.taskTypeSelect = this.modal.locator('#taskType');
    this.prioritySelect = this.modal.locator('#priority');
    this.taskInput      = this.modal.locator('#taskName');
    this.descInput      = this.modal.locator('#description');
    this.partyInput     = this.modal.locator('#partySearch');
    this.saveBtn        = this.modal.locator('#saveBtn');
    this.clearBtn       = this.modal.locator('#clearBtn');
    this.deadlineToggle = this.modal.locator('#instantDeadlineToggle');
    this.endTimeToggle  = this.modal.locator('#addEndTimeToggle');

    // route-level fields (/task standalone page — single instance there)
    this.rBranch   = page.locator('select').filter({ has: page.locator('option', { hasText: tenant().branch }) }).first();
    this.rTaskType = page.locator('#taskType').first();
    this.rPriority = page.locator('#priority').first();
    this.rTaskName = page.locator('#taskName').first();
    this.rDesc     = page.locator('#description').first();
    this.rSave     = page.locator('#saveBtn').first();
    this.instantBtn = page.locator('#instantBtn').first();
    this.laterBtn   = page.locator('#laterBtn').first();
    this.repeatBtn  = page.locator('#repeatBtn').first();

    // My Tasks list
    this.search = page.locator('#task-search');
    this.rows   = page.locator('table tbody tr');
  }

  // ── navigation ──
  async goto(path) {
    await this.page.goto(`${this.baseUrl}/${path}`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 18000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    console.log(`  📋 ${path} → ${this.page.url()}`);
  }
  gotoHome()          { return this.goto('home'); }
  gotoMyTasks()       { return this.goto('my-tasks'); }
  gotoCreated()       { return this.goto('created-tasks'); }
  gotoDelegated()     { return this.goto('delegated-tasks'); }
  gotoTodo()          { return this.goto('todo-list'); }
  gotoUnscheduled()   { return this.goto('unscheduled-tasks'); }
  gotoCalendar()      { return this.goto('calendar'); }
  gotoDailyActivity() { return this.goto('daily-activity-report'); }
  gotoTimeline()      { return this.goto('redirect/task-timeline'); }

  // ════════════════════════ Add-Task MODAL ════════════════════════

  /**
   * Open the "Create New" dropdown and return its option labels (TC_TASK_001).
   *
   * Reads the menu that holds #new-task-item rather than a fixed id list:
   * since the Sep-2026 build only **Task** still carries an id — Enquiry and
   * Quotation lost `#new-enquiry-item` / `#new-quotation-item` (they are still
   * in the menu, still labelled the same). The old id-triplet reader returned
   * just ["Task"] and failed TM-09 on a menu that was in fact intact.
   */
  async getCreateNewOptions() {
    if (!/\/home/.test(this.page.url())) await this.gotoHome();
    const item = this.newTaskItem;
    for (let i = 0; i < 6 && !(await item.isVisible().catch(() => false)); i++) {
      await this.createNewBtn.click().catch(() => {});
      await this.page.waitForTimeout(600);
    }
    return this.page.evaluate(() => {
      const anchor = document.getElementById('new-task-item');
      const menu = anchor && anchor.closest('.dropdown-menu');
      if (!menu) return [];
      return [...menu.querySelectorAll('a')]
        .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    });
  }

  /** A "Create New" menu entry by label ("Task" | "Enquiry" | "Quotation").
   *  Task keeps its id; the others are matched by label inside the same menu —
   *  scoped with `:has(#new-task-item)` because the sidebar carries its own
   *  hidden `.dropdown-item` links with these very labels. */
  createNewItem(label) {
    if (/^task$/i.test(label)) return this.newTaskItem;
    return this.page.locator('.dropdown-menu:has(#new-task-item) a')
      .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first();
  }

  /** Robustly open the Add-Task modal (TC_TASK_002). The Create-New dropdown is a
   *  toggle, so clicking it while open closes it — retry open→click→verify-modal. */
  async openTaskModal() {
    if (!/\/home/.test(this.page.url())) await this.gotoHome();
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!(await this.newTaskItem.isVisible().catch(() => false))) {
        await this.createNewBtn.click().catch(() => {});
        await this.page.waitForTimeout(700);
      }
      await this.newTaskItem.click({ timeout: 5000 }).catch(() => {});
      const ok = await this.taskInput.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
      if (ok) { await this.page.waitForTimeout(500); return; }
    }
    // last shot — surface a clear timeout if the modal never rendered
    await this.taskInput.waitFor({ state: 'visible', timeout: 12000 });
    await this.page.waitForTimeout(500);
  }

  /** Switch modal mode: 'instant' | 'later' | 'repeat'. Clicking the visible label is reliable. */
  async selectMode(mode = 'instant') {
    const label = mode === 'later' ? 'Task for Later' : mode === 'repeat' ? 'Repeat' : 'Instant';
    await this.modal.getByText(new RegExp(`^\\s*${label}\\s*$`, 'i')).first().click().catch(() => {});
    await this.page.waitForTimeout(1000);
  }

  /** Label of the currently-active mode tab (TC_TASK_003). */
  async activeMode() {
    return this.page.evaluate(() => {
      const root = document.querySelector('#home-create-task-modal, #crm-home-create-task-modal') || document;
      const tabs = [...root.querySelectorAll('#instantBtn,#laterBtn,#repeatBtn')];
      if (!tabs.length) return null;
      let best = tabs.find(t => /\bactive\b|selected/.test(t.className) || t.getAttribute('aria-selected') === 'true');
      if (!best) {
        best = tabs.map(t => {
          const m = (getComputedStyle(t).backgroundColor.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number);
          const alpha = m[3] !== undefined ? m[3] : 1;
          return { t, score: alpha * (m[2] + 1) };   // most-saturated/opaque (blue) = active
        }).sort((a, b) => b.score - a.score)[0].t;
      }
      return (best.textContent || '').replace(/\s+/g, ' ').trim();
    });
  }

  getBranchOptions()   { return this.branchSelect.locator('option').allTextContents(); }
  getTaskTypeOptions() { return this.taskTypeSelect.locator('option').allTextContents(); }
  getPriorityOptions() { return this.prioritySelect.locator('option').allTextContents(); }

  /** Presence of party / participant / host controls in the modal (TC_TASK_013..016, 030). */
  async modalControls() {
    return this.page.evaluate(() => {
      const m = document.querySelector('#home-create-task-modal, #crm-home-create-task-modal') || document;
      const has = (sel) => !!m.querySelector(sel);
      const txt = (m.textContent || '');
      return {
        party:          has('#partySearch'),
        partySearchBtn: has('.ri-search-line'),
        partyAddBtn:    has('.ri-add-fill'),
        participantAdd: has('.ri-user-add-line'),
        hostAdd:        has('.add-host-btn'),
        hostsLabel:     /Hosts/i.test(txt),
        deadlineToggle: has('#instantDeadlineToggle'),
        endTimeToggle:  has('#addEndTimeToggle'),
      };
    });
  }

  /**
   * Create a task through the production modal. Returns validation message or null on success.
   * @param {string|null} name
   * @param {object} opts {type='Call', priority, mode='instant', description, party, skipType=false, schedule=true}
   */
  /** The DEV build requires a Party on the task modal (save rejects with
   *  "Please choose party"). If #partySearch is present, search broadly and
   *  pick the first party from the picker modal that opens over the task modal. */
  async choosePartyIfRequired(term = 'Test Customer') {
    // Prefer a customer this suite created ("Test Customer …") so test tasks are not
    // attached to a real client; fall back to any party only if none exists.
    const party = this.page.locator('#partySearch:visible').first();
    if (!(await party.count().catch(() => 0))) return false;
    const picked = await this._pickParty(party, term);
    if (!picked && term !== 'a') {
      console.log(`  ⚠️  no party matching "${term}" — falling back to any party`);
      await this._pickParty(party, 'a');
    }
    console.log('  👥 Party selected (this build requires one)');
    return true;
  }

  async _pickParty(party, term) {
    await party.fill(term).catch(() => {});
    await party.locator('xpath=ancestor::div[contains(@class,"input-group")][1]')
      .locator('i.ri-search-line').first().click().catch(() => {});
    const picker = this.page.locator('.modal.show:not(#home-create-task-modal):not(#crm-home-create-task-modal)').last();
    await picker.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const row = picker.locator('table tbody tr, li').first();
    await row.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    if (!(await row.count().catch(() => 0)) || !(await row.isVisible().catch(() => false))) {
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }
    await row.click().catch(() => {});
    // generous settle: the pick triggers a form re-render that can wipe later fills
    await this.page.waitForTimeout(2200);
    return true;
  }

  /** After a party is picked, the DEV build defaults the assignee to the party's
   *  lead owner — the task then lands in THEIR My Tasks, not the creator's.
   *  Ensure the logged-in user is toggled ON in the Hosts multiselect. */
  async ensureSelfHost() {
    const self = process.env.SELF_NAME || (await this.page.evaluate(() => {
      // the profile dropdown li is the header-element whose text contains "Profile"
      for (const el of document.querySelectorAll('li.header-element')) {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && /profile/i.test(t)) return t.replace(/Profile.*$/i, '').trim();
      }
      return '';
    }).catch(() => '')) || '';
    const btn = this.page.locator('.add-host-btn').first();
    if (!self || !(await btn.count().catch(() => 0))) return false;
    await btn.click().catch(() => {});
    await this.page.waitForTimeout(900);
    const first = self.split(' ')[0];
    const search = this.page.locator('#hostMultiselect-search:visible').first();
    if (await search.count().catch(() => 0)) { await search.fill(first).catch(() => {}); await this.page.waitForTimeout(900); }
    const row = this.page.locator('li.list-group-item').filter({ hasText: new RegExp(first, 'i') }).first();
    const sw = row.locator('input').first();
    const wasChecked = await sw.isChecked().catch(() => false);
    if (!wasChecked) await sw.click({ force: true }).catch(() => {});
    // close the picker without touching other toggles
    await this.page.getByText(/^\s*Done\s*$/i).first().click().catch(async () => {
      await btn.click().catch(() => {});
    });
    await this.page.waitForTimeout(800);
    console.log(`  🙋 self ("${self}") ensured as host (was ${wasChecked ? 'already' : 'NOT'} selected)`);
    return true;
  }

  async createViaModal(name, opts = {}) {
    const { type = 'Call', priority, mode = 'instant', description, party, skipType = false, schedule = true } = opts;
    console.log(`  ➕ [modal] Task "${name}" (type=${skipType ? '(none)' : type}, mode=${mode})`);
    await this.openTaskModal();
    if (mode !== 'instant') await this.selectMode(mode);

    await this.branchSelect.evaluate(s => { if (s.selectedIndex < 0 || !s.value) s.selectedIndex = 0; }).catch(() => {});
    if (!skipType) {
      await this.taskTypeSelect.selectOption({ label: type }).catch(async () => {
        await this.taskTypeSelect.selectOption({ index: 1 }).catch(() => {});
      });
    }
    if (priority) await this.prioritySelect.selectOption({ label: priority }).catch(() => {});
    if (name !== null) await this.taskInput.fill(name);
    if (description) await this.descInput.fill(description).catch(() => {});

    // Party BEFORE the schedule fields — the picker re-renders the form and
    // blanks any already-filled dates (DEV build; party is mandatory there).
    if (party) {
      await this.partyInput.fill(party);
      await this.modal.locator('.ri-search-line').first().click().catch(() => {});
      await this.page.waitForTimeout(1800);
      await this.modal.locator('table tbody tr').first().click().catch(() => {});
      await this.page.waitForTimeout(800);
    } else {
      await this.choosePartyIfRequired();
    }
    await this.ensureSelfHost();   // party pick can reassign the task away from us

    if (mode === 'later' && schedule) {
      const tgl = this.deadlineToggle;
      if (await tgl.isVisible().catch(() => false)) { await tgl.click({ force: true }).catch(() => {}); await this.page.waitForTimeout(800); }
      const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      // the post-party re-render can blank the inputs mid-fill — verify the value stuck
      for (let i = 0; i < 3; i++) {
        await this.modal.locator('input[type="date"]:visible').first().fill(d).catch(() => {});
        await this.modal.locator('input[type="time"]:visible').first().fill('10:00').catch(() => {});
        const stuck = await this.modal.locator('input[type="date"]:visible').first().inputValue().catch(() => '');
        if (stuck) break;
        console.log('  ⏳ schedule fields blanked by re-render — refilling');
        await this.page.waitForTimeout(1200);
      }
    }

    await this.saveBtn.click();
    await this.page.waitForTimeout(2500);
    return this._afterSave();
  }

  /**
   * Select a user in a Host/Participant multiselect by display name.
   * Each section (HOSTS / PARTICIPANTS) opens an inline list: Search… box,
   * per-user toggles, and a blue "Done" button.
   * @param {string} triggerSel  '.add-host-btn' (Host) | '.ri-user-add-line' (Participant)
   * @param {string} name        display name (e.g. "HAFNEETHA")
   * @returns {boolean} whether a matching user toggle was found
   */
  async _pickUser(triggerSel, name) {
    const trig = this.modal.locator(triggerSel).first();
    if (await trig.isVisible().catch(() => false)) { await trig.click().catch(() => {}); await this.page.waitForTimeout(900); }

    const search = this.modal.locator('input[placeholder="Search..."]:visible').first();
    if (await search.isVisible().catch(() => false)) { await search.fill(name).catch(() => {}); await this.page.waitForTimeout(900); }

    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const row = this.modal.locator('.form-check, li, label').filter({ hasText: new RegExp(safe, 'i') }).first();
    const ok = await row.isVisible().catch(() => false);
    if (ok) {
      const tog = row.locator('input, [role="switch"]').first();
      if (await tog.count().catch(() => 0)) await tog.click({ force: true }).catch(() => {});
      else await row.click().catch(() => {});
      await this.page.waitForTimeout(400);
    }
    await this.modal.getByRole('button', { name: /^Done$/i }).first().click().catch(async () => {
      await this.modal.getByText(/^\s*Done\s*$/i).first().click().catch(() => {});
    });
    await this.page.waitForTimeout(500);
    return ok;
  }

  /** Assign a Host by display name (Task-for-Later / Repeat). */
  addHostByName(name)        { return this._pickUser('.add-host-btn', name); }
  /** Add a Participant by display name (any mode). */
  addParticipantByName(name) { return this._pickUser('.ri-user-add-line', name); }

  /**
   * Create a recurring (Repeat) task — a newer feature not in the doc.
   * Repeat mode exposes recurrence (Daily/Weekly/Monthly) + Start Time / End Time
   * + From Date / To Date. Returns validation message or null on success.
   * @param {string} name
   * @param {object} opts {type='Call', recurrence='Daily', priority}
   */
  async createRepeatTask(name, opts = {}) {
    const { type = 'Call', recurrence = 'Daily', priority } = opts;
    console.log(`  🔁 [modal] Repeat task "${name}" (type=${type}, every=${recurrence})`);
    await this.openTaskModal();
    await this.selectMode('repeat');

    await this.branchSelect.evaluate(s => { if (s.selectedIndex < 0 || !s.value) s.selectedIndex = 0; }).catch(() => {});
    await this.taskTypeSelect.selectOption({ label: type }).catch(async () => { await this.taskTypeSelect.selectOption({ index: 1 }).catch(() => {}); });
    if (priority) await this.prioritySelect.selectOption({ label: priority }).catch(() => {});
    await this.taskInput.fill(name);
    // Party BEFORE recurrence/schedule — the picker re-renders the form (DEV build)
    await this.choosePartyIfRequired();
    await this.ensureSelfHost();   // party pick can reassign the task away from us

    // pick the recurrence (Daily avoids weekday selection)
    await this.modal.getByText(new RegExp(`^\\s*${recurrence}\\s*$`, 'i')).first().click().catch(() => {});
    await this.page.waitForTimeout(600);

    // Start/End time (order: Start, End) and From/To date (order: From, To)
    const times = this.modal.locator('input[type="time"]:visible');
    await times.nth(0).fill('10:00').catch(() => {});
    await times.nth(1).fill('11:00').catch(() => {});
    const dates = this.modal.locator('input[type="date"]:visible');
    const from = new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10);
    const to   = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
    await dates.nth(0).fill(from).catch(() => {});
    await dates.nth(1).fill(to).catch(() => {});

    await this.saveBtn.click();
    await this.page.waitForTimeout(2500);
    return this._afterSave();
  }

  /** Add the first available participant via the toggle list (best-effort, TC_TASK_015..017). */
  async addFirstParticipant() {
    await this.modal.locator('.ri-user-add-line').first().click().catch(() => {});
    await this.page.waitForTimeout(1000);
    const sw = this.page.locator('.modal:visible .form-check-input, .modal:visible [role="switch"], .modal:visible .form-switch input').first();
    const ok = await sw.isVisible().catch(() => false);
    if (ok) {
      await sw.click({ force: true }).catch(() => {});
      await this.page.locator('.modal:visible').getByText(/^\s*Done\s*$/i).first().click().catch(() => {});
      await this.page.waitForTimeout(600);
    }
    return ok;
  }

  // ════════════════════════ /task ROUTE (legacy helper) ════════════════════════

  /** Open the Add Task form via the /task route and select a mode. */
  async openForm(mode = 'instant') {
    await this.page.goto(`${this.baseUrl}/task`, { waitUntil: 'domcontentloaded' });
    await this.rTaskName.waitFor({ state: 'visible', timeout: 20000 });
    const btn = mode === 'later' ? this.laterBtn : mode === 'repeat' ? this.repeatBtn : this.instantBtn;
    await btn.click().catch(() => {});
    await this.page.waitForTimeout(800);
  }

  /** Create a task via /task route. Returns validation message or null on success. */
  async createTask(name, opts = {}) {
    if (typeof opts === 'string') opts = { type: opts };
    const { type = 'Call', priority, mode = 'instant', skipType = false } = opts;
    console.log(`  ➕ New Task: "${name}" (type=${skipType ? '(none)' : type}, mode=${mode})`);
    await this.openForm(mode);

    await this.rBranch.evaluate(s => { if (s.selectedIndex < 0 || !s.value) s.selectedIndex = 0; }).catch(() => {});
    if (!skipType) {
      await this.rTaskType.selectOption({ label: type }).catch(async () => {
        await this.rTaskType.selectOption({ index: 1 }).catch(() => {});
      });
    }
    if (priority) await this.rPriority.selectOption({ label: priority }).catch(() => {});
    await this.rTaskName.fill(name);
    await this.rDesc.fill(`Auto task ${name}`).catch(() => {});

    // Party FIRST — the party picker re-renders the form and blanks any
    // already-filled schedule fields (DEV build; party is mandatory there).
    await this.choosePartyIfRequired();
    await this.ensureSelfHost();   // party pick can reassign the task away from us

    if (mode === 'later') {
      // The deadline toggle (#instantDeadlineToggle) transmits finishBefore — its
      // checkbox input is visually hidden (custom switch), so click via JS.
      await this.page.$eval('#instantDeadlineToggle', (el) => { if (!el.checked) el.click(); }).catch(() => {});
      await this.page.waitForTimeout(900);
      const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      // Fill + BLUR every visible date/time field (schedule + deadline); Blazor commits
      // bound values on change/blur, and the post-party re-render can blank them — verify.
      for (let i = 0; i < 3; i++) {
        const dIns = this.page.locator('input[type="date"]:visible');
        for (let k = 0; k < await dIns.count().catch(() => 0); k++) {
          await dIns.nth(k).fill(d).catch(() => {});
          await dIns.nth(k).blur().catch(() => {});
        }
        const tIns = this.page.locator('input[type="time"]:visible');
        for (let k = 0; k < await tIns.count().catch(() => 0); k++) {
          await tIns.nth(k).fill('10:00').catch(() => {});
          await tIns.nth(k).blur().catch(() => {});
        }
        await this.page.waitForTimeout(900);           // let the circuit round-trip
        const stuck = await dIns.first().inputValue().catch(() => '');
        if (stuck) break;
        console.log('  ⏳ schedule fields blanked by re-render — refilling');
        await this.page.waitForTimeout(1200);
      }
    }

    await this.rSave.click();
    await this.page.waitForTimeout(2500);
    return this._afterSave();
  }

  async _afterSave() {
    // Walk the swal chain (an Instant task may ask "Another task is in progress…").
    for (let i = 0; i < 3; i++) {
      const swal = this.page.locator('.swal2-popup');
      if (!(await swal.isVisible().catch(() => false))) break;
      const msg = (await this.page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
      await this.page.locator('.swal2-confirm').click().catch(() => {});
      await swal.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
      await this.page.waitForTimeout(1200);
      if (/do you want to continue|another task|are you sure|proceed|pause it/i.test(msg)) continue;
      if (/oops|something went wrong|error code/i.test(msg)) throw new Error(`Backend server error: "${msg}"`);
      if (/success|saved|added|done|created|started|scheduled/i.test(msg)) return null;
      return msg;   // swal validation message
    }
    // No swal — poll for an INLINE validation message. The "please …" branch
    // covers both "Please choose valid task type" and "Please add task" while
    // NOT matching the modal's "Add Task" title (a bare /add task/ would).
    const RE = /please (choose|select|enter|add|provide|specify)|is required|required|valid (task|branch)|choose valid|cannot be (empty|blank)/i;
    for (let i = 0; i < 4; i++) {
      const inline = await this.page.evaluate((src) => {
        const re = new RegExp(src, 'i');
        for (const e of document.querySelectorAll('*')) {
          if (e.children.length > 0) continue;                 // leaf nodes only
          if (e.getClientRects().length === 0) continue;       // visible only
          const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length < 80 && re.test(t)) return t;
        }
        return null;
      }, RE.source);
      if (inline) return inline;
      await this.page.waitForTimeout(800);
    }
    return null;   // success
  }

  // ════════════════════════ listing pages ════════════════════════

  /** My Tasks status-tab counts (Today/Delayed/Upcoming/Unscheduled/Completed). */
  async getTabCounts() {
    return this.page.evaluate(() => {
      const out = {};
      for (const b of document.querySelectorAll('button, a.btn')) {
        const m = (b.textContent || '').replace(/\s+/g, ' ').trim().match(/^(Today|Delayed|Upcoming|Unscheduled|Completed)\s+(\d+)$/i);
        if (m) out[m[1]] = Number(m[2]);
      }
      return out;
    });
  }

  /** Click a My Tasks status tab by label and return the row count after load. */
  /** The My Tasks status tabs are <li class="nav-item"> wrapping a <button class="nav-link">.
   *  Click the inner control so the list actually filters, then wait for the reload. */
  async clickTab(label) {
    const tab = this.page.locator('li.nav-item')
      .filter({ hasText: new RegExp(`^\\s*${label}\\s*\\d*\\s*$`, 'i') })
      .locator('button, a').first();
    await tab.click().catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    return this.rows.count();
  }

  /** Text of the first data row (used to prove a tab switch changed the rendered set). */
  async firstRowText() {
    return this.page.evaluate(() => {
      const r = document.querySelector('table tbody tr');
      return r ? (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    });
  }

  /** Visible table header labels on the current page. */
  async getColumns() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('table thead th, table thead td')]
        .map(th => (th.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean));
  }

  /**
   * Distinct row-action kinds present, as stable names: 'overview-task',
   * 'delete-task', 'edit-task'. Older builds exposed them as ids
   * (#overview-task-{id} …); the Sep-2026 build dropped the ids and renders
   * id-less icon buttons instead (send-plane = overview, bin = delete), so
   * read both and map the icons onto the same names — callers (TM-16, TM-18)
   * don't need to know which build they're on.
   */
  async rowActionKinds() {
    return this.page.evaluate(() => {
      const kinds = new Set();
      for (const e of document.querySelectorAll('[id^="edit-task-"],[id^="delete-task-"],[id^="overview-task-"]')) {
        kinds.add(e.id.replace(/-\d+$/, ''));
      }
      const ICONS = [
        ['overview-task', 'i.ri-send-plane-2-line'],
        ['delete-task', 'i[class*="ri-delete-bin"]'],
        ['edit-task', 'i.ri-pencil-line, i.ri-edit-line, i.ri-edit-2-line, i.bi-pencil-square'],
      ];
      for (const [kind, sel] of ICONS) {
        if (document.querySelector(`table tbody tr :is(a, button) ${sel}`)) kinds.add(kind);
      }
      return [...kinds];
    });
  }

  /**
   * Dashboard lifecycle controls (start/hold/end) + running-task count from timers.
   *
   * Counts BOTH the id-based controls the dashboard rendered in the Sep-2026
   * build (#start-task-btn-{id} / #resume-task-btn-{id} / #end-task-btn-{id})
   * and the icon classes older builds used (.ri-play-fill etc., plus the
   * Bootstrap-icon variants bi-play, bi-pause and bi-record), so the count
   * doesn't silently read zero just because the markup changed.
   *
   * `hasPanels` says whether the Running Tasks / On Hold panels are on the
   * page at all — these are data-driven, so on a tenant with nothing running
   * there is legitimately nothing to control and callers should skip rather
   * than fail.
   */
  async dashboardLifecycle() {
    await this.gotoHome();
    await this.page.waitForTimeout(2500);
    return this.page.evaluate(() => ({
      start:  document.querySelectorAll('.ri-play-fill, [class*="bi-play"], [id^="start-task-btn"], [id^="resume-task-btn"]').length,
      hold:   document.querySelectorAll('.ri-pause-fill, [class*="bi-pause"], [id^="hold-task-btn"]').length,
      end:    document.querySelectorAll('.ri-stop-fill, [class*="bi-record"], [class*="bi-stop"], [id^="end-task-btn"]').length,
      hasPanels: /running tasks|on hold/i.test(document.body.innerText),
      timers: (document.body.innerText.match(/\d\d:\d\d:\d\d/g) || []).length,
      sections: ["Today's Schedule", 'Running Tasks', 'On Hold']
        .filter(s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(document.body.innerText)),
    }));
  }

  /** Search My Tasks for a task name and report whether a row contains it. */
  async findTask(name) {
    await this.gotoMyTasks();
    await this.search.fill(name).catch(() => {});
    await this.search.press('Enter').catch(() => {});
    await this.page.waitForTimeout(2500);
    return this.page.evaluate((n) =>
      [...document.querySelectorAll('table tbody tr')]
        .some(r => (r.textContent || '').toLowerCase().includes(n.toLowerCase())),
      name);
  }

  // ════════════════════════ Task Details panel (#task-overview-modal) ════════════════════════
  // Opened from a My Tasks row via the ".ri-send-plane-2-line" action button. Holds:
  //   notes (#txtChat + .btn-send), document upload (.fe-paperclip → #file-input-document),
  //   lifecycle (Hold .btn-warning-light / End Task .btn-danger-light / Resume),
  //   and a ⋮ menu (.fe-more-vertical) → Edit Task / Reschedule Task / Add Lead.

  get detailsModal() { return this.page.locator('#task-overview-modal'); }

  /**
   * Open #task-overview-modal from ONE row, via its send-plane anchor ONLY.
   *
   * 2026-09-18 re-audit: the Action cell on deletable tasks is now
   *   <a class="btn-danger-light"><i class="ri-delete-bin-5-fill"></a>   ← delete, FIRST
   *   <a class="btn-primary-light"><i class="ri-send-plane-2-line"></a>  ← open overview
   * The openers below used to click "every control in the cell" until the modal
   * appeared — which now clicks delete first and raises "Are you sure you want to
   * delete?" / "delete all remaining tasks in this series?" on a real task, then
   * burns the test budget waiting behind that dialog (TM-24..26 timeouts).
   *
   * CRM/Complaint-linked task types (Enquiry Followup, Quotation Followup,
   * Complaint) route their send-plane to the source record
   * (/enquiry-overview, /quotation-view, /complaint-detail) instead of opening
   * the overview. If a click navigates, come back and report not-openable.
   */
  async _openRowOverview(row) {
    const opener = row.locator('td').first().locator('a:has(i.ri-send-plane-2-line)').first();
    if (!(await opener.count().catch(() => 0))) return false;
    const before = this.page.url();
    await opener.click({ timeout: 5000 }).catch(() => {});
    const ok = await this.detailsModal.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    if (ok) {
      await this.page.locator('#txtChat').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(800);
      return true;
    }
    if (this.page.url() !== before) {
      await this.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.page.waitForTimeout(2000);
    }
    return false;
  }

  /** Open the Task Details panel (#task-overview-modal) for the task named `name`.
   *  On the DEV build a party-attached task is delegated to the party owner, so it
   *  can live under My Tasks OR Delegated Tasks and under any status tab. Scan both
   *  pages across the likely tabs; open via the send-plane anchor only (see
   *  _openRowOverview — the same cell now holds a delete button). */
  async openTaskDetails(name) {
    const tryOpenHere = async () => {
      const row = this.page.locator('table tbody tr').filter({ hasText: name }).first();
      if (!(await row.isVisible().catch(() => false))) return false;
      return this._openRowOverview(row);
    };
    // Bounded sweep: check My Tasks default + the tabs a task realistically sits in
    // (Today/Upcoming — where a reschedule lands it), then Delegated default. Enough
    // for re-verification without paying a full 12-tab networkidle sweep every call.
    await this.gotoMyTasks();
    await this.page.waitForTimeout(2000);
    if (await tryOpenHere()) return true;
    for (const tab of ['Today', 'Upcoming', 'Unscheduled']) {
      await this.clickTab(tab);
      await this.page.waitForTimeout(900);
      if (await tryOpenHere()) return true;
    }
    await this.gotoDelegated();
    await this.page.waitForTimeout(2000);
    if (await tryOpenHere()) return true;
    return false;
  }

  /** Open the FIRST openable task in My Tasks (any populated status tab) and return
   *  its task name, or null. Used when a freshly-created task isn't reachable by its
   *  creator (DEV mandatory-party delegation) — the detail-panel operations under test
   *  are exercised against an existing task instead.
   *
   *  Only MACHINE-MADE tasks are eligible (a `QA_`/`TM` prefix, or a 13-digit ms
   *  timestamp in the name — "Repeat 1789652320867", "LaterTask 1789533179909").
   *  TM-25/26/28 rename, reschedule and start/hold/end whatever this opens; on a
   *  shared tenant that must never be a colleague's real task (docs/qa/QA_METHOD.md:
   *  never Save on a record you did not create). No eligible task → null → the
   *  caller skips, which is the honest outcome.
   *
   *  Bounded: at most MAX_ATTEMPTS send-plane clicks across all tabs, so a tenant
   *  full of non-openable rows ends in a clean skip, not a 200 s test timeout. */
  async openFirstOpenableTask(preferStatus) {
    const MAX_ATTEMPTS = 4;
    const LINKED = /enquiry followup|quotation followup|complaint/i;   // route to their source record
    const PLAIN = /^(call|online meeting|meeting|activities)$/i;       // try these first
    let attempts = 0;
    // Load My Tasks ONCE and switch tabs in place: a re-goto per tab costs a
    // page load for nothing. There is no #page_size control on this listing
    // (checked live 2026-09-21) — selecting it blocks for the full 30 s action
    // timeout per tab, which is what pushed TM-24 past its 200 s budget.
    await this.gotoMyTasks();
    await this.page.waitForTimeout(2500);
    // Tab labels carry their counts ("Delayed 3", "Today 0") — skip the empty
    // ones instead of paying a click + settle to discover they're empty. These
    // buckets are day-scoped, so most are legitimately empty on a quiet day.
    const counts = {};
    for (const label of await this.page.locator('li.nav-item').allInnerTexts().catch(() => [])) {
      const m = label.replace(/\s+/g, ' ').trim().match(/^(.*?)\s+(\d+)$/);
      if (m) counts[m[1].toLowerCase()] = Number(m[2]);
    }
    for (const tab of ['Today', 'Upcoming', 'Delayed', 'Unscheduled', 'Completed']) {
      if (attempts >= MAX_ATTEMPTS) break;
      if (counts[tab.toLowerCase()] === 0) continue;
      if (!/\/my-tasks/.test(this.page.url())) { await this.gotoMyTasks(); await this.page.waitForTimeout(2000); }
      await this.clickTab(tab);
      await this.page.waitForTimeout(1200);
      const candidates = await this.page.evaluate(({ preferStatus, linkedSrc, plainSrc }) => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const linked = new RegExp(linkedSrc, 'i'), plain = new RegExp(plainSrc, 'i');
        const t = [...document.querySelectorAll('table')].filter((x) => x.getClientRects().length)
          .sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
        if (!t) return [];
        const hs = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText));
        const ti = hs.findIndex((h) => /^task type$/i.test(h));
        const si = hs.findIndex((h) => /^status$/i.test(h));
        const ni = hs.findIndex((h) => /^task$/i.test(h));
        return [...t.querySelectorAll('tbody tr')].map((r, i) => {
          const c = [...r.querySelectorAll('td')].map((td) => clean(td.innerText));
          return { i, type: c[ti] || '', status: c[si] || '', name: c[ni] || '',
            hasOpener: !!r.querySelector('td a i.ri-send-plane-2-line') };
        }).filter((r) => r.hasOpener && !linked.test(r.type)
          && /(^(QA_|TM))|\d{13}/.test(r.name)                              // machine-made only
          && (!preferStatus || new RegExp(preferStatus, 'i').test(r.status)))
          .sort((a, b) => Number(plain.test(b.type)) - Number(plain.test(a.type)));
      }, { preferStatus: preferStatus || '', linkedSrc: LINKED.source, plainSrc: PLAIN.source });

      for (const cand of candidates) {
        if (attempts >= MAX_ATTEMPTS) break;
        attempts++;
        const opened = await this._openRowOverview(this.page.locator('table tbody tr').nth(cand.i));
        if (opened) return cand.name || 'existing task';
        if (!/\/my-tasks/.test(this.page.url())) break;   // navigated away and couldn't recover — reload this tab loop
      }
    }
    return null;
  }

  /** Add a note (TC_060-062). Returns true if the note text appears in the activity log. */
  async addNote(text) {
    await this.page.locator('#txtChat').fill(text);
    await this.detailsModal.locator('.btn-send').first().click().catch(() => {});
    await this.page.waitForTimeout(2500);
    const body = (await this.detailsModal.textContent().catch(() => '')) || '';
    return body.includes(text);
  }

  /** Upload a document (TC_063-064). Returns the save result (null on success). */
  async uploadDocument(filePath) {
    await this.detailsModal.locator('.fe-paperclip').first().click().catch(() => {});
    await this.page.waitForTimeout(700);
    await this.page.locator('#file-input-document').setInputFiles(filePath).catch(() => {});
    await this.page.waitForTimeout(3000);
    return this._afterSave();
  }

  /**
   * Open the Task Details ⋮ menu and click an item: 'Edit Task' | 'Reschedule Task' | 'Add Lead'.
   *
   * `expectSelector`, when given, is what the click should produce (e.g. the edit
   * modal's `#taskName`). Verified live 2026-09-21: the menu labels are exactly
   * right (confirmed by dumping every visible menu item), and the mechanism
   * itself is sound — "Add Lead" passed via this same code moments after "Edit
   * Task"/"Reschedule Task" failed against the SAME opened task in the SAME
   * run — so the one-shot click occasionally lands before the prior modal has
   * fully torn down. Retry the open→click once before giving up.
   */
  async detailsMenu(item, expectSelector) {
    const clickItem = async () => {
      await this.detailsModal.locator('.fe-more-vertical').first().click().catch(() => {});
      await this.page.waitForTimeout(900);
      await this.page.getByText(new RegExp(`^\\s*${item}\\s*$`, 'i')).first().click().catch(() => {});
      await this.page.waitForTimeout(2800);
    };
    await clickItem();
    if (expectSelector) {
      const ok = await this.page.locator(expectSelector).first().waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
      if (!ok) {
        console.log(`  ↻ "${item}" didn't produce ${expectSelector} — retrying once`);
        await clickItem();
      }
    }
  }

  get editModal() { return this.page.locator('#task-edit-modal'); }

  /** Edit an existing task's title via ⋮ → Edit Task (#task-edit-modal). Returns save result. */
  async editTaskTitle(newTitle) {
    await this.detailsMenu('Edit Task', '#task-edit-modal #taskName');
    await this.editModal.locator('#taskName').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await this.editModal.locator('#taskName').fill(newTitle);
    await this.editModal.locator('#taskName').blur().catch(() => {});
    // capture the title the edit form actually holds (proves the field accepted it)
    this._lastEditedTitle = await this.editModal.locator('#taskName').inputValue().catch(() => '');
    await this.editModal.locator('#saveBtn').first().click().catch(() => {});
    await this.page.waitForTimeout(2500);
    return this._afterSave();
  }

  /** Reschedule a task via ⋮ → Reschedule Task. Returns save result. */
  async reschedule(dateStr, timeStr = '10:30') {
    await this.detailsMenu('Reschedule Task', '.modal:visible input[type="date"]:visible, [role="dialog"]:visible input[type="date"]:visible');
    const dlg = this.page.locator('.modal:visible, [role="dialog"]:visible').last();
    await dlg.locator('input[type="date"]:visible').first().fill(dateStr).catch(() => {});
    await dlg.locator('input[type="date"]:visible').first().blur().catch(() => {});
    await dlg.locator('input[type="time"]:visible').first().fill(timeStr).catch(() => {});
    await dlg.locator('input[type="time"]:visible').first().blur().catch(() => {});
    // read the date the dialog actually holds back (proves the field accepted it)
    this._lastRescheduleDate = await dlg.locator('input[type="date"]:visible').first().inputValue().catch(() => '');
    await dlg.getByRole('button', { name: /save|reschedule|update|confirm|ok/i }).first().click().catch(() => {});
    await this.page.waitForTimeout(2500);
    return this._afterSave();
  }

  /** Add a Lead from a task via ⋮ → Add Lead. Returns {url, customerPrefilled}. */
  async addLeadFromTask() {
    await this.detailsMenu('Add Lead');
    await this.page.waitForTimeout(1500);
    const url = this.page.url();
    const customerPrefilled = await this.page.evaluate(() => {
      const c = document.querySelector('#TxtCustomer, #customer-phone, input[id*="customer" i]');
      return c ? (c.value || '').length > 0 : false;
    });
    return { url, customerPrefilled };
  }

  /** Hold/End/Resume each open a Bootstrap confirm modal ("Hold Task" / "End Task"
   *  with a pre-filled time + green "Confirm" button). Confirm it, then walk any swal. */
  /**
   * Confirm a Hold/End action. The confirm modal has a datetime field that must
   * sit strictly BETWEEN the task start time and now — a window that only exists
   * once the task has run ≥2 min. Parse the validation bounds and self-correct
   * (waiting the window open if the task is too fresh). Returns null on success.
   */
  async _confirmAction() {
    const fmt = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    const fill = async (d) => {
      const dt = this.page.locator('.modal:visible input[type="datetime-local"]').first();
      if (!(await dt.isVisible().catch(() => false))) return false;
      await dt.fill(fmt(d)).catch(() => {});
      await this.page.waitForTimeout(300);
      return true;
    };
    let target = new Date(Date.now() - 60000);   // start with now − 1 min
    for (let attempt = 0; attempt < 4; attempt++) {
      await fill(target);
      const confirm = this.page.getByRole('button', { name: /confirm/i }).first();   // "Confirm ▷"
      if (!(await confirm.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) break;
      await confirm.click().catch(() => {});
      await this.page.waitForTimeout(2000);
      const msg = await this._afterSave();
      if (!msg) return null;                       // success

      // NB: the message embeds a date ("27/06/2026") before the time, so match the
      // LAST HH:MM with a greedy .* (not \D*, which can't skip the date digits).
      const after = msg.match(/after task start time.*(\d{1,2}):(\d{2})/i);
      if (after) {                                 // too early → aim for start + 90s
        const start = new Date(); start.setHours(+after[1], +after[2], 0, 0);
        target = new Date(start.getTime() + 90000);
        if (target.getTime() >= Date.now()) {      // task too fresh → let it run, then use now − 1 min
          await this.page.waitForTimeout(Math.min(target.getTime() - Date.now() + 65000, 150000));
          target = new Date(Date.now() - 60000);
        }
        continue;
      }
      const before = msg.match(/before.*(\d{1,2}):(\d{2})/i);
      if (before) { const up = new Date(); up.setHours(+before[1], +before[2], 0, 0); target = new Date(up.getTime() - 90000); continue; }
      // End modal: "End time should be greater than start time" (no time given) → try now, then now − 2 min
      if (/greater than start|end time/i.test(msg)) { target = new Date(Date.now() - attempt * 60000); continue; }
      return msg;                                  // a different validation message
    }
    return null;
  }
  /** Lifecycle: hold a running task (→ confirm "Hold Task"). */
  async holdTask() {
    const btn = this.detailsModal.locator('.btn-warning-light').first();
    await btn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await btn.click().catch(() => {});
    await this.page.waitForTimeout(1200);
    return this._confirmAction();
  }
  /** Lifecycle: resume a held task (play/start control → confirm). */
  async resumeTask() {
    await this.detailsModal.locator('.btn-success-light, .btn-success, .btn-warning-light').filter({ hasText: /resume|start|play/i }).first().click()
      .catch(async () => { await this.detailsModal.locator('.ri-play-fill, .bi-play-circle-fill').first().click().catch(() => {}); });
    await this.page.waitForTimeout(1200);
    return this._confirmAction();
  }
  /** Lifecycle: end a running task (→ confirm "End Task"). */
  async endTask() {
    const btn = this.detailsModal.locator('.btn-danger-light').first();
    await btn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await btn.click().catch(() => {});
    await this.page.waitForTimeout(1200);
    return this._confirmAction();
  }

  /** Status badge for a task row in My Tasks (searched across tabs). null if not found. */
  async rowStatus(name) {
    await this.gotoMyTasks();
    for (const tab of ['default', 'Today', 'Delayed', 'Upcoming', 'Completed', 'Unscheduled']) {
      if (tab !== 'default') { await this.clickTab(tab); await this.page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {}); await this.page.waitForTimeout(600); }
      const st = await this.page.evaluate((n) => {
        const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent || '').includes(n));
        if (!r) return null;
        const m = (r.textContent || '').match(/\b(Running|Hold|Scheduled|Completed|Pending|Unscheduled|Not Started)\b/i);
        return m ? m[1] : 'row-found';
      }, name);
      if (st) return st;
    }
    return null;
  }
  /** Read the status badges currently shown in the Task Details participant row. */
  /**
   * Status badges inside the OPEN Task Details panel.
   *
   * Returns [] when the panel isn't actually visible. Confirming Hold/End
   * closes the panel, and the hidden modal keeps its last-rendered markup —
   * so reading it after a lifecycle action reported the OLD status ("Running"
   * after a successful hold), which is what made TM-28 fail against a hold
   * that had in fact worked (POST /api/app/v1/hold-task → 200). Verify a
   * lifecycle change with rowStatus() instead, or re-open the panel.
   */
  async detailsStatuses() {
    return this.page.evaluate(() => {
      const m = document.querySelector('#task-overview-modal');
      if (!m || !m.classList.contains('show') || !m.getClientRects().length) return [];
      return [...m.querySelectorAll('.badge, .bg-success, .bg-warning, span')].map(e => (e.textContent || '').trim()).filter(t => /running|hold|not started|completed|paused|ended/i.test(t)).slice(0, 6);
    });
  }

  /** Search My Tasks across every status tab; returns the tab label where found, else null.
   *  Each tab loads its table via AJAX, so scan with a networkidle wait + retries. */
  async findAcrossTabs(name) {
    await this.gotoMyTasks();
    const needle = name.toLowerCase();
    const scan = async () => {
      for (let i = 0; i < 4; i++) {
        const hit = await this.page.evaluate((x) =>
          [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent || '').toLowerCase().includes(x)), needle);
        if (hit) return true;
        await this.page.waitForTimeout(1000);
      }
      return false;
    };
    await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    if (await scan()) return 'default';
    for (const tab of ['Today', 'Upcoming', 'Unscheduled', 'Delayed', 'Completed']) {
      await this.clickTab(tab);
      await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      if (await scan()) return tab;
    }
    // Party-attached tasks live under DELEGATED Tasks for their creator on the
    // DEV build (My Tasks can be legitimately empty) — final fallback.
    if (await this.findInDelegated(name)) return 'Delegated';
    return null;
  }

  /** True when the current page is the SPA's dead-route screen. The DEV build removed
   *  some routes (/created-tasks, /unscheduled-tasks) — goto() resolves fine on them. */
  async isDeadRoute() {
    return this.page.evaluate(() =>
      /nothing at this address|page not found|404/i.test(document.body.innerText)).catch(() => false);
  }

  /** True if `name` appears specifically under the given My Tasks status tab.
   *  (findAcrossTabs short-circuits on the unfiltered view; this pins one bucket.) */
  async tabContains(name, tabLabel) {
    await this.gotoMyTasks();
    // the first tab click can fire before the list is interactive — wait for a
    // non-empty data row first, then click, then scan generously
    await this.page.waitForFunction(() =>
      [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent || '').trim().length > 0),
      { timeout: 15000 }).catch(() => {});
    await this.clickTab(tabLabel);
    await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const needle = name.toLowerCase();
    for (let i = 0; i < 6; i++) {
      const hit = await this.page.evaluate((x) =>
        [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent || '').toLowerCase().includes(x)), needle);
      if (hit) return true;
      if (i === 2) await this.clickTab(tabLabel);   // re-click once in case the first fired too early
      await this.page.waitForTimeout(1500);
    }
    return false;
  }

  /** Bucket-agnostic row lookup: scan every My Tasks tab, then Delegated Tasks,
   *  and return the matching row's TEXT (carries the status badge + dates), or null.
   *  Use this instead of asserting WHICH tab a task is under — the DEV build has a
   *  known bucketing bug (scheduled future tasks list under "Unscheduled", badges 0). */
  async findTaskRowText(name) {
    const scanRow = () => this.page.evaluate((n) => {
      const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent || '').includes(n));
      return r ? (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140) : null;
    }, name);
    await this.gotoMyTasks();
    await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    let row = await scanRow();
    if (row) return row;
    for (const tab of ['Today', 'Upcoming', 'Unscheduled', 'Delayed', 'Completed']) {
      await this.clickTab(tab);
      row = await scanRow();
      if (row) return row;
    }
    return this.findInDelegated(name);
  }

  /** Find a task by name on the Delegated Tasks page (where party-attached tasks
   *  live for their CREATOR on the DEV build — the save even redirects there).
   *  Searches by name and returns the matching row's text (has the Status badge),
   *  or null if not found. */
  async findInDelegated(name) {
    if (!/delegated-tasks/.test(this.page.url())) await this.gotoDelegated();
    await this.page.waitForFunction(() =>
      [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent || '').trim().length > 0),
      { timeout: 15000 }).catch(() => {});
    const search = this.page.locator('input[placeholder*="Search" i]:visible').first();
    if (await search.count().catch(() => 0)) {
      await search.fill(name).catch(() => {});
      await search.press('Enter').catch(() => {});
      // some builds only search via the magnifier button next to the box
      await search.locator('xpath=following-sibling::button[1]').click().catch(() => {});
      await this.page.waitForTimeout(2500);
    }
    const scanRow = () => this.page.evaluate((n) => {
      const r = [...document.querySelectorAll('table tbody tr')].find(x => (x.textContent || '').includes(n));
      return r ? (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null;
    }, name);
    for (let i = 0; i < 4; i++) {
      const row = await scanRow();
      if (row) return row;
      await this.page.waitForTimeout(1500);
    }
    // the Delegated page has its own status tabs — a future-dated task sits under
    // Upcoming, not the default Today view
    for (const tab of ['Upcoming', 'Unscheduled', 'Delayed', 'Completed']) {
      await this.clickTab(tab);
      const row = await scanRow();
      if (row) return row;
    }
    return null;
  }

  /** Daily Activity Report: wait for rows and return the count. */
  async reportRowCount() {
    await this.gotoDailyActivity();
    await this.rows.first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    return this.rows.count();
  }

  /** Count only real multi-column data rows on the current page, excluding
   *  empty-state placeholders ("No records found" single-cell rows). */
  async dataRowCount() {
    return this.page.evaluate(() => [...document.querySelectorAll('table tbody tr')].filter(r => {
      const t = (r.textContent || '').trim();
      if (!t || /no records|no data|not found|nothing/i.test(t)) return false;
      return r.querySelectorAll('td').length >= 2;
    }).length);
  }
}

module.exports = { TaskManagementPage };
