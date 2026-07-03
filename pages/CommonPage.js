/**
 * CommonPage.js
 * ---------------------------------------------------------------------------
 * Reusable, cross-module UI helpers (the "reusability" requirement):
 *   Search, Navigation, Dropdown, Date picker, Upload, Download,
 *   Common buttons, Toast validation, Alert handling, Popup handling.
 *
 * These are written as GENERIC, parameterized methods (they accept the target
 * text/locator) rather than hard-coding module-specific selectors, so they can
 * be reused by Expenses / Projects / Maintenance / Notes specs as those modules
 * are automated. Where an app-wide default selector is guessed, it is flagged
 * TODO — confirm against the live DOM.
 */

'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('./BasePage');

class CommonPage extends BasePage {
  /* ------------------------------ navigation ----------------------------- */

  /**
   * Click a left-nav / menu item by its visible label.
   * @param {string|RegExp} label
   */
  async navigateTo(label) {
    const item = this.page.getByRole('link', { name: label })
      .or(this.page.getByRole('menuitem', { name: label }))
      .or(this.page.getByText(label, { exact: false }));
    await this.click(item, `Nav item "${label}"`);
    await this.waitForPageReady();
  }

  /* -------------------------------- search ------------------------------- */

  /**
   * Type into a search box and submit. Defaults to a placeholder-based locator
   * ("Search here" is used across ERP list pages per the doc).
   * @param {string} keyword
   * @param {import('@playwright/test').Locator} [searchBox]
   */
  async search(keyword, searchBox) {
    const box = searchBox || this.page.getByPlaceholder(/search/i);
    await this.fill(box, keyword, 'Search box');
    await box.press('Enter');
    await this.waitForPageReady();
  }

  /* ------------------------------- dropdown ------------------------------ */

  /**
   * Select an option from a dropdown. Handles both native <select> and custom
   * (click-to-open) dropdowns.
   * @param {import('@playwright/test').Locator} control  the dropdown trigger/select
   * @param {string} optionLabel
   */
  async selectOption(control, optionLabel) {
    const tag = await control.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
    if (tag === 'select') {
      await control.selectOption({ label: optionLabel });
      return;
    }
    // Custom dropdown: open, then pick the visible option.
    await this.click(control, 'Dropdown');
    const option = this.page.getByRole('option', { name: optionLabel })
      .or(this.page.getByText(optionLabel, { exact: true }));
    await this.click(option, `Option "${optionLabel}"`);
  }

  /* ------------------------------ date picker ---------------------------- */

  /**
   * Set a date. Prefers typing into the input (most reliable); falls back to
   * whatever the caller wires up for calendar widgets.
   * @param {import('@playwright/test').Locator} input
   * @param {string} value  e.g. "30-06-2026" (match the app's expected format)
   */
  async setDate(input, value) {
    await this.fill(input, value, 'Date field');
    await input.press('Enter').catch(() => { /* some pickers close on blur */ });
  }

  /* -------------------------------- upload ------------------------------- */

  /**
   * Upload one or more files via a file input.
   * @param {import('@playwright/test').Locator} fileInput
   * @param {string|string[]} filePaths absolute path(s)
   */
  async uploadFile(fileInput, filePaths) {
    await fileInput.setInputFiles(filePaths);
  }

  /* ------------------------------- download ------------------------------ */

  /**
   * Trigger a download and return the saved file path.
   * @param {() => Promise<void>} triggerAction  the click that starts the download
   */
  async downloadFile(triggerAction) {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      triggerAction(),
    ]);
    const suggested = download.suggestedFilename();
    const target = require('path').join(require('os').tmpdir(), suggested);
    await download.saveAs(target);
    return target;
  }

  /* ---------------------------- common buttons --------------------------- */

  async clickButton(name) {
    const btn = this.page.getByRole('button', { name });
    await this.click(btn, `Button "${name}"`);
  }

  async clickSave() {
    await this.clickButton(/save/i);
  }

  async clickCancel() {
    await this.clickButton(/cancel/i);
  }

  /* ----------------------------- toast / alert --------------------------- */

  /**
   * Assert a toast/snackbar contains the expected text.
   * TODO: confirm the toast container selector for this ERP.
   * @param {string|RegExp} expectedText
   */
  async expectToast(expectedText) {
    const toast = this.page
      .locator('[class*="toast"], [class*="snackbar"], [role="alert"], [class*="notification"]')
      .filter({ hasText: expectedText })
      .first();
    await expect(toast, `Toast should show "${expectedText}"`).toBeVisible();
    return toast;
  }

  /**
   * Handle a native JS dialog (alert/confirm/prompt) that a subsequent action
   * will raise.
   * @param {'accept'|'dismiss'} action
   * @param {(msg: string) => void} [onMessage]
   */
  handleNativeDialog(action = 'accept', onMessage) {
    this.page.once('dialog', async (dialog) => {
      if (onMessage) onMessage(dialog.message());
      await (action === 'accept' ? dialog.accept() : dialog.dismiss());
    });
  }

  /* -------------------------------- popup -------------------------------- */

  /**
   * Confirm an in-app confirmation modal (e.g. "Are you sure ...?") by clicking
   * the confirm button label.
   * @param {string|RegExp} confirmLabel e.g. /yes|confirm|delete/i
   */
  async confirmModal(confirmLabel = /yes|confirm|ok|delete/i) {
    const dialog = this.page.getByRole('dialog');
    const btn = dialog.getByRole('button', { name: confirmLabel })
      .or(this.page.getByRole('button', { name: confirmLabel }));
    await this.click(btn, 'Modal confirm button');
    await this.waitForPageReady();
  }

  /**
   * Capture a newly opened browser popup/tab produced by `triggerAction`.
   * @param {() => Promise<void>} triggerAction
   * @returns {Promise<import('@playwright/test').Page>}
   */
  async capturePopup(triggerAction) {
    const [popup] = await Promise.all([
      this.page.context().waitForEvent('page'),
      triggerAction(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    return popup;
  }
}

module.exports = { CommonPage };
