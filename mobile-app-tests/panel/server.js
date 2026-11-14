'use strict';

/**
 * Emulator panel — shows the Android emulator inside Claude's side panel and forwards input to it.
 * No npm dependencies: Node + adb only. Started via .claude/launch.json (preview "emulator-panel").
 *
 *   screen  `adb exec-out screenrecord --output-format=h264` → length-prefixed frames on /stream,
 *           decoded in the page with WebCodecs (PNG screenshot polling if that is unavailable)
 *   input   tap / long-press / swipe / text / keys / rotate through `adb shell input`
 *   api     /api/* — used by panel/emu.js (Claude) and the page (you); every action is broadcast
 *           on /events so the page marks it on the screen and in the activity log
 *   device  starts the hrms_pixel AVD headless when nothing is connected
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PORT = Number(process.env.PORT || 8790);
const SDK = process.env.ANDROID_HOME || 'Z:\\Android\\Sdk';
const AVD_HOME = process.env.ANDROID_AVD_HOME || 'Z:\\Android\\avd';
const AVD = process.env.AVD_NAME || 'hrms_play';
const EXE = process.platform === 'win32' ? '.exe' : '';
const ADB = path.join(SDK, 'platform-tools', `adb${EXE}`);
const EMULATOR = path.join(SDK, 'emulator', `emulator${EXE}`);
const SCREENS = path.join(__dirname, '..', 'screens');
const STREAM_SHORT_SIDE = 720;           // stream resolution (short side); encoders want multiples of 16

const state = { phase: 'starting', serial: null, display: null, model: null, android: null, emulatorPid: null, error: null };
const sseClients = new Set();
const viewers = new Set();
const recent = [];                        // last actions, replayed to a freshly opened page

// ── adb ─────────────────────────────────────────────────────────────────────
function adbRaw(args, { encoding = 'utf8', timeout = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { encoding, timeout, maxBuffer: 64 << 20, windowsHide: true }, (err, stdout, stderr) =>
      (err ? reject(new Error(String(stderr || err.message).trim() || err.message)) : resolve(stdout)));
  });
}
const adbDev = (args, opts) => adbRaw(['-s', state.serial, ...args], opts);

let shellQueue = Promise.resolve();
/** Device shell commands run strictly in order (a tap must land before the next swipe). */
function shellQ(cmd, timeout = 30_000) {
  const p = shellQueue.then(() => adbDev(['shell', cmd], { timeout }));
  shellQueue = p.catch(() => {});
  return p;
}

// ── status / events ─────────────────────────────────────────────────────────
function broadcast(evt) {
  const line = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of sseClients) res.write(line);
}
function publicStatus() {
  const { phase, serial, model, android, display, error } = state;
  return { type: 'status', phase, serial, model, android, display, error, avd: AVD };
}
function setPhase(phase) {
  if (state.phase === phase) return;
  state.phase = phase;
  broadcast(publicStatus());
}
function logAction(source, action, extra = {}) {
  const evt = { type: 'action', at: new Date().toISOString(), source: source === 'claude' ? 'claude' : 'you', action, ...extra };
  recent.push(evt);
  if (recent.length > 60) recent.shift();
  broadcast(evt);
  console.log(`[${evt.source}] ${action}`);
}

// ── device lifecycle ────────────────────────────────────────────────────────
async function readDisplay() {
  // `cur=WxH` is the current, rotation-aware size. (dumpsys input's first "Viewport" line can be a
  // placeholder on Android 14 — displayId=-1, logicalFrame=[0, 0, 0, 0] — so it isn't used.)
  const win = await adbDev(['shell', "dumpsys window displays | grep -m 1 'cur='"]).catch(() => '');
  let m = /\bcur=(\d+)x(\d+)/.exec(win);
  if (!m || m[1] === '0' || m[2] === '0') m = /(\d+)x(\d+)/.exec(await adbDev(['shell', 'wm size']));
  const w = m ? Number(m[1]) : 0;
  const h = m ? Number(m[2]) : 0;
  if (!(w > 0 && h > 0)) throw new Error('display size not available yet');   // keeps the phase at "booting"
  state.display = { w, h, rotation: w > h ? 1 : 0 };
}

