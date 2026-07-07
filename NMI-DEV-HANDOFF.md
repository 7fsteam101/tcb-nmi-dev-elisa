# NMI Checkout: developer handoff

Everything you need is in this repo. You do NOT need anyone's chat history. The
context lives in two docs plus the code and the commit history, and your Claude
Code will rebuild the full picture from them.

## Status: built and tested in NMI TEST MODE

The branded NMI checkout is implemented and verified end to end against the NMI
sandbox (the public test key). Do not rebuild it; your job is to take it to
production and finish the open items below.

Verified working in test mode: generate a link, the branded pay page renders the
schedule, first installment charges + the card is vaulted, remaining installments
are scheduled (NMI subscription for regular cadences; our cron for custom
schedules), the signed idempotent webhook confirms each charge into Supabase, and
the card-on-file update works.

## Read these first (they are the spec)

1. `NMI-PAGE-BUILD-SCOPE.md` (repo root) — the build scope. The top section
   "BUILD STATUS" lists exactly what is done and the go-live blockers. The rest is
   the full component spec, data model, error handling, and acceptance criteria.
2. `NMI-PAYMENT-LINKS.md` (repo root) — the technical guide from the NMI docs:
   Collect.js + Apple/Google Pay, Customer Vault, add_subscription installments,
   Event Webhooks + signature verification, the charge-then-schedule pattern, all
   mapped to our Supabase tables.

## File map

- `dashboard/lib/nmi.ts` — NMI gateway client (sale+vault, chargeVault,
  addSubscription, updateVaultCard, verifyWebhookSignature, `ok()`). Test vs live
  key resolution is here.
- `dashboard/lib/nmi-links.ts` — token + branded URL, schedule computation,
  `scheduleFor`, `recordNmiPayment`, `chargeDueCustomInstallments` (the custom-plan
  cron worker).
- `dashboard/app/pay/[token]/page.tsx` + `checkout.tsx` — the public pay page
  (Collect.js card + wallet buttons + a test-card form for test mode).
- `dashboard/app/pay/[token]/card/page.tsx` — card-on-file update page.
- `dashboard/app/api/charge/route.ts` — first-installment sale + vault + schedule.
- `dashboard/app/api/webhooks/nmi-events/route.ts` — signed, idempotent per-charge
  confirmation (writes successful_payment / receivable / reversal).
- `dashboard/app/api/update-card/route.ts` — updates the vaulted card.
- `dashboard/app/(app)/payments/` — the link generator UI (products, plan vs
  one-time, custom per-installment amount/date editor, pro-forma preview).
- `dashboard/app/api/cron/receivables/route.ts` — daily cron; also charges due
  custom installments.
- Migrations `supabase/migrations/0034_nmi_checkout.sql` and `0035_custom_schedule.sql`.

## Run and test it yourself (sandbox, no live money)

1. `cd dashboard && npm install`.
2. Create `dashboard/.env.local` with at least `DATABASE_URL` (the Supabase pooler
   connection string) and `NMI_SECURITY_KEY=6457Thfj624V5r7WUwc5v6a68Zsd6YEm` (the
   public NMI sandbox key; this is what puts it in TEST MODE). Ask Katie for the
   DATABASE_URL or your own Supabase access. Never commit `.env.local` (gitignored).
3. `npm run dev`, open the Payments page, create a plan link, open `/pay/<token>`,
   pay with test card `4111 1111 1111 1111`, any future expiry, CVV `999`.
4. Read `NMI-PAGE-BUILD-SCOPE.md` section "Acceptance criteria" for the full test
   checklist.

## What is left

Go-live blockers (config, not code; each is in NMI-PAGE-BUILD-SCOPE.md):
1. NMI public tokenization key -> set `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` (enables
   the real Collect.js hosted fields + the Apple/Google Pay buttons).
2. Swap the sandbox key for the live gateway key (remove/replace `NMI_SECURITY_KEY`;
   the live key is in Supabase Vault under the NMI connection).
3. Subscribe the NMI Event Webhook + set `NMI_WEBHOOK_SIGNING_KEY`.
4. Apple Pay domain verification on `pay.thecreditbrothers.com` (`.well-known` file).
5. DNS: point `pay.thecreditbrothers.com` at the app; set `NEXT_PUBLIC_PAY_BASE_URL`.
6. Confirm with the processor whether wallets can be vaulted for MIT installments
   (else wallets = pay-in-full only).
7. Zero-down plans are not special-cased yet (a `zero_down` plan would attempt a $0
   first charge); add the vault-only-then-schedule path when that pricing launches.

## Access you will need

- The GitHub repo `github.com/7fsDev/tcb-sales-system` (Katie adds you as a
  collaborator). Work on a branch (e.g. `nmi-prod`) and open a PR, do not push
  straight to main.
- A Supabase connection string for local dev (Katie provides).
- For production: the NMI Merchant Portal (tokenization key, webhook signing key,
  Apple Pay), and the Vercel project (Katie provides deploy access).
- The sandbox NMI key above is public and safe to use for all testing.

## Paste this into your Claude Code to start with full context

> Read NMI-DEV-HANDOFF.md, NMI-PAGE-BUILD-SCOPE.md, and NMI-PAYMENT-LINKS.md in the
> repo root, plus dashboard/lib/nmi.ts, dashboard/lib/nmi-links.ts, and
> dashboard/app/pay/[token]/. The NMI branded checkout is already built and tested
> in NMI test mode (sandbox key). My job is to take it to production and finish the
> open items in the "What is left" section. First confirm the sandbox flow runs,
> then work the go-live blockers in order. Follow dashboard/AGENTS.md (this is
> Next.js 16, not older) and the postgres pooler rules in dashboard/lib/db.ts. Do
> not rebuild what already works.
