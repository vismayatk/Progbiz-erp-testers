# CRM — Test Scenarios (Positive & Negative)

> **Scope:** CRM module + linked masters (Inventory Items/Categories) on Progbiz ERP.
> **Type:** ✅ Positive (happy path) · ❌ Negative (validation / error / edge).
> **Auto** = covered by an automated test (`TC-xx` in `tests/enquiry_flow.spec.js`); others are manual/proposed.
> Run automated ones via `npm run chrome -- -g "TC-09 \|"` (see `TEST_CASES.md`).

---

## 1. Login

| ID | Type | Scenario | Steps | Expected Result | Auto |
|----|------|----------|-------|-----------------|------|
| LOGIN-P1 | ✅ | Valid credentials | Enter company `Lesol_dev`, user `admin`, pass `123` → Login | Redirects to `/home`; session established | TC-01 |
| LOGIN-N1 | ❌ | Wrong password | Valid company+user, wrong password → Login | Error "invalid credentials"; stays on `/login` | — |
| LOGIN-N2 | ❌ | Wrong company code | Invalid company code → Login | Error; not logged in | — |
| LOGIN-N3 | ❌ | Wrong username | Valid company, bad user → Login | Error; not logged in | — |
| LOGIN-N4 | ❌ | Empty required fields | Leave company/user/pass blank → Login | Field validation; submit blocked | — |
| LOGIN-N5 | ❌ | SQL/script in fields | Enter `' OR 1=1`, `<script>` in fields | Rejected/sanitised; no injection | — |

## 2. Lead / Enquiry Creation

| ID | Type | Scenario | Steps | Expected Result | Auto |
|----|------|----------|-------|-----------------|------|
| ENQ-P1 | ✅ | New customer enquiry | `/enquiry` → Branch, phone → New Customer modal (name) → Assign To → add item → Save | Saved; redirect `/enquiry-overview/{id}`; lead in Leads→New | TC-02 |
| ENQ-P2 | ✅ | Existing customer (search & choose) | Phone magnifier → `#searchModal` → search → pick row → fill → Save | Form auto-fills existing customer; enquiry saved | TC-02B |
| ENQ-P3 | ✅ | Open created enquiry | From Leads/overview URL open the enquiry | Detail page shows correct data | TC-03 |
| ENQ-N1 | ❌ | Missing Customer Name | Leave name blank → Save | Validation; not saved | — |
| ENQ-N2 | ❌ | Missing Customer Phone* | Leave phone blank → Save | Validation; not saved | — |
| ENQ-N3 | ❌ | Missing Assign To* | No assignee → Save | Validation; not saved | — |
| ENQ-N4 | ❌ | No item added | Fill all but add **no item** → Save | Toast "Please choose at least one item" | (seen) |
| ENQ-N5 | ❌ | Duplicate customer phone | New customer with an existing phone → Save | "This phone number already exists for customer…" | (seen) |
| ENQ-N6 | ❌ | Duplicate customer email | New customer with an existing email → Save | Rejected (email already exists) | (seen) |
| ENQ-N7 | ❌ | Invalid phone format | Letters/short number in phone → search/Save | Rejected / no match | — |
| ENQ-N8 | ❌ | Past next-followup date | Set follow-up date in the past | "Value must be {now} or later" | (seen) |
| ENQ-N9 | ❌ | Business value negative/text | Enter `-100` / letters in Business Value | Rejected / coerced | — |

## 3. Follow-up

| ID | Type | Scenario | Steps | Expected Result | Auto |
|----|------|----------|-------|-----------------|------|
| FU-P1 | ✅ | Add follow-up | Overview → Followup → status + lead quality → Save | Follow-up saved; status updates; row in history | TC-04 |
| FU-P2 | ✅ | Follow-up visible in history | Open Followup History tab | The new follow-up row is listed | TC-05 |
| FU-N1 | ❌ | No Followup Status | Open modal → Save without status | Validation; not saved | — |
| FU-N2 | ❌ | No Lead Quality (when required) | Status chosen, leave Lead Quality blank → Save | Validation on Lead Quality* | — |
| FU-N3 | ❌ | Past next-followup date | Set next follow-up in the past | "must be … or later" | (seen) |
| FU-N4 | ❌ | Follow-up after conversion | Convert to quotation, then try Followup | Followup button absent (by design) | (seen) |

## 4. Quotation & Status Lifecycle

| ID | Type | Scenario | Steps | Expected Result | Auto |
|----|------|----------|-------|-----------------|------|
| QUO-P1 | ✅ | Convert enquiry → quotation | Overview → Create Quotation → `/quotation/0/{id}` → Save | Quotation created; listed (Type=Quotation) | TC-06/07 |
| ST-P1 | ✅ | Status → In-Follow-Up | Followup status "Interested" | Lead moves to In-Follow-Up | TC-08 |
| ST-P2 | ✅ | Status → Won | Followup status "Got the business" | Lead moves to Won | TC-09 |
| ST-P3 | ✅ | Status → Lost | Followup status "Not interested" | Lead moves to Lost | TC-10 |
| QUO-N1 | ❌ | Convert an already-converted enquiry | Convert twice | Blocked / shows "View Quotation" only | (seen) |
| QUO-N2 | ❌ | Quotation missing required (business) | Business customer, leave Company/Address/Contact blank → Save | Validation on required* fields | — |

## 5. Leads Listing / Search / Filters

