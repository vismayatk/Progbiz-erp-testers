# Progbiz ERP — CRM Module Documentation

> **Environment:** ERP Test (`https://erptest.progbiz.in`)
> **Tenant / Company Code:** `lesol_test`  ·  **User:** `admin` (role: Administrator, profile "Biju ummer")
> **Scope:** CRM Dashboard + CRM module only. Other modules (Task Management, Project, Whatsapp, Inventory, Accounts, Master, Excel Upload, Reports) are noted only where they touch CRM workflows.
> **Method:** Live exploration via Playwright (headless). Source data: `crm_audit.json`, `crm_submenu_report.json`, screenshots in `crm_audit_shots/`.

---

## 1. CRM Navigation Map (menus & submenus)

The left sidebar is a click-to-expand menu. CRM-related entry points live under two top-level items:

### `Dashboards` → CRM
| Label | URL |
|-------|-----|
| CRM (Dashboard) | `/crm-dashboard` |

### `CRM` (top-level, id `nav-crm`)
| Label | URL | Type |
|-------|-----|------|
| FollowUps | `/followups` | Listing |
| Create Enquiry | `/redirect/enquiry` → `/enquiry` | Form |
| Create Quotation | `/redirect/quotation` → `/quotation` | Form |
| Leads | `/leads` | Listing (master) |
| Lead Task Assignment | `/add-multiple-lead-tasks` | Bulk tool |
| Dealers | `/dealers` | Master/Listing |
| Solar Order Forms | `/solar-orders` | Listing (industry-specific) |
| **Settings →** Lead Transfer | `/bulk-lead-transfer` | Bulk tool |
| **Settings →** Lead Status | `/lead-status` | Settings |
| **Settings →** Lead Sources | `/lead-sources` | Settings |

> `/redirect/enquiry` and `/redirect/quotation` are server redirects that land on `/enquiry` and `/quotation` respectively.
> The route `/crm` returns a 404 ("Sorry, there's nothing at this address").

**CRM-adjacent (other modules, linked to CRM workflows):**
- `Excel Upload → Enquiry Upload` (`/enquiry-upload`) — bulk-import leads.
- `Leads → Add New → Upload Enquiries` — same bulk-import entry point.

---

## 2. Global UI Conventions

These apply across every CRM page and are useful for test automation:

- **Header profile:** `#mainHeaderProfile` (shows "Biju ummer").
- **Filter panel:** opened with `#btn-toggle-filter`, closed with `#btn-close-filter-x`; actioned with `#btn-apply-filter` ("Apply Filter") and `#btn-clear-filter` ("Clear").
- **Theme switcher:** `#reset-all` ("Reset") + a large set of `#switcher-*` radios (theme/layout) — **ignore these in tests; they are not CRM features.**
- **Listing search pattern (repeated on most listings):** a free-text box + a field selector (`Name / Phone / Email Address`) + a match-mode selector (`Contains / StartWith / EqualTo`).
- **AJAX forms:** the Enquiry and Quotation form bodies load asynchronously (a spinner shows for ~1–3s). **Tests must wait for a real field (e.g. `#TxtCustomer` / `#btn-save-enquiry`) before interacting** — this is the root cause of the current failing tests.

---

## 3. Page-by-Page Documentation

### 3.1 CRM Dashboard
| Attribute | Detail |
|-----------|--------|
| **Page Name** | CRM (Dashboard) |
| **URL** | `/crm-dashboard` |
| **Breadcrumb** | Dashboards › CRM |
| **Purpose** | Analytics overview of CRM leads — distribution by executive, status, source, item and time period. |
| **Widgets** | Executive-wise Leads · Statuswise · Lead Source (Detailed & Summary) · Item Summary · Item Category · Leads Reports (time-series). |
| **Buttons** | Toggle Filter (`#btn-toggle-filter`), Clear (`#btn-clear-filter`), Apply Filter (`#btn-apply-filter`), Reset (`#reset-all`). |
| **Filters** | Sales View toggle (`#summarizedToggle`); Date range (`All/Today/Yesterday/This Week/This Month/This Year/Previous Month/Previous Year/Custom`); Type (`All/Enquiry/Quotation`); Status (`#status-id`); Lead Source (`#leadsoure`); Lead Quality (`#leadquality`); Added By (`#addded-by`); Item Category (`#itemCategory`); Place (`#place-filter`); Lead Stage (`All/New/Won/Lost/Cold/Warm/Hot`). |
| **Search Options** | "Search items" free-text (item filter). |
| **Table Columns** | None (chart/widget dashboard). |
| **Form Fields** | None (read-only/filter-only). |
| **Status Values** | New, Won, Lost, Cold, Warm, Hot. |

