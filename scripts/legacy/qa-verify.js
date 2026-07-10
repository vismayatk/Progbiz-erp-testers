// Re-verify the 16 "Need qa" issues on live progbiz.io. No real form submissions:
// all POST/PUT requests are intercepted and aborted.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const OUT = 'C:/Users/PROBOOK/AppData/Local/Temp/claude/C--Users-PROBOOK-erp-tests-git-max/7ab0352e-1d83-4eb1-814d-6219ca09b978/scratchpad/qa-verify';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'https://progbiz.io';
const R = {}; // results
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const posts = [];
  await ctx.route('**/*', (route) => {
    const m = route.request().method();
    if (m === 'POST' || m === 'PUT') { posts.push(m + ' ' + route.request().url().slice(0, 120)); return route.abort(); }
    return route.continue();
  });
  const go = async (r) => { await page.goto(BASE + r, { waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(2800); };

  // ---------- PW-21: /solution ERP card href + target status ----------
  try {
    await go('/solution');
    const hrefs = await page.$$eval('a', (as) => as.map((a) => a.getAttribute('href')).filter((h) => h && /\/solution\/erp/.test(h)));
    const uniq = [...new Set(hrefs)];
    const statuses = {};
    for (const h of uniq) { const r = await ctx.request.get(BASE + h.replace(/^https?:\/\/[^/]+/, ''), { timeout: 30000 }); statuses[h] = r.status(); }
    R['PW-21'] = { erpHrefs: uniq, statuses };
    await shot(page, 'PW-21-solution');
  } catch (e) { R['PW-21'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-22: contact dropdown options; PW-17: header Let's Talk on /contact ----------
  try {
    await go('/contact');
    const opts = await page.$$eval('select option', (os) => os.map((o) => o.textContent.trim()));
    R['PW-22'] = { options: opts };
    const letsTalk = await page.$$eval('a', (as) => as.filter((a) => /let'?s talk/i.test(a.innerText)).map((a) => ({ href: a.getAttribute('href'), visible: !!a.offsetParent })));
    R['PW-17'] = { letsTalkOnContact: letsTalk };
    // PW-16: Talk To Our Experts on contact page
    const btn = page.getByRole('button', { name: /talk to our expert/i }).first();
    const cnt = await btn.count();
    let before = null, after = null, scrollBefore = 0, scrollAfter = 0;
    if (cnt) {
      await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
      before = page.url(); scrollBefore = await page.evaluate(() => window.scrollY);
      await btn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      after = page.url(); scrollAfter = await page.evaluate(() => window.scrollY);
    }
    R['PW-16'] = { buttonFound: cnt > 0, urlBefore: before, urlAfter: after, scrollDelta: Math.abs(scrollAfter - scrollBefore), navigated: before !== after };
    await shot(page, 'PW-16-contact-after-click');
  } catch (e) { R['PW-22'] = R['PW-22'] || { error: e.message.split('\n')[0] }; }

  // ---------- PW-1: phone validation (dummy data, POSTs aborted) ----------
  try {
    await go('/contact');
    await page.locator('input').first().fill('QA Test');                       // Name
    const sel = page.locator('select').first(); await sel.selectOption({ index: 1 });
    const inputs = page.locator('form input');
    // find fields by placeholder
    const email = page.locator('input[placeholder*="@"], input[type=email]').first();
    if (await email.count()) await email.fill('qa.test@example.com');
    const phone = page.locator('input[placeholder*="+91"], input[type=tel]').first();
    if (await phone.count()) await phone.fill('1'); else await inputs.nth(2).fill('1');
    const msg = page.locator('textarea').first(); if (await msg.count()) await msg.fill('QA validation check');
    const preText = await page.innerText('body');
    const send = page.getByRole('button', { name: /send message/i }).first();
    await send.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const postText = await page.innerText('body');
    const newText = postText.split('\n').filter((l) => !preText.includes(l) && l.trim()).slice(0, 10);
    const validity = await page.evaluate(() => [...document.querySelectorAll('form input, form textarea')].map((i) => ({ ph: i.placeholder || i.name, valid: i.checkValidity ? i.checkValidity() : null, ariaInvalid: i.getAttribute('aria-invalid') })));
    R['PW-1'] = { postsAttempted: [...posts], newVisibleText: newText, fieldValidity: validity };
    await shot(page, 'PW-1-phone-validation');
    posts.length = 0;
  } catch (e) { R['PW-1'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-3: invalid email validation ----------
  try {
    await go('/contact');
    await page.locator('input').first().fill('QA Test');
    const sel = page.locator('select').first(); await sel.selectOption({ index: 1 });
    const email = page.locator('input[placeholder*="@"], input[type=email]').first();
    if (await email.count()) await email.fill('test@');
    const phone = page.locator('input[placeholder*="+91"], input[type=tel]').first();
    if (await phone.count()) await phone.fill('9876543210');
    const msg = page.locator('textarea').first(); if (await msg.count()) await msg.fill('QA validation check');
    const preText = await page.innerText('body');
    const send = page.getByRole('button', { name: /send message/i }).first();
    await send.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const postText = await page.innerText('body');
    const newText = postText.split('\n').filter((l) => !preText.includes(l) && l.trim()).slice(0, 10);
    R['PW-3'] = { postsAttempted: [...posts], newVisibleText: newText };
    await shot(page, 'PW-3-email-validation');
    posts.length = 0;
  } catch (e) { R['PW-3'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-2: about hero watermark overlap ----------
  try {
    await go('/about');
    const overlap = await page.evaluate(() => {
      const h = [...document.querySelectorAll('h1,h2')].find((e) => /9 Years of Turning/i.test(e.innerText));
      if (!h) return { headingFound: false };
      const hr = h.getBoundingClientRect();
      // find big decorative PROGBIZ text elements (not header logo)
      const wm = [...document.querySelectorAll('div,span,p,h1,h2')].filter((e) => e.children.length === 0 && /^PROGBIZ$/i.test((e.innerText || '').trim()) && e.getBoundingClientRect().width > 400);
      const boxes = wm.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      const inter = boxes.some((b) => !(hr.right < b.x || b.x + b.w < hr.x || hr.bottom < b.y || b.y + b.h < hr.y));
      return { headingFound: true, headingRect: { x: hr.x, y: hr.y, w: hr.width, h: hr.height }, watermarks: boxes, intersects: inter };
    });
    R['PW-2'] = overlap;
    await shot(page, 'PW-2-about-hero');
  } catch (e) { R['PW-2'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-15: about video state ----------
  try {
    await page.waitForTimeout(6000);
    R['PW-15'] = await page.evaluate(() => [...document.querySelectorAll('video')].map((v) => ({ src: (v.currentSrc || '').slice(0, 120), readyState: v.readyState, paused: v.paused, currentTime: Math.round(v.currentTime * 10) / 10, networkState: v.networkState, autoplay: v.autoplay, muted: v.muted })));
  } catch (e) { R['PW-15'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-4: video production CTA ----------
  try {
    await go('/service/video-production');
    const links = await page.$$eval('a,button', (els) => els.filter((e) => /start your video project/i.test(e.innerText || '')).map((e) => ({ tag: e.tagName, href: e.getAttribute('href') })));
    R['PW-4'] = { elements: links };
    for (const l of links) if (l.href) {
      try { const rs = await ctx.request.get(l.href.startsWith('http') ? l.href : BASE + l.href, { timeout: 30000 }); R['PW-4'].status = rs.status(); R['PW-4'].target = l.href; }
      catch (e2) { R['PW-4'].status = 'UNREACHABLE: ' + e2.message.split('\n')[0].slice(0, 80); R['PW-4'].target = l.href; }
    }
    if (links.length && !links.some((l) => l.href)) { // it's a button: click and see
      const b = page.getByRole('button', { name: /start your video project/i }).first();
      const before = page.url(); await b.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(2500);
      R['PW-4'].clickNavigatedTo = page.url() !== before ? page.url() : 'no navigation';
      if (page.url() !== before) { R['PW-4'].landedTitle = await page.title(); }
      await shot(page, 'PW-4-after-click');
    }
  } catch (e) { R['PW-4'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-5: ERP page dual CTAs ----------
  try {
    await go('/solution/erp-software');
    R['PW-5'] = await page.$$eval('a,button', (els) => els.filter((e) => /request a demo|book a free trial/i.test((e.innerText || '').trim())).map((e) => ({ text: (e.innerText || '').trim().slice(0, 30), tag: e.tagName, href: e.getAttribute('href') })));
  } catch (e) { R['PW-5'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-6: CRM Book a demo ----------
  try {
    await go('/solution/crm');
    const info = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('a,button')].find((e) => /book a demo/i.test((e.innerText || '').trim()));
      const form = [...document.querySelectorAll('form')].find((f) => /get started|name/i.test(f.innerText || ''));
      const fr = form ? form.getBoundingClientRect() : null;
      return { btn: btn ? { tag: btn.tagName, href: btn.getAttribute('href'), text: (btn.innerText || '').trim().slice(0, 30) } : null, formInHeroViewport: fr ? fr.top < innerHeight && fr.top > -fr.height : false };
    });
    R['PW-6'] = info;
    await shot(page, 'PW-6-crm-hero');
  } catch (e) { R['PW-6'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-10: footer timestamp overlap (desktop) ----------
  try {
    await go('/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const ts = [...document.querySelectorAll('div,p,span')].filter((e) => e.children.length === 0 && /20\d\d at .*(am|pm)/i.test(e.innerText || '')).pop();
      const btn = [...document.querySelectorAll('a,button,div')].find((e) => /scroll to top/i.test(e.getAttribute('aria-label') || '') || /scroll to top/i.test(e.innerText || ''));
      if (!ts) return { tsFound: false };
      const a = ts.getBoundingClientRect(); const b = btn ? btn.getBoundingClientRect() : null;
      const overlap = b ? !(a.right < b.x || b.right < a.x || a.bottom < b.y || b.bottom < a.y) : null;
      return { tsFound: true, tsText: ts.innerText.slice(0, 50), ts: { x: Math.round(a.x), y: Math.round(a.y), r: Math.round(a.right) }, btn: b ? { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right) } : null, overlap, viewportW: innerWidth };
    });
    R['PW-10'] = m;
    await shot(page, 'PW-10-footer');
  } catch (e) { R['PW-10'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-11: home Experience Design card truncation ----------
  try {
    const t = await page.evaluate(() => {
      const el = [...document.querySelectorAll('p,div')].find((e) => e.children.length === 0 && /We design websites and apps that are intuitive/i.test(e.innerText || ''));
      if (!el) return { found: false };
      const s = getComputedStyle(el);
      return { found: true, text: el.innerText.slice(0, 160), clamp: s.webkitLineClamp || s['-webkit-line-clamp'] || 'none', overflowHidden: s.overflow === 'hidden', scrollH: el.scrollHeight, clientH: el.clientHeight };
    });
    R['PW-11'] = t;
  } catch (e) { R['PW-11'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-12: footer labels ----------
  try {
    R['PW-12'] = await page.evaluate(() => {
      const links = [...document.querySelectorAll('footer a, a')].map((a) => (a.innerText || '').trim());
      return {
        hasServiceSingular: links.includes('Service'),
        hasServicesPlural: links.includes('Services'),
        hasEcommerce: links.includes('Ecommerce'),
        phoneStrings: [...new Set((document.body.innerText.match(/\+91[\d ]{8,14}/g) || []))],
      };
    });
  } catch (e) { R['PW-12'] = { error: e.message.split('\n')[0] }; }

  // ---------- PW-18: Brand Consulting page See Our Work ----------
  try {
    await go('/service/branding');
    const subLinks = await page.$$eval('a', (as) => [...new Set(as.map((a) => a.getAttribute('href')).filter((h) => h && /consult|brand-/i.test(h)))]);
    R['PW-18'] = { brandingSubLinks: subLinks, pages: {} };
    const candidates = subLinks.length ? subLinks : [];
    // also check the branding page itself
    candidates.unshift('/service/branding');
    for (const c of [...new Set(candidates)].slice(0, 6)) {
      try {
        await go(c.replace(BASE, ''));
        const btns = await page.$$eval('a,button', (els) => els.filter((e) => /see our work/i.test((e.innerText || '').trim())).map((e) => ({ tag: e.tagName, href: e.getAttribute('href'), text: (e.innerText || '').trim().slice(0, 20) })));
        if (btns.length) R['PW-18'].pages[c] = btns;
      } catch {}
    }
  } catch (e) { R['PW-18'] = { error: e.message.split('\n')[0] }; }

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 1));
  await browser.close();
})();
