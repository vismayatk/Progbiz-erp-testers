# Findings — app v2.0.65 (build 2146), 18 Nov 2026

Android 13 emulator. Flow run on `onetouch_test` (all five suites, 109 min); release-note changes check on `betademo`.
Screenshots and HTML reports are kept locally (they hold tenant data and are git-ignored).

## Real bugs
| ID | Bug | Where |
|---|---|---|
| BUG-01 | Back with the side drawer open leaves it open and shows "Press Back Button Again to Exit" | onetouch_test (R1) |
| BUG-02 | Past dates (Yesterday chip, 17 Nov) can be picked as next follow-up | onetouch_test (R3) |
| BUG-03 | WhatsApp Chat with no account: only a "Please add whatsapp account" toast, no guidance | onetouch_test (R7) |
| BUG-08 | After switching tenant without clearing app data, WhatsApp Chat lists the previous tenant's chats and shows "This WhatsApp account is not available to you" | betademo |
| BUG-09 | A WhatsApp call shows as an empty bubble in the chat window (visible only in Contact info > Calls) | betademo |
| BUG-10 | A new invoice cannot be saved as draft without a payment ("Tender must equal the payable amount") | betademo |
| BUG-11 | Edit Invoice: Cancel on an untouched form asks to discard; re-touching the phone field clears the picked customer name | betademo (minor) |

## Probable, not yet seen on screen (from tool notes)
- BUG-04 Deposited Cheques does not open (U2).
- BUG-05 Home "Completed" card says 35, list shows 30.
- BUG-06 Several screens 5–6 s to load or still loading after 20 s (Delayed, Calendar, Profile, My Tasks, Delegated Tasks, Workspace, Dashboard details, Daily Activity, Complaints).
- BUG-07 Tapping an item does nothing in Calendar, Timeline and Projects > Notes.

Info: recording length 00:16 for a 00:19 call (confirm intended); the app offers an update to 2.0.66.

## Not tested (need a fix or setup)
- Van Sales van-user checks: no van on betademo; the web login used has no Inventory/van setup.
- WhatsApp answer, hang up, mute, speaker, recording, locked screen, iOS: need two real phones.
- F5 (purchase invoice): onetouch_test has no suppliers.

## Extra app findings (found while fixing the scripts)
- Follow-Up History does not show the Lead Quality (Warm) chosen in a follow-up (S2, needs a look on screen).
- Deleting a lead note asks for no confirmation (F2).

## Script fixes (this commit) and how far each was checked
| Fix | Status |
|---|---|
| S1 assignee check ignores letter case ("Super admin" vs "Super Admin") | S1 passes on onetouch_test (ENQ created) |
| F2 scrolls the Enquiry tab bar to find Notes | F2 passes (note added, edited, deleted) |
| F6 voucher count only checked when the list shows a count; the new voucher row is checked | F6 passes (receipt saved, row found) |
| Quotation PDF currency per tenant (AED / Dirham on onetouch_test, INR / Rupee elsewhere) | words helper checked against the real PDF text; S4 not re-run to the end |
| `go_home` cancels a form left open by a failed step; CRM suite returns Home after every scenario; 15 s pause between scenarios | not re-checked on a full run |
| `open_drawer` waits for Home and retries the menu button 3 times | not re-checked on a full run |
| "Slow down / Too many requests" popup (the site's limit on several logins at once, not a bug): wait 30 s then continue; re-run when the tenant is quiet | not seen to trigger again |
| Option pickers skip Cancel/Save/Select/OK buttons (F3 follow-up status, S5 complaint type); F3 opens a lead from any Leads tab | F3 and S5 not re-run after this fix |
| F4 reports "not testable" when the tenant has no WhatsApp account | seen on onetouch_test |

## Still open
- S6 needs a team called `QA_Team` on the tenant (not on onetouch_test).
- F4 needs a tenant with a WhatsApp account (lesol_test).
- S4 failed once on onetouch_test with the discount missing in the form totals (2000.00 / 0.00 / 2000.00); it had passed earlier (QUO-14). Check by hand.
- S5 and F3 need one clean re-run; the emulator stopped answering during the last attempt.
- Slow phone lookup in S1 (a full S1 took up to 24 min on a struggling emulator).