### 3.2 Leads (master listing)
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Leads |
| **URL** | `/leads` |
| **Breadcrumb** | CRM › Leads |
| **Purpose** | Master list of all leads (enquiries + quotations); the operational hub of the CRM. |
| **Status Tabs** | New (`#tab-lead-new`) · In Follow Up (`#tab-lead-infollowup`) · Won (`#tab-lead-won`) · Lost (`#tab-lead-lost`) — each shows a live count. |
| **Available Actions** | View/open a lead (row); Add New → **New Enquiry / New Quotation / Upload Enquiries**; Export to Excel; filter & search. |
| **Buttons** | Add New (`#btn-add-new-dropdown`), Export Data (`#export-excel`), Apply Filter, Clear, Toggle Filter, Reset. |
| **Filters** | Date Added range; Type (`All/Enquiry/Quotation`); Status (`#status-id`); Lead Source (`#leadsoure`); Lead Quality (`#leadquality`); Item Category (`#itemCategory`); Last Follow-up range (`#inputStateLastFollowUp`); Place (`#place-filter`). |
| **Search Options** | `#filter-name` "Search here"; field selector `Name/Phone/Email Address`; match mode `Contains/StartWith/EqualTo`; "Enter customer name and search". |
| **Table Columns** | SlNo · Number · Customer Name · Phone · Business Value · Lead Source · Date Added · Assignee. |
| **Form Fields** | None on listing (Add New launches the Enquiry/Quotation forms). |
| **Status Values** | New · In Follow Up · Won · Lost (tab buckets). |

### 3.3 FollowUps
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Followups |
| **URL** | `/followups` |
| **Breadcrumb** | CRM › Followups |
| **Purpose** | Track & action scheduled follow-ups across all leads. |
| **Status Tabs** | Today's (`#tab-followup-today`) · Delayed (`#tab-followup-overdue`) · Upcoming (`#tab-followup-upcoming`) · Non Followup (`#tab-followup-nonfollowup`) — each with a count. |
| **Available Actions** | Open lead / record a follow-up (row "Action"); Add New; filter & search. |
| **Buttons** | Add New (`#btn-add-new-dropdown`), Apply Filter, Clear, Toggle Filter, Reset. |
| **Filters** | Type (`All/Enquiry/Quotation`); Nature (`#leadQuality`: `All/New/InFollowup`); Status (`#status-id`); Lead Quality (`#leadquality`); Branch (`#assignedToBranch`); Assignee/Status (`#assignedTo`); Next-Followup range (`All/Missed/Today/This Week/This Month/This Year/Previous Month/Previous Year/Custom`); Last-Followup range (`#lastFollowupInputState`); Lead Source (`#leadsoure`). |
| **Search Options** | `#filter-name` "Search here"; field selector `Name/Phone`; match mode `Contains/StartWith/EqualTo`; "Enter customer name". |
| **Table Columns** | S.No · Next Followup Date · Action · Number · Customer Name · Phone · Lead Quality · Status · Assignee · Last Followup Date · Followup By. |
| **Form Fields (follow-up action modal)** | Next Followup Date (`#followup-date`, datetime-local, max = now); Followup Status (`#followup-status`); Business Value (`#business-value`); Remarks (`#followup-description`). |
| **Status Values** | Nature: New, InFollowup. |

