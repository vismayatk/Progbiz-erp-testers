'use strict';
/**
 * CH-F1 reproduction, step by step, in a visible window.
 *
 * Open an un-converted enquiry, open Add Follow-up, describe every control in
 * the modal, fill all of them, click Save while listening to the wire, the
 * console and the validation layer — then try the alternative ways a user might
 * submit (Enter, keyboard on the button) and inspect the Save button itself.
 * Finally repeat the same Save on the quotation's follow-up modal to see
 * whether the defect is specific to the enquiry page.
 *
 *   HEADED=1 node scripts/qa/repro_ch_f1.js [/enquiry-overview/<id>] [/quotation-view/<id>]
 */
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, REPO = path.join(__dirname, '..', '..');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const ENQ = process.argv[2] || '/enquiry-overview/396806', QTN = process.argv[3] || '/quotation-view/12234';
const SHOTS = path.join(REPO, 'reports', 'qa', 'shots', 'crm'); fs.mkdirSync(SHOTS, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const describeModal = () => { const clean = (x) => (x || '').replace(/\s+/g, ' ').trim();
  const m = document.querySelector('.modal.show'); if (!m) return null;
  const label = (e) => clean((e.id && m.querySelector(`label[for="${e.id}"]`)?.innerText) || e.closest('.form-group,.mb-3,.mb-2,.col,.col-md-6,.col-md-4,.col-12,div')?.querySelector('label')?.innerText || e.getAttribute('aria-label') || e.placeholder || '');
  return { title: clean(m.querySelector('.modal-title,h5,h4')?.innerText), hasForm: !!m.querySelector('form'),
    controls: [...m.querySelectorAll('input,select,textarea')].filter((e) => e.getClientRects().length && !['hidden', 'submit', 'button'].includes(e.type)).map((e) => ({ tag: e.tagName, type: e.type, id: e.id, label: label(e), required: e.required || /\*/.test(label(e)), value: e.tagName === 'SELECT' ? clean(e.options[e.selectedIndex]?.text) : e.value, options: e.tagName === 'SELECT' ? [...e.options].map((o) => clean(o.text)).slice(0, 6) : undefined })),
    buttons: [...m.querySelectorAll('button')].filter((e) => e.getClientRects().length).map((b) => ({ text: clean(b.innerText), id: b.id, type: b.type, disabled: b.disabled, blazor: [...b.attributes].filter((a) => /^_bl_|blazor|onclick/i.test(a.name)).map((a) => a.name).join(','), html: b.outerHTML.replace(/\s+/g, ' ').slice(0, 220) })),
    validation: [...m.querySelectorAll('.validation-message,.invalid-feedback,.text-danger,.validation-summary-errors,[class*="invalid"]')].map((e) => ({ text: clean(e.innerText).slice(0, 80), visible: !!e.getClientRects().length })).filter((v) => v.text),
    invalidInputs: [...m.querySelectorAll(':invalid')].map((e) => e.id || e.name || e.tagName),
    emptyRequired: [...m.querySelectorAll('input,select,textarea')].filter((e) => e.required && !e.value).map((e) => e.id || e.name) }; };
const pageState = () => ({ modalOpen: !!document.querySelector('.modal.show'), url: location.pathname,
  alert: [...document.querySelectorAll('.swal2-popup,.toast,.alert,.toastr')].map((e) => e.innerText).join(' | ').replace(/\s+/g, ' ').trim().slice(0, 160),
  errorText: /oops|went wrong|error code|exception|unhandled/i.test(document.body.innerText) });

async function fillModal(page, m) {
  const real = (loc) => loc.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() })).filter((o) => o.value && o.value !== '0' && !/^(choose|select|create new|--)/i.test(o.text)));
  const chosen = {};
  const status = m.locator('#followup-status'); if (await status.count()) { const o = await real(status); if (o.length) { await status.selectOption(o[0].value); chosen.status = o[0].text; } }
  await page.waitForTimeout(1500);
  const q = m.locator('#lead-quality'); if (await q.count()) { const o = await real(q); if (o.length) { await q.selectOption(o[0].value); chosen.leadQuality = o[0].text; } }
  // every other visible select → first real option; every empty text/number/date → something sensible
  const sels = m.locator('select:visible'); for (let i = 0; i < await sels.count(); i++) { const s = sels.nth(i); const id = await s.getAttribute('id'); if (['followup-status', 'lead-quality'].includes(id)) continue; const v = await s.inputValue().catch(() => ''); if (!v || v === '0') { const o = await real(s); if (o.length) { await s.selectOption(o[0].value).catch(() => {}); chosen[id || `select${i}`] = o[0].text; } } }
  const ins = m.locator('input:visible, textarea:visible'); for (let i = 0; i < await ins.count(); i++) { const e = ins.nth(i); const t = await e.getAttribute('type'); const id = (await e.getAttribute('id')) || `input${i}`; if (['checkbox', 'radio', 'file'].includes(t)) continue; const v = await e.inputValue().catch(() => ''); if (v) continue;
    let val = t === 'date' ? new Date(Date.now() + 864e5).toISOString().slice(0, 10) : t === 'datetime-local' ? new Date(Date.now() + 864e5).toISOString().slice(0, 16) : t === 'number' || /value|amount/i.test(id) ? '12345' : /time/i.test(id) ? '10:30' : `CH-F1 repro ${Date.now()} — safe to delete`;
    await e.fill(val).catch(() => {}); chosen[id] = val; }
  await page.waitForTimeout(1000); return chosen; }

