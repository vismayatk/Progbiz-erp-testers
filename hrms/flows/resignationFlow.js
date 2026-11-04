'use strict';

/**
 * Resignation & Exit flow helpers.
 *
 * The exit lifecycle is TERMINAL (closing ends the employment record; completing F&F locks it), so
 * this module drives a DEDICATED throwaway employee created fresh for the run — never the shared run
 * employee and never a real record. The employee is created with login enabled (username + initial
 * password = employee code) so the second actor (ESS) can sign in as themselves.
 */
const { expect } = require('@playwright/test');
const { EmployeesPage } = require('../pages/core-hr/EmployeesPage');
const testEmployee = require('../data/testEmployee');
const { withUser } = require('./userSession');
const { EssResignationPage } = require('../pages/resignation/EssResignationPage');

/**
 * Create a fresh throwaway employee for the exit run. Realistic person (naming.js), designation
 * SOFTWARE TESTER (matches the seeded notice rule), Reports To Amit, login enabled.
 * @returns {{code,username,password,display,first,last,email,designation}}
 */
async function createExitEmployee(page, overrides = {}) {
  const profile = { ...testEmployee.forRun(), ...overrides };
  const po = new EmployeesPage(page);
  const created = await po.createEmployee(profile);
  const row = await po.findEmployeeRow(profile.email, profile.first);
  const code = (row && row[1]) || created.code;
  expect(code, 'the new exit employee should get an employee code').toMatch(/^[A-Za-z]+\d+$/);
  return {
    code,
    username: profile.username,
    password: code,                 // initial password = employee code (set by the app)
    display: profile.display,
    first: profile.first,
    last: profile.last,
    email: profile.email,
    designation: profile.designation,
  };
}

/** Login as the employee and submit a self-service resignation (two-actor). Returns status text. */
async function essSubmit(browser, testInfo, emp, spec) {
  return withUser(browser, testInfo, { username: emp.username, password: emp.password }, async (page) => {
    const ess = new EssResignationPage(page);
    return ess.submit(spec);
  });
}

/** Login as the employee and withdraw their pending resignation (FR-34). */
async function essWithdraw(browser, testInfo, emp) {
  return withUser(browser, testInfo, { username: emp.username, password: emp.password }, async (page) => {
    const ess = new EssResignationPage(page);
    await ess.withdraw();
    return 'withdrawn';
  });
}

module.exports = { createExitEmployee, essSubmit, essWithdraw };