### 3.4 Create Enquiry  *(primary Lead-creation form)*
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Enquiry ("Add Enquiry") |
| **URL** | `/enquiry` (via `/redirect/enquiry`) |
| **Breadcrumb** | CRM › Leads › Enquiry |
| **Purpose** | Create a new lead/enquiry against a customer. |
| **Buttons** | Save (`#btn-save-enquiry`), Cancel (`#btn-cancel-enquiry`), Reset (`#reset-all`). |
| **Form Fields** | Branch* (`#branch`: Choose/Kannur/Kasargod) · Date (`#enquiry-date`) · Enquiry Number (`#enquiry-number`, auto) · Country code (`#customer-country-code`) · Phone (`#customer-phone`, "Enter phone number and search") · **Customer Name\*** (`#TxtCustomer`) · Place (`#Place`) · **Assign To\*** (`#assignto`: You/Biju/JASEEM/NABEEL/Shaju Ummar/SHAMAL/SIRAJ/VIGNESH) · "Not Required" follow-up checkbox (`#no-next-followup-enquiry`) · Next Followup Date (`#next-followup-date`, datetime-local) · Followup Status (`#followup`) · Business Value (`#business-value`, number) · Lead Source (`#leadsource`) · Item search (`#item-search-input`) + Quantity (`#new-item-quantity`) · Remarks (`#enquiry-description`, textarea). |
| **Item selection** | "Enquired For" section: type in `#item-search-input` and click the `+` icon (`i.ri-add-fill`) → opens the **`#searchItemModal`** ("Search Results") → search in `#item-search-modal-input` → pick a row from the results table (Name/Price/IsIncTax) → set quantity (`#new-item-quantity`). Green `#btn-add-item` adds the line. Available items in `lesol_test`: Generator, Heat Pump, Home Pcu, Hybrid, Inverter, … (8 total, from Inventory → Items). |
| **Validation Rules** | **Required:** Customer Name (`*`), Customer Phone (`*`), Assign To (`*`), and **at least one item** (toast: *"Please choose at least one item"*). Branch defaults to "Kannur". Follow-up date can be waived via the "Not Required" checkbox (`#no-next-followup-enquiry`). Enquiry No (`ENQ-###`) auto-generates. (Validation surfaces as a toastr message on Save.) |
| **Status Values (Followup Status)** | New Enquiry · Awaiting · Call not attended · customer is busy · Interested · Got the business · Not interested · Postponded · PRICE ISSUE. |
| **Note** | Form loads via AJAX — wait for `#TxtCustomer`/`#btn-save-enquiry`. |

### 3.5 Create Quotation
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Quotation |
| **URL** | `/quotation` (via `/redirect/quotation`) |
| **Breadcrumb** | CRM › Leads › Create Quotation |
| **Purpose** | Create a quotation for an individual or business customer (B2B captures full company + address + contact + tax details). |
| **Customer Type** | Individual / Business radios; Customer Level: Customer / Prospect / Suspect. |
| **Form Fields (Individual)** | Customer Name* (`#customername`) · Phone (`#customer-phone-input` + country) · Place (`#place`) · Email (`#emailAddress`) · Secondary phone · Currency. |
| **Form Fields (Business, additional)** | Company Name* (`#company-name`) · Address* (`#address`) · Country (`#country`) · State (`#state`) · Contact Person* (`#contact-person`) · Contact No* (`#contact-no`) · Contact Email* (`#contact-email`) · Tax Reg Status (`#has-tax`: Not Registered/Registered) · Address Type* (`#address-type`). |
| **Validation Rules** | Required (`*`): Customer Name; for business — Company Name, Address, Contact Person, Contact No, Contact Email, Address Type. |
| **Buttons** | Reset; (Save/line-item controls render after a customer is selected). |
| **Note** | Multi-section, stepped form with item lines; most fields hidden until the customer/type step is completed. |

### 3.6 Lead Task Assignment (Bulk)
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Bulk Lead Task Assignment |
| **URL** | `/add-multiple-lead-tasks` |
| **Breadcrumb** | CRM › Bulk Lead Task Assignment |
| **Purpose** | Filter a set of leads, select them, and assign a task to all at once. |
| **Available Actions** | Filter leads → select → assign task (type, priority, details, date/time). |
| **Buttons** | Apply Filters, Clear Filters, Reset. |
| **Filters** | Search by Name/Phone/Email + match mode; date range (`All/This Week/This Month/This Year/Custom`); Type (`Enquiry/Quotation`); Status; Lead Stage (`All/New/Warm/Hot/Won/Lost`). |
| **Form Fields (task)** | Task Type (`#taskType`) · Priority (`Normal/Medium/High`) · Task details (textarea) · Date (min = today) · Time · selection checkboxes. |
| **Status Values** | New, Warm, Hot, Won, Lost. |

