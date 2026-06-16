# CRM Dashboard — Test Cases

> **Page:** CRM → Dashboards → CRM (`/crm-dashboard`)
> **Tenant:** `lesol_test` · **Objective:** verify data integrity, functional correctness, and filter synchronization — *dashboard totals = sum of executive rows = drilled-down inner lead lists.*
> **Legend:** DSH-G = global filters · DSH-A = matrix/sum integrity · DSH-B = drill-down counts · DSH-C = persistence/sync · DSH-M = metric formulas · DSH-E = edge/negative.
>
> **Pre-conditions for every case:** logged in as `admin`@`lesol_test`; on `/crm-dashboard`; the dashboard has loaded (no spinner). Default period is **This Month**.

---

## 0. Global Filters — Baseline Functional

| Test Case ID | Component/Section | Description | Steps to Execute | Expected Result |
|---|---|---|---|---|
| DSH-G-01 | Branch filter | Branch dropdown has the correct options | 1) Open the Branch filter | Options exactly: **All Branch, Kannur, Kasargod**. No duplicates/blanks. |
| DSH-G-02 | Executive filter | Executive dropdown has the correct options | 1) Open the Executive filter | Options exactly: **All Executives, You, Arshida, Biju, JASEEM, NABEEL, Shaju Ummar, SHAMAL, SIRAJ, VIGNESH**. |
| DSH-G-03 | Period filter | Period dropdown has the correct options & default | 1) Inspect Period filter on load | Default = **This Month**; options: Choose, Today, Yesterday, This Week, This Month, This Year, Previous Month, Previous Year, Custom. |
| DSH-G-04 | Default load state | Dashboard loads with default filters applied | 1) Open `/crm-dashboard` fresh | Loads with Branch=All, Executive=All, Period=This Month; all sections populate with data (no errors/empty). |
| DSH-G-05 | Apply Filter | Changing a filter only takes effect on **Apply Filter** | 1) Change Branch to Kannur 2) Do NOT click Apply 3) Observe 4) Click **Apply Filter** | Data does not change until Apply is clicked; after Apply all sections refresh for Kannur. |
| DSH-G-06 | Clear filter | Clear resets all filters to defaults | 1) Set several filters 2) Click **Clear** | All filters reset to defaults (All/All/This Month) and data reloads accordingly. |
| DSH-G-07 | Sales View toggle | Toggling Sales View changes the view/metrics | 1) Note Leads Summary 2) Toggle **Sales View** ON/OFF 3) Apply | View switches between summarized and detailed; metrics recompute consistently; no JS errors. |
| DSH-G-08 | Custom period | Custom shows date pickers and validates range | 1) Period = Custom 2) Pick From > To | Date inputs appear; From-after-To is rejected/blocked with a clear message; valid range applies. |

---

## Task A — Matrix Filter Combination & Sum Integrity

> **Core rule (all A cases):** for the active filter combination, the **sum of the Executive-Wise table "Total" column = the "Total" badge in Leads Summary**, and each status sub-column summed across executives = the matching Leads-Summary status badge. The Follow-up Summary row must equal the sum of the table's Today/Delayed/Upcoming columns.

