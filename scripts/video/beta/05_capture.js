'use strict';
/**
 * Captures the footage for the beta product video (beta.progbiz.io).
 *
 * Output (reports/video/beta/cap/):
 *   <id>.jpg                    3840x2160 still of a 1920x1080 CSS viewport (deviceScaleFactor 2)
 *   <id>/frames/f_000001.jpg    frame-sequence shots (scrolls, typing) + <id>/meta.json
 *   boxes.json                  element boxes (CSS px) per still, for cursor/camera/callout authoring
 *
 * SAFETY — read-only except for the ONE thing Vismaya asked for: a new AI Assistant chat
 * with one question. Everything else is navigation, tab/view switches, opening a filter
 * panel or a detail modal and closing it. No Save / Transfer / Followup / delete controls
 * are ever clicked, no Kanban card is dragged.
 *
 * PRIVACY — before every screenshot, customer names, phone numbers and call transcripts are
 * blurred IN THE BROWSER ONLY (CSS class on the element). Nothing is sent to the server.
 *
 * Run:  node scripts/video/beta/05_capture.js home ai dash leads transfer fu calls perf logo
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const CAP = path.join(L.OUT, 'cap');
const BOXES = path.join(CAP, 'boxes.json');
const JPG = { type: 'jpeg', quality: 92 };
const wait = (page, ms) => page.waitForTimeout(ms);

// ------------------------------------------------------------------ privacy
async function privacy(page) {
  await page.evaluate(() => {
    if (!document.getElementById('pv-style')) {
      const st = document.createElement('style');
      st.id = 'pv-style';
      st.textContent = `
        .pv-blur, .pv-blur *:not(.badge):not(.badge *) { color: transparent !important; text-shadow: 0 0 7px rgba(30,35,45,.78) !important; }
        .pv-blur .badge, .pv-blur .badge * { text-shadow: none !important; }
        .pv-blur .pv-keep.pv-keep.pv-keep { color: var(--bs-secondary-color, #6c757d) !important; text-shadow: none !important; }
        .pv-soft, .pv-soft * { filter: blur(5px) !important; }`;
      document.head.appendChild(st);
    }
    const blur = e => e && e.classList.add('pv-blur');
    // tables: whole columns by header
    document.querySelectorAll('table').forEach(t => {
      const hs = [...t.querySelectorAll('thead th')].map(h => (h.innerText || '').trim().toLowerCase());
      hs.forEach((h, i) => {
        const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.children.length === hs.length);
        if (/^(customer name|phone|mobile no|email|customer|name)$/.test(h)) rows.forEach(tr => blur(tr.children[i]));
        if (h === 'enquiry / customer') rows.forEach(tr => { const s = tr.children[i] && tr.children[i].querySelectorAll('span'); if (s && s[1]) blur(s[1]); });
      });
    });
    // Home: Today's Schedule customer line (text + status badge) and Followup History customer line
    document.querySelectorAll('p.text-muted.mb-1.fs-12').forEach(p => { if (p.querySelector('.badge')) blur(p); });
    document.querySelectorAll('.watchlist-list li span.d-block.text-muted.fs-12').forEach(blur);
    // Kanban cards
    document.querySelectorAll('.kb-card-name').forEach(blur);
    document.querySelectorAll('.kb-card-row').forEach(r => { if (r.querySelector('.ri-phone-line')) blur(r.querySelector('span')); });
    // Call Analysis modal: customer value + transcript
    const m = document.querySelector('.modal.show');
    if (m) {
      [...m.querySelectorAll('*')].forEach(e => {
        if (e.children.length === 0 && (e.innerText || '').trim() === 'Customer') {
          // markup: <div><span class="text-muted">Customer</span>NAME</div> — blur the block, keep the label
          e.classList.add('pv-keep');
          blur(e.parentElement);
        }
      });
      [...m.querySelectorAll('*')].forEach(e => {
        if (e.children.length === 0 && (e.innerText || '').trim() === 'Transcript') {
          let box = e.nextElementSibling;
          if (box) box.classList.add('pv-soft');
        }
      });
    }
    // AI Assistant answers can quote customer names: blur table cells inside chat bubbles too (handled by table rule)
  });
}

// ------------------------------------------------------------------ boxes
function loadBoxes() { try { return JSON.parse(fs.readFileSync(BOXES, 'utf8')); } catch (_) { return {}; } }
function saveBoxes(b) { L.ensureDir(CAP); fs.writeFileSync(BOXES, JSON.stringify(b, null, 1)); }

/** Box of the smallest visible element whose own text matches `re` (optionally inside a y band). */
async function boxByText(page, re, opts = {}) {
  return page.evaluate(({ src, flags, yMin, yMax, xMin, xMax, tag }) => {
    const rx = new RegExp(src, flags);
    const els = [...document.querySelectorAll(tag || 'body *')].filter(e => {
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (yMin != null && r.y < yMin) return false;
      if (yMax != null && r.y > yMax) return false;
      if (xMin != null && r.x < xMin) return false;
      if (xMax != null && r.x > xMax) return false;
      const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') return false;
      return rx.test((e.innerText || '').replace(/\s+/g, ' ').trim());
    });
    els.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.width * ra.height - rb.width * rb.height; });
    const e = els[0]; if (!e) return null;
    const r = e.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  }, { src: re.source, flags: re.flags, ...opts });
}
async function boxOf(page, selector) {
  const l = page.locator(selector).first();
  const b = await l.boundingBox().catch(() => null);
  return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null;
}
/** Box of the .card whose text starts with a heading. */
async function cardBox(page, heading) {
  return page.evaluate(h => {
    const c = [...document.querySelectorAll('.card')].filter(c => (c.innerText || '').trim().startsWith(h))
      .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)];
  }, heading);
}
const center = b => (b ? [Math.round(b[0] + b[2] / 2), Math.round(b[1] + b[3] / 2)] : null);

