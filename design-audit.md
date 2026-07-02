# TCB Dashboard — Design Audit (app source vs approved mockups v2 + owner standards)

Audited: `dashboard/` app source against `TCB-Dashboard-Mockups-v2.html` (20-page approved mockup set), the owner's design standards, and the locked KPI definitions (cross-checked against `TCB-Sales-System-Definition-and-Reporting-Spec.md` and `supabase/docs/sales.call.md`).

Snapshot: source as of 2026-07-02 17:26 (the app was being actively edited during the audit — `RangePicker`, `leadershipCloseRate`, `projectedCashByMonth`, and `?days=` threading landed mid-audit and ARE reflected below). All file paths relative to `/Users/katiebani/Documents/7FS/clients/the-credit-brothers/`.

Priorities:
- P1 = violates a stated standard, or a wrong/misleading number, or a definition mismatch
- P2 = mockup feature/page missing or materially weaker in the app
- P3 = polish

---

## P1 — Standard violations / wrong or misleading numbers / definition mismatches

**P1-1. "Calls booked" does not enforce the $25-paid gate that its own help text and the locked definition promise.**
`dashboard/lib/kpi.ts:13-15` — `booked` counts every `sales.call` with `type='strategy' and is_primary`; it never checks `booking_payment_id` (the column the Stripe $25 webhook fills, `dashboard/lib/sync/normalize.ts:250-254`). The UI states "Unique $25-paid strategy-call bookings" (`app/(app)/overview/page.tsx:39`), "Unique paid strategy-call bookings" (`app/(app)/funnel/page.tsx:38`), "Spend / unique paid bookings" (`app/(app)/marketing/page.tsx:40`), "Unique paid strategy-call bookings" (`lib/explore.ts:44`). Locked definition (spec line 67): "A $25 paid strategy call". Unpaid bookings count today — and `resolveCallType` (`lib/sync/normalize.ts:104-114`) defaults every unknown GHL calendar to `strategy`, so uncategorized calendars inflate Booked until an admin fixes them.
Fix: add `and c.booking_payment_id is not null` (or an explicit paid flag) to `booked`, `leadershipCloseRate`, `leakage`, and the `booked` explore query — or reword every "paid" help text until the gate ships, and default unknown calendars to a non-counting type.

**P1-2. Booked is counted by the ORIGINAL slot start, not the current event start date.**
`dashboard/lib/kpi.ts:15` filters on `c.scheduled_at`, which the schema doc defines as "Original event start" (`supabase/docs/sales.call.md`); `current_scheduled_at` is updated on every reschedule (`lib/sync/normalize.ts:191`) but no KPI uses it. Locked date-basis rule (spec lines 189-191): funnel-stage events count by "event start date (when the call happened), never booked/schedule date". A booking moved across a week/month boundary stays attributed to the abandoned original date. Same original-date basis at `lib/kpi.ts:50` (leadershipCloseRate), `lib/kpi.ts:63-64` (daily series), `lib/kpi.ts:103-104` (leakage window), `lib/explore.ts:63-65` (booked drill).
Fix: count and window Booked by `coalesce(c.current_scheduled_at, c.scheduled_at)` in all five places (or get the owner to re-lock the definition as original-slot basis).

**P1-3. "Deals won" counts zero-payment deals; the locked definition makes payment the bar.**
Spec line 71 (locked): "Closed-Won/Deal = marked Closed-Won AND >= 1 payment processed ... Payment is the bar, not contract-sign." The Sales Call form creates the deal with `deal_close_date = current_date` even when "Collected today" is 0 (`dashboard/lib/forms.ts:100-107`; zero-down is an explicit path, `app/(app)/forms/sales-call/form.tsx:64`), and `deals_won` counts every `sales.deal` row by close date with no payment check (`lib/kpi.ts:20-21`). Related inconsistency on the same Overview row: `deals_won` includes refunded deals while `booked_revenue_minor` excludes them (`lib/kpi.ts:20-23`), so a refunded deal stays in the count but vanishes from the revenue.
Fix: gate `deals_won` on `exists (select 1 from finance.successful_payment p where p.deal_id = d.id)` (or set `deal_close_date` only when the first payment lands) and apply the same refund treatment to count and revenue.

