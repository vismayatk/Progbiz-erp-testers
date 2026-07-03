/**
 * projectData.js
 * ---------------------------------------------------------------------------
 * Test data + route map for the non-Login modules (Maintenance Schedules,
 * Expenses & Collections, Notes/Attachments/Complaints, Projects Lifecycle,
 * Project Module). Routes are taken verbatim from the test-case document.
 */

'use strict';

// Application routes documented in the workbook (relative to baseURL).
const routes = {
  home: '/',
  // Maintenance
  maintenance: '/maintenance-schedules',
  addSchedule: '/add-new-schedule',
  // Expenses & Collections
  expenses: '/project-expenses',
  addExpense: '/add-new-expense',
  collectionsList: '/project-incomes',
  addCollection: '/project-income',
  // Notes / Attachments / Complaints
  notes: '/project-notes',
  attachments: '/project-attachments',
  complaints: '/complaints',
  // Projects
  projects: '/projects',
  addProject: '/project',
  projectTasks: '/project-tasks',
};

// Sample values referenced by the documented steps (used for search etc.).
const sample = {
  projectKeyword: 'ABCD',
  projectKeyword2: 'Sree',
  projectKeyword3: 'Akash',
  projectKeyword4: 'Ada',
  noMatchKeyword: 'zzzzz',
  assignee: 'Kavyasree',
};

module.exports = { routes, sample };
