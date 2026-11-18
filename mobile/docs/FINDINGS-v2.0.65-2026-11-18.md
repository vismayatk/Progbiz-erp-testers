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

## Script problems found (not app bugs) — still to fix
- S1: Add Lead ends with Customer Name typed and Phone Number empty (country defaults to UAE +971); no enquiry is created, so S2 and S4 fail. Cause not yet found.
- After a failed scenario the run can be left on the wrong screen or with the drawer open (F2, F3, F4, U3, R5, smoke "To Do"); recovery needs to be stricter.
- F2: Notes tab is off-screen in the Enquiry Overview tab bar; scroll the tab bar.
- F6: voucher count check reads 0 → 0 although the voucher saved (R-2); fix the count.
