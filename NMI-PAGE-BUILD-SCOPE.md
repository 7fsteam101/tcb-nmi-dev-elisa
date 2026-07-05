# NMI Payment Page: build scope and developer spec

## BUILD STATUS (2026-07-05): BUILT AND TESTED IN NMI TEST MODE

The checkout is built and working end to end against the NMI sandbox (public test
key). Verified live: link generation, the branded pay page rendering the schedule,
first-installment charge + card vaulting, the subscription that schedules the
remaining installments, the signed + idempotent installment webhook, and the
card-on-file update. Card, and Apple Pay / Google Pay buttons, are wired via
Collect.js.

What was built (all deployed):
- `lib/nmi.ts` (gateway client: sale+vault, charge vault, add_subscription, update card, webhook signature verify), `lib/nmi-links.ts` (token + branded URL + schedule + payment recording).
- `app/pay/[token]` (public pay page + Collect.js checkout with wallets + a test-card form for test mode), `app/pay/[token]/card` (card-on-file update).
- `app/api/charge` (sale + vault + schedule), `app/api/webhooks/nmi-events` (per-installment confirmation), `app/api/update-card`.
- Migration `0034_nmi_checkout.sql` (token, vault/subscription ids, status states). Test mode is on via env `NMI_SECURITY_KEY` = the sandbox key.