let watching = false;
async function watchDevice() {
  if (watching) return;
  watching = true;
  try {
    const rows = (await adbRaw(['devices'])).split(/\r?\n/).slice(1)
      .map(l => l.trim().split(/\s+/)).filter(r => r.length >= 2);
    const online = rows.filter(r => r[1] === 'device').map(r => r[0]);
    const wanted = process.env.ANDROID_SERIAL;
    const serial = (wanted ? online.find(s => s === wanted) : online.find(s => s.startsWith('emulator-')) || online[0]) || null;
    if (serial !== state.serial) { state.serial = serial; state.display = null; if (state.phase === 'ready') setPhase('booting'); }
    if (!serial) { setPhase(rows.length || state.emulatorPid ? 'booting' : 'no-device'); return; }
    if ((await adbDev(['shell', 'getprop sys.boot_completed'])).trim() !== '1') { setPhase('booting'); return; }

    const before = JSON.stringify(state.display);
    await readDisplay();
    if (state.phase !== 'ready') {
      state.model = (await adbDev(['shell', 'getprop ro.product.model'])).trim();
      state.android = (await adbDev(['shell', 'getprop ro.build.version.release'])).trim();
      state.error = null;
      await adbDev(['shell', 'svc power stayon true']).catch(() => {});   // keep the mirrored screen awake
      setPhase('ready');
      restartRecorder();
    } else if (JSON.stringify(state.display) !== before) {             // rotated
      broadcast(publicStatus());
      restartRecorder();
    }
  } catch (e) {
    state.error = e.message.split('\n')[0];
    setPhase(fs.existsSync(ADB) ? (state.serial ? 'booting' : 'no-device') : 'no-adb');
  } finally {
    watching = false;
  }
}

function startEmulator(source = 'you', { cold = false } = {}) {
  if (state.emulatorPid || state.phase === 'ready') return { started: false, reason: `already ${state.phase}` };
  if (!fs.existsSync(path.join(AVD_HOME, `${AVD}.ini`))) throw Object.assign(new Error(`AVD ${AVD} not found in ${AVD_HOME}`), { status: 404 });

  // Only called when no device is connected, so leftover *.lock files mean the last run was killed
  // mid-flight — its quick-boot snapshot can't be trusted (it stalls the boot). Clear them, boot cold.
  const avdDir = path.join(AVD_HOME, `${AVD}.avd`);
  const locks = fs.readdirSync(avdDir).filter(f => f.endsWith('.lock'));
  for (const f of locks) fs.rmSync(path.join(avdDir, f), { recursive: true, force: true });
  if (locks.length) cold = true;

  // -no-window runs the separate "headless" qemu build, which stalls ~1 min into boot on this
  // machine (WHPX). The normal build with its window hidden boots fine; EMULATOR_WINDOW=1 shows it.
  // WebView/Chromium apps ANR under software rendering, so default to the host GPU. Override with
  // EMULATOR_GPU (e.g. swiftshader_indirect) if host-GPU init ever fails to boot on this machine.
  const args = ['-avd', AVD, '-no-boot-anim', '-gpu', process.env.EMULATOR_GPU || 'host'];
  if (process.env.EMULATOR_WINDOW !== '1') args.push('-qt-hide-window');  // lives in the side panel only
  if (cold) args.push('-no-snapshot-load');
  const logFile = path.join(path.dirname(AVD_HOME), 'logs', 'emulator.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.openSync(logFile, 'w');
  const child = spawn(EMULATOR, args, {
    env: { ...process.env, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK, ANDROID_AVD_HOME: AVD_HOME },
    detached: true, stdio: ['ignore', log, log], windowsHide: true,
  });
  fs.closeSync(log);
  child.unref();
  state.emulatorPid = child.pid;
  child.on('exit', code => { state.emulatorPid = null; logAction('you', `emulator exited (${code})`); watchDevice(); });
  logAction(source, `start emulator ${AVD}`);
  setPhase('booting');
  return { started: true, pid: child.pid };
}

// ── screen stream (H.264 Annex B → access units) ────────────────────────────
const START = Buffer.from([0, 0, 0, 1]);

function startCodes(buf) {
  const out = [];
  for (let i = 0; i + 2 < buf.length; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) {
      out.push(i > 0 && buf[i - 1] === 0 ? [i - 1, 4] : [i, 3]);
      i += 2;
    }
  }
  return out;
}

