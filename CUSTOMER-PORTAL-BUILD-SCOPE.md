# Customer Billing Portal — v1

Self-service billing portal for customers (the NMI equivalent of Stripe's Customer
Portal). v1 ships the customer-facing surfaces + the security model. The Admin
Panel to configure toggles/branding comes later; v1 already reads those settings,
so the admin build is just a UI over `core.app_setting`.

## What's in this drop

| File | What it is |
|---|---|
| `supabase/migrations/0054_customer_portal.sql` | `core.portal_token` table + seeds the 8 `portal_*` feature/branding flags |
| `dashboard/lib/portal.ts` | The whole data layer: session guard, token mint, customer rollup queries, feature flags |
| `dashboard/app/portal/[token]/layout.tsx` | Branded, self-contained shell + feature-gated nav |
| `dashboard/app/portal/[token]/page.tsx` | Billing history, cards on file, subscriptions, upcoming payments (read-only) |
| `dashboard/app/portal/[token]/account/{page,form,actions}.tsx/ts` | Business-info edit (the one write surface) |

## The model in one paragraph

A **per-customer** token (`core.portal_token`) resolves `token -> contact_id`.
This is distinct from `payment_link.token` (per-link, short-lived). Every query
in `lib/portal.ts` is scoped by the `contactId` that `getPortalSession()` returns —
that single guard is the "customers only see their own data" acceptance criterion.
Invoices come from `finance.payment_link` (has `contact_id`), receipts/schedule
from `successful_payment`/`receivable` joined via `deal.contact_id`, cards from the
distinct vaults on the customer's links. Card **updates reuse the shipped
`/pay/<link_token>/card` page** — no new charge/update code in v1.

## Two required steps before it runs

**1. Add the portal to the public route allowlist.** In `dashboard/proxy.ts`,
add `/^\/portal\//` to the `PUBLIC` array (customers aren't staff; they must not
hit the login redirect). The reused `/pay/` card page is already public.

```ts
const PUBLIC = [/^\/login/, /^\/api\/login/, /^\/api\/webhooks\//, /^\/api\/cron\//,
  /^\/api\/connect\//, /^\/pay\//, /^\/api\/charge/, /^\/portal\//,  // <-- add
  /^\/_next\//, /^\/favicon/];
```

**2. Verify one join against your MERGED schema.** This code was written against
the pre-merge clone (up to `0038`); the canonical merge (commit `9e37829`) stamped
`contact_id` on live payments. In `lib/portal.ts`, `listCustomerReceipts` and
`listCustomerSchedule` join through `deal.contact_id` — the safe floor that works
regardless. **If** `finance.successful_payment` now has a direct `contact_id`
column, you can swap the join for a flat `where sp.contact_id = ${contactId}` (both
are correct; the join just also catches deal-linked plan payments). Confirm which
before relying on the history view. Also confirm `deal` is in the `sales` schema on
your branch (`sales.deal`) — it is on mine.

## Migration numbering

Numbered `0054` = next free after your `0053_charge_now` rename. If your merged
branch already has a `0054`, bump this one to the next free number (rename the file,
nothing inside references the number).

## How to test (NMI sandbox / test mode)

1. Apply the migration: `supabase db push --db-url "$SUPABASE_DB_URL"`.
2. Mint a link for a contact that has payment links (in `psql` or a scratch route):
   ```sql
   insert into core.portal_token (token, contact_id)
   values ('testportal123', '<a contact_id that has payment_links>')
   returning token;
   ```
3. Open `/<your-app>/portal/testportal123`. You should see that customer's billing
   history, cards on file (brand ••• last4 · exp), any subscriptions, and upcoming
   installments — and **nothing** belonging to any other customer.
4. Flip a flag and reload to confirm gating hides the surface:
   ```sql
   update core.app_setting set value = 'false' where key = 'portal_show_payment_methods';
   ```
5. Hit `/portal/testportal123/account`, edit a field, save — confirm it persists and
   the header greeting/name updates.
6. Click "Update card →" on a card row — confirm it lands on the existing, working
   `/pay/<token>/card` page.
7. Revoke and confirm it 404s:
   `update core.portal_token set revoked_at = now() where token = 'testportal123';`

## In scope for v1
- Secure per-customer portal link (token guard, expiry, revoke)
- Billing/payment history (invoices + receipts + upcoming schedule)
- View payment methods; update via the reused pay-page flow
- Edit business/account info (email intentionally read-only, Stripe parity)
- View subscriptions
- Every surface gated by a `portal_*` flag with a sane default
- Configurable brand name + accent (read from settings)

## Deferred (next, deliberately)
- **Admin Panel** UI to flip `portal_*` flags + branding (settings + reads already exist)
- **Subscription cancellation** — needs `cancelSubscription()` in `lib/nmi.ts` (NMI
  `delete_subscription`); flag `portal_allow_cancel` already seeded `false`
- **Email + OTP self-login** (v1 uses a durable link, on-spec per the ticket)
- **Writeback of account edits to Close/GHL** — `updatePortalContact` has the hook
  point marked; decide if edits enqueue `sync.writeback_queue`
- **Canonical-vault choice** — if a customer accumulates multiple vaults across
  links, v1 lists each; a "default card" concept can come with the admin work

## Open decisions to settle
1. One canonical card per customer, or many (v1 shows many)?
2. Do account edits sync back to Close/GHL, or stay local (v1 = local)?
3. Token lifetime — durable (v1 default, no expiry) vs. rolling/OTP (v2)?
