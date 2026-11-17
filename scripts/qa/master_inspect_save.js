'use strict';
/**
 * Master modules whose Add form the generic filler could not see: open the
 * listing, show every plausible Add control, click it, describe the form that
 * appears (every control with its label), fill it by label, Save, and look the
 * record up in the listing through its own search box.
 *
 *   HEADED=1 node scripts/qa/master_inspect_save.js [/customers,/dealers,...]
 */
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../../erp/common/LoginPage');
const BASE = process.env.BASE_URL, REPO = path.join(__dirname, '..', '..');
const C = { company: process.env.COMPANY_CODE, username: process.env.CRM_USERNAME, password: process.env.PASSWORD };
const ROUTES = (process.argv[2] || '/customers,/dealers,/payment-terms,/suppliers').split(',');
const STAMP = Date.now(); const OUT = {};
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

const listAddControls = () => { const on = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  return [...document.querySelectorAll('button, a, [role=button]')].filter(on).map((e, i) => ({ i, tag: e.tagName, text: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30), title: e.title || e.getAttribute('aria-label') || '', href: e.getAttribute('href') || '', id: e.id, icon: [...e.querySelectorAll('i,svg')].map((x) => x.className?.baseVal ?? x.className).join(' ').slice(0, 40) }))
    .filter((b) => /add|new|create|plus/i.test(`${b.text} ${b.title} ${b.href} ${b.id} ${b.icon}`)); };
