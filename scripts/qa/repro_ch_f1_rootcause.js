'use strict';
/**
 * CH-F1 root-cause probe (visible window).
 *   1. Fill the Add FollowUp modal, click the REAL Save (#btn-save-followup),
 *      listen to wire + console (Chrome reports "invalid form control … not
 *      focusable" when a hidden required field blocks a submit).
 *   2. Inspect the hidden #next-followup-date: required? why hidden? which
 *      status reveals it?
 *   3. Pick a status that reveals the date, fill it, Save → does it POST?
 *   4. Back on a status that hides it: drop `required` from the hidden input
 *      (client-side only, diagnostic) → Save → does it POST?
 *
 *   HEADED=1 node scripts/qa/repro_ch_f1_rootcause.js [/enquiry-overview/<id>]
 */
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, REPO = path.join(__dirname, '..', '..');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const ENQ = process.argv[2] || '/enquiry-overview/396806';
const SHOTS = path.join(REPO, 'reports', 'qa', 'shots', 'crm'); fs.mkdirSync(SHOTS, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms)); const OUT = { steps: [] };

const dateInfo = () => { const e = document.querySelector('#next-followup-date'); if (!e) return { present: false };
  let h = e, hiddenBy = null; while (h && h !== document.body) { const s = getComputedStyle(h); if (s.display === 'none' || s.visibility === 'hidden') { hiddenBy = `${h.tagName}${h.id ? '#' + h.id : ''}.${String(h.className).split(' ').slice(0, 3).join('.')} (${s.display === 'none' ? 'display:none' : 'visibility:hidden'})`; break; } h = h.parentElement; }
  return { present: true, visible: !!e.getClientRects().length, required: e.required, value: e.value, type: e.type, hiddenBy, html: e.outerHTML.replace(/\s+/g, ' ').slice(0, 200), label: (e.closest('.form-group,.mb-3,.col,div')?.querySelector('label')?.innerText || '').trim() }; };
const invalids = () => [...document.querySelectorAll('.modal.show :invalid')].map((e) => `${e.tagName.toLowerCase()}#${e.id || e.name || '?'}${e.getClientRects().length ? '' : '(hidden)'}`);
const state = () => ({ modalOpen: !!document.querySelector('.modal.show'), alert: [...document.querySelectorAll('.swal2-popup,.toast,.alert')].map((e) => e.innerText).join(' | ').replace(/\s+/g, ' ').trim().slice(0, 160), validation: [...document.querySelectorAll('.modal.show .validation-message, .modal.show .invalid-feedback, .modal.show .text-danger')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 5) });

