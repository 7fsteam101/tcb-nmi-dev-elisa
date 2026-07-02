# The Credit Brothers — Sales System Definition & Reporting Spec

**Client:** The Credit Brothers (Josh Steil, Chris Steil) + PersonalBrands.io (Miro = marketing lead, Jimmy = fulfilment).
**Engagement:** Clarity on sales metrics, the levers that make more money, and managing the Meta budget better.
**Author:** 8 Figure Systems (Katie)
**Date:** 2026-06-23 · **Status:** DEFINITION / SCOPE (no live systems being edited — Katie committed to never touching working systems).
**Source of truth:** Audit Call 1 (offer + sales process) + Audit Call 2 (KPIs + reporting).

> **Legend:** `[LOCKED]` = decided on a call. `[OPEN]` = needs a decision/confirmation. `[FIX]` = current data-integrity bug to repair. `[BUILD]` = not built / half-built today.
> This is the **definitions layer** — the single source of truth so Miro, Josh, and Chris read the *same number from the same definition* (Jimmy's consistency point). Mockups + Lucidchart flow are separate deliverables that build on this.

---

## 1. Offer map — what we actually optimize for

| Offer | Price | Ticket | B2B/C | Who sells | Optimized? |
|---|---|---|---|---|---|
| **Backdoor Credit Reset (BDCR)** | **$2.5k PIF / up to $3.5k on plan** | **Mid** | B2C | Sales team | ✅ **THE offer — everything optimizes for this** |
| Coaching (no name) | ~$2k | Mid | B2C | Chris only (escalation) | ❌ Fallback for DQ'd leads who want coaching; ~2 ever sold |
| Business funding | $500–1,500 front + 7–10% back (e.g. $200k credit @7% = $14k) | High | B2C (personal guarantee) | Chris only | ❌ Referral-only; requires ~$1M+ rev businesses; different funnel |
| School community | $47/mo | Low | B2C | — | ❌ Legacy, dying |
| Credit-maxing products | ~$27 (cart ~$65) | Low | B2C | — | ❌ Organic-only LTO idea, dormant |

- **The $25 strategy-call fee is NOT an offer** — it's a booking fee to lift show-rate ("free calls = 0 for 20"). 45-min phone call. Stripe processes it. Excluded from cash-collected/commissions.
- **Couples** (spouse/partner) can both enrol → ~$2.5k × 2 with a 10–20% discount. `[OPEN]` how a couple counts in metrics (1 deal at 2× value, or 2 deals?).
- **BDCR = one-off**, 6-month program, team access for 12 months (extension mechanism to land the result + testimonial).
- **No guarantees** (regulated industry). Positioning = credit **RESET** vs repair: fix the **report** (remove negative items via legal-violation pursuits), not the score; "no need to pay debt or have a 550 score."

---

## 2. The funnel — end to end

**Paid (Meta — Miro):** ad (contrarian angles) → single **VSL landing page** (50-min VSL + opt-in form capturing goal/credit-range/blockers; lead captured whether they book or not) → calendar page → **pay $25** → intake page (submit info + **IdentityIQ** $1 14-day-trial login so team can pull the report) → **NAFA** auto-generated → confirmation page (15-min pre-call video + homework).

**Organic (Chris — large TikTok/IG):** link-in-bio → book-a-call page; OR DM → Chris "sets" in DM → unique **setter-tagged** book-a-call link (skips VSL, tagged to Chris in GHL).

**Sales sequence:** book → SendBlue auto-texts (speed-to-lead) → rep calls (phone) → **Readiness call** (5–15 min phone "setting" call: confirm time/not-at-work, intake done, video watched, **not working with another credit co. / no disputes in last 40 days**) → **Strategy call** (45 min phone; NAFA revealed *during* pitch) → close → invoice (NMI) + contract (e-sign) → onboarding/kickoff (gated on a 2nd payment).

Key mechanisms: **NAFA = Negative Account Forensic Audit** (their unique pitch artifact). **40-day clean window** required before work can start (bureaus need 30 days; their process is 40) — drives reschedules when a prospect recently used another company.

---

## 3. Systems & source-of-truth map

| System | Owns | Notes |
|---|---|---|
| **Meta** (1 ad account) | Spend, impressions, CPM, CTR, clicks, leads | Pulled **directly via Meta API** into dashboard. Timezone `[OPEN]` — Josh saw **EST**, Miro verifying (maybe PST). Critical for daily ad reporting. |
| **GHL — Marketing** | Forms, calendars, funnels, email/text campaigns, **Stripe ($25)**, **contracts/e-sign**, unique funnel visits | Contracts live here for no real reason (Katie: fulfilment would make more sense) `[OPEN]`. |
| **GHL — Repair/Fulfilment** | Client fulfilment, **NMI (all offer payments/invoices)**, client SMS/calls, invoice events | Separate acct partly **forced**: GHL can't connect 2 processors → Stripe(mktg)/NMI(fulfilment). Also permission segmentation. Has a pipeline but barely used. |
| **Close CRM** | Sales pipeline; where reps are "housed" | **Opportunities are NOT actively updated** — progress tracked via **notes**, not stage moves. Only **Closed-Won** is moved manually. Hidden **API-only custom fields** store GHL lead ID, Monday ID, payment-schedule ID = the cross-system **join keys**. A legacy pipeline also exists (unused). |
| **Monday.com** | **The data backbone** — powers the dashboard | Boards: **Repair Lead Source** (main), **Credit Audits** (NAFA), **In-House Payment Schedule** (most complete, fully automated — invoices/installments/due-vs-paid/refunds), **Client Source** (fulfilment, barely used). |
| **Cloudflare Workers** | Custom glue | Sync GHL-Mktg → GHL-Repair → Close → Monday; create payment-schedule records on invoice webhooks; **half-built auto-DQ worker** extracting NAFA violation counts. Some lead-status updates = a legacy **Zap** (per Jimmy). |
| **Sales Dashboard** | Rep + leadership UI; all forms | **Next.js**, hosted on **Vercel** but actually a **locally-hosted server on a Mac Studio** in their office. **Pulls primarily from Monday.** Code/docs in **GitHub**. Gates rep access so they never touch Monday directly (no per-seat cost). |
| **SendBlue** | All sales calls + texts (everything is **phone**, not Zoom) | Call recordings here (sometimes GHL/Close). Powers the post-call-notes tool. |
| **Fireflies** | Internal Zoom calls only | NOT sales calls. |
| **Dub (dub.co)** | **Chosen attribution/link + referral tool going forward** `[BUILD]` | Replaces legacy **ClickMagic** (built but unused). **No UTMs captured today.** |
| **Supabase** (free plan) | Candidate database `[OPEN]` | See §8 — Supabase vs Monday is Katie's call. |

---

## 4. Metric definitions (the core)

### 4.1 Funnel-stage definitions
| Metric | Definition | Date basis | Source |
|---|---|---|---|
| **Lead opt-in** | Opt-in form submit. **Unique by email/phone.** Re-count the same person as a new opt-in **only if >30 days** since last `[LOCKED]`. (Within 30 days = 1.) | Opt-in date | GHL Marketing form |
| **Booked call** | A **$25 paid** strategy call on the funnel calendar. **Unique bookers only** — exclude duplicate/double-bookings (those get refunded). Readiness/confirmation calls do NOT count. `[LOCKED]` | **Event start date** | GHL calendar + Stripe |
| **Qualified** | Innocent-until-proven-guilty: every booker = qualified unless marked **Not Qualified** via DQ report. `[LOCKED]` | — | Dashboard / Monday |
| **Showed** | Boolean — did they attend the strategy call. `[LOCKED]` | **Event start date** | Sales-call form |
| **Offer made** | Closer presented the BDCR offer. Exists as a Leads-tab column but **not reflected in dashboard data** `[FIX]`. | Event start date | Sales-call form |
| **Closed-Won / Deal** | Opportunity marked **Closed-Won AND ≥1 payment processed** (incl. first installment on a plan). Payment is the bar, not contract-sign. `[LOCKED]` | **Deal-close date** = moment marked Won | Close → NMI |
| **New client** | Distinct from Closed-Won: has **entered fulfilment / been onboarded** (posted to sales-fulfilment channel). | Onboarding date | GHL Repair |

### 4.2 Conversion / leakage rates (define numerator + denominator explicitly)
| Rate | Formula | Audience |
|---|---|---|
| Click → Lead | Leads ÷ Clicks | Marketing |
| Lead → Booked | Booked ($25) ÷ Leads | All |
| **Booked → Taken** (the bottleneck) | Calls taken ÷ Booked | **Leadership — primary focus** |
| Show rate | Showed ÷ Calls taken-on-calendar | All |
| **Close rate (taken)** | Closes ÷ Showed/taken | Closer-facing |
| **Close rate (calls on calendar)** | Closes ÷ calls-on-calendar (incl. no-shows, **excl.** reschedules/cancellations) `[LOCKED]` | **Leadership only** |
| **Full-funnel** | Closes ÷ Booked (e.g. ~7%) | Leadership |

### 4.3 Money metrics
Cash collected (gross, **pre-processing-fee** `[LOCKED]`); new cash vs **residual** (plan installments from prior closes); total/contracted sale (avg ticket); avg deal value; avg cash collected per sale; **collection rate** (collected ÷ contracted); PIF vs payment-plan rate; refund rate; chargeback rate.

**Payment-plan structures** `[LOCKED]`: PIF · 3 × ~$997 · **6 or 7 × ~$497** (7 if can't pay first+last) · backup **12 or 13 × ~$297** (13 if can't pay first+last). They take first+last upfront like rent; if too stressed → monthly + one extra payment at the end. Deposits collected at close (e.g. $197–297 on a $497 start); onboarding/kickoff gated until a 2nd payment.

### 4.4 Cancellation / leakage metrics — **THE bottleneck** (booked → taken)
Both Chris and Miro: the biggest leak is **between call booked and call taken** — ~1 in 3 booked calls reschedules/cancels, **>90% of leads reschedule at least once**, and only **~2–3 of every 10 booked calls actually happen as qualified calls.** Not currently visualized anywhere `[FIX]`. Define precisely:
- **Cancellation rate** split into: **Cancelled by lead** (no-show / family emergency / other) vs **Cancelled by closer** (lead transfer/double-book / other) vs **Reschedule**. `[LOCKED]` direction (Chris already reworked the form).
- **No-show rate** · **reschedule rate** (+ reschedule count per lead) · **calls-on-calendar** (booked minus reschedules/cancellations, incl. no-shows).
- **Double-bookings do NOT count as cancellations** — keep 1 unique booked call. `[LOCKED]`
- **Reason** must be a **separate field** from cancellation **type** (so it's reportable, not buried in free text). `[LOCKED]` — see §7.

### 4.5 Ad / marketing metrics
Spend, impressions, reach, CPM, CPC, CTR, **CPL, cost-per-booked-call, cost-per-showed-call, CPA/CAC, ROAS** (Miro's top 3 = cost-per-booked / cost-per-showed / CPA). Plus lead volume by source, lead-form fill rate, spend per campaign. Net ad spend computed for paid only (organic excluded). Source = Meta API. Timezone `[OPEN]`.

### 4.6 Rep / commission metrics
- **Commission:** 10% of cash collected base; **15% if the rep's prior-2-week close rate ≥ 33.3%**, held until a 2-week period falls below 33.3% → reverts to 10% for the next 2 weeks. `[LOCKED]` Excludes the $25. Gross (pre-processing). Includes **residuals** on plan installments.
- Commission report is **manual** today (rep enters clients/invoices/residuals → Slack → VA validates vs Monday/GHL → pays) `[FIX → automate]`.
- **Refund/dispute deduction from commission = undecided** `[OPEN]`.
- **Setter vs closer:** role is splitting from hybrid → dedicated setter; **track setter and closer metrics separately going forward.** `[LOCKED]`

---

### 4.7 Full KPI catalog (client's authoritative list) + data-readiness
This is the **outcome the client wants** (their list, grouped as they grouped it). Each KPI is flagged for whether we can build it from data the systems capture **today**:
**✅ = buildable now** · **⚠️ = data exists but needs a definition lock or a `[FIX]`** · **🔧 = needs NEW capture (not tracked today — must instrument before it can ever show).**

> **Readiness headline:** the metrics are buildable in three buckets. (1) **Acquisition + core sales counts** are mostly ✅. (2) **Almost all of Revenue/Retention is gated on ONE fix** — the payment-plan back-reflection bug (§8 #1); fix it and ~8 KPIs light up at once. (3) The **🔧 new-capture cluster** is concentrated and predictable: **objections, speed-to-lead, setter attribution, email metrics, DQ-reason, and call-report compliance** — these need form/instrumentation changes first, so they belong in a "Phase 2 capture" workstream, not the first dashboard.

**Paid traffic / top of funnel**
| KPI | Source | Ready |
|---|---|---|
| CPC, CTR, total spend by campaign/ad | Meta API | ✅ |
| CPL (form submit) | Meta ÷ GHL form | ✅ |
| Cost per booked call | Meta ÷ bookings | ✅ (already on dashboard) |
| **ROAS — on cash collected AND on invoiced revenue** | NMI/Monday ÷ Meta | ⚠️ blended ✅ now; **per-campaign needs attribution (Dub)** 🔧 |
| Lead volume by source (paid/organic/DM/referral/email) | GHL + Dub | ⚠️ source loose today (no UTMs); needs Dub |

**Setting / middle of funnel**
| KPI | Source | Ready |
|---|---|---|
| Speed to lead (form→first contact) | SendBlue vs booking ts | 🔧 needs first-contact-attempt timestamp |
| Calls booked per setter | Dashboard | 🔧 needs setter attribution (role splitting now) |
| Calls booked per lead source | GHL + Dub | ⚠️ needs source-on-booking |
| Show rate · No-show rate | Sales-call form | ✅ / ⚠️ (no-show needs taxonomy fix §7) |
| Reschedule rate **+ how many reschedules eventually show** | Missed-call form | 🔧 count exists; "eventually show" needs reschedule-chain→outcome link |
| DQ rate at **setting** stage + reason | NAFA/auto-DQ | 🔧 auto-DQ half-built; reason not captured at setting |
| A1 bookings (30-day dispute-hold leads) | New flag | 🔧 needs a "dispute-hold / working-with-another-co" flag |

**Sales / closing**
| KPI | Source | Ready |
|---|---|---|
| Close rate overall (closed÷showed) · per closer | Dashboard | ✅ (defs §4.1–4.2) |
| Weekly basis (for commission) | Dashboard | ✅ (2-wk tier already; weekly rollup trivial) |
| PIF vs payment-plan split | Monday/NMI | ✅ |
| Avg deal value · per closer | Close/Monday | ✅ |
| Cash collected per closer/month · Invoiced revenue per closer/month | Monday | ✅ |
| **Objection breakdown** (objection → loss rate) | Sales-call form / AI | 🔧 **not captured today** — add objection field or AI-extract from SendBlue transcript |
| Follow-up close rate (2nd/3rd vs 1st call) | Call types | 🔧 needs call-sequence # + outcome link (enrollment/follow-up types exist) |
| Time to close (first call→signed) | Timestamps | ⚠️ both timestamps exist; compute |
| DQ rate at **closing** stage + reason | DQ report | 🔧 reason capture at closing |

**Revenue & commission**
| KPI | Source | Ready |
|---|---|---|
| Total invoiced revenue / month · Total cash collected / month | Monday In-House Payment Schedule | ✅ |
| **Recurring installment stack** (projected future cash from plans) | Payment Schedule | ⚠️ **gated on back-reflection `[FIX]` §8 #1** |
| Refund rate + refund $ | NMI/GHL | ⚠️ needs refund-status tagging §8 #3 |
| Commission owed per closer | Dashboard | ⚠️ computable; commission report manual today → automate |

**Sales-team health**
| KPI | Source | Ready |
|---|---|---|
| Speed to lead per closer | SendBlue | 🔧 (per-rep first-contact timestamp) |
| **Call-report submission rate** (on-time vs missing) | Calendar vs reports | 🔧 new metric — calls-on-calendar vs reports-submitted (the "Isaac doesn't submit forms" problem) |
| Calls taken per closer/week | Dashboard | ✅ |

**Retention / fulfilment handoff**
| KPI | Source | Ready |
|---|---|---|
| Onboarding completion rate | GHL Repair (Jimmy) | 🔧 fulfilment-side capture |
| Payment-plan delinquency (14+ days late) | Payment Schedule | ⚠️ due-vs-paid exists; **gated on §8 #1** |
| Payment collection rate (scheduled installments collected) | Payment Schedule | ⚠️ **gated on §8 #1** |
| Churn rate (cancelled/refunded after start) | Status field | ⚠️ needs status tagging §8 #3 |

**Email & MOF**
| KPI | Source | Ready |
|---|---|---|
| Email open rate / campaign · CTR per email · Unsubscribe rate | GHL Marketing | 🔧 GHL email data not in dashboard today |
| Calls booked attributed to email | GHL + Dub | 🔧 needs email-link attribution |

**Overall business health (weekly snapshot)**
| KPI | Ready |
|---|---|
| Qualified leads/wk · Qualified opt-ins/wk (30-day rule) | ✅ / ✅ |
| Calls booked this wk · taken this wk | ✅ / ⚠️ (taxonomy) |
| Closed this wk · Invoiced this wk · Cash collected this wk | ✅ |
| **Pipeline value** (invoiced from open plans not yet collected) | ⚠️ **gated on §8 #1** |
| **Projected next-30-day cash collected** | ⚠️ **gated on §8 #1** |

**What this tells us:** the fastest path to "clarity on sales metrics" is (a) ship the ✅/⚠️ KPIs in dashboard v1, (b) make the **payment-plan back-reflection fix** the #1 engineering task (it unblocks the entire Revenue + Retention + weekly-pipeline column), and (c) run the 🔧 items as a parallel **data-capture workstream** (objections, speed-to-lead, setter split, email, DQ-reason, report-compliance) since none of them can appear on a dashboard until the data starts being recorded.

---

## 5. Date-basis rules (cross-cutting) `[LOCKED]`
This caused most of the confusion, so it's a rule of its own:
- **Funnel-stage events (booked, show)** → **event start date** (when the call happened), never booked/schedule date.
- **Deals / closes** → **deal-close date** (the moment the opportunity is marked Won).
- **Lead-quality cohorting** → **opt-in / book date**, at the **contact level** (to judge which acquisition month produced good leads).
- **Late-returning leads** (booked months ago, close now) → the close counts **in the current month** by deal-close date; you can still filter by original book date to assess lead quality. Avoids fake retroactive close-rate spikes.

---

## 6. Pipeline & opportunity logic
**Close stages (current):** Lead Opt-in → Eligibility Call Booked (future/unused — may become the setter readiness call) → **Strategy Call Booked** (main entry, $25 paid) → Intake Form Submitted → Audit Completed (NAFA) → Call Completed → Closing (agreement issued — automated) → Contract Signed → **Closed-Won** (manual) → Lost.

- **One opportunity per person.** No moving backwards (GHL enforces; **Close behavior `[OPEN]` — must test**). If a booked lead later opts in again from an ad, they must **not** drop back to Lead Opt-in and re-receive "book your call" messaging. `[LOCKED intent]`
- **Double-booking** → keep one unique opportunity; cancel the dupe; don't count as cancellation. `[LOCKED]`
- **Re-engaged lead (months later):** if they re-enter via the funnel + pay $25 → **new strategy call / new opportunity**; if they DM/text the closer directly → **follow-up call** (no new $25). Leaning follow-up `[OPEN — confirm]`.
- **DQ flow:** auto-DQ when NAFA shows **<5 violation opportunities OR <2 accounts with violations** `[LOCKED thresholds]`. The auto-DQ worker is **half-built** `[BUILD]`. DQ'd calls still happen (justify the $25; potential coaching/legal-exception — Chris only). Upsell-to-coaching for DQ'd leads is **paused** until core BDCR selling is dialed in (~95% qualify, so small upside).

---

## 7. Cancellation & call-outcome form taxonomy (scenario review — priority #3)
Reps mis-tag outcomes today, which corrupts the cancellation rate. Target spec (Chris has already started this):

**Missed-Call form**
- **Cancelled by lead** → reason: No-show · Family emergency · Other → *"Already reached out to reschedule?"* (Y/N)
- **Cancelled by closer** → reason: Lead transfer / double-book · Other
- **Reschedule** → reschedule **count** (1/2/3…) · *"Date already set?"* (Y → done; N → *"Will you follow up?"* → **auto-create a follow-up task in Close** `[BUILD]`; drop the required date/time)
- **Type** and **reason** are **separate fields** (reportable). `[LOCKED]`

**Other forms (keep call-outcome lists identical across them):** Sales-Call report (outcome incl. closed PIF / closed plan / down-payment / follow-up / **enrollment call** = partial-payment-with-call-later · cash collected · total invoice — with validation, e.g. flag an extra-zero) · Post-Call Notes (paste SendBlue transcript → AI notes → one-click sync to Close + GHL; closed calls also generate CSM-handoff notes) · Readiness-call (setter) report.

**Cancellation rate is computed from these tagged outcomes** (not inferred from calendar moves, which can't distinguish cancel vs reschedule). Caveat to surface: today reps often only mark **no-show on the day-of** rather than pre-cancelling — so "cancelled" can mean different things; the taxonomy above fixes that.

---

## 8. Data structure — findings & recommendation (priority #2)
**Bugs to fix `[FIX]`:**
1. **Payment-plan changes don't back-reflect** into Monday In-House Payment Schedule → the "My Clients" tab shows **stale receivables** (Donna Fletcher: 3 installments re-split, never updated). This breaks receivables + commission accuracy — Katie: *"this is where you start losing trust on the data."* **Highest-priority fix.**
2. **Future-dated "joined" clients** — enrollment-call **start dates** read as **join dates** (deals "joining" 12 days in the future). Separate enrollment-start from deal-close/join.
3. **Refunded deals not pulled** (John Pio) — keep the deal but tag **status** (active / refunded / churned); never silently drop.
4. **Same number in 3 places** (Leads / Sales / Closers tabs) → one metric, one home (some intentional redundancy for the 3 stakeholders is OK — but one **definition**).
5. Likely-dead columns to retire/confirm: original appointment status, "reason", strategy-code.

**Database decision — Supabase vs Monday `[OPEN — Katie's call]`:**
- **Monday:** friendly/visual, already the backbone, non-technical-readable. Weak at relational integrity → the edge cases above (plan re-splits, one-opportunity-many-calls, refund status) are exactly where it strains.
- **Supabase:** relational, enforces one-opportunity/linked-records, handles plan changes + receivables + cohorting cleanly, already on free plan, and the dashboard is already **Next.js** (natural fit). Cost: less point-and-click for the team.
- **Recommendation:** lean **Supabase as the system-of-record** for sales/finance data, keep a friendly read view for the team — *but this is Katie's decision to confirm.*
- **Join-key principle:** one system owns each field; everything keys off contact/opportunity IDs (already partially done via Close's hidden IDs + Monday IDs).

---

## 9. Attribution plan (feeds the budget lever)
- **Today:** no UTMs; ClickMagic legacy/unused; source ≈ first-touch (**unconfirmed `[OPEN]`**). Track **first AND last touch separately** (Katie's standard).
- **Plan `[BUILD]`:** **Dub** links across all entry points (Meta ads, link-in-bio, DM setter links) → capture source first+last → carry through Cloudflare into Close + Monday. This is what turns Meta reporting from **CPL-only** into true **cost-per-booked → CPA → ROAS by campaign**, so budget can be managed on buyers, not cheap leads.

---

## 10. Dashboard structure (mockup plan — priority #4)
**Principles (per Katie's standards):** non-redundant (one number, one home); **every KPI clickable down to the underlying records** to verify the count; minimal text + **(i) tooltips**; good contrast; a **dedicated leakage/cancellation section** (it's the bottleneck and is currently invisible); **leadership vs closer** views; a **demo mode** with obviously-AI mock data to verify each widget.

**Proposed pages:**
1. **Overview / Funnel** — Meta spend → Lead → Booked → Taken → Offer → Close → Cash, each with conversion % and **$ leak** at each step.
2. **Acquisition / Leads** — by source (first+last), CPL, lead-form fill rate, spend per campaign, unique opt-ins (30-day rule).
3. **Calls & Leakage** ← *the bottleneck page* — booked vs taken, cancellation by-lead/by-closer, reschedule count, no-show, calls-on-calendar, reasons.
4. **Sales & Cash** — closes (by deal-close date), close-rate variants, avg ticket, PIF vs plan, cash collected (new vs residual).
5. **Closers** — per-rep close rate, cash collected, commission tier (10/15%), **leaderboard** (points or cash-based `[OPEN]`).
6. **Finance** — cash collected, receivables/upcoming installments, refunds/chargebacks, commissions owed, processing fees.
7. **Ads** — Meta KPIs + cost-per-booked / cost-per-showed / CPA / ROAS (timezone-correct).

*(Visual mockups + a Lucidchart system-flow are the next artifacts; this section defines what each page must contain.)*

---

## 11. Open decisions for Katie / client (consolidated)
1. **Supabase vs Monday** as system-of-record (Katie deciding).
2. **Ad-account timezone** — EST vs PST (Miro verifying) — must be correct for daily ad reporting.
3. **Source attribution** — first vs last touch confirmation (track both).
4. **Refund/dispute → commission** deduction policy (undecided).
5. **Re-engaged lead** = new strategy call vs follow-up call.
6. **Couples** = 1 deal at 2× value or 2 deals.
7. **Contracts** stay in GHL Marketing vs move to Fulfilment.
8. **Leaderboard** metric basis (points vs cash).

## 12. Data-integrity bugs (consolidated `[FIX]`)
Payment-plan re-splits not back-reflected (highest) · future-dated joins · refunded deals not pulled · offers-made not in dashboard data · same-number-in-3-places · commission report manual · auto-DQ worker half-built · cancellation rate not tracked/visualized.
