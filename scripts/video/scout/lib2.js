'use strict';
/**
 * Helpers for the read-only UI scout, part 2 (leads / enquiry overview / follow-ups).
 * Builds on lib.js of part 1 (that file is not modified).
 *
 * Safety design
 *  - click() below only clicks elements that match an explicit ALLOW list of navigation /
 *    view controls, and refuses anything that looks like a data-changing control.
 *  - auditNetwork() writes every non-GET request (method + path, never the body, never the
 *    query string) to the run log and ABORTS requests whose last path segment looks like a
 *    mutation (save / delete / update / create / transfer / convert / merge ...).
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const SAFE_NAME = /^demo customer\b/i;

// ───────────────────────────── click guard ─────────────────────────────
const ALLOW_ID = [
  /^tab-lead-[a-z]+$/i, /^tab-followup-[a-z]+$/i,            // listing tabs (view filters)
  /^btn-toggle-filter$/, /^btn-close-filter-x$/,              // filter panel open / close
  /^btn-search-simple$/,                                      // run the quick search
  /^btn-view-(nature|status|list|kanban)$/,                   // view toggles
  /^btn-enquiry-actions$/,                                    // opens the actions dropdown (items are never clicked)
  /^btn-add-followup$/, /^btn-followup-\d+$/,                 // opens the Add FollowUp modal (closed without saving)
  /^btn-view-overview-\d+$/,                                  // follow-up row -> enquiry overview (navigation)
  /^followups-tab$/, /-tab$/,                                 // tabs on the overview page
];
const DENY_TEXT = /\b(save|submit|delete|remove|deactivate|approve|transfer|convert|merge|start|resume|hold|end|create|edit|update|export|import|add new|assign)\b/i;

async function describe(locator) {
  return locator.evaluate((e) => ({
    tag: e.tagName.toLowerCase(), id: e.id || null,
    role: e.getAttribute('role'),
    text: (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    title: e.getAttribute('title') || e.getAttribute('aria-label') || null,
    classes: typeof e.className === 'string' ? e.className : '',
    dismiss: e.getAttribute('data-bs-dismiss'),
    inModal: !!e.closest('.modal'), inOffcanvas: !!e.closest('.offcanvas'),
  }));
}

/**
 * Click a control only if it is on the allow list. kind:
 *  'id'     – the element's id must match ALLOW_ID
 *  'tab'    – role=tab / nav-link whose text is not a DENY word
 *  'cell'   – a <td> of a listing row (row navigation)
 *  'close'  – a modal / offcanvas close control: .btn-close, [data-bs-dismiss], or text exactly Close / Cancel
 */
async function click(page, locator, kind, log, why) {
  const d = await describe(locator);
  const label = `${d.tag}${d.id ? '#' + d.id : ''} "${d.text}"`;
  let ok = false;
  if (kind === 'id') ok = !!d.id && ALLOW_ID.some((r) => r.test(d.id));
  else if (kind === 'tab') ok = (d.role === 'tab' || /nav-link/.test(d.classes) || (d.id && /tab/i.test(d.id))) && !DENY_TEXT.test(d.text);
  else if (kind === 'cell') ok = d.tag === 'td' && !d.inModal;
  else if (kind === 'close') ok = (/btn-close/.test(d.classes) || d.dismiss === 'modal' || d.dismiss === 'offcanvas' || /^(close|cancel)$/i.test(d.text)) && !/save|submit/i.test(d.text);
  // The three "open a modal / menu" buttons carry a harmless word ("Followup"); everything else with a DENY word is refused.
  if (ok && kind !== 'close' && kind !== 'id' && DENY_TEXT.test(d.text)) ok = false;
  log.push({ t: Date.now(), action: ok ? 'click' : 'REFUSED', kind, target: label, why });
  if (!ok) throw new Error(`click refused by the read-only guard: ${label} (${kind})`);
  await locator.click({ timeout: 10000 });
}

// ───────────────────────────── network audit ─────────────────────────────
const MUTATION = /(save|delete|remove|update|create|insert|transfer|convert|merge|approve|deactivate|assign|upload|send)/i;
const READ_PREFIX = /^(get|list|search|fetch|load|count|find|filter|paged|view)/i;

