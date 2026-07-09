# TCB Sales System: Status and Launch Plan

Updated 2026-07-09. The single source of truth for where the project stands and
how it goes live. Companion docs: CONNECTIONS-TRIGGERS.md (per-connector detail),
CLIENT-DECISIONS.md (decision log), NMI-PAGE-BUILD-SCOPE.md + NMI-DEV-HANDOFF.md
(payments build), DEV-ONBOARDING.md (developer onboarding), UTM-TRACKING.md.

## 1. Where we are (done and live)

**The dashboard** (tcb-sales-system.vercel.app, Next.js on Vercel): overview with
funnel KPIs and utilization, call logs with custom columns, contacts with the
identity graph, closer analytics, revenue, receivables, commissions, payment
links with custom plans, meta page, forms (sales call, missed call, post-call,
setter EOD), announcements and knowledge base, per-entity detail panels
(Airtable-style), admin (users, team, calendars, products, plans, goals,
commission rules, options), view-as, demo mode, dark/light.

**The data layer** (Supabase): 7 domain schemas, 39 migrations, RLS on every
table with zero anon access, performance indexes on every hot path, integrity
invariants enforced (one current slot per call, merge pointers, append-only
identifiers), all money in integer cents.

**Connections live today:**
| Source | Status | What flows |
|---|---|---|
| Close CRM | LIVE, two-way | 794 leads, 506 opportunities mirrored in real time by webhook; forms write stage + note back; NEW 19-stage Sales pipeline mapped both directions (we added the missing Won PIF stage) |
| GHL (both sub-accounts) | LIVE, daily sync | 18,643 events: 289 opt-ins, 1,000+ appointments with reschedule history, 8,029 contacts (187 dupes merged), strict BDCR calendar whitelist, setter/self split stamped |
| Stripe | LIVE, webhook + daily reconcile | 12,064 charges (2023 to today), 253 refunds as reversals, 102 disputes; old non-BDCR history recorded but excluded from sales KPIs |
| NMI | Key live, history in | 606 program payments powering cash-collected and receivables; branded checkout (pay page) built and sandbox-tested, production cutover with the dev |
| Monday | Token live, import staged | Core-four import (call reports, missed calls, payment schedule, credit audits) built, dry-run in progress; brings attendance truth + full deal history |
| Commission engine | LIVE | July 2 comp plan: closer 10% of invoice gated at 25% collected, monthly statements, leaderboard, per-rep toggles, daily recompute |

**Team setup:** repo in the 7fsDev org, the shared 7fsteam101 account onboarded
for the NMI dev with a written onboarding doc; tcb-operations audit token waiting
on Josh's approval.

## 2. The operating principle for launch

Launch does not mean "data appeared once." It means: **every number updates
itself, every new thing the client creates can be wired without code, and the
team trusts the numbers because they were verified against the sources.** The
plan below is organized around that.

## 3. Workstreams to launch

### WS1. Always-up-to-date Supabase (real-time integrity)
- DONE: Close webhook (instant), Stripe webhook (instant), NMI history, daily
  crons (meta pull, receivables aging + custom-installment charging + commission
  recompute, writeback + GHL 2-day resync + failed-event retry).
- TO DO:
  1. **GHL real-time**: today GHL syncs daily. Add the 9 workflow webhooks in each
     sub-account (bookings, reschedules, cancels, shows, forms) posting to our
     endpoint, so bookings appear in seconds, not tomorrow. (Template exists in
     CONNECTIONS-TRIGGERS.md section 2B; ~30 min inside GHL, no code.)
  2. **NMI Silent Post confirm** in the NMI portal so go-forward program payments
     post instantly (key already live).
  3. **Sync health surface**: a Connections-page banner + daily check that flags
     any source whose last event is older than expected (stale = visible, not
     silent).

### WS2. Future-proof intake (new funnels, forms, calendars without code)
The pattern already exists for calendars: a new GHL calendar lands in an
"uncategorized" list and an admin marks what it is (strategy, readiness, follow
up, not-sales). Extend the same pattern to everything:
1. **Form registry** (like calendar_map): every new GHL form auto-appears;
   admin marks it "counts as lead opt-in" / ignore; unmapped forms flagged on
   the Connections page. New funnel = connect its calendar + form in admin,
   zero code.
2. **Stage mapping admin surface** (your ask): a mapping table where every
   stage label seen from Close lands; unmapped labels show up for an admin to
   assign the system meaning (which pipeline stage it equals, whether it counts
   as booked / taken / cancelled / won). Replaces the hardcoded alias list, so
   when they add stages next quarter, an admin maps them in the dashboard and
   reporting keeps working.

