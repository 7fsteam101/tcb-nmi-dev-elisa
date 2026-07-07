# Connections & Triggers — how each source drives Supabase

The goal: when something happens in Close (or GHL, Stripe, NMI, Meta), Supabase
reacts within seconds. This is the exact setup, per source, and what fires on
each event. Every inbound URL is already live; the work is pasting URLs / keys
into each system.

The shared pattern: each system POSTs an event to a webhook on the app →
the event lands in `sync.raw_events` (idempotent, so a re-delivery is harmless)
→ a normalizer projects it into the business tables → the dashboard reflects it.
A daily cron reconciles each source as a safety net under the webhooks.

---

## 1. Close — the pipeline (this is the "stage moved" trigger)

**STATUS: LIVE as of July 5, 2026.** The admin key (the "TCB Repair Support" user,
full read/write) is stored in Supabase Vault; read + write are active; the webhook
below is subscribed. Historical leads/opportunities are backfilled (~794 leads).

**NEW PIPELINE (July 7, 2026):** the redesigned pipeline is live in Close as
**"Sales"** (`pipe_5ZtGJ7zT6RjguZ6KPEebkC`), 19 stages including the
Setter Booked / Self Booked split. We added the missing **Won PIF** stage via the
API (typed "won", ordered Deposit -> Won PIF -> Won PP) and mapped every stage in
both directions (inbound STAGE_ALIASES + outbound slug match). GHL self-bookings
stamp `self_booked` + `booked_by='self_book'`. The old "BDCR Sales" pipeline stays
for history. TWO OPEN ITEMS FOR THE TEAM: (1) Josh must re-point the onboarding
automation (Cloudflare worker) from the old pipeline's "Closed Won" to the new
Won PIF / Won PP before deals close on the new pipeline, or onboarding will
silently not fire; (2) migrating existing open opportunities old -> new should
happen after (1), moving cards in bulk fires no automations on our side (we
mirror), the risk is only their own Close/Zapier automations.
Gotcha for future debugging: the app resolves the Close connection that HOLDS the
key (a keyless placeholder connection can otherwise shadow it) — see the
`token_secret_ref` preference in `getConnection`.

**What we want:** when a rep moves an opportunity to a new stage in Close, the
matching opportunity in Supabase updates its stage; a won stage flags onboarding;
a lead edit updates the contact.

**Setup (done, kept here for reference / re-key):**
1. In Close, an admin creates an API key (Settings → Developer → API Keys). API
   keys are full read/write (no scoping). Copy it immediately (shown once).
2. Paste it in the app: Connections → Connect with a key → Close.
3. Saving it AUTO-SUBSCRIBES these Close webhook events to the app (no manual
   webhook setup): `lead.created`, `lead.updated`, `opportunity.created`,
   `opportunity.updated`.

**What fires on each event:**
| Close event | Supabase reaction |
|---|---|
| `opportunity.updated` (stage change) | mirror the new stage onto `sales.opportunity` by `close_id`; set/clear `closed_at`; if it entered a won stage with no deal yet, flag it (the deal is created by the Sales Call Report, not the mirror) |
| `opportunity.created` | create the opportunity (mirror) |
| `lead.created` / `lead.updated` | upsert the contact (match across all emails/phones; never overwrite; stamp `created_source`) |

Until the admin key is in, the pipeline refreshes on the manual "Import Close
history" button and the daily reconcile instead of instantly.

**Note on their Cloudflare Workers:** Close already has two of TCB's own worker
webhooks subscribed (stage-change, call-activity). Ours is additive — Close
supports many subscribers, so nothing conflicts.

---

## 2. GoHighLevel — calendars, bookings, opt-ins (2 sub-accounts)

**The two sub-accounts and what each owns (confirmed July 2):**
- **Marketing** sub-account: the funnel front end and the **contracts**.
- **Repair Fulfillment** sub-account: **invoices / payments** and the onboarding /
  delivery workflows that fire on "Closed Won".

Connect via the GHL **Marketplace app**, authorizing with the
AI@thecreditbrothers.com account (now an admin). Install the app on each
sub-account.

**Inbound events (per sub-account), two ways — use whichever the team prefers:**

**A. Native (once the Marketplace app is installed):** the app polls each
location every night and on-demand (calendars, appointments, contacts, form
submissions). No per-event setup.