### 3.7 Dealers
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Dealers |
| **URL** | `/dealers` |
| **Breadcrumb** | CRM › Dealers |
| **Purpose** | Maintain dealer master records (lead sources / channel partners). |
| **Available Actions** | New Dealer; search; row Action (edit/delete). |
| **Buttons** | New Dealer; Reset. |
| **Search Options** | `#task` "Search dealer here". |
| **Table Columns** | S.No · Dealer Name · Contact No · Action. |
| **Form Fields** | New Dealer modal (Dealer Name, Contact No). |

### 3.8 Solar Order Forms
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Solar Orders |
| **URL** | `/solar-orders` |
| **Breadcrumb** | CRM › Solar Orders |
| **Purpose** | Industry-specific (solar) order capture linked to a beneficiary/lead. |
| **Available Actions** | New Order; row Action. |
| **Buttons** | New Order; Reset. |
| **Table Columns** | S.No · Branch · Beneficiary Name · Address · Phone · KSEB Consumer No · KSEB Consumer Name · Electrical Section · Plant Capacity · Total Amount · Action. |

### 3.9 Lead Transfer (Bulk)  ✅ *verified working*
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Bulk Lead Transfer |
| **URL** | `/bulk-lead-transfer` |
| **Breadcrumb** | CRM › Bulk Lead Transfer |
| **Purpose** | Reassign one or many leads from their current executive to another, in bulk. |
| **Filters (all)** | Search By (Name/Phone/Email) + match (Contains/StartWith/EqualTo) + Search Value; **Branch**; **Period** (date range); **Type** (All/Enquiry/Quotation); **Status**; **Lead Source**; **Lead Quality**; **Item Category**; **Items** (search); **Current Assignee** (All/You/Arshida/Biju/JASEEM/Shaju Ummar/SHAMAL/VIGNESH); **Lead Stage** (All/New/Warm/Hot/Won/Lost); **FB Ad Name**; **FB Page**; **FB Form**. |
| **Buttons** | Clear Filters, **Apply Filters**, Reset. |
| **Empty state** | "Please apply filters to view leads." — the list is hidden until **Apply Filters** is clicked. |
| **Table Columns** | (checkbox) · SlNo · Number · Customer Name · Phone · Status · Stage · Date · Lead Source · **Current Assignee** · "Select All". |
| **Transfer bar** | "Transfer Leads (N Selected)" → **Transfer To** `-- Select Executive --` (You/Arshida/Biju/JASEEM/Shaju Ummar/SHAMAL/VIGNESH) → **Transfer Selected (N)**. |
| **Flow** | Apply Filters → tick lead checkbox(es) → choose executive in "Transfer To" → "Transfer Selected (N)" → confirm *"Are you sure you want to transfer N lead(s) to the selected executive?"* → **"Successfully transferred N lead(s)."** The lead's **Current Assignee** column then shows the new executive. |
| **Verified** | Live test: lead **ENQ-378** reassigned **VIGNESH → SHAMAL**; re-searching the lead confirmed Current Assignee = SHAMAL. Covered by **TC-12** (`pages/LeadTransferPage.js`). |
| **⚠️ Backend note** | "Apply Filters" intermittently returns the backend JSON error `ExpectedStartOfValueNotFound, Path: $` (see §5.0); the automation retries through it. The transfer action itself succeeds reliably. |
| **Status Values** | New, Warm, Hot, Won, Lost. |

### 3.10 Lead Status  *(Settings)*
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Followup Status |
| **URL** | `/lead-status` |
| **Breadcrumb** | CRM › Settings › Lead Followup Status |
| **Purpose** | Configure the follow-up statuses and map each to a lifecycle "Nature". **This is the master that defines what Won/Lost/In-Followup mean.** |
| **Available Actions** | New Followup Status; row Action (edit/delete); search. |
| **Buttons** | New Followup Status; Reset. |
| **Search Options** | `#filter-name` "Search by name". |
| **Table Columns** | S.No · Status Name · Nature · Action. |
| **Form Fields** | Status name; **Nature** select: `Choose / In Followup / Won / Lost`. |
| **Status Values (Nature)** | **In Followup · Won · Lost** — the canonical lifecycle classification driving the Leads tabs. |