async function clickBox(page, b, label) {
  if (!b) throw new Error(`nothing to click for ${label}`);
  const [x, y] = center(b);
  await page.mouse.click(x, y);
  return [x, y];
}

// ------------------------------------------------------------------ outputs
async function still(page, id, boxes, extra) {
  await privacy(page);
  await wait(page, 350);
  await page.screenshot({ path: path.join(CAP, `${id}.jpg`), ...JPG });
  boxes[id] = Object.assign({ scrollY: await page.evaluate(() => scrollY) }, boxes[id] || {}, extra || {});
  saveBoxes(boxes);
  console.log(`  still ${id}`);
}

/** Frame-sequence shot. `steps` = [{ run: async () => {}, t_ms }]; one frame after each step. */
async function shot(page, id, steps) {
  const dir = path.join(CAP, id);
  fs.rmSync(dir, { recursive: true, force: true });
  L.ensureDir(path.join(dir, 'frames'));
  const frames = [];
  for (let i = 0; i < steps.length; i++) {
    await steps[i].run();
    await privacy(page);
    const file = `frames/f_${String(i + 1).padStart(6, '0')}.jpg`;
    await page.screenshot({ path: path.join(dir, file), ...JPG });
    frames.push({ file, t_ms: steps[i].t_ms, ...(steps[i].info || {}) });
  }
  const meta = { shot_id: id, css_width: 1920, css_height: 1080, dsf: 2, frame_width: 3840, frame_height: 2160, frames, events: [] };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  console.log(`  shot ${id}: ${frames.length} frames`);
  return meta;
}

// ------------------------------------------------------------------ sections
const S = {};

S.home = async (page, B) => {
  await L.visit(page, '/home', { settleMs: 3500 });
  const b = {
    cards: await page.evaluate(() => {
      const labels = ['New Leads', 'Followups', 'Delayed', 'Completed'];
      return labels.map(t => {
        const el = [...document.querySelectorAll('.card')].filter(c => (c.innerText || '').includes(t) && c.getBoundingClientRect().height < 140 && c.getBoundingClientRect().y < 300)
          .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
        if (!el) return null; const r = el.getBoundingClientRect(); return [t, [r.x, r.y, r.width, r.height].map(Math.round)];
      });
    }),
    schedule: await cardBox(page, "Today's Schedule"),
    history: await cardBox(page, 'Followup History'),
    summary: await cardBox(page, 'Summary'),
    createNew: await boxByText(page, /^Create New$/),
    greeting: await boxByText(page, /^Hey,/),
  };
  await still(page, 'home', B, b);
};