### WS3. Contracts (sent + signed)
- Data model and Contracts page already exist (sales.agreement, statuses).
- TO DO: connect the source of truth. Contracts live in GHL Marketing
  (Documents and Contracts). Add the GHL documents pull (may need one extra
  app scope + reinstall), map sent_at / signed_at, and mirror the Close
  "Contract Sent / Contract Signed" stages onto the agreement record. Then the
  contract-to-close funnel (sent -> signed -> paid) reports itself.

### WS4. Attribution: UTMs, Meta, campaign ROI
- Dashboard side DONE (capture fields, campaign report joining on utm_campaign).
- TO DO (mostly client-side, tracked here so it does not stall):
  1. Miro: hidden UTM fields on every GHL opt-in form + Dub links carrying UTMs
     (Loom SOP from Katie).
  2. Naming convention: utm_campaign must equal the Meta campaign name.
  3. Meta system-user token (read-only, never expires) -> paste -> spend
     backfill + daily pull light up CPL / cost-per-booked-call / ROAS.
  4. Optional Dub Pro key for click volume.

### WS5. Cross-platform integrations (their automation stack)
- Their GHL -> Close -> Slack glue runs on Josh's Cloudflare Workers + Zapier,
  documented in the tcb-operations repo.
- TO DO:
  1. Audit that repo the moment Josh approves the token (watcher armed):
     produce the map of every flow, what fires it, and what must be re-pointed
     to the new pipeline (the onboarding worker is the known critical one).
  2. Coordinate the pipeline migration: Josh re-points onboarding off old
     "Closed Won", then the team moves open opportunities to the new pipeline.
  3. Longer term: decide which flows migrate INTO our system (we already push
     Close stage + notes; Slack notifications from our system are a natural
     next: booking alerts, no-show alerts, deal-won posts).

### WS6. Pushing data TO the other platforms (outbound writes)
- The pattern is live: a curated allow-list queue with an echo-guard
  (close_update_opportunity_stage, close_create_note, ghl_create_contact_note),
  dispatched instantly and swept daily.
- TO DO as needed: extend the allow-list deliberately (Close custom fields,
  Close tasks, GHL tags) one operation at a time. Anything not on the list
  cannot fire, which is the safety model. Adding an op is a small, reviewed
  code change, and that is intentional.

### WS7. Numbers the team can trust (reconciliation + data truth)
1. Finish the Monday import (in flight): attendance truth (taken / no-show),
   full deal history (~305 clients vs our reconstructed 44), NAFA audits.
2. **Reconciliation pass**: dashboard totals vs Close (opportunity counts by
   stage), GHL (bookings), NMI (payments), Stripe (fees), Monday (deals):
   publish the deltas, fix or explain every one. This is what lets you tell
   Josh "these numbers are verified."
3. Ongoing: the sync-health surface (WS1.3) keeps it true.

### WS8. Documentation + GitHub operating setup
1. Docs: this file is the index; per-connector detail already in
   CONNECTIONS-TRIGGERS.md; add a short "how the team uses it" manual (the
   in-app Knowledge Base is the natural home) + keep DEV-ONBOARDING.md current.
2. GitHub: repo lives in the 7fsDev org. Add branch protection on main (PRs
   only), a CI typecheck on PRs, and keep the dev on feature branches. Secrets
   stay in Vercel env + Supabase Vault, never in the repo.

### WS9. Dashboard improvements (continuous)
Katie's feedback loop continues as its own lane; next known items: re-enable
logins before team rollout (auth is deliberately off right now), Supabase Pro
upgrade for backups, plus whatever the team surfaces in week one.

## 4. Launch sequence (the order that de-risks)

| Phase | What | Gate to next |
|---|---|---|
| 1. Data complete | Monday import live-run; GHL workflow webhooks; NMI silent post; Meta token | All sources flowing |
| 2. Verified | Reconciliation pass vs every source; publish deltas | Numbers signed off |
| 3. Pipeline cutover | Josh re-points onboarding; team migrates opportunities to the new pipeline; stage-map admin live | One week clean on new pipeline |
| 4. Team rollout | Logins ON, roles assigned, reps use the forms daily (reports feed attendance + deals + commissions) | Reps submitting daily |
| 5. Client-facing | NMI checkout to production (dev); weekly report cadence; Slack notifications | Steady state |

## 5. Who owns what right now

| Owner | Items |
|---|---|
| Claude (build) | Monday import live-run, stage-map admin surface, form registry, sync-health banner, contracts pull, reconciliation pass, Slack notifications, dashboard iterations |
| Katie | GHL workflow webhooks (30 min click-through, guide ready), NMI Silent Post toggle, Supabase Pro, "go" moments |
| Josh (client) | Approve the tcb-operations token, re-point the onboarding worker, Meta system-user token, migrate opportunities |
| Miro (client) | UTM hidden fields + Dub links + naming convention |
| Dev (7fsteam101) | NMI checkout production cutover (tokenization key, live key, webhook signing, Apple Pay domain, DNS) |
