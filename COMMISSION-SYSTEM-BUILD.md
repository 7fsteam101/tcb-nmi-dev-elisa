# Commission System: build spec (July 2 comp plan)

A self-contained handoff for the developer. It covers the comp plan, what already
existed, what was built (two migrations + a SQL engine + views), the dashboard work
that remains, how to wire and test it, and the open decisions that need Katie.

Prepared by 8 Figure Systems, July 5, 2026.

## 0. Status at a glance

| Piece | State |
|---|---|
| Comp-plan data model (rules, setter/partner attribution, bonus table) | **Built** — `supabase/migrations/0036_commission_comp_plan.sql` |
| Commission engine (compute + persist statements) | **Built** — `supabase/migrations/0037_commission_engine.sql` (`finance.recompute_commissions`) |
| Leaderboard + statement views | **Built** — in 0037 |
| Smoke test | **Built** — `supabase/tests/commission_smoke.sql` |
| Dashboard: Commissions tab reads real statements | **To build** (today it shows an estimate on the old rates) |
| Dashboard: admin per-person toggles + per-rep % + gate on/off | **Extend** (toggle UI exists at `app/(app)/admin/commission/`) |
| Dashboard: monthly bonus admin UI | **To build** |
| Dashboard: partner payee management | **To build** |
| Dashboard: leaderboard + approve/paid flow | **To build** |
| Setter identity captured at booking | **Blocked** — see Decision 2 |

Nothing here has been applied to the live database. Apply 0036 + 0037 to a Supabase
branch, run the smoke test, confirm the numbers, then promote. Never run first
against production.

## 1. The comp plan (July 2, authoritative)