/** Groups NAL units into complete frames. A short silence ends a burst (screenrecord only emits on change). */
class AnnexBFramer {
  constructor(emit) { this.emit = emit; this.buf = Buffer.alloc(0); this.nals = []; this.hasSlice = false; this.timer = null; }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const codes = startCodes(this.buf);
    for (let i = 0; i + 1 < codes.length; i++) this.addNal(this.buf.subarray(codes[i][0] + codes[i][1], codes[i + 1][0]));
    if (codes.length) this.buf = this.buf.subarray(codes[codes.length - 1][0]);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.drain(), 50);   // long enough that adb read gaps don't split a frame
  }
  drain() {
    const codes = startCodes(this.buf);
    if (codes.length) { this.addNal(this.buf.subarray(codes[0][0] + codes[0][1])); this.buf = Buffer.alloc(0); }
    this.flushFrame();
  }
  addNal(nal) {
    if (!nal.length) return;
    const type = nal[0] & 0x1f;
    const slice = type === 1 || type === 5;
    const newPicture = slice && (nal[1] & 0x80);                          // first_mb_in_slice == 0
    if (this.hasSlice && (newPicture || type === 7 || type === 8 || type === 9)) this.flushFrame();
    this.nals.push(nal);
    if (slice) this.hasSlice = true;
  }
  flushFrame() {
    if (!this.hasSlice) return;                                           // SPS/PPS wait for their picture
    const key = this.nals.some(n => (n[0] & 0x1f) === 5);
    this.emit({ key, data: Buffer.concat(this.nals.flatMap(n => [START, n])) });
    this.nals = [];
    this.hasSlice = false;
  }
  end() { clearTimeout(this.timer); this.drain(); }
}

function streamSize({ w, h }) {
  const r16 = n => Math.max(16, Math.round(n / 16) * 16);
  const s = Math.min(STREAM_SHORT_SIDE, w, h);
  return w <= h ? { w: r16(s), h: r16((s * h) / w) } : { w: r16((s * w) / h), h: r16(s) };
}

function sendFrame({ key, data }) {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(data.length, 0);
  header[4] = key ? 1 : 0;
  for (const res of viewers) { res.write(header); res.write(data); }
}

let recorder = null;
let recorderGen = 0;
function stopRecorder() {
  recorderGen++;
  if (recorder) { try { recorder.kill(); } catch { /* already gone */ } recorder = null; }
}
let quickExits = 0;
async function restartRecorder() {
  stopRecorder();
  const disp = state.display;
  if (!viewers.size || state.phase !== 'ready' || !disp || !(disp.w > 0 && disp.h > 0)) return;
  const gen = recorderGen;
  await adbDev(['shell', 'pkill -f screenrecord']).catch(() => {});      // one encoder session at a time
  if (gen !== recorderGen) return;
  const { w, h } = streamSize(disp);
  const framer = new AnnexBFramer(sendFrame);
  const startedAt = Date.now();
  let errText = '';
  recorder = spawn(ADB, ['-s', state.serial, 'exec-out', 'screenrecord', '--output-format=h264',
    '--size', `${w}x${h}`, '--bit-rate', '6000000', '-'], { windowsHide: true });
  recorder.stdout.on('data', chunk => framer.push(chunk));
  recorder.stderr.on('data', chunk => { errText = (errText + chunk).slice(-500); });
  recorder.on('exit', code => {
    framer.end();
    if (gen !== recorderGen) return;
    recorder = null;
    // screenrecord ends by itself after 3 min (restart at once); a quick exit means it failed —
    // log why and back off instead of spinning, and give up after 5 in a row.
    const ranMs = Date.now() - startedAt;
    const quick = ranMs < 5000;
    quickExits = quick ? quickExits + 1 : 0;
    if (quick) console.log(`screenrecord ${w}x${h} exited (${code}) after ${ranMs} ms: ${errText.trim() || 'no output'}`);
    if (quickExits >= 5) {
      state.error = `screen stream failed: ${errText.trim() || `screenrecord exit ${code}`}`;
      broadcast(publicStatus());
      return;
    }
    setTimeout(() => { if (gen === recorderGen) restartRecorder(); }, quick ? 2000 : 200);
  });
}

// ── input ───────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const shellQuote = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

function needReady() {
  if (state.phase !== 'ready' || !state.display) throw Object.assign(new Error(`device not ready (${state.phase})`), { status: 409 });
}
function toDevice(x, y, rx, ry) {
  const d = state.display;
  if (rx != null && ry != null) { x = rx * d.w; y = ry * d.h; }
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) throw Object.assign(new Error('x/y (device px) or rx/ry (0..1) required'), { status: 400 });
  x = Math.round(clamp(Number(x), 0, d.w - 1));
  y = Math.round(clamp(Number(y), 0, d.h - 1));
  return { x, y, rx: x / d.w, ry: y / d.h };
}

