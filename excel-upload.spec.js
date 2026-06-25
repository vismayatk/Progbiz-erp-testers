// Excel Upload module — functional / UI / validation / usability suite.
// Each scenario: selects branch, sets the file on the real <input type=file>, clicks Upload,
// captures the live /api/data-upload/upload-data-file response, the SweetAlert toast,
// the history-grid outcome, and a screenshot. Results are appended for the QA report.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { PAGES, BRANCH_LABEL } = require('../utils/pages');
const { scenariosForPage } = require('../utils/testFiles');
const results = require('../utils/results');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const SHOTS = path.join(__dirname, '..', 'artifacts', 'screenshots');
const UPLOAD_API = '/api/data-upload/upload-data-file';

fs.mkdirSync(SHOTS, { recursive: true });

// ---- helpers ---------------------------------------------------------------

async function gotoUploadPage(page, cfg) {
  // NOTE: do NOT wait for 'networkidle' — this Blazor/SignalR app never goes idle.
  await page.goto(cfg.path, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // Wait for the upload form to render (file input or Upload button), best effort.
  await page.locator('input[type=file], button:has-text("Upload")').first()
    .waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1000); // small settle for branch options to populate
}

async function selectBranch(page, label) {
  const sel = page.locator('select').first();
  if (await sel.count()) {
    try { await sel.selectOption({ label }); return true; } catch { /* option may be absent */ }
  }
  return false;
}

async function dismissModal(page) {
  const ok = page.locator('.swal2-confirm');
  if (await ok.count()) await ok.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function readToast(page) {
  let title = '', msg = '';
  if (await page.locator('.swal2-popup').count()) {
    title = (await page.locator('.swal2-title').innerText().catch(() => '')).trim();
    msg = (await page.locator('.swal2-html-container').innerText().catch(() => '')).trim();
  }
  return { title, msg };
}

async function readInlineValidation(page) {
  const texts = [];
  for (const re of [/choose branch/i, /select an excel/i, /required/i]) {
    const loc = page.getByText(re).first();
    if (await loc.count()) texts.push((await loc.innerText().catch(() => '')).trim());
  }
  return texts.filter(Boolean).join(' | ');
}

// Reads the top (newest) row of the upload-history grid: { status, errors, file }
async function readLatestHistory(page) {
  try {
    const row = page.locator('table tbody tr').first();
    if (!(await row.count())) return null;
    const cells = row.locator('td');
    const n = await cells.count();
    if (n < 6) return null;
    const file = (await cells.nth(3).innerText().catch(() => '')).trim();
    const status = (await cells.nth(4).innerText().catch(() => '')).trim();
    const errors = (await cells.nth(5).innerText().catch(() => '')).trim();
    return { file, status, errors };
  } catch { return null; }
}

/**
 * Performs one upload scenario and records the outcome.
 * @param {import('@playwright/test').Page} page
 * @param {object} cfg page config
 * @param {object} sc  scenario {name,file,type,expect,note}
 * @param {object} opts {branch:boolean=true, file:boolean=true, expectRequest:boolean=true}
 */
async function runScenario(page, cfg, sc, opts = {}) {
  const o = { branch: true, file: true, expectRequest: true, ...opts };
  await gotoUploadPage(page, cfg);

  if (o.branch) await selectBranch(page, BRANCH_LABEL);
  else await selectBranch(page, 'Choose').catch(() => {}); // force "no branch"

  if (o.file) {
    const input = page.locator('input[type=file]').first();
    await input.setInputFiles(sc.file);
  }

  const uploadBtn = page.getByRole('button', { name: 'Upload', exact: true });

  let resp = null;
  try {
    [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(UPLOAD_API) && r.request().method() === 'POST',
        { timeout: o.expectRequest ? 30_000 : 7_000 }
      ),
      uploadBtn.click(),
    ]);
  } catch {
    // No network request (e.g. blocked by client-side validation).
  }

  // Wait briefly for the result modal to render.
  await page.locator('.swal2-popup').waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});

  const toast = await readToast(page);
  const inline = await readInlineValidation(page);

  const shotName = `${cfg.key}__${sc.name}.png`;
  const shotPath = path.join(SHOTS, shotName);
  await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});

  const httpStatus = resp ? resp.status() : null;
  let body = '';
  if (resp) body = (await resp.text().catch(() => '')).slice(0, 600);
  let apiMessage = '';
  try { apiMessage = JSON.parse(body).responseMessage || ''; } catch { /* ignore */ }

  await dismissModal(page);
  // Re-read history after the modal closes (grid refreshes on success path).
  const history = await readLatestHistory(page);

  // ---- verdict ----
  const errorsCount = history && /^\d+$/.test(history.errors) ? parseInt(history.errors, 10) : null;
  const rejectedSomehow =
    (httpStatus != null && httpStatus >= 400) ||
    (errorsCount != null && errorsCount > 0) ||
    /error|fail|invalid|no data|wrong|contact support/i.test(toast.title + ' ' + toast.msg + ' ' + apiMessage);
  const clientBlocked = !resp && (inline.length > 0 || /select an excel|choose branch/i.test(toast.title + ' ' + toast.msg));

  let verdict = 'INFO';
  if (sc.expect === 'success') verdict = httpStatus === 200 ? 'PASS' : 'FAIL';
  else if (sc.expect === 'reject') verdict = rejectedSomehow ? 'PASS' : 'FAIL';
  else if (sc.expect === 'clientBlock') verdict = clientBlocked ? 'PASS' : 'FAIL';
  else verdict = 'INFO';

  // Misleading success toast: API/toast says success but the row actually has errors.
  const misleadingSuccess =
    httpStatus === 200 &&
    /done|success/i.test(toast.title + ' ' + toast.msg + ' ' + apiMessage) &&
    errorsCount != null && errorsCount > 0;

  results.appendResult({
    page: cfg.title,
    pageKey: cfg.key,
    scenario: sc.name,
    note: sc.note,
    expect: sc.expect,
    httpStatus,
    apiMessage,
    toast: [toast.title, toast.msg].filter(Boolean).join(' — '),
    inlineValidation: inline,
    history,
    verdict,
    misleadingSuccess,
    screenshot: path.join('screenshots', shotName),
    ts: new Date().toISOString(),
  });

  return { verdict, httpStatus, toast, history, misleadingSuccess };
}

