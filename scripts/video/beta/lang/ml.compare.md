# Malayalam narration — back-translation compared with the English, and the fixes

Date: 2026-09-29. Files this document is about:

- English narration: `scripts/video/beta/vo_script_v3.json` (12 sections, 38 sentences)
- Blind back-translation of the Malayalam: `scripts/video/beta/lang/ml.backtranslation.md`
- Malayalam language pack (fixed here): `scripts/video/beta/lang/ml.json`
- Malayalam recording script JSON (fixed here, wording identical to the pack): `scripts/video/beta/vo_script_v3.ml.json`
- Recording script for the voice artist (new): `reports/video/beta/ProgBiz_Malayalam_Recording_Script.html` and `.docx`

## Method

The back-translator's literal English of every Malayalam sentence was set against the English narration, sentence by sentence, and given one verdict: **same meaning**, **drifted** (anything said more strongly or more weakly than the English counts as drifted), **claim added**, **claim dropped**, or **stiff** (the back-translator's "stiff"/"wrong", or a wording a Kerala listener would hear as translated). Everything that was not "same meaning", or that the back-translator marked stiff, was rewritten; a few items from the back-translator's "worth a second look" list were also improved where that was possible without touching the claim. The two Malayalam files were edited together (same wording in both), then re-validated (section 5).

## Verdicts, narration (38 sentences)

| # | English (abridged) | Back-translation says | Verdict | Action |
|---|---|---|---|---|
| 01.1 | Enquiries arrive from Facebook ads, your website, WhatsApp and phone calls, and each one needs a quick, personal follow-up. | same list, "each one needs a fast, personal follow-up"; "വ്യക്തിപരമായ" (personal) may be heard as "done personally" | same meaning | keep. The English "personal follow-up" carries exactly the same double sense (personal attention / personalised); nothing is added or lost. |
| 01.2 | Miss one, and the deal goes to someone else. | "If one slips away, someone else will carry off that deal" (idiomatic) | same meaning | keep |
| 01.3 | ProgBiz ERP brings your leads, follow-ups, WhatsApp chats and team performance into one simple platform. | same | same meaning | keep |
| 01.4 | Sales executives know who to call next, managers see the whole pipeline live, and business owners see which marketing and which people deliver results. | same three clauses in the same order; last clause "stiff"; "ആളുകൾ" (people) could be heard as customers instead of staff | same meaning, **stiff** | **fixed** — last clause now "ബിസിനസ് ഉടമകൾക്ക് ഏത് മാർക്കറ്റിംഗാണ്, ടീമിൽ ആരൊക്കെയാണ് ഫലം തരുന്നതെന്ന് കാണാം" (= owners see which marketing, and who in the team, brings results). Anchors unchanged. |
| 01.5 | Here is how your team uses it, every day. | "Let us look at how your team uses this every day" | same meaning | keep (the standard explainer lead-in) |
| 02.1 | The day starts on the Home screen. | same | same meaning | keep |
| 02.2 | New leads, follow-ups, delayed work and completed activities at a glance, with today's schedule, recent follow-up history and a lead summary by stage. | same items, same order; notes "വൈകിയ ജോലികൾ" (delayed work) here vs "വൈകിയ ടാസ്കുകൾ" (delayed tasks) in 03.3 | same meaning | keep. The English itself says "delayed work" here (the Home card is labelled "Delayed") and "delayed tasks" in 03.3 (the AI chip on screen reads "How many tasks are delayed?"); the Malayalam follows the English and the screen in both places. |
| 03.1 | Need an answer fast? Just ask the AI Assistant. | same | same meaning | keep |
| 03.2 | Type a question like, how many leads today, and get the answer from your own business data in seconds — no reports, no spreadsheets. | same | same meaning | keep |
| 03.3 | Ask about follow-ups due today, delayed tasks, project status, or who is present today. | same four items, same order | same meaning | keep |
| 03.4 | Every conversation is saved, so you can pick up where you left off. | same | same meaning | keep |
| 04.1 | For managers, the CRM Dashboard turns sales activity into a clear picture. | "gives a clear picture of sales activities"; verb slightly formal | same meaning | keep ("gives a clear picture" is the idiomatic equivalent; "നൽകുന്നു" is normal narrator register) |
| 04.2 | Win rate, conversion rate, lost rate and pipeline value sit right at the top, with every lead grouped by stage — new, cold, warm, hot, won and lost. | same, rates first, then the six stage names; "വാം" (warm) looks odd written | same meaning | keep; the stage names are the English chips on screen. The recording script has a table telling the artist to say them as the English words (new, cold, warm, hot, won, lost). |
| 04.3 | Leads in follow-up are split into today's, delayed and upcoming, so priorities are obvious. | same | same meaning | keep |
| 04.4 | Scroll down to compare every executive side by side, follow call activity, and see which lead sources actually bring in revenue. | same, same order | same meaning | keep |
| 05.1 | All your enquiries live in Leads. | same | same meaning | keep |
| 05.2 | Tabs keep new, in follow-up, won and lost leads apart, and Status View shows every stage of your sales process. | same; the two halves are joined only by a comma, "slightly abrupt" | same meaning (abrupt join) | **fixed** — "…വെവ്വേറെ കാണാം, ഒപ്പം സ്റ്റാറ്റസ് വ്യൂ …" (= and along with that, Status View …). Anchor "and Status View" is now "ഒപ്പം സ്റ്റാറ്റസ് വ്യൂ", so the pointer clicks Status View on the "and", as in English. |
| 05.3 | Powerful filters find any lead by source, quality, assignee, date, or even Facebook campaign. | same fields; "എന്തിന്," is literary; "അസൈനി" (assignee) is hard to catch by ear | same meaning, **stiff** | **fixed** — "…സോഴ്സ്, ക്വാളിറ്റി, അസൈൻ ചെയ്ത ആൾ, തീയതി, ഫേസ്ബുക്ക് ക്യാമ്പെയ്ൻ വെച്ചുപോലും ഏത് ലീഡും കണ്ടെത്താം." "എന്തിന്" dropped ("വെച്ചുപോലും" already says "even by"); "assignee" is now "അസൈൻ ചെയ്ത ആൾ" (the person assigned), which is what the filter on the Leads page is called ("Assigned To"). Anchor "assignee" updated. |
| 05.4 | And when priorities change, Lead Transfer moves leads between executives in bulk. | same | same meaning | keep |
| 06.1 | A lead is only as valuable as its next action. | "The worth (price) of a lead lies in what is done next on it"; "വില" may be heard as "price" | same meaning (one ambiguous word) | **fixed** — "വില" replaced by "മൂല്യം" (value): "ഒരു ലീഡിന്റെ മൂല്യം, അതിൽ അടുത്തതായി എന്തു ചെയ്യുന്നു എന്നതിലാണ്." |
| 06.2 | Follow-ups are sorted into today's, delayed, upcoming and non follow-up, so nothing slips through the cracks. | same; "നോൺ ഫോളോ-അപ്പ്" is a bare label | same meaning | keep: it is the name of the fourth tab on the Follow-ups page ("Non Followup"), which the pointer clicks while the words are spoken, and the English narration uses the same label. |
| 06.3 | Prefer a board? Kanban View shows every follow-up by status, with the next date, last contact and executive on each card. | same | same meaning | keep |
| 07.1 | Your customers are already on WhatsApp, and so is ProgBiz. | same | same meaning | keep |
| 07.2 | The shared inbox brings every WhatsApp chat into the CRM, so your whole team works from one place, with search and unread filters, and no conversation is lost. | same, same order; four comma clauses are long for one breath; "ഷെയേർഡ്" is an unusual spelling | same meaning | **light fix** — spelling "ഷെയർഡ്"; the comma after "ജോലി ചെയ്യാം" became an em dash (the breath mark the back-translator asked for). Wording and anchor otherwise unchanged. |
| 07.3 | A chatbot greets every new enquiry with your own welcome message and helps customers find the right service, day and night. | same | same meaning | keep |
| 07.4 | Add your documents and product details to the Knowledge Base, and the chatbot AI answers customer questions for you. | same; "ചാറ്റ്ബോട്ട് AI" reads as "the chatbot's AI", "AI ചാറ്റ്ബോട്ട്" would be natural | same meaning | **fixed** word order: "…AI ചാറ്റ്ബോട്ട് നിങ്ങൾക്കുവേണ്ടി മറുപടി നൽകും" (the AI chatbot answers for you) — same claim. |
| 08.1 | Need to reach many customers at once? Send a broadcast. | "Want to arrive to a lot of customers at the same time?" — "sounds translated" | same meaning, **stiff** | **fixed** — "ഒരേസമയം ഒരുപാട് കസ്റ്റമേഴ്സിലേക്ക് മെസേജ് എത്തിക്കണോ? ഒരു ബ്രോഡ്കാസ്റ്റ് അയയ്ക്കൂ." (= Want to get a message to a lot of customers at the same time? Send a broadcast.) "മെസേജ് എത്തിക്കുക" is the everyday phrase; a broadcast is a message, so no claim is added. |
| 08.2 | Pick an approved WhatsApp template, choose your customers, and send it immediately, or schedule it for later. | same, same order | same meaning | keep |
| 08.3 | Then track every campaign — sent, delivered, read, clicked and replied — along with the enquiries and wins it brought in. | same; "wins" rendered as "deals won" | same meaning | keep |
| 09.1 | AI Call Analysis reviews your team's recorded calls. | "evaluates" | same meaning | keep |
| 09.2 | Every call gets a lead score, an agent score and the customer's sentiment, and managers can listen to any recording right from the list. | same | same meaning | keep |
| 09.3 | Open a call to read an AI summary and a coaching note, so you know which calls went well, and how to close the next one. | same | same meaning | keep |
| 10.1 | Lead Expenses keeps track of what you spend on every lead source and ad. | same | same meaning | keep |
| 10.2 | Together with your results, it shows the real cost per lead and the return on your marketing. | same | same meaning | keep |
| 11.1 | Executive Performance brings it all together. | same | same meaning | keep |
| 11.2 | Each executive gets one score, built from target achievement, win rate, won value and activity, so your best performers rise to the top and everyone can see where to improve. | same | same meaning | keep |
| 12.1 | For business owners, that means fewer missed leads, faster replies on WhatsApp, a sales team that is easy to coach, and marketing money spent where it works. | same four benefits, same order | same meaning | keep |
| 12.2 | ProgBiz ERP — bringing your business workflow together. | same; "വർക്ക്ഫ്ലോ" loanword | same meaning | keep (brand line; Progbiz marketing should sign it off, as the review already says) |

Totals: 38 sentences, all 38 **same meaning** as the English; **0 claim added, 0 claim dropped, 0 drifted**. Three were also **stiff** (01.4, 05.3, 08.1) and were rewritten; four more were touched for clarity or spelling without changing what they say (05.2, 06.1, 07.2, 07.4). No sentence says anything stronger or weaker than the English.

## Verdicts, on-screen text (36 entries)

| English | Back-translation says | Verdict | Action |
|---|---|---|---|
| Facebook • Website • WhatsApp; For sales executives; For managers; For business owners | natural | same meaning | keep |
| One place to start your day; Ask your data anything; Your pipeline at a glance | natural/acceptable, "your" dropped | same meaning | keep ("your" is normally left out of a Malayalam pill) |
| Answers in seconds; Today • Delayed • Upcoming; Know which sources pay off; Find any lead, fast; Move leads in bulk; Never miss a follow-up; Every stage on one board | natural | same meaning | keep |
| One shared WhatsApp inbox | "one single WhatsApp inbox for the team" | same meaning | keep (says what "shared" means) |
| A chatbot that replies 24/7; Approved WhatsApp templates; Send now or schedule; Track every campaign; AI scores every call; Coaching for every executive; Every ad spend, by source; Cost per lead and return; One score per executive; Fewer missed leads; A team you can coach | natural | same meaning | keep |
| AI answers from your content | "കണ്ടന്റ്" loanword, understood | same meaning | keep |
| Marketing that pays back | "marketing that gives results" | same meaning | keep |
| **Faster WhatsApp replies** | "quick reply on WhatsApp" — the comparative is lost | **drifted (weaker)** | **fixed**: "വാട്സ്ആപ്പിൽ കൂടുതൽ വേഗത്തിൽ മറുപടി" (= faster replies on WhatsApp; 4 words, 20 graphemes). Same words as the narration anchor of 12.1. |
| One platform for your whole sales team; Leads, follow-ups, WhatsApp and team performance, in one place; A day with ProgBiz ERP; Bringing your business workflow together | natural/acceptable | same meaning | keep |
| How it works; From the first enquiry to the final result | acceptable, formal | same meaning | keep (title cards) |
| **Capture every lead. Reply faster on WhatsApp. Know how your team performs.** | "Give replies quickly on WhatsApp" — comparative lost | **drifted (weaker)** | **fixed**: middle sentence now "വാട്സ്ആപ്പിൽ കൂടുതൽ വേഗത്തിൽ മറുപടി നൽകൂ." |

## What changed, exactly (9 edits, identical in `lang/ml.json` and `vo_script_v3.ml.json`)

| Where | Before | After |
|---|---|---|
| 01_intro s4 | …ബിസിനസ് ഉടമകൾക്ക് ഏത് മാർക്കറ്റിംഗും ഏതൊക്കെ ആളുകളുമാണ് ഫലം തരുന്നതെന്ന് കാണാം. | …ബിസിനസ് ഉടമകൾക്ക് ഏത് മാർക്കറ്റിംഗാണ്, ടീമിൽ ആരൊക്കെയാണ് ഫലം തരുന്നതെന്ന് കാണാം. |
| 05_leads s2 | …വെവ്വേറെ കാണാം, സ്റ്റാറ്റസ് വ്യൂ നിങ്ങളുടെ… (anchor "and Status View" = സ്റ്റാറ്റസ് വ്യൂ) | …വെവ്വേറെ കാണാം, ഒപ്പം സ്റ്റാറ്റസ് വ്യൂ നിങ്ങളുടെ… (anchor = ഒപ്പം സ്റ്റാറ്റസ് വ്യൂ) |
| 05_leads s3 | …സോഴ്സ്, ക്വാളിറ്റി, അസൈനി, തീയതി, എന്തിന്, ഫേസ്ബുക്ക് ക്യാമ്പെയ്ൻ വെച്ചുപോലും… (anchor "assignee" = അസൈനി) | …സോഴ്സ്, ക്വാളിറ്റി, അസൈൻ ചെയ്ത ആൾ, തീയതി, ഫേസ്ബുക്ക് ക്യാമ്പെയ്ൻ വെച്ചുപോലും… (anchor = അസൈൻ ചെയ്ത ആൾ) |
| 06_followups s1 | ഒരു ലീഡിന്റെ വില, … | ഒരു ലീഡിന്റെ മൂല്യം, … |
| 07_wa_chat s2 | ഷെയേർഡ് ഇൻബോക്സ് … ജോലി ചെയ്യാം, സെർച്ചും… | ഷെയർഡ് ഇൻബോക്സ് … ജോലി ചെയ്യാം — സെർച്ചും… |
| 07_wa_chat s4 | …ചാറ്റ്ബോട്ട് AI നിങ്ങൾക്കുവേണ്ടി മറുപടി നൽകും. | …AI ചാറ്റ്ബോട്ട് നിങ്ങൾക്കുവേണ്ടി മറുപടി നൽകും. |
| 08_wa_broadcast s1 | ഒരുപാട് കസ്റ്റമേഴ്സിലേക്ക് ഒരേസമയം എത്തണോ? ഒരു ബ്രോഡ്കാസ്റ്റ് അയയ്ക്കൂ. | ഒരേസമയം ഒരുപാട് കസ്റ്റമേഴ്സിലേക്ക് മെസേജ് എത്തിക്കണോ? ഒരു ബ്രോഡ്കാസ്റ്റ് അയയ്ക്കൂ. |
| screen_text "Faster WhatsApp replies" | വാട്സ്ആപ്പിൽ വേഗത്തിൽ മറുപടി | വാട്സ്ആപ്പിൽ കൂടുതൽ വേഗത്തിൽ മറുപടി |
| screen_text end-card CTA | …വാട്സ്ആപ്പിൽ വേഗത്തിൽ മറുപടി നൽകൂ.… | …വാട്സ്ആപ്പിൽ കൂടുതൽ വേഗത്തിൽ മറുപടി നൽകൂ.… |

Nothing else in either file changed (checked with `diff` against copies of the originals: 11 changed lines in `ml.json`, 7 in `vo_script_v3.ml.json`, all listed above). The terminology table in `ml.review.md` still lists the old spelling "ഷെയേർഡ് ഇൻബോക്സ്"; the pack now uses "ഷെയർഡ്".

### Points from the back-translation that were looked at and deliberately not changed

- **വൈകിയ ജോലികൾ / വൈകിയ ടാസ്കുകൾ** (02.2 vs 03.3): mirrors the English ("delayed work" / "delayed tasks") and the screen (Home card "Delayed"; AI chip "How many tasks are delayed?").
- **നോൺ ഫോളോ-അപ്പ്** (06.2): the tab name, clicked on screen at that moment; same in English.
- **വാം / വോൺ** (04.2, 05.2, 11.2): the stage names as shown on screen; the recording script tells the artist to say the English words.
- **യഥാർത്ഥ / ഇതിനർത്ഥം**: the older spellings are accepted and are how most Kerala print still writes them; no change.
- **end_card_cta in `vo_script_v3.ml.json` is still the English string** — the back-translator asked who reads it. Answer: nobody. The builder (`09_build_timeline_lang.js`, the `q_end` card near line 801) writes the CTA with the English key `'Capture every lead. …'`, which `T()` turns into the Malayalam from `screen_text`; `ingest_recording.py` does not read the field either. It is kept as the English key on purpose (see `ml.review.md`).

## Validation after the edits

1. **Contract check** (`validate_pack.js`, node, kept in the session scratchpad; the same checks as in `ml.review.md`): valid JSON; `lang: ml`; 12 sections in the English order with 5/2/4/4/4/3/4/3/3/2/2/2 sentences; every one of the 42 anchors listed in the task present, copied verbatim (`indexOf`), occurring once (so the first occurrence is the intended one), starting and ending on a word boundary, in ascending order within its sentence, and never at the very start of a sentence whose picture starts with something else (executives, cards, rates, template, scores, formula, fewer missed leads); no anchors the edit does not use; all 36 `screen_text` keys of `lang/en.json` present and no extra ones; 29 callouts at most 30 graphemes (longest now 20) and 6 words (longest 5); NFC; no ZWJ/ZWNJ/ZWSP/BOM/NBSP/control characters and no old-style (consonant+virama+ZWJ) chillu anywhere; `vo_script_v3.ml.json` has the same 38 sentences as the pack and the same `title`/`slot`/`video`/`_source` as the English script. Result: **0 fail, 0 warn** (the files before the edits also gave 0/0, so the check is comparable).
2. **Real builder**, `node scripts/video/beta/09_build_timeline_lang.js --lang ml --pack lang/ml.json --cues reports/video/beta/audio_v3/Samantha/cues.json --tag v3_ml_check`, run from a copy of the builder in the scratchpad with every entry of `reports/video/beta/cap/` symlinked (so the composite shots and the timeline were written in the scratchpad; nothing under `reports/` was created or changed — verified with `ls`). Result: built without error, **42 anchors resolved, every order check passed** including the minimum gaps (0.7 s in 01.4 and 08.2, 0.8 s in 12.1); the changed anchors sit at 01.4 "managers see" 35/105 and "and business owners" 60/105 graphemes, 05.2 "won and lost" 26/81 then "and Status View" 45/81, 05.3 source 18 / quality 22 / assignee 27 / date 38 / facebook campaign 43 of 67, 07.2 "with search and unread filters" 70/107. The only warnings are the same three as before the edits and as with the English pack (highlights in `d_scroll` and `c_detail` that flash under the English durations); they come from the edit's timing with the English cues, not from the wording. All times are indicative only until the Malayalam recording is ingested.
3. **Rendered frames** (`scripts/video/compose/render.js`, local headless Chromium, `file://` only) from that sandbox timeline, looked at: the closing WhatsApp cut at 276.0 s shows the new pill "വാട്സ്ആപ്പിൽ കൂടുതൽ വേഗത്തിൽ മറുപടി" on one line beside the chat list, and the end card at 288.0 s shows the tagline plus the three CTA sentences each on its own line, nothing clipped; the renderer reported "no callout covers its target or leaves the frame".

## Recording script for the voice artist

- `reports/video/beta/ProgBiz_Malayalam_Recording_Script.html` — generated from `vo_script_v3.ml.json` and `vo_script_v3.json` (so the 38 sentences are copied, not retyped). Page 1: how to record in simple English (one file per section with QuickTime Player > File > New Audio Recording or a phone voice-memo app; file names 01 … 12; folder `reports/video/beta/audio_ml/recorded/`, which now exists, empty; quiet room; calm, friendly pace; about one second of silence between sentences; on a mistake pause and read the whole sentence again; do not read titles, numbers or the grey English). Then a short pronunciation box (English-letter words said in English; the six stage names with their English pronunciation; dash/colon = short pause; keep the word order). Then one block per section: number and title, the Malayalam in 26 px with one numbered sentence per line and the English sentence in small grey type under each. Font stack `"Malayalam Sangam MN", "Malayalam MN", sans-serif` (confirmed as the computed font in the local headless browser; screenshots of page 1 and of sections 5–7 were inspected: conjuncts and chillu letters render correctly, numbering and grey English lines as intended).
- `reports/video/beta/ProgBiz_Malayalam_Recording_Script.docx` — `textutil -convert docx` of the HTML. Checked by converting the .docx back with `textutil -convert txt`: all 38 Malayalam sentences and all 38 English lines come back verbatim, 4456 Malayalam characters, NFC, no zero-width characters.
- After recording: `python3 scripts/video/vo/ingest_recording.py --script scripts/video/beta/vo_script_v3.ml.json --in reports/video/beta/audio_ml/recorded --out reports/video/beta/audio_ml/<Speaker>` then `node scripts/video/beta/09_build_timeline_lang.js --lang ml --cues reports/video/beta/audio_ml/<Speaker>/cues.json` (see `scripts/video/vo/INGEST.md`).

## Still to be confirmed by a native speaker at Progbiz (unchanged from `ml.review.md`)

വോൺ for "Won"; the brand tagline (12.2 and the end card); "ക്യാപ്ചർ ചെയ്യൂ" in the CTA; ടീം പെർഫോമൻസ് vs ടീമിന്റെ പ്രകടനം. None of these affects the timing or the anchors.
