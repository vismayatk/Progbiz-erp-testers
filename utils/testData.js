/**
 * testData.js
 * ---------------------------------------------------------------------------
 * Single source of truth for test data. Kept separate from the scripts so
 * data can change without touching test logic.
 *
 * Values default to those documented on the workbook Cover sheet and can be
 * overridden via environment variables (see .env.example).
 */

'use strict';

const env = process.env;

const credentials = {
  companyCode: env.COMPANY_CODE || 'Testlive',
  admin: {
    username: env.ADMIN_USERNAME || 'admin',
    password: env.ADMIN_PASSWORD || '123456',
  },
  // Limited / secondary role used by RBAC cross-user cases in other modules.
  user: {
    username: env.USER_USERNAME || 'Kavyasree',
    password: env.USER_PASSWORD || '123',
  },
};

const urls = {
  base: env.BASE_URL || 'https://erp.progbiz.io',
  login: '/login',
  // Best-known post-login landing route. TODO: confirm the exact dashboard path
  // against the live app (doc says "Home dashboard").
  dashboard: '/',
};

/**
 * Expected UI text. Where the document states exact copy we use it; otherwise
 * the value is flagged TODO so it can be confirmed against the live app.
 */
const messages = {
  validation: {
    companyCodeRequired: 'Enter Company Code', // doc: TC_LOGIN_11/12
    usernameRequired: 'Enter Username', // doc: TC_LOGIN_11/13
    passwordRequired: 'Enter Password', // doc: TC_LOGIN_11/14
  },
  // Doc says "generic failure message" but does not quote exact text.
  // TODO: Need exact invalid-credentials error text from the live app.
  invalidCredentials: null,
  headingSignIn: 'Sign In',
};

/** Data-driven negative login combinations (doc TC_LOGIN_15..17). */
const invalidLogins = [
  {
    id: 'TC_LOGIN_15',
    label: 'invalid Company Code',
    companyCode: 'ABC',
    username: credentials.admin.username,
    password: credentials.admin.password,
  },
  {
    id: 'TC_LOGIN_16',
    label: 'invalid User Name',
    companyCode: credentials.companyCode,
    username: 'wronguser',
    password: credentials.admin.password,
  },
  {
    id: 'TC_LOGIN_17',
    label: 'invalid Password',
    companyCode: credentials.companyCode,
    username: credentials.admin.username,
    password: 'wrong123',
  },
];

/** Blank-field validation combinations (doc TC_LOGIN_11..14). */
const blankFieldCases = [
  {
    id: 'TC_LOGIN_11',
    label: 'all fields blank',
    companyCode: '',
    username: '',
    password: '',
  },
  {
    id: 'TC_LOGIN_12',
    label: 'only Company Code blank',
    companyCode: '',
    username: credentials.admin.username,
    password: credentials.admin.password,
  },
  {
    id: 'TC_LOGIN_13',
    label: 'only User Name blank',
    companyCode: credentials.companyCode,
    username: '',
    password: credentials.admin.password,
  },
  {
    id: 'TC_LOGIN_14',
    label: 'only Password blank',
    companyCode: credentials.companyCode,
    username: credentials.admin.username,
    password: '',
  },
];

/** Security payloads (doc TC_LOGIN_32/33). */
const payloads = {
  sqlInjection: "' OR 1=1 --",
  xss: '<script>alert(1)</script>',
  longString: 'A'.repeat(500),
  specialChars: '!@#$%^&*()',
};

module.exports = {
  credentials,
  urls,
  messages,
  invalidLogins,
  blankFieldCases,
  payloads,
};