**P1-4. Delinquent flips at 15+ days late, not the locked "14+ days late".**
`dashboard/app/api/cron/receivables/route.ts:15` — `where status = 'late' and due_date < current_date - 14` leaves a receivable that is exactly 14 days past due marked "late"; the UI promises "Delinquent = 14+ days past due" (`app/(app)/receivables/page.tsx:26` and the help text at `:39`).
Fix: change the condition to `due_date <= current_date - 14`.

**P1-5. "Net of reversals" is displayed as a live number, but `finance.reversal` has no ingestion path and no drill-down.**
`dashboard/lib/kpi.ts:26-27` reads `finance.reversal`; nothing in the codebase ever writes to it — the Stripe normalizer handles only success events (`lib/sync/normalize.ts:232`), NMI only approved posts (`normalize.ts:264`), and no form or webhook records refunds/chargebacks. On real data "Net of reversals" (`app/(app)/overview/page.tsx:62-63`) will silently equal gross cash forever, and ROAS (`overview/page.tsx:24,66-67`, `marketing/page.tsx:41-43`) will ignore refunds. There is also no `reversals` entry in the drill registry (`lib/explore.ts`), so the number cannot be proven — violating the "numbers provable via drill-downs" standard (the widget links to `/explore/cash`, which shows only successful payments).
Fix: ingest `charge.refunded`/dispute events (Stripe) and NMI refunds into `finance.reversal`, add an `/explore/reversals` drill, and until then label the widget "no refund feed connected yet" instead of implying zero reversals.

**P1-6. The Overview daily charts contradict the headline KPIs on the same page.**
`dashboard/lib/kpi.ts:61-62` — the "Leads per day" series counts ALL `sales.opt_in` rows, while the headline filters `counts_as_unique` (`kpi.ts:11-12`); repeat submissions inside 30 days (flagged at insert, `lib/sync/normalize.ts:148`) appear in the chart but not the KPI, so the chart's sum exceeds the number directly above it (`app/(app)/overview/page.tsx:36` vs `:72-75`). Same drift class: the daily `booked` series (`kpi.ts:63-64`) omits the `not coalesce(c.is_duplicate,false)` filter the headline applies (`kpi.ts:15`) — inert today only because nothing ever sets `sales.call.is_duplicate` (the only writer touches `sales.report_submission.is_duplicate`, `lib/forms.ts:46-47`), which is itself a gap: the locked "exclude duplicate/double-bookings" rule (spec lines 67, 94) has no mechanism that ever marks a call duplicate.
Fix: add `counts_as_unique` and the duplicate filter to `dailySeries`, and build (or explicitly descope) the thing that sets `sales.call.is_duplicate`.

**P1-7. The admin "Counts as booked" toggle does not actually affect the Booked KPI — a control that doesn't do what it says.**
`app/(app)/admin/calendars/editor.tsx:17-19` promises "whether its bookings count in the funnel numbers", with the yes/no button at `:47-50`. But `isBooking` is only used to gate the Close stage push (`lib/sync/normalize.ts:113,178-179`); calls from a strategy-type calendar with `is_booking = no` are still created as `type='strategy', is_primary` (`normalize.ts:121-123`) and the call row stores no calendar reference, so `booked` (`lib/kpi.ts:13-15`) cannot exclude them. Violates the "working buttons" standard and quietly inflates a locked KPI.
Fix: persist the calendar (or an `counts_in_funnel` flag) on `sales.call` at ingest and filter the Booked/leakage queries on it.

