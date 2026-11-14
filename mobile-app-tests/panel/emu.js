#!/usr/bin/env node
'use strict';

/**
 * Drive the emulator through the panel server — every action shows up live in the side panel
 * (marked "Claude"). Requires the panel to be running (preview "emulator-panel").
 *
 *   node panel/emu.js status
 *   node panel/emu.js ui [filter]                 visible elements: centre x,y · class · text · id
 *   node panel/emu.js tap-text "<text>"           tap the element whose text/description matches
 *   node panel/emu.js wait-text "<text>" [sec]    wait until it is on screen (default 20 s)
 *   node panel/emu.js tap <x> <y>                 device pixels (see `ui` / `status` for size)
 *   node panel/emu.js longpress <x> <y> [ms]
 *   node panel/emu.js swipe <x1> <y1> <x2> <y2> [ms]
 *   node panel/emu.js scroll down|up
 *   node panel/emu.js text "<text>"               types into the focused field (printable ASCII)
 *   node panel/emu.js key BACK|HOME|APP_SWITCH|ENTER|DEL|TAB|…
 *   node panel/emu.js rotate [portrait|landscape]
 *   node panel/emu.js shot [file.png]             screenshot (default screens\shot-<time>.png)
 *   node panel/emu.js apps | launch <package> | install <file.apk>
 *   node panel/emu.js start                       boot the emulator if none is running
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.PANEL_URL || 'http://127.0.0.1:8790';
const [cmd, ...args] = process.argv.slice(2);

async function call(method, route, body) {
  let res;
  try {
    res = await fetch(BASE + route, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify({ source: 'claude', ...body }) : undefined,
    });
  } catch {
    throw new Error(`panel not reachable at ${BASE} — start the "emulator-panel" preview first`);
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`${res.status} ${data.error || data}`);
  return data;
}
const input = body => call('POST', '/api/input', body);
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`${name} must be a number`); return n; };
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

function printUi(nodes, filter) {
  const f = (filter || '').toLowerCase();
  for (const n of nodes) {
    const label = [n.text && `"${n.text}"`, n.desc && `desc="${n.desc}"`, n.id && `#${n.id}`].filter(Boolean).join(' ');
    if (f && !label.toLowerCase().includes(f)) continue;
    const flags = [n.clickable && 'clickable', n.focused && 'focused', n.checked && 'checked', n.password && 'password', !n.enabled && 'disabled'].filter(Boolean).join(',');
    console.log(`${String(n.center[0]).padStart(4)},${String(n.center[1]).padEnd(5)} ${n.cls.padEnd(14)} ${label}${flags ? `  [${flags}]` : ''}`);
  }
}

async function main() {
  switch (cmd) {
    case 'status': return console.log(JSON.stringify(await call('GET', '/api/status'), null, 2));
    case 'ui': return printUi(await call('GET', '/api/ui'), args[0]);
    case 'tap-text': {
      const r = await call('POST', '/api/tap-text', { text: args.join(' ') });
      return console.log(`tapped ${r.x},${r.y} "${r.element.text || r.element.desc || r.element.id}"`);
    }
    case 'wait-text': {
      const q = String(args[0] || '').toLowerCase();
      const deadline = Date.now() + num(args[1] || 20, 'seconds') * 1000;
      for (;;) {
        const nodes = await call('GET', '/api/ui');
        const hit = nodes.find(n => n.text.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q));
        if (hit) return console.log(`found "${hit.text || hit.desc}" at ${hit.center.join(',')}`);
        if (Date.now() > deadline) throw new Error(`"${args[0]}" did not appear within ${args[1] || 20}s`);
        await new Promise(r => setTimeout(r, 500));             // poll interval
      }
    }
    case 'tap': return console.log(await input({ action: 'tap', x: num(args[0], 'x'), y: num(args[1], 'y') }));
    case 'longpress': return console.log(await input({ action: 'longpress', x: num(args[0], 'x'), y: num(args[1], 'y'), ms: args[2] && num(args[2], 'ms') }));
    case 'swipe': return console.log(await input({ action: 'swipe', x1: num(args[0], 'x1'), y1: num(args[1], 'y1'), x2: num(args[2], 'x2'), y2: num(args[3], 'y2'), ms: args[4] && num(args[4], 'ms') }));
    case 'scroll': {
      const down = (args[0] || 'down') === 'down';
      return console.log(await input({ action: 'swipe', rx1: 0.5, ry1: down ? 0.72 : 0.3, rx2: 0.5, ry2: down ? 0.3 : 0.72, ms: 350 }));
    }
    case 'text': return console.log(await input({ action: 'text', text: args.join(' ') }));
    case 'key': return console.log(await input({ action: 'key', key: args[0] }));
    case 'rotate': return console.log(await input({ action: 'rotate', orientation: args[0] }));
    case 'shot': {
      const file = path.resolve(args[0] || path.join(__dirname, '..', 'screens', `shot-${stamp()}.png`));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, await call('GET', '/api/screenshot'));
      return console.log(file);
    }
    case 'apps': return console.log((await call('GET', '/api/apps')).join('\n'));
    case 'launch': return console.log(await call('POST', '/api/launch', { package: args[0] }));
    case 'install': return console.log((await call('POST', '/api/install', { path: path.resolve(args[0] || '') })).output);
    case 'start': return console.log(await call('POST', '/api/emulator/start', {}));
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith(' *   node')).map(l => l.slice(3)).join('\n'));
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch(e => { console.error(`emu: ${e.message}`); process.exitCode = 1; });