S.ai = async (page, B) => {
  await L.visit(page, '/data-assistant', { settleMs: 3000 });
  const b = {
    newChat: await boxByText(page, /^\+?\s*New chat$/i),
    input: await boxOf(page, 'input[placeholder*="Ask a question" i], textarea[placeholder*="Ask a question" i]'),
    chips: await page.evaluate(() => [...document.querySelectorAll('button, span, a, div')].filter(e => e.children.length === 0 && /\?$|today$|status$|Projects$/.test((e.innerText || '').trim()) && e.getBoundingClientRect().y > 250 && e.getBoundingClientRect().y < 380)
      .map(e => { const r = e.getBoundingClientRect(); return [(e.innerText || '').trim(), [r.x, r.y, r.width, r.height].map(Math.round)]; })),
    chatList: await cardBox(page, 'Chats'),
  };
  await still(page, 'ai_empty', B, b);
  b.newChatClick = await clickBox(page, b.newChat, 'New chat');
  await wait(page, 2500);
  const input = page.locator('input[placeholder*="Ask a question" i], textarea[placeholder*="Ask a question" i]').first();
  b.inputAfterNew = await boxOf(page, 'input[placeholder*="Ask a question" i], textarea[placeholder*="Ask a question" i]');
  await still(page, 'ai_new', B, { newChatClick: b.newChatClick, input: b.inputAfterNew });
  await input.click();
  const Q = 'How many leads today?';
  const typing = [{ run: async () => {}, t_ms: 0 }];
  for (let i = 1; i <= Q.length; i++) typing.push({ run: async () => { await page.keyboard.type(Q[i - 1]); await wait(page, 40); }, t_ms: i * 90 });
  await shot(page, 'ai_typing', typing);
  const send = await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder*="Ask a question" i], textarea[placeholder*="Ask a question" i]');
    const r0 = inp.getBoundingClientRect();
    const btns = [...document.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return Math.abs(r.y - r0.y) < 30 && r.x > r0.x + r0.width - 10; })
      .sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x);
    const r = btns[0] && btns[0].getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height].map(Math.round) : null;
  });
  B.ai_typing = { input: b.inputAfterNew, send };
  saveBoxes(B);
  // after send: frames every ~400 ms until an answer bubble appears (max ~40 s)
  const t0 = Date.now();
  let answered = false;
  const waitSteps = [{ run: async () => { await clickBox(page, send, 'send'); await wait(page, 150); }, t_ms: 0 }];
  const meta = { frames: [] };
  const dir = 'ai_answering';
  // build dynamically: up to 100 frames
  for (let i = 1; i <= 100; i++) {
    waitSteps.push({ run: async () => { await wait(page, 380); }, t_ms: 0 });
  }
  // custom loop so we can stop early and stamp real times
  fs.rmSync(path.join(CAP, dir), { recursive: true, force: true });
  L.ensureDir(path.join(CAP, dir, 'frames'));
  for (let i = 0; i < waitSteps.length; i++) {
    await waitSteps[i].run();
    await privacy(page);
    const file = `frames/f_${String(i + 1).padStart(6, '0')}.jpg`;
    await page.screenshot({ path: path.join(CAP, dir, file), ...JPG });
    meta.frames.push({ file, t_ms: Date.now() - t0 });
    answered = await page.evaluate(q => {
      const txt = document.body.innerText || '';
      const idx = txt.lastIndexOf(q);
      return idx >= 0 && /\d/.test(txt.slice(idx + q.length, idx + q.length + 400)) && !/thinking|typing|\.\.\.$/i.test(txt.slice(idx + q.length, idx + q.length + 60).trim());
    }, Q);
    if (answered && i > 3) { for (let k = 0; k < 4; k++) { await wait(page, 400); const f2 = `frames/f_${String(meta.frames.length + 1).padStart(6, '0')}.jpg`; await privacy(page); await page.screenshot({ path: path.join(CAP, dir, f2), ...JPG }); meta.frames.push({ file: f2, t_ms: Date.now() - t0 }); } break; }
  }
  fs.writeFileSync(path.join(CAP, dir, 'meta.json'), JSON.stringify({ shot_id: dir, css_width: 1920, css_height: 1080, dsf: 2, frame_width: 3840, frame_height: 2160, frames: meta.frames, events: [] }, null, 1));
  console.log(`  shot ${dir}: ${meta.frames.length} frames, answered=${answered}, ${Date.now() - t0} ms`);
  await wait(page, 1500);
  const ans = await page.evaluate(q => { const t = document.body.innerText; const i = t.lastIndexOf(q); return i >= 0 ? t.slice(i, i + 300).replace(/\s+/g, ' ') : null; }, Q);
  console.log('  answer text:', ans);
  await still(page, 'ai_answer', B, {
    question: await boxByText(page, /^How many leads today\?$/, { xMin: 700 }),
    answer: await boxByText(page, /^There (are|is)\b|leads? (on|today)/i, { xMin: 700 }),
  });
};

