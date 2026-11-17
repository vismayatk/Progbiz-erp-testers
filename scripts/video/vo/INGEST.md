# Ingesting a recorded narration (`ingest_recording.py`)

`scripts/video/vo/ingest_recording.py` turns a person's recording of the narration into
what the video edit needs: one clean WAV per section and `cues.json` with the start and
end of every sentence. It was written for the Malayalam version of the ProgBiz ERP
video, where the narration is recorded by a native speaker, but it works for any
language and any script in the `vo_script_v3.<lang>.json` shape.

Python 3 standard library only, plus `afconvert` and `afinfo` (part of macOS). Nothing
is installed. The recordings are never modified.

## 1. How to record

Give the speaker the script (`scripts/video/beta/vo_script_v3.<lang>.json`, or a printed
copy with the section numbers) and these instructions:

* **One file per section** (12 files). Name each file so that it starts with the section
  number: `01.m4a`, `02 home.wav`, `03.m4a`, ... `12.wav`. Any common format is fine:
  m4a (Voice Memos), wav, aiff, caf, mp3, aac. Stereo is mixed down automatically.
  (One long recording of everything is also accepted, see `--single` below, but the
  per-section form is safer and easier to re-record.)
* Quiet room, phone or microphone 15-30 cm from the mouth, same distance for every
  section. Switch off fans and air conditioning if possible.
* Start recording, wait a second, then speak. After the last word wait a second before
  stopping. The tool trims the silence itself.
* **Pause clearly between sentences, about one second.** This is what the tool uses to
  find where each sentence starts. Pauses inside a sentence (commas, breaths) should be
  shorter than the pauses between sentences.
* Read the sentences exactly as written and in order. Do not add or drop sentences. If
  you make a mistake, stop, pause for two seconds and read the whole sentence again -
  then tell us which section needs a manual cut (or better: record that section again).
* Do not let the level clip (the meter should not hit red). A quiet recording can be
  raised; a clipped one cannot be repaired.
* If recording in one go (`--single`): pause for **at least two seconds** between
  sections and at most about one second between sentences.

Put the files in one folder. The recording sheet for the speaker
(`reports/video/beta/ProgBiz_Malayalam_Recording_Script.html`) asks for
`reports/video/beta/audio_ml/recorded/`, so that is the folder used below.

## 2. How to run

From the repo root:

```
python3 scripts/video/vo/ingest_recording.py \
    --script scripts/video/beta/vo_script_v3.ml.json \
    --in     reports/video/beta/audio_ml/recorded \
    --out    reports/video/beta/audio_ml/Speaker \
    --label  "Malayalam - <speaker name>"
```

Then build the Malayalam edit from the new timing file:

```
node scripts/video/beta/09_build_timeline_lang.js --lang ml --cues reports/video/beta/audio_ml/Speaker/cues.json
```

Do **not** feed the Malayalam cues to `08_build_timeline_v3.js`: that is the English edit,
and without `--tag` it writes `reports/video/beta/timeline_v3.json`, the English timeline.

One long recording instead of one file per section:

```
python3 scripts/video/vo/ingest_recording.py --script ... --single recordings/whole.m4a --out ...
```

`--single` and `--in` can be combined: the long recording is split into sections and any
per-section file found in `--in` replaces the section cut from the long recording (this
is how a re-take of one section is used).

Other options:

* `--overrides corrections.json` - manual corrections, see section 5.
* `--set NAME=VALUE` - change a parameter (the `DEFAULTS` table at the top of the tool
  lists them all), for example `--set min_pause_s=0.25` for a speaker who pauses very
  briefly between sentences, or `--set room_tone_s=0.3`.
* `--strict` - exit status 2 when a section is missing, unusable or has an estimated
  boundary (for scripts that chain the steps).
* `--quiet` - only the summary lines.

The tool prints one line per section and ends with `check by ear: ...` when something
needs a listen.

### What it writes to `--out`

| file | content |
|---|---|
| `<section_id>.wav` | the cleaned section: WAV PCM 16-bit, 48 kHz, mono; leading and trailing silence trimmed to 0.15 s of room tone; DC offset removed; speech level -20 dBFS RMS (measured on the voiced parts); peaks never above -3 dBFS (a look-ahead limiter takes off at most 6 dB, beyond that the section is delivered quieter and a warning is given); 10 ms fade-in, 30 ms fade-out |
| `cues.json` | the timing file, see below |
| `report.md` | the human-readable report, see section 3 |

