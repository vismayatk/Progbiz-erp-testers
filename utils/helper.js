/**
 * helper.js
 * ---------------------------------------------------------------------------
 * Generic, reusable helpers with no page/UI knowledge.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');

/** Ensure the screenshots directory exists and return its absolute path. */
function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  return SCREENSHOTS_DIR;
}

/** Turn any string into a filesystem-safe, lowercase slug. */
function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

/**
 * Build a meaningful, absolute screenshot file path, e.g.
 *   screenshots/tc_login_07_verify_successful_login__failed.png
 * @param {string} name    base name (usually the test title)
 * @param {string} suffix  e.g. "failed" | "passed" | "before_login"
 */
function screenshotPath(name, suffix = '') {
  ensureScreenshotsDir();
  const file = suffix ? `${slugify(name)}__${suffix}.png` : `${slugify(name)}.png`;
  return path.join(SCREENSHOTS_DIR, file);
}

/** Convert milliseconds to seconds (number). */
function msToSeconds(ms) {
  return (Number(ms) || 0) / 1000;
}

/**
 * Extract a readable expected/actual pair from a Playwright/expect error when
 * available (used to populate the failure banner).
 * @param {any} error
 * @returns {{expected?: string, actual?: string, message: string}}
 */
function describeError(error) {
  if (!error) return { message: 'Unknown error' };
  const message = error.message || String(error);
  const mr = error.matcherResult;
  if (mr) {
    return {
      expected: mr.expected !== undefined ? String(mr.expected) : undefined,
      actual: mr.actual !== undefined ? String(mr.actual) : undefined,
      message,
    };
  }
  return { message };
}

module.exports = {
  SCREENSHOTS_DIR,
  ensureScreenshotsDir,
  slugify,
  screenshotPath,
  msToSeconds,
  describeError,
};
