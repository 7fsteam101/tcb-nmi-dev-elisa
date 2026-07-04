# KPI Coverage Map

Every KPI from the client's full list, mapped to its state in the system. "Gated on" names
the single unlock that turns it live. Updated 2026-07-02.

Legend: LIVE = computing on real data now · READY = built, waiting on a data source ·
NEXT WAVE = designed, building after its source connects · DECISION = needs a client answer first.

## Paid traffic / top of funnel
| KPI | State | Gated on |
|---|---|---|
| CPC, CTR | READY | Meta token |
| Cost per lead (form submission) | READY | Meta token + GHL forms |
| Cost per booked call | READY | Meta token (bookings side lands with GHL) |
| Ad spend by campaign/ad | READY (page + drill built) | Meta token |
| ROAS on cash collected | READY | Meta + NMI |
| ROAS on invoiced revenue | NEXT WAVE (cash variant built; invoiced variant = one query) | Meta |
| Lead volume by source | READY (source field on every opt-in) | GHL forms |

## Setting / middle of funnel
| KPI | State | Gated on |
|---|---|---|
| Speed to lead | NEXT WAVE | SendBlue (first contact attempt timestamps) |
| Calls booked per setter | NEXT WAVE | GHL (who created the booking) |
| Calls booked per lead source | READY | GHL |
| Show rate / no-show rate | READY (computing; populates with GHL history) | GHL |
| Reschedule rate + reschedules that eventually show | LIVE logic (per-slot model + recovered metric) | GHL history |
| DQ rate at setting + reasons | READY (dq_stage + reason list live) | rep forms usage |
| A1 calendar bookings (30-day dispute hold) | READY (calendar tagging shipped today) | GHL + tag the A1 calendar in Admin |

## Sales / closing
| KPI | State | Gated on |
|---|---|---|
| Close rate overall (closed / showed) | LIVE | — |
| Close rate per closer + weekly basis | LIVE (per-closer; weekly view in today's build) | — |
| PIF vs payment plan split | In today's build | real plan data (NMI) for history |
| Average deal value (+ per closer) | LIVE / in today's build | — |
| Cash collected per closer per month | In today's build | NMI |
| Invoiced revenue per closer per month | In today's build | — |
| Objection breakdown + loss correlation | LIVE (from rep forms) | form usage |
| Follow-up close rate (1st vs 2nd/3rd call) | NEXT WAVE (call sequence data exists) | GHL history |
| Time to close (first call to signed) | NEXT WAVE | GHL + contract events |
| DQ rate at closing + reasons | LIVE | — |

## Revenue & commission
| KPI | State | Gated on |
|---|---|---|
| Invoiced revenue by month | In today's build ($103,500 imported) | — |
| Cash collected by month | In today's build | NMI |
| Installment stack (projected future cash) | LIVE structure | NMI history import |
| Refund rate + refund dollars | LIVE (reversal ingestion + drill shipped today) | Stripe/NMI |
| Commission owed per closer | In today's build (estimate) | NMI + commission decision |

## Sales team health
| KPI | State | Gated on |
|---|---|---|
| Speed to lead per closer | NEXT WAVE | SendBlue |
| Call report submission rate (on time vs missing) | LIVE (same-day rule shipped today) | form usage |
| Calls taken per closer per week | LIVE | GHL history |

## Retention / fulfillment
| KPI | State | Gated on |
|---|---|---|
| Onboarding completion rate | READY (fulfilment records exist for all 44 wins) | fulfilment updates (Monday import or forms) |
| Delinquency rate (14+ days) | LIVE (daily aging cron) | NMI |
| Collection rate | LIVE logic | NMI |
| Churn rate | READY | NMI/Monday status feed |

## Email & MOF
| KPI | State | Gated on |
|---|---|---|
| Open rate / CTR / unsubscribes per campaign | NEXT WAVE | GHL app (email stats API) |
| Calls booked attributed to email | NEXT WAVE | GHL + attribution fields |

## Weekly business snapshot
All nine weekly numbers + pipeline value + projected 30-day cash: **in today's build**
(the Weekly Snapshot page), computing on whatever sources are connected.

## The unlock list, by impact
1. **GHL app install** — activates ~14 KPIs (all booking/show/reschedule/source/email numbers)
2. **NMI key** — activates ~10 (all cash/collection/commission numbers + money history for the wins)
3. **Meta token** — activates 6 (all paid-traffic numbers)
4. **Stripe** — booking fees + refund side
5. **SendBlue key** — speed-to-lead family (wave 2)

## Gaps (2026-07-04 audit)

Audit of every KPI above against what is actually rendered in a page today (a KPI
counts as covered only when a widget, chart, table or stat renders it on a page,
not merely that a query function exists). The KPIs below have no visible widget
yet. "Page it should live on" names the route where it belongs when built. Most
are gated on a data source per the state column above, so this is a build backlog,
not a bug list.

### Paid traffic / top of funnel
- CPC, CTR: page `marketing` (add to the new Report section / campaign table).
- ROAS on invoiced revenue: page `marketing` (cash-ROAS variant exists; invoiced variant is a sibling column).
- Lead volume by source: page `marketing` (source is on every opt-in; no by-source widget rendered yet).

### Setting / middle of funnel
- Speed to lead: page `calls` (gated on SendBlue).
- Calls booked per setter: page `reps` (gated on GHL booking-creator attribution).
- Calls booked per lead source: page `marketing` (query-ready, not rendered).
- DQ rate at setting + reasons: page `calls`.
- A1 calendar bookings (30-day dispute hold): page `calls`.

### Sales / closing
- Follow-up close rate (1st vs 2nd/3rd call): page `calls` (gated on GHL call-sequence history).
- Time to close (first call to signed): page `weekly` (gated on GHL + contract events).
- DQ rate at closing + reasons: page `calls` (logic live; no dedicated widget rendered).

### Sales team health
- Speed to lead per closer: page `reps` (gated on SendBlue).
- Call report submission rate (on time vs missing): page `reps` (rule shipped; not surfaced as a widget).

### Retention / fulfillment
- Onboarding completion rate: page `receivables` (fulfilment records exist; no widget).
- Collection rate: page `receivables` (logic live; not rendered).
- Churn rate: page `receivables` (gated on NMI / Monday status feed).

### Email & MOF
- Open rate / CTR / unsubscribes per campaign: page `marketing` (gated on GHL email-stats API).
- Calls booked attributed to email: page `marketing` (gated on GHL + attribution fields).

Everything else in this doc that is marked LIVE or "in today's build" was confirmed
rendering on a page (Overview, Funnel, Reps, Revenue, Receivables, Weekly). No
false-positive coverage was found in the audit.
