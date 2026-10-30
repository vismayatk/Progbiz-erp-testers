'use strict';
/**
 * Shared helpers for the read-only UI scout (scripts/video/scout/*).
 * Nothing here clicks, types or submits anything.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'reports', 'video', 'scout');
const VIEWPORT = { width: 1920, height: 1080 };
const DSF = 2;

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function writeJson(file, obj) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }
function writeText(file, s) { ensureDir(path.dirname(file)); fs.writeFileSync(file, s); }

/** Count HTTP 429 responses and remember a few non-2xx/3xx responses (path only, no query). */
function watchNetwork(page, stats) {
  page.on('response', (r) => {
    const st = r.status();
    let p = '';
    try { const u = new URL(r.url()); p = u.host + u.pathname; } catch (_) { p = '(unparseable)'; }
    if (st === 429) { stats.http429 += 1; stats.http429Paths.push(p); }
    else if (st >= 400) stats.httpErrors.push({ status: st, path: p });
  });
  page.on('pageerror', (e) => stats.pageErrors.push(String(e.message).split('\n')[0].slice(0, 200)));
}

/** Runs in the page. Collects demo-relevant visible elements with selector + bounding box. */
function collectElementsInPage() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vw = window.innerWidth, vh = window.innerHeight;
  const isVisible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    let n = e;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      n = n.parentElement;
    }
    return true;
  };
  const selectorFor = (e) => {
    if (e.id) return '#' + CSS.escape(e.id);
    const parts = [];
    let n = e;
    while (n && n.nodeType === 1 && n !== document.body && parts.length < 7) {
      if (n.id) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const tag = n.tagName.toLowerCase();
      const sibs = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      parts.unshift(sibs.length > 1 ? `${tag}:nth-of-type(${sibs.indexOf(n) + 1})` : tag);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  const box = (e) => {
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const item = (kind, e, extra) => Object.assign({
    kind,
    tag: e.tagName.toLowerCase(),
    text: clean(e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('alt') || '').slice(0, 200),
    selector: selectorFor(e),
    id: e.id || null,
    classes: (typeof e.className === 'string' ? e.className : '').slice(0, 160),
    bbox: box(e),
    scrollY: Math.round(window.scrollY),
    inViewport: (() => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; })(),
  }, extra || {});

  const out = [];
  const seen = new Set();
  const push = (kind, e, extra) => { if (!isVisible(e)) return; const k = kind + '|' + selectorFor(e); if (seen.has(k)) return; seen.add(k); out.push(item(kind, e, extra)); };

  document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]').forEach((e) => push('heading', e));
  document.querySelectorAll('label').forEach((e) => push('label', e, { for: e.getAttribute('for') }));
  document.querySelectorAll('input,select,textarea').forEach((e) => push('input', e, {
    type: e.getAttribute('type') || e.tagName.toLowerCase(),
    name: e.getAttribute('name'),
    placeholder: e.getAttribute('placeholder'),
    valueLength: (e.value || '').length,
    // the value itself is recorded only for non-password fields
    value: (e.getAttribute('type') || '').toLowerCase() === 'password' ? null : clean(e.value).slice(0, 80),
    autocomplete: e.getAttribute('autocomplete'),
  }));
  document.querySelectorAll('button,[role="button"],input[type="submit"]').forEach((e) => push('button', e, { type: e.getAttribute('type'), disabled: !!e.disabled }));
  document.querySelectorAll('a').forEach((e) => push('link', e, { href: e.getAttribute('href') }));
  document.querySelectorAll('img').forEach((e) => push('image', e, { src: e.getAttribute('src'), currentSrc: e.currentSrc, naturalWidth: e.naturalWidth, naturalHeight: e.naturalHeight, alt: e.getAttribute('alt') }));
  document.querySelectorAll('svg').forEach((e) => { if (e.getBoundingClientRect().width >= 40) push('svg', e, { viewBox: e.getAttribute('viewBox') }); });
  document.querySelectorAll('canvas').forEach((e) => push('canvas', e));
  document.querySelectorAll('table').forEach((e) => push('table', e, {
    headers: [...e.querySelectorAll('thead th')].map((h) => clean(h.innerText)),
    rowCount: e.querySelectorAll('tbody tr').length,
  }));
  document.querySelectorAll('[role="tab"],.nav-tabs .nav-link,.nav-pills .nav-link').forEach((e) => push('tab', e));
  document.querySelectorAll('.card,[class*="card"]').forEach((e) => { const t = clean(e.innerText); if (t && t.length < 160) push('card', e); });
  return out;
}