**B. Instant (workflow webhooks — works today, no app needed):** in each
sub-account, create a Workflow per event with a Custom Webhook action POSTing to
the GHL webhook URL (shown on the Connections page) with this body:
```json
{ "tcb_event": "appointment_booked", "location_id": "<location id>",
  "contact": { "id": "{{contact.id}}", "name": "{{contact.name}}", "email": "{{contact.email}}", "phone": "{{contact.phone}}" },
  "appointment": { "id": "{{appointment.id}}", "start_time": "{{appointment.start_time}}", "calendar_id": "{{calendar.id}}" } }
```
One workflow per `tcb_event`: `appointment_booked`, `appointment_rescheduled`,
`appointment_confirmed`, `appointment_no_show`, `appointment_showed`,
`appointment_cancelled_by_lead`, `appointment_cancelled_by_team`,
`form_submitted`, `intake_submitted`.

**What fires:** bookings create the strategy call + appointment slot; reschedules
keep the old slot in history and open a new one (the leakage story); form
submissions create the opt-in with its source (attribution). Calendars get
categorized in Admin → Calendars (readiness / strategy / follow-up).

---

## 3. Stripe — the $25 booking fee, refunds, disputes

1. Stripe Dashboard → Developers → Webhooks → Add destination → paste the Stripe
   URL (Connections page), API version = default.
2. Select events: `charge.succeeded`, `charge.refunded`, `refund.updated`,
   `charge.dispute.created/updated/closed/funds_withdrawn/funds_reinstated`,
   `checkout.session.completed`.
3. Optionally paste a restricted key (Charges/Customers/Disputes: Read) in
   Connections → this backfills history and powers the daily reconcile.

**What fires:** succeeded charge → booking payment linked to the strategy call;
refund → reversal (nets cash); dispute → the dispute case + status lifecycle,
plus a reversal when funds are actually pulled.

---

## 4. NMI — program payments (the main processor)

**STATUS: key connected** (private key in Vault, ~606 payments imported). Remaining:
confirm the Silent Post URL is set in the NMI portal so go-forward payments post live.

1. NMI portal → Settings → Security Keys → create a private key → paste in
   Connections → NMI. (Done.)
2. NMI portal → Settings → Silent Post URL → paste the NMI URL (Connections page).

**What fires:** approved payment → matched to the open receivable of that amount
on the contact's plan (marks it paid); refund/void/chargeback → reversal.

Note (July 2): Stripe and NMI payments live in **one unified table** with a
`product_type` field (high vs low ticket). NMI processes chargebacks/refunds.
NMI also powers the branded checkout at `pay.thecreditbrothers.com` and the
commission math (payments tied to clients tell us whether a rep gets paid).

---

## 5. Meta — ad spend (decision: non-expiring System User token, read-only)

Why a System User token, not Cloudflare Workers or a user token: it can be set
to never expire (a user token dies in ~60 days and breaks the pipeline), and it
is server-to-server with no OAuth dance because it is their own ad account.
Read-only scopes only, so a leaked token can never spend money.

1. Business Settings → Users → **System Users** → Add (or reuse) → **Assign
   assets** → the ad account → **View performance** (`ads_read`).
2. **Generate token** for that system user with `ads_read` + `read_insights`
   only (NOT `ads_management`) → **no expiration**.
3. Copy the **ad account id** (`act_...`).
4. Paste token in Connections → Meta, ad account id in the Account id field.
   (Or set `META_ACCESS_TOKEN` / `META_AD_ACCOUNT_ID` as Vercel env.)

