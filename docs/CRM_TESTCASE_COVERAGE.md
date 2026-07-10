# CRM — Coverage Map (`CRM- Test Case.xlsx` → Automation)

Maps the 129 cases in the supplied Excel ("Demo Flow" sheet, 6 modules) to Playwright tests.
Target: `devtest.progbiz.in` · company `Lesol_dev` · user `admin` (`.env`).

| Module | Excel IDs | Spec | Notes |
|---|---|---|---|
| Login Page | Login_01–08 | [crm_login.spec.js](tests/crm_login.spec.js) | Login_06 (Remember) skipped — no such checkbox on this build |
| Homepage | Home_01–26 | [crm_homepage.spec.js](tests/crm_homepage.spec.js) | "homepage" is distributed across /home, /leads, /followups, /crm-dashboard |
| Item | Item_01–15 | [crm_item.spec.js](tests/crm_item.spec.js) | Item_04 (session timeout) + Item_07/08/09 (no Price field here) + Item_14 (no Delete control) skipped with reasons |
| Enquiry | ENQ-01–28 | [crm_enquiry.spec.js](tests/crm_enquiry.spec.js) | no Assign-To/Business-Value field on the dev enquiry form (Business Value is in the follow-up) |
| Followup | ENQ-29–42, QT-019–028 | [crm_followup.spec.js](tests/crm_followup.spec.js) | QT-019–028 reuse the identical #followupModal |
| Quotation | QT-001–018 | [crm_quotation.spec.js](tests/crm_quotation.spec.js) | stepped form best driven via enquiry→Create Quotation (prefilled) |

Run everything CRM:
```
npx playwright test tests/crm_login.spec.js tests/crm_homepage.spec.js tests/crm_item.spec.js tests/crm_enquiry.spec.js tests/crm_followup.spec.js tests/crm_quotation.spec.js
```

## Real-build deltas vs the Excel (captured during automation)

- **Login**: `#companycode` / `#signin-username` / `#signin-password`; eye toggle `.password-toggle`; "Forgot password ?" link; **no Remember-Password checkbox**.
- **Item**: form `/item` has **Item Name\*** + **Variant Name\*** + Type/Group/Category/Brand/Description — **no Price field** (Excel's price cases don't apply); list `/items` has search `#filter-name` and an **Edit-only** Action column (no Delete on this tenant); category is group-dependent.
- **Enquiry**: `/enquiry` form — Branch (Kannur/Kasargod), auto Enquiry No (ENQ-###), auto date, `#followup` statuses (Interested=In-Followup, Got the business=Won, Not interested=Lost), **Lead Quality (`#lead-quality`) appears only for In-Followup**, Description always visible, `#next-followup-date`. **No Assign-To or Business-Value field** (Business Value is entered in the follow-up modal).
- **Followup**: `#followupModal` — `#followup-status`, `#lead-quality` (In-Followup only; hidden for Won/Lost → Description-only), `#followup-date` (auto), `#business-value`, `#btn-save-followup`; latest follow-up is edit/deletable, older are read-only.
- **Quotation**: stepped form; via enquiry-convert (`/quotation/0/{id}`) everything auto-fills **except `#expdate` (Quotation Valid Upto)** — exactly per QT-010. Totals `#gross-total`/`#payable-total`, Terms `#terms-and-condition`, Save `#btn-save-quotation`.
- **Homepage**: distributed — `/home` (greeting "Hey, <user>", Create New `#new-task`/`#new-enquiry-item`/`#new-quotation-item`, Today's Schedule, timeline/calendar icons), `/leads` (`#tab-lead-new/infollowup/won/lost` + counts), `/followups` (`#tab-followup-today/overdue/upcoming/nonfollowup`; Delayed = overdue), `/crm-dashboard` (Summary New/Cold/Warm/Hot/Won/Lost + Executive/Added-By filter).

## Skipped / not-applicable (honest)

| Case | Reason |
|---|---|
| Login_06 | No Remember-Password checkbox on this build |
| Item_04 | Session-timeout not deterministically automatable |
| Item_07/08/09 | No Price field on this build's item form |
| Item_14 | `/items` exposes no Delete control on this tenant (Edit-only) |
| Home_19 | "Executive dropdown hidden for limited executive" needs a non-admin role login |
| QT-019–028 | Reuse the same `#followupModal` verified in ENQ-29..42 |