async function auditNetwork(page, audit) {
  await page.route('**/*', (route) => {
    const req = route.request();
    const m = req.method();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue();
    let p = '';
    try { const u = new URL(req.url()); p = u.host + u.pathname; } catch (_) { p = '(unparseable)'; }
    const last = p.split('/').filter(Boolean).pop() || '';
    const looksLikeWrite = m === 'DELETE' || m === 'PUT' || m === 'PATCH' || (MUTATION.test(last) && !READ_PREFIX.test(last));
    audit.nonGet.push({ t: Date.now(), step: audit.step, method: m, path: p, blocked: looksLikeWrite });
    if (looksLikeWrite) { audit.blocked += 1; return route.abort('blockedbyclient'); }
    return route.continue();
  });
}

// ───────────────────────────── rate limit ─────────────────────────────
async function rateLimited(page, stats) {
  const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
  return stats.http429 > stats.http429Seen || /too many (attempts|requests)/i.test(txt);
}
/** On a hit: count it, press OK on the dialog (it only dismisses the message), wait 95 s. Second hit -> stop. */
async function backOffIfRateLimited(page, stats, log) {
  if (!(await rateLimited(page, stats))) return false;
  stats.rateLimitHits += 1; stats.http429Seen = stats.http429;
  log.push({ t: Date.now(), action: 'RATE_LIMIT', hits: stats.rateLimitHits });
  console.log(`  rate limit hit #${stats.rateLimitHits} - waiting 95 s`);
  const okBtn = page.locator('.swal2-popup .swal2-confirm');
  if (await okBtn.isVisible().catch(() => false)) await okBtn.click().catch(() => {});
  if (stats.rateLimitHits >= 2) { const e = new Error('RATE_LIMITED_TWICE'); e.rateLimited = true; throw e; }
  await page.waitForTimeout(95000);
  return true;
}

// ───────────────────────────── hydration ─────────────────────────────
/**
 * Wait until the Blazor page is populated. "Populated" = no visible loader / skeleton, no "Loading..." text,
 * every visible table has either a real data row or an explicit empty-state row, and the page signature did not
 * change for 900 ms. Returns { hydrate_ms (since t0), settled }.
 */
async function waitHydrated(page, t0, readySelector, maxMs = 45000) {
  if (readySelector) await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: maxMs }).catch(() => {});
  let stableSince = null; let last = ''; const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
      const main = document.querySelector('.main-content') || document.body;
      const loaders = [...main.querySelectorAll('.spinner-border,.spinner-grow,.loader,.loading,[class*="skeleton"],[class*="shimmer"],[class*="placeholder-glow"],[class*="dot-flashing"],[class*="dot-pulse"]')].filter(vis).length;
      const tables = [...main.querySelectorAll('table')].filter(vis);
      const tablePending = tables.some((t) => {
        const rows = [...t.querySelectorAll('tbody tr')].filter(vis);
        if (!rows.length) return true; // neither data nor an empty-state row yet
        return rows.every((r) => !(r.innerText || '').replace(/\s+/g, '').length); // only blank (skeleton) rows
      });
      const t = document.body.innerText;
      return { loaders, tablePending, loadingText: /Loading\.\.\./i.test(t), sig: t.length + ':' + document.querySelectorAll('tbody tr, svg path, canvas, .modal.show, .dropdown-menu.show').length };
    }).catch(() => ({ loaders: 1, tablePending: true, loadingText: true, sig: 'err' }));
    const ok = s.loaders === 0 && !s.loadingText && !s.tablePending;
    if (ok && s.sig === last) { if (stableSince === null) stableSince = Date.now(); if (Date.now() - stableSince >= 900) return { hydrate_ms: stableSince - t0, settled: true }; }
    else stableSince = null;
    last = s.sig;
    await page.waitForTimeout(250);
  }
  return { hydrate_ms: Date.now() - t0, settled: false };
}

