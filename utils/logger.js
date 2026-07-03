/**
 * logger.js
 * ---------------------------------------------------------------------------
 * User-friendly, colored, step-based console logger.
 *
 * Colors (per requirement):
 *   Green  -> Success
 *   Yellow -> Warning
 *   Red    -> Failure
 *   Blue   -> Information
 *
 * Colors are emitted with raw ANSI codes (zero dependencies) and can be
 * disabled by setting NO_COLOR=1 (or when stdout is not a TTY).
 *
 * The Logger renders the banners exactly as required:
 *   ================= TEST STARTED =================
 *   STEP n / action / ✓ success
 *   ================= TEST PASSED / FAILED =========
 */

'use strict';

const useColor =
  !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);

const RAW = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/** Wrap `text` in a color only when colors are enabled. */
function c(color, text) {
  if (!useColor) return text;
  return `${RAW[color] || ''}${text}${RAW.reset}`;
}

const LINE = '='.repeat(50);

class Logger {
  /**
   * @param {string} moduleName  e.g. "Login"
   * @param {string} testCase    e.g. "Verify Login with Valid Credentials"
   */
  constructor(moduleName, testCase) {
    this.moduleName = moduleName;
    this.testCase = testCase;
    this.stepCount = 0;
    this.lastStep = null; // remembered for the failure banner
  }

  /** Prints the TEST STARTED banner. */
  start() {
    console.log('');
    console.log(c('cyan', LINE));
    console.log(c('bold', 'TEST STARTED'));
    console.log(`${c('blue', 'Module')}    : ${this.moduleName}`);
    console.log(`${c('blue', 'Test Case')} : ${this.testCase}`);
    console.log(c('cyan', LINE));
  }

  /** Low-level helpers -------------------------------------------------- */

  info(message) {
    console.log(c('blue', `ℹ ${message}`));
  }

  success(message) {
    console.log(c('green', `✓ ${message}`));
  }

  warn(message) {
    console.log(c('yellow', `⚠ ${message}`));
  }

  error(message) {
    console.log(c('red', `✗ ${message}`));
  }

  /** Prints a "STEP n" header followed by the action description. */
  beginStep(title) {
    this.stepCount += 1;
    this.lastStep = title;
    console.log('');
    console.log(c('bold', `STEP ${this.stepCount}`));
    console.log(c('blue', `${title}...`));
  }

  /**
   * Run an action as a numbered step: prints the header, executes `fn`,
   * prints a green success line, and on error prints a red failure line and
   * rethrows (so the test still fails and the failure banner is produced).
   *
   * @template T
   * @param {string} title       what the step is doing (e.g. "Entering Username")
   * @param {() => Promise<T>|T} fn   the action
   * @param {string} [successMsg]  message for the ✓ line (defaults to title)
   * @returns {Promise<T>}
   */
  async step(title, fn, successMsg) {
    this.beginStep(title);
    try {
      const result = await fn();
      this.success(successMsg || `${title} - done`);
      return result;
    } catch (err) {
      this.error(`${title} - failed`);
      throw err;
    }
  }

  /** Prints the TEST PASSED banner. */
  pass(seconds) {
    console.log('');
    console.log(c('green', LINE));
    console.log(c('green', c('bold', 'TEST PASSED')));
    console.log(`${c('blue', 'Execution Time')} : ${Number(seconds).toFixed(2)} seconds`);
    console.log(c('green', LINE));
    console.log('');
  }

  /**
   * Prints the TEST FAILED banner in the required format.
   * @param {object} d
   * @param {string} [d.stepFailed]
   * @param {string} [d.expected]
   * @param {string} [d.actual]
   * @param {string} [d.screenshot]
   * @param {string} [d.error]
   */
  failure(d = {}) {
    console.log('');
    console.log(c('red', LINE));
    console.log(c('red', c('bold', 'TEST FAILED')));
    console.log('');
    console.log(c('yellow', 'Step Failed :'));
    console.log(d.stepFailed || this.lastStep || 'Unknown step');
    console.log('');
    console.log(c('yellow', 'Expected :'));
    console.log(d.expected || 'See test assertion / test-case document.');
    console.log('');
    console.log(c('yellow', 'Actual :'));
    console.log(d.actual || 'Assertion failed / element not found.');
    console.log('');
    console.log(c('yellow', 'Screenshot :'));
    console.log(d.screenshot || '(not captured)');
    console.log('');
    console.log(c('yellow', 'Error :'));
    console.log(c('red', d.error || 'Unknown error'));
    console.log(c('red', LINE));
    console.log('');
  }
}

module.exports = { Logger, colorize: c };