/** Runs in the page. Computed styles (colours as hex) for a map of name -> CSS selector. */
function stylesForSelectorsInPage(selMap) {
  const toHex = (c) => {
    if (!c) return null;
    const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i);
    if (!m) return c;
    const h = (n) => Math.round(parseFloat(n)).toString(16).padStart(2, '0');
    let a = '';
    if (m[4] !== undefined) {
      const av = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (av === 0) return 'transparent';
      if (av < 1) a = Math.round(av * 255).toString(16).padStart(2, '0');
    }
    return ('#' + h(m[1]) + h(m[2]) + h(m[3]) + a).toLowerCase();
  };
  const styleOf = (e) => {
    if (!e) return null;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return {
      tag: e.tagName.toLowerCase(), id: e.id || null,
      classes: (typeof e.className === 'string' ? e.className : ''),
      text: (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      color: toHex(cs.color), colorRaw: cs.color,
      backgroundColor: toHex(cs.backgroundColor), backgroundColorRaw: cs.backgroundColor,
      backgroundImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 400),
      borderColor: toHex(cs.borderTopColor), borderWidth: cs.borderTopWidth, borderRadius: cs.borderTopLeftRadius,
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight,
      boxShadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
    };
  };
  const out = {};
  for (const [name, sel] of Object.entries(selMap)) {
    let e = null;
    try { e = document.querySelector(sel); } catch (_) { e = null; }
    out[name] = e ? Object.assign({ selector: sel }, styleOf(e)) : { selector: sel, found: false };
  }
  return out;
}

/**
 * Runs in the page. Static stylesheet analysis: :root custom properties, @font-face families,
 * and colour declarations of rules whose selector mentions sidebar / header / nav / active / primary.
 * This is what the CSS DECLARES, not what was seen rendered.
 */
function stylesheetProbeInPage() {
  const sheets = [];
  const rootVars = {};
  const fontFaces = [];
  const interesting = [];
  const rx = /(sidebar|side-menu|app-header|main-header|\.header|navbar|nav-link|side-menu__item|\.active|btn-primary|--primary|\.logo|brand)/i;
  const colourProps = ['color', 'background', 'background-color', 'border-color', 'fill'];
  const walk = (rules, href) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) {
        fontFaces.push({ sheet: href, family: r.style.getPropertyValue('font-family'), weight: r.style.getPropertyValue('font-weight'), src: (r.style.getPropertyValue('src') || '').slice(0, 300) });
      } else if (r.type === CSSRule.STYLE_RULE) {
        const sel = r.selectorText || '';
        if (/^(:root|html|body|\[data-theme[^\]]*\])/.test(sel.trim())) {
          for (let i = 0; i < r.style.length; i++) {
            const p = r.style[i];
            if (p.startsWith('--')) {
              const k = sel.trim().slice(0, 60) + ' ' + p;
              rootVars[k] = r.style.getPropertyValue(p).trim().slice(0, 200);
            }
          }
        }
        if (rx.test(sel) && sel.length < 200 && interesting.length < 1500) {
          const d = {};
          for (const p of colourProps) { const v = r.style.getPropertyValue(p); if (v) d[p] = v.trim().slice(0, 200); }
          if (Object.keys(d).length) interesting.push({ sheet: href, selector: sel, decl: d });
        }
      } else if (r.cssRules) {
        try { walk(r.cssRules, href); } catch (_) {}
      }
    }
  };
  for (const s of document.styleSheets) {
    const href = s.href || '(inline <style>)';
    let n = null, err = null;
    try { n = s.cssRules.length; walk(s.cssRules, href); } catch (e) { err = String(e.message).slice(0, 120); }
    sheets.push({ href, rules: n, error: err });
  }
  const rootComputed = {};
  const rcs = getComputedStyle(document.documentElement);
  for (const k of Object.keys(rootVars)) {
    const name = k.split(' ').pop();
    rootComputed[name] = rcs.getPropertyValue(name).trim().slice(0, 200);
  }
  return { sheets, rootVars, rootComputed, fontFaces, interesting };
}

module.exports = { ROOT, OUT, VIEWPORT, DSF, ensureDir, writeJson, writeText, watchNetwork, collectElementsInPage, stylesForSelectorsInPage, stylesheetProbeInPage };
