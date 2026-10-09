'use strict';

/**
 * The run employee — ONE employee per complete run.
 *
 * Core HR Step 1 creates the employee (with login, Reports To Amit) and saves it here. Every later
 * spec that needs an employee — Core HR Steps 2–3, Leave (LV/LA), Resignation (RE), E2E — reads
 * the SAME person back, so a complete run tells one story:
 *   hire → profile → leave entitlement → leave on behalf → self-service leave + approval → exit.
 * No other spec creates an employee. Resignation runs last because "On Notice" is final.
 *
 * Saved to hrms/.auth/run-employee.json (git-ignored). Running a single step later reuses the saved
 * employee and creates nobody. Login: username set at creation, initial password = employee code.
 */
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const STATE = path.join(__dirname, '..', '.auth', 'run-employee.json');

/** Save the employee created by Core HR Step 1 (drops the raw register row). */
function saveRunEmployee(emp) {
  const { row, ...keep } = emp;
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ ...keep, savedAt: new Date().toISOString() }, null, 2));
}

/** Merge extra facts learned later (e.g. profileHref) into the saved employee. */
function updateRunEmployee(fields) {
  const cur = loadRunEmployee();
  if (cur) fs.writeFileSync(STATE, JSON.stringify({ ...cur, ...fields }, null, 2));
}

/** The saved run employee, or null. */
function loadRunEmployee() {
  return fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf-8')) : null;
}

/** The run employee — fails clearly if Core HR Step 1 has not created one yet. */
function requireRunEmployee() {
  const emp = loadRunEmployee();
  expect(emp && emp.code, 'no run employee saved — run Core HR "Step 1" first (it creates the run\'s one employee)').toBeTruthy();
  expect(emp.code, 'the run employee should have an employee code').toMatch(/^[A-Za-z]+\d+$/);
  return emp;
}

/** Login credentials for the run employee (initial password = employee code, set by the app). */
const credentials = emp => ({ username: emp.username, password: emp.code });

module.exports = { saveRunEmployee, updateRunEmployee, loadRunEmployee, requireRunEmployee, credentials };
