# NMI Payment-Link Generation: setup and build guide

How the dashboard generates a branded payment link, takes the first installment
(with Apple Pay / Google Pay), stores the card, auto-charges the remaining
installments, and confirms each charge back into Supabase.

Target page: `pay.thecreditbrothers.com` (Next.js on Vercel, the MVP Josh built).
Goal (from the July 2 call): reduce buying friction by offering wallets, which GHL
invoices lack, while keeping the whole thing on our own domain and inside the
dashboard's data.

Sources: NMI developer docs (docs.nmi.com: Collect.js, Customer Vault, Recurring,
Webhooks, Digital Wallet), the NMI Payment API (classic Direct Post), and NMI
support articles, all verified July 2026.

## The building blocks NMI gives us

- **Collect.js** — a client-side library that renders NMI-hosted card fields (in
  iframes, so the card never touches our server, keeping us in the lightest PCI tier
  SAQ A) and the Apple Pay / Google Pay buttons. It returns a single-use
  `payment_token` (valid 24h) that our backend posts to NMI.
- **Customer Vault** — stores the card so we can charge it again later without the
  card present (`customer_vault_id`).
- **Recurring (`add_subscription`)** — schedules a fixed number of installments
  (`plan_payments`) that auto-charge the vaulted card on a schedule, then stop.
- **Event Webhooks** — NMI POSTs a signed JSON event to our endpoint every time a
  charge succeeds, fails, refunds, or a chargeback opens.

Auth for all server calls: a single `security_key` = the **private API key**
(Merchant Portal, Settings, Security Keys). Classic endpoint:
`https://secure.nmi.com/api/transact.php`, form-encoded POST, name/value response
(not JSON, parse accordingly). Collect.js uses a separate **public tokenization
key** on the page, never the private key.

## The flow (end to end)

**1. Closer generates the link (dashboard).** The closer picks the product /
amount, the number of installments, the cadence, and the first date. The backend
writes a `finance.payment_link` + `finance.payment_plan` (plan id, total, N,
per-installment amount, schedule, status) and returns a tokenized URL like
`pay.thecreditbrothers.com/p/<token>`. Store the amount and terms server-side and
fetch them by token. Never trust an amount passed in the query string (a prospect
could edit it).

**2. Prospect opens the pay page.** Server-render the item name, price, and the
payment schedule (dates + amounts) in plain text (the July 2 decision: show the
schedule, plain text, no GHL-style dropdowns). Mount Collect.js card fields plus
the Apple Pay / Google Pay buttons. Required inputs: card number, expiry, zip, plus
a light identifier (name, email or phone) so we can tie the payment to a contact.

**3. First installment + vault (backend `/api/charge`).** Collect.js hands us a
`payment_token`. Post one sale that also stores the card:
```
POST https://secure.nmi.com/api/transact.php
security_key=<PRIVATE>&type=sale&amount=<installment_1>&payment_token=<token>
&customer_vault=add_customer&first_name=<>&last_name=<>&email=<>
&merchant_defined_field_1=<our plan_id>
```
On `response=1` (approved), capture `transactionid` and `customer_vault_id`, and
mark installment #1 paid in Supabase.

**4. Schedule the remaining installments.** Immediately create a subscription for
the rest, bound to the card we just vaulted:
```
POST https://secure.nmi.com/api/transact.php
security_key=<PRIVATE>&recurring=add_subscription
&plan_payments=<N-1>&plan_amount=<installment>
&month_frequency=1&day_of_month=<dd>        (monthly)   -- OR --
&day_frequency=<n>                           (every n days)
&start_date=<YYYYMMDD of installment #2>
&source_transaction_id=<installment_1 txn id>
&merchant_defined_field_1=<our plan_id>
```
Key facts that make this correct:
- `plan_payments=N-1` bounds it to a **fixed** count, then it stops on its own.
- Card-based subscriptions **do not charge immediately**; the first debit waits
  for `start_date`. That is why we take installment #1 as a separate sale (step 3)
  and schedule only the remainder here. No double charge today.
- `source_transaction_id` (or `customer_vault_id`) binds the schedule to the exact
  card, so we never resend card data.
- `start_date` format is `YYYYMMDD`.

**5. Auto-charges.** NMI charges the vaulted card on each due date for N-1 cycles.

**6. Confirmation into Supabase (Event Webhook).** Point an NMI Event Webhook at a
Vercel route (or Supabase edge function) subscribed to `transaction.sale.success`,
`transaction.sale.failure`, `transaction.refund.success`, `recurring.subscription.*`,
and the chargeback events. For each event: **verify the `Webhook-Signature` header**
(HMAC-SHA256 of `nonce + "." + rawBody` against the signing key), then upsert by
`event_id` / `transaction_id` (idempotent, because NMI retries up to 20 times over
3 days until it gets a 200), match it to the plan via our `merchant_defined_field_1`,
and mark that installment paid or failed. A failure kicks off dunning (email the
prospect, retry). This is the same `sync.raw_events` idempotency pattern we already
use for Close and NMI Silent Post.

