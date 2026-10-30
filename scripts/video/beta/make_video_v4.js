'use strict';
/**
 * One command that builds the Progbiz ERP marketing video (V4) from start to finish:
 *   narration -> edit (timeline) -> frames -> keynote music + effects -> mix -> MP4 + subtitles.
 *
 *   node scripts/video/beta/make_video_v4.js --voice-file "<recording.mp3|wav|m4a>" --name Kanika
 *   node scripts/video/beta/make_video_v4.js --tts                     (macOS voice "Tara", no recording needed)
 *
 * Options
 *   --voice-file F     a studio/human recording of the whole script (vo_script_v4.json), one long file
 *   --name N           name of the voice (folder, file names)                          default Voice
 *   --overrides F      JSON with hand corrections of sentence boundaries (see scripts/video/vo/INGEST.md)
 *   --tts              use the macOS premium voice instead of a recording
 *   --total S          length of the video in seconds                                  default 226
 *   --out-name X       base name of the output files          default Progbiz_ERP_Video_V4_<name>
 *   --copy-to DIR      also copy the share MP4 and the SRT there (for example ~/Downloads)
 *   --skip-render      reuse the frames of the last run (only the sound changed)
 *   --skip-voice       reuse the audio_v4/<name> folder of the last run (no ingest)
 *   --music keynote|warm                                                                default keynote
 *   --workers N        render workers                                                  default 6
 *   --dry-run          print the commands only
 *
 * Needs: node, python3 (with Pillow), macOS afconvert, the encoder in reports/video/build/bin
 * (scripts/video/encode/build.sh builds it), Playwright's Chromium (already installed for the tests).
 * Nothing is downloaded and the ERP site is never contacted: the pictures come from reports/video/beta/cap.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const BETA = path.join(ROOT, 'reports', 'video', 'beta');
const argv = process.argv.slice(2);
const flag = k => argv.includes(k);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const TTS = flag('--tts');
const NAME = opt('--name', TTS ? 'Tara' : 'Voice');
const VOICE_FILE = opt('--voice-file', null);
const TOTAL = Number(opt('--total', 226));
const TAG = 'v4' + (TTS ? '' : 'k');
const OUT = opt('--out-name', `Progbiz_ERP_Video_V4_${NAME}`);
const MUSIC = opt('--music', 'keynote');
const WORKERS = opt('--workers', '6');
const DRY = flag('--dry-run');
const rel = p => path.relative(ROOT, p);
const sh = p => path.join(BETA, p);

if (!TTS && !VOICE_FILE && !flag('--skip-voice')) {
  console.error('give --voice-file <recording> (or --tts for the macOS voice, or --skip-voice to reuse the last run)');
  process.exit(2);
}
if (VOICE_FILE && !fs.existsSync(VOICE_FILE)) { console.error(`voice file not found: ${VOICE_FILE}`); process.exit(2); }

let step = 0;
function run(title, cmd, args) {
  step++;
  console.log(`\n[${step}] ${title}\n    ${[cmd].concat(args.map(a => (/\s/.test(a) ? JSON.stringify(a) : a))).join(' ')}`);
  if (DRY) return;
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\nFAILED at step ${step} (${title}), exit ${r.status}`); process.exit(r.status || 1); }
  console.log(`    done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const audioDir = TTS ? 'com_apple_voice_Tara_premium' : NAME;

// 1. narration -----------------------------------------------------------------------------
if (!flag('--skip-voice')) {
  if (TTS) {
    run('narration with the macOS voice (about 7 minutes)', 'python3', ['scripts/video/vo/make_vo.py', '--script', 'scripts/video/beta/vo_script_v4.json', '--out-root', 'reports/video/beta/audio_v4',
      '--voice', 'com.apple.voice.Tara.premium', '--tune', '--target-wpm', '153', '--pause', '0.42', '--lead-in', '0.3', '--min-spare', '0']);
  } else {
    const a = ['scripts/video/vo/ingest_recording.py', '--script', 'scripts/video/beta/vo_script_v4.json', '--single', VOICE_FILE, '--out', `reports/video/beta/audio_v4/${NAME}`, '--label', NAME, '--quiet'];
    if (opt('--overrides', null)) a.push('--overrides', opt('--overrides'));
    run('find every sentence in the recording and clean the sections', 'python3', a);
  }
}

// 2. edit ----------------------------------------------------------------------------------
const build = ['scripts/video/beta/10_build_timeline_v4.js', '--audio', 'audio_v4', '--voice', audioDir, '--tag', TAG, '--total', String(TOTAL)];
if (!TTS) build.push('--recorded');
if (MUSIC === 'keynote') build.push('--keynote');
run('edit: timeline, sentence times, sound-effect events', 'node', build);

// 3. frames --------------------------------------------------------------------------------
const frames = `reports/video/beta/build/frames_${TAG}`;
if (!flag('--skip-render')) {
  run('render every frame (about 90 seconds)', 'node', ['scripts/video/compose/render.js', `reports/video/beta/timeline_${TAG}.json`, frames, '--workers', WORKERS, '--clean']);
}
run('check that the pictures are really right (not only the file count)', 'python3', ['scripts/video/beta/check_frames.py', frames]);

// 4. sound ---------------------------------------------------------------------------------
run('voice track', 'python3', ['scripts/video/encode/mixwav.py', `reports/video/beta/voice_cues_${TAG}.json`, String(TOTAL), `reports/video/beta/build/voice_${TAG}.wav`]);
run('sound effects', 'node', ['scripts/video/audio/make_sfx.js', '--outdir', 'reports/video/beta/audio_v4/music/sfx']);
let sectionsArg = [], outro = TOTAL - 6;
if (!DRY || fs.existsSync(sh(`sections_${TAG}.json`))) {
  const secs = readJson(sh(`sections_${TAG}.json`)).sections.slice(1).map(s => s.start);
  const sent = readJson(sh(`sentences_${TAG}.json`));
  outro = Math.round((sent[sent.length - 1].start_s - 0.19) * 100) / 100;
  sectionsArg = MUSIC === 'keynote' ? ['--style', 'keynote', '--sections', secs.join(',')] : [];
}
run(`music bed (${MUSIC})`, 'node', ['scripts/video/audio/make_music.js', '--dur', String(TOTAL), '--out', `reports/video/beta/audio_v4/music/music_${TAG}.wav`, '--outro-at', String(outro)].concat(sectionsArg));
run('mix: voice on top, music ducked under it, effects', 'node', ['scripts/video/audio/mix.js', '--voice', `reports/video/beta/build/voice_${TAG}.wav`, '--music', `reports/video/beta/audio_v4/music/music_${TAG}.wav`,
  '--sfx', `reports/video/beta/sfx_${TAG}.json`, '--dur', String(TOTAL), '--out', `reports/video/beta/build/mix_${TAG}.wav`, '--report', `reports/video/beta/build/mix_${TAG}.report.json`, '--duck-db', '-13']);

// 5. export --------------------------------------------------------------------------------
const enc = 'reports/video/build/bin/encode';
run('export the full-quality MP4', enc, [frames, '30', `reports/video/beta/build/mix_${TAG}.wav`, `reports/video/beta/${OUT}.mp4`]);
run('export the smaller share MP4', enc, [frames, '30', `reports/video/beta/build/mix_${TAG}.wav`, `reports/video/beta/${OUT}_share.mp4`, '--bitrate', '5000000']);
run('subtitles (SRT)', 'python3', ['scripts/video/beta/11_make_srt.py', '--tag', TAG, '--out', `reports/video/beta/${OUT}.srt`]);
if (opt('--copy-to', null)) {
  const d = opt('--copy-to').replace(/^~/, process.env.HOME);
  if (!DRY) { fs.mkdirSync(d, { recursive: true }); for (const f of [`${OUT}_share.mp4`, `${OUT}.srt`]) fs.copyFileSync(sh(f), path.join(d, f)); }
  console.log(`\ncopied the share MP4 and the SRT to ${d}`);
}
console.log(`\nREADY\n  ${rel(sh(OUT + '.mp4'))}\n  ${rel(sh(OUT + '_share.mp4'))}\n  ${rel(sh(OUT + '.srt'))}`);
