'use strict';
/**
 * Check a capture shot directory against the shared file contract.
 *   node scripts/video/capture/validate_shot.js reports/video/capture/<shot_id>
 * Exit code 0 = valid, 1 = problems found. Prints a short JSON report.
 */
const fs = require('fs');
const path = require('path');
const { imageSize } = require('./capture');

const TYPES = ['move', 'down', 'up', 'key', 'scroll', 'nav', 'mark'];

function validate(dir) {
  const problems = [];
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) return { ok: false, problems: ['meta.json is missing'] };
  const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  for (const k of ['shot_id', 'css_width', 'css_height', 'dsf', 'frame_width', 'frame_height', 'frames', 'events']) {
    if (m[k] === undefined) problems.push(`meta.${k} is missing`);
  }
  if (problems.length) return { ok: false, problems };
  if (m.shot_id !== path.basename(path.resolve(dir))) problems.push(`shot_id "${m.shot_id}" differs from the directory name`);
  if (!m.frames.length) problems.push('no frames');
  let prev = -1, missing = 0, wrongSize = 0, notIncreasing = 0, bytes = 0;
  m.frames.forEach((f, i) => {
    const expect = `frames/f_${String(i + 1).padStart(6, '0')}.`;
    if (!String(f.file).startsWith(expect)) problems.push(`frame ${i + 1} is named ${f.file}`);
    if (typeof f.t_ms !== 'number' || f.t_ms < 0) problems.push(`frame ${i + 1} has no valid t_ms`);
    if (f.t_ms <= prev) notIncreasing++;
    prev = f.t_ms;
    const p = path.join(dir, f.file);
    if (!fs.existsSync(p)) { missing++; return; }
    bytes += fs.statSync(p).size;
    if (i < 3 || i % 25 === 0 || i === m.frames.length - 1) {
      const fd = fs.openSync(p, 'r');
      const head = Buffer.alloc(65536);
      fs.readSync(fd, head, 0, head.length, 0);
      fs.closeSync(fd);
      const s = imageSize(head);
      if (!s || s.width !== m.frame_width || s.height !== m.frame_height) wrongSize++;
    }
  });
  if (missing) problems.push(`${missing} frame files are missing`);
  if (wrongSize) problems.push(`${wrongSize} sampled frames do not have the size ${m.frame_width}x${m.frame_height}`);
  if (notIncreasing) problems.push(`${notIncreasing} frames have a t_ms that is not larger than the previous one`);
  let badEvents = 0, outside = 0, prevE = -1, unordered = 0;
  for (const e of m.events) {
    if (!TYPES.includes(e.type) || typeof e.t_ms !== 'number' || typeof e.x !== 'number' || typeof e.y !== 'number' || typeof e.label !== 'string') badEvents++;
    if (e.x < 0 || e.y < 0 || e.x > m.css_width || e.y > m.css_height) outside++;
    if (e.t_ms < prevE) unordered++;
    prevE = e.t_ms;
  }
  if (badEvents) problems.push(`${badEvents} events do not have the fields { t_ms, type, x, y, label }`);
  if (outside) problems.push(`${outside} events lie outside the ${m.css_width}x${m.css_height} viewport`);
  if (unordered) problems.push(`${unordered} events are out of time order`);
  const dur = m.duration_ms || (m.frames.length ? m.frames[m.frames.length - 1].t_ms : 0);
  const counts = {};
  m.events.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
  return {
    ok: problems.length === 0, shot_id: m.shot_id, frames: m.frames.length, duration_ms: dur,
    effective_fps: dur ? Math.round((m.frames.length / (dur / 1000)) * 100) / 100 : 0,
    frame: `${m.frame_width}x${m.frame_height}`, css: `${m.css_width}x${m.css_height}`, dsf: m.dsf,
    megabytes: Math.round((bytes / 1048576) * 10) / 10, events: counts, problems,
  };
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node validate_shot.js <shot_dir>'); process.exit(2); }
  const r = validate(dir);
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.ok ? 0 : 1);
}
module.exports = { validate };