// ───────────────────────────── in-page readers ─────────────────────────────
/** Regions that may show a person's name / phone / e-mail, viewport CSS px at the current scroll. */
function privateRegionsInPage() {
  const out = [];
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const inView = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const seen = new Set();
  const add = (why, e, kind) => {
    if (!e || !inView(e)) return; const t = clean(e.innerText || e.value); const b = bb(e);
    const k = why + '|' + b.x + ',' + b.y + ',' + b.w + ',' + b.h; if (seen.has(k)) return; seen.add(k);
    // the text itself is NOT stored for unsafe regions: only its length and whether it is the safe demo record
    const safe = /^demo customer\b/i.test(t) || /demo\.customer@example\.com/i.test(t);
    out.push({ why, kind, safe, text: safe ? t.slice(0, 80) : null, textLength: t.length, bbox: b, scrollY: Math.round(scrollY) });
  };
  add('header: signed-in user name + avatar', document.querySelector('#mainHeaderProfile'), 'staff');
  // listing tables
  document.querySelectorAll('table').forEach((t) => {
    const heads = [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText).toLowerCase());
    t.querySelectorAll('tbody tr').forEach((tr) => {
      const rowSafe = /demo customer/i.test(tr.innerText || '');
      [...tr.children].forEach((td, i) => {
        const txt = clean(td.innerText); if (!txt) return; const head = heads[i] || '';
        if (/customer|name/.test(head) && !/item/.test(head)) add('table cell under "' + head + '"', td, 'customer');
        else if (/phone|mobile|contact|email|e-mail/.test(head)) add('table cell under "' + head + '"' + (rowSafe ? ' (demo row: generated test number)' : ''), td, 'phone');
        else if (/assignee|assigned|executive|followup by|added by|user|staff/.test(head)) add('table cell under "' + head + '"', td, 'staff');
        else if (/lead source|source/.test(head)) add('table cell under "' + head + '" (sources can be people / dealers)', td, 'source');
      });
    });
  });
  // "Label : value" lines (enquiry overview, modal header)
  const rxLine = /^(name|customer|phone|mobile|e-?mail|assignee|assigned to|added by|followup by|executive|created by)\b\s*:/i;
  document.querySelectorAll('p, span, div, li, td, label, h5, h6').forEach((e) => {
    if (e.children.length > 3) return; const t = clean(e.innerText); if (!t || t.length > 140) return;
    if (rxLine.test(t)) add('line "' + t.split(':')[0].trim() + ' :"', e, /phone|mobile|mail/i.test(t) ? 'phone' : /name|customer/i.test(t) ? 'customer' : 'staff');
    else if (/\b(created by|assigned to|transferred (to|from)|followup by)\b/i.test(t) && e.children.length <= 1) add('history line mentioning a user', e, 'staff');
  });
  const rxPhone = /(?:\+?\d[\d\s-]{8,}\d)/; const rxMail = /[\w.+-]+@[\w-]+\.[\w.]+/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walker.nextNode())) {
    const t = clean(n.nodeValue); if (!t || t.length > 120) continue;
    if (!n.parentElement || n.parentElement.closest('script,style')) continue;
    if (rxMail.test(t)) add('text looks like an e-mail address', n.parentElement, 'email');
    else if (rxPhone.test(t) && t.replace(/\D/g, '').length >= 10 && !/\d{2}\/\d{2}\/\d{4}/.test(t)) add('text looks like a phone number', n.parentElement, 'phone');
  }
  document.querySelectorAll('img.avatar, .avatar img, img[class*="avatar"], img[src*="profile"]').forEach((e) => add('avatar / profile picture', e, 'staff'));
  return out;
}