| Test Case ID | Component/Section | Description | Steps to Execute | Expected Result |
|---|---|---|---|---|
| DSH-A-01 | Branch+Exec+Period | Kannur + Arshida + This Week | 1) Branch=Kannur, Executive=Arshida, Period=This Week 2) Apply 3) Read Leads Summary "Total" 4) Read Arshida's row "Total" in Executive table | Executive table shows **only Arshida**; her row "Total" == Leads Summary "Total" == Follow-up Summary "Total Leads". All status badges == Arshida's matching sub-columns. |
| DSH-A-02 | AllBranch+Exec+Custom | All Branches + Specific Executive + Custom range | 1) Branch=All, Executive=Biju, Period=Custom (e.g. 1st–15th) 2) Apply | Table shows only Biju (across both branches); Biju's row totals == Leads Summary == Follow-up Summary for that date range. |
| DSH-A-03 | Branch+AllExec+ThisYear | Specific Branch + All Executives + This Year | 1) Branch=Kasargod, Executive=All, Period=This Year 2) Apply 3) Sum the table "Total" column across all executive rows | **Σ(executive "Total") == Leads Summary "Total"** for Kasargod/This Year. Each status: Σ(sub-column) == matching status badge. |
| DSH-A-04 | Baseline | All + All + This Month consistency | 1) Defaults 2) Apply 3) Sum Total column; sum each status column | Σ of every executive column == the corresponding Leads-Summary badge (Total, Won, Lost, New, Not Connected, Not Reachable, Cold, Warm, Hot). |
| DSH-A-05 | Follow-up sum | Follow-up Summary == table follow-up columns | 1) Any combination 2) Apply | Follow-up Summary: **Leads in Follow-up = Σ(table "Leads in Follow-up")**; Today = Σ(Today); Delayed = Σ(Delayed); Upcoming = Σ(Upcoming). |
| DSH-A-06 | Branch switch parity | Kannur + Kasargod totals = All Branch total | 1) Record All-Branch Total 2) Record Kannur Total 3) Record Kasargod Total (same Exec & Period) | **Kannur + Kasargod == All Branch** for Total and every status badge. |
| DSH-A-07 | Executive switch parity | Σ(each executive alone) = All Executives total | 1) For fixed Branch+Period, record Total for each executive individually 2) Record All-Executives Total | Σ(per-executive Totals) == All-Executives Total (and per status). |
| DSH-A-08 | Period switch | Previous Month vs This Month differ correctly | 1) Period=This Month, note counts 2) Period=Previous Month, note counts | Counts change to the selected period; no carry-over; sums still satisfy DSH-A-04 within each period. |
| DSH-A-09 | Empty combination | Executive with no leads in period → zeros | 1) Pick an executive/branch/period with no data 2) Apply | All badges & that executive row show **0** (and value ₹0); no error, no spinner-hang, "no data" handled gracefully. |
| DSH-A-10 | Value (₹) integrity | Pipeline/Won value sums match | 1) Any combination 2) Compare Leads-Summary "Pipeline Value" / Won value to Σ of corresponding executive values | Monetary totals reconcile (Σ executive values == summary value); currency/format consistent. |
| DSH-A-11 | Sales View on parity | Sum rule holds with Sales View ON | 1) Toggle Sales View ON 2) Apply a combination 3) Re-check DSH-A-04 sums | Sum integrity still holds in Sales View; any extra sales metrics are internally consistent. |

---

## Task B — Drill-Down Click-Through (Outside vs Inside Counts)

> **Core rule (all B cases):** clicking a status badge/number opens the **Inner Lead List**, and the dashboard card count must **exactly equal** the inner page's total row/record count for the same active filters.

| Test Case ID | Component/Section | Description | Steps to Execute | Expected Result |
|---|---|---|---|---|
| DSH-B-01 | Won badge | Won count matches inner list | 1) Note "Won" count = N 2) Click the Won badge | Redirects to Inner Lead List filtered to Won; inner total rows == **N**. |
| DSH-B-02 | Lost badge | Lost count matches | 1) Note "Lost" = N 2) Click Lost | Inner list shows exactly N Lost leads. |
| DSH-B-03 | New badge | New count matches | 1) Note "New" = N 2) Click New | Inner list shows exactly N New leads. |
| DSH-B-04 | Not Connected | Not Connected count matches | 1) Note value = N 2) Click | Inner list shows exactly N. |
| DSH-B-05 | Not Reachable | Not Reachable count matches | 1) Note value = N 2) Click | Inner list shows exactly N. |
| DSH-B-06 | Cold badge | Cold count matches | 1) Note Cold = N 2) Click | Inner list shows exactly N Cold leads. |
| DSH-B-07 | Warm badge | Warm count matches (example: 6) | 1) Note Warm = N (e.g. 6) 2) Click Warm | Inner list shows exactly N (6) Warm leads — count parity. |
| DSH-B-08 | Hot badge | Hot count matches | 1) Note Hot = N 2) Click | Inner list shows exactly N Hot leads. |
| DSH-B-09 | Total badge | Total drill-down matches | 1) Note Total = N 2) Click Total | Inner list shows exactly N leads (all statuses). |
| DSH-B-10 | Value parity | Inner list value total matches card value | 1) Click a status with a ₹ value 2) Sum/Read inner list value | Inner page aggregate value == dashboard card value for that status. |
| DSH-B-11 | Executive cell drill | Clicking an executive's status cell matches | 1) In Executive table, click Arshida's "Warm" cell (if interactive) | Inner list filtered to Arshida+Warm; count == that cell's number. |
| DSH-B-12 | Follow-up drill | Today/Delayed/Upcoming drill-down matches | 1) Click "Delayed" in Follow-up Summary | Inner follow-up list count == Delayed number on the card. |
| DSH-B-13 | Zero-count drill | Zero badge opens empty list (no error) | 1) Find a status showing 0 2) Click it | Inner list opens with 0 records / "no data"; no crash. |
| DSH-B-14 | Round-trip parity | Count is stable across drill + return | 1) Note N 2) Drill in 3) Return 4) Re-read N | Dashboard count unchanged after returning (no recount drift). |

