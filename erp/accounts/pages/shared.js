'use strict';

/**
 * Small helpers shared by the Accounts and Inventory page objects and specs.
 *
 * Balances are read as SIGNED numbers: Debit is positive, Credit is negative ("4000.00 Cr" -> -4000).
 * Every check in these suites compares a balance BEFORE and AFTER an action, so the specs keep working
 * however much earlier runs left on the tenant.
 */
require('dotenv').config();

const BASE = process.env.BASE_URL || 'https://test.erp.progbiz.in';
const C = {
  company:  process.env.COMPANY_CODE || 'onetouch_test',
  username: process.env.CRM_USERNAME || 'admin',
  password: process.env.PASSWORD     || '123',
};

/** First number in a string ("AED 1,200.50" -> 1200.5). 0 when there is none. */
const num = (s) => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : 0; };
const money = (n) => Math.round(Number(n) * 100) / 100;

/** "Balance: 4000.00 Cr" -> -4000, "Balance: 9000.00 Dr" -> 9000, no label -> null. */
function parseBalance(text) {
  const m = String(text ?? '').replace(/,/g, '').match(/Balance:\s*(-?\d+(?:\.\d+)?)\s*(Dr|Cr)?/i);
  if (!m) return null;
  const v = Number(m[1]);
  return /cr/i.test(m[2] || '') ? -v : v;
}

/** "9100.00 Dr" -> 9100, "3500.00 Cr" -> -3500, "" -> 0, "-3500.00" -> -3500. */
function parseSigned(text) {
  const t = String(text ?? '').replace(/,/g, '').trim();
  if (!t) return 0;
  const v = num(t);
  return /\bcr\b/i.test(t) ? -Math.abs(v) : v;
}

/** Counts the calls that change data (non-GET /api calls that are not reads). */
function trackWrites(page) {
  const writes = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) || ['GET', 'HEAD', 'OPTIONS'].includes(r.method())) return;
    const p = u.replace(BASE, '');
    if (/^\/api\//.test(p) && !/\/(get|list|search|count|check|negotiate|notification|validate)[\w-]*/i.test(p)) writes.push(`${r.method()} ${p}`);
  });
  return { writes, clear: () => { writes.length = 0; } };
}

const MESSAGE = '.swal2-popup, .swal2-toast, .toast, .toast-message';

/**
 * After pressing Save, wait for the outcome:
 *   { kind: 'saved',  text }   a message matching `savedRe` appeared (e.g. "Voucher C-5 saved")
 *   { kind: 'dialog', text }   a blocking dialog appeared (validation, "Oops", "Cant Save" ...)
 *   { kind: 'none',   text }   nothing within the timeout
 */
async function outcome(page, savedRe, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const texts = (await page.locator(MESSAGE).allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const saved = texts.find((t) => savedRe.test(t));
    if (saved) return { kind: 'saved', text: saved };
    const dlg = await page.locator('.swal2-popup:visible').filter({ hasNotText: savedRe }).allInnerTexts().catch(() => []);
    const d = dlg.map((s) => s.replace(/\s+/g, ' ').trim()).find((t) => t && !savedRe.test(t));
    if (d) return { kind: 'dialog', text: d };
    await page.waitForTimeout(250);
  }
  return { kind: 'none', text: '' };
}

/** Close a visible dialog with its confirm (default) or cancel button. */
async function closeDialog(page, button = 'confirm') {
  const b = page.locator(button === 'cancel' ? '.swal2-cancel:visible' : '.swal2-confirm:visible').first();
  if (await b.count()) await b.click().catch(() => {});
  await page.locator('.swal2-popup:visible').first().waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
}

/** Wait until the page stops talking to the server (capped; the app keeps a socket open). */
async function settle(page, ms = 1000) {
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/** Today's date as the app (an India-time product) sees it, plus the "before 5:30 am it is still yesterday" rule. */
function appToday(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const g = (t) => Number(p.find((x) => x.type === t).value);
  const d = new Date(Date.UTC(g('year'), g('month') - 1, g('day')));
  if (g('hour') * 60 + g('minute') < 5 * 60 + 30) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
/** Date -> 'YYYY-MM-DD' */
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; };

module.exports = { BASE, C, num, money, parseBalance, parseSigned, trackWrites, outcome, closeDialog, settle, appToday, iso, addDays };
