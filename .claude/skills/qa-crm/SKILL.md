---
name: qa-crm
description: Act as a QA tester for the Progbiz ERP CRM module — log into the live app, walk every CRM page (leads, enquiry, quotation, follow-ups, lead settings, dealers, sales targets, AI call analysis), exercise the controls, find bugs, and write a severity-rated issue report. Use this whenever the user asks to QA / test / check / audit / sweep the CRM module, asks "are there any bugs in CRM", wants to know if CRM still works after a build, wants a CRM issue report, or mentions testing enquiries, quotations, leads or follow-ups — even if they do not say the words "QA" or "skill".
---

# QA the CRM module

You are testing the CRM module of the Progbiz ERP as a QA engineer would:
open the real app, use it, find what is broken, and write it up so a developer
can act on it.

**Read `docs/qa/QA_METHOD.md` first.** It holds the safety rules, the severity
rubric, and the exact report format. Everything below is CRM-specific and
assumes you have read it.

## 1. Orient

Confirm the environment before touching anything:

```bash
cd ~/PROGBIZ/ERP/Progbiz-erp-testers && cat .env
```

`BASE_URL` should be a test tenant (`devtest.progbiz.in` or
`erptest.progbiz.in`). If it points anywhere that looks like production, stop
and ask. `devtest` responds in ~0.3s; `erptest` takes ~6s, so a sweep there is
much slower — mention that if the user is waiting.

Then read `docs/CRM_MODULE_DOCUMENTATION.md` for the nav map and the global UI
conventions (filter panel ids, listing search pattern, the AJAX-form wait that
trips up most tests). Knowing what each page is *for* is what separates a real
finding from a shrug.

## 2. Sweep

```bash
node scripts/qa/qa-explore.js --module crm
```

Roughly 20 pages, a few minutes. It writes raw findings to
`reports/qa/raw/crm-<timestamp>.json` and a full-page screenshot per route.
Read the JSON, not just the console summary — the console only flags; the JSON
carries the console errors, failed request URLs, and table columns you need to
judge severity.

## 3. Exercise the workflows by hand

The prober checks that pages load. It cannot tell you a business rule is
wrong. CRM's value is in its flows, so drive these yourself and watch what
happens:

- **Enquiry creation** (`/enquiry`) — the module's core. Pick a customer, add
  an item, set follow-up status. The item picker is a `<select>`
  (`#item-search-input`) committed with `#btn-add-item`; the enquiry will not
  save without a line item. Check: does the form validate a missing customer?
  Does the enquiry number generate? Does saving redirect to the overview?
- **Enquiry → Quotation** (`#btn-create-quotation`) — does the quotation
  inherit the items and totals? Are the totals arithmetically right?
- **Follow-ups** (`#followupModal`) — does the status dropdown drive the
  conditional fields (Lead Quality appears for In-Followup; Description for
  Won/Lost)? Can a follow-up be dated in the past?
- **Lead settings** (`/lead-sources`, `/lead-status`) — create/edit/delete is
  safe here *only* for records you created yourself, prefixed `QA_`.
- **Lead transfer** (`/bulk-lead-transfer`) — read-only unless you are certain;
  transferring a real lead reassigns someone's work.

Newer pages have no automated coverage at all, so they are the most likely
place to find something: `/call-analysis` (AI Call Analysis), `/sales-targets`,
`/lead-expenses`, `/lead-source-commissions`, `/solar-orders`,
`/add-multiple-lead-tasks`. Give these a proper look.

## 4. Check drift against the automated suite

CRM has 57 Playwright tests whose selectors encode assumptions about this UI.
When you spot a UI change, trace it to the code it breaks and say so in the
report's *Changes vs baseline* section — that is the part your reader acts on.

High-risk couplings worth checking every run:
- `#item-search-input` — was a text input with a search modal, now a `<select>`.
- Icon classes — the app is mid-migration from Remix (`ri-*`) to Bootstrap
  Icons (`bi-*`). Selectors pinned to `ri-delete-bin-5-fill` and friends break
  silently as pages migrate.
- `/leads` table column order — `EnquiryPage.openFirstEnquiry()` and
  `LeadTransferPage.getFirstLead()` both index columns positionally, so
  inserting a column sends them to the wrong cell without erroring.

If you want to confirm a suspicion against the suite, run one spec rather than
the whole thing (the full CRM run takes ~55 minutes):

```bash
npx playwright test erp/crm/tests/crm_enquiry.spec.js -g "ENQ-19" --retries=0
```

## 5. Report

Write `reports/qa/crm-<YYYY-MM-DD>.md` using the template in
`docs/qa/QA_METHOD.md`. Number issues `CRM-001`, `CRM-002`, …

Then in chat, give the user the short version: how many pages, how many
issues, and the two or three that actually matter. Link the report file. Do
not paste the whole thing — they can open it.

If nothing is broken, say so plainly and show the coverage list. A clean sweep
is a real result, and padding it with trivia makes the next report less
believable.
