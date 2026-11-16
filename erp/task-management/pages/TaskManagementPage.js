'use strict';
const { expect } = require('@playwright/test');

const { tenant } = require('../../common/tenantData');
const { dismissRateLimit } = require('../../common/helpers');

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
 *  The /task page form (Nov 2026) keeps those ids and adds a Checklist box, "Assign To"
 *    (#assignTo) and a Participants multiselect (#participantMultiselect-*); the creator is the
 *    host by default, so there is no Hosts picker (.add-host-btn) on it any more.
 *
 *  Listing pages (redesigned in the Nov 2026 build — see "listing pages" below):
 *    My Tasks (/my-tasks) is a week planner of cards, Delegated Tasks (/delegated-tasks) a
 *    status board of cards; neither has a table or status tabs. To Do List (/todo-list),
 *    Calendar (/calendar, a Team / Me week grid), Daily Activity Report
 *    (/daily-activity-report, still a table), Task Timeline.
 *    /created-tasks and /unscheduled-tasks were removed (dead routes).
 *  A card opens #task-overview-modal when clicked — or, for Enquiry / Quotation Followup,
 *    Complaint and Projects task types, navigates to the source record. Its ⋮ menu holds
 *    Open / Delete. See _openCard().
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
    // The redesigned home kept #new-task-item but dropped the ids on the
    // Enquiry/Quotation entries (plain hrefs now) — read every item of the
    // dropdown CONTAINING #new-task-item instead of relying on per-item ids.
    return this.page.evaluate(() => {
      const anchor = document.getElementById('new-task-item');
      const menu = anchor && anchor.closest('.dropdown-menu, ul');
      if (!menu) {
        return ['new-task-item', 'new-enquiry-item', 'new-quotation-item']
          .map(id => document.getElementById(id)).filter(Boolean)
          .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim());
      }
      return [...menu.querySelectorAll('a, button')]
        .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(t => t && t.length < 30);
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
      // TM-11 (2026-10-22) never saw the modal after 5 clicks: a "Too many requests" dialog can sit over the
      // menu, and a half-loaded home never wires the menu up. Clear the dialog, and reload home once.
      await dismissRateLimit(this.page, 500);
      if (attempt === 2) await this.gotoHome();
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
  /** The Task Type list loads after the modal opens: wait until it holds real choices, not just "Choose". */
  async getTaskTypeOptions() {
    const opts = () => this.taskTypeSelect.locator('option').allTextContents();
    await expect.poll(async () => (await opts()).length, { timeout: 15000, message: 'Task Type list never loaded' })
      .toBeGreaterThan(1).catch(() => {});
    return opts();
  }
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

  // ════════════════════════ listing pages (Nov 2026 redesign) ════════════════════════
  //
  // My Tasks (/my-tasks) is a WEEK PLANNER, no table and no status tabs:
  //   toolbar  .tm-wk-bar   #btn-week-previous · #btn-week-today · #btn-week-next · .tm-wk-label ("9 – 15 Nov 2026")
  //                         #my-tasks-show-completed (switch) · #task-search (+ submit) · #btn-toggle-filter
  //   trays    .tm-tray     h6.tm-tray-h "Delayed <badge>" (.is-late) and "Unscheduled <badge>", cards in .tm-tray-list
  //   week     .tm-wk-grid  7 × .tm-day (.is-today / .is-empty): .tm-day-name "Sat 14", .tm-day-meta "5 tasks · 0.3 h planned"
  //   card     .tm-wc.tm-ty-<type> (.is-late .is-hold .is-run .is-fin .has-menu)
  //              .tm-wc-main[role=button][title=<full task name>]   click = open (#task-overview-modal, or the source record)
  //              .tm-wc-ico[title=<Task Type>] · bdi = time · .tm-wc-chips .badge = Hold / Running / "9d late"
  //              .tm-wc-menu = ⋮ → Open / Delete
  // Delegated Tasks (/delegated-tasks) is a STATUS BOARD:
  //   "When" chips .dtb-when-btn  All open · Today · Delayed · Upcoming · Unscheduled · Completed (each with a count)
  //   columns      .dtb-col       Unscheduled · Scheduled · Running · Hold · Finished (.dtb-col-title, .dtb-count)
  //   card         .dtb-card      button.dtb-card-open = task name (click = open) · .dtb-ty[title=<Task Type>]
  //                               .dtb-who-name = assignees · .dtb-time bdi · .dtb-card-menu = ⋮ → Open / Open Work Flow / Delete
  // /created-tasks and /unscheduled-tasks no longer exist ("Sorry, there's nothing at this address").

  /** Wait until the planner or the board has drawn its cards (the skeleton placeholders are gone). */
  async waitForTaskList(timeout = 25000) {
    await this.page.waitForFunction(() => {
      const planner = document.querySelector('.tm-wk-grid'); const board = document.querySelector('.dtb-board');
      if (!planner && !board) return false;
      if (document.querySelector('.dtb-board .placeholder-glow, .tm-wk-trays .placeholder-glow, .tm-wk-grid .placeholder-glow')) return false;
      return planner ? planner.querySelectorAll('.tm-day').length >= 7 : true;
    }, { timeout }).catch(() => {});
    await this.page.waitForTimeout(700);
  }

  /** True on the My Tasks week planner, false on the Delegated board (or anything else). */
  async onPlanner() { return (await this.page.locator('.tm-wk-grid').count().catch(() => 0)) > 0; }

  /**
   * Every task card now on the page, planner or board, in document order:
   *   { i, view, name, type, time, chips[], where, status, late, hasMenu, who }
   * `where` is the tray ("Delayed" / "Unscheduled"), the day ("Sat 14") or the board column;
   * `status` is Unscheduled / Scheduled / Running / Hold / Finished.
   */
  async taskCards() {
    return this.page.evaluate(() => {
      const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const out = [];
      document.querySelectorAll('.tm-wc').forEach((c, i) => {
        const main = c.querySelector('.tm-wc-main'); if (!main) return;
        const tray = c.closest('.tm-tray'); const day = c.closest('.tm-day');
        const where = tray ? t(tray.querySelector('.tm-tray-h').textContent).replace(/\s*\d+$/, '')
          : day ? t((day.querySelector('.tm-day-name') || {}).textContent) : '';
        const cl = c.classList;
        const ico = c.querySelector('.tm-wc-ico');
        out.push({
          i, view: 'planner',
          name: main.getAttribute('title') || t((c.querySelector('.tm-wc-name') || {}).textContent),
          type: (ico && ico.getAttribute('title')) || '',
          time: t((c.querySelector('.tm-wc-time bdi') || {}).textContent),
          chips: [...c.querySelectorAll('.tm-wc-chips .badge')].map((b) => t(b.textContent)),
          where, today: !!(day && day.classList.contains('is-today')),
          status: cl.contains('is-fin') ? 'Finished' : cl.contains('is-run') ? 'Running' : cl.contains('is-hold') ? 'Hold'
            : /unscheduled/i.test(where) ? 'Unscheduled' : 'Scheduled',
          late: cl.contains('is-late'), hasMenu: cl.contains('has-menu'), who: '',
        });
      });
      document.querySelectorAll('.dtb-card').forEach((c, i) => {
        const open = c.querySelector('.dtb-card-open'); if (!open) return;      // a loading skeleton
        const col = c.closest('.dtb-col'); const ty = c.querySelector('.dtb-ty');
        const where = col ? t((col.querySelector('.dtb-col-title') || {}).textContent) : '';
        out.push({
          i, view: 'board', name: t(open.textContent), type: (ty && ty.getAttribute('title')) || '',
          time: t((c.querySelector('.dtb-time') || {}).textContent),
          chips: [...c.querySelectorAll('.dtb-chip')].map((b) => t(b.textContent)),
          where, today: false, status: where, late: /late/i.test(c.textContent || ''), hasMenu: !!c.querySelector('.dtb-card-menu'),
          who: t((c.querySelector('.dtb-who-name') || {}).textContent),
        });
      });
      return out;
    });
  }

  /** One line of text for a card, the way the old table row read ("name | type | status | where time | chips | who"). */
  cardText(c) {
    return [c.name, c.type, c.status, `${c.where} ${c.time}`.trim(), c.chips.join(' '), c.who].filter(Boolean).join(' | ');
  }

  /** The planner's shape: week label, the 7 day columns, the two tray counts and how many cards each tray really holds. */
  async plannerState() {
    return this.page.evaluate(() => {
      const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const num = (s) => { const m = t(s).match(/(\d+)/); return m ? Number(m[1]) : null; };
      const trays = {};
      document.querySelectorAll('.tm-tray').forEach((tr) => {
        const h = tr.querySelector('.tm-tray-h'); if (!h) return;
        const badge = h.querySelector('.badge');
        trays[t(h.textContent).replace(/\s*\d+$/, '')] = { badge: badge ? num(badge.textContent) : null, cards: tr.querySelectorAll('.tm-wc').length };
      });
      const days = [...document.querySelectorAll('.tm-wk-grid .tm-day')].map((d) => ({
        name: t((d.querySelector('.tm-day-name') || {}).textContent), meta: t((d.querySelector('.tm-day-meta') || {}).textContent),
        count: num((d.querySelector('.tm-day-meta') || {}).textContent), cards: d.querySelectorAll('.tm-wc').length,
        today: d.classList.contains('is-today'),
      }));
      return { label: t((document.querySelector('.tm-wk-label') || {}).textContent), trays, days,
        showCompleted: !!(document.querySelector('#my-tasks-show-completed') || {}).checked };
    });
  }

  /**
   * Counts by bucket.
   *   Planner: { Delayed, Unscheduled } from the tray badges, Today = today's column, Upcoming = the later days of the shown week.
   *   Board:   the "When" chips — { 'All open', Today, Delayed, Upcoming, Unscheduled, Completed }.
   */
  async getTabCounts() {
    if (await this.onPlanner()) {
      const s = await this.plannerState();
      const out = {};
      for (const [k, v] of Object.entries(s.trays)) out[k] = v.badge;
      const ti = s.days.findIndex((d) => d.today);
      if (ti >= 0) {
        out.Today = s.days[ti].count ?? s.days[ti].cards;
        out.Upcoming = s.days.slice(ti + 1).reduce((n, d) => n + (d.count ?? d.cards), 0);
      }
      return out;
    }
    return this.page.evaluate(() => {
      const out = {};
      for (const b of document.querySelectorAll('.dtb-when-btn')) {
        const m = (b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim().match(/^(.*?)\s+(\d+)$/);
        if (m) out[m[1]] = Number(m[2]);
      }
      return out;
    });
  }

  /** Board only: click a "When" chip (All open / Today / Delayed / Upcoming / Unscheduled / Completed); returns the cards then shown. */
  async clickTab(label) {
    // the chip's text is its label followed by its count with no space in between ("Today0"), so no \b after the label
    const chip = this.page.locator('.dtb-when-btn').filter({ hasText: new RegExp(`^\\s*${label}\\s*\\d*\\s*$`, 'i') }).first();
    if (!(await chip.count().catch(() => 0))) return (await this.taskCards()).length;   // the planner has no status tabs
    await chip.click({ timeout: 8000 }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await this.waitForTaskList(12000);
    return this.page.locator('.dtb-card:has(.dtb-card-open)').count();
  }

  /** Board only: { column: { count (the column badge), cards (cards drawn) } }. */
  async boardColumns() {
    return this.page.evaluate(() => {
      const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const out = {};
      document.querySelectorAll('.dtb-col').forEach((c) => {
        const n = t((c.querySelector('.dtb-count') || {}).textContent);
        out[t((c.querySelector('.dtb-col-title') || {}).textContent)] = { count: n === '' ? null : Number(n), cards: c.querySelectorAll('.dtb-card .dtb-card-open').length };
      });
      return out;
    });
  }

  /** Type in the list's search box (#task-search) and run it; an empty string clears the search. */
  async searchTasks(text) {
    const box = this.search;
    if (!(await box.count().catch(() => 0))) return false;
    await box.fill(text).catch(() => {});
    await box.press('Enter').catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await this.waitForTaskList(12000);
    return true;
  }

  /** Planner: move to the previous / next week, or back to the current one. Returns the new week label. */
  async plannerWeek(dir) {
    const id = dir === 'next' ? '#btn-week-next' : dir === 'previous' ? '#btn-week-previous' : '#btn-week-today';
    await this.page.locator(id).click({ timeout: 8000 }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await this.waitForTaskList(12000);
    return (await this.plannerState()).label;
  }

  /** Planner: switch "Show completed" on or off (finished cards carry .is-fin). */
  async showCompleted(on = true) {
    const sw = this.page.locator('#my-tasks-show-completed');
    if (!(await sw.count().catch(() => 0))) return false;
    if ((await sw.isChecked().catch(() => false)) !== on) {
      await sw.setChecked(on, { force: true }).catch(async () => { await sw.evaluate((e) => e.click()).catch(() => {}); });
      await this.page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      await this.waitForTaskList(12000);
    }
    return sw.isChecked().catch(() => false);
  }

  /** Text of the first card (or the first table row on the report pages). */
  async firstRowText() {
    const cards = await this.taskCards();
    if (cards.length) return this.cardText(cards[0]).slice(0, 80);
    return this.page.evaluate(() => {
      const r = document.querySelector('table tbody tr');
      return r ? (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    });
  }

  /** Visible table header labels on the current page (report pages; the planner and the board have no table). */
  async getColumns() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('table thead th, table thead td')]
        .map(th => (th.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean));
  }

  /**
   * Distinct card-action kinds present, as stable names: 'overview-task' (⋮ → Open), 'delete-task' (⋮ → Delete),
   * 'open-workflow' (⋮ → Open Work Flow). The menus are in the markup whether or not they are open.
   */
  async rowActionKinds() {
    return this.page.evaluate(() => {
      const kinds = new Set();
      for (const a of document.querySelectorAll('.tm-wc-menu .dropdown-item, .dtb-card-menu .dropdown-item')) {
        const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (/^open$/i.test(t)) kinds.add('overview-task');
        else if (/^delete$/i.test(t)) kinds.add('delete-task');
        else if (/work ?flow/i.test(t)) kinds.add('open-workflow');
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
      // Redesigned home renamed the sections (New Leads/Followups/Delayed/
      // Completed cards) — count both generations as valid task sections.
      sections: ["Today's Schedule", 'Running Tasks', 'On Hold', 'Delayed', 'Completed', 'Followups']
        .filter(s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(document.body.innerText)),
      // Lifecycle controls only render when a task is scheduled/running —
      // an empty schedule legitimises their absence.
      emptySchedule: /no scheduled task/i.test(document.body.innerText),
    }));
  }

  /** Search My Tasks for a task name and report whether a card carries it (this week, later weeks, then completed). */
  async findTask(name) {
    return !!(await this.findOnPlanner(name));
  }

  /**
   * Find a task on the My Tasks planner by (part of) its name and return its card, or null.
   * Searches with the list's own search box, then looks at the current week, up to `weeksAhead` later weeks
   * (a task scheduled a few days ahead can fall in next week's grid), and last with "Show completed" on.
   * Leaves the planner on the week where the card was found.
   */
  async findOnPlanner(name, { weeksAhead = 2, completed = true } = {}) {
    await this.gotoMyTasks();
    await this.waitForTaskList();
    await this.searchTasks(name);
    const needle = name.toLowerCase();
    const look = async (tries = 3) => {
      for (let i = 0; i < tries; i++) {
        const hit = (await this.taskCards()).find((c) => c.view === 'planner' && c.name.toLowerCase().includes(needle));
        if (hit) return hit;
        await this.page.waitForTimeout(900);
      }
      return null;
    };
    let card = await look();
    for (let w = 0; !card && w < weeksAhead; w++) { await this.plannerWeek('next'); card = await look(2); }
    if (!card && completed) {
      await this.plannerWeek('today');
      await this.showCompleted(true);
      card = await look(2);
    }
    return card;
  }

  // ════════════════════════ Task Details panel (#task-overview-modal) ════════════════════════
  // Opened by clicking a card (.tm-wc-main on the planner, .dtb-card-open on the board) or ⋮ → Open. Holds:
  //   notes (#txtChat + .btn-send), document upload (.fe-paperclip → #file-input-document),
  //   lifecycle (Hold .btn-warning-light / End Task .btn-danger-light / Resume .btn-success-light),
  //   and a ⋮ menu (.fe-more-vertical) → Edit Task / Reschedule Task / Add Lead.

  get detailsModal() { return this.page.locator('#task-overview-modal'); }

  /**
   * Open #task-overview-modal from ONE card (as returned by taskCards()).
   *
   * CRM / Complaint / Work Flow task types (Enquiry Followup, Quotation Followup, Complaint, Projects Task)
   * route their card to the source record (/enquiry-overview, /quotation-view, /complaint-detail, the project)
   * instead of opening the panel. If the click navigates, come back and report not-openable.
   */
  async _openCard(card) {
    const target = card.view === 'board'
      ? this.page.locator('.dtb-card').nth(card.i).locator('.dtb-card-open')
      : this.page.locator('.tm-wc').nth(card.i).locator('.tm-wc-main');
    if (!(await target.count().catch(() => 0))) return false;
    const before = this.page.url();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click({ timeout: 5000 }).catch(() => {});
    const ok = await this.detailsModal.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
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

  /** Open the Task Details panel for the task named `name`: My Tasks first (any week, completed too), then the
   *  Delegated board, where a task assigned to someone else sits for its creator. */
  async openTaskDetails(name) {
    const card = await this.findOnPlanner(name);
    if (card && await this._openCard(card)) return true;
    const row = await this.findInDelegated(name, { asCard: true });
    if (row && await this._openCard(row)) return true;
    return false;
  }

  /** Open the FIRST openable task in My Tasks (trays, then the week) and return its name, or null.
   *
   *  Only MACHINE-MADE tasks are eligible (a `QA_`/`TM` prefix, or a 13-digit ms
   *  timestamp in the name — "Repeat 1789652320867", "LaterTask 1789533179909").
   *  TM-25/26/28 rename, reschedule and start/hold/end whatever this opens; on a
   *  shared tenant that must never be a colleague's real task (docs/qa/QA_METHOD.md:
   *  never Save on a record you did not create). No eligible task → null → the
   *  caller creates one or skips.
   *
   *  `preferStatus` ('Running' / 'Hold' / 'Scheduled' …) restricts the candidates to that status.
   *  Bounded: at most MAX_ATTEMPTS clicks, so a planner full of non-openable cards ends in a clean null. */
  async openFirstOpenableTask(preferStatus) {
    const MAX_ATTEMPTS = 4;
    const LINKED = /followup|follow-up|complaint|project/i;          // these open their source record, not the panel
    const PLAIN = /^(call|online meeting|offline meeting|meeting|activities)$/i;   // try these first
    await this.gotoMyTasks();
    await this.waitForTaskList();
    const want = preferStatus ? new RegExp(preferStatus, 'i') : null;
    const candidates = (await this.taskCards())
      .filter((c) => c.view === 'planner' && !LINKED.test(c.type) && /(^(QA_|TM))|\d{13}/.test(c.name) && !/^QA_PRJ_/.test(c.name))
      .filter((c) => !want || want.test(c.status) || c.chips.some((x) => want.test(x)))
      .sort((a, b) => Number(PLAIN.test(b.type)) - Number(PLAIN.test(a.type)));
    let attempts = 0;
    for (const cand of candidates) {
      if (attempts >= MAX_ATTEMPTS) break;
      attempts++;
      // the card list can re-draw between reads: find this card again by name before clicking
      const now = (await this.taskCards()).find((c) => c.view === 'planner' && c.name === cand.name && c.where === cand.where);
      if (!now) continue;
      if (await this._openCard(now)) return cand.name;
      if (!/\/my-tasks/.test(this.page.url())) { await this.gotoMyTasks(); await this.waitForTaskList(); }
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

  /** Status of a task as its My Tasks card shows it: Running / Hold / Finished / Scheduled / Unscheduled. null if not found. */
  async rowStatus(name) {
    const card = await this.findOnPlanner(name);
    if (card) return card.status;
    const d = await this.findInDelegated(name, { asCard: true });
    return d ? d.status : null;
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

  /** Where a task sits: the My Tasks tray ("Delayed" / "Unscheduled") or day ("Mon 16") that holds its card,
   *  "Delegated" when it is only on the Delegated board (assigned to someone else), else null. */
  async findAcrossTabs(name) {
    const card = await this.findOnPlanner(name);
    if (card) return card.where || 'My Tasks';
    if (await this.findInDelegated(name)) return 'Delegated';
    return null;
  }

  /** True when the current page is the SPA's dead-route screen. The DEV build removed
   *  some routes (/created-tasks, /unscheduled-tasks) — goto() resolves fine on them. */
  async isDeadRoute() {
    return this.page.evaluate(() =>
      /nothing at this address|page not found|404/i.test(document.body.innerText)).catch(() => false);
  }

  /** True if `name` sits in the given My Tasks bucket: 'Delayed' / 'Unscheduled' (the trays), 'Today', 'Upcoming'
   *  (a later day, this week or the next ones) or 'Completed' (a finished card). */
  async tabContains(name, tabLabel) {
    const card = await this.findOnPlanner(name);
    if (!card) return false;
    if (/^completed$/i.test(tabLabel)) return card.status === 'Finished';
    if (/^today$/i.test(tabLabel)) return card.today;
    if (/^upcoming$/i.test(tabLabel)) return !card.today && !/delayed|unscheduled/i.test(card.where) && card.status !== 'Finished';
    return new RegExp(`^${tabLabel}$`, 'i').test(card.where);
  }

  /** Bucket-agnostic lookup: the task's card on My Tasks (any week, completed too), then on the Delegated board,
   *  as one line of text ("name | type | status | where time | chips | assignees"), or null. */
  async findTaskRowText(name) {
    const card = await this.findOnPlanner(name);
    if (card) return this.cardText(card).slice(0, 200);
    return this.findInDelegated(name);
  }

  /** Find a task by name on the Delegated Tasks board (where a task assigned to someone else sits for its
   *  CREATOR). Searches by name under "All open", then under "Completed". Returns the card's text (it carries
   *  the column = status), or the card itself with { asCard: true }; null if not found. */
  async findInDelegated(name, { asCard = false } = {}) {
    await this.gotoDelegated();
    await this.waitForTaskList();
    await this.searchTasks(name);
    const needle = name.toLowerCase();
    const look = async (tries = 3) => {
      for (let i = 0; i < tries; i++) {
        const hit = (await this.taskCards()).find((c) => c.view === 'board' && c.name.toLowerCase().includes(needle));
        if (hit) return hit;
        await this.page.waitForTimeout(1000);
      }
      return null;
    };
    let card = await look();
    if (!card) { await this.clickTab('Completed'); card = await look(2); }
    if (!card) return null;
    return asCard ? card : this.cardText(card).slice(0, 200);
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