/** Heading, breadcrumb, toolbar, tabs (label + count + active), table (columns, rows, per-row controls), pager. */
function listingInPage() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const sel = (e) => (e.id ? '#' + CSS.escape(e.id) : null);
  const main = document.querySelector('.main-content') || document.body;
  const h = [...main.querySelectorAll('h1,h2,h3,h4,h5,.page-title')].filter(vis)[0];
  const crumb = [...main.querySelectorAll('.breadcrumb li, nav[aria-label="breadcrumb"] li')].filter(vis).map((li) => clean(li.innerText));
  const tabs = [...main.querySelectorAll('[id^="tab-"], #myTab1 button, #myTab1 a, [role="tab"]')].filter(vis).filter((e, i, a) => a.indexOf(e) === i).map((e) => {
    const badge = e.querySelector('.badge, [class*="badge"]');
    const full = clean(e.innerText);
    const count = badge ? clean(badge.innerText) : ((full.match(/(\d[\d,]*)\s*$/) || [])[1] || null);
    const label = count ? clean(full.replace(new RegExp(count.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'), '')) : full;
    return { id: e.id || null, selector: sel(e), tag: e.tagName.toLowerCase(), label, count: count === null ? null : Number(String(count).replace(/,/g, '')), text: full,
      active: /\bactive\b/.test(e.className) || e.getAttribute('aria-selected') === 'true', classes: e.className, color: getComputedStyle(e).color, bbox: bb(e), scrollY: Math.round(scrollY) };
  });
  const toolbar = [...main.querySelectorAll('button, a.btn, [id^="btn-"], input[type="text"], input[type="search"], select')].filter(vis)
    .filter((e) => !e.closest('table') && !e.closest('.offcanvas') && !e.closest('.modal') && !e.closest('#myTab1'))
    .map((e) => ({ id: e.id || null, selector: sel(e), tag: e.tagName.toLowerCase(), type: e.getAttribute('type'), text: clean(e.innerText).slice(0, 60), placeholder: e.getAttribute('placeholder'), title: e.getAttribute('title') || e.getAttribute('aria-label'), value: e.tagName === 'SELECT' && e.selectedOptions[0] ? clean(e.selectedOptions[0].text) : null,
      options: e.tagName === 'SELECT' && /page.?size/i.test(e.id) ? [...e.options].map((o) => clean(o.text)) : null, bbox: bb(e), scrollY: Math.round(scrollY) }));
  const t = [...main.querySelectorAll('table')].filter(vis).sort((a, b) => b.querySelectorAll('thead th').length - a.querySelectorAll('thead th').length)[0];
  let table = null;
  if (t) {
    const ths = [...t.querySelectorAll('thead th')];
    const trs = [...t.querySelectorAll('tbody tr')].filter(vis);
    table = {
      selector: sel(t) || 'table', bbox: bb(t), scrollY: Math.round(scrollY),
      scrollsHorizontally: (() => { const p = t.parentElement; return p ? p.scrollWidth > p.clientWidth + 2 : false; })(),
      columns: ths.map((th) => ({ text: clean(th.innerText), sortable: /sort|cursor-pointer/.test(th.className) || getComputedStyle(th).cursor === 'pointer' || !!th.querySelector('i,svg'), bbox: bb(th) })),
      rowCount: trs.filter((r) => r.children.length > 2).length,
      emptyText: trs.length && trs.every((r) => r.children.length <= 2) ? clean(trs[0].innerText) : null,
      rows: trs.filter((r) => r.children.length > 2).map((r, i) => {
        const cells = [...r.children].map((c) => clean(c.innerText));
        const isDemo = /demo customer/i.test(cells.join(' '));
        return {
          index: i, isDemo, bbox: bb(r),
          // full cell text is kept only for the safe demo rows; other rows keep the non-personal columns
          cells: isDemo ? cells : cells.map((c, k) => (/customer|name|phone|mobile|assignee|followup by|lead source|email/i.test(clean((ths[k] || {}).innerText)) ? '(redacted ' + c.length + ' chars)' : c)),
          cursor: [...r.children].map((c) => getComputedStyle(c).cursor),
          hasOnclick: [...r.children].map((c) => !!c.onclick || c.hasAttribute('onclick') || [...c.attributes].some((a) => /^(_bl_|b-)/.test(a.name))),
          controls: [...r.querySelectorAll('a, button, input, [role="button"]')].map((c) => ({ id: c.id || null, tag: c.tagName.toLowerCase(), type: c.getAttribute('type'), text: clean(c.innerText).slice(0, 40), title: c.getAttribute('title') || c.getAttribute('aria-label') || c.getAttribute('data-bs-original-title'), href: c.getAttribute('href'), icon: (c.querySelector('i') || {}).className || null, classes: typeof c.className === 'string' ? c.className : '', bbox: bb(c) })),
        };
      }),
    };
  }
  const showing = [...main.querySelectorAll('div, span, p, small')].filter(vis).map((e) => ({ e, t: clean(e.innerText) })).filter((x) => /^showing\s+\d/i.test(x.t) && x.t.length < 60).pop();
  const ps = document.querySelector('#page_size');
  const pager = {
    showingText: showing ? showing.t : null, showingBbox: showing ? bb(showing.e) : null,
    pageSize: ps && vis(ps) ? { selector: '#page_size', value: ps.value, options: [...ps.options].map((o) => clean(o.text)), bbox: bb(ps) } : null,
    pages: [...main.querySelectorAll('.pagination a, .pagination button, .pagination li, ul.pagination > *')].filter(vis).filter((e) => !e.querySelector('a,button')).map((e) => ({ text: clean(e.innerText), active: /\bactive\b/.test(e.className) || /\bactive\b/.test((e.parentElement || {}).className || ''), bbox: bb(e) })),
    scrollY: Math.round(scrollY),
  };
  return { url: location.pathname, heading: h ? { text: clean(h.innerText), bbox: bb(h) } : null, breadcrumb: crumb, tabs, toolbar, table, pager };
}

/** Labels + controls inside an open container (filter offcanvas or modal). Option texts only for non-person lists. */
function formInPage(rootSelector) {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const root = document.querySelector(rootSelector); if (!root || !vis(root)) return null;
  const personList = /assign|executive|user|added\s*by|addded|staff|team|followup-?by|source|soure/i;
  const title = root.querySelector('.modal-title, .offcanvas-title, h5, h4');
  const controls = [...root.querySelectorAll('input, select, textarea')].filter(vis).map((e) => {
    let lab = e.id ? root.querySelector('label[for="' + CSS.escape(e.id) + '"]') : null;
    if (!lab) { let p = e.parentElement; for (let i = 0; i < 3 && p && !lab; i++) { lab = p.querySelector('label, .form-label'); p = p.parentElement; } }
    const isPerson = personList.test(e.id || '') || personList.test(lab ? lab.innerText : '');
    return { label: lab ? clean(lab.innerText) : null, id: e.id || null, selector: e.id ? '#' + CSS.escape(e.id) : null, tag: e.tagName.toLowerCase(), type: e.getAttribute('type') || e.tagName.toLowerCase(), placeholder: e.getAttribute('placeholder'), required: e.required || /\*/.test(lab ? lab.innerText : ''), disabled: e.disabled,
      min: e.getAttribute('min'), checked: e.type === 'checkbox' || e.type === 'radio' ? e.checked : null,
      valueLength: (e.value || '').length, value: e.tagName === 'SELECT' ? (e.selectedOptions[0] ? (isPerson && e.selectedIndex > 0 ? '(a name)' : clean(e.selectedOptions[0].text)) : null) : (/date|number|checkbox/.test(e.type) ? e.value : null),
      optionCount: e.tagName === 'SELECT' ? e.options.length : null, options: e.tagName === 'SELECT' && !isPerson ? [...e.options].map((o) => clean(o.text)).slice(0, 40) : null, optionsWithheld: e.tagName === 'SELECT' && isPerson, bbox: bb(e) };
  });
  const buttons = [...root.querySelectorAll('button, a.btn, [role="button"]')].filter(vis).map((e) => ({ id: e.id || null, text: clean(e.innerText), classes: e.className, dismiss: e.getAttribute('data-bs-dismiss'), ariaLabel: e.getAttribute('aria-label'), bbox: bb(e) }));
  // "Name : ..." / "Phone : ..." lines at the top of the follow-up modal; values are kept only for the demo record
  const isDemo = /demo customer/i.test(root.innerText || '');
  const headerLines = [...root.querySelectorAll('.modal-body *')].filter((e) => vis(e) && !e.closest('label') && e.children.length <= 1).map((e) => clean(e.innerText))
    .filter((t) => /^(name|phone|mobile|customer|enquiry)[^:]{0,20}:/i.test(t) && t.length < 120).filter((t, i, a) => a.indexOf(t) === i).slice(0, 6)
    .map((t) => (isDemo ? t : t.replace(/(:\s*).+$/, '$1(redacted)')));
  return { selector: rootSelector, title: title ? clean(title.innerText) : null, bbox: bb(root.querySelector('.modal-content, .offcanvas-body') || root), controls, buttons, headerLines, scrollY: Math.round(scrollY) };
}

/** The enquiry overview: number, header buttons, tabs, "Label : value" lines grouped by block, item table, history lists. */
function overviewInPage() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const main = document.querySelector('.main-content') || document.body;
  const isDemo = /demo customer/i.test(main.innerText || '');
  const redact = (t) => (isDemo ? t : t.replace(/(:\s*).+$/, '$1(redacted)'));
  const lines = [...main.querySelectorAll('p, span, div, li')].filter((e) => vis(e) && !e.closest('.modal') && e.children.length <= 2).map((e) => ({ e, t: clean(e.innerText) }))
    .filter((x) => /^[A-Za-z][A-Za-z .()/-]{1,30}\s*:/.test(x.t) && x.t.length < 140)
    .filter((x, i, a) => a.findIndex((y) => y.t === x.t) === i)
    .map((x) => ({ text: /^(phone|assignee|added by|name|followup by|created by)/i.test(x.t) && !isDemo ? redact(x.t) : x.t, label: clean(x.t.split(':')[0]), bbox: bb(x.e), scrollY: Math.round(scrollY) }));
  const headerButtons = [...main.querySelectorAll('button, a.btn, a[id^="btn-"], [id^="btn-"]')].filter((e) => vis(e) && !e.closest('table') && !e.closest('.modal') && !e.closest('.dropdown-menu'))
    .map((e) => ({ id: e.id || null, tag: e.tagName.toLowerCase(), text: clean(e.innerText), title: e.getAttribute('title') || e.getAttribute('aria-label'), icon: (e.querySelector('i') || {}).className || null, classes: e.className, bbox: bb(e), scrollY: Math.round(scrollY) }));
  const tabs = [...main.querySelectorAll('[role="tab"], .nav-tabs .nav-link, .nav-pills .nav-link')].filter(vis).map((e) => ({ id: e.id || null, text: clean(e.innerText), active: /\bactive\b/.test(e.className) || e.getAttribute('aria-selected') === 'true', target: e.getAttribute('data-bs-target') || e.getAttribute('href'), bbox: bb(e), scrollY: Math.round(scrollY) }));
  const tables = [...main.querySelectorAll('table')].filter((t) => vis(t) && !t.closest('.modal')).map((t) => ({ columns: [...t.querySelectorAll('thead th')].map((h) => clean(h.innerText)), rows: [...t.querySelectorAll('tbody tr')].filter(vis).map((r) => [...r.children].map((c) => clean(c.innerText))), bbox: bb(t), scrollY: Math.round(scrollY) }));
  const cards = [...main.querySelectorAll('.card')].filter(vis).map((c) => { const hd = c.querySelector('.card-header, .card-title, h5, h6'); return { title: hd ? clean(hd.innerText).slice(0, 80) : null, bbox: bb(c), scrollY: Math.round(scrollY) }; });
  const history = (rootSel) => { const r = document.querySelector(rootSel); if (!r) return null; const items = [...r.querySelectorAll('li, tbody tr')].filter(vis).map((e) => clean(e.innerText)).filter(Boolean); return { selector: rootSel, visible: vis(r), count: items.length, items: isDemo ? items : items.map((t) => '(redacted ' + t.length + ' chars)'), bbox: bb(r) }; };
  return { url: location.pathname, isDemo, heading: clean((main.querySelector('h1,h2,.page-title') || {}).innerText), breadcrumb: [...main.querySelectorAll('.breadcrumb li')].filter(vis).map((li) => clean(li.innerText)), lines, headerButtons, tabs, tables, cards, followupHistory: history('#followups') };
}

/** Items of the dropdown menu that is currently open. Nothing is clicked. */
function openMenuInPage() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const bb = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const m = document.querySelector('.dropdown-menu.show'); if (!m) return null;
  return { bbox: bb(m), items: [...m.querySelectorAll('a, button, li > span')].map((e) => ({ id: e.id || null, tag: e.tagName.toLowerCase(), text: clean(e.innerText), href: e.getAttribute('href'), icon: (e.querySelector('i') || {}).className || null, classes: e.className, bbox: bb(e) })).filter((i) => i.text), scrollY: Math.round(scrollY) };
}

