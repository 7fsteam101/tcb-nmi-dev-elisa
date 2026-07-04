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

**What we want:** when a rep moves an opportunity to a new stage in Close, the
matching opportunity in Supabase updates its stage; a won stage flags onboarding;
a lead edit updates the contact.

**Setup (needs an ADMIN Close API key — the current key can read but not create
webhooks):**
1. In Close, an admin creates an API key (Settings → Developer → API Keys).
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

## 4. NMI — program payments

1. NMI portal → Settings → Security Keys → create a private key → paste in
   Connections → NMI.
2. NMI portal → Settings → Silent Post URL → paste the NMI URL (Connections page).

**What fires:** approved payment → matched to the open receivable of that amount
on the contact's plan (marks it paid); refund/void/chargeback → reversal.

---

## 5. Meta — ad spend

1. Business Manager → create a system-user token with `ads_read` on the ad
   account.
2. Paste it in Connections → Meta, and set `META_AD_ACCOUNT_ID` (Vercel env).

**What fires:** a daily cron pulls per-ad spend/CPC/CTR (re-pulling a trailing
window to catch Meta's restatements) into `marketing.ad_spend`.

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

1. **Close admin key** — the instant pipeline mirror (biggest single unlock)
2. **GHL** — publish the app + install both sub-accounts (or the workflow webhooks)
3. **Stripe** — webhook + restricted key
4. **NMI** — silent post URL (key already connected)
5. **Meta** — system-user token
