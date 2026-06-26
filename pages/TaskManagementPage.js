'use strict';

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
 *  Row actions: #edit-task-{id}, #delete-task-{id}, #overview-task-{id}.
 *  Dashboard lifecycle controls: .ri-play-fill (start/resume),
 *    .ri-pause-fill (hold), .ri-stop-fill (end).
 */
class TaskManagementPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    // ── Add-Task modal ──
    // NOTE: /home holds BOTH #home-create-task-modal (create) and #task-edit-modal
    // (edit), which share field ids (#taskName, #taskType, …). All modal-field
    // locators MUST be scoped to the create modal to avoid strict-mode clashes.
    this.createNewBtn = page.locator('#new-task');
    this.newTaskItem  = page.locator('#new-task-item');
    this.modal        = page.locator('#home-create-task-modal');
    this.tabInstant   = this.modal.locator('#instantBtn');
    this.tabLater     = this.modal.locator('#laterBtn');
    this.tabRepeat    = this.modal.locator('#repeatBtn');

    // modal-scoped fields
    this.branchSelect   = this.modal.locator('select').filter({ has: page.locator('option', { hasText: 'Kannur' }) }).first();
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
    this.rBranch   = page.locator('select').filter({ has: page.locator('option', { hasText: 'Kannur' }) }).first();
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

  /** Open the "Create New" dropdown and return its option labels (TC_TASK_001). */
  async getCreateNewOptions() {
    if (!/\/home/.test(this.page.url())) await this.gotoHome();
    const item = this.newTaskItem;
    for (let i = 0; i < 6 && !(await item.isVisible().catch(() => false)); i++) {
      await this.createNewBtn.click().catch(() => {});
      await this.page.waitForTimeout(600);
    }
    return this.page.evaluate(() =>
      ['new-task-item', 'new-enquiry-item', 'new-quotation-item']
        .map(id => document.getElementById(id))
        .filter(Boolean)
        .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()));
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
      const root = document.querySelector('#home-create-task-modal') || document;
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
      const m = document.querySelector('#home-create-task-modal') || document;
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

    if (party) {
      await this.partyInput.fill(party);
      await this.modal.locator('.ri-search-line').first().click().catch(() => {});
      await this.page.waitForTimeout(1800);
      await this.modal.locator('table tbody tr').first().click().catch(() => {});
      await this.page.waitForTimeout(800);
    }

    if (mode === 'later' && schedule) {
      const tgl = this.deadlineToggle;
      if (await tgl.isVisible().catch(() => false)) { await tgl.click({ force: true }).catch(() => {}); await this.page.waitForTimeout(800); }
      const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      await this.modal.locator('input[type="date"]:visible').first().fill(d).catch(() => {});
      await this.modal.locator('input[type="time"]:visible').first().fill('10:00').catch(() => {});
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

    if (mode === 'later') {
      const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      await this.page.locator('input[type="date"]:visible').first().fill(d).catch(() => {});
      await this.page.locator('input[type="time"]:visible').first().fill('10:00').catch(() => {});
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
  async clickTab(label) {
    await this.page.locator('button, a.btn').filter({ hasText: new RegExp(`^${label}\\s+\\d`, 'i') }).first().click().catch(() => {});
    await this.page.waitForTimeout(2000);
    return this.rows.count();
  }

  /** Visible table header labels on the current page. */
  async getColumns() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('table thead th, table thead td')]
        .map(th => (th.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean));
  }

  /** Distinct row-action kinds present (edit/delete/overview). */
  async rowActionKinds() {
    return this.page.evaluate(() => {
      const kinds = new Set();
      for (const e of document.querySelectorAll('[id^="edit-task-"],[id^="delete-task-"],[id^="overview-task-"]')) {
        kinds.add(e.id.replace(/-\d+$/, ''));
      }
      return [...kinds];
    });
  }

  /** Dashboard lifecycle controls (start/hold/end) + running-task count from timers. */
  async dashboardLifecycle() {
    await this.gotoHome();
    await this.page.waitForTimeout(2000);
    return this.page.evaluate(() => ({
      start:  document.querySelectorAll('.ri-play-fill').length,
      hold:   document.querySelectorAll('.ri-pause-fill').length,
      end:    document.querySelectorAll('.ri-stop-fill').length,
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

  /** Search My Tasks across every status tab; returns the tab label where found, else null. */
  async findAcrossTabs(name) {
    await this.gotoMyTasks();
    const hasName = (n) => this.page.evaluate((x) =>
      [...document.querySelectorAll('table tbody tr')].some(r => (r.textContent || '').toLowerCase().includes(x.toLowerCase())), n);
    if (await hasName(name)) return 'default';
    for (const tab of ['Today', 'Upcoming', 'Unscheduled', 'Delayed', 'Completed']) {
      await this.clickTab(tab);
      if (await hasName(name)) return tab;
    }
    return null;
  }

  /** Daily Activity Report: wait for rows and return the count. */
  async reportRowCount() {
    await this.gotoDailyActivity();
    await this.rows.first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    return this.rows.count();
  }
}

module.exports = { TaskManagementPage };
