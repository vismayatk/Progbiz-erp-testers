'use strict';

/**
 * Evidence reporter — keeps proof of every failure / blocker from a run in one place.
 *
 * For each test that FAILED (bug, app refusal, timeout) it copies the test's whole output folder —
 * screen recording(s) (.webm, including second-user sessions), screenshots, Playwright trace, page
 * snapshot — into  reports/hrms-evidence/<run time>/<NN> <module> — <step>/  and writes error.txt
 * (the failing assertion, where it failed, and the step log). Steps that could not run because an
 * earlier step of the same chain failed are listed as BLOCKED.
 *
 * index.html in the run folder shows every failure with its screenshots and recordings inline.
 * With HRMS_EVIDENCE=all every test's recording + screenshots are kept (a full evidence run).
 * reports/ is git-ignored — evidence stays on this machine.
 */
const fs = require('fs');
const path = require('path');

const stripAnsi = s => String(s || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const safe = s => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');

class EvidenceReporter {
  constructor(options = {}) {
    this.root = options.outputDir || path.join(process.cwd(), 'reports', 'hrms-evidence');
    this.keepAll = process.env.HRMS_EVIDENCE === 'all';
    this.entries = [];
    this.sessionVideos = [];
    this.startedAt = Date.now();
    const d = new Date();
    this.stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
    this.runDir = path.join(this.root, this.stamp);
  }

  onTestEnd(test, result) {
    const failed = ['failed', 'timedOut', 'interrupted'].includes(result.status);
    const fixme = test.annotations.some(a => a.type === 'fixme' || a.type === 'skip');
    const blocked = result.status === 'skipped' && !fixme;
    if (!failed && !blocked && !this.keepAll) return;

    const spec = path.relative(path.join(__dirname, '..', 'tests'), test.location.file).replace(/\\/g, '/');
    const step = test.title;
    const entry = {
      n: this.entries.length + 1, spec, step, status: failed ? 'FAILED' : blocked ? 'BLOCKED' : 'PASSED',
      line: test.location.line, duration: Math.round(result.duration / 1000), files: [], dir: '',
    };

    if (failed || this.keepAll) {
      entry.dir = `${pad(entry.n)} ${safe(spec.replace(/\.spec\.js$/, ''))} — ${safe(step)}`;
      const dest = path.join(this.runDir, entry.dir);
      fs.mkdirSync(dest, { recursive: true });
      // Copy the test's whole output folder (recordings, screenshots, trace, page snapshot). Skip
      // Playwright's attachments/ sub-folder — it only holds hashed copies of files already there.
      const outDir = p => (path.basename(path.dirname(p)) === 'attachments' ? path.dirname(path.dirname(p)) : path.dirname(p));
      const dirs = new Set(result.attachments.filter(a => a.path).map(a => outDir(a.path)));
      for (const dir of dirs) {
        if (fs.existsSync(dir)) fs.cpSync(dir, dest, { recursive: true, filter: src => path.basename(src) !== 'attachments' });
      }
      const err = result.errors.map(e => stripAnsi(e.message || e.value || '') + (e.location ? `\n  at ${e.location.file}:${e.location.line}` : '')).join('\n\n');
      const log = (result.stdout || []).map(x => stripAnsi(typeof x === 'string' ? x : x.toString())).join('').trim();
      fs.writeFileSync(path.join(dest, 'error.txt'),
        `Module/spec : ${spec}\nStep        : ${step}\nResult      : ${entry.status} (${result.status}) after ${entry.duration}s\n` +
        `Location    : ${test.location.file}:${test.location.line}\nRun         : ${this.stamp}\n\n` +
        `── What failed ──\n${err || '(passed)'}\n\n── Step log ──\n${log || '(none)'}\n`);
      entry.error = err;
      entry.files = walk(dest).map(f => path.relative(this.runDir, f).replace(/\\/g, '/'));
    } else {
      entry.error = 'Not run — an earlier step in this chain failed, so this step was blocked.';
    }
    this.entries.push(entry);
  }

  onEnd() {
    const failed = this.entries.filter(e => e.status === 'FAILED');
    const blocked = this.entries.filter(e => e.status === 'BLOCKED');
    if (!this.entries.length) { console.log('\n  🧾 Evidence: no failures or blockers — nothing to keep.'); return; }
    fs.mkdirSync(this.runDir, { recursive: true });
    // The linear run records its single browser tab as one continuous video — keep it with the evidence.
    const sessions = path.join(__dirname, '..', '..', 'test-results', 'hrms', '_sessions');
    if (fs.existsSync(sessions)) {
      for (const f of fs.readdirSync(sessions).filter(f => /^linear-run .*\.webm$/.test(f))) {
        const src = path.join(sessions, f);
        if (fs.statSync(src).mtimeMs >= this.startedAt) {
          fs.copyFileSync(src, path.join(this.runDir, f));
          this.sessionVideos.push(f);
        }
      }
    }
    fs.writeFileSync(path.join(this.runDir, 'index.html'), this.html(failed, blocked));
    console.log(`\n  🧾 Evidence (${failed.length} failed, ${blocked.length} blocked${this.keepAll ? `, ${this.entries.length - failed.length - blocked.length} passed` : ''}) → ${path.join(this.runDir, 'index.html')}`);
  }

  html(failed, blocked) {
    const card = e => {
      const shots = e.files.filter(f => /\.png$/i.test(f));
      const vids = e.files.filter(f => /\.webm$/i.test(f));
      const other = e.files.filter(f => !/\.(png|webm)$/i.test(f));
      return `<section class="card ${e.status.toLowerCase()}">
  <h2><span class="badge">${e.status}</span> ${esc(e.step)}</h2>
  <p class="meta">${esc(e.spec)}:${e.line} · ${e.duration}s${e.dir ? ` · folder <code>${esc(e.dir)}</code>` : ''}</p>
  ${e.error ? `<pre>${esc(e.error)}</pre>` : ''}
  ${vids.map(v => `<figure><figcaption>Recording — ${esc(path.basename(v))}</figcaption><video controls preload="metadata" src="${encodeURI(v)}"></video></figure>`).join('')}
  ${shots.map(s => `<figure><figcaption>Screenshot — ${esc(path.basename(s))}</figcaption><a href="${encodeURI(s)}"><img src="${encodeURI(s)}" alt="${esc(path.basename(s))}"></a></figure>`).join('')}
  ${other.length ? `<p class="files">Also: ${other.map(f => `<a href="${encodeURI(f)}">${esc(path.basename(f))}</a>`).join(' · ')}</p>` : ''}
</section>`;
    };
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HRMS Run Evidence</title>
<style>
:root{--bg:#f6f7f9;--fg:#1d2330;--muted:#5d6675;--card:#fff;--line:#dfe3ea;--fail:#c62828;--block:#b26a00;--pass:#2e7d32}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--fg:#e6e9ef;--muted:#9aa3b2;--card:#1d2128;--line:#2c323c;--fail:#ef5350;--block:#ffb74d;--pass:#66bb6a}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif}
main{max-width:1100px;margin:auto}h1{margin:0 0 4px}.sum{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--fail);border-radius:8px;padding:14px 16px;margin:0 0 16px}
.card.blocked{border-left-color:var(--block)}.card.passed{border-left-color:var(--pass)}
h2{font-size:17px;margin:0 0 4px}.badge{font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:4px;color:#fff;background:var(--fail);vertical-align:middle}
.blocked .badge{background:var(--block)}.passed .badge{background:var(--pass)}
.meta{color:var(--muted);margin:0 0 8px;font-size:13px;word-break:break-all}
pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px;font-size:12.5px;max-height:320px;overflow:auto}
figure{margin:10px 0}figcaption{font-size:12px;color:var(--muted);margin-bottom:4px}
img,video{max-width:100%;border:1px solid var(--line);border-radius:6px}.files{font-size:13px}a{color:inherit}
</style></head><body><main>
<h1>HRMS run evidence</h1>
<p class="sum">Run ${esc(this.stamp)} · ${failed.length} failed · ${blocked.length} blocked${this.keepAll ? ' · full-evidence run (all steps kept)' : ''}</p>
${this.sessionVideos.map(v => `<section class="card passed"><h2><span class="badge">RUN</span> Whole-run recording (one tab, every page in order)</h2><video controls preload="metadata" src="${encodeURI(v)}"></video></section>`).join('\n')}
${this.entries.map(card).join('\n')}
</main></body></html>`;
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

module.exports = EvidenceReporter;