`cues.json` has the shape the English pipeline uses (`schema: progbiz-vo-cues/1`):

```
sections[] = { id, title, file, duration_s, timing, source_file, source_format,
               sentences[]  = { n, text, chars, words, start_s, duration_s, end_s,
                                timing: "detected" | "estimated" | "manual",
                                pause_after_s, pace_vs_section },
               boundaries[] = { after_sentence, pause_start_s, pause_end_s, pause_s,
                                timing, confidence, confidence_label, margin, alternatives },
               pauses[]     = every pause found (for manual corrections),
               quality      = { noise floor, speech level, peak, gain, limiter, clipping,
                                head/tail cut, source_offset_s, confidence, warnings, notes } }
missing_sections[]   section ids with no recording
totals               counts of sections, sentences, detected / estimated / manual boundaries
```

`start_s` / `end_s` are seconds inside the delivered `<section_id>.wav`. Sentence 1 starts
at about 0.13 s (after the room tone); `duration_s` of the section is the length of the
file. `quality.source_offset_s` is the position of the delivered file inside the original
recording (`original time = source_offset_s + start_s`).

`timing` of a sentence:

* `detected` - both ends lie on pauses found in the audio;
* `estimated` - at least one end was placed by text length because no usable pause was
  found (the section is also marked `estimated`, listed in `totals.sections_estimated`
  and in `check by ear`);
* `manual` - set through `--overrides`.

The edit (`scripts/video/beta/09_build_timeline_lang.js --cues <cues.json>`) reads only
`sections[].id`, `.file`, `.duration_s` and `sentences[].start_s` / `.duration_s`, the
same fields as in the English `reports/video/beta/audio_v3/Samantha/cues.json`; the
sentence text comes from the language pack. It needs all 12 sections and the same
number of sentences per section as the language pack, so a run with missing sections
is for checking only; record the missing ones and run the tool again before building.
`file` is relative to the folder of `cues.json`.

## 3. How to read the report

`report.md` starts with a summary (sections found, missing sections, how many boundaries
were detected / estimated, which sections to check by ear), then an overview table, then
one block per section:

* **source / delivered** lines: what was cut, the levels before and after cleaning.
  Warnings are printed in capitals:
  * `CLIPPED` - the source has runs of full-scale samples. Record again at a lower level.
  * `NOISY` - the noise floor of the delivered file is above -45 dBFS (the noise will be
    audible under the music and the pauses are harder to find). Record again in a
    quieter place or closer to the microphone.
  * `VERY QUIET` - the source speech level is below -35 dBFS; the gain needed raises the
    noise as well.
  * `NO CLEAR PAUSES` - even the longest pauses of the section are shorter than 0.35 s:
    the speaker did not pause between the sentences.
  * `ESTIMATED` / `LOW CONFIDENCE` - a boundary to listen to (see below).
  * `PACE` - the section is spoken much faster or slower than the others: wrong file, or
    text added or left out.
  * a note when a sentence is spoken at a very different pace from the rest of the
    section, or when a pause longer than 2.5 s lies inside the section (a re-start?).
* **sentence table**: start, end, length, timing, pace (speed relative to the section:
  100 % is normal; 60 % or 150 % means the boundaries around it are probably wrong or the
  spoken words differ from the script).
* **boundary table**: for every boundary the pause it sits on (from / to / length), the
  timing, the confidence and the *margin* (how much worse the next best choice was; a
  small margin, below about 2, means the alternative shown in the last column is nearly
  as plausible - listen to both spots).
  Confidence is a heuristic 0..1 from the margin, the pause length and how well the
  sentence lengths agree with the text: `high` (>= 0.75), `medium`, `low` (< 0.45).
* **all pauses**: every pause of at least 0.15 s in the section, `from-to (length)`, with
  the ones used as boundaries in bold. This is the list to pick from when correcting a
  boundary by hand.

Checking by ear: open the delivered `<section_id>.wav` (QuickTime Player, or Audacity),
go to `start_s` of the doubtful sentence and listen whether the sentence really starts
there. The sentence text is in the table.

## 4. How the boundaries are found

1. The recording is converted to 48 kHz mono, the DC offset removed, and the level of
   every 10 ms frame measured. The noise floor is the level of the pauses (or the
   quietest 5 % when there are no clear pauses); the speech level is the RMS of the
   frames within 25 dB of the loudest ones.
2. Silence = frames below `noise floor + 8 dB` (never lower than speech - 35 dB, never
   higher than speech - 12 dB). Stretches of at least 60 ms count. Sounds between two
   silences that are much quieter than the speech (18 dB below) and shorter than 0.8 s,
   or noise-like (high zero-crossing rate) and at least 5 dB below the speech, are
   treated as breaths and belong to the pause; clicks shorter than 50 ms as well.
3. Every pause of at least 0.15 s between two speech sounds is a candidate. The N-1
   boundaries of an N-sentence section are chosen by dynamic programming over the
   candidates, minimising (a) how far each sentence's spoken length is from the share
   its text has in the section (the *prior*, measured on the speech-only time axis so
   that pause lengths do not shift it; a sentence may deviate by about 18 % + 0.3 s
   before it costs much) and (b) a pause-length cost: a pause as long as the (N-1)th
   longest pause of the section (at least 0.5 s) is free, shorter pauses cost more,
   pauses under 0.35 s a lot more. For every boundary there is also a "virtual"
   candidate at the position the text predicts; it costs 7 (about a 2.6-sigma deviation),
   less when even the longest pauses of the section are short. When the solver picks a
   virtual candidate the boundary is *estimated*: it is placed between its detected
   neighbours in proportion to the text and moved to the quietest spot within 0.3 s.
4. `start_s` is 20 ms before the first speech frame after the pause; `end_s` is 30 ms
   after the last speech frame before it.

With `--single` the same solver first splits the long recording into the 12 sections
(prior = text length of each section; a pause of at least 1 s is free, under 0.6 s
expensive), then every section goes through the steps above.

## 5. Correcting a boundary by hand (`--overrides`)

Listen, find the correct start of the sentence in the delivered `<section_id>.wav`
(the "all pauses" list in the report gives the exact times of every pause), write it
into a JSON file and run the tool again with `--overrides`:

```json
{
  "sections": {
    "04_dashboard": { "sentence_starts": { "3": 17.84 } },
    "07_wa_chat":   { "sentence_starts": { "2": 6.10, "4": 21.65 },
                      "sentence_ends":   { "1": 5.72 } }
  },
  "single": { "section_starts": { "05_leads": 123.40 } }
}
```

* `sentence_starts`: sentence number -> start in seconds **inside the delivered section
  file** (the times shown in the report). Sentence 1 always starts where the speech
  starts, so numbers 2..N are accepted.
* `sentence_ends`: optional end of the previous sentence. Without it the end is the
  beginning of the pause that leads up to the given start (or the start itself when
  there is no pause there).
* `single.section_starts`: for `--single`, section id -> start in seconds **inside the
  original long recording**.

A corrected boundary is marked `manual` and pinned; the other boundaries of the section
are solved again around it, so one correction often fixes its neighbours. A value outside
the speech is reported and ignored; a start that is followed by silence is used but
noted in the report (check the number). The delivered file does not move between runs
(the trim is deterministic), so the times stay valid until the recording itself is
replaced.

## 6. Limits

* No speech recognition: the tool never checks that the words spoken are the words of
  the script. A skipped or repeated sentence shows up only as a pace warning or a wrong
  boundary. Listening to the flagged sections is part of the job.
* Pauses are the evidence. A speaker who runs sentences together gets estimated
  boundaries (typically within 0.1-0.5 s on the synthetic test, but they can be off by
  more than a second); correct them with `--overrides` or record again with pauses.
* Loud breaths right next to a sentence start can move the start a little earlier
  (the breath is treated as part of the pause when it is clearly quieter than the speech
  or noise-like; a breath as loud as a word cannot be told from one).
* Formats: whatever `afconvert` reads. WhatsApp voice notes (.opus / .ogg) are not
  supported by afconvert; ask for a Voice Memos m4a or a wav instead.
* Room reverberation shortens the measured pauses; keep the microphone close.

## 7. Proof

`reports/video/beta/ingest_test/` holds the synthetic test: `make_synthetic.py` builds
recordings with known boundaries from the English script (say, voice Samantha), with
random pauses, breath pauses inside the longest sentences, noise, level differences,
mixed containers and file names; `run_tests.py` runs the tool on every set in both
forms and `evaluate.py` compares against the truth. `evaluation.md` there has the
numbers of the last run.
