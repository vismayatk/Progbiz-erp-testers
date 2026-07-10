// Retry: PW-1/PW-3 (form validation, POSTs aborted), PW-18 (find Brand Consulting), PW-12 (/contact phone)
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const OUT = 'C:/Users/PROBOOK/AppData/Local/Temp/claude/C--Users-PROBOOK-erp-tests-git-max/7ab0352e-1d83-4eb1-814d-6219ca09b978/scratchpad/qa-verify';
const BASE = 'https://progbiz.io';
const R = {};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const posts = [];
  await ctx.route('**/*', (route) => {
    const m = route.request().method();
    if (m === 'POST' || m === 'PUT') { posts.push(m + ' ' + route.request().url().slice(0, 140)); return route.abort(); }
    return route.continue();
  });
  const go = async (r) => { await page.goto(BASE + r, { waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(2800); };

  async function fillContactForm({ phoneVal, emailVal }) {
    await go('/contact');
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: /send message/i }) }).first();
    await form.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const fields = await form.locator('input, textarea, select').all();
    const meta = [];
    for (const f of fields) {
      const info = await f.evaluate((el) => ({ tag: el.tagName, type: el.type || '', ph: el.placeholder || '', name: el.name || '' }));
      meta.push(info);
      if (info.tag === 'SELECT') { await f.selectOption({ index: 1 }).catch(() => {}); continue; }
      if (info.tag === 'TEXTAREA') { await f.fill('QA validation check'); continue; }
      const hint = (info.ph + ' ' + info.name + ' ' + info.type).toLowerCase();
      if (/mail|@/.test(hint)) await f.fill(emailVal);
      else if (/\+91|phone|contact|tel|number/.test(hint)) await f.fill(phoneVal);
      else if (/location|city/.test(hint)) await f.fill('Kannur');
      else await f.fill('QA Test');
    }
    const pre = await page.innerText('body');
    posts.length = 0;
    await form.getByRole('button', { name: /send message/i }).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const post = await page.innerText('body');
    const newText = post.split('\n').filter((l) => !pre.includes(l) && l.trim()).slice(0, 12);
    const validity = await form.evaluate((f) => [...f.querySelectorAll('input,textarea')].map((i) => ({ ph: i.placeholder || i.name, value: (i.value || '').slice(0, 20), valid: i.checkValidity ? i.checkValidity() : null })));
    return { fieldMeta: meta, postsAttempted: [...posts], newVisibleText: newText, validity };
  }

  try { R['PW-1'] = await fillContactForm({ phoneVal: '1', emailVal: 'qa.test@example.com' }); await page.screenshot({ path: path.join(OUT, 'PW-1-phone-validation.png') }); } catch (e) { R['PW-1'] = { error: e.message.split('\n')[0] }; }
  try { R['PW-3'] = await fillContactForm({ phoneVal: '9876543210', emailVal: 'test@' }); await page.screenshot({ path: path.join(OUT, 'PW-3-email-validation.png') }); } catch (e) { R['PW-3'] = { error: e.message.split('\n')[0] }; }

  // PW-12 completeness: phone strings on /contact
  try {
    await go('/contact');
    R['PW-12-contact'] = await page.evaluate(() => [...new Set(document.body.innerText.match(/\+91[\d ]{8,14}/g) || [])]);
  } catch (e) { R['PW-12-contact'] = { error: e.message.split('\n')[0] }; }

  // PW-18: find the Brand Consulting page
  try {
    R['PW-18'] = { probes: {}, seeOurWork: {} };
    for (const u of ['/service/brand-consulting', '/brand-consulting', '/service/branding/brand-consulting', '/services/brand-consulting']) {
      try { const r = await ctx.request.get(BASE + u, { timeout: 20000 }); R['PW-18'].probes[u] = r.status(); } catch { R['PW-18'].probes[u] = 'ERR'; }
    }
    // find links mentioning consulting anywhere on service/branding + service pages
    for (const src of ['/service/branding', '/service']) {
      await go(src);
      const links = await page.$$eval('a', (as) => [...new Set(as.filter((a) => /consult/i.test((a.innerText || '') + (a.getAttribute('href') || ''))).map((a) => a.getAttribute('href')))]);
      if (links.length) R['PW-18'].probes['linksOn ' + src] = links;
      // any See Our Work button here?
      const sow = await page.$$eval('a,button', (els) => els.filter((e) => /see our work/i.test((e.innerText || '').trim())).map((e) => ({ tag: e.tagName, href: e.getAttribute('href') })));
      if (sow.length) R['PW-18'].seeOurWork[src] = sow;
    }
    // check working 200 probes for the button
    for (const [u, s] of Object.entries(R['PW-18'].probes)) {
      if (s === 200 && u.startsWith('/')) {
        await go(u);
        const sow = await page.$$eval('a,button', (els) => els.filter((e) => /see our work/i.test((e.innerText || '').trim())).map((e) => ({ tag: e.tagName, href: e.getAttribute('href') })));
        R['PW-18'].seeOurWork[u] = sow;
        const title = await page.title();
        R['PW-18'].seeOurWork[u + ' :title'] = title;
      }
    }
  } catch (e) { R['PW-18'] = { error: e.message.split('\n')[0] }; }

  fs.writeFileSync(path.join(OUT, 'results2.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 1));
  await browser.close();
})();
