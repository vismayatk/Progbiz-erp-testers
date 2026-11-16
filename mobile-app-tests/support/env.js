'use strict';

/**
 * Single source of environment + credentials for the mobile suite.
 * Reads the repo-root .env (Z:\HRMS\.env) — the same file the web suites use —
 * and never logs values.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

const BASE_URL = (process.env.HRMS_BASE_URL || 'https://hrms-erp.progbiz.in').replace(/\/+$/, '');

/** Same precedence as hrms/pages/HrmsLoginPage.js: HRMS_* first, then the shared vars. */
function creds() {
  const c = {
    company:  process.env.HRMS_COMPANY_CODE || process.env.COMPANY_CODE,
    username: process.env.HRMS_USERNAME     || process.env.CRM_USERNAME,
    password: process.env.HRMS_PASSWORD     || process.env.PASSWORD,
  };
  const missing = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`HRMS credentials missing (${missing.join(', ')}). ` +
      'Set HRMS_COMPANY_CODE / HRMS_USERNAME / HRMS_PASSWORD in Z:\\HRMS\\.env');
  }
  return c;
}

module.exports = { BASE_URL, creds };