async function trySave(page, m, how, tag) {
  const reqs = [], errs = []; const onReq = (r) => { if (/\/api\//.test(r.url()) && !/notification|negotiate|hub/i.test(r.url())) reqs.push(`${r.method()} ${r.url().split('?')[0].replace(/^.*\/api\//, '/api/')}`); };
  const onCon = (msg) => { if (msg.type() === 'error') errs.push(msg.text().slice(0, 160)); }; const onErr = (e) => errs.push('pageerror: ' + e.message.slice(0, 160));
  page.on('request', onReq); page.on('console', onCon); page.on('pageerror', onErr);
  const save = m.locator('button').filter({ hasText: /^\s*save\s*$/i }).first();
  if (how === 'click') await save.click({ timeout: 10000 }).catch((e) => errs.push('click: ' + e.message.split('\n')[0]));
  else if (how === 'keyboard') { await save.focus().catch(() => {}); await page.keyboard.press('Enter'); await page.waitForTimeout(500); await page.keyboard.press('Space'); }
  else if (how === 'enter-in-field') { await m.locator('#followup-description, textarea, input[type=text]').first().focus().catch(() => {}); await page.keyboard.press('Enter'); }
  else if (how === 'dispatch') await save.evaluate((b) => { b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }).catch(() => {});
  await page.waitForTimeout(8000);
  page.off('request', onReq); page.off('console', onCon); page.off('pageerror', onErr);
  const st = await page.evaluate(pageState); const md = await page.evaluate(describeModal);
  const shot = path.join(SHOTS, `CH-F1-${tag}-${how}.png`); await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  console.log(`    Save via ${how.padEnd(14)} → API calls: ${reqs.length ? reqs.join(', ') : 'NONE'} · modal ${st.modalOpen ? 'STILL OPEN' : 'closed'}${st.alert ? ' · alert="' + st.alert + '"' : ''}${md?.validation?.filter((v) => v.visible).length ? ' · validation=' + JSON.stringify(md.validation.filter((v) => v.visible).map((v) => v.text)) : ''}${md?.emptyRequired?.length ? ' · emptyRequired=' + JSON.stringify(md.emptyRequired) : ''}${md?.invalidInputs?.length ? ' · :invalid=' + JSON.stringify(md.invalidInputs) : ''}${errs.length ? ' · console=' + JSON.stringify(errs) : ''}${st.errorText ? ' · ERROR TEXT ON PAGE' : ''}`);
  return { how, reqs, errs, modalOpen: st.modalOpen, alert: st.alert, validation: md?.validation, emptyRequired: md?.emptyRequired, shot: path.relative(REPO, shot) }; }

async function reproOn(page, recordPath, tag) {
  console.log(`\n══ ${tag}: ${recordPath} ══`);
  await page.goto(`${BASE}${recordPath}`, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(4500);
  const heading = await page.evaluate(() => (document.querySelector('h4,h5,.card-title,.page-title')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80)); console.log(`  page: "${heading}"`);
  const btn = page.locator('#btn-add-followup'); if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) { console.log('  ⚪ #btn-add-followup not on this record'); return { skipped: true }; }
  await btn.click(); await page.waitForTimeout(3500);
  const md = await page.evaluate(describeModal); if (!md) { console.log('  ❌ modal did not open'); return { opened: false }; }
  console.log(`  modal "${md.title}" form=${md.hasForm}`); md.controls.forEach((c) => console.log(`    ${c.tag.toLowerCase().padEnd(8)} #${(c.id || '-').padEnd(22)} "${c.label}"${c.required ? ' *' : ''}${c.options ? ' opts=' + JSON.stringify(c.options) : ''}`));
  md.buttons.forEach((b) => console.log(`    button "${b.text}" id=${b.id || '-'} type=${b.type} disabled=${b.disabled} handlers=[${b.blazor}]`));
  const m = page.locator('.modal.show').first();
  const chosen = await fillModal(page, m); console.log('  filled:', JSON.stringify(chosen));
  await page.screenshot({ path: path.join(SHOTS, `CH-F1-${tag}-filled.png`) }).catch(() => {});
  const after = await page.evaluate(describeModal); console.log(`  before Save: emptyRequired=${JSON.stringify(after.emptyRequired)} :invalid=${JSON.stringify(after.invalidInputs)}`);
  console.log('  → clicking Save (watch the window)'); await pause(process.env.HEADED ? 2500 : 0);
  const attempts = [await trySave(page, m, 'click', tag)];
  if (attempts[0].modalOpen && !attempts[0].reqs.length) { attempts.push(await trySave(page, m, 'keyboard', tag)); attempts.push(await trySave(page, m, 'enter-in-field', tag)); attempts.push(await trySave(page, m, 'dispatch', tag)); }
  const saveBtn = md.buttons.find((b) => /^save$/i.test(b.text)); if (saveBtn) console.log(`  Save button HTML: ${saveBtn.html}`);
  await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(1000);
  return { opened: true, modal: md, chosen, attempts }; }

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage(); const OUT = {};
  try { await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);
    OUT.enquiry = await reproOn(page, ENQ, 'enquiry');
    OUT.quotation = await reproOn(page, QTN, 'quotation');
    // the follow-ups listing after both attempts — did anything land?
    await page.goto(`${BASE}/followups`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000); await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(2500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    const mine = rows.filter((r) => /CH-F1 repro/.test(r)); console.log(`\n  /followups: ${rows.length} rows · rows carrying today's repro text: ${mine.length}`); OUT.followupsListing = { rows: rows.length, mine };
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0].slice(0, 160)); }
  finally { if (process.env.HEADED) { console.log('\n  (window stays open 12s)'); await pause(12000); } await browser.close(); }
  fs.writeFileSync(path.join(REPO, 'reports', 'qa', 'raw', 'ch-f1-repro-lesol_test.json'), JSON.stringify(OUT, null, 2));
})();