**P1-8. Widgets that are not clickable — violates "every widget should be clickable".**
All Stat cards drill correctly (every `Stat` carries an `href`), but these widgets have no click target:
- `app/(app)/overview/page.tsx:71-85` — the three "Daily activity" chart cards (leads/day, booked vs taken/day, cash/day)
- `app/(app)/marketing/page.tsx:46-50` — "Spend per day" chart card
- `app/(app)/funnel/page.tsx:55-59` — "Reschedules per day" chart card
- `app/(app)/funnel/page.tsx:75-86` — "Cancellation & reschedule reasons" rows (drills exist: `/explore/cancellations`, `/explore/reschedules`)
- `app/(app)/funnel/page.tsx:87-99` — "Objections raised on calls" rows; the `/explore/objections` drill is fully built (`lib/explore.ts:264-285`) but linked from NOWHERE in the app
- `app/(app)/receivables/page.tsx:42-57` — "Projected cash by month" rows (drill exists: `/explore/receivables?arg=scheduled`)
- `app/(app)/calls/page.tsx:26-67` — both tables: no drill links and no Close deep-links on contacts (the explore drills all carry a "Open in Close" column, `lib/explore.ts:17-20`; these tables do not).
Fix: give each chart `Card` an `href` to its matching drill and link table rows (reason -> filtered drill, objection -> `/explore/objections`, contact -> Close lead URL).

**P1-9. Primary button contrast fails WCAG AA — violates "good contrast".**
`dashboard/app/globals.css:43-51` — `.btn` renders white text on `--accent` #4f8ef7: measured 3.21:1 (AA requires 4.5:1 at this size: 0.875rem/600). This is the main CTA everywhere (Sign in, Submit report, Add user, Manage users, Log a call outcome).
Fix: darken the button background to #2563eb (5.17:1 — and it is the mockup's own accent blue, mockup line 11) or switch to dark ink text on the light accent (5.87:1).

---

## P2 — Mockup features/pages missing or materially weaker

**P2-1. 8 of the 20 mockup pages have NO app equivalent, and the Reports hub is missing 1 of its 4 report types.**
Missing outright: **Email**, **Setters**, **Sales Projections**, **Refunds**, **Commissions** (as a page — only an "Est. commission" column exists on Reps), **Team Health**, **Retention**, **Lead Scoring**. Of these, the mockup itself tags Email / Lead Scoring / most of Team Health "Needs capture" (absence defensible for v1), but **Setters** (Calls Booked + Show Rate tagged Live), **Sales Projections**, **Refunds** (Chargebacks tagged Live), and **Commissions** are mockup pages the client saw with Live/Needs-fix tags and no instrumentation excuse. The Forms index (`app/(app)/forms/page.tsx:5-9`) covers Sales Call / Missed Call / Post-Call but not the mockup's **Commission Report** ("Weekly. Required to get paid via Gusto", mockup line 586).
Fix: build Setters, Projections, Refunds, and Commissions pages next (data models already exist for most), add a Commission Report form, and park Email/Lead Scoring/Retention behind explicit "needs instrumentation" placeholders so the client sees the roadmap the mockups promised.

**P2-2. No period-comparison deltas anywhere.**
The mockup's flagship Weekly Snapshot has a "Compare vs last week" chip and an up/down delta on every KPI card (mockup lines 151-160). The app has a range picker now (`components/range-picker.tsx`) but zero compare-to-previous-window computation or delta rendering on any Stat.
Fix: compute each KPI for the preceding window of equal length and render a delta line in `Stat`.

**P2-3. Charts are materially weaker than the approved mockups.**
The app's only chart primitive is `MiniBars` — an unlabeled sparkline with no axes, values, or legend (`dashboard/components/ui.tsx:64-82`, hover reveals values only via SVG title). The mockups the client approved use labeled Chart.js charts throughout: the funnel bar (line 614), the conversion-chain line (621), stacked new-vs-residual cash (615-617, 666), and donuts for booked-vs-taken, cancellation reasons, outcome split, PIF-vs-plan, and processor split (635-636, 644, 649, 667). New-vs-residual is already derivable from `finance.successful_payment.type` (pif/deposit vs installment) — no new data needed.
Fix: add one real chart component (axis labels + legend) and ship the four highest-value mockup charts: funnel steps, conversion chain, new-vs-residual cash, booked-vs-taken.