### 3.11 Lead Sources  *(Settings)*
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Lead Sources |
| **URL** | `/lead-sources` |
| **Breadcrumb** | CRM › Settings › Lead Sources |
| **Purpose** | Configure the list of lead sources offered in the Enquiry form. |
| **Available Actions** | New Lead Source; row Action; search. |
| **Buttons** | New Lead Source; Reset. |
| **Search Options** | `#filter-name` "Search by name". |
| **Table Columns** | S.No · Lead Source Name · Action  (18 existing rows, e.g. "ABC EMPORIO"). |
| **Form Fields** | Lead source name (`#lead-source-name`, **maxlength 30**). |
| **Validation Rules** | Name required; max 30 chars. |

### 3.12 Enquiry Overview  *(lead detail page)*
| Attribute | Detail |
|-----------|--------|
| **Page Name** | Enquiry Overview |
| **URL** | `/enquiry-overview/{id}` (e.g. `/enquiry-overview/235381`) — landed on after creating an enquiry, or by opening a lead from Leads. |
| **Breadcrumb** | CRM › Leads › Enquiry Overview |
| **Purpose** | View a single lead/enquiry and drive its lifecycle (follow-ups, quotation, status, transfer). |
| **Header Actions** | **Transfer To Branch** · **Delete Enquiry** · **Edit Enquiry** · **Create Quotation** (converts the enquiry to a quotation). |
| **Card Actions** | **Followup** (records a follow-up + sets status/Nature → drives Won/Lost/In-Follow-Up) · **Add Meeting**. |
| **Tabs** | Enquiry Details · Followup History. |
| **Enquiry Details shown** | Enquiry No (`ENQ-###`), Date, Status, Lead Source, Added By, Business value, Description; Customer (name, phone, email), Assignee, First Followup Date; item table (Item Name · Quantity). |
| **Follow-up modal** | `#btn-add-followup` → **`#followupModal`** ("Add FollowUp"): `#followup-status` (Awaiting / Interested / **Got the business** / **Not interested** / …), then reveals `#lead-quality` (Cold/Warm/Hot, required) + `#next-followup-date` with **`#no-next-followup`** checkbox; `#followup-description`, `#business-value`; save **`#btn-save-followup`**. Saving updates the enquiry **Status** and adds a row to **Followup History** (`#followups li.crm-recent-activity-content`). |
| **Convert** | `#btn-create-quotation` → `/quotation/0/{id}` (prefilled) → save `#btn-save-quotation`. |
| **⚠️ Behavior** | **Once an enquiry is converted to a quotation, the "Followup" button disappears** (header shows "View Quotation" instead of "Create Quotation"). So follow-ups/status changes must happen *before* conversion, or on a different lead. |
| **Note** | This is the hub for workflows 5.2–5.6 — follow-up, quotation conversion, and Won/Lost/In-Follow-Up transitions all originate here. |

---

## 4. Consolidated Status / Lifecycle Values

| Context | Values |
|---------|--------|
| **Lead lifecycle "Nature"** (Lead Status master) | In Followup · Won · Lost |
| **Leads listing tabs** | New · In Follow Up · Won · Lost |
| **Lead stage filter** (Dashboard / bulk tools) | New · Warm · Hot · Won · Lost · Cold |
| **Follow-up tabs** | Today's · Delayed · Upcoming · Non Followup |
| **Enquiry Followup Status** | New Enquiry · Awaiting · Call not attended · customer is busy · Interested · Got the business · Not interested · Postponded · PRICE ISSUE |

---

## 5. CRM Workflows

### 5.0 ⚠️ Retest finding — intermittent backend errors on SAVE operations
As of the latest retest against `lesol_test`, **save operations intermittently fail** with a
server-side error:
> *"Oops something went wrong — Error Code: \<random, e.g. 5C71SS / IDD1SY / ED7M9X / J2LYST\> — Please contact support center"*

- Observed on **New Customer save** (`#btn-customer-save`) **and** on **Enquiry save** (`#btn-save-enquiry`).
- **Intermittent**: the exact same existing-customer flow succeeded in one test (TC-02B) and failed in another (TC-08) minutes apart; error codes are randomly generated.
- The site is also **noticeably slower** than before the change (full suite ~13 min vs ~7 min).

**Conclusion:** the recent **backend code change introduced an unstable/regressed save path** — this is a backend bug to investigate, not a test issue. All operations worked reliably (11/11) earlier the same day. The automation now detects this SweetAlert and fails fast with `Backend server error on save: …` (see `utils/helpers.js → throwIfServerError`) so the regression is surfaced clearly rather than as a confusing timeout.

