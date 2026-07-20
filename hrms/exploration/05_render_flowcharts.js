'use strict';
/**
 * Render the mermaid flowcharts in 00_HRMS_OVERVIEW_AND_FLOWCHART.md to PNG images
 * (Word cannot render mermaid). Uses Playwright + mermaid.js.
 * Output: hrms/docs/assets/flow_1.png ... flow_N.png  and  assets/flowcharts.json (captions/paths)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DOC = path.join(__dirname, '..', 'docs', '00_HRMS_OVERVIEW_AND_FLOWCHART.md');
const ASSETS = path.join(__dirname, '..', 'docs', 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

const md = fs.readFileSync(DOC, 'utf8');
const lines = md.split(/\r?\n/);

// Extract mermaid blocks with the nearest preceding heading as caption.
const blocks = [];
let lastHeading = 'HRMS Flowchart';
let inBlock = false, buf = [];
for (const line of lines) {
  const h = line.match(/^#{2,4}\s+(.*)/);
  if (h && !inBlock) lastHeading = h[1].replace(/[`*]/g, '').trim();
  if (/^```mermaid/.test(line)) { inBlock = true; buf = []; continue; }
  if (inBlock && /^```/.test(line)) { inBlock = false; blocks.push({ caption: lastHeading, code: buf.join('\n') }); continue; }
  if (inBlock) buf.push(line);
}
console.log(`found ${blocks.length} mermaid blocks`);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 2.5 });

  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const { caption, code } = blocks[i];
    const html = `<!doctype html><html><head><meta charset="utf-8">
      <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
      <style>body{margin:0;background:#fff;font-family:Segoe UI,Arial,sans-serif}
      #wrap{display:inline-block;padding:16px;background:#fff}</style></head>
      <body><div id="wrap"><pre class="mermaid">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></div>
      <script>mermaid.initialize({startOnLoad:true,theme:'default',flowchart:{useMaxWidth:false,htmlLabels:true},securityLevel:'loose'});</script>
      </body></html>`;

    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });
    // wait for mermaid to replace the <pre> with an <svg>
    await page.waitForSelector('#wrap svg', { timeout: 25000 });
    await page.waitForTimeout(600);

    const file = path.join(ASSETS, `flow_${i + 1}.png`);
    const el = await page.$('#wrap');
    await el.screenshot({ path: file });
    const box = await el.boundingBox();
    out.push({ index: i + 1, caption, file: `assets/flow_${i + 1}.png`, w: Math.round(box.width), h: Math.round(box.height) });
    console.log(`  ✓ flow_${i + 1}.png  [${caption}]  ${Math.round(box.width)}x${Math.round(box.height)}`);
  }

  fs.writeFileSync(path.join(ASSETS, 'flowcharts.json'), JSON.stringify(out, null, 2));
  await browser.close();
  console.log('done — assets/flowcharts.json written');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
