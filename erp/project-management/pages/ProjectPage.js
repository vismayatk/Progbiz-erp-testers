'use strict';

/**
 * Project Management module.
 *  Listing: /projects (Sl.No · Project Name · Project Type · Work Start Date · Agent · Status)
 *  Add:     /project   ("Add Project" form)
 *  Sub-pages: /project-notes · /project-attachments · /project-expenses ·
 *             /project-incomes (Collections) · /project-collection-pending · /project-report
 */
class ProjectPage {
  constructor(page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'https://erptest.progbiz.in';
  }

  async goto(path) {
    await this.page.goto(`${this.baseUrl}/${path}`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    console.log(`  📋 ${path} → ${this.page.url()}`);
  }
  gotoProjects()     { return this.goto('projects'); }
  gotoAddProject()   { return this.goto('project'); }
  gotoNotes()        { return this.goto('project-notes'); }
  gotoAttachments()  { return this.goto('project-attachments'); }
  gotoExpenses()     { return this.goto('project-expenses'); }
  gotoIncomes()      { return this.goto('project-incomes'); }
  gotoReports()      { return this.goto('project-report'); }

  /** Visible table header labels on the current page. */
  columns() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('table thead th')]
        .map(t => (t.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
  }
  is404() {
    return this.page.evaluate(() => /nothing at this address|not found|404/i.test(document.body.innerText));
  }
}

module.exports = { ProjectPage };