**P2-4. Mockup KPI widgets missing on pages that DO exist** (all buildable from data already captured):
- **Qualified Opt Ins** (Snapshot card, mockup 153; locked definition spec line 68): `sales.opportunity.qualified` is already set false on DQ (`lib/forms.ts:141`) — no widget anywhere.
- **Appointments tile row** (mockup 263-271): Appts Created / Scheduled / Intake Forms Submitted / Intake Forms Needed / Cancelled / On Calendar / Taken — the app has booking-level leakage stats but no slot-level tiles, and intake counts appear nowhere although `credit.intake_submission` is written on every intake webhook (`lib/sync/normalize.ts:154-160`).
- **Show / No-Show / Reschedule rate cards on the Funnel page** (mockup 272-277): Overview has Show rate only; the funnel page shows counts, not rates.
- **Opportunities cards + aging** (mockup 336-350): Open / In Follow-up / Won / Lost cards and Hot (<=7d) / Warm (<=21d) / Cold (30d+) aging buckets — app has stage bars only.
- **Deals page KPIs** (mockup 359-370): All Deals / Revenue / New Cash Upfront / AOV-revenue / AOV-cash cards and the PIF-vs-payment-plan split — `/explore/deals` is a raw list.
- **Closers**: DQ-at-closing card (mockup 383), close-rate and cash-trend charts (395-396) — Reps has the leaderboard only.
- **Cash Collected**: New Cash vs Residual Cash cards (mockup 457-458) and by-processor split (463).
- **Receivables**: Collected + Collection Rate cards (mockup 476-478) — `receivablesSummary` already computes `paid_minor` (`lib/kpi.ts:163`) but the page never displays it; no delinquency trend (mockup 483).
- **Objections**: "Offers Made" (mockup 409) — `offer_made` is captured on every sales-call submission (`lib/forms.ts:81`) and never displayed anywhere (the spec flags this exact gap `[FIX]`, line 70); loss-rate percent per objection, first-call vs follow-up close rate, time-to-close (mockup 414-419).
Fix: each bullet is a Stat/summary-query pair on an existing page — prioritize Qualified, the Appointments tiles, Collected/Collection Rate, and Offers Made.

**P2-5. Setter metrics are absent even though the setter role exists in the product.**
`lib/access-rules.ts:14-16` defines a setter role (sees Calls + Forms), and `repPerformance` includes setters (`lib/kpi.ts:243`) — but every metric in it is closer-shaped (taken/closed/cash). No booked-per-setter, no speed-to-lead, no confirm rate, no DQ-at-setting (mockup Setters page, lines 309-327; spec line 127 calls for setter attribution).
Fix: add setter attribution on bookings (setter rep id on `sales.call`) and a Setters section on Reps or its own page.

**P2-6. Today's calendar hides rescheduled-away slots — the mockup deliberately keeps them visible.**
Mockup lines 290-299 (with the help tip at 290): "Five booked for today, three rescheduled away. The rescheduled slots stay on today's count" — the reschedule-leak rows are the point of the widget. The app's `upcomingAppointments` filters `a.is_current` only (`lib/kpi.ts:139`), so a slot rescheduled away from today disappears from the Calls list entirely.
Fix: include today's non-current `rescheduled` slots in the query and render them with the warn badge so the daily leak is visible, as approved.

---

## P3 — Polish

**P3-1. InfoTip uses the native `title` attribute** (`dashboard/components/ui.tsx:28-38`): roughly 1-2s hover delay, invisible on touch devices, unstyled — the approved mockup ships an instant styled tooltip (mockup lines 66-68). Fix: replace `title` with the mockup's CSS hover/focus tooltip pattern.