### 5.1 Lead Creation — two ways
**Way 1 — New customer** (`#customer-phone` → `+` (`i.ri-add-fill`) → `#enquiry-new-customer-modal` → fill name/email → `#btn-customer-save`). *Currently fails server-side — see 5.0.*

**Way 2 — Existing customer (search & choose)** ✅: on the enquiry form click the phone **magnifier** (`i.ri-search-line`) → **`#searchModal`** ("Search Results") opens → type a phone/name in **`#txtSearchBox`** → click the search icon → click the matching result row (Sl.No / Name / Phone / Email) → the form's `#TxtCustomer`/phone auto-populate. (Entering an exact existing phone before the magnifier auto-fills directly without the modal.) Then set Assign To, add item, Save.

### 5.1a Lead Creation (original new-customer steps)
1. **CRM → Create Enquiry** (`/enquiry`) — or **Leads → Add New → New Enquiry**. Wait for the AJAX form (`#TxtCustomer` / `#btn-save-enquiry`).
2. Set **Branch** (defaults Kannur) and enter **Customer Phone** (`#customer-phone`).
3. **Customer step** — the phone is looked up; for a new number click the **`+`** (`i.ri-add-fill`) beside the phone to open the **New Customer modal** (`#enquiry-new-customer-modal`): pick Individual/Business, Level (defaults *Suspect*), fill **Customer Name** (visible `input[placeholder="please enter name"]`), optional email → **Save** (`#btn-customer-save`). The modal closes and populates `#TxtCustomer`.
4. Set **Assign To** (`#assignto`, required), and optionally Lead Source (`#leadsource`), Business Value (`#business-value`), Followup Status (`#followup`), Remarks (`#enquiry-description`); tick **Not Required** (`#no-next-followup-enquiry`) to skip the follow-up date.
5. **Add ≥1 item** (required): click the **magnifier** (`i.ri-search-line`) in the item group → `#searchItemModal` → search in `#item-search-modal-input` → click a result row (Name/Price/IsIncTax) → set `#new-item-quantity`.
6. **Save** (`#btn-save-enquiry`) → on success the app redirects to **`/enquiry-overview/{id}`** (the enquiry detail page) and the lead appears in **Leads → New**.

> Verified live: this exact sequence created enquiry `/enquiry-overview/235379` on `lesol_test`. The post-save **`/enquiry-overview/{id}`** page is the detail view used by the follow-up / convert-to-quotation / status flows.

### 5.2 Follow-up Management
1. Open **FollowUps** (`/followups`) or a lead from **Leads**.
2. Use the row **Action** to record a follow-up: set **Next Followup Date** (`#followup-date`), **Followup Status** (`#followup-status`), Business Value, Remarks.
3. Saved follow-ups are bucketed into **Today's / Delayed / Upcoming**; leads without a scheduled follow-up appear under **Non Followup**.
4. A lead with an active follow-up moves to the **In Follow Up** tab on Leads.

### 5.3 Quotation Creation
- Entry points: **CRM → Create Quotation** (`/quotation`), **Leads → Add New → New Quotation**, or convert from an existing enquiry.
- Choose Individual/Business + Customer Level → fill customer (and company/address/contact/tax for business) → add item lines → save. Quotation-type leads are then visible in Leads (Type = Quotation).

### 5.4 Won Opportunity Flow
1. Open the lead and record a follow-up whose **Followup Status maps to Nature = "Won"** (configured in **Lead Status**).
2. The lead moves to the **Won** tab on Leads and is counted in the dashboard "Won" stage.

### 5.5 Lost Opportunity Flow
1. Record a follow-up whose **Followup Status maps to Nature = "Lost"**.
2. The lead moves to the **Lost** tab and the dashboard "Lost" stage.

