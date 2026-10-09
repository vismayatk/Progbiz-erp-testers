# HRMS Automation — Issues Log

**App:** https://hrms-test.progbiz.in (as `amit`). **Phase:** positive-workflow automation, 2026-10-03 → 2026-10-08.

## Summary

**There are no open application defects from this phase.** The four "success toast but nothing saved" defects reported
earlier (APP-01/02/03/06) were all **bugs in the automation**, not in the app. Each one has been root-caused and fixed,
and its spec now passes against the live tenant. The section below on retracted items records how each was misread.

Two Helpdesk behaviours (APP-04/05) are recorded for product confirmation. They may be by design.

## App behaviours to confirm (not defects)

| ID | Test | Module | Behaviour | How to see it | Severity |
|---|---|---|---|---|---|
| APP-04 | H8 | Helpdesk | When a ticket is **assigned**, the admin's Manage view drops Update-Status/Resolve and keeps only Reassign; progressing moves to the assignee. | Helpdesk Admin → Manage an open ticket → Assign → reopen Manage. | Low; confirm if intended. Observed 2026-10-05, not re-checked since the wait fix. |
| APP-05 | H7 | Helpdesk | **Resolve is terminal.** There is no separate Close step in the admin Manage view. | Resolve a ticket → reopen Manage → no Close control. Re-checked 2026-10-08 with a real 8-second wait. | Low; confirm the intended lifecycle. |

App rules that the automation hit and now respects. These are correct app behaviour:
- **Duty Handover rejects overlapping dates** for the same employee pair. Message: *"Handover conflict … overlaps the selected dates."* CH2 now uses a unique future window on each run.
- **Geofence rejects a duplicate point and radius** for the same employee. Message: *"… already covers this exact point and radius."* AT2 now uses unique coordinates on each run.
- **Helpdesk labels changed** on the current build: "Update" is now **"Update Status"** and "Resolve" is now **"Resolve Ticket"**. Specs updated.

## Retracted — automation bugs, now fixed and green

| Was | Test | Real cause (in the test code) | Fix | Now |
|---|---|---|---|---|
| APP-01 Candidate not saved | R3 | The "Add New" form opens in a Bootstrap **offcanvas** panel that FormKit didn't recognise, so field lookups landed on the list's filter bar. The form also uses **First Name / Last Name**, not "Name". Success was judged on a stray toast. | Offcanvas added to `openForm()`; corrected labels; success = the panel closes. | R1–R6 ✅ (candidate flows to interview and offer) |
| APP-02 Referral not saved | RF1/RF2 | The fields are laid out in a grid, so "label → next input" put the email in the wrong field. The app then rejected the referral with *"Candidate email is required"*. A loose save-button matcher also missed **"Submit Referral"**. | Anchor fields by placeholder; click "Submit Referral" and expect the redirect to the detail page. | RF1–RF3 ✅ |
| APP-03 Handover not saved | CH2 | Every run used the same pair (Rahul Sharma → Amit) with nearly the same dates. After the first run, the app correctly rejected each new handover as an **overlap**, and the conflict popup came and went before the test captured it. Label-anchored date fills also hit the filter bar's date fields. | Unique far-future window per run; dates filled positionally; fail loudly on a conflict message. | CH1–CH3 ✅ |
| APP-06 Leave apply not saved | LV7 | `isVisible({timeout})` **does not wait** in Playwright. The test checked for the confirm dialog instantly, never clicked it, and so nothing was committed. A loose `/approved/` regex then matched static page text and falsely passed. | `waitVisible()` helper; accept the confirm dialog; require the app's exact confirmation text; hard check that the balance drops, re-loading the page on each poll. | LV5–LV7 ✅ (app: *"approved — their balance is updated"*; Casual 3 → 2) |

The same non-waiting `isVisible({timeout})` call was also in `FormKit.scope()` (so slow modals fell back to the page body), `gotoReady`,
`clickLauncher`/`openAddCandidate`, CH2 and H7. All are now on `waitVisible()`, and every spec was re-run green after the change.

## Carried over from earlier manual sweeps (not re-tested here)
See Jira and the earlier reports for: Onboarding DEF-001 (joining date −1 day), Leave LM-3 (a11y), LM-8 (lists empty on load),
Resignation RE-02/03.
