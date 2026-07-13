# NMI Installment Failure Handling — Investigation & Scope

How installment charging works today, what happens when a charge fails, and sized plans
for adding retry + failure notification. **Investigation only — nothing built yet.
Awaiting team's call on V1 scope.**

_Last updated: 2026-07-07_

## How installment charging works (hybrid)

Installments #2..N are charged by one of two mechanisms, chosen per-plan at charge time in
`dashboard/app/api/charge/route.ts:61-87` based on whether the plan carries a `custom_schedule`:

| Plan type | Setup | Who charges #2..N | Trigger |
|---|---|---|---|
| Fixed cadence (monthly/weekly/biweekly, even split) | `charge/route.ts:68-81` → `addSubscription` (`dashboard/lib/nmi.ts:93-116`) | **NMI native recurring** (`recurring=add_subscription`, `plan_payments=N-1`) | NMI internal; results recorded via `dashboard/app/api/webhooks/nmi-events/route.ts` |
| Custom (irregular amounts/dates) | schedule stored in `payment_link.custom_schedule` JSONB | **App via `chargeVault`** (`dashboard/lib/nmi-links.ts:103`) | **Vercel daily cron** `/api/cron/receivables` (`dashboard/vercel.json`, 10:30 UTC) |

Both paths charge the **NMI Customer Vault token** (`finance.payment_link.nmi_customer_vault_id`)
created by `saleAndVault()` on the first payment.

## What happens today when a charge fails

Established gaps (custom-plan path, `dashboard/lib/nmi-links.ts:90-119`):

- **Retry — none.** The cron only charges entries with `status === "scheduled"` (line 102). On failure
  the entry flips to `"failed"` (line 110), a **terminal state never re-selected**. No dunning, no
  backoff, no card-update prompt. Later installments still charge on their own dates (the loop does not
  stop on a failure).
- **Notification — none.** No email/SMS/Slack anywhere in the app (searched `nodemailer`, `resend`,
  `sendgrid`, `twilio`, `slack`, `notify`, `SMTP` — zero real matches). The only trace of a failure is
  the cron's HTTP response body (`custom_installments_failed`, `receivables/route.ts:22`), visible only
  in Vercel cron logs — not persisted, not alerted.
- **Dashboard flag — only indirect, and only sometimes.** On failure `recordNmiPayment` is *not* called,
  so:
  - the `custom_schedule` `"failed"` entry is invisible to the UI — `listPaymentLinks()` reads link-level
    `status` only, not the schedule JSON;
  - the matching `finance.receivable` row is not marked paid, so the same cron ages it
    `scheduled → late → delinquent` and the **Receivables page** shows it as Late/Delinquent.
  - **Caveats:** a failed charge looks identical to "never attempted" (aging keys off `due_date` only),
    and this only appears **if a `receivable` row exists** — those are created by the forms/admin plan
    flows (`dashboard/lib/forms.ts:218`, `dashboard/app/(app)/admin/plans/actions.ts:44`), **not** by
    `createPaymentLink`. A standalone payment link's failure is invisible everywhere.

### Summary

| Mechanism | Present? |
|---|---|
| Retry / dunning on failed installment | ❌ None — `failed` is terminal |
| Notification (email/SMS/Slack) on failure | ❌ None anywhere |
| Explicit "payment failed" flag in UI | ❌ Only in `custom_schedule` JSON, which no view reads |
| Indirect Late/Delinquent badge | ⚠️ Only via `receivable` aging, only if a row exists, indistinguishable from merely-overdue |

**Bottom line:** a declined card on a custom plan can silently drop revenue with no one notified and —
for standalone payment links — no visible flag at all. This is the weakest link for go-live.

---

## Proposed plans (no code yet)

### 1. Retry logic — **Small-to-Medium**

Groundwork already exists (schedule JSONB, daily cron, stored vault token).

- Add `attempts` / `lastTriedDate` / `nextRetryDate` to the `custom_schedule` entry shape —
  **no DB migration** (JSONB).
- Change the cron selection to also pick up `"failed"` entries under a retry cap, respecting a backoff
  date; re-charge via the existing `chargeVault`.

**Small** = dead-simple (retry up to N times on subsequent daily runs, then give up).
**Medium** = real backoff spacing, a distinct terminal `"abandoned"` state, **and** surfacing
retrying/failed entries in the UI (requires joining `custom_schedule` into a view — no view reads it today).

### 2. Failure notification — **Medium** (Medium-to-Large if email)

No notification infrastructure exists today, so this is greenfield; size depends on channel:

- **Slack webhook — Small-Medium.** One env var (webhook URL), one `fetch` in the failure branch.
  Fastest path to "the team gets pinged."
- **Internal email — Medium.** Add a provider (Resend/SMTP) + secret + template. New dependency/config.
- **Customer-facing dunning email/SMS — Large.** Provider + templates + a card-update flow (note: the
  client-facing **Update Card page already exists** at `/pay/<token>/card`, so this is mostly delivery,
  not the page) + deliverability/compliance. Really its own feature; recommend deferring past V1.

**Note:** the notification-provider decision here is **shared** with the Update Card *auto-send* option in
`NMI-CHECKOUT-GAPS-SCOPE.md` — decide both together.

---

## Recommended minimal V1 safety net

Retry (simple, capped) **+** a Slack ping on final failure. Combined ≈ **Medium**, and it closes the
"silent revenue loss" gap without pulling in email infra or a customer-facing dunning flow.

**Key question for the team:** is **customer-facing** failure handling required for V1, or is **internal
visibility** (team alerted + automatic retries) enough? That single answer is the difference between
Medium and Large.

## Related

- `NMI-CHECKOUT-GAPS-SCOPE.md` — Charge Now / ZIP / Update Card admin-trigger gaps. Shares the
  notification-provider decision (Update Card auto-send).
