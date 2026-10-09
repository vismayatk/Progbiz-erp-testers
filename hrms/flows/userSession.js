'use strict';

/**
 * Second-user sessions. The suite runs as the admin (global-setup's saved login); a test that
 * needs another actor opens a separate browser context and signs in as a TEST-CREATED employee.
 *
 * Credentials: the employee's login username is set by the test when it creates the employee,
 * and the app assigns the initial password = the employee code (Core HR "Login created for …").
 * Nothing is hard-coded and no real person's password is used.
 *
 * Evidence: the second user's session is screen-recorded. If the step fails, the recording and a
 * full-page screenshot of that user's screen are attached to the test (the evidence reporter
 * collects them); on success the recording is discarded (kept when HRMS_EVIDENCE=all).
 */
const fs = require('fs');
const { expect } = require('@playwright/test');
const { HrmsLoginPage } = require('../pages/HrmsLoginPage');

const VIEWPORT = { width: 1600, height: 900 };

/**
 * Open a fresh context (no admin cookies) and sign in as `username` / `password`.
 * Returns { context, page } — close the context when done. Prefer withUser(), which also keeps evidence.
 */
async function loginAs(browser, { username, password }, { recordVideoDir } = {}) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ...(recordVideoDir ? { recordVideo: { dir: recordVideoDir, size: VIEWPORT } } : {}),
  });
  const page = await context.newPage();
  const company = process.env.HRMS_COMPANY_CODE || process.env.COMPANY_CODE;
  await new HrmsLoginPage(page).login(company, username, password);
  await expect(page, `${username} should be signed in (left the login page)`).not.toHaveURL(/\/login/i);
  return { context, page };
}

/**
 * Run `fn(page)` as another user in their own recorded session. On failure, a screenshot of that
 * user's screen and the session recording are attached to the test as evidence, then the error is
 * re-thrown so the step fails.
 */
async function withUser(browser, testInfo, creds, fn) {
  const who = creds.username;
  const keepAll = process.env.HRMS_EVIDENCE === 'all';
  let context, page, failed = false;
  try {
    ({ context, page } = await loginAs(browser, creds, { recordVideoDir: testInfo.outputPath('.recordings-tmp') }));
    return await fn(page);
  } catch (e) {
    failed = true;
    if (page) {
      const shot = testInfo.outputPath(`screen-${who}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      if (fs.existsSync(shot)) await testInfo.attach(`screenshot (${who})`, { path: shot, contentType: 'image/png' });
      console.log(`  📸 ${who}'s screen at failure → ${shot}  | URL: ${page.url()}`);
    }
    throw e;
  } finally {
    const video = page && page.video();
    if (context) await context.close().catch(() => {});
    if (video) {
      if (failed || keepAll) {
        const file = testInfo.outputPath(`recording-${who}.webm`);   // readable name next to the screenshots
        await video.saveAs(file).catch(() => {});
        if (fs.existsSync(file)) await testInfo.attach(`recording (${who})`, { path: file, contentType: 'video/webm' });
      }
      await video.delete().catch(() => {});
      fs.rmSync(testInfo.outputPath('.recordings-tmp'), { recursive: true, force: true });
    }
  }
}

module.exports = { loginAs, withUser };