| ID | Type | Scenario | Steps | Expected Result | Auto |
|----|------|----------|-------|-----------------|------|
| LEAD-P1 | ✅ | Records visible | Open `/leads` | Rows load; tabs New/In-Follow-Up/Won/Lost with counts | TC-11 |
| LEAD-P2 | ✅ | Search by Name/Phone/Email | Set field + Contains/StartWith/EqualTo + value → search | Filtered rows match | — |
| LEAD-P3 | ✅ | Filter by tab/status/source/date | Apply each filter | List updates accordingly | — |
| LEAD-N1 | ❌ | Search non-existent | Search a random string | "No data" / empty table; no error | — |
| LEAD-N2 | ❌ | Special chars in search | `%`, `'`, emoji in search | Handled gracefully; no crash | — |

## 6. Lead Transfer (Settings)

| ID | Type | Scenario | Steps | Expected Result | Auto |
|----|------|----------|-------|-----------------|------|
| LT-P1 | ✅ | Transfer to executive | Apply Filters → select lead → choose executive → Transfer Selected → confirm | "Successfully transferred"; Current Assignee = target | TC-12 |
| LT-P2 | ✅ | Verify reassignment | Re-search the lead | Current Assignee updated to the new executive | TC-12 |
| LT-N1 | ❌ | Transfer with no lead selected | Choose executive, click Transfer with 0 selected | Disabled / "select at least one" | — |
| LT-N2 | ❌ | Transfer with no executive | Select lead, leave executive blank → Transfer | "Select Executive" validation | — |
| LT-N3 | ❌ | Apply Filters returns nothing | Filter that matches no lead | Empty list; "no leads"; no error | — |

## 7. Settings Masters — Lead Sources / Lead Status (full CRUD)

| ID | Type | Scenario | Steps | Expected Result | Auto |
|----|------|----------|-------|-----------------|------|
| LS-P1 | ✅ | Create lead source | New Lead Source → name → Save | Saved; appears in list | TC-13 |
| LS-P2 | ✅ | Edit lead source | Pencil → rename → Save | Row updated | TC-13 |
| LS-P3 | ✅ | Delete lead source | Trash → confirm | Row removed | TC-13 |
| LST-P1 | ✅ | Create followup status + Nature | New → name + Nature → Save | Saved; appears in list | TC-14 |
| LST-P2/3 | ✅ | Edit / Delete followup status | Pencil / Trash | Updated / removed | TC-14 |
| LS-N1 | ❌ | Duplicate lead source | Create same name twice | "This Lead source name already exist" | TC-13 |
| LST-N1 | ❌ | Duplicate followup status | Create same name twice | "Followup status name already exist…" | TC-14 |
| MAS-N2 | ❌ | Empty name | Save with blank name | Validation; not saved | — |
| MAS-N3 | ❌ | Max length | Lead source > 30 chars | Truncated at 30 (maxlength) | TC-13 |
| MAS-N4 | ❌ | Whitespace-only / special chars | Save `"   "` or `@#$` | Rejected / handled | — |

## 8. Inventory — Item & Item Category (linked to CRM)

| ID | Type | Scenario | Steps | Expected Result | Auto |
|----|------|----------|-------|-----------------|------|
| IC-P1 | ✅ | Create item category | `/item-categories` inline form → name → Save | "Saved Successfully"; appears in list | TC-15 |
| IC-P2/3 | ✅ | Edit / Delete category | Pencil / Trash | Updated / removed | TC-15 |
| IT-P1 | ✅ | Create item (Product) | `/item` → Item Name + Category → Save Item | Created ("You're done!!" on dev) | TC-16 |
| IC-N1 | ❌ | Duplicate category | Same category name twice | "This Item Category is already exist" | TC-15 |
| IT-N1 | ❌ | Duplicate item | Same item name twice | "Item name already exist…" | TC-16 |
| IT-N2 | ❌ | Item missing name* | Save with blank Item Name | Validation; not saved | — |

## 9. CRM Dashboard

| ID | Type | Scenario | Steps | Expected Result | Auto |
|----|------|----------|-------|-----------------|------|
| DSH-P1 | ✅ | Sum integrity | Apply Branch/Exec/Period | Σ executive columns = summary badges = footer total | verify_dashboard.js |
| DSH-P2 | ✅ | Drill-down count parity | Click a status badge (e.g. Warm) | Inner Leads list count = badge count; filters inherited | (verified) |
| DSH-P3 | ✅ | Filter combinations | Branch+Exec+Period combos | Data updates; sums still reconcile | verify_dashboard.js |
| DSH-N1 | ❌ | Empty period | Pick a period with no leads | Cards/table all 0; no error | — |
| DSH-N2 | ❌ | Invalid custom range | From later than To | Blocked / validated | — |
| DSH-N3 | ❌ | Backend error window | Apply during an unstable window | Clear error, not a wrong/zero count or perpetual spinner | — |

## 10. Cross-cutting / Non-functional

| ID | Type | Scenario | Expected Result |
|----|------|----------|-----------------|
| X-N1 | ❌ | Backend save error | Intermittent "Oops … Error Code: …" surfaced clearly, not silent (`throwIfServerError`) |
| X-N2 | ❌ | Session timeout / re-login | Expired session redirects to `/login` |
| X-N3 | ❌ | Slow / no network | Loading state shown; no broken half-state |
| X-P1 | ✅ | Re-runnability | Create→duplicate→edit→delete leaves no residue (unique names) | 

---

### Coverage summary
- **Automated (positive flow + key negatives):** TC-01 … TC-16 — login, enquiry (new + existing), follow-up, quotation, status, listing, lead transfer, lead source/status/item-category/item CRUD **with duplicate-rejection**.
- **Manual / proposed negatives to add:** field-level validations (empty/required), invalid formats, special chars, empty-result searches, dashboard edge cases (§ marked "—").
- **Known backend note:** the test tenant intermittently errors on save/load; treat those as environment issues, not test failures (see `CRM_MODULE_DOCUMENTATION.md` §5.0).