// ───────────────────────────── screenshots ─────────────────────────────
/**
 * Viewport screenshots from the top in steps of 700 CSS px until the bottom.
 * Scrolls the window; if the window cannot scroll but an inner container can, scrolls that container.
 * Returns [{file, scrollY, private:[...]}] and leaves the page scrolled back to the top.
 */
async function shotsDown(page, outDir, prefix, opts = {}) {
  const step = opts.step || 700; const out = [];
  const info = await page.evaluate(() => {
    const de = document.documentElement; const docH = Math.max(de.scrollHeight, document.body.scrollHeight);
    let inner = null;
    if (docH <= innerHeight + 2) {
      const c = [...document.querySelectorAll('.main-content, .page, main, #app *')].find((e) => e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.clientHeight > 400 && !e.closest('#sidebar'));
      if (c) { c.setAttribute('data-scout-scroller', '1'); inner = { scrollHeight: c.scrollHeight, clientHeight: c.clientHeight }; }
    }
    return { docH, vh: innerHeight, inner };
  });
  const total = info.inner ? info.inner.scrollHeight : info.docH;
  const view = info.inner ? info.inner.clientHeight : info.vh;
  const maxY = Math.max(0, total - view);
  const ys = [0]; for (let y = step; y < maxY; y += step) ys.push(y); if (maxY > 0 && ys[ys.length - 1] !== maxY) ys.push(maxY);
  for (const y of (opts.topOnly ? [0] : ys)) {
    const at = await page.evaluate(([yy, useInner]) => { const c = useInner ? document.querySelector('[data-scout-scroller]') : null; if (c) { c.scrollTop = yy; return Math.round(c.scrollTop); } window.scrollTo(0, yy); return Math.round(window.scrollY); }, [y, !!info.inner]);
    await page.waitForTimeout(350);
    const file = `${prefix}_s${at}.png`;
    await page.screenshot({ path: path.join(outDir, file), type: 'png' });
    const priv = await page.evaluate(privateRegionsInPage).catch(() => []);
    out.push({ file, scrollY: at, scroller: info.inner ? 'inner container' : 'window', documentHeight: total, private: priv });
  }
  await page.evaluate((useInner) => { const c = useInner ? document.querySelector('[data-scout-scroller]') : null; if (c) c.scrollTop = 0; window.scrollTo(0, 0); }, !!info.inner);
  await page.waitForTimeout(200);
  return out;
}