### 5.6 In-Follow-Up Flow
1. Record a follow-up whose **Nature = "In Followup"** with a **Next Followup Date**.
2. The lead moves to **In Follow Up** on Leads and surfaces in the FollowUps tabs (Today's/Delayed/Upcoming) according to the scheduled date.

> **Key insight:** Won / Lost / In-Follow-Up are **not** hard-coded buttons — they are derived from the **Nature** assigned to each Followup Status in CRM → Settings → Lead Status. To automate these flows reliably, first read the Lead Status master to find a status name whose Nature is Won / Lost / In Followup.

---

## 6. Notes for Test Automation (why the current suite fails)

The prepared Playwright code targets **incorrect URLs/selectors**. Corrected facts:

| Concept | Wrong (in current code) | Correct (verified live) |
|---------|------------------------|-------------------------|
| Enquiry list | `/crm/enquiry`, `/enquiries`, `/sales/enquiry` | **`/leads`** is the listing; **`/enquiry`** is the *Add* form |
| Create enquiry nav | sidebar "Enquiry" link | `/redirect/enquiry` or `Leads → Add New → New Enquiry` |
| Customer field | generic `input[name*=customer]` | **`#TxtCustomer`** |
| Phone field | generic `input[name*=phone]` | **`#customer-phone`** |
| Lead source | `select[name*=source]` | **`#leadsource`** |
| Assignee (required!) | not set | **`#assignto`** |
| Business value | `input[name*=price]` | **`#business-value`** |
| Save | `button:has-text("Save")` | **`#btn-save-enquiry`** |
| Form readiness | none | **must wait for AJAX form to render** |
| Company code | `.env` = `skiolo_test` | should be **`lesol_test`** |

Status transitions (Won/Lost/In-Follow-Up) are driven by **Lead Status → Nature**, not a single status dropdown, so the test approach needs to record a follow-up with the right status rather than pick "Won" from a generic `<select>`.

### Verified test status (12 tests)
> All pass **except TC-02 (new-customer create)**, which is blocked by the backend regression in §5.0. TC-02B (existing customer) covers the working creation path.
| Test | Status | Notes |
|------|--------|-------|
| TC-01 Login | ✅ Pass | `LoginPage` against `lesol_test`. |
| TC-02 Create Enquiry (**new customer**) | ⚠️ Fails (backend) | Flow is correct, but the New Customer save now returns a server error (see §5.0). The test surfaces it: `New-customer save failed (backend): …`. |
| TC-02B Create Enquiry (**existing customer, search & choose**) | ✅ Pass | Phone magnifier → `#searchModal` → search `#txtSearchBox` → pick result row → Assign To → item → `#btn-save-enquiry` → `/enquiry-overview/{id}`. |
| TC-03 Open enquiry | ✅ Pass | Opens the saved `/enquiry-overview/{id}`. |
| TC-04 Add Follow-up | ✅ Pass | `#btn-add-followup` → `#followupModal` → status + lead quality + save (`#btn-save-followup`). |
| TC-05 Verify follow-up | ✅ Pass | Counts rows in **Followup History** (`#followups li.crm-recent-activity-content`). |
| TC-06 Convert to Quotation | ✅ Pass | `#btn-create-quotation` → `/quotation/0/{id}` → `#btn-save-quotation`. |
| TC-07 Quotation listing | ✅ Pass | Listed in `/leads` (Type = Quotation). |
| TC-08/09/10 Status (In-Follow-Up/Won/Lost) | ✅ Pass | Each creates its **own fresh enquiry**, then records a follow-up with the mapped Followup Status (In-Follow-Up→Interested, Won→Got the business, Lost→Not interested). |
| TC-11 Enquiry listing | ✅ Pass | `/leads` listing (waits for AJAX rows). |
| TC-12 Lead Transfer | ✅ Pass | Transfer a lead to an executive; verify Current Assignee changed (`pages/LeadTransferPage.js`). |
| TC-13 Lead Sources (Settings) | ✅ Pass | `/lead-sources` → create source (`#lead-source` modal, maxlength 30) → verify it lists (`pages/LeadSourcesPage.js`). |
| TC-14 Lead Status (Settings) | ✅ Pass | `/lead-status` → create followup status + Nature (`#followup-status` modal) → verify it lists (`pages/LeadStatusPage.js`). |

**Key fixes applied:** correct URLs (`/leads`, `/enquiry`, `/enquiry-overview/{id}`, `/quotation/0/{id}`); real field IDs; AJAX form + overview-ready waits (`waitOverviewReady`); New-Customer-modal handling (`#btn-customer-save`); item-picker modal (`#searchItemModal`); follow-up modal (`#followupModal` → `#btn-save-followup`); **genuinely unique customer data per run — unique name, phone AND email** (the New Customer modal rejects duplicates of either); status transitions create their own un-converted enquiry (the Followup button disappears after conversion); `getAlertText` made non-blocking so a redirect-on-success no longer times the test out.
