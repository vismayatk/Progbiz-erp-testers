'use strict';

/**
 * Task Management module.
 *  Listing/report pages: My Tasks (/my-tasks), Delegated Tasks (/delegated-tasks),
 *    To Do List (/todo-list), Calendar (/calendar),
 *    Daily Activity Report (/daily-activity-report), Task Timeline.
 *  Add Task (/task): modes Instant / Task-for-Later / Repeat; fields
 *    Branch* + #taskType* + #priority + #taskName + #description + #partySearch → #saveBtn.
 */
class TaskManagementPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    // Add Task form
    this.branchSelect   = page.locator('select').filter({ has: page.locator('option', { hasText: 'Kannur' }) }).first();
    this.taskTypeSelect = page.locator('#taskType');
    this.prioritySelect = page.locator('#priority');
    this.taskInput      = page.locator('#taskName');
    this.descInput      = page.locator('#description');
    this.saveBtn        = page.locator('#saveBtn');
    this.instantBtn     = page.locator('#instantBtn');
    this.laterBtn       = page.locator('#laterBtn');
    this.repeatBtn      = page.locator('#repeatBtn');

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
  gotoMyTasks()       { return this.goto('my-tasks'); }
  gotoDelegated()     { return this.goto('delegated-tasks'); }
  gotoTodo()          { return this.goto('todo-list'); }
  gotoCalendar()      { return this.goto('calendar'); }
  gotoDailyActivity() { return this.goto('daily-activity-report'); }
  gotoTimeline()      { return this.goto('redirect/task-timeline'); }

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

  /** Open the Add Task form and select a mode. */
  async openForm(mode = 'instant') {
    await this.page.goto(`${this.baseUrl}/task`, { waitUntil: 'domcontentloaded' });
    await this.taskInput.waitFor({ state: 'visible', timeout: 20000 });
    const btn = mode === 'later' ? this.laterBtn : mode === 'repeat' ? this.repeatBtn : this.instantBtn;
    await btn.click().catch(() => {});
    await this.page.waitForTimeout(800);
  }

  /**
   * Create a task. Returns the validation message, or null on success.
   * @param {string} name
   * @param {object} opts {type='Call', priority, mode='instant', skipType=false}
   */
  async createTask(name, opts = {}) {
    const { type = 'Call', priority, mode = 'instant', skipType = false } = opts;
    console.log(`  ➕ New Task: "${name}" (type=${skipType ? '(none)' : type}, mode=${mode})`);
    await this.openForm(mode);

    await this.branchSelect.evaluate(s => { if (s.selectedIndex < 0 || !s.value) s.selectedIndex = 0; }).catch(() => {});
    if (!skipType) {
      await this.taskTypeSelect.selectOption({ label: type }).catch(async () => {
        await this.taskTypeSelect.selectOption({ index: 1 }).catch(() => {});
      });
    }
    if (priority) await this.prioritySelect.selectOption({ label: priority }).catch(() => {});
    await this.taskInput.fill(name);
    await this.descInput.fill(`Auto task ${name}`).catch(() => {});

    if (mode === 'later') {
      // schedule a future date + time (fields appear in "Task for Later" mode)
      const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      await this.page.locator('input[type="date"]:visible').first().fill(d).catch(() => {});
      await this.page.locator('input[type="time"]:visible').first().fill('10:00').catch(() => {});
    }

    await this.saveBtn.click();
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
    // No swal — poll for an INLINE validation message (e.g. "Please choose valid task type")
    const RE = /please (choose|select|enter)|required|valid (task|branch)|is required|choose valid|cannot be (empty|blank)/i;
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

  /** Daily Activity Report: wait for rows and return the count. */
  async reportRowCount() {
    await this.gotoDailyActivity();
    await this.rows.first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    return this.rows.count();
  }
}

module.exports = { TaskManagementPage };