---

## Task C — Filter Persistence & Synchronization

| Test Case ID | Component/Section | Description | Steps to Execute | Expected Result |
|---|---|---|---|---|
| DSH-C-01 | Cross-page inheritance | Inner list inherits dashboard filters | 1) Dashboard: Branch=Kannur, Executive=Arshida, Period=This Month, Apply 2) Click "Hot Leads" | Inner Lead List opens pre-filtered to **Kannur + Arshida + This Month + Hot**; only matching records shown; filter chips/inputs reflect those values. |
| DSH-C-02 | Inherited count parity | Inherited filters yield matching count | 1) Continue DSH-C-01 | Inner Hot count == dashboard Hot count for Kannur/Arshida/This Month (combines Task B + C). |
| DSH-C-03 | Back navigation | Dashboard retains filters after Back | 1) From the inner list (DSH-C-01) press browser **Back** | Dashboard still shows Kannur + Arshida + This Month with the same data; filters not reset to defaults. |
| DSH-C-04 | Filter chip accuracy | Inner page shows the inherited filters explicitly | 1) Drill from a filtered dashboard | Inner page's filter controls/chips display the exact Branch/Executive/Period/Status carried over. |
| DSH-C-05 | Change after drill | Changing inner filter doesn't corrupt dashboard | 1) Drill in 2) Change a filter on inner page 3) Back | Dashboard retains its ORIGINAL filters (inner-page change does not leak back), unless product spec says otherwise. |
| DSH-C-06 | Refresh persistence | Filters survive a page refresh (if designed to) | 1) Apply filters 2) Refresh `/crm-dashboard` | Either filters persist (URL/query/state) or cleanly reset to defaults — define & verify the intended behavior; no broken half-state. |
| DSH-C-07 | Period→drill consistency | Period carries into drill-down | 1) Period=Previous Year, Apply 2) Drill a status | Inner list scoped to Previous Year; count matches the Previous-Year card value. |
| DSH-C-08 | All vs specific carry | "All" filters carry as "All" | 1) Branch=All, Executive=All, drill a status | Inner list is not silently narrowed; shows all branches/executives for that status. |

---

## Task M — Metric Formula Consistency (Leads Summary)

> Verify each ratio is internally consistent with the underlying counts for the active filter. Confirm the exact denominator with the product owner; the table states the assumed formula.

| Test Case ID | Component/Section | Description | Steps to Execute | Expected Result |
|---|---|---|---|---|
| DSH-M-01 | Win Rate % | Win Rate reconciles with counts | 1) Read Won, Lost, Total 2) Read Win Rate % | Win Rate == Won / (Won+Lost) (or Won/Total per spec) × 100, rounded as displayed. |
| DSH-M-02 | Conversion Rate % | Conversion reconciles | 1) Read Won & Total | Conversion Rate == Won / Total × 100. |
| DSH-M-03 | Lost Rate % | Lost rate reconciles | 1) Read Lost & Total/(Won+Lost) | Lost Rate == Lost / (Won+Lost or Total) × 100; Win%+Lost% consistent. |
| DSH-M-04 | Pipeline Value | Pipeline value = open leads' value | 1) Read Pipeline Value | Equals Σ value of non-Won/non-Lost (active) leads for the filter. |
| DSH-M-05 | Active Pipeline Ratio % | Ratio reconciles | 1) Read active vs total | == active leads / total × 100. |
| DSH-M-06 | Hot Lead Ratio % | Hot ratio reconciles | 1) Read Hot & Total | == Hot / Total × 100; matches Hot badge / Total badge. |
| DSH-M-07 | Rounding | Percentages round consistently | 1) Compare displayed % to computed | Rounding rule consistent across all metrics (e.g. 1 decimal); no 100.1% / negative values. |

