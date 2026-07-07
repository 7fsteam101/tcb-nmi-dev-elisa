# NMI Payment Links: production go-live checklist

The branded checkout at `pay.thecreditbrothers.com` is **already built and tested end
to end against the NMI sandbox** (link generation, the pay page with Collect.js + Apple/
Google Pay, first-installment charge + card vault, the subscription for installments
2..N, the signed idempotent webhook, and card-on-file update). See the build spec
`NMI-PAGE-BUILD-SCOPE.md` and the API detail `NMI-PAYMENT-LINKS.md` — those stay the
reference. This doc is only what remains to flip it live. Every item is a config or a
decision, not new code, except the one zero-down case in step 8.

Prepared by 8 Figure Systems, July 5, 2026.

## The cutover, in order

1. **Public tokenization key.** Set `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` (NMI Merchant
   Portal). Until this is set the page falls back to a raw test-card form and the
   wallet buttons do not render. Required for real cards (keeps us PCI SAQ A) and for
   Apple/Google Pay.

2. **Live gateway key.** The live private key is already in Supabase Vault. Remove the
   `NMI_SECURITY_KEY` env override (so it reads the live key) or set it to the live
   value. The "TEST MODE" badge disappears automatically.

3. **Event Webhook + signing key.** In the NMI portal, subscribe
   `https://pay.thecreditbrothers.com/api/webhooks/nmi-events` to the transaction,
   recurring, and chargeback events, and set `NMI_WEBHOOK_SIGNING_KEY` so signatures are
   verified. Signatures are currently unverified, which is only acceptable in test mode.
   Also confirm the **Silent Post URL** is set (the legacy path that matches inbound
   payments to receivables; see `CONNECTIONS-TRIGGERS.md` section 4).

4. **Apple Pay domain verification.** Enable Apple Pay in the portal, download the
   `apple-developer-merchantid-domain-association` file, and serve it at
   `https://pay.thecreditbrothers.com/.well-known/`. Add the domain to the allowed list.
   (Google Pay needs no extra setup.)

5. **DNS.** Point `pay.thecreditbrothers.com` at the Vercel app and set
   `NEXT_PUBLIC_PAY_BASE_URL` to it (links currently use the `.vercel.app` host). Confirm
   who owns the DNS record (Cloudflare / Josh) and that the `.well-known` file can be
   served there for step 4.

6. **Wallets + installments (processor confirmation).** A card paid via Apple/Google Pay
   may not be reusable for later card-not-present installment charges. Shipped rule:
   wallets allowed for pay-in-full; installment plans require a real card. Confirm with
   the processor whether wallet-in-vault MIT is supported; if yes, we can relax it.

7. **Link-generator permission.** Confirm who can generate links (all closers, or
   admin-gated). The generator exists at `app/(app)/payments/`.

8. **Zero-down plans (the one code case).** A `zero_down` plan would attempt a $0 first
   charge today. Before that pricing launches, add the vault-only-then-schedule-all path:
   vault the card with no charge (`customer_vault=add_customer`, no sale), then schedule
   all N installments from the first due date. Small, isolated change; do it when
   zero-down goes live, not before.

9. **Production smoke.** With steps 1 to 6 done, run one real low-value end-to-end
   charge (generate a link, pay installment #1 on a real card, confirm the subscription
   is created, force/await installment #2, confirm the webhook marked both receivables
   paid and inserted `successful_payment` rows). Then the commission engine picks it up
   automatically (payments tied to the deal drive the 25% gate).

## How this ties into commissions

Every NMI charge writes `finance.successful_payment` (linked to the contact, deal, and
receivable) and every refund/chargeback writes `finance.reversal`. That is exactly what
the commission engine reads: cash collected per deal drives the 25%-collected unlock,
and reversals drive the clawback. So once NMI is live, no extra work is needed for
commissions to reflect real payments — call `finance.recompute_commissions(false)` from
the same NMI webhook (see `COMMISSION-SYSTEM-BUILD.md` section 3.3).

## Reference

- `NMI-PAGE-BUILD-SCOPE.md` — the full build spec, component by component, and the
  acceptance criteria.
- `NMI-PAYMENT-LINKS.md` — the exact NMI API params and the two-step charge-then-schedule
  pattern.
- `CONNECTIONS-TRIGGERS.md` — how NMI (and Stripe/Close/GHL) drive Supabase.