**What fires:** the daily `/api/cron/meta` job pulls per-campaign spend / clicks /
impressions / CPC via the Insights API (re-pulling a trailing window to catch
Meta's 48h restatements) into `marketing.ad_spend`.

---

## 6. Dub — link clicks + UTMs (decision: API key; needs Dub Pro)

Two separate jobs — both feed the campaign report:

**A. Per-lead UTM (attribution) — no Dub API needed.** The UTMs must land on the
GHL opt-in form as **hidden fields**: `utm_source`, `utm_medium`,
`utm_campaign`, `utm_content`, `utm_term` (and Dub sets a `dub_id` we can also
capture). These write to `sales.opt_in` (`utm`, `source_campaign`,
`dub_link_id`) and drive first / last / converting-touch attribution, so every
lead and contact shows its true source.
- **Setup:** confirm those 5 hidden fields exist on the GHL form. If Dub is the
  short-link in front of the funnel, its links already carry the UTMs and pass
  them to the landing page, which forwards them into the form.

**B. Click volume (Dub Analytics API) — needs Dub Pro.** Dub's analytics endpoint
returns clicks grouped by `utm_campaigns` / `utm_sources` / `utm_mediums` /
`top_links`. The Analytics API is a **Pro-plan feature**.
- **Setup:** Dub → Settings → API Keys → create a read key → paste in
  Connections → Dub. The daily job pulls clicks-by-campaign into the report.
- If they are not on Pro: skip this; attribution still works fully from the UTMs
  on the form (job A). We just lose the top-of-funnel click count.

**Join key for all of it:** `utm_campaign`. It must match the Meta campaign name
and the Dub link's campaign for the three sources to line up in one row — worth
enforcing a naming convention with their media buyer.

---

## 7. Monday: historical data transfer (one-time, not an ongoing sync)

Monday holds the pre-Supabase history we want to import once and link back to
contacts / opportunities. Boards (Katie has access):
- **BDCR Sales** workspace: **Sales Call Reports** and **Missed Call Reports** (the
  form submissions: closed y/n, cash collected, qualified counts). Setter Reports
  board exists but is unused. No commission board (commission posts to a Slack channel).
- **In House Payment Schedule** board (Chris owns): the **deals** (size + payment
  plan). High-confidence data, worth importing.
- **Credit Audits** board (In House Repair workspace): the auditor uploads the
  **NAFA report/PDF**; that upload triggers the send to Close.
- **In House Credit Repair** is the primary workspace.

Import target: fold these into `sales.report_submission`, `sales.deal` /
`finance.payment_plan`, and `credit.nafa` / `credit.intake_submission`, linked by
contact. This is a migration, not a live connector.

## Automation topology (where the logic actually lives)

The **GitHub `TCB operations` repo is the source of truth** for all automation
knowledge. Before changing anything on Close/GHL, check it. Key flows:
- **Close → GHL** (onboarding hand-off): a **Cloudflare Worker**.
- **Intake → audit**: a Worker logs into IdentityIQ, scrapes the report, builds the
  NAFA audit, and on success moves the Close opportunity to **Audit Complete**, then
  sends the report to Close. If the scrape fails, the auditor does it by hand on the
  Credit Audits Monday board (uploading the NAFA PDF triggers the send to Close).
- **Zapier**: ~85 zaps but few active; one moves the Close profile to **Intake Form
  Submitted**. Most real logic has moved to Cloudflare Workers.
- **The new pipeline (mid-July) must re-point all of the above** onto its stages,
  especially the "Closed Won" onboarding trigger. Audit for double-fires first.

## Reporting — Campaign Performance (the unified funnel)

One report, one row per `utm_campaign`, joining all three sources:

| From | Columns |
|---|---|
| Meta | Spend, impressions, clicks, CPC |
| Dub (Pro) | Link clicks, top links |
| Our data | Leads → Booked → Taken → Won → Cash |

Derived per campaign: **CPL** (spend / leads), **cost per booked call**, **CPA**
(spend / deals), **ROAS** (cash / spend). Plus per-lead UTM source on each
contact's story. Empty spend/click columns until Meta/Dub connect; the funnel
half works today from our own data.

---

## The crons (safety net + scheduled pulls)

Defined in `dashboard/vercel.json`, run daily:
- `/api/cron/meta` — Meta ad-spend pull
- `/api/cron/receivables` — age receivables (late at due date, delinquent at 14+ days)
- `/api/cron/writeback` — push queued write-backs to Close/GHL, retry failed
  inbound events, reconcile GHL (48h) and Stripe (3 days)

## Two-way (write-back)

Form outcomes and dashboard edits push OUT to Close (stage + note) and GHL (note)
through a curated allow-list with an echo-guard, so a write-back never loops back
through the inbound sync.

## Priority order to light everything up

1. ~~**Close admin key**~~ — DONE (July 5): read + write live, webhook subscribed.
2. **GHL** — install the Marketplace app on both sub-accounts (Marketing + Repair
   Fulfillment). App is configured; needs the per-sub-account authorize.
3. **Stripe** — webhook + restricted key (handler built, awaiting the key).
4. **NMI** — set the Silent Post URL in the portal (key already connected, ~606 imported).
5. **Meta** — system-user token, or the Make/automation daily push discussed July 2.
6. **Monday** — one-time history import (reports, deals, NAFA); needs the connector built.
7. **Dub** — UTM setup (Miro) + read key for click volume.