**P3-2. View-as banner text is 4.27:1** (accent text on 22 percent accent-tint background, `app/(app)/view-as.tsx:27-29`) — just under AA 4.5:1 at 12px/600. Fix: use `var(--text)` for the sentence and keep accent for the name only.

**P3-3. Explore caption inaccuracies** (`app/(app)/explore/[metric]/page.tsx:34`): the page prints "Last N days" for every drill, but the `stage` and `receivables` queries ignore the days parameter entirely (`lib/explore.ts:213-219, 232-242`); and "Showing the most recent 500" is wrong for receivables, which sorts by due date ascending (earliest due first). Fix: let each ExploreDef declare whether it is windowed and print captions from that.

**P3-4. The leads drill defaults to ALL submissions while the KPI counts unique only** (`lib/explore.ts:35-40`): the row count will not match the headline it is meant to prove; a "Unique" column exists but the default set differs. Fix: default the drill to `counts_as_unique` rows with a "show repeats" toggle.

**P3-5. Headline windows and daily charts use different day boundaries**: headlines window on `now() - N days` with no timezone bucketing (`lib/kpi.ts:9`), charts bucket calendar days in the report timezone (`lib/kpi.ts:58-62`) — edge-day drift between a card and the chart under it. Fix: derive `since` from the report-timezone midnight.

**P3-6. `money()` truncates cents** (`dashboard/lib/format.ts:2-9`, maximumFractionDigits 0) while installments carry cents (`lib/forms.ts:115` rounds the split): displayed rows may not sum to displayed totals. Fix: show cents on receivables/payment rows (`{ cents: true }` already exists).

**P3-7. "Cancellation & reschedule reasons" blends both populations** (`lib/kpi.ts:119-127` includes `rescheduled`): the mockup separates the cancellation-reason donut from the reschedule panel (mockup 280-288), and reschedule volume will drown cancellation reasons in one table. Fix: add a "Type" column or split into two tables.

**P3-8. Connections page ends in a dense bullet block** ("How each connection works", `app/(app)/connections/page.tsx:114-123`) — admin-only, but the minimal-text standard prefers per-row (i) tooltips or a collapsible. Fix: fold each provider's how-to into an InfoTip on its table row.

**P3-9. NMI normalizer dead conditional** (`lib/sync/normalize.ts:285-286`): `${receivable ? "installment" : "installment"}` — both branches identical, so matched and unmatched payments are indistinguishable by type. Fix: type unmatched payments distinctly (e.g. `unmatched`) or drop the ternary.

---

## Standards that PASS (verified, for completeness)

- **No emojis**: full grep of `app/`, `components/`, `lib/` found none. The two U+25B2/U+25BC triangles are text-glyph reorder buttons in `app/(app)/admin/options/editor.tsx:23-25` (same glyphs the approved mockup uses for deltas) — compliant.
- **Demo mode**: obviously-fake data mode with a persistent banner (`app/(app)/layout.tsx:45-50`), admin toggle in Settings, and `is_demo` filtered in every query (`lib/kpi.ts:3`).
- **Nothing stripped / multiple logins**: users, roles, per-page access overrides, password reset, and admin view-as-user preview all present (`app/(app)/admin/users/editor.tsx`, `app/(app)/view-as.tsx`).
- **Locked definitions correctly implemented**: Taken by event start date (`lib/kpi.ts:16-17`); Closed-Won by deal-close date (`kpi.ts:20-21`); Cash collected gross excluding the $25 fees (`kpi.ts:24-25`, help text `overview/page.tsx:60-61`); Reschedule counted when a slot moves, status=rescheduled, and a rebooked no-show counts as recovery not reschedule (`kpi.ts:30-31`, `lib/sync/normalize.ts:182-192,210-213`); commission 10 percent base / 15 percent at 33.3 percent+ rolling 14-day close rate, with the estimate explicitly disclaimed against payroll (`kpi.ts:225-237`, `reps/page.tsx:23,39,42`); leadership close rate = deals / all bookings (`kpi.ts:39-53`, matches spec "Full-funnel: Closes / Booked").
- **Contrast elsewhere is strong**: body text 14.7:1, muted text 7.9-8.5:1, badges 4.7-8.5:1, demo banner 7.9:1 (only the two failures listed at P1-9 / P3-2).
- **Buttons wired**: every form uses server actions with pending/disabled states and inline success/error output (forms, settings, admin editors, login, logout, backfill, GHL controls).