/** elements.json content: part-1 collector + scroll positions, so that below-the-fold elements get a usable box. */
async function collectElementsAllScrolls(page, scrollYs) {
  const all = []; const seen = new Set();
  for (const y of scrollYs) {
    await page.evaluate((yy) => { const c = document.querySelector('[data-scout-scroller]'); if (c) c.scrollTop = yy; else window.scrollTo(0, yy); }, y);
    await page.waitForTimeout(200);
    const items = await page.evaluate(L.collectElementsInPage);
    for (const it of items) {
      if (it.selector && /^#sidebar|^#nav-|switcher|Svgjs/.test(it.selector)) continue;
      const k = it.kind + '|' + it.selector; if (seen.has(k) && !it.inViewport) continue;
      if (!it.inViewport && y !== scrollYs[scrollYs.length - 1]) continue; // wait for the scroll position that shows it
      if (seen.has(k)) continue; seen.add(k);
      it.measuredAtScrollY = y;
      // never store personal text of non-demo rows
      if (/^(td|tr)$/.test(it.tag)) continue;
      all.push(it);
    }
  }
  await page.evaluate(() => { const c = document.querySelector('[data-scout-scroller]'); if (c) c.scrollTop = 0; window.scrollTo(0, 0); });
  return all;
}

/** Remove personal text from a body.innerText dump: keeps every label, masks names / phones / e-mails that are not the demo record. */
function maskText(text, staffNames) {
  let t = text;
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => (/demo\.customer@example\.com/i.test(m) ? m : '[e-mail]'));
  for (const n of staffNames || []) if (n && n.length > 2) t = t.split(n).join('[staff name]');
  return t;
}

module.exports = { SAFE_NAME, click, describe, auditNetwork, rateLimited, backOffIfRateLimited, waitHydrated, privateRegionsInPage, listingInPage, formInPage, overviewInPage, openMenuInPage, shotsDown, collectElementsAllScrolls, maskText };