async function act(b) {
  needReady();
  const src = b.source;
  const label = b.label ? ` "${String(b.label).slice(0, 40)}"` : '';
  switch (b.action) {
    case 'tap': {
      const p = toDevice(b.x, b.y, b.rx, b.ry);
      await shellQ(`input tap ${p.x} ${p.y}`);
      logAction(src, `tap ${p.x},${p.y}${label}`, { kind: 'tap', rx: p.rx, ry: p.ry, label: b.label });
      return p;
    }
    case 'longpress': {
      const p = toDevice(b.x, b.y, b.rx, b.ry);
      const ms = Math.round(clamp(Number(b.ms) || 800, 400, 5000));
      await shellQ(`input swipe ${p.x} ${p.y} ${p.x} ${p.y} ${ms}`);
      logAction(src, `long-press ${p.x},${p.y}${label} (${ms} ms)`, { kind: 'tap', rx: p.rx, ry: p.ry, label: b.label });
      return p;
    }
    case 'swipe': {
      const a = toDevice(b.x1, b.y1, b.rx1, b.ry1);
      const z = toDevice(b.x2, b.y2, b.rx2, b.ry2);
      const ms = Math.round(clamp(Number(b.ms) || 300, 50, 5000));
      await shellQ(`input swipe ${a.x} ${a.y} ${z.x} ${z.y} ${ms}`);
      logAction(src, `swipe ${a.x},${a.y} → ${z.x},${z.y}`, { kind: 'swipe', rx: a.rx, ry: a.ry, rx2: z.rx, ry2: z.ry });
      return { from: a, to: z };
    }
    case 'text': {
      const t = String(b.text || '');
      if (!t) throw Object.assign(new Error('text required'), { status: 400 });
      if (/[^\x20-\x7e]/.test(t)) throw Object.assign(new Error('adb input supports printable ASCII only'), { status: 400 });
      await shellQ(`input text ${shellQuote(t.replace(/ /g, '%s'))}`);
      logAction(src, `type "${b.secret ? '•'.repeat(Math.min(t.length, 8)) : t}"`);
      return { typed: t.length };
    }
    case 'key': {
      const k = String(b.key || '').toUpperCase().replace(/^KEYCODE_/, '');
      if (!/^[A-Z0-9_]{1,30}$/.test(k)) throw Object.assign(new Error('bad key'), { status: 400 });
      await shellQ(`input keyevent KEYCODE_${k}`);
      logAction(src, `key ${k}`);
      return { key: k };
    }
    case 'rotate': {
      const landscape = b.orientation ? b.orientation === 'landscape' : state.display.rotation % 2 === 0;
      await shellQ(`settings put system accelerometer_rotation 0; settings put system user_rotation ${landscape ? 1 : 0}`);
      logAction(src, `rotate → ${landscape ? 'landscape' : 'portrait'}`);
      setTimeout(watchDevice, 700);
      return { orientation: landscape ? 'landscape' : 'portrait' };
    }
    default:
      throw Object.assign(new Error(`unknown action "${b.action}"`), { status: 400 });
  }
}

// ── UI hierarchy ────────────────────────────────────────────────────────────
const decodeXml = s => s.replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function uiNodes(all = false) {
  needReady();
  const xml = await adbDev(['shell', 'uiautomator dump /sdcard/panel-ui.xml >/dev/null && cat /sdcard/panel-ui.xml'], { timeout: 30_000 });
  const nodes = [];
  for (const m of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const a = {};
    for (const [, k, v] of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) a[k] = decodeXml(v);
    const b = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(a.bounds || '');
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    const n = {
      text: a.text || '', desc: a['content-desc'] || '', id: (a['resource-id'] || '').replace(/^.*:id\//, ''),
      cls: (a.class || '').split('.').pop(), pkg: a.package || '', clickable: a.clickable === 'true',
      enabled: a.enabled !== 'false', focused: a.focused === 'true', checked: a.checked === 'true',
      password: a.password === 'true', bounds: [x1, y1, x2, y2], center: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)],
    };
    if (all || n.text || n.desc || n.id || n.clickable) nodes.push(n);
  }
  return nodes;
}