---

## Task E — Edge & Negative Cases

| Test Case ID | Component/Section | Description | Steps to Execute | Expected Result |
|---|---|---|---|---|
| DSH-E-01 | No-data period | Period with zero leads | 1) Pick an empty period 2) Apply | All cards/table show 0 & ₹0; "no data" state; no spinner hang or JS error. |
| DSH-E-02 | Custom invalid range | From later than To | 1) Custom: From=20th, To=1st | Blocked/validated with message; no malformed query sent. |
| DSH-E-03 | Rapid filter changes | Race conditions | 1) Quickly change Branch/Exec/Period and Apply repeatedly | Final state matches last Apply; no stale data flashes / mismatched sums. |
| DSH-E-04 | Executive with leads in one branch only | Branch scoping | 1) Filter a branch where an exec has 0 leads | That exec row shows 0; switching to the other branch shows their leads. |
| DSH-E-05 | Large dataset (This Year/All) | Performance & accuracy | 1) Branch=All, Exec=All, Period=This Year | Dashboard loads within acceptable time; sums still reconcile (DSH-A-04). |
| DSH-E-06 | Backend error resilience | Intermittent API failure | 1) Apply during a known-flaky window | On API error, a clear error is shown (not a perpetual spinner or wrong/zero counts); retry recovers. |
| DSH-E-07 | Sales View parity | ON vs OFF totals agree | 1) Record Total with Sales View OFF 2) Toggle ON | Underlying lead Totals identical; only presentation/extra sales metrics differ. |

---

## ✅ Live Verification Results (automated run — `verify_dashboard.js`)

Run against `lesol_test` in a healthy window. Dashboard filters: `#dashboard-filter-branch`, `#dashboard-filter-executives`, `#dashboard-filter-month`. Executive table has a **footer "Total" row** (the dashboard's own column sums).

**Task A — Sum integrity (PASS):** for every combination tested, each Leads-Summary badge == Σ(executive column) == footer total, for all 9 statuses (Total, Won, Lost, New, Cold, Warm, Hot, Not Connected, Not Reachable):

| Combination | Total | Result |
|---|---|---|
| All Branch · All Executives · This Month | 42 | ✅ 9/9 |
| All Branch · All Executives · This Week | 28 | ✅ 9/9 |
| Kannur · All Executives · This Month | 29 (7 exec rows) | ✅ 9/9 |
| All Branch · All Executives · This Year | 477 | ✅ 9/9 |

**Executive filter (PASS):** selecting **Arshida** reduces the executive table to a single row (`["Arshida"]`) — the filter does apply (confirmed via the standalone probe).

**Task B — Drill-down count parity (PASS):** clicking the **"Warm 6"** badge navigates to `/leads?...&nature=2&period-type=4&is-sales-view=True...` and the inner Leads list shows **exactly 6 rows** = the badge count. ✅

**Task C — Filter inheritance (CONFIRMED):** the drill-down URL carries the dashboard filters as query params — `branch`, `executive`, `period-type`, `nature`, `is-sales-view`, `status-id`, `added-by`, etc. — so the inner Leads list **inherits** the dashboard's Branch/Executive/Period/Status. (Back-navigation retention — DSH-C-03 — to be confirmed manually.)

**Implementation notes for automation:**
- Status badges are `<div>`s with JS click handlers that navigate to `/leads?…` (not `<a>` tags) — click them by text, then read the resulting `/leads` row count.
- The exec table has a 2-row header (group + leaf); align data cells to the **leaf** header row, offset by +1 for the "Executive Name" column.
- Reusable checker: `node verify_dashboard.js` (loops filter combos and prints the reconciliation).

---

## Notes / Known Risks (from prior testing)
- **Backend instability (see `CRM_MODULE_DOCUMENTATION.md` §5.0):** the tenant intermittently returns server errors / slow loads (the dashboard may hang on a spinner). Run dashboard data-integrity checks **only in a healthy window**, and treat a perpetual spinner or all-zero data as an environment failure (DSH-E-06), not a data-integrity bug.
- The dashboard is a JS SPA; counts load via AJAX — wait for full render before reading values.
- Confirm the exact **denominator** for each % metric (Total vs Won+Lost) with the product owner before asserting DSH-M cases.