const describeForm = () => { const clean = (x) => (x || '').replace(/\s+/g, ' ').trim(); const on = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const root = document.querySelector('.modal.show') || document.querySelector('form') || document.body;
  const label = (e) => clean((e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || e.closest('.form-group,.mb-3,.mb-2,.col,.col-md-6,.col-md-4,.col-md-3,.col-12,div')?.querySelector('label')?.innerText || e.getAttribute('aria-label') || e.placeholder || '');
  return { url: location.pathname, modal: !!document.querySelector('.modal.show'), rootTag: root.tagName + (root.className ? '.' + String(root.className).split(' ')[0] : ''),
    controls: [...root.querySelectorAll('input, select, textarea')].filter(on).filter((e) => !['hidden', 'submit', 'button', 'file'].includes(e.type)).filter((e) => !/^filter|page_size|search/i.test(e.id || '')).map((e) => ({ tag: e.tagName, type: e.type, id: e.id, name: e.name, ph: e.placeholder || '', label: label(e), required: e.required || !!e.closest('.required') || /\*/.test(label(e)) , options: e.tagName === 'SELECT' ? [...e.options].map((o) => ({ v: o.value, t: clean(o.text) })).filter((o) => o.v && o.v !== '0' && !/^(choose|select|--)/i.test(o.t)).slice(0, 3) : undefined })),
    buttons: [...root.querySelectorAll('button')].filter(on).map((b) => ({ text: clean(b.innerText).slice(0, 20), id: b.id })).filter((b) => b.text) }; };

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0 });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const net = []; page.on('response', (r) => { const q = r.request(); if (['POST', 'PUT'].includes(q.method()) && /\/api\//.test(q.url()) && !/notification|negotiate/i.test(q.url())) net.push({ t: Date.now(), url: q.url().split('?')[0].replace(/^.*\/api\//, '/api/'), status: r.status() }); });
  try {
    await new LoginPage(page).login(C.company, C.username, C.password); await page.waitForTimeout(2000);
    for (const route of ROUTES) {
      const NAME = `QA_${route.replace(/\W+/g, '').slice(0, 10)}_${STAMP}`; const R = { route, name: NAME };
      console.log(`\n══ ${route} ══`);
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(4500);
      const adds = await page.evaluate(listAddControls); R.addControls = adds;
      console.log('  add controls:', adds.length ? adds.map((a) => `[${a.tag} "${a.text || a.title || a.icon}"${a.href ? ' → ' + a.href : ''}]`).join(' ') : 'NONE');
      if (!adds.length) { console.log('  ⚪ no Add control on this listing'); OUT[route] = R; continue; }
      const pick = adds.find((a) => /add|new|create/i.test(a.text)) || adds[0];
      const loc = page.locator('button:visible, a:visible, [role=button]:visible').filter({ hasText: pick.text || undefined }).first();
      if (pick.text) await loc.click({ timeout: 8000 }).catch(async () => page.locator(`#${pick.id}`).click().catch(() => {}));
      else if (pick.id) await page.locator(`#${pick.id}`).click().catch(() => {});
      else if (pick.href) await page.goto(`${BASE}${pick.href}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(4500);
      const form = await page.evaluate(describeForm); R.form = form;
      console.log(`  after click: ${form.url} modal=${form.modal} root=${form.rootTag}`);
      console.log('  controls:', form.controls.length ? '' : 'NONE');
      form.controls.forEach((c) => console.log(`    ${c.tag.toLowerCase().padEnd(8)} #${(c.id || c.name || '-').padEnd(26)} "${c.label}"${c.required ? ' *' : ''}${c.ph ? ' ph="' + c.ph + '"' : ''}${c.options ? ' opts=' + JSON.stringify(c.options.map((o) => o.t)) : ''}`));
      console.log('  buttons:', form.buttons.map((b) => `"${b.text}"${b.id ? '#' + b.id : ''}`).join(' '));
      if (!form.controls.length) { console.log('  ⚪ no form appeared'); OUT[route] = R; await page.keyboard.press('Escape').catch(() => {}); continue; }
      const scope = form.modal ? page.locator('.modal.show').first() : page;
      const filled = [];
      for (const c of form.controls) {
        const key = `${c.label} ${c.id} ${c.name} ${c.ph}`.toLowerCase(); const sel = c.id ? `#${c.id}` : `[name="${c.name}"]`;
        if (c.tag === 'SELECT') { if (c.options?.length) { await scope.locator(sel).first().selectOption(c.options[0].v).catch(() => {}); filled.push(`${c.label || c.id}=${c.options[0].t}`); } continue; }
        let v = null;
        if (/e-?mail/.test(key)) v = `qa${STAMP}@example.com`;
        else if (/phone|mobile|contact ?(no|number)|whatsapp/.test(key)) v = String(STAMP).slice(-10);
        else if (/\bgst\b|\bpan\b|\btax\b|\bvat\b|\btrn\b/.test(key)) v = null;
        else if (/\bcode\b/.test(key)) v = `QA${String(STAMP).slice(-6)}`;
        else if (/name|title|term|type/.test(key) && !/user ?name|file/.test(key)) v = NAME;
        else if (/days?|credit|limit|discount|qty|quantity|amount|rate|percent/.test(key) || c.type === 'number') v = '1';
        else if (/address|remark|note|description/.test(key)) v = `QA note ${STAMP}`;
        else if (c.required && c.type !== 'date') v = NAME;
        if (v === null) continue;
        const ok = await scope.locator(sel).first().fill(v).then(() => true).catch(() => false);
        if (ok) filled.push(`${c.label || c.id}=${v}`);
      }
      console.log('  filled:', filled.join(' · ') || 'nothing');
      R.filled = filled; const t0 = Date.now();
      const save = scope.locator('button:visible').filter({ hasText: /^\s*(save|create|submit|add)\s*$/i }).first();
      if (!(await save.count())) { console.log('  ⚪ no Save button in form'); OUT[route] = R; continue; }
      await save.click({ timeout: 8000 }).catch((e) => console.log('  save click failed:', e.message.split('\n')[0]));
      await page.waitForTimeout(6000);
      const after = await page.evaluate(() => ({ url: location.pathname, modal: !!document.querySelector('.modal.show'),
        alert: (document.querySelector('.swal2-popup,.toast,.alert') ? [...document.querySelectorAll('.swal2-popup,.toast,.alert')].map((e) => e.innerText).join(' | ') : '').replace(/\s+/g, ' ').trim().slice(0, 140),
        validation: [...document.querySelectorAll('.validation-message,.invalid-feedback,.text-danger,.field-validation-error')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 6),
        error: /oops|went wrong|error code|exception/i.test(document.body.innerText) }));
      R.afterSave = after; R.posts = net.filter((n) => n.t >= t0);
      console.log(`  after save: ${after.url} modal=${after.modal} POSTs=${R.posts.map((p) => p.status + ' ' + p.url).join(', ') || 'none'}${after.alert ? ' alert="' + after.alert + '"' : ''}${after.validation.length ? ' validation=' + JSON.stringify(after.validation) : ''}${after.error ? ' ERROR' : ''}`);
      await page.keyboard.press('Escape').catch(() => {});
      // Look it up in the listing through the listing's own search box.
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(4000);
      const sb = page.locator('#filter-name, input[placeholder*="Search" i], input[id*="search" i]').first();
      if (await sb.count()) { await sb.fill(NAME).catch(() => {}); await page.keyboard.press('Enter').catch(() => {}); await page.locator('button:has-text("Search"), [title="Search"]').first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(3500); }
      await page.selectOption('#page_size', '100').catch(() => {}); await page.waitForTimeout(2500);
      const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
      const hit = rows.find((r) => r.includes(NAME)); R.listed = !!hit; R.listingRows = rows.length;
      console.log(hit ? `  ✅ SAVED — in listing: ${hit.slice(0, 120)}` : `  ❌ NOT IN LISTING (${rows.length} rows${rows[0] ? '; first: ' + rows[0].slice(0, 60) : ''})`);
      OUT[route] = R;
    }
  } catch (e) { console.log('\nFATAL:', e.message.split('\n')[0].slice(0, 160)); }
  finally { if (process.env.HEADED) await page.waitForTimeout(3000); await browser.close(); }
  const out = path.join(REPO, 'reports', 'qa', 'raw', `master-inspect-${String(C.company).replace(/\W+/g, '_')}.json`);
  fs.writeFileSync(out, JSON.stringify(OUT, null, 2)); console.log(`\n  ${path.relative(REPO, out)}`);
})();