S.dash = async (page, B) => {
  await L.visit(page, '/crm-dashboard', { settleMs: 4500 });
  const b = {
    rates: await boxByText(page, /^Win Rate/, { yMax: 400 }).then(async r => r ? page.evaluate(([x, y]) => { let e = document.elementFromPoint(x + 5, y + 5); while (e && e.getBoundingClientRect().height < 120) e = e.parentElement; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }, r) : null),
    leadsSummary: await cardBox(page, 'Leads Summary'),
    followupRing: await boxByText(page, /^Leads in Follow-up$/),
    followupCard: await page.evaluate(() => { const e = [...document.querySelectorAll('.card')].find(c => /Leads in Follow-up/.test(c.innerText || '') && !/Leads Summary/.test(c.innerText || '')); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }),
    stages: await page.evaluate(() => ['Total', 'Won', 'Lost', 'New', 'Not Connected', 'Not Reachable', 'Cold', 'Warm', 'Hot'].map(t => {
      const e = [...document.querySelectorAll('div, span, p, h6, h5')].filter(x => x.children.length === 0 && (x.innerText || '').trim() === t && x.getBoundingClientRect().y > 200 && x.getBoundingClientRect().y < 900)[0];
      if (!e) return [t, null]; let c = e; while (c && c.getBoundingClientRect().width < 250) c = c.parentElement; const r = c.getBoundingClientRect(); return [t, [r.x, r.y, r.width, r.height].map(Math.round)];
    })),
    execTable: await cardBox(page, 'Executive-Wise Leads'),
    callActivity: await cardBox(page, 'Call Activity'),
    roi: await cardBox(page, 'Lead Source ROI'),
    salesView: await boxByText(page, /^Sales View$/),
    period: await boxByText(page, /^This Month$/, { yMax: 200 }),
  };
  await still(page, 'dash_top', B, b);
  // smooth real scroll 0 -> ROI table (12 CSS px per frame, t_ms = scrollY)
  const target = Math.min((b.roi ? b.roi[1] - 90 : 2750), await page.evaluate(() => document.documentElement.scrollHeight - innerHeight));
  const steps = [];
  for (let y = 0; y <= target; y += 12) steps.push({ run: async () => { await page.evaluate(v => window.scrollTo(0, v), y); await wait(page, 45); }, t_ms: y });
  if (steps[steps.length - 1].t_ms !== target) steps.push({ run: async () => { await page.evaluate(v => window.scrollTo(0, v), target); await wait(page, 45); }, t_ms: target });
  await shot(page, 'dash_scroll', steps);
  B.dash_scroll = { note: 't_ms equals window.scrollY in CSS px; page-space boxes are in dash_top (scrollY 0)', target, execTable: b.execTable, callActivity: b.callActivity, roi: b.roi };
  saveBoxes(B);
};

S.leads = async (page, B) => {
  await L.visit(page, '/leads', { settleMs: 3500 });
  const tabs = await page.evaluate(() => [...document.querySelectorAll('a, button, li, div')].filter(e => { const r = e.getBoundingClientRect(); return r.y > 160 && r.y < 240 && r.height > 30 && r.height < 80 && r.width > 150 && r.width < 400 && /^(New|In Follow Up|Won|Lost)\b/.test((e.innerText || '').trim()); })
    .map(e => { const r = e.getBoundingClientRect(); return [(e.innerText || '').trim().replace(/\s+/g, ' '), [r.x, r.y, r.width, r.height].map(Math.round)]; }));
  const b = {
    tabs, tabRow: [277, 168, 1622, 64],
    natureView: await boxByText(page, /^Nature View$/), statusView: await boxByText(page, /^Status View$/),
    filterBtn: await boxOf(page, '#btn-toggle-filter'), search: await boxOf(page, 'input[placeholder="Search here"]'),
    leadSourceCol: await boxByText(page, /^Lead Source$/, { yMin: 230, yMax: 280 }),
    table: await boxOf(page, 'table'),
  };
  await still(page, 'leads_nature', B, b);
  const sv = await clickBox(page, b.statusView, 'Status View');
  await wait(page, 3500);
  await still(page, 'leads_status', B, { click: sv, tabRow: [277, 168, 1510, 64] });
  const fb = await clickBox(page, b.filterBtn, 'filter');
  await wait(page, 2500);
  await still(page, 'leads_filter', B, { click: fb, panel: await boxOf(page, '.offcanvas.show') });
  await page.locator('.offcanvas.show .btn-close').first().click({ timeout: 4000 }).catch(async () => { await page.keyboard.press('Escape'); });
  await wait(page, 1500);
};

S.transfer = async (page, B) => {
  await L.visit(page, '/bulk-lead-transfer', { settleMs: 3500 });
  await still(page, 'transfer', B, {
    title: await boxByText(page, /^Bulk Lead Transfer$/, { yMax: 130 }),
    filterCard: await cardBox(page, 'Filter Leads'),
    applyBtn: await boxByText(page, /^Apply Filters$/),
    assignee: await boxByText(page, /^Current Assignee$/),
  });
};

S.fu = async (page, B) => {
  await L.visit(page, '/followups', { settleMs: 3500 });
  const tabBox = async re => page.evaluate(src => { const rx = new RegExp(src); const e = [...document.querySelectorAll('a, button, li, div')].filter(e => { const r = e.getBoundingClientRect(); return r.y > 160 && r.y < 240 && r.height > 30 && r.height < 80 && r.width > 150 && r.width < 400 && rx.test((e.innerText || '').trim()); }).sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }, re.source);
  const b = {
    today: await tabBox(/^Today/), delayed: await tabBox(/^Delayed/), upcoming: await tabBox(/^Upcoming/), non: await tabBox(/^Non Followup/),
    listView: await boxByText(page, /^List View$/), kanbanView: await boxByText(page, /^Kanban View$/),
    table: await boxOf(page, 'table'), tabRow: [277, 168, 1297, 64],
  };
  await still(page, 'fu_today', B, b);
  for (const [k, id] of [['delayed', 'fu_delayed'], ['upcoming', 'fu_upcoming'], ['non', 'fu_non']]) {
    const c = await clickBox(page, b[k], k); await wait(page, 3000);
    await still(page, id, B, { click: c });
  }
  const t = await clickBox(page, b.today, 'today'); await wait(page, 2500);
  const k = await clickBox(page, b.kanbanView, 'Kanban View'); await wait(page, 4000);
  const board = await page.evaluate(() => {
    const e = [...document.querySelectorAll('div')].filter(d => d.scrollWidth > d.clientWidth + 60 && d.getBoundingClientRect().width > 900 && d.querySelector('.kb-card'))
      .sort((a, b) => b.scrollWidth - a.scrollWidth)[0];
    if (!e) return null; e.setAttribute('data-kb-board', '1'); const r = e.getBoundingClientRect();
    return { box: [r.x, r.y, r.width, r.height].map(Math.round), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth };
  });
  const firstCard = await boxOf(page, '.kb-card');
  await still(page, 'fu_kanban', B, { click: k, todayClick: t, board, firstCard });
  if (board) {
    const max = Math.min(board.scrollWidth - board.clientWidth, 1400);
    const steps = [];
    for (let x = 0; x <= max; x += 12) steps.push({ run: async () => { await page.evaluate(v => { document.querySelector('[data-kb-board]').scrollLeft = v; }, x); await wait(page, 45); }, t_ms: x });
    await shot(page, 'fu_kanban_scroll', steps);
    B.fu_kanban_scroll = { note: 't_ms equals board scrollLeft in CSS px', max };
    saveBoxes(B);
    await page.evaluate(() => { document.querySelector('[data-kb-board]').scrollLeft = 0; });
  }
};

S.calls = async (page, B) => {
  await L.visit(page, '/call-analysis', { settleMs: 3500 });
  const heads = await page.evaluate(() => [...document.querySelectorAll('thead th')].map(th => { const r = th.getBoundingClientRect(); return [(th.innerText || '').trim(), [r.x, r.y, r.width, r.height].map(Math.round)]; }));
  const eye = await boxOf(page, 'a[id^="ca-view-"]');
  const firstRow = await page.evaluate(() => { const a = document.querySelector('a[id^="ca-view-"]'); const tr = a && a.closest('tr'); if (!tr) return null; const r = tr.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); });
  await still(page, 'calls', B, { heads, eye, firstRow, table: await boxOf(page, 'table') });
  const c = await clickBox(page, eye, 'view details');
  await wait(page, 3500);
  const m = await page.evaluate(() => {
    const md = document.querySelector('.modal.show .modal-content'); if (!md) return null;
    const bx = e => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); };
    const leaf = t => [...md.querySelectorAll('*')].find(e => e.children.length === 0 && (e.innerText || '').trim() === t);
    const blockFrom = t => { const h = leaf(t); if (!h) return null; const n = h.nextElementSibling; const a = h.getBoundingClientRect(), b = n ? n.getBoundingClientRect() : a; return [a.x, a.y, Math.max(a.width, b.width), b.y + b.height - a.y].map(Math.round); };
    return { modal: bx(md), scores: bx((leaf('Lead Score') || md).parentElement.parentElement), summary: blockFrom('Summary'), coaching: blockFrom('Coaching Note'), transcript: blockFrom('Transcript'), close: bx([...md.querySelectorAll('button')].find(b => (b.innerText || '').trim() === 'Close')) };
  });
  await still(page, 'calls_detail', B, Object.assign({ click: c }, m || {}));
  await page.locator('.modal.show button', { hasText: 'Close' }).first().click({ timeout: 4000 }).catch(async () => { await page.keyboard.press('Escape'); });
  await wait(page, 1500);
};

S.perf = async (page, B) => {
  await L.visit(page, '/executive-performance', { settleMs: 4000 });
  const heads = await page.evaluate(() => [...document.querySelectorAll('thead th')].map(th => { const r = th.getBoundingClientRect(); return [(th.innerText || '').trim(), [r.x, r.y, r.width, r.height].map(Math.round)]; }));
  const top3 = await page.evaluate(() => [...document.querySelectorAll('div')].filter(d => /^#[123]/.test((d.innerText || '').trim()) && d.getBoundingClientRect().height > 60 && d.getBoundingClientRect().height < 120)
    .map(d => { const r = d.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }).filter((v, i, a) => a.findIndex(w => w[0] === v[0]) === i));
  await still(page, 'perf', B, {
    heads, top3,
    formula: await boxByText(page, /^Score = Target/),
    kpis: await page.evaluate(() => { const e = [...document.querySelectorAll('div')].find(d => /^Total Leads/.test((d.innerText || '').trim()) && d.getBoundingClientRect().height < 120); let c = e; while (c && c.getBoundingClientRect().width < 1500) c = c.parentElement; if (!c) return null; const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }),
    table: await boxOf(page, 'table'),
  });
};

// ---- WhatsApp module and Lead Expenses: navigation only (no conversation opened, no form touched)
S.wachat = async (page, B) => {
  await L.visit(page, '/chat', { settleMs: 4500 });
  // chat list: blur contact names/numbers and message previews (left list column), keep the dates
  await page.evaluate(() => {
    document.querySelectorAll('body *').forEach(e => {
      const own = [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
      if (!own) return;
      const r = e.getBoundingClientRect();
      if (r.width < 2) return;
      if (r.x >= 340 && r.x < 590 && r.y > 360 && r.y < 1040) e.classList.add('pv-blur');
    });
  });
  await still(page, 'wa_chat', B, {
    list: [285, 310, 398, 720], filters: await boxByText(page, /^Unread$/), search: await boxOf(page, 'input[placeholder="Search Chat"]'),
    tabs: [285, 262, 398, 44], panel: [693, 77, 1198, 950],
  });
};
S.wabc = async (page, B) => {
  await L.visit(page, '/broadcasts', { settleMs: 3500 });
  const heads = await page.evaluate(() => [...document.querySelectorAll('thead th')].map(th => { const r = th.getBoundingClientRect(); return [(th.innerText || '').trim(), [r.x, r.y, r.width, r.height].map(Math.round)]; }));
  await still(page, 'wa_broadcasts', B, { heads, table: await boxOf(page, 'table'), newBtn: await boxByText(page, /^New Broadcast/) });
};
S.wacb = async (page, B) => {
  await L.visit(page, '/customer-broadcast', { settleMs: 3500 });
  await still(page, 'wa_cb_form', B, {
    card: await cardBox(page, 'Create Customer Broadcast'), title: await boxByText(page, /^Title:\*?$/), template: await boxByText(page, /^Template:\s*\*?$/),
    recipients: await cardBox(page, 'Selected Recipients'), sendAt: await boxByText(page, /^Send at:?$/), preview: await boxByText(page, /^Template preview:?$/),
    createBtn: await boxByText(page, /^Create Broadcast$/),
  });
};
S.wabot = async (page, B) => {
  await L.visit(page, '/chatbots', { settleMs: 3500 });
  await still(page, 'wa_chatbots', B, { table: await boxOf(page, 'table'), greeting: await boxByText(page, /^Hi @Name!/) });
};
S.wakb = async (page, B) => {
  await L.visit(page, '/knowledge-base', { settleMs: 3500 });
  await still(page, 'wa_kb', B, { list: await cardBox(page, 'Knowledge Bases'), sources: await cardBox(page, 'Sources'), note: await boxByText(page, /^Select a knowledge base/) });
};
S.watpl = async (page, B) => {
  await L.visit(page, '/whatsapp-templates', { settleMs: 3500 });
  const heads = await page.evaluate(() => [...document.querySelectorAll('thead th')].map(th => { const r = th.getBoundingClientRect(); return [(th.innerText || '').trim(), [r.x, r.y, r.width, r.height].map(Math.round)]; }));
  await still(page, 'wa_templates', B, { heads, table: await boxOf(page, 'table') });
};
S.exp = async (page, B) => {
  await L.visit(page, '/lead-expenses', { settleMs: 3500 });
  await still(page, 'lead_expenses', B, {
    filters: await cardBox(page, 'Lead Source'), list: await cardBox(page, 'Expenses'), total: await boxByText(page, /^Total:/),
    table: await boxOf(page, 'table'), addBtn: await boxByText(page, /^Add Expense/),
  });
};

S.logo = async (page, B) => {
  // the app's own brand-logo files (static assets of the product, same origin)
  await L.visit(page, '/home', { settleMs: 2500 });
  const got = {};
  for (const name of ['white-logo.png', 'black-logo.png']) {
    const res = await page.request.get(`${L.BASE}/assets/images/brand-logos/${name}`);
    if (res.ok()) { fs.writeFileSync(path.join(CAP, name), await res.body()); got[name] = true; }
    console.log(`  ${name}: HTTP ${res.status()}`);
  }
  const bg = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')].find(i => /white-logo\.png/.test(i.src) && i.getBoundingClientRect().width > 0);
    let e = img; while (e && getComputedStyle(e).backgroundColor.replace(/\s/g, '') === 'rgba(0,0,0,0)') e = e.parentElement;
    return e ? getComputedStyle(e).backgroundColor : null;
  });
  B.logo = { files: got, sidebarBg: bg };
  saveBoxes(B);
  console.log('  sidebar background:', bg);
};

(async () => {
  const want = process.argv.slice(2);
  if (!want.length) { console.log('usage: 05_capture.js ' + Object.keys(S).join(' ')); process.exit(2); }
  L.ensureDir(CAP);
  const B = loadBoxes();
  const { browser, page } = await L.openApp({ dsf: 2 });
  try {
    for (const k of want) {
      if (!S[k]) { console.log('unknown section', k); continue; }
      console.log(`== ${k}`);
      try { await S[k](page, B); }
      catch (e) { console.log(`  ERROR in ${k}:`, String(e.message).split('\n')[0]); await page.screenshot({ path: path.join(CAP, `_error_${k}.jpg`), ...JPG }).catch(() => {}); process.exitCode = 1; }
      await wait(page, 2000);
    }
  } finally {
    await browser.close();
  }
})();
