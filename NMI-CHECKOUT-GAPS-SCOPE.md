# NMI Checkout — Acceptance Gaps & Scope

Status of the NMI checkout page against V1 acceptance criteria, plus sized plans for
the confirmed gaps. **Investigation only — nothing built yet. Awaiting team's call on scope.**

_Last updated: 2026-07-07_

## Investigation summary

| Criterion | Status | Location |
|---|---|---|
| **Charge Now** (admin on-demand charge of a saved card) | ❌ Missing | Primitive exists, no admin surface |
| **Update Card on File** (client-facing card swap) | ✅ Exists | `dashboard/app/pay/[token]/card/page.tsx` + `dashboard/app/api/update-card/route.ts` |
| **ZIP / postal code** collected at checkout | ❌ Missing | `dashboard/app/pay/[token]/checkout.tsx` |

### Detail

**Charge Now — missing.** The building block `chargeVault()` exists (`dashboard/lib/nmi.ts:75`,
a `type=sale` against the stored `customer_vault_id`), but its only caller is the receivables
cron (`dashboard/lib/nmi-links.ts:103`). No `/api/charge-now` route and no admin UI action exist
(`dashboard/app/(app)/**` has zero references). Would be built on top of the existing
`chargeVault` + `recordNmiPayment` primitives.

**Update Card on File — exists.** Client-facing page at `{PAY_BASE}/pay/<token>/card`
(`dashboard/app/pay/[token]/card/page.tsx`), posting to `/api/update-card`
(`dashboard/app/api/update-card/route.ts:22` → `updateVaultCard`, `customer_vault=update_customer`).
Vault id is unchanged on update, so a running NMI subscription and the custom-schedule cron both
keep charging the new card automatically.
**Open gap:** no admin UI surfaces or sends that `/card` link — `listPaymentLinks()` does not expose it.
The page works only if the customer is handed the URL.

**ZIP — missing.** In `dashboard/app/pay/[token]/checkout.tsx`: form fields are Full name, Email,
Phone only (lines ~85–90); Collect.js hosted fields are `ccnumber`, `ccexp`, `cvv` + wallet buttons
only (lines ~54–61). No ZIP/postal field anywhere, so **AVS ZIP verification is not sent to NMI**.

---

## Proposed plans (no code yet)

### 1. ZIP / postal code at checkout — **Small**

Add one ZIP input and thread it through to the NMI sale so AVS runs.

- Add a plain React input in `checkout.tsx` (ZIP is not PCI-sensitive — no hosted field needed;
  it rides alongside the payment token) and include it in the `charge()` payload.
- Accept it in `dashboard/app/api/charge/route.ts` and pass through.
- Add `zip` (optionally `address1`) to the NMI post in `dashboard/lib/nmi.ts` (`saleAndVault`).
- Apply the same to `/api/update-card` while we're here.

**Decisions:** required vs optional? Configure NMI to decline on AVS mismatch (gateway setting,
not code) — if yes, add an "address didn't match" error path (Small-plus).

**Risk:** Low, purely additive.

### 2. Charge Now (admin on-demand charge) — **Medium**

Money-moving primitives already exist (`chargeVault` + `recordNmiPayment`); the work is a safe
admin surface around them.

- New route `dashboard/app/api/charge-now/route.ts`: takes a payment_link id (or vault id) + amount,
  calls `chargeVault()`, then `recordNmiPayment()`.
- Admin UI: "Charge saved card" button + amount input + **confirmation modal** (charges a real card).
  Natural home: payment-links list (`dashboard/app/(app)/payments/…`) or the contact page.
- **Auth/role gate** (admin-only) — `AUTH_DISABLED=true` is dev-only; this endpoint must enforce
  real auth in prod. Non-negotiable.
- **Audit trail**: capture which admin triggered the charge (`recordNmiPayment` logs the payment,
  not the actor).
- **Idempotency / double-click guard**.

**Decisions:** button placement (payment-links vs contact)? If a contact has multiple vaults, which
card charges (simplest: scope to a specific link's vault)? Fixed vs admin-entered amount?

**Risk:** Medium — real money on demand. Auth + confirm + audit are what make it Medium, not the NMI call.

### 3. Update Card admin-trigger gap — **Small** (copy-link) / **Medium+** (auto-send)

Page + route already work; the gap is getting the `/pay/<token>/card` URL to an admin.

- **Small — surface the link:** add a "Copy update-card link" action to the payment-links list
  (token is already on each row via `listPaymentLinks`). Admin copies `{PAY_BASE}/pay/<token>/card`
  and sends it via existing channels.
- **Medium+ — auto-send:** if the system must email/SMS the link, this pulls in notification
  infrastructure that does not exist yet (no email/SMS/Slack provider anywhere in the app). Same
  provider-setup cost as the failed-installment notification work — decide those two together.

**Decision:** is copy-link (admin sends) sufficient, or must the system deliver to the customer?

**Risk:** Low for copy-link; auto-send inherits notification-infra scope.

---

## Sizing summary

| Item | Size | Driver |
|---|---|---|
| ZIP field | Small | One additive field → NMI AVS |
| Charge Now | Medium | Auth gate + confirm UX + audit around existing primitives |
| Update Card admin-trigger | Small / Medium+ | Copy-link trivial; auto-send needs notification infra |

**Combined:** ZIP (S) + Charge Now (M) + Update Card *copy-link* (S) ≈ one **Medium** chunk overall.
Choosing the *auto-send* variant is what pushes it up, because it drags in the notification-provider
decision shared with the failed-installment work — worth deciding together.

## Related / open

- **Failed-installment retry + notification** was investigated separately (custom-plan installments
  that decline are marked `failed` terminally — no retry, no notification, only indirect Late/Delinquent
  aging). Not yet written up as its own doc. The notification-provider decision is shared with the
  Update Card *auto-send* option above.