// ---- tests -----------------------------------------------------------------

for (const cfg of PAGES) {
  test.describe(cfg.title, () => {
    if (!cfg.expectForm) {
      // Project Upload — verify the form renders at all.
      test(`${cfg.key} :: upload form should render`, async ({ page }) => {
        await gotoUploadPage(page, cfg);
        const inputs = await page.locator('input[type=file]').count();
        const uploadBtn = await page.getByRole('button', { name: 'Upload', exact: true }).count();
        const shotName = `${cfg.key}__form-render.png`;
        await page.screenshot({ path: path.join(SHOTS, shotName), fullPage: true }).catch(() => {});
        const ok = inputs > 0 && uploadBtn > 0;
        results.appendResult({
          page: cfg.title, pageKey: cfg.key, scenario: 'form-render',
          note: 'Upload form (branch + file + button) should be present',
          expect: 'formPresent', httpStatus: null, apiMessage: '',
          toast: '', inlineValidation: '',
          history: { fileInputs: inputs, uploadButtons: uploadBtn },
          verdict: ok ? 'PASS' : 'FAIL', misleadingSuccess: false,
          screenshot: path.join('screenshots', shotName), ts: new Date().toISOString(),
        });
        expect.soft(inputs, 'file input should exist').toBeGreaterThan(0);
      });
      return;
    }

    // Build scenario list (also (re)writes fixture files — idempotent).
    const scenarios = scenariosForPage(cfg, FIXTURES);

    // Client-side validation tests
    test(`${cfg.key} :: client validation — no branch selected`, async ({ page }) => {
      const sc = { name: 'no_branch', file: scenarios[0].file, expect: 'clientBlock', note: 'Upload with file but Branch=Choose' };
      const r = await runScenario(page, cfg, sc, { branch: false, file: true, expectRequest: false });
      expect.soft(['PASS', 'INFO']).toContain(r.verdict);
    });

    test(`${cfg.key} :: client validation — no file selected`, async ({ page }) => {
      const sc = { name: 'no_file', file: null, expect: 'clientBlock', note: 'Upload with branch but no file' };
      const r = await runScenario(page, cfg, sc, { branch: true, file: false, expectRequest: false });
      expect.soft(['PASS', 'INFO']).toContain(r.verdict);
    });

    // Data scenarios (Section C valid + Section D invalid)
for (const [index, sc] of scenarios.entries()) {
  test(`${cfg.key} :: ${index + 1} :: ${sc.name} (${sc.expect})`, async ({ page }) => {
    const r = await runScenario(page, cfg, sc);

    // We do not hard-fail invalid scenarios; the report captures everything.
    // We DO assert the valid path, since that is the core feature.
    if (sc.expect === 'success') {
      expect.soft(
        r.httpStatus,
        `valid upload should return 200 (got ${r.httpStatus})`
      ).toBe(200);
   }
      });
    }
  });
}