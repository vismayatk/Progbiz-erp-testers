# Malayalam language pack — review of the three drafts and the final choice

Files
- Final pack: `scripts/video/beta/lang/ml.json` (12 sections, 38 sentences, 42 anchors, 36 screen texts)
- Recording script: `scripts/video/beta/vo_script_v3.ml.json` (the English `vo_script_v3.json` with the Malayalam sentences; every other field kept; `"lang": "ml"` added at the top because `ingest_recording.py` copies `script.get("lang")` into `cues.json`; `end_card_cta` is left in English because it is a `screen_text` key, the Malayalam CTA is in `ml.json`)
- Drafts judged: `lang/drafts/ml_A.json`, `ml_B.json`, `ml_C.json`. All three were valid JSON with the right counts and all anchors verbatim; none had to be skipped.

Overall picture of the drafts: **A** reads best aloud (ad register, idiomatic verbs, keeps UI terms) but leans on semicolons and a few inverted clauses; **B** is the most compact and plain-spoken, uses Malayalam-script "എഐ / സിആർഎം" and "വൺ" for Won; **C** is the most literal (newspaper words: ഉപഭോക്താക്കൾ, സമീപകാല, ഘട്ടം, അംഗീകൃത, തത്സമയം, "-ുന്നു" verb chains) and turns on-screen stage names into pure Malayalam, so it was used least. The final is mostly A with B's shorter clause endings, plus a few edits of my own where the picture needs more spoken text between two anchors (marked "own" below).

## Narration, sentence by sentence

| # | English | Chosen Malayalam | From | Why |
|---|---|---|---|---|
| 01.1 | Enquiries arrive from Facebook ads, your website, WhatsApp and phone calls, and each one needs a quick, personal follow-up. | ഫേസ്ബുക്ക് പരസ്യങ്ങൾ, നിങ്ങളുടെ വെബ്സൈറ്റ്, വാട്സ്ആപ്പ്, ഫോൺ കോളുകൾ — ഇവയിലൂടെയെല്ലാം എൻക്വയറികൾ വരുന്നു, ഓരോന്നിനും വേഗത്തിലുള്ള, വ്യക്തിപരമായ ഒരു ഫോളോ-അപ്പ് വേണം. | A + B | A's dash-list opening is the most natural spoken form; B's verb-final "…ഫോളോ-അപ്പ് വേണം" is easier to read aloud than A's inverted "വേണം വേഗത്തിലുള്ള…"; C's "ആവശ്യമാണ്" is stiff. |
| 01.2 | Miss one, and the deal goes to someone else. | ഒന്ന് വിട്ടുപോയാൽ, ആ ഡീൽ മറ്റാരെങ്കിലും കൊണ്ടുപോകും. | A | "മറ്റാരെങ്കിലും കൊണ്ടുപോകും" is the idiom; C's "മറ്റൊരാൾക്ക് പോകും" is flat. |
| 01.3 | ProgBiz ERP brings your leads, follow-ups, WhatsApp chats and team performance into one simple platform. | ProgBiz ERP നിങ്ങളുടെ ലീഡുകളും ഫോളോ-അപ്പുകളും വാട്സ്ആപ്പ് ചാറ്റുകളും ടീം പെർഫോമൻസും ലളിതമായ ഒരൊറ്റ പ്ലാറ്റ്ഫോമിലേക്ക് കൊണ്ടുവരുന്നു. | A + C | A's wording; C's "-ലേക്ക്" ("into"). "ടീം പെർഫോമൻസ്" kept over B/C's "ടീമിന്റെ പ്രകടനം" to match the module name Executive Performance (see terminology). |
| 01.4 | Sales executives know who to call next, managers see the whole pipeline live, and business owners see which marketing and which people deliver results. | സെയിൽസ് എക്സിക്യൂട്ടീവുകൾക്ക് അടുത്തതായി ആരെ വിളിക്കണമെന്ന് അറിയാം, മാനേജർമാർക്ക് മുഴുവൻ പൈപ്പ്ലൈനും ലൈവായി കാണാം, ബിസിനസ് ഉടമകൾക്ക് ഏത് മാർക്കറ്റിംഗും ഏതൊക്കെ ആളുകളുമാണ് ഫലം തരുന്നതെന്ന് കാണാം. | A + B | Three parallel "-ക്ക് … കാണാം" clauses in the screen order (executives, managers, owners). A's manager clause, B's clean ending (A had a stray "-ഉം"). C's "കാണുന്നു" chain is stiff and its anchor was needlessly long. Anchors: "മാനേജർമാർക്ക്", "ബിസിനസ് ഉടമകൾക്ക്". |
| 01.5 | Here is how your team uses it, every day. | നിങ്ങളുടെ ടീം ഇത് ദിവസവും ഉപയോഗിക്കുന്നത് എങ്ങനെയെന്ന് നോക്കാം. | B | "…എങ്ങനെയെന്ന് നോക്കാം" is the standard explainer lead-in; A/C's "ഇങ്ങനെയാണ്" is a literal statement. |
| 02.1 | The day starts on the Home screen. | ദിവസം തുടങ്ങുന്നത് ഹോം സ്ക്രീനിലാണ്. | A = B = C | Identical in all drafts. |
| 02.2 | New leads, follow-ups, delayed work and completed activities are visible at a glance, with today's schedule, recent follow-up history and a lead summary by stage. | പുതിയ ലീഡുകൾ, ഫോളോ-അപ്പുകൾ, വൈകിയ ജോലികൾ, പൂർത്തിയാക്കിയ ആക്ടിവിറ്റികൾ എന്നിവ ഒറ്റനോട്ടത്തിൽ കാണാം, ഒപ്പം ഇന്നത്തെ ഷെഡ്യൂളും, അടുത്തിടെ നടന്ന ഫോളോ-അപ്പുകളുടെ ഹിസ്റ്ററിയും, സ്റ്റേജ് തിരിച്ചുള്ള ലീഡ് സമ്മറിയും ഉണ്ട്. | A/B | A and B share this wording; B's "ഉണ്ട്" closes the sentence, A's commas kept as breath marks. C's "സമീപകാല", "ഘട്ടം", "പ്രവർത്തനങ്ങൾ" are newspaper words. Cards first, then schedule, history, summary, as the camera moves. |
| 03.1 | Need an answer fast? Just ask the AI Assistant. | പെട്ടെന്ന് ഒരു ഉത്തരം വേണോ? AI അസിസ്റ്റന്റിനോട് ചോദിച്ചാൽ മതി. | A (= B, C) | Same in all; "AI" in Latin letters as on the menu (B wrote എഐ). |
| 03.2 | Type a question like, how many leads today, and get the answer from your own business data in seconds — no reports, no spreadsheets. | ‘ഇന്ന് എത്ര ലീഡുകൾ വന്നു’ എന്നതുപോലെ ഒരു ചോദ്യം ടൈപ്പ് ചെയ്യൂ, നിങ്ങളുടെ സ്വന്തം ബിസിനസ് ഡാറ്റയിൽ നിന്ന് സെക്കൻഡുകൾക്കുള്ളിൽ ഉത്തരം കിട്ടും — റിപ്പോർട്ടും വേണ്ട, സ്പ്രെഡ്ഷീറ്റും വേണ്ട. | A + B | A's example question ("വന്നു" makes it a complete spoken question); B's quotes, "സെക്കൻഡുകൾക്കുള്ളിൽ" (exact: നിമിഷം can also mean minute) and punchy "റിപ്പോർട്ടും വേണ്ട, സ്പ്രെഡ്ഷീറ്റും വേണ്ട". |
| 03.3 | Ask about follow-ups due today, delayed tasks, project status, or who is present today. | ഇന്ന് ചെയ്യേണ്ട ഫോളോ-അപ്പുകൾ, വൈകിയ ടാസ്കുകൾ, പ്രോജക്ട് സ്റ്റാറ്റസ്, ഇന്ന് ആരൊക്കെ ഹാജരുണ്ട് — ഇവയെക്കുറിച്ചെല്ലാം ചോദിക്കാം. | A | Clean list, the four chips in order; C's "അല്ലെങ്കിൽ … എന്നതിനെക്കുറിച്ച് ചോദിക്കൂ" is clumsy. All four anchors verbatim and unique. |
| 03.4 | Every conversation is saved, so you can pick up where you left off. | ഓരോ സംഭാഷണവും സേവ് ആകും, അതുകൊണ്ട് നിർത്തിയിടത്തുനിന്ന് തന്നെ തുടരാം. | A | A/B nearly identical; "തന്നെ" gives the "right where" nuance. C's "-ുന്നതിനാൽ" is formal. |
| 04.1 | For managers, the CRM Dashboard turns sales activity into a clear picture. | മാനേജർമാർക്ക്, CRM ഡാഷ്ബോർഡ് സെയിൽസ് പ്രവർത്തനങ്ങളുടെ വ്യക്തമായ ഒരു ചിത്രം നൽകുന്നു. | A | Natural "gives a clear picture"; C's "ചിത്രമാക്കി മാറ്റുന്നു" is word-for-word, B moves the Dashboard out of the subject. |
| 04.2 | Win rate, conversion rate, lost rate and pipeline value sit right at the top, with every lead grouped by stage — new, cold, warm, hot, won and lost. | വിൻ റേറ്റ്, കൺവേർഷൻ റേറ്റ്, ലോസ്റ്റ് റേറ്റ്, പൈപ്പ്ലൈൻ വാല്യൂ എന്നിവ ഏറ്റവും മുകളിൽ തന്നെയുണ്ട്, ഒപ്പം ഓരോ ലീഡും സ്റ്റേജ് തിരിച്ച് കാണാം — ന്യൂ, കോൾഡ്, വാം, ഹോട്ട്, വോൺ, ലോസ്റ്റ്. | A + B | Rates first (camera), then the stages exactly as the chips on screen. A's "വോൺ" for Won (B's "വൺ" reads as "one"; C's "നേടിയത്/നഷ്ടപ്പെട്ടത്" drop the on-screen names). B's "സ്റ്റേജ് തിരിച്ച് കാണാം" is lighter than A's "അനുസരിച്ച് തിരിച്ചിരിക്കുന്നു". |
| 04.3 | Leads in follow-up are split into today's, delayed and upcoming, so priorities are obvious. | ഫോളോ-അപ്പിലുള്ള ലീഡുകളെ ഇന്നത്തേത്, വൈകിയത്, വരാനുള്ളത് എന്നിങ്ങനെ തിരിച്ചിട്ടുണ്ട്, അതുകൊണ്ട് ആദ്യം ചെയ്യേണ്ടത് ഏതെന്ന് വ്യക്തമാണ്. | B (+ A) | B's plain "തിരിച്ചിട്ടുണ്ട് … ആദ്യം ചെയ്യേണ്ടത് ഏതെന്ന് വ്യക്തമാണ്" says "priorities are obvious" the way people say it; A's "എന്നിങ്ങനെ". C's "വരാനിരിക്കുന്നത്" is longer than "വരാനുള്ളത്". |
| 04.4 | Scroll down to compare every executive side by side, follow call activity, and see which lead sources actually bring in revenue. | താഴേക്ക് സ്ക്രോൾ ചെയ്താൽ ഓരോ എക്സിക്യൂട്ടീവിനെയും അടുത്തടുത്ത് വെച്ച് താരതമ്യം ചെയ്യാം, കോൾ ആക്ടിവിറ്റി ട്രാക്ക് ചെയ്യാം, ഒപ്പം ഏതൊക്കെ ലീഡ് സോഴ്സുകളാണ് ശരിക്കും വരുമാനം കൊണ്ടുവരുന്നതെന്നും കാണാം. | A + B + own | A's "അടുത്തടുത്ത് വെച്ച്" (side by side); B's "ട്രാക്ക് ചെയ്യാം" for "follow" (A/C's "നിരീക്ഷിക്കാം" sounds like surveillance). Own: "ഒപ്പം" before the lead-source clause so the page has a little more time to scroll from call activity to the sources (the builder flagged that highlight as too short with the English timings). Order kept: executives, call activity, sources = scroll direction. |
| 05.1 | All your enquiries live in Leads. | നിങ്ങളുടെ എല്ലാ എൻക്വയറികളും ഉള്ളത് ലീഡ്സിലാണ്. | A | Puts "Leads" at the end for emphasis; B adds "പേജ്"; C fine but heavier. |
| 05.2 | Tabs keep new, in follow-up, won and lost leads apart, and Status View shows every stage of your sales process. | ടാബുകളിൽ പുതിയ ലീഡുകൾ, ഫോളോ-അപ്പിലുള്ളവ, വോൺ, ലോസ്റ്റ് എന്നിവ വെവ്വേറെ കാണാം, സ്റ്റാറ്റസ് വ്യൂ നിങ്ങളുടെ സെയിൽസ് പ്രോസസിലെ ഓരോ സ്റ്റേജും കാണിച്ചുതരും. | A | Tabs → won/lost → Status View in the order the camera and cursor follow. B's "ന്യൂ, ഇൻ ഫോളോ-അപ്പ്, വൺ, ലോസ്റ്റ്" is pure transliteration; C's "നേടിയതും നഷ്ടപ്പെട്ടതുമായ" renames the tabs. Semicolon → comma. |
| 05.3 | Powerful filters find any lead by source, quality, assignee, date, or even Facebook campaign. | ശക്തമായ ഫിൽട്ടറുകൾ ഉപയോഗിച്ച് സോഴ്സ്, ക്വാളിറ്റി, അസൈനി, തീയതി, എന്തിന്, ഫേസ്ബുക്ക് ക്യാമ്പെയ്ൻ വെച്ചുപോലും ഏത് ലീഡും കണ്ടെത്താം. | A (+ B/C spelling) | One verb-final sentence with the five filter fields in order; B needs a second verb ("തിരയാം"), C ends on a fragment. Spelling "ക്യാമ്പെയ്ൻ" (B/C) used everywhere. |
| 05.4 | And when priorities change, Lead Transfer moves leads between executives in bulk. | ഇനി, മുൻഗണനകൾ മാറുമ്പോൾ, ലീഡ് ട്രാൻസ്ഫർ വഴി ലീഡുകൾ ഒരു എക്സിക്യൂട്ടീവിൽ നിന്ന് മറ്റൊരാളിലേക്ക് കൂട്ടത്തോടെ മാറ്റാം. | A | "ഇനി," carries "And"; "കൂട്ടത്തോടെ" is the idiom for "in bulk" (B "കൂട്ടമായി" also fine); C's "ലീഡുകളെ … മാറ്റുന്നു" is literal. |
| 06.1 | A lead is only as valuable as its next action. | ഒരു ലീഡിന്റെ വില, അതിൽ അടുത്തതായി എന്തു ചെയ്യുന്നു എന്നതിലാണ്. | A | Says the idea the Malayalam way; B's "നടപടി" sounds like an official action; C's "നടപടിയോളം മാത്രമേ മൂല്യമുള്ളൂ" is a calque nobody says. |
| 06.2 | Follow-ups are sorted into today's, delayed, upcoming and non follow-up, so nothing slips through the cracks. | ഫോളോ-അപ്പുകൾ ഇന്നത്തേത്, വൈകിയത്, വരാനുള്ളത്, നോൺ ഫോളോ-അപ്പ് എന്നിങ്ങനെ തിരിച്ചിട്ടുണ്ട്, അതുകൊണ്ട് ഒന്നും വിട്ടുപോകില്ല. | B | Shortest; "തിരിച്ചിട്ടുണ്ട്" consistent with 04.3. Tabs in click order today → delayed → upcoming → non follow-up. C's "വിട്ടുപോകുന്നില്ല" is weaker. |
| 06.3 | Prefer a board? Kanban View shows every follow-up by status, with the next date, last contact and executive on each card. | ബോർഡായി കാണാനാണോ ഇഷ്ടം? കാൻബാൻ വ്യൂ ഓരോ ഫോളോ-അപ്പും സ്റ്റാറ്റസ് തിരിച്ച് കാണിക്കും, അടുത്ത തീയതി, അവസാനം ബന്ധപ്പെട്ടത്, എക്സിക്യൂട്ടീവ് എന്നിവ ഓരോ കാർഡിലുമുണ്ട്. | B | Compact card clause; A's "…എന്നാണെന്നും, … ആരാണെന്നും കാണാം" is long; C's "ഒരു ബോർഡാണോ നിങ്ങൾക്ക് താൽപ്പര്യം?" is stiff. "കാൻബാൻ" (B/C) over A's "കാൻബൻ". Kanban View is named before the card, as the click precedes the zoom. |
| 07.1 | Your customers are already on WhatsApp, and so is ProgBiz. | നിങ്ങളുടെ കസ്റ്റമേഴ്സ് ഇപ്പോൾത്തന്നെ വാട്സ്ആപ്പിലുണ്ട്, ProgBiz-ഉം അവിടെയുണ്ട്. | A/B | Same in A and B; C's "ഉപഭോക്താക്കൾ" is a newspaper word, business people say കസ്റ്റമേഴ്സ്. |
| 07.2 | The shared inbox brings every WhatsApp chat into the CRM, so your whole team works from one place, with search and unread filters, and no conversation is lost. | ഷെയേർഡ് ഇൻബോക്സ് എല്ലാ വാട്സ്ആപ്പ് ചാറ്റുകളും CRM-ലേക്ക് കൊണ്ടുവരുന്നു, അങ്ങനെ നിങ്ങളുടെ ടീമിന് മുഴുവൻ ഒരിടത്തുനിന്ന് ജോലി ചെയ്യാം, സെർച്ചും അൺറീഡ് ഫിൽട്ടറുകളും കൂടെയുണ്ട്, ഒരു സംഭാഷണവും നഷ്ടപ്പെടില്ല. | B + A | B's flow ("ടീമിന് മുഴുവൻ … ജോലി ചെയ്യാം", "നഷ്ടപ്പെടില്ല"); A's "CRM-ലേക്ക്" and "ഫിൽട്ടറുകളും കൂടെയുണ്ട്". C's "-ുന്നതിനാൽ … സഹിതം" is formal. Inbox first, filters after, as the camera moves. |
| 07.3 | A chatbot greets every new enquiry with your own welcome message and helps customers find the right service, day and night. | ചാറ്റ്ബോട്ട് ഓരോ പുതിയ എൻക്വയറിയെയും നിങ്ങളുടെ സ്വന്തം വെൽക്കം മെസേജുമായി സ്വീകരിക്കും, ശരിയായ സർവീസ് കണ്ടെത്താൻ കസ്റ്റമേഴ്സിനെ സഹായിക്കുകയും ചെയ്യും — രാവും പകലും. | B + A | B's "വെൽക്കം മെസേജുമായി സ്വീകരിക്കും"; A's "സർവീസ്" and the final "— രാവും പകലും" so that "day and night" covers both actions, as in English (B tied it to helping only). |
| 07.4 | Add your documents and product details to the Knowledge Base, and the chatbot AI answers customer questions for you. | നിങ്ങളുടെ ഡോക്യുമെന്റുകളും പ്രൊഡക്ട് വിവരങ്ങളും നോളജ് ബേസിൽ ചേർത്താൽ, കസ്റ്റമേഴ്സിന്റെ ചോദ്യങ്ങൾക്ക് ചാറ്റ്ബോട്ട് AI നിങ്ങൾക്കുവേണ്ടി മറുപടി നൽകും. | B (+ A) | B's conditional "ചേർത്താൽ … മറുപടി നൽകും" is one smooth sentence; A's spelling "പ്രൊഡക്ട്" and Latin "AI". C's "ഉൽപ്പന്ന വിവരങ്ങളും … ഉപഭോക്താക്കളുടെ" formal. |
| 08.1 | Need to reach many customers at once? Send a broadcast. | ഒരുപാട് കസ്റ്റമേഴ്സിലേക്ക് ഒരേസമയം എത്തണോ? ഒരു ബ്രോഡ്കാസ്റ്റ് അയയ്ക്കൂ. | A | "ഒരേസമയം" = at once (B "ഒരുമിച്ച്" = together); C's "നിരവധി ഉപഭോക്താക്കളിലേക്ക്" formal. |
| 08.2 | Pick an approved WhatsApp template, choose your customers, and send it immediately, or schedule it for later. | അപ്രൂവ് ചെയ്ത ഒരു വാട്സ്ആപ്പ് ടെംപ്ലേറ്റ് എടുക്കൂ, നിങ്ങളുടെ കസ്റ്റമേഴ്സിനെ തിരഞ്ഞെടുക്കൂ, ഉടൻ തന്നെ അയയ്ക്കൂ, അല്ലെങ്കിൽ പിന്നീടത്തേക്ക് ഷെഡ്യൂൾ ചെയ്യൂ. | B + A | Template → customers → send now → schedule in the order the picture cuts. B's "നിങ്ങളുടെ കസ്റ്റമേഴ്സിനെ" ("your customers"); A's "ഉടൻ തന്നെ". "അപ്രൂവ് ചെയ്ത" is what WhatsApp Business users say; C's "അംഗീകൃതമായ" is officialese. |
| 08.3 | Then track every campaign — sent, delivered, read, clicked and replied — along with the enquiries and wins it brought in. | പിന്നെ ഓരോ ക്യാമ്പെയ്നും ട്രാക്ക് ചെയ്യാം — അയച്ചത്, ഡെലിവർ ആയത്, വായിച്ചത്, ക്ലിക്ക് ചെയ്തത്, മറുപടി കിട്ടിയത് — ഒപ്പം അതിലൂടെ വന്ന എൻക്വയറികളും നേടിയ ഡീലുകളും കാണാം. | A + B/C | A's structure and "മറുപടി കിട്ടിയത്"; B/C's "നേടിയ ഡീലുകളും" for "wins" (A's "വോൺ ലീഡുകളും" is jargon); "കാണാം" closes the sentence. Delivery columns first, result columns after. |
| 09.1 | AI Call Analysis reviews your team's recorded calls. | AI കോൾ അനാലിസിസ് നിങ്ങളുടെ ടീമിന്റെ റെക്കോർഡ് ചെയ്ത കോളുകൾ വിലയിരുത്തുന്നു. | A | "വിലയിരുത്തുന്നു" = reviews/assesses (fits scoring); B/C's "പരിശോധിക്കുന്നു" = inspects. |
| 09.2 | Every call gets a lead score, an agent score and the customer's sentiment, and managers can listen to any recording right from the list. | ഓരോ കോളിനും ഒരു ലീഡ് സ്കോറും ഏജന്റ് സ്കോറും കസ്റ്റമറുടെ സെന്റിമെന്റും കിട്ടും, മാനേജർമാർക്ക് ലിസ്റ്റിൽ നിന്നുതന്നെ ഏത് റെക്കോർഡിംഗും കേൾക്കാം. | A | "സെന്റിമെന്റ്" matches the Sentiment column on screen (B/C "മനോഭാവം" = attitude). Scores first, recording after. Anchor "മാനേജർമാർക്ക്". |
| 09.3 | Open a call to read an AI summary and a coaching note, so you know which calls went well, and how to close the next one. | ഏതെങ്കിലും ഒരു കോൾ തുറന്നാൽ AI സമ്മറി വായിക്കാം, കൂടെ ഒരു കോച്ചിംഗ് നോട്ടും ഉണ്ട്, അങ്ങനെ ഏതൊക്കെ കോളുകൾ നന്നായി പോയെന്നും അടുത്തത് എങ്ങനെ ക്ലോസ് ചെയ്യാമെന്നും മനസ്സിലാക്കാം. | B + A | B's lead-in and "…സമ്മറി വായിക്കാം, കൂടെ ഒരു കോച്ചിംഗ് നോട്ടും ഉണ്ട്" put spoken text between the two anchors, which the camera needs (it zooms from the header to the summary and then down to the coaching note; with A's "AI സമ്മറിയും കോച്ചിംഗ് നോട്ടും" the two were 8 characters apart). A's ending. "നോട്ട്" as on screen (C: കുറിപ്പ്). |
| 10.1 | Lead Expenses keeps track of what you spend on every lead source and ad. | ലീഡ് എക്സ്പെൻസസ്, ഓരോ ലീഡ് സോഴ്സിനും പരസ്യത്തിനും നിങ്ങൾ ചെലവാക്കുന്ന തുകയുടെ കണക്ക് സൂക്ഷിക്കുന്നു. | B | "ചെലവാക്കുന്ന തുകയുടെ കണക്ക്" is clearer than A/C's "ചെലവാക്കുന്നതിന്റെ കണക്ക്". |
| 10.2 | Together with your results, it shows the real cost per lead and the return on your marketing. | നിങ്ങൾക്ക് കിട്ടിയ ഫലങ്ങളുമായി ചേർത്തുവെച്ച്, ഒരു ലീഡിന് വരുന്ന യഥാർത്ഥ ചെലവും മാർക്കറ്റിംഗിൽ നിന്നുള്ള റിട്ടേണും ഇത് കാണിച്ചുതരും. | A | A/B identical apart from the verb form; C drops "കിട്ടിയ". |
| 11.1 | Executive Performance brings it all together. | എക്സിക്യൂട്ടീവ് പെർഫോമൻസ് ഇതെല്ലാം ഒരുമിച്ച് കൊണ്ടുവരുന്നു. | A = B = C | Identical apart from ഒരുമിച്ചു/ഒരുമിച്ച്; "ഒരുമിച്ച്" used throughout. |
| 11.2 | Each executive gets one score, built from target achievement, win rate, won value and activity, so your best performers rise to the top and everyone can see where to improve. | ടാർഗറ്റ് അച്ചീവ്മെന്റ്, വിൻ റേറ്റ്, വോൺ വാല്യൂ, ആക്ടിവിറ്റി എന്നിവ ചേർത്തുള്ള ഒരൊറ്റ സ്കോർ ഓരോ എക്സിക്യൂട്ടീവിനും കിട്ടും, അങ്ങനെ നിങ്ങളുടെ ടീമിലെ ഏറ്റവും മികച്ചവർ മുന്നിലെത്തും, എല്ലാവർക്കും എവിടെ മെച്ചപ്പെടണമെന്ന് കാണാം. | A + B + own | A puts the formula first (the camera starts on "Score = Target Achievement + Win Rate + Won Value + Activity", so the terms are said as on screen; B/C's "ടാർഗറ്റ് നേട്ടം / നേടിയ മൂല്യം / പ്രവർത്തനം" do not match the formula). Own grammar fix: "എന്നിവ ചേർത്തുള്ള ഒരൊറ്റ സ്കോർ … കിട്ടും" (A's "ചേർത്ത് … കിട്ടും" had no subject). B's "നിങ്ങളുടെ ടീമിലെ … മികച്ചവർ". A's "മുന്നിലെത്തും". |
| 12.1 | For business owners, that means fewer missed leads, faster replies on WhatsApp, a sales team that is easy to coach, and marketing money spent where it works. | ബിസിനസ് ഉടമകൾക്ക് ഇതിനർത്ഥം ഇതാണ്: വിട്ടുപോകുന്ന ലീഡുകൾ കുറയും, വാട്സ്ആപ്പിൽ മറുപടി കൂടുതൽ വേഗത്തിലാകും, സെയിൽസ് ടീമിനെ എളുപ്പത്തിൽ കോച്ച് ചെയ്യാം, മാർക്കറ്റിംഗ് പണം ഫലം കിട്ടുന്നിടത്ത് ചെലവാക്കാം. | A + own | A's four short benefit clauses in the cut order (leads, WhatsApp, coaching, marketing). Own: "കൂടുതൽ" (= the comparative "faster"), which also gives the WhatsApp cut more time (the builder flagged its callout as 1.19 s with the English timings; now fine). C's "-ുന്നു … എന്നാണ്" chain is heavy. |
| 12.2 | ProgBiz ERP — bringing your business workflow together. | ProgBiz ERP — നിങ്ങളുടെ ബിസിനസ് വർക്ക്ഫ്ലോ ഒരുമിച്ച് കൊണ്ടുവരുന്നു. | A/C | Keeps "workflow"; B's "ബിസിനസ് പ്രവർത്തനങ്ങൾ" loses it. Brand tagline, to be approved (see below). |

## On-screen text

| English | Chosen Malayalam | From | Why |
|---|---|---|---|
| Facebook • Website • WhatsApp | ഫേസ്ബുക്ക് • വെബ്സൈറ്റ് • വാട്സ്ആപ്പ് | A = B = C | Identical. |
| For sales executives / For managers / For business owners | സെയിൽസ് എക്സിക്യൂട്ടീവുകൾക്ക് / മാനേജർമാർക്ക് / ബിസിനസ് ഉടമകൾക്ക് | A = B = C | Identical; equal the narration anchors of 01.4. |
| One place to start your day | ദിവസം തുടങ്ങാൻ ഒരിടം | A/C | Shorter than B's "ഒരൊറ്റ ഇടം". |
| Ask your data anything | ഡാറ്റയോട് എന്തും ചോദിക്കാം | A/B | 3 words; C adds "നിങ്ങളുടെ". |
| Answers in seconds | സെക്കൻഡുകൾക്കുള്ളിൽ ഉത്തരം | B/C | Exact "seconds", matches 03.2. |
| Your pipeline at a glance | പൈപ്പ്ലൈൻ ഒറ്റനോട്ടത്തിൽ | A/B | Fits the pill; C adds "നിങ്ങളുടെ". |
| Today • Delayed • Upcoming | ഇന്ന് • വൈകിയത് • വരാനുള്ളത് | A/B | "വരാനുള്ളത്" as in the narration (C: വരാനിരിക്കുന്നത്). |
| Know which sources pay off | ഫലം തരുന്ന സോഴ്സുകൾ അറിയാം | A/B | Natural; C's "അറിയൂ" imperative is fine too. |
| Find any lead, fast | ഏത് ലീഡും വേഗം കണ്ടെത്താം | A/B | Short. |
| Move leads in bulk | ലീഡുകൾ കൂട്ടത്തോടെ മാറ്റാം | A | Same word as 05.4. |
| Never miss a follow-up | ഒരു ഫോളോ-അപ്പും വിട്ടുപോകില്ല | A/B | Idiomatic; C's "വിട്ടുപോകാതെ" is a fragment. |
| Every stage on one board | എല്ലാ സ്റ്റേജും ഒരൊറ്റ ബോർഡിൽ | A/B | "സ്റ്റേജ്" as in the narration. |
| One shared WhatsApp inbox | ടീമിന് ഒരൊറ്റ വാട്സ്ആപ്പ് ഇൻബോക്സ് | A | Says what "shared" means; B/C's "ഒരൊറ്റ ഷെയേർഡ് വാട്സ്ആപ്പ് ഇൻബോക്സ്" is three transliterations in a row. |
| A chatbot that replies 24/7 | 24/7 മറുപടി നൽകുന്ന ചാറ്റ്ബോട്ട് | B/C | "നൽകുന്ന" as in 07.4. |
| AI answers from your content | നിങ്ങളുടെ കണ്ടന്റിൽ നിന്ന് AI ഉത്തരം | A | C's "ഉള്ളടക്കം" is formal. |
| Approved WhatsApp templates | അപ്രൂവ് ചെയ്ത വാട്സ്ആപ്പ് ടെംപ്ലേറ്റുകൾ | own (from A/B) | A/B had "അപ്രൂവ്ഡ്" (awkward വ്ഡ് cluster); "അപ്രൂവ് ചെയ്ത" matches 08.2. 17 graphemes. |
| Send now or schedule | ഉടൻ അയയ്ക്കാം, ഷെഡ്യൂളും ചെയ്യാം | A | C's "ഇപ്പോഴോ ഷെഡ്യൂൾ ചെയ്തോ അയയ്ക്കൂ" is harder to parse in a pill. |
| Track every campaign | ഓരോ ക്യാമ്പെയ്നും ട്രാക്ക് ചെയ്യാം | B | Spelling ക്യാമ്പെയ്ൻ. |
| AI scores every call | ഓരോ കോളിനും AI സ്കോർ | A | 4 words; C's full sentence is longer. |
| Coaching for every executive | ഓരോ എക്സിക്യൂട്ടീവിനും കോച്ചിംഗ് | A = B = C | Identical. |
| Every ad spend, by source | ഓരോ പരസ്യച്ചെലവും, സോഴ്സ് തിരിച്ച് | A = B = C | Identical. |
| Cost per lead and return | ഒരു ലീഡിനുള്ള ചെലവും റിട്ടേണും | A/C | "per lead" = ലീഡിനുള്ള. |
| One score per executive | ഓരോ എക്സിക്യൂട്ടീവിനും ഒരൊറ്റ സ്കോർ | C | "ഓരോ … -ഉം" renders "per"; A dropped it. |
| Fewer missed leads | വിട്ടുപോകുന്ന ലീഡുകൾ കുറയും | A/B | Same words as 12.1. |
| Faster WhatsApp replies | വാട്സ്ആപ്പിൽ വേഗത്തിൽ മറുപടി | A/B | Short. |
| A team you can coach | കോച്ച് ചെയ്യാവുന്ന ടീം | A | 3 words. |
| Marketing that pays back | ഫലം തരുന്ന മാർക്കറ്റിംഗ് | A/B | C's "മുടക്കിയതിന് ഫലം തരുന്ന" is longer. |
| One platform for your whole sales team | നിങ്ങളുടെ മുഴുവൻ സെയിൽസ് ടീമിനും ഒരൊറ്റ പ്ലാറ്റ്ഫോം | A = B = C | Identical. |
| Leads, follow-ups, WhatsApp and team performance, in one place | ലീഡുകൾ, ഫോളോ-അപ്പുകൾ, വാട്സ്ആപ്പ്, ടീം പെർഫോമൻസ് — എല്ലാം ഒരിടത്ത് | A | Terms as in 01.3. |
| How it works | ഇത് പ്രവർത്തിക്കുന്നത് ഇങ്ങനെ | A | Reads as a heading ("this is how it works"); B/C's "ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നു" reads as a question. |
| A day with ProgBiz ERP | ProgBiz ERP-യോടൊപ്പം ഒരു ദിവസം | B/C | Standard sociative "-യോടൊപ്പം"; A's "-യ്ക്കൊപ്പം" is a Kerala-colloquial variant. |
| From the first enquiry to the final result | ആദ്യ എൻക്വയറി മുതൽ അന്തിമ ഫലം വരെ | A/C | Written card text, the formal "അന്തിമ" is acceptable here. |
| Bringing your business workflow together | നിങ്ങളുടെ ബിസിനസ് വർക്ക്ഫ്ലോ ഒരുമിച്ച് കൊണ്ടുവരുന്നു | A/C | Equals 12.2 without the brand. |
| Capture every lead. Reply faster on WhatsApp. Know how your team performs. | ഓരോ ലീഡും ക്യാപ്ചർ ചെയ്യൂ. വാട്സ്ആപ്പിൽ വേഗത്തിൽ മറുപടി നൽകൂ. നിങ്ങളുടെ ടീമിന്റെ പെർഫോമൻസ് അറിയൂ. | A | "ക്യാപ്ചർ" is the CRM word (C's "രേഖപ്പെടുത്തൂ" = record); "പെർഫോമൻസ്" for consistency. |

## Terminology fixed across the whole script

One spelling per term; all three drafts were normalised to these.

| Term | Used everywhere | Rejected variants |
|---|---|---|
| lead(s) | ലീഡ് / ലീഡുകൾ / ലീഡ്സ് (the menu name) | — |
| follow-up(s) | ഫോളോ-അപ്പ് / ഫോളോ-അപ്പുകൾ (ASCII hyphen) | — |
| WhatsApp | വാട്സ്ആപ്പ് | — |
| Facebook | ഫേസ്ബുക്ക് | — |
| enquiry | എൻക്വയറി / എൻക്വയറികൾ | — |
| customer(s) | കസ്റ്റമർ / കസ്റ്റമേഴ്സ് | ഉപഭോക്താവ് (C) |
| team performance | ടീം പെർഫോമൻസ് / ടീമിന്റെ പെർഫോമൻസ് | ടീമിന്റെ പ്രകടനം (B, C) |
| AI, CRM, ProgBiz ERP | Latin letters, as on the menu | എഐ, സിആർഎം (B) |
| Dashboard, pipeline, stage | ഡാഷ്ബോർഡ്, പൈപ്പ്ലൈൻ, സ്റ്റേജ് | ഘട്ടം (C) |
| rates | വിൻ റേറ്റ്, കൺവേർഷൻ റേറ്റ്, ലോസ്റ്റ് റേറ്റ്, പൈപ്പ്ലൈൻ വാല്യൂ | പൈപ്പ്ലൈൻ മൂല്യം (C) |
| stage / tab names | ന്യൂ, കോൾഡ്, വാം, ഹോട്ട്, വോൺ, ലോസ്റ്റ്; tabs: പുതിയ ലീഡുകൾ, ഫോളോ-അപ്പിലുള്ളവ, വോൺ, ലോസ്റ്റ് | വൺ (B), നേടിയത് / നഷ്ടപ്പെട്ടത് (C) |
| follow-up buckets | ഇന്നത്തേത്, വൈകിയത്, വരാനുള്ളത്, നോൺ ഫോളോ-അപ്പ് | വരാനിരിക്കുന്നത് (C) |
| views / features | സ്റ്റാറ്റസ് വ്യൂ, കാൻബാൻ വ്യൂ, ലീഡ് ട്രാൻസ്ഫർ, ചാറ്റ്ബോട്ട്, നോളജ് ബേസ്, ബ്രോഡ്കാസ്റ്റ്, ടെംപ്ലേറ്റ്, AI കോൾ അനാലിസിസ്, ലീഡ് എക്സ്പെൻസസ്, എക്സിക്യൂട്ടീവ് പെർഫോമൻസ്, ഷെയേർഡ് ഇൻബോക്സ് | കാൻബൻ (A) |
| campaign | ക്യാമ്പെയ്ൻ | ക്യാമ്പയിൻ (A) |
| performance formula | ടാർഗറ്റ് അച്ചീവ്മെന്റ്, വിൻ റേറ്റ്, വോൺ വാല്യൂ, ആക്ടിവിറ്റി (as on screen) | ടാർഗറ്റ് നേട്ടം, നേടിയ മൂല്യം, പ്രവർത്തനം (B, C) |
| sentiment | സെന്റിമെന്റ് (column name) | മനോഭാവം (B, C) |
| approved | അപ്രൂവ് ചെയ്ത | അപ്രൂവ്ഡ് (A, B callout), അംഗീകൃത (C) |
| seconds | സെക്കൻഡുകൾ | നിമിഷങ്ങൾ (A) |
| track / monitor | ട്രാക്ക് ചെയ്യാം | നിരീക്ഷിക്കാം (A, C) |
| product / project | പ്രൊഡക്ട് / പ്രോജക്ട് | പ്രോഡക്ട് (B), ഉൽപ്പന്നം (C) |
| in bulk | കൂട്ടത്തോടെ | കൂട്ടമായി (B, C) |
| spelling | വെച്ച് (not വച്ച്), ഒരുമിച്ച് (not ഒരുമിച്ചു), യഥാർത്ഥ | — |
| punctuation | commas and em dashes as breath marks; one colon (12.1); no semicolons (A used many) | — |
| characters | NFC, atomic chillu ൻ ർ ൽ ൾ ൺ, no ZWJ/ZWNJ anywhere | — |

## Wordings a native speaker at Progbiz should confirm

1. **വോൺ** for "Won" (stage and tab name, and in "വോൺ വാല്യൂ"). Draft B wrote വൺ, which reads as "one". Tell the voice artist to say it as the English word *won*.
2. **ഷെയേർഡ് ഇൻബോക്സ്** (07.2). All three drafts transliterated it; if it sounds odd spoken, "ടീമിന്റെ പൊതു ഇൻബോക്സ്" says the same thing (the callout already says "ടീമിന് ഒരൊറ്റ വാട്സ്ആപ്പ് ഇൻബോക്സ്").
3. **അസൈനി** for "assignee" (05.3, an anchor). Alternative "അസൈൻ ചെയ്ത ആൾ"; if changed, change the anchor too.
4. **സെന്റിമെന്റ്** vs **മനോഭാവം** (09.2) — kept the column name.
5. **ടീം പെർഫോമൻസ്** vs **ടീമിന്റെ പ്രകടനം** (01.3, card, CTA) — two of three translators preferred പ്രകടനം; I kept പെർഫോമൻസ് for consistency with "എക്സിക്യൂട്ടീവ് പെർഫോമൻസ്".
6. **AI / CRM in Latin letters** (vs എഐ / സിആർഎം). Fine for a human reader; only matters if a Malayalam TTS is ever used.
7. **‘ഇന്ന് എത്ര ലീഡുകൾ വന്നു’** (03.2): the example question adds "വന്നു"; the query typed on screen is the English "how many leads today".
8. **"ബിസിനസ് ഉടമകൾക്ക് ഇതിനർത്ഥം ഇതാണ്:"** (12.1) — the colon is read as a short pause before the four benefits; the artist must keep the four clauses in this order (each one is a picture cut).
9. **Tagline** "നിങ്ങളുടെ ബിസിനസ് വർക്ക്ഫ്ലോ ഒരുമിച്ച് കൊണ്ടുവരുന്നു" (12.2 and the end card) — brand line, Progbiz marketing should sign it off ("ഒന്നിപ്പിക്കുന്നു" is the shorter alternative).
10. **"ഓരോ ലീഡും ക്യാപ്ചർ ചെയ്യൂ"** (end-card CTA) — "capture" kept as CRM jargon.
11. **പൈപ്പ്ലൈൻ / ഡാഷ്ബോർഡ്** are written without ZWNJ (the contract forbids zero-width characters). Rendered with the compositor's font stack they show the പ്പ്ല conjunct and a visible chandrakkala in ഷ്ബ; both legible (checked, see below). Newspapers often write പൈപ്പ്‌ലൈൻ with a ZWNJ.
12. **ക്യാമ്പെയ്ൻ** vs ക്യാമ്പയിൻ — both common; one was chosen.
13. **അന്തിമ ഫലം** on the "How it works" card is slightly formal; "അവസാന റിസൾട്ട്" is the colloquial option.

Recording notes: one recording per section; each entry of `vo_script_v3.ml.json` is one sentence, spoken in one or two breaths with a clear pause between sentences (the ingest tool finds the sentence boundaries from the pauses). Within a sentence the artist may pause at commas but must not reorder clauses: the sentences with anchors (01.4, 02.2, 03.3, 04.2, 04.4, 05.2, 05.3, 06.2, 06.3, 07.2, 08.2, 08.3, 09.2, 09.3, 11.2, 12.1) drive the camera.

## Validation performed

1. `validate_pack.py` (python3, scratchpad) on `lang/ml.json`: valid JSON; `lang`/`name`; 12 sections in the English order with 5/2/4/4/4/3/4/3/3/2/2/2 sentences; every one of the 42 required anchors present, verbatim (`str.find`), starting at a word boundary, occurring exactly once, and in ascending order where the order matters; no anchors the edit does not use; all 36 `screen_text` keys of `lang/en.json` present; callouts at most 30 graphemes (max 19, counted with `Intl.Segmenter` as the builder does) and 6 words (max 5); NFC; no ZWJ/ZWNJ/ZWSP/BOM/NBSP or control characters. Result: **0 fail, 0 warn**. The same script on the three drafts: also 0/0 each.
2. `vo_script_v3.ml.json` cross-checked against `ml.json` and `vo_script_v3.json`: sentences identical to the pack, `title`/`slot`/`video`/`_source`/`end_card_cta` unchanged.
3. The real builder, `09_build_timeline_lang.js --lang ml --pack lang/ml.json --cues reports/video/beta/audio_v3/Samantha/cues.json`, run from a sandboxed copy of the tree in the scratchpad (captures symlinked, so its composite shots and timeline went to the scratchpad, nothing under `reports/` was touched): built without error, 42 anchors resolved, all `inOrder` checks (including the 0.7 s gaps of 01.4 and 08.2 and the 0.8 s gaps of 12.1) passed. 3 warnings remain — the d_scroll and c_detail highlights that "flash" — and the English pack run the same way gives the same 3 plus one more, so they come from the edit under the English durations, not from the Malayalam wording. The times are only indicative: the real ones come from the recording via `ingest_recording.py --script scripts/video/beta/vo_script_v3.ml.json`.
4. Rendering: all 36 screen texts plus the narration terms with risky conjuncts were rendered at 600 / 32 px with the compositor's font stack (system Malayalam fallback) and with "Malayalam Sangam MN" in the repo's local headless Chromium (Playwright already installed; offline, file:// page), and the screenshots were inspected: no dotted circles, no split clusters, chillu letters atomic, Latin "ProgBiz ERP / AI / CRM" sits correctly inside Malayalam lines.