async function tapText(b) {
  const q = String(b.text || '').trim().toLowerCase();
  if (!q) throw Object.assign(new Error('text required'), { status: 400 });
  const nodes = await uiNodes();
  const score = n => {
    const t = n.text.toLowerCase(); const d = n.desc.toLowerCase();
    if (t === q || d === q) return 3;
    if (t.includes(q) || d.includes(q)) return 2;
    return n.id.toLowerCase().includes(q) ? 1 : 0;
  };
  const hit = nodes.map(n => [score(n), n]).filter(([s]) => s)
    .sort((x, y) => y[0] - x[0] || Number(y[1].clickable) - Number(x[1].clickable))[0];
  if (!hit) {
    const seen = [...new Set(nodes.map(n => n.text || n.desc).filter(Boolean))].slice(0, 40);
    throw Object.assign(new Error(`no element matching "${b.text}". Visible: ${JSON.stringify(seen)}`), { status: 404 });
  }
  const [x, y] = hit[1].center;
  const res = await act({ action: 'tap', x, y, source: b.source, label: hit[1].text || hit[1].desc || hit[1].id });
  return { ...res, element: hit[1] };
}

// ── HTTP ────────────────────────────────────────────────────────────────────
function json(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 1 << 20) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

const routes = {
  'GET /': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  },
  'GET /events': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(publicStatus())}\n\n`);
    for (const evt of recent) res.write(`data: ${JSON.stringify({ ...evt, replay: true })}\n\n`);
    sseClients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
  },
  'GET /stream': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.socket.setNoDelay(true);
    viewers.add(res);
    req.on('close', () => { viewers.delete(res); if (!viewers.size) stopRecorder(); });
    restartRecorder();                     // fresh encoder → this viewer starts on a keyframe
  },
  'GET /api/status': (req, res) => json(res, publicStatus()),
  'POST /api/input': async (req, res) => json(res, await act(await readBody(req))),
  'POST /api/tap-text': async (req, res) => json(res, await tapText(await readBody(req))),
  'GET /api/ui': async (req, res, url) => json(res, await uiNodes(url.searchParams.has('all'))),
  'GET /api/screenshot': async (req, res) => {
    needReady();
    const png = await adbDev(['exec-out', 'screencap -p'], { encoding: 'buffer' });
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.end(png);
  },
  'POST /api/screenshot/save': async (req, res) => {
    needReady();
    const b = await readBody(req);
    fs.mkdirSync(SCREENS, { recursive: true });
    const file = path.join(SCREENS, `panel-${stamp()}.png`);
    fs.writeFileSync(file, await adbDev(['exec-out', 'screencap -p'], { encoding: 'buffer' }));
    logAction(b.source, `screenshot → screens\\${path.basename(file)}`);
    json(res, { file });
  },
  'GET /api/apps': async (req, res) => {
    needReady();
    json(res, (await adbDev(['shell', 'pm list packages -3'])).split(/\r?\n/).map(l => l.replace(/^package:/, '').trim()).filter(Boolean).sort());
  },
  'POST /api/launch': async (req, res) => {
    needReady();
    const b = await readBody(req);
    if (!/^[\w.]+$/.test(b.package || '')) throw Object.assign(new Error('package required'), { status: 400 });
    await shellQ(`monkey -p ${b.package} -c android.intent.category.LAUNCHER 1`);
    logAction(b.source, `launch ${b.package}`);
    json(res, { launched: b.package });
  },
  'POST /api/install': async (req, res) => {
    needReady();
    const b = await readBody(req);
    const apk = path.resolve(String(b.path || ''));
    if (!/\.apk$/i.test(apk) || !fs.existsSync(apk)) throw Object.assign(new Error(`APK not found: ${apk}`), { status: 400 });
    logAction(b.source, `installing ${path.basename(apk)}…`);
    const out = await adbDev(['install', '-r', apk], { timeout: 300_000 });
    logAction(b.source, `installed ${path.basename(apk)}`);
    json(res, { installed: apk, output: out.trim() });
  },
  'POST /api/emulator/start': async (req, res) => json(res, startEmulator((await readBody(req)).source)),
  'POST /api/stream/restart': (req, res) => { restartRecorder(); json(res, { ok: true }); },
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return json(res, { error: 'not found' }, 404);
  try {
    await route(req, res, url);
  } catch (e) {
    if (!res.headersSent) json(res, { error: e.message }, e.status || 500);
  }
}

// Loopback only — IPv4 and IPv6, so "localhost" works either way.
http.createServer(handle).listen(PORT, '127.0.0.1', () => console.log(`emulator panel → http://localhost:${PORT}`));
http.createServer(handle).on('error', () => {}).listen(PORT, '::1');

(async () => {
  await watchDevice();
  if (state.phase === 'no-device' && process.env.EMULATOR_AUTOSTART !== '0') {
    try { startEmulator('you'); } catch (e) { state.error = e.message; broadcast(publicStatus()); }
  }
  setInterval(watchDevice, 2000);
})();
