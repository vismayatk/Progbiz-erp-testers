'use strict';

/**
 * Build the Excel file the "Employee Excel Import" page (/upload-employee) accepts.
 *
 * IMPORTANT — the file the app's own "Download Sample Excel" link serves is STALE: it has 11
 * columns (and a Branch column) and the importer rejects it with HTTP 400 "does not match the
 * required format". The importer actually expects the 20 columns below, in this order, with NO
 * Branch column (every row is created in the Branch chosen on the page). This layout was read
 * from the live "Excel Rules" panel and the upload-detail grid, and confirmed by a 200
 * ("You've done it!") upload that created the employee.
 *
 *   1 First Name*      2 Last Name         3 Country Code*    4 Mobile Number*    5 Personal Email*
 *   6 Username         7 Designation*      8 Department*      9 Joining Date*     10 Work Type
 *   11 Role Group*     12 User Level*      13 Employee Code   14 Date of Birth*   15 Employee Status*
 *   16 Reports To      17 Employee Type*   18 Contract End Date  19 Gender*        20 Official Email
 *
 * Required columns, allowed values and rules (from "Excel Rules"):
 *   • Country Code e.g. +91 · Mobile & Personal Email must be unique · Designation must already
 *     exist · Department must match an existing department · Role Group / User Level must match
 *     existing ones · Dates are dd-MM-yyyy · DOB in the past and before Joining Date · Status is
 *     Active or Pre-Employee · Employee Type is one of Intern/Consultant/Contract/Full Time
 *     Employee/Part Time/Daily Wages · Gender is Male/Female/Other · Reports To is the manager's
 *     Employee Code (must exist and be a higher user level).
 *   • Employee Code / Username / Official Email / Contract End Date left blank (auto / N/A for a
 *     Full Time Employee). First password = the Employee Code.
 *
 * Tenant values mirror Core HR's test employee (data/testEmployee.js) so they are known-valid.
 * Returns { xlsxPath, employee } — employee carries the identifying e-mail/name the import
 * action verifies against the employee register afterwards.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { person } = require('../data/naming');
const { details } = require('../data/testEmployee');

// Column order is contractual — the importer reads by position. Do not reorder.
const HEADERS = [
  'First Name*', 'Last Name', 'Country Code*', 'Mobile Number*', 'Personal Email*',
  'Username', 'Designation*', 'Department*', 'Joining Date*', 'Work Type',
  'Role Group*', 'User Level*', 'Employee Code', 'Date of Birth*', 'Employee Status*',
  'Reports To', 'Employee Type*', 'Contract End Date', 'Gender*', 'Official Email',
];

const pad = n => String(n).padStart(2, '0');
/** dd-MM-yyyy from a Date. */
const dmy = d => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
/** dd-MM-yyyy from an ISO "yyyy-mm-dd". */
const isoToDmy = iso => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };

/**
 * Write a valid one-employee import file to `dir`.
 * @returns {Promise<{xlsxPath: string, employee: object}>}
 */
async function buildEmployeeImportXlsx(dir, branch = details.branch) {
  const who = person();                                   // realistic person, unique e-mail/username
  const jd = new Date(); jd.setDate(jd.getDate() + 7);    // Joining Date a week out
  const reportsToCode = (details.reportsTo.match(/\[([^\]]+)\]/) || [, ''])[1]; // "Amit Kumar [progbiz0017]" → progbiz0017

  const employee = {
    first:        who.first,
    last:         who.last,
    display:      who.full,
    gender:       who.gender,                             // Male / Female
    countryCode:  '+91',
    phone:        '9' + String(Date.now()).slice(-9),     // 10 digits, unique per call
    email:        who.email,                              // reserved @example.com test domain
    username:     who.username,
    designation:  details.designation,                    // SOFTWARE TESTER (exists)
    department:   details.department,                     // Testing (exists)
    joiningDate:  dmy(jd),
    workType:     details.workLocation,                   // Office
    roleGroup:    details.roleGroup,                      // Staff
    userLevel:    details.userLevel,                      // Team Member
    dob:          isoToDmy(details.dob),                  // 15-06-1995
    status:       details.status,                         // Active
    reportsTo:    reportsToCode,                          // progbiz0017 (Amit, higher level)
    employeeType: details.employmentType,                 // Full Time Employee
    branch,                                               // chosen on the page, not a column
    via:          'Excel Import',
  };

  // Values in column order (1..20). Blank = auto/optional.
  const row = [
    employee.first, employee.last, employee.countryCode, employee.phone, employee.email,
    employee.username, employee.designation, employee.department, employee.joiningDate, employee.workType,
    employee.roleGroup, employee.userLevel, '', employee.dob, employee.status,
    employee.reportsTo, employee.employeeType, '', employee.gender, '',
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employees');
  ws.addRow(HEADERS);
  ws.addRow(row);

  fs.mkdirSync(dir, { recursive: true });
  const xlsxPath = path.join(dir, `EmployeeUpload_${who.first}_${who.last}_${who.username.slice(-6)}.xlsx`);
  await wb.xlsx.writeFile(xlsxPath);
  return { xlsxPath, employee };
}

module.exports = { buildEmployeeImportXlsx, HEADERS };