- **Closer: 10% of the invoice** (the deal's `total_contract_value`, not cash). The
  commission is **locked until 25% of the invoice is collected**; on a payment plan
  that can be the 1st or 2nd installment. Once the 25% gate is met, the whole 10%
  releases (this is the default, see Decision 1 for the safer alternative).
- **Refund: clawback.** A refunded client subtracts that client's commission from the
  rep's **next** check (it does not rewrite an already-paid month).
- **Setter: $1,000 per month + 5%.** The $1,000 is earned on **25 qualified calls
  that showed** (showed up, need not close). The 5% is on the deals they set and is
  tied to the closer's payment (same 25% gate). Paid once a month.
- **Partner commissions:** a partner (a payee marked partner, not a team member) can
  be attributed on a deal and earns their own percentage.
- **Per-person, no code:** admin can toggle each piece per rep (base on/off, the
  per-rep percentage, the 25% gate on/off), and grant a **monthly bonus** (a flat
  amount or a percentage).
- **No commission form.** Everything derives from NMI/Stripe payments tied to clients;
  the dashboard shows each rep their statement.

## 2. What already existed (so we did not rebuild it)

- `sales.commission_rule` + `sales.rep_commission_setting` (migration 0027): the rule
  catalog and the **per-rep on/off + param override** infrastructure. The admin toggle
  UI at `app/(app)/admin/commission/` already writes to it. It was seeded with the
  **old** plan (10% base / 15% at a 33% close rate, on cash).
- `finance.commission_plan` / `commission_tier` / `commission_payout` / `commission_line`
  (migration 0001): the real statement/ledger tables. They existed but **nothing wrote
  to them** — the only commission math was a TypeScript estimate (`lib/commission.ts`).
- The deal (`sales.deal`), payments (`finance.successful_payment`), reversals
  (`finance.reversal`), receivables, and the demo flag were all in place.

## 3. What was built

### 3.1 Migration 0036 — schema

- **Rule catalog rewritten to the July 2 plan** (upsert by `key`, so existing per-rep
  toggles keep working):
  - `base_rate` -> closer base, now **10% of invoice** (`{"rate":0.10,"basis":"invoice","payout_basis":"full_at_gate"}`)
  - `collection_gate` -> **new**, the 25% unlock (`{"threshold":0.25}`)
  - `refund_clawback` -> full reversal of the client's commission (`{"mode":"full_reversal"}`)
  - `setter_base` -> **new** ($1,000/mo on 25 qualified shown calls)
  - `setter_pct` -> **new** (5%, same gate)
  - `partner_pct` -> **new** (partner %, per-partner rate via override)
  - `tier_bonus` -> retired (default off; kept only so old FKs stay valid)
- **Setter + partner attribution** (did not exist): `sales.deal.setter_rep_id`,
  `sales.deal.commission_partner_rep_id`, and `sales.call.setter_rep_id`.
- **`sales.commission_bonus`** (new): per-rep, per-month, flat amount **or** a percent
  of (own commission / cash collected / a manual base).
- **`commission_line_type`** widened with `setter_base`, `setter_pct`, `partner`, `bonus`.
- **`finance.v_deal_collection`**: per-deal % of invoice collected (gross minus
  reversals, excluding the $25 fee) — the gate input and a dashboard column.
- **`is_demo`** added to `commission_payout` / `commission_line` so a test/branch run
  never collides with real payroll data.

### 3.2 Migration 0037 — the engine

`finance.recompute_commissions(p_is_demo boolean default false)` recomputes every
**open** monthly statement from the current data and persists it into
`finance.commission_payout` (one per rep per month) + `finance.commission_line` (one
per accrual / clawback / setter / partner / bonus line, with the rate frozen). It is
idempotent (safe to call repeatedly) and it **never touches an approved or paid
statement**. A refund whose month is already frozen is re-dated onto the current open
month, which is the "next check" rule.

The month bucket is always **America/New_York**. The gate reads the running collected
total per deal and dates the accrual at the payment that crosses 25%.

Two reporting views:
- `finance.v_commission_leaderboard` — per rep per month, total + rank ("who is
  getting the most").
- `finance.v_commission_statement_line` — every line with its deal/contact + period,
  for the per-closer tab and the admin statement.

### 3.3 When to call the engine

Call `select finance.recompute_commissions(false);` from:
- the **NMI** event webhook (`app/api/webhooks/nmi-events`) after a payment/refund lands,
- the **Stripe** webhook (`app/api/webhooks/*`) after a charge/refund,
- the nightly **receivables** cron (`app/api/cron/receivables`) as a safety net.

It is cheap (TCB is small) and does a full open-period rebuild each time, so ordering
and retries do not matter. Demo previews stay on the existing estimate; only real data
is persisted.

## 4. Dashboard build (the remaining work)

The app is Next.js 16 (App Router), Tailwind v4, **postgres.js raw SQL** via the `sql`
tag in `lib/db.ts` (not supabase-js, no RLS at the app layer — access control is in
code). Auth is a JWT cookie; roles live on `core.app_user.role`; a user links to a rep
via `app_user.rep_id`. Money is minor units; format with `money()` / `pct()` from
`lib/format.ts`. Read `dashboard/AGENTS.md` first — this Next version has breaking
changes from older docs.

Copy the existing patterns exactly (all in `app/(app)/admin/commission/`): a `page.tsx`
(server component, reads via `sql`), an `editor.tsx` (`"use client"`), and an
`actions.ts` (`"use server"` with the admin `guard()` + `revalidatePath`).

### 4.1 Commissions tab (`app/(app)/commission/page.tsx`) — rework
Today it renders `commissionForReps()` (the estimate). Change it to read **persisted**
statements from `finance.commission_payout` + `finance.v_commission_statement_line`:
- **Closer view:** scope by `session.repId` — show that closer their current month's
  statement (lines grouped by deal, with type: base / clawback / bonus), the total, and
  the status (calculated / approved / paid). Grant closers this page (today they cannot
  see it; it is gated `reps`).
- **Admin/leadership view:** all reps, current month, with the approve/paid controls
  (4.4) and a period switcher.
- Keep the estimate available as a labelled "live estimate" only if useful; the
  payable number is the persisted statement.

### 4.2 Admin toggles — extend (`app/(app)/admin/commission/`)
The per-rep checkbox grid already writes `rep_commission_setting.enabled`. Extend it to
the new rules (`collection_gate`, `setter_base`, `setter_pct`, `partner_pct`) and add a
**per-rep parameter override**: a small number input per rep that writes
`rep_commission_setting.override_params` (e.g. a custom `{"rate":0.12}` for one closer,
or turning the gate off for a rep). Follow `setRuleEnabledAction`; add
`setRuleParamsAction(repId, ruleId, params)` that upserts `override_params`.

### 4.3 Monthly bonus admin (new)
A new admin page (mirror `app/(app)/admin/goals/`, which is the closest existing
per-rep-per-period admin form). Rows write `sales.commission_bonus`: rep, month, kind
(flat or percent), amount or (percent + basis). After a write, call
`finance.recompute_commissions(false)` (or let the nightly cron pick it up). Show the
resulting bonus line in that rep's statement.

### 4.4 Statement approve -> paid (new)
On the admin Commissions view: a per-statement action that moves
`commission_payout.status` `calculated -> approved` (stamp `approved_by_rep_id` +
`approved_at`) and `approved -> paid` (stamp `paid_at`, optional `gusto_payout_id`).
Once approved, the engine leaves it frozen. Guard with the admin `guard()`.

### 4.5 Leaderboard (new)
Read `finance.v_commission_leaderboard` for the current month, show the top performers
(the July 2 call said top 2-3, not pods). This is the "who is getting the most
commissions" view. Can live on the Commissions tab header or the `reps` page.

### 4.6 Partner payees (new)
- A partner is a `sales.rep` with `is_partner = true`. Add an admin control to mark a
  rep as a partner and set their `partner_pct` rate (via `override_params`).
- Attribution: the deal editor (or the sales-call-report flow that creates the deal)
  needs a "partner on this deal" picker that writes `sales.deal.commission_partner_rep_id`.
- A "total commissions paid" view per payee (partner vs team member) — a simple sum
  over `commission_line` grouped by rep, filtered to paid payouts.

## 5. Decisions that need Katie (flags)

These shape the numbers. Defaults are shipped; changing them is data/config, not code.

1. **Payout basis at the gate.** The plan says the whole 10% releases once 25% is
   collected. On a $4k plan that is $400 paid when only $1,000 is in. If the plan then
   stalls (silent failed installments, not a refund) the clawback rule does not catch
   it. Default shipped: `full_at_gate` (the literal plan). Safer alternative:
   `proportional` (10% of net cash as it lands, released after the gate). One toggle per
   rep (`base_rate.override_params.payout_basis`). **Pick the default.**
2. **Setter identity at booking (blocker).** Nothing today records *which* setter
   booked a call (`booked_by` only says self vs setter). The booking automation (GHL/
   Close -> Supabase) must start writing `sales.call.setter_rep_id`, and the deal
   creation must copy it to `sales.deal.setter_rep_id`. Until then, setter commission
   cannot compute. **How is the setter identified at booking?**
3. **Partner rules.** Which deals owe a partner, and each partner's rate? The model
   supports it (`commission_partner_rep_id` + `partner_pct` per partner); it needs the
   list of partners, their rates, and the attribution rule.
4. **Bonus percent basis.** Default: percent of the rep's own commission that month.
   Alternatives: percent of their cash collected, or a manual base. **Confirm the default.**
5. **Refund clawback mode.** Default `full_reversal` (reverse the whole accrued
   commission for a refunded deal — matches "subtract that client's commission").
   Alternative `rate_on_cash` (deduct rate x refunded cash). **Confirm.**
6. **Setter $1k trigger.** Counted as strategy calls with the setter attributed, the
   appointment `taken`, and the opportunity `qualified`, per month, all-or-nothing at
   25. **Confirm the "qualified" definition and the all-or-nothing threshold.**
7. **Period = calendar month (EST), monthly for both setter and closer.** Confirm
   closers are paid monthly (vs each deal on unlock).

## 6. Edge cases already handled

- **Locked-until-25%:** no accrual until the gate is met; dated at the crossing payment.
- **Refund after payout:** if the month is already paid, the clawback moves to the
  current open check; it never rewrites a paid statement.
- **Idempotency / retries:** the engine fully rebuilds open periods, so double webhooks
  or out-of-order events converge to the same result.
- **Demo vs real:** persisted payroll is real-only; demo stays on the estimate.
- **Multiple bonuses per rep per month, flat and/or percent:** supported.
- **Approved/paid statements are frozen:** never modified by a recompute.

## 7. Acceptance criteria

Run `supabase/tests/commission_smoke.sql` on a branch. It must print, for a $4k deal:
locked at 12.5% collected; at 25% -> closer 40000, setter 20000, partner 40000; a flat
50000 bonus -> June total 90000; a refund -> closer clawback -40000, June total 50000;
setter monthly base fires at the threshold; and an approved statement stays frozen
through a later recompute. Then wire the webhooks/cron to call the engine and confirm a
real sandbox NMI payment moves a rep's statement.

## 8. Build order (for the dev)

1. Apply 0036 + 0037 to a Supabase branch; run the smoke test; confirm. (~0.5 day)
2. Backfill/point the payment + reversal webhooks and the receivables cron at
   `finance.recompute_commissions(false)`. (~0.5 day)
3. Rework the Commissions tab to read persisted statements, closer-scoped. (~1 day)
4. Extend the admin toggle grid: new rules + per-rep param override. (~0.5 day)
5. Monthly bonus admin page. (~0.5 day)
6. Statement approve -> paid controls + leaderboard. (~1 day)
7. Partner payee marking + deal partner attribution + total-paid view. (~1 day)
8. Once Decision 2 is answered, wire setter capture at booking and backfill. (~0.5 day)

Rough total: 5 to 6 focused days plus the decisions in section 5.

## 9. Files

- `supabase/migrations/0036_commission_comp_plan.sql`
- `supabase/migrations/0037_commission_engine.sql`
- `supabase/tests/commission_smoke.sql`
- Dashboard targets: `app/(app)/commission/`, `app/(app)/admin/commission/`, a new
  `app/(app)/admin/bonuses/`, `lib/commission.ts` (or a new `lib/commission-statement.ts`).
