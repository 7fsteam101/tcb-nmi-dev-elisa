# The Credit Brothers — Sales Metrics Clarity & Attribution Spec

**Client:** The Credit Brothers (Josh & Chris Steil)
**Engagement:** Give them clarity on their sales metrics, what levers to pull to make more money, and how to manage their marketing budget better.
**Author:** 8 Figure Systems
**Date:** 2026-06-23
**Status:** Scope / definition (NOT yet built — no live systems connected). This doc defines the metric model, the source-of-truth map, the attribution logic, the levers, and the error-handlers the reporting system must implement.

> `[CONFIRM]` = a value/assumption to verify with the client before build. Nothing here is invented as fact.

---

## 1. The offer & funnel (what we're measuring)

A **high-ticket, paid-tripwire, book-a-call funnel** for a **one-off** credit-optimization program ("Backdoor Credit Reset" / BDCR).

```
Meta ad ─► Landing page / quiz ─► Lead (form) ─► PAY $25 to book a Strategy Call
        ─► Strategy Call scheduled ─► Show ─► Sales call (closer) ─► Offer made
        ─► Closed-Won ─► Backend payment via NMI (one-off, likely payment plan)
        ─► Fulfilment / refund / chargeback
```

Key structural facts that shape every metric:
- **One-off offer** → north-star is **cash collected per acquisition + CAC payback**, NOT MRR/LTV.
- **$25 paid booking** → the "booked call" event is *also a payment* (a real intent filter + a revenue line that offsets CAC).
- **One-off but high-ticket** → almost certainly sold on **payment plans via NMI**, so *booked revenue ≠ collected revenue*. The model must separate the two.
- Credit repair is **high-risk** for payments → that's why **Stripe only touches the $25** and **NMI carries all real program revenue.**

---

## 2. The core problem (why they lack clarity today)

One buyer physically passes through **six disconnected systems**, and **no single one sees the whole journey**:

| # | System | Holds |
|---|--------|-------|
| 1 | **Meta** | Spend, leads (top of funnel) |
| 2 | **GHL — Marketing acct** | Forms, calendars, lead capture, show/no-show |
| 3 | **Stripe** | The $25 booking payment (front end only) |
| 4 | **Close** | Sales pipeline, call outcomes, closed-won, deal value |
| 5 | **NMI (Network Merchants)** | Backend cash, payment plans, defaults, chargebacks |
| 6 | **GHL — Fulfilment acct** | Delivery, refunds, cancellations |
| — | **Cloudflare Workers** | Custom code that syncs between them (the join layer) |

**The #1 gap: no click-level tracking.** UTMs / `fbclid` are (likely — `[CONFIRM]`) **not captured at the GHL form**, so there is no key linking a closed NMI sale back to the Meta ad that produced it. Consequence: they can only see Meta's own report (cheap leads, CPL) and are forced to **manage the budget on CPL instead of ROAS** — i.e. optimizing for cheap leads, not buyers. **Fixing tracking is prerequisite #1; until it exists, every "lever" recommendation is a guess.**

---

## 3. The metric model

### 3.1 North-star metrics (one-off offer)

| Metric | Definition | Source |
|--------|-----------|--------|
| **Blended ROAS (MER)** | Total cash collected ÷ total ad spend | NMI + Stripe ÷ Meta |
| **CAC (cost per sale)** | Ad spend ÷ closed-won sales | Meta ÷ Close |
| **CAC payback** | Days until collected cash per cohort ≥ its CAC (matters because of payment plans) | NMI vs Meta |
| **Contribution margin / sale** | Avg cash collected − CAC − delivery cost | NMI − Meta − `[CONFIRM delivery cost]` |
| **Collected vs Booked %** | Cash collected to date ÷ contract value sold (payment-plan health) | NMI ÷ Close |

### 3.2 Volume metrics (the funnel counts)

| Metric | Source | Grain |
|--------|--------|-------|
| Ad spend, impressions, clicks, CTR, CPM | Meta | campaign / ad set / ad / day |
| Leads (form submits) | GHL Marketing | per lead |
| $25 bookings (paid strategy calls) | Stripe (+ GHL calendar) | per booking |
| Calls scheduled / showed / no-show | GHL Marketing calendar (→ Close) | per appointment |
| Offers made (pitched) | Close | per opportunity |
| Closed-won + contract value | Close | per opportunity |
| Backend payment captured (1st payment) | NMI | per transaction |

### 3.3 Conversion rates (where the leaks are)

| Rate | Formula |
|------|---------|
| Click → Lead (LP conversion) | Leads ÷ Clicks |
| Lead → Booked ($25) | $25 bookings ÷ Leads |
| Booked → Show | Shows ÷ Bookings |
| Show → Close (close rate) | Won ÷ Shows |
| Offer → Close | Won ÷ Offers made |
| **Lead → Sale (overall)** | Sales ÷ Leads |

### 3.4 Money & efficiency metrics (the budget layer)

| Metric | Formula |
|--------|---------|
| CPL | Spend ÷ Leads |
| Cost per booked call | Spend ÷ $25 bookings |
| Cost per show | Spend ÷ Shows |
| **CAC** | Spend ÷ Sales |
| **ROAS (collected)** | Cash collected ÷ Spend |
| Front-end offset | $25 revenue ÷ Spend (how much of CAC the tripwire funds) |
| Avg deal value (booked) | Contract value ÷ Won deals — `[CONFIRM backend price]` |
| Avg cash collected / sale | Net NMI collected ÷ Sales |
| Collection rate | Collected ÷ Booked |
| Payment-plan default rate | Plans with failed/missed payments ÷ active plans |
| Refund rate / chargeback rate | Refunds (or chargebacks) ÷ sales — *high-risk in credit repair* |

