'use strict';

/**
 * Task Management module.
 * Pages: My Tasks (/my-tasks), Delegated Tasks (/delegated-tasks),
 * To Do List (/todo-list), Calendar (/calendar),
 * Daily Activity Report (/daily-activity-report), Task Timeline.
 * Add Task form: /task — Branch* + #taskType* + #priority + Task + Description → #saveBtn.
 */
class TaskManagementPage {
  constructor(page) {
    this.page    = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';

    // Add Task form
    this.branchSelect   = page.locator('select').filter({ has: page.locator('option', { hasText: 'Kannur' }) }).first();
    this.taskTypeSelect = page.locator('#taskType');
    this.prioritySelect = page.locator('#priority');
    this.taskInput      = page.getByPlaceholder('What needs to be done?');
    this.descInput      = page.getByPlaceholder(/Write task details/i);
    this.saveBtn        = page.locator('#saveBtn');

    // My Tasks list
    this.search = page.locator('#task-search');
    this.rows   = page.locator('table tbody tr');
  }

  async goto(path) {
    await this.page.goto(`${this.baseUrl}/${path}`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 18000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    console.log(`  📋 Task page loaded: ${this.page.url()}`);
  }
  gotoMyTasks()       { return this.goto('my-tasks'); }
  gotoDelegated()     { return this.goto('delegated-tasks'); }
  gotoTodo()          { return this.goto('todo-list'); }
  gotoCalendar()      { return this.goto('calendar'); }
  gotoDailyActivity() { return this.goto('daily-activity-report'); }
  gotoTimeline()      { return this.goto('redirect/task-timeline'); }

  /** Read the My Tasks status-tab counts (Today/Delayed/Upcoming/Unscheduled/Completed). */
  async getTabCounts() {
    return this.page.evaluate(() => {
      const out = {};
      for (const b of document.querySelectorAll('button, a.btn')) {
        const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^(Today|Delayed|Upcoming|Unscheduled|Completed)\s+(\d+)$/i);
        if (m) out[m[1]] = Number(m[2]);
      }
      return out;
    });
  }

  /**
   * Create a task via /task. Returns the validation/error message, or null on success.
   * @param {string} name  task title
   * @param {string} type  Task Type (Call / Online Meeting / Offline Meeting / Activities / …)
   */
  async createTask(name, type = 'Call') {
    console.log(`  ➕ New Task: "${name}" (type=${type})`);
    await this.page.goto(`${this.baseUrl}/task`, { waitUntil: 'domcontentloaded' });
    await this.taskInput.waitFor({ state: 'visible', timeout: 20000 });

    // Branch* (defaults Kannur) — ensure a real value
    await this.branchSelect.evaluate(s => { if (s.selectedIndex < 0 || !s.value) s.selectedIndex = 0; }).catch(() => {});
    await this.taskTypeSelect.selectOption({ label: type }).catch(async () => {
      await this.taskTypeSelect.selectOption({ index: 1 }).catch(() => {});
    });
    await this.taskInput.fill(name);
    await this.descInput.fill(`Auto task ${name}`).catch(() => {});
    await this.saveBtn.click();
    await this.page.waitForTimeout(2500);
    return this._afterSave();
  }

  async _afterSave() {
    // Walk the swal chain: an Instant task may first ask "Do you want to continue?
    // Another task is in progress…" — confirm it, then read the final result.
    for (let i = 0; i < 3; i++) {
      const swal = this.page.locator('.swal2-popup');
      if (!(await swal.isVisible().catch(() => false))) break;
      const msg = (await this.page.locator('.swal2-title, .swal2-html-container').allTextContents().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
      await this.page.locator('.swal2-confirm').click().catch(() => {});
      await swal.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
      await this.page.waitForTimeout(1200);
      if (/do you want to continue|another task|are you sure|proceed|pause it/i.test(msg)) continue; // confirm → next swal
      if (/oops|something went wrong|error code/i.test(msg)) throw new Error(`Backend server error: "${msg}"`);
      if (/success|saved|added|done|created|started/i.test(msg)) return null;
      return msg;   // unexpected validation message
    }
    return null;    // no (further) swal → success (e.g. redirected)
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
}

module.exports = { TaskManagementPage };