---

## Coverage table — mockup page to app page

| # | Mockup page | App equivalent | Status | Main gaps |
|---|---|---|---|---|
| 1 | Weekly Snapshot | /overview | partial | No week-vs-week compare or deltas; no funnel/cash charts; pipeline-value + projected-30d cards live on /receivables, not the leadership view |
| 2 | Funnel Overview | /overview + /marketing | partial | No spend-to-cash step chart, no per-step dollar leak, no conversion-chain chart |
| 3 | Opt Ins & Leads | /explore/leads | partial | Row list only — no paid-vs-organic, source, goal, or credit-score-range breakdowns |
| 4 | Ads & Attribution | /marketing | partial | No CPC/CTR, no ROAS-invoiced, campaign table lacks booked/closed/ROAS columns (needs Dub attribution, flagged in mockup) |
| 5 | Email | — | missing | Mockup tags it Needs capture (email-platform instrumentation) |
| 6 | Appointments & Leakage | /funnel + /calls | partial | No slot tile row, no intake-form counts, no show/no-show/reschedule-rate cards, rescheduled-away slots hidden from today (P2-6) |
| 7 | Setters | — | missing | Setter role exists but zero setter metrics (P2-5) |
| 8 | Opportunities | /funnel (stage bars + stage drill) | partial | No open/follow-up/won/lost cards, no hot/warm/cold aging |
| 9 | Deals | /explore/deals | partial | List only — no AOV/new-cash-upfront cards, no PIF-vs-plan split, no per-closer chart |
| 10 | Closers | /reps | partial | Leaderboard + tier + est. commission covered; no DQ-at-closing, no charts |
| 11 | Objections & Calls | /funnel (objections table) | partial | Raised/led-to-loss only; no offers-made, loss-rate percent, follow-up close rate, time-to-close; drill built but unlinked (P1-8) |
| 12 | Sales Projections | — | missing | No close-confidence capture anywhere |
| 13 | Cash Collected | /overview cash stats + /explore/cash | partial | No new-vs-residual split, no by-processor view, no monthly stacked chart |
| 14 | Receivables | /receivables | partial | Closest match (adds per-month projection); missing Collected + Collection Rate cards and delinquency trend |
| 15 | Refunds | — | missing | Also no reversal ingestion at all — see P1-5 |
| 16 | Commissions | /reps (one column) | partial | No owed/paid/pending-approval workflow, no residual split, no payout status, no clawback |
| 17 | Team Health | — | missing | Mockup tags speed-to-lead + report-submission Needs capture; report_submission data is already being written (`lib/forms.ts:42-55`), so on-time rate is buildable |
| 18 | Retention | — | missing | `delivery.fulfilment` rows are created on every close (`lib/forms.ts:133-135`) but have no UI |
| 19 | Lead Scoring | — | missing | Mockup tags it Needs capture (NAFA violation count) |
| 20 | Reports | /forms | partial | 3 of 4 report types; Commission Report form absent (P2-1) |

Score: 0 of 20 mockup pages fully covered, 12 partial, 8 missing. The app's drill-down explore layer (13 registered drills, all with Close deep-links) is a genuine capability the mockups only implied — the gaps above are breadth (pages, charts, compare) and the nine P1 correctness items.