---

## 4. Attribution logic (the heart of the build)

**Goal:** follow **one identity** from Meta click → GHL form → Stripe $25 → Close deal → NMI cash, so every dollar collected is traceable to the ad that produced it.

- **Primary key:** `fbclid` + UTMs captured at the **GHL Marketing form**, persisted on the GHL contact.
- **Carry-through:** the existing **Cloudflare Worker** stamps those tags onto the **Close** opportunity and onto the **NMI** transaction metadata/order ID. *(The fix lives where the plumbing already is — no new Make/Zapier layer.)*
- **Fallback identity match:** email → then phone (people use different emails across steps).
- **Attribution model:** last-click on the lead-generating ad (standard for one-off high-ticket). First-touch optional for content.
- **Lag handling (critical):** sales close days/weeks after the click. Cash must be **cohorted back to the click/lead date**, so campaign ROAS reflects when the click happened — not when the payment landed.
- **Attribution window:** `[CONFIRM]` (recommend 60–90 days given the sales lag).

---

## 5. The levers (what to pull to make more money)

Ordered by leverage / speed, given a one-off book-a-call model:

1. **Reallocate budget to high-ROAS campaigns** — the biggest lever, *impossible today* (no attribution); unlocked by the Phase 0 tracking fix. Kill/cap losers, scale winners on collected-cash ROAS, not CPL.
2. **Show rate** — confirmations + SMS/email reminders + a value-priming sequence before the call. Cheapest, fastest double-digit gain. The $25 already helps; tighten it.
3. **Close rate** — call review, script/objection handling, closer scorecards in Close. Highest-leverage point on a high-ticket call.
4. **Collection rate / default reduction** — dunning, card-account-updater, larger deposit. Recovers already-won cash = near-pure margin. Big in credit repair due to chargeback risk.
5. **$25 qualification tuning** — adjust targeting/creative so $25 buyers are higher-intent → better show & close downstream (not just cheaper leads).
6. **Offer rate** — make sure every show actually gets pitched (no "thinking about it" calls that never reach an offer).
7. **Front-end funding** — use the $25 (plus any order bumps) to offset CAC so they can profitably *outspend* competitors on Meta.

---

## 6. Budget-management framework

- **Shift the decision metric from CPL → CAC/ROAS.** CPL and cost-per-booking stay as *leading indicators* (fast feedback), but spend decisions are ratified on **collected-cash CAC/ROAS** (lagging truth).
- **Close the loop to Meta (CAPI / offline conversions).** Send `Booked`, `Closed-Won`, and `Cash Collected` (with $ value) back to Meta so the algorithm optimizes toward **buyers**, not cheap leads. This is both measurement *and* an optimization lever.
- **Scaling rules:** scale ad sets with CAC < target **and** payback < `[CONFIRM]` days; cap/cut ad sets above CAC target after sufficient spend. Judge on collected-cash ROAS cohorted to click date.

---

## 7. Error-handlers / edge cases the system MUST handle

| Case | Required handling |
|------|-------------------|
| Refunds & chargebacks | Net out of cash collected & ROAS; flip the sale's status. (Credit-repair chargeback risk is high.) |
| Payment plans | Track **booked vs collected-to-date vs scheduled-future** separately; report both "collected ROAS" and "projected/booked ROAS." |
| Attribution lag | Cohort collected cash back to the click/lead date, not the payment date. |
| Missing UTM/`fbclid` | Bucket as **"Unattributed"** — never silently assign. Report % unattributed as a data-quality KPI. |
| Identity mismatch across systems | Fallback match email → phone; unmatched go to a manual-review queue. |
| Duplicate / rescheduled leads & calls | Dedupe; don't double-count bookings or shows. |
| $25 paid but no booking / no-show / $25 refund | Distinct states; don't count as a strategy-call show. |
| Test / dev transactions | Exclude from all metrics (flag NMI/Stripe test mode). |
| Two GHL accounts | Keep marketing events (lead/book/show) separate from fulfilment; dedupe contacts across both. |
| Booked in Close but no NMI payment (or NMI payment, no Close deal) | Reconciliation exception report — surfaces lost cash & data gaps. |
| Timezone / currency | Normalize all timestamps + amounts. |

---

## 8. Phased path

- **Phase 0 — Tracking fix (prerequisite).** Capture UTM + `fbclid` at the GHL form, persist on contact, carry through the Cloudflare Worker into Close + NMI. *Without this, attribution is retroactively impossible.*
- **Phase 1 — Define & baseline.** This doc; lock metric definitions; baseline from current data (even if partly unattributed) so we can show progress.
- **Phase 2 — Unified reporting/attribution layer.** Pull Meta + Stripe + Close + NMI + GHL into one model; compute the metric tree; build the dashboard. *(This is the natural fit for the Pulse reporting platform.)*
- **Phase 3 — Close the loop.** Feed offline conversions back to Meta (CAPI); move budget decisions onto ROAS/CAC.

---

## 9. Open items to confirm with the client

1. **Backend price / avg deal value** + payment-plan terms (deposit, # payments, length).
2. **UTM/`fbclid` capture** — confirm it's truly absent today (drives Phase 0 size).
3. **What the Cloudflare Workers currently pass** between GHL ↔ Close (read the code).
4. **Refund / chargeback** location & current rate (NMI? GHL fulfilment?).
5. **Team shape** — how many setters/closers work in Close (for per-rep metrics).
6. **Volume** — leads / calls / sales per month (sizing + what "good" looks like).
7. **Delivery cost per client** (for true contribution margin).
8. Does **every $25 buyer** become a Close lead, and is **show/no-show** reliably logged in GHL?
9. **Attribution window** preference (recommend 60–90 days).
```