Confirm each *actual* installment off the per-charge `transaction.sale.*` events,
not the `recurring.subscription.*` lifecycle events (those fire on schedule changes,
not money moving).

**7. Card-on-file update (self-serve).** A small page reuses Collect.js to get a
fresh token, then:
```
security_key=<PRIVATE>&customer_vault=update_customer
&customer_vault_id=<id>&payment_token=<new token>
```
The `customer_vault_id` stays the same, so the running subscription simply charges
the new card. Optionally enable NMI Automatic Card Updater so reissued cards refresh
without the customer doing anything.

## Apple Pay / Google Pay setup (the friction reducer)

- **Google Pay:** available to all merchants, no extra setup. Collect.js renders it.
- **Apple Pay:** in Merchant Portal, Settings, Apple Pay, enable it, then
  domain-verify: download the `apple-developer-merchantid-domain-association` file
  and serve it at `https://pay.thecreditbrothers.com/.well-known/`, and add the
  domain to the allowed list.
- Both wallets return their payment in the **same `payment_token`** field, so the
  backend charge code is identical regardless of how they paid.

## Gotchas and the decisions they force

1. **Wallet + installments caveat.** Wallet-based recurring behaves differently: a
   wallet charge can fire immediately at vault/subscription creation, and some
   processors will not let a wallet device-token be reused for later card-not-present
   installment charges. **Recommendation:** allow wallets for pay-in-full freely; for
   installment plans, take installment #1 as a normal sale (wallet or card both give
   a `payment_token`) but require a real card to vault + schedule the remainder, or
   confirm our processor supports wallet-in-vault first. Decide this with the
   processor before launch.
2. **Two-step, not one call.** There is no single "charge now and schedule the rest"
   call for cards. The charge-#1-then-subscription-of-N-1 pattern above is the
   standard NMI way and avoids a double charge.
3. **Name/value response, not JSON** (classic API). The `/api/charge` route must
   parse `application/x-www-form-urlencoded`. NMI also has a newer v5 REST API (JSON,
   Bearer-style private key) if we prefer JSON end to end, at the cost of leaving the
   most-documented classic path.
4. **NMI's own Invoicing / Hosted Checkout can't drive our installment schedule**, so
   they are only fallback "email a payment link" channels, not the engine. Our
   Collect.js page is the engine.
5. **No sales tax** in v1 (July 2 decision): no tax field, price is tax-inclusive.

## How it maps to our Supabase schema

- `finance.payment_product` — the catalog the closer picks from (admin-managed).
- `finance.payment_link` — one row per generated link (contact, product, amount,
  token, status, the settling payment).
- `finance.payment_plan` + `finance.receivable` — the installment schedule (N rows,
  due dates, amounts, status).
- `finance.successful_payment` — each actual charge, tagged `processor='nmi'`,
  `nmi_transaction_id`, `product_type` (high vs low ticket, already added), linked to
  `contact_id`, `deal_id`, and the matched `receivable_id`.
- The webhook marks the matching receivable paid and inserts the successful payment,
  exactly like the existing NMI Silent Post path, so commissions and cash-collected
  update automatically.

## Setup checklist (what has to exist before it works)

1. NMI private key in Supabase Vault (Connections, NMI) — **done**.
2. NMI public **tokenization key** for Collect.js on the page (Merchant Portal).
3. Apple Pay enabled + `pay.thecreditbrothers.com` domain-verified (the `.well-known`
   file).
4. NMI **Event Webhook** subscribed to the transaction + recurring + chargeback
   events, pointed at our endpoint, with the **signing key** stored for verification.
5. The pay page (Collect.js + wallets + schedule display) on `pay.thecreditbrothers.com`.
6. The `/api/charge` (sale + vault) and `/api/schedule` (add_subscription) backend
   routes, plus the webhook receiver.
7. Confirm with the processor whether wallet tokens can be vaulted for MIT
   installments (drives gotcha #1).

## Recommended build order

1. Backend: link generation writing `payment_link` + `payment_plan` (no NMI yet).
2. Pay page rendering the plan + Collect.js card fields (no wallets yet).
3. `/api/charge` (sale + `add_customer`) against the NMI sandbox key.
4. `/api/schedule` (`add_subscription`, `plan_payments=N-1`).
5. Event Webhook receiver with signature verification, into `successful_payment` /
   `receivable`.
6. Apple Pay / Google Pay (domain verify + wallet buttons).
7. Card-on-file update page.
8. Swap sandbox key for production, run one real low-value end-to-end test.