async function openModal(page) { await page.goto(`${BASE}${ENQ}`, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(4000);
  await page.locator('#btn-add-followup').click(); await page.waitForTimeout(3000); return page.locator('.modal.show').first(); }
async function setStatus(page, m, text) { const s = m.locator('#followup-status'); const v = await s.locator('option').evaluateAll((os, t) => os.find((o) => o.textContent.trim() === t)?.value, text); if (v == null) return false; await s.selectOption(v); await page.waitForTimeout(1500);
  const q = m.locator('#lead-quality'); if (await q.count()) { const qv = await q.locator('option').evaluateAll((os) => os.find((o) => o.value && o.value !== '0' && !/^(choose|create)/i.test(o.textContent.trim()))?.value); if (qv) await q.selectOption(qv); } return true; }
async function save(page, m, label) { const reqs = [], con = [];
  const onReq = (r) => { if (/\/api\//.test(r.url()) && !/notification|negotiate|hub/i.test(r.url())) reqs.push(`${r.method()} ${r.url().split('?')[0].replace(/^.*\/api\//, '/api/')}`); };
  const onCon = (msg) => { const t = msg.text(); if (/invalid|focusable|error|exception|unhandled/i.test(t)) con.push(`[${msg.type()}] ${t.slice(0, 140)}`); };
  page.on('request', onReq); page.on('console', onCon);
  const inv = await page.evaluate(invalids);
  await m.locator('#btn-save-followup').click({ timeout: 10000 }).catch((e) => con.push('click failed: ' + e.message.split('\n')[0]));
  await page.waitForTimeout(7000); page.off('request', onReq); page.off('console', onCon);
  const st = await page.evaluate(state); const shot = `CH-F1-rc-${label}.png`; await page.screenshot({ path: path.join(SHOTS, shot) }).catch(() => {});
  const line = `  [${label}] :invalid before click=${JSON.stringify(inv)} → API=${reqs.length ? reqs.join(', ') : 'NONE'} · modal ${st.modalOpen ? 'STILL OPEN' : 'CLOSED'}${st.alert ? ' · alert="' + st.alert + '"' : ''}${st.validation.length ? ' · validation=' + JSON.stringify(st.validation) : ''}${con.length ? ' · console=' + JSON.stringify(con) : ''}`;
  console.log(line); OUT.steps.push({ label, invalidBefore: inv, reqs, modalOpen: st.modalOpen, alert: st.alert, validation: st.validation, console: con, shot: 'reports/qa/shots/crm/' + shot }); return { reqs, st }; }

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try { await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);
    // 1 · the user's path: status Awaiting + quality + description → real Save button
    let m = await openModal(page); await setStatus(page, m, 'Awaiting'); await m.locator('#business-value').fill('12345').catch(() => {}); await m.locator('#followup-description').fill(`CH-F1 rootcause A ${Date.now()}`); await page.waitForTimeout(800);
    console.log('\n── 1 · Awaiting → Save (real #btn-save-followup) ──'); const d0 = await page.evaluate(dateInfo); console.log('  #next-followup-date:', JSON.stringify(d0)); OUT.dateAwaiting = d0;
    const r1 = await save(page, m, '1-awaiting');
    // 2 · which statuses reveal the date field?
    console.log('\n── 2 · which status reveals the next-followup date? ──'); OUT.byStatus = {};
    if (!(await page.evaluate(() => !!document.querySelector('.modal.show')))) m = await openModal(page);
    const statuses = await m.locator('#followup-status option').evaluateAll((os) => os.map((o) => o.textContent.trim()).filter((t) => t && !/^(choose|create)/i.test(t)));
    for (const s of statuses) { await setStatus(page, m, s); const d = await page.evaluate(dateInfo); OUT.byStatus[s] = d; console.log(`  ${s.padEnd(20)} date field: ${d.present ? (d.visible ? 'VISIBLE' : 'hidden') + ' required=' + d.required + (d.hiddenBy ? ' by ' + d.hiddenBy : '') : 'absent'}`); }
    // 3 · a status that shows the date, with the date filled → Save
    const showing = Object.entries(OUT.byStatus).find(([, d]) => d.present && d.visible)?.[0];
    console.log(`\n── 3 · ${showing ? showing + ' + date filled → Save' : 'no status reveals the date field'} ──`);
    if (showing) { await setStatus(page, m, showing); await m.locator('#next-followup-date').fill(new Date(Date.now() + 864e5).toISOString().slice(0, 10)).catch(async () => m.locator('#next-followup-date').fill(new Date(Date.now() + 864e5).toISOString().slice(0, 16))); await m.locator('#followup-description').fill(`CH-F1 rootcause B ${Date.now()}`); await page.waitForTimeout(800); await save(page, m, '3-with-date'); }
    // 4 · hidden-date status again, but with `required` removed client-side → Save
    console.log('\n── 4 · Awaiting, hidden date with required removed (diagnostic) → Save ──');
    if (!(await page.evaluate(() => !!document.querySelector('.modal.show')))) m = await openModal(page);
    await setStatus(page, m, 'Awaiting'); await m.locator('#followup-description').fill(`CH-F1 rootcause C ${Date.now()}`);
    await page.evaluate(() => { const e = document.querySelector('#next-followup-date'); if (e) e.removeAttribute('required'); }); await page.waitForTimeout(500);
    await save(page, m, '4-required-removed');
    // 5 · what landed?
    await page.goto(`${BASE}/followups`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000); await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(2500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    OUT.landed = rows.filter((r) => /CH-F1 rootcause/.test(r)); console.log(`\n  /followups rows carrying "CH-F1 rootcause": ${OUT.landed.length}`, OUT.landed.map((r) => r.slice(0, 90)));
  } catch (e) { console.log('FATAL:', e.message.split('\n')[0].slice(0, 160)); }
  finally { if (process.env.HEADED) { console.log('\n  (window stays open 10s)'); await pause(10000); } await browser.close(); }
  fs.writeFileSync(path.join(REPO, 'reports', 'qa', 'raw', 'ch-f1-rootcause-lesol_test.json'), JSON.stringify(OUT, null, 2));
})();
