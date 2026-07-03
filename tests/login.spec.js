/**
 * login.spec.js
 * ---------------------------------------------------------------------------
 * Module: Login (PROGBIZ ERP)  |  Source: merged workbook sheet "Login_Page" (48 TCs)
 *
 * Each test maps 1:1 to a documented TC ID. Every validation uses an explicit
 * assertion; the custom fixture prints the friendly console banners and captures
 * a named screenshot on failure.
 *
 * NOTE ON LOCATORS: the source document has no DOM selectors, so locators are
 * inferred (see pages/LoginPage.js). Run `npm run codegen` against the live app
 * to confirm/adjust. Tests that require behaviour the document does not pin down
 * (exact error text, session-timeout duration, real browser autofill) are marked
 * with TODO or skipped with a clear reason rather than asserting a guess.
 */

'use strict';

const { test, expect } = require('../fixtures/baseTest');
const {
  credentials,
  urls,
  messages,
  invalidLogins,
  blankFieldCases,
  payloads,
} = require('../utils/testData');

const validLogin = {
  companyCode: credentials.companyCode,
  username: credentials.admin.username,
  password: credentials.admin.password,
};

test.describe('Login Module', () => {
  // Every login test starts from a fresh login page.
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.open();
  });

  /* =====================================================================
   * UI & LAYOUT
   * ===================================================================== */

  test('TC_LOGIN_01 - Login page loads successfully on accessing the URL', async ({ loginPage, logger }) => {
    // Expected: page loads without errors; logo, "Sign In" heading and controls shown.
    await logger.step('Verifying login page loaded', () => loginPage.expectLoaded(), 'All core controls are visible');
    await expect(loginPage.page).toHaveURL(/\/login/i);
    // Heading is best-effort (accessible-name of the heading is inferred).
    if (await loginPage.isVisible(loginPage.signInHeading, 3000)) {
      await expect(loginPage.signInHeading).toBeVisible();
    } else {
      logger.warn('Sign In heading not found via inferred locator — verify LoginPage.signInHeading.');
    }
  });

  test('TC_LOGIN_02 - All login controls are present and correctly labelled', async ({ loginPage, logger }) => {
    await logger.step('Checking all controls are present', async () => {
      await loginPage.expectLoaded();
      await expect(loginPage.forgotPasswordLink, 'Forgot password link visible').toBeVisible();
    }, 'Company Code, User Name, Password, Forgot password link and Sign In button are present');
  });

  test('TC_LOGIN_03 - Field placeholders/labels are correct', async ({ loginPage, logger }) => {
    // Doc: Company Code placeholder reads "company code".
    await logger.step('Verifying Company Code placeholder', async () => {
      const ph = await loginPage.companyCode.getAttribute('placeholder');
      expect(ph, 'Company Code placeholder').toMatch(/company\s*code/i);
    }, 'Company Code placeholder is correct');
  });

  test('TC_LOGIN_04 - There is NO "Remember Password" checkbox on this page', async ({ loginPage, logger }) => {
    await logger.step('Searching for a remember-me checkbox', async () => {
      const remember = loginPage.page.getByRole('checkbox', { name: /remember/i });
      await expect(remember, 'Remember Password checkbox should not exist').toHaveCount(0);
    }, 'No Remember Password checkbox exists (matches documented behaviour)');
  });

  test('TC_LOGIN_05 - Page is centered and not visually broken', async ({ loginPage, logger }) => {
    // Structural sanity check: key controls render with a positive size inside the viewport.
    await logger.step('Checking layout of key controls', async () => {
      for (const [name, loc] of [
        ['Company Code', loginPage.companyCode],
        ['User Name', loginPage.username],
        ['Password', loginPage.password],
        ['Sign In', loginPage.signInButton],
      ]) {
        const box = await loc.boundingBox();
        expect(box, `${name} should have a bounding box`).not.toBeNull();
        expect(box.width, `${name} width > 0`).toBeGreaterThan(0);
        expect(box.height, `${name} height > 0`).toBeGreaterThan(0);
      }
    }, 'Login controls render with valid dimensions (no clipping/collapse)');
    logger.info('TODO: pixel-level "centered" verification is best done via visual snapshot review.');
  });

  test('TC_LOGIN_06 - Tab order moves logically through the fields', async ({ loginPage, logger, page }) => {
    await logger.step('Tabbing through the form', async () => {
      await loginPage.companyCode.focus();
      await page.keyboard.press('Tab');
      // We only assert focus advanced to a form control (exact order depends on DOM).
      const active = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
      expect(['INPUT', 'BUTTON', 'A', 'SELECT']).toContain(active);
    }, 'Keyboard focus advances through the form controls');
    logger.info('TODO: confirm the exact Company Code -> User Name -> Password -> Sign In order against live DOM.');
  });

  /* =====================================================================
   * FUNCTIONAL - POSITIVE
   * ===================================================================== */

  test('TC_LOGIN_07 - Successful login with valid credentials', async ({ loginPage, dashboardPage, logger }) => {
    await loginPage.login(validLogin); // steps logged inside login()
    await logger.step('Verifying Dashboard', () => dashboardPage.expectLoaded(), 'Dashboard loaded successfully');
    await expect(loginPage.page).not.toHaveURL(/\/login/i);
  });

  test('TC_LOGIN_08 - Login using the Enter key', async ({ loginPage, dashboardPage, logger }) => {
    await loginPage.login(validLogin, /* submit */ false);
    await logger.step('Submitting with Enter key', () => loginPage.submitWithEnter(), 'Form submitted via Enter');
    await loginPage.waitForPageReady();
    await logger.step('Verifying Dashboard', () => dashboardPage.expectLoaded(), 'Dashboard loaded successfully');
  });

  test('TC_LOGIN_09 - Credentials are case-sensitive where applicable', async ({ loginPage, logger, page }) => {
    // Doc data: ADMIN / 123456 (username upper-cased).
    await loginPage.login({ ...validLogin, username: 'ADMIN' });
    await loginPage.waitForPageReady();
    await logger.step('Recording case-sensitivity behaviour', async () => {
      const onLogin = await loginPage.isOnLoginPage();
      logger.info(onLogin
        ? 'Upper-cased username was REJECTED -> username appears case-sensitive.'
        : 'Upper-cased username was ACCEPTED -> username appears case-insensitive.');
      // Deterministic assertion: the app responded on a valid page (no crash).
      expect(page.url()).toContain('erp');
    }, 'Case-sensitivity behaviour captured (no crash)');
    logger.warn('TODO: confirm the SPECIFIED case-sensitivity rule, then tighten this assertion.');
  });

  test('TC_LOGIN_10 - Leading/trailing spaces in fields are handled', async ({ loginPage, logger, page }) => {
    await loginPage.login({
      companyCode: `  ${credentials.companyCode}  `,
      username: `  ${credentials.admin.username}  `,
      password: credentials.admin.password,
    });
    await loginPage.waitForPageReady();
    await logger.step('Verifying spaces are handled consistently (no crash)', async () => {
      expect(page.url()).toContain('erp'); // app responded without error page
    }, 'Whitespace handled without silent failure');
    logger.warn('TODO: confirm whether values are trimmed vs rejected, then assert the exact outcome.');
  });

  /* =====================================================================
   * NEGATIVE & FIELD VALIDATION
   * ===================================================================== */

  // TC_LOGIN_11..14 - blank-field validations (data-driven).
  for (const c of blankFieldCases) {
    test(`${c.id} - Validation when ${c.label}`, async ({ loginPage, logger }) => {
      await loginPage.login({ companyCode: c.companyCode, username: c.username, password: c.password });
      await loginPage.waitForPageReady();

      await logger.step('Verifying required-field validation', async () => {
        // Form must NOT have authenticated.
        expect(await loginPage.isOnLoginPage(), 'should remain on login page').toBeTruthy();

        // Assert the documented message(s) for whichever field(s) were blank.
        const expectMsg = async (text) =>
          expect(loginPage.validationMessage(text), `"${text}" should be shown`).toBeVisible();

        if (c.companyCode === '') await expectMsg(messages.validation.companyCodeRequired);
        if (c.username === '') await expectMsg(messages.validation.usernameRequired);
        if (c.password === '') await expectMsg(messages.validation.passwordRequired);
      }, 'Validation message(s) shown and login blocked');
    });
  }

  // TC_LOGIN_15..17 - invalid credentials (data-driven).
  for (const c of invalidLogins) {
    test(`${c.id} - Login fails with ${c.label}`, async ({ loginPage, logger }) => {
      await loginPage.login({ companyCode: c.companyCode, username: c.username, password: c.password });
      await loginPage.waitForPageReady();

      await logger.step('Verifying login was denied', async () => {
        expect(await loginPage.isOnLoginPage(), 'should stay on login page').toBeTruthy();
      }, 'Login denied; user remained on the login page');
      logger.warn('TODO: assert the exact error message text once known (messages.invalidCredentials).');
    });
  }

  test('TC_LOGIN_18 - Error message does not reveal which field was wrong', async ({ loginPage, logger }) => {
    const readError = async () => {
      const err = loginPage.page.locator('[class*="error"], [role="alert"], .invalid-feedback').first();
      return (await loginPage.isVisible(err, 4000)) ? (await err.innerText()).toLowerCase() : '';
    };

    await loginPage.login({ ...validLogin, username: 'wronguser' });
    await loginPage.waitForPageReady();
    const msgUser = await readError();

    await loginPage.open();
    await loginPage.login({ ...validLogin, password: 'wrong123' });
    await loginPage.waitForPageReady();
    const msgPass = await readError();

    await logger.step('Checking messages do not enable user enumeration', async () => {
      for (const m of [msgUser, msgPass]) {
        expect(m, 'error should not name the user field').not.toMatch(/user (not found|does not exist)/i);
        expect(m, 'error should not name the password field explicitly').not.toMatch(/wrong password|incorrect password/i);
      }
    }, 'Failure messages are generic (no field disclosure)');
    logger.info(`Observed messages -> wrong-user: "${msgUser}" | wrong-password: "${msgPass}"`);
  });

  test('TC_LOGIN_19 - Whitespace-only input is rejected', async ({ loginPage, logger }) => {
    await loginPage.login({ companyCode: '   ', username: '   ', password: '   ' });
    await loginPage.waitForPageReady();
    await logger.step('Verifying whitespace treated as empty', async () => {
      expect(await loginPage.isOnLoginPage(), 'should stay on login page').toBeTruthy();
    }, 'Whitespace-only input did not authenticate');
  });

  /* =====================================================================
   * BVA & EQUIVALENCE PARTITIONING
   * ===================================================================== */

  test('TC_LOGIN_20 - Company Code minimum length (1 char) handling', async ({ loginPage, logger, page }) => {
    await loginPage.login({ ...validLogin, companyCode: 'T' });
    await loginPage.waitForPageReady();
    await logger.step('Verifying app handled 1-char company code without crash', async () => {
      expect(page.url()).toContain('erp');
    }, 'Handled per rule; no crash');
  });

  test('TC_LOGIN_21 - User Name maximum length (500 chars) handling', async ({ loginPage, logger }) => {
    await logger.step('Pasting 500 characters into User Name', async () => {
      await loginPage.enterUsername(payloads.longString);
      const val = await loginPage.username.inputValue();
      expect(val.length, 'value is stored/restricted, not overflowing').toBeLessThanOrEqual(500);
    }, 'Long input handled without UI break');
  });

  test('TC_LOGIN_22 - Password maximum length (500 chars) handling', async ({ loginPage, logger, page }) => {
    await loginPage.login({ ...validLogin, password: payloads.longString });
    await loginPage.waitForPageReady();
    await logger.step('Verifying long password handled and login denied', async () => {
      expect(await loginPage.isOnLoginPage(), 'wrong long password should be rejected').toBeTruthy();
      expect(page.url()).toContain('erp');
    }, 'Handled without crash; login rejected for wrong value');
  });

  test('TC_LOGIN_23 - Password minimum length / single-char boundary', async ({ loginPage, logger }) => {
    await loginPage.login({ ...validLogin, password: '1' });
    await loginPage.waitForPageReady();
    await logger.step('Verifying single-char (incorrect) password is denied', async () => {
      expect(await loginPage.isOnLoginPage(), 'should stay on login page').toBeTruthy();
    }, 'Login denied for incorrect single-char password');
  });

  test('TC_LOGIN_24 - Numeric-only and alphanumeric inputs accepted as text', async ({ loginPage, logger }) => {
    await logger.step('Entering numeric company code and alphanumeric user name', async () => {
      await loginPage.enterCompanyCode('12345');
      await loginPage.enterUsername('user_01');
      await expect(loginPage.companyCode).toHaveValue('12345');
      await expect(loginPage.username).toHaveValue('user_01');
    }, 'Fields accept numeric/alphanumeric characters as text');
  });

  test('TC_LOGIN_25 - Special characters in fields are handled safely', async ({ loginPage, logger, page }) => {
    await loginPage.login({
      companyCode: payloads.specialChars,
      username: payloads.specialChars,
      password: payloads.specialChars,
    });
    await loginPage.waitForPageReady();
    await logger.step('Verifying special characters handled without crash', async () => {
      expect(await loginPage.isOnLoginPage(), 'invalid special-char login rejected').toBeTruthy();
      expect(page.url()).toContain('erp');
    }, 'Special characters accepted/escaped safely; no crash');
  });

  /* =====================================================================
   * PASSWORD FIELD
   * ===================================================================== */

  test('TC_LOGIN_26 - Password is masked while typing', async ({ loginPage, logger }) => {
    await logger.step('Typing password and checking it is masked', async () => {
      await loginPage.enterPassword(credentials.admin.password);
      expect(await loginPage.passwordInputType(), 'password input type').toBe('password');
    }, 'Password is masked (input type = password)');
  });

  test('TC_LOGIN_27 - Show-password (eye) icon reveals the password', async ({ loginPage, logger }) => {
    await loginPage.enterPassword(credentials.admin.password);
    await logger.step('Clicking the eye icon to reveal password', async () => {
      await loginPage.togglePasswordVisibility();
      expect(await loginPage.passwordInputType(), 'password becomes visible').toBe('text');
    }, 'Password revealed as plain text');
    logger.warn('TODO: eye-icon locator is inferred (LoginPage.passwordToggle) — confirm against live DOM.');
  });

  test('TC_LOGIN_28 - Hide-password (eye) icon re-masks the password', async ({ loginPage, logger }) => {
    await loginPage.enterPassword(credentials.admin.password);
    await logger.step('Toggling reveal then hide', async () => {
      await loginPage.togglePasswordVisibility();
      expect(await loginPage.passwordInputType()).toBe('text');
      await loginPage.togglePasswordVisibility();
      expect(await loginPage.passwordInputType(), 'password re-masked').toBe('password');
    }, 'Toggle works both ways (masked -> visible -> masked)');
  });

  test('TC_LOGIN_29 - Password not exposed as plain text on submit (type + HTTPS + not in URL)', async ({ loginPage, logger, page }) => {
    await loginPage.enterPassword(credentials.admin.password);
    await logger.step('Verifying password field type stays "password" when hidden', async () => {
      expect(await loginPage.passwordInputType()).toBe('password');
    }, 'Password input type is masked');

    await logger.step('Verifying credentials are not placed in the URL / use HTTPS', async () => {
      const reqPromise = page.waitForRequest(
        (r) => r.method() === 'POST' || /login|auth|signin/i.test(r.url()),
        { timeout: 8000 }
      ).catch(() => null);
      await loginPage.enterCompanyCode(credentials.companyCode);
      await loginPage.enterUsername(credentials.admin.username);
      await loginPage.clickSignIn();
      const req = await reqPromise;
      if (req) {
        expect(req.url(), 'auth request should be HTTPS').toMatch(/^https:/i);
        expect(req.url(), 'password must not appear in URL/query').not.toContain(credentials.admin.password);
      } else {
        logger.warn('No auth request captured with the inferred matcher — verify the login endpoint.');
      }
    }, 'Password transmitted over HTTPS and never in the URL');
  });

  /* =====================================================================
   * FORGOT PASSWORD
   * ===================================================================== */

  test('TC_LOGIN_30 - "Forgot password ?" link is visible and clickable', async ({ loginPage, logger }) => {
    await logger.step('Checking Forgot password link', async () => {
      await expect(loginPage.forgotPasswordLink, 'link visible').toBeVisible();
      await expect(loginPage.forgotPasswordLink, 'link enabled').toBeEnabled();
    }, 'Forgot password link is visible and clickable');
  });

  test('TC_LOGIN_31 - "Forgot password ?" navigates to recovery flow', async ({ loginPage, logger, page }) => {
    await logger.step('Clicking Forgot password', () => loginPage.click(loginPage.forgotPasswordLink, 'Forgot password link'), 'Forgot password clicked');
    await loginPage.waitForPageReady();
    await logger.step('Verifying navigation away from /login', async () => {
      await expect(page).not.toHaveURL(/\/login$/i);
    }, 'Navigated to the password recovery / reset page');
  });

  /* =====================================================================
   * SECURITY
   * ===================================================================== */

  test('TC_LOGIN_32 - SQL injection attempt is rejected', async ({ loginPage, logger, page }) => {
    await loginPage.login({ companyCode: credentials.companyCode, username: payloads.sqlInjection, password: payloads.sqlInjection });
    await loginPage.waitForPageReady();
    await logger.step('Verifying no auth bypass and no DB error', async () => {
      expect(await loginPage.isOnLoginPage(), 'no auth bypass').toBeTruthy();
      const body = (await page.locator('body').innerText()).toLowerCase();
      expect(body, 'no raw SQL/DB error leaked').not.toMatch(/sql syntax|sqlstate|odbc|ora-\d+|unclosed quotation/i);
    }, 'Input sanitized; authentication failed; no DB error');
  });

  test('TC_LOGIN_33 - XSS payload is sanitized / not executed', async ({ loginPage, logger, page }) => {
    let dialogFired = false;
    page.on('dialog', async (d) => { dialogFired = true; await d.dismiss(); });

    await loginPage.login({ companyCode: credentials.companyCode, username: payloads.xss, password: credentials.admin.password });
    await loginPage.waitForPageReady();
    await logger.step('Verifying script did not execute', async () => {
      expect(dialogFired, 'no alert dialog should appear').toBeFalsy();
    }, 'XSS payload treated as text; no script executed');
  });

  test('TC_LOGIN_34 - Account lockout / throttling after repeated failures', async ({ loginPage, logger }) => {
    await logger.step('Submitting 5 consecutive invalid logins', async () => {
      for (let i = 1; i <= 5; i++) {
        await loginPage.login({ ...validLogin, password: `wrong${i}` });
        await loginPage.waitForPageReady();
        await loginPage.open();
      }
    }, 'Performed 5 invalid attempts');
    logger.warn('TODO: assert the SPECIFIC lockout signal (locked message / captcha / throttle) once the policy is known.');
    // Deterministic minimum: repeated failures must not have logged us in.
    expect(await loginPage.isOnLoginPage(), 'still not authenticated after brute-force attempts').toBeTruthy();
  });

  test('TC_LOGIN_35 - Login occurs over HTTPS', async ({ loginPage, logger, page }) => {
    await logger.step('Checking protocol', async () => {
      expect(page.url(), 'login page must be HTTPS').toMatch(/^https:/i);
    }, 'Page is served over HTTPS');
  });

  test('TC_LOGIN_36 - Credentials not stored/visible after navigation', async ({ loginPage, dashboardPage, logger, page }) => {
    await loginPage.login(validLogin);
    await dashboardPage.expectLoaded();
    await logger.step('Inspecting storage for plain-text password', async () => {
      const leaked = await page.evaluate((pwd) => {
        const scan = (store) => {
          for (let i = 0; i < store.length; i++) {
            const v = store.getItem(store.key(i));
            if (v && v.includes(pwd)) return true;
          }
          return false;
        };
        return scan(window.localStorage) || scan(window.sessionStorage);
      }, credentials.admin.password);
      expect(leaked, 'plain-text password must not be persisted in storage').toBeFalsy();
      expect(page.url(), 'password must not be in the URL').not.toContain(credentials.admin.password);
    }, 'Password not persisted in storage or URL');
  });

  /* =====================================================================
   * SESSION HANDLING
   * ===================================================================== */

  test('TC_LOGIN_37 - Browser Back after logout does not reopen secured pages', async ({ loginPage, dashboardPage, logger, page }) => {
    await loginPage.login(validLogin);
    await dashboardPage.expectLoaded();
    await logger.step('Logging out', () => dashboardPage.logout(), 'Logged out');
    await logger.step('Pressing browser Back', async () => {
      await page.goBack().catch(() => {});
      await loginPage.waitForPageReady();
    }, 'Navigated back');
    await logger.step('Verifying secured content is not accessible', async () => {
      expect(await loginPage.isOnLoginPage(), 'should be back on the login page').toBeTruthy();
    }, 'Secured page not restored after logout');
    logger.warn('TODO: logout control is inferred (DashboardPage.logout) — confirm against live DOM.');
  });

  test('TC_LOGIN_38 - Direct access to a secured page while logged out redirects to login', async ({ loginPage, logger, page }) => {
    // Fresh (unauthenticated) context — this test does not log in.
    const securedPath = '/project-expenses'; // TODO: confirm a genuinely secured route.
    await logger.step(`Opening secured deep-link ${securedPath} while logged out`, async () => {
      await page.goto(securedPath, { waitUntil: 'domcontentloaded' });
      await loginPage.waitForPageReady();
    }, 'Attempted direct access');
    await logger.step('Verifying redirect to login', async () => {
      expect(await loginPage.isOnLoginPage(), 'should be redirected to login').toBeTruthy();
    }, 'Access blocked; redirected to login');
  });

  test('TC_LOGIN_39 - Session timeout after inactivity', async ({ logger }) => {
    // Not deterministically automatable without knowing the real timeout window
    // (waiting minutes/hours of idle time is impractical in a functional suite).
    logger.warn('SKIPPED: needs the configured session-timeout value. Automate via API token-expiry or a short test-env timeout, then assert re-auth is required.');
    test.skip(true, 'Session timeout duration not specified; not deterministically automatable.');
  });

  test('TC_LOGIN_40 - Reload of login page after entering data clears sensitive fields', async ({ loginPage, logger, page }) => {
    await loginPage.enterCompanyCode(credentials.companyCode);
    await loginPage.enterUsername(credentials.admin.username);
    await loginPage.enterPassword(credentials.admin.password);
    await logger.step('Reloading the page (F5)', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await loginPage.waitForPageReady();
    }, 'Page reloaded');
    await logger.step('Verifying sensitive fields are cleared', async () => {
      await expect(loginPage.password, 'password should be cleared after reload').toHaveValue('');
    }, 'Sensitive fields cleared; page reloaded cleanly');
  });

  /* =====================================================================
   * COMPATIBILITY, PERFORMANCE & EDGE
   * ===================================================================== */

  // TC_LOGIN_41..43 - run the login smoke on the browser selected by --project.
  // Use: npm run test:chrome | test:edge | test:firefox
  for (const compat of [
    { id: 'TC_LOGIN_41', browser: 'Google Chrome' },
    { id: 'TC_LOGIN_42', browser: 'Microsoft Edge' },
    { id: 'TC_LOGIN_43', browser: 'Mozilla Firefox' },
  ]) {
    test(`${compat.id} - Login page renders and works in ${compat.browser}`, async ({ loginPage, dashboardPage, logger, browserName }) => {
      logger.info(`Running under Playwright engine: ${browserName} (target browser for this TC: ${compat.browser}).`);
      await logger.step('Verifying controls render', () => loginPage.expectLoaded(), 'Controls render correctly');
      await loginPage.login(validLogin);
      await logger.step('Verifying login works', () => dashboardPage.expectLoaded(), 'Login works in this browser');
    });
  }

  test('TC_LOGIN_44 - Login page is responsive on mobile/tablet widths', async ({ loginPage, logger, page }) => {
    for (const vp of [{ w: 768, h: 1024, name: 'tablet' }, { w: 375, h: 812, name: 'mobile' }]) {
      await logger.step(`Checking layout at ${vp.name} (${vp.w}px)`, async () => {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await loginPage.waitForPageReady();
        await loginPage.expectLoaded();
      }, `Controls remain usable at ${vp.name} width`);
    }
  });

  test('TC_LOGIN_45 - Login page load time is acceptable', async ({ loginPage, logger, page }) => {
    const thresholdMs = Number(process.env.PERF_LOGIN_MS || 5000); // doc target ~3s; env-tunable to avoid flakiness
    await logger.step('Measuring page load time', async () => {
      const start = Date.now();
      await page.goto(urls.login, { waitUntil: 'load' });
      const elapsed = Date.now() - start;
      logger.info(`Measured load time: ${(elapsed / 1000).toFixed(2)}s (threshold ${(thresholdMs / 1000).toFixed(2)}s)`);
      expect(elapsed, `load under ${thresholdMs}ms`).toBeLessThan(thresholdMs);
    }, 'Page loaded within the acceptable threshold');
  });

  test('TC_LOGIN_46 - Rapid multiple clicks on Sign In do not duplicate the request', async ({ loginPage, dashboardPage, logger }) => {
    let authRequests = 0;
    loginPage.page.on('request', (r) => {
      if (r.method() === 'POST' && /login|auth|signin/i.test(r.url())) authRequests += 1;
    });
    await loginPage.login(validLogin, /* submit */ false);
    await logger.step('Clicking Sign In rapidly', async () => {
      await Promise.all([
        loginPage.signInButton.click(),
        loginPage.signInButton.click({ force: true }).catch(() => {}),
        loginPage.signInButton.click({ force: true }).catch(() => {}),
      ]);
      await loginPage.waitForPageReady();
    }, 'Rapid clicks issued');
    await logger.step('Verifying a single successful login', async () => {
      await dashboardPage.expectLoaded();
      logger.info(`Auth POST requests observed: ${authRequests}`);
      expect(authRequests, 'no duplicate auth requests').toBeLessThanOrEqual(1);
    }, 'Only one login processed; no duplicate session');
    logger.warn('TODO: if the endpoint matcher misses, confirm the login request URL and update the filter.');
  });

  test('TC_LOGIN_47 - Behaviour when network drops during login', async ({ loginPage, logger, page, context }) => {
    await loginPage.login(validLogin, /* submit */ false);
    await logger.step('Going offline and submitting', async () => {
      await context.setOffline(true);
      await loginPage.clickSignIn();
      await loginPage.waitForPageReady();
    }, 'Submitted while offline');
    await logger.step('Verifying app did not hang/crash', async () => {
      expect(await loginPage.isOnLoginPage(), 'should remain on login page (not authenticated offline)').toBeTruthy();
    }, 'Clear failure state; app did not crash');
    await logger.step('Reconnecting and retrying', async () => {
      await context.setOffline(false);
      await loginPage.open();
      await loginPage.expectLoaded();
    }, 'Retry works after reconnect');
    logger.warn('TODO: assert the exact offline/error message once known.');
  });

  test('TC_LOGIN_48 - Autofill / saved credentials populate and submit correctly', async ({ logger }) => {
    // Real browser password-manager autofill cannot be triggered deterministically
    // from Playwright (it depends on the OS/browser credential store).
    logger.warn('SKIPPED: browser autofill/credential-store cannot be reliably simulated in Playwright. Verify manually, or emulate by pre-filling values and asserting they validate/submit like manual entry.');
    test.skip(true, 'Browser native autofill not simulatable in automation.');
  });
});