BLOCKERS to switch from test to live production (each is a config step, not code):
1. **NMI public tokenization key** for Collect.js. Set `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` (from the NMI Merchant Portal). Until then the pay page uses a raw test-card form and the Apple/Google Pay buttons do not render. This is required for real cards (PCI SAQ A) and for wallets.
2. **Live gateway key.** Remove the `NMI_SECURITY_KEY` env (it then reads the live key already in Vault) or set it to the live value. The TEST MODE badge disappears automatically.
3. **Event Webhook subscription + signing key.** In the NMI portal, subscribe `https://pay.thecreditbrothers.com/api/webhooks/nmi-events` to the transaction + recurring + chargeback events, and set `NMI_WEBHOOK_SIGNING_KEY` so signatures are verified (currently unverified, which is only acceptable in test mode).
4. **Apple Pay domain verification.** Enable Apple Pay in the portal and host the `apple-developer-merchantid-domain-association` file at `pay.thecreditbrothers.com/.well-known/`.
5. **DNS.** Point `pay.thecreditbrothers.com` at this Vercel app, and set `NEXT_PUBLIC_PAY_BASE_URL` to it (links currently use tcb-sales-system.vercel.app).
6. **Processor confirmation on wallets + installments** (decision #2 below). Confirm the processor allows a wallet-vaulted card for later installment charges, or restrict wallets to pay-in-full.
7. **Zero-down plans** are not special-cased yet (a `zero_down` plan would attempt a $0 first charge). Needs the vault-only-then-schedule-all path when that pricing launches.

The rest of this doc is the original scope, kept for reference.



A self-contained spec for the dev picking this up. It defines exactly what to
build, the logic, the data it touches, the error handling, and the decisions that
must be settled first. Deep NMI API detail lives in `NMI-PAYMENT-LINKS.md`; this
doc is the build plan that references it.

## 1. Current state (what already exists, so we do not rebuild it)

Already built in the dashboard:
- **Product catalog** `finance.payment_product` (name, amount, `allow_plan`,
  `default_installments`, `default_frequency`) + an admin screen.
- **Link generator** at `app/(app)/payments/` (`generator.tsx`, `actions.ts`) that
  creates a `finance.payment_link` row (amount, description, customer, `contact_id`,
  `product_id`, `installments`, `frequency`, `status`, `url`).
- **Schedule tables** `finance.payment_plan` (+ `plan_type`, `cadence`, `start_date`)
  and `finance.receivable` (installment rows, `status`, `payment_id`).
- **NMI Silent Post webhook** at `app/api/webhooks/nmi` that matches an inbound
  payment to the open receivable of that amount and marks it paid.
- **NMI private key** in Supabase Vault; **product_type** (high/low ticket) on
  payments.

Missing (this is the build):
1. The **pay page** the customer actually sees and pays on (Collect.js + Apple/Google
   Pay), served at `pay.thecreditbrothers.com`.
2. Backend **`/api/charge`** (sale + vault the card).
3. Backend **`/api/schedule`** (create the NMI subscription for the remaining
   installments).
4. An **NMI Event Webhook receiver** for per-installment confirmation (the Silent
   Post handler stays for legacy, but Event Webhooks give per-charge + signature).
5. A **card-on-file update** page.
6. Wiring `payment_link.url` to the real pay page, and creating the plan/receivables
   at generation time.

## 2. Goal and non-goals

**Goal:** a closer generates a link from the dashboard; the prospect opens a branded
page on `pay.thecreditbrothers.com`, pays the first installment (card, Apple Pay, or
Google Pay), the card is vaulted, the remaining installments auto-charge on schedule,
and every charge is confirmed back into Supabase so cash-collected, receivables, and
commissions update on their own.

**Non-goals for v1 (explicit):**
- No sales tax (July 2 decision: price is tax-inclusive, no tax field).
- No full NMI admin console clone inside the dashboard (view invoices/charges is a
  later nice-to-have).
- No dunning automation beyond a failed-payment flag + notification in v1 (retry
  policy is a fast follow).

## 3. Architecture

```
Dashboard (closer)                     pay.thecreditbrothers.com (public)
  Link generator  --creates-->  payment_link + payment_plan + receivables
        |                                   |
        |  url = /pay/<token>               v
        +---------------------->   Pay page (Collect.js + wallets)
                                            |  payment_token
                                            v
                                   POST /api/charge  --> NMI sale + add_customer
                                            |  (installment #1 paid, card vaulted)
                                            v
                                   POST /api/schedule --> NMI add_subscription (N-1)
                                            |
   NMI  --charges vaulted card on schedule--+
     |
     v  signed Event Webhook per charge
  POST /api/webhooks/nmi-events  --> verify sig, idempotent, mark receivable paid,
                                     insert successful_payment (contact + deal linked)
```

**Decision to confirm (flag #1 below):** the pay page can live inside THIS Next.js
app as a public `app/pay/[token]` route (subdomain `pay.thecreditbrothers.com`
points at the same Vercel project), which keeps one codebase and one data layer.
Recommended. The alternative is Josh's separate MVP app calling our API.

## 4. Decisions to settle before building (ambiguity flags)

These block or shape the build. Get an answer on each.

1. **Pay page location.** Build the pay page as a public route in the dashboard app
   (recommended, one data layer) vs. keep Josh's separate `pay.thecreditbrothers.com`
   app and expose our API to it. Affects DNS and where the code goes.
2. **Wallets + installments (the processor caveat).** A card paid via Apple/Google
   Pay may not be reusable for later card-not-present installments. Proposed rule:
   wallets allowed for pay-in-full; installment plans require a real card. Must be
   confirmed with whoever set up the NMI gateway / the processor. If the processor
   supports wallet-in-vault MIT, we can relax this.
3. **Zero-down plans** (`plan_type = zero_down` exists). Define the flow: vault the
   card with no charge today (`customer_vault=add_customer`, no sale), then schedule
   all N installments starting on the first due date. Confirm this is the intended
   zero-down behavior.
4. **Pay-off-early / prepay.** Josh noted some customers prepay the remaining balance.
   Define: cancel the NMI subscription and take one sale for the remaining balance,
   then mark the rest of the receivables paid. Confirm we want this in v1 or later.
5. **Who generates links.** All closers, or admin-gated? The generator exists; confirm
   the permission (currently likely admin/closer).
6. **Failed-installment policy.** Retry count, grace window, and how the customer is
   notified (email via which system) before a receivable flips to late/delinquent.
7. **Card-update delivery.** Is the "update card" link sent manually from the
   dashboard, or self-serve from a failed-payment email, or both?
8. **DNS ownership.** `pay.thecreditbrothers.com` must point at the pay page (Vercel).
   Confirm who owns the DNS record (Cloudflare / Josh) and whether Apple Pay domain
   verification can be hosted there.

## 5. Data model: what is written, when

| Moment | Table writes |
|---|---|
| Closer generates link | `payment_link` (status `pending`, `url`, `contact_id`, `product_id`, `installments`, `frequency`, `amount_minor`); if a plan, a `payment_plan` (draft) + `receivable` rows (status `scheduled`, due dates) |
| Installment #1 approved | `successful_payment` (processor `nmi`, `nmi_transaction_id`, `product_type`, `contact_id`, `deal_id`, `receivable_id`); mark receivable #1 `paid`; `payment_link.status = paid`, `paid_payment_id` set; store `customer_vault_id` (new column, see below) |
| Subscription created | store NMI `subscription_id` on the plan (new column) |
| Each later installment (webhook) | `successful_payment` + mark that receivable `paid` |
| Failed installment (webhook) | receivable stays `scheduled`/flips `late`; flag for dunning |
| Refund / chargeback (webhook) | `finance.reversal`; nets cash and reduces commission |

**Small schema additions this build needs (one migration):**
- `finance.payment_link.nmi_customer_vault_id text`, `finance.payment_link.nmi_subscription_id text` (or put the vault/subscription ids on `payment_plan`).
- `payment_link_status` is currently free text; define the allowed set:
  `pending`, `viewed`, `paid`, `failed`, `expired`, `void` (keep as text with a check,
  or make an enum).
- A `payment_link.token text unique` (the public URL token, distinct from the id) and
  `expires_at ts`.

## 6. Component specs

### A. Pay page — `app/pay/[token]` (public, no auth)
- **Input:** the URL token. Look up `payment_link` by token; 404 if missing, show an
  "expired" state if `expires_at` passed or status is `paid`/`void`.
- **Render (server):** product/description, amount, and if it is a plan, the schedule
  (each installment date + amount) in plain text. Light identifier fields prefilled
  from `customer_name`/`customer_email` (editable). No tax line.
- **Collect.js:** include `Collect.js` with the public tokenization key; render hosted
  card fields + Apple Pay / Google Pay buttons (wallets per decision #2). On submit,
  Collect.js returns a `payment_token`; POST it to `/api/charge` with the token id.
- **On success:** show a confirmation (and the schedule if a plan). On decline: show
  the NMI `responsetext`, let them retry, do not create a plan.
- **State:** set `payment_link.status = viewed` on first load.

### B. `POST /api/charge` (server)
- **Input:** `{ token, payment_token, identifier fields }`. Re-load the link
  server-side; use the SERVER amount, never the client's.
- **Logic:** call NMI `transact.php` `type=sale` + `customer_vault=add_customer` +
  `merchant_defined_field_1 = payment_link.id`. Parse the name/value response.
- **On approved (`response=1`):** insert `successful_payment` (link contact/deal/
  receivable, `product_type`), mark receivable #1 paid, set `payment_link` paid +
  `paid_payment_id` + store `customer_vault_id` + `transactionid`. If it is a plan,
  call `/api/schedule`.
- **On declined/error:** return the message, write nothing except an optional
  `payment_link.status = failed` + a log. Idempotency: if the link is already `paid`,
  return the existing result (double-submit guard).

### C. `POST /api/schedule` (server, called after a successful plan #1)
- **Logic:** NMI `recurring=add_subscription`, `plan_payments = N-1`,
  `plan_amount = installment`, frequency from the plan cadence, `start_date` = due
  date of installment #2 (`YYYYMMDD`), `source_transaction_id = #1 txn id` (binds to
  the vaulted card). Store the returned `subscription_id`.
- **Critical:** card subscriptions do NOT charge on creation, so there is no double
  charge. If this call fails after #1 succeeded, retry; if it still fails, alert (an
  admin flag) because #1 is charged but the remainder is unscheduled. Do not silently
  drop it.

### D. `POST /api/webhooks/nmi-events` (public, signed)
- **Verify** the `Webhook-Signature` header: HMAC-SHA256 of `nonce + "." + rawBody`
  against the signing key; reject on mismatch. Optionally allow-list NMI source IPs.
- **Idempotent** on `event_id` (land in `sync.raw_events` like the other sources).
- **On `transaction.sale.success`:** match the plan via `merchant_defined_field_1`
  (or `customer_vault_id`), find the next open receivable, insert `successful_payment`,
  mark it paid. On `transaction.sale.failure`: flag the receivable for dunning.
- **On `transaction.refund.success` / chargeback events:** create a `reversal`.
- NMI retries up to 20 times over 3 days, so a 200 must only be returned after the
  event is durably stored.

### E. Card-on-file update — `app/pay/[token]/card` (public)
- Collect.js to get a fresh token, then NMI `customer_vault=update_customer` +
  `customer_vault_id`. The `customer_vault_id` is unchanged, so the running
  subscription charges the new card. Guard: only valid for links with an active vault.

### F. Link generator changes (existing UI)
- On generate: also create the `payment_plan` (draft) + `receivable` rows when it is a
  plan, compute the schedule (dates from cadence + start), set `payment_link.url` to
  `https://pay.thecreditbrothers.com/pay/<token>`, `status = pending`, `expires_at`.

## 7. Status transitions

- **payment_link:** `pending` -> `viewed` -> `paid` (or `failed` on decline, `expired`
  past `expires_at`, `void` if cancelled).
- **receivable:** `scheduled` -> `paid` (on charge) or `late`/`delinquent` (aging cron
  + failed webhook) or `waived`.
- **payment_plan:** draft -> current on first payment; a re-plan supersedes (existing
  behavior).

## 8. Error handling (must be built, not assumed)

- Card decline on #1: surface message, allow retry, create nothing.
- Schedule call fails after #1 charged: retry, then admin alert (charged-but-unscheduled).
- Invalid webhook signature: 401, no writes.
- Duplicate webhook: idempotent on `event_id`.
- Expired or tampered token: 404 / expired screen; never trust a client-supplied amount.
- Installment charge fails: dunning flag + notification + receivable ages to late.
- Refund / chargeback: reversal, nets cash, reduces the rep's commission (existing rule).
- Wallet paid #1 then card-not-present blocked for MIT: see decision #2; guard so a
  plan is never created against an unchargeable wallet token.

## 9. Security

- Card data never touches our server (Collect.js hosted fields, SAQ A).
- Private `security_key` only server-side (Vault), never on the page; the page uses the
  public tokenization key.
- Server is the source of truth for amount and schedule (token lookup, not query
  string).
- Webhook signature verification mandatory.
- The pay page is public but only exposes what a payer needs (amount, schedule,
  masked confirmation).

## 10. Acceptance criteria (sandbox first)

1. Generate a 3-installment link from the dashboard; the pay page renders the schedule.
2. Pay #1 with a sandbox test card; receivable #1 = paid, `successful_payment` created
   and linked to the contact, `payment_link` = paid, vault id stored.
3. A subscription is created for 2 remaining; NMI sandbox fires them on schedule (or
   forced) and the webhook marks each receivable paid.
4. Apple Pay / Google Pay buttons render and tokenize (per decision #2).
5. Card-update page swaps the card; the subscription keeps running.
6. A forced decline shows the message and creates no plan.
7. A refund event produces a reversal.
8. Then repeat once on the production key with a real low-value charge.

## 11. Build order and rough effort (for the dev)

1. Schema migration (vault/subscription ids, token, status set, expires_at). ~0.5 day.
2. Link generator: create plan + receivables + token + url on generate. ~0.5 day.
3. Pay page render (server) + Collect.js card fields (no wallets yet). ~1 day.
4. `/api/charge` (sale + vault) against sandbox. ~1 day.
5. `/api/schedule` (add_subscription). ~0.5 day.
6. Event Webhook receiver + signature verify + receivable/payment writes. ~1 day.
7. Apple Pay / Google Pay (enable, domain verify, buttons). ~0.5-1 day.
8. Card-update page. ~0.5 day.
9. Sandbox end-to-end test pass, then production smoke test. ~0.5 day.

Rough total: 6 to 7 focused days for one dev, plus the decisions in section 4 up
front and the NMI portal config (keys, Apple Pay domain, webhook subscription).

## 12. Handoff notes

- Read `NMI-PAYMENT-LINKS.md` first for the exact API params and the two-step
  charge-then-schedule pattern.
- Use the NMI **sandbox** key until acceptance passes; never test with a live card
  until the sandbox flow is green.
- Everything maps to existing tables (`payment_link`, `payment_plan`, `receivable`,
  `successful_payment`, `reversal`), so cash-collected, receivables, and commissions
  update with no extra reporting work.
- The one true blocker is decision #2 (wallets + installments). Confirm it with the
  processor before wiring wallets into the plan flow.
