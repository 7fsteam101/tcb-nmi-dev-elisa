-- =====================================================================
-- 0032: Backend hardening — performance indexes, RLS-policy backfill, and
-- FK-index cleanup (read-only audit follow-up, 2026-07-05). ADDITIVE ONLY.
--
-- Nothing here changes data or fights the permissive Close mirror. Every
-- object is guarded (`if not exists` / `drop policy if exists` first), so the
-- whole file is safe to re-run.
--
-- Three parts:
--   1. Performance indexes for the hot KPI read paths + the sync matchers.
--      The dashboard reads over the transaction pooler with prepare=false and
--      filters `is_demo = $1` on EVERY funnel/money query, almost always ANDed
--      with a date range and/or a status/type discriminator on the SAME table.
--      All range predicates are on the RAW column (sargable), so a composite
--      `(is_demo, <range/discriminator>)` b-tree is used for both live and demo
--      reads. is_demo is NOT made a partial predicate: queries bind both the
--      true and false paths, so a `where not is_demo` partial would not serve
--      demo mode.
--   2. RLS-policy backfill. 0015 set the intent "authenticated = read-only on
--      non-sensitive tables". 0001 created a SELECT policy per table in a loop,
--      but tables added AFTER 0001 only `enable row level security` + `grant
--      select` WITHOUT a policy -> with RLS on and no policy, `authenticated`
--      reads return ZERO rows (fail-closed). The dashboard connects on a direct
--      DATABASE_URL role that BYPASSES RLS, so this is latent today, but the
--      moment anything reads through the Data API (authenticated/anon) those
--      tables silently return nothing. Add the missing read policies to honor
--      0015's stated model. (No new grants — the grants already exist; this
--      only adds the policy the grant needs to actually return rows.)
--   3. FK indexes on the handful of post-0015 foreign keys still bare, to match
--      house style (0015 / 0031 index FKs religiously). Low traffic; listed so
--      the set is complete — trim freely.
--
-- Deliberately NOT included (would fight the permissive mirror or are pointless
-- churn — see the audit report):
--   * No DROP of the pre-existing duplicate index pairs from 0001-vs-0010
--     (ix_payment_occurred/idx_payment_occurred on finance.successful_payment,
--     ix_receivable_due/idx_receivable_due on finance.receivable,
--     ix_appt_scheduled_for/idx_appt_scheduled_for on sales.appointment). They
--     are redundant, not wrong; dropping is a separate, reviewable change.
--   * No stage / one-open-opportunity / identifier-uniqueness guards (dropped on
--     purpose in 0005 / 0006 / 0021).
-- =====================================================================

-- =====================================================================
-- PART 1 — PERFORMANCE INDEXES (hot KPI paths + sync matchers)
-- =====================================================================

-- --- sales.appointment: the single most-repeated filter shape ---------
-- (is_demo, status, scheduled_for) recurs across kpi / kpi-closer /
-- kpi-calllog / kpi-quality / goals / commission. is_current is also
-- frequently ANDed; a second composite covers the live-slot lookups.
create index if not exists idx_appt_demo_status_sched
  on sales.appointment (is_demo, status, scheduled_for);
comment on index sales.idx_appt_demo_status_sched is
  'Hot KPI path: appointment funnel counts filter is_demo + status (taken/no_show/rescheduled/cancelled_*) over a scheduled_for range.';

create index if not exists idx_appt_demo_current_sched
  on sales.appointment (is_demo, is_current, scheduled_for);
comment on index sales.idx_appt_demo_current_sched is
  'Hot KPI path: current-slot lists and calendar windows filter is_demo + is_current over a scheduled_for range.';

-- rescheduled_at range (leakage / reschedule series) filters is_demo +
-- status=rescheduled; small partial keeps it tight.
create index if not exists idx_appt_demo_rescheduled_at
  on sales.appointment (is_demo, rescheduled_at)
  where status = 'rescheduled';
comment on index sales.idx_appt_demo_rescheduled_at is
  'Reschedule series: filters is_demo + rescheduled_at range where status=rescheduled.';

-- --- sales.call: type=strategy is near-universal -----------------------
-- Strategy calls drive every funnel/close-rate query; the partial index
-- keeps only the rows the KPIs ever scan.
create index if not exists idx_call_demo_strategy
  on sales.call (is_demo, opportunity_id)
  where type = 'strategy';
comment on index sales.idx_call_demo_strategy is
  'Hot KPI path: strategy-call funnel/close-rate queries filter is_demo + type=strategy and join to opportunity.';

-- occurred_at is used with WHERE occurred_at is not null + range + order by
-- desc, always on strategy calls -> partial on taken/occurred calls.
create index if not exists idx_call_demo_occurred
  on sales.call (is_demo, occurred_at)
  where type = 'strategy' and occurred_at is not null;
comment on index sales.idx_call_demo_occurred is
  'Quality/taken-call paths: filter is_demo + occurred_at range on strategy calls that occurred (occurred_at not null).';

-- --- finance.successful_payment: revenue everywhere -------------------
-- (is_demo, occurred_at) ANDed with type<>'booking_25' is the cash-collected
-- shape in kpi / kpi-closer / kpi-campaign / commission / goals.
create index if not exists idx_payment_demo_occurred
  on finance.successful_payment (is_demo, occurred_at)
  where type <> 'booking_25';
comment on index finance.idx_payment_demo_occurred is
  'Hot revenue path: cash-collected filters is_demo + occurred_at range and excludes booking_25.';

-- --- finance.reversal: refunds netting -------------------------------
create index if not exists idx_reversal_demo_occurred
  on finance.reversal (is_demo, occurred_at);
comment on index finance.idx_reversal_demo_occurred is
  'Refund netting: filters is_demo + occurred_at range.';

-- --- sales.deal: every revenue / goal query --------------------------
-- (is_demo, deal_close_date) ANDed with status<>'refunded'.
create index if not exists idx_deal_demo_close_date
  on sales.deal (is_demo, deal_close_date)
  where status <> 'refunded';
comment on index sales.idx_deal_demo_close_date is
  'Hot revenue path: deals-won / invoiced filter is_demo + deal_close_date range on non-refunded deals.';

-- --- finance.receivable: pipeline / aging ----------------------------
-- (is_demo, status, due_date) for pipeline value, projected cash, aging.
create index if not exists idx_receivable_demo_status_due
  on finance.receivable (is_demo, status, due_date);
comment on index finance.idx_receivable_demo_status_due is
  'Pipeline/aging: filters is_demo + status (scheduled/late/delinquent/paid) over a due_date range; also serves the receivables cron aging sweep.';

-- --- sales.opt_in: unique-lead counts + attribution ------------------
-- (is_demo, submitted_at) for lead counts; separate index for the
-- distinct-on(contact_id) order-by-submitted_at attribution CTEs.
create index if not exists idx_optin_demo_submitted
  on sales.opt_in (is_demo, submitted_at)
  where counts_as_unique;
comment on index sales.idx_optin_demo_submitted is
  'Unique-lead counts: filter is_demo + submitted_at range where counts_as_unique.';

create index if not exists idx_optin_demo_contact_submitted
  on sales.opt_in (is_demo, contact_id, submitted_at);
comment on index sales.idx_optin_demo_contact_submitted is
  'Attribution acq CTE: distinct on (contact_id) ordered by submitted_at (first touch), and the sync 30-day unique check (contact_id + submitted_at window).';

-- --- sales.opportunity: DQ analytics ---------------------------------
create index if not exists idx_opp_demo_dqstage_opened
  on sales.opportunity (is_demo, dq_stage, opened_at);
comment on index sales.idx_opp_demo_dqstage_opened is
  'DQ analytics: filter is_demo + dq_stage (setting/closing) over an opened_at range.';

create index if not exists idx_opp_demo_dqstage_closed
  on sales.opportunity (is_demo, dq_stage, closed_at);
comment on index sales.idx_opp_demo_dqstage_closed is
  'DQ analytics: filter is_demo + dq_stage (setting/closing) over a closed_at range.';

-- --- marketing.ad_spend: spend series --------------------------------
-- 0010 has idx_adspend_date(date); the KPIs always AND is_demo, so a
-- composite avoids the is_demo filter after the index scan.
create index if not exists idx_adspend_demo_date
  on marketing.ad_spend (is_demo, date);
comment on index marketing.idx_adspend_demo_date is
  'Spend series: filters is_demo + date range (superset of the 0010 date-only index for the demo-partitioned reads).';

-- pulled_at drives the trailing-window restatement upsert (per the 0001
-- table comment) but had no index.
create index if not exists idx_adspend_pulled_at
  on marketing.ad_spend (pulled_at);
comment on index marketing.idx_adspend_pulled_at is
  'Trailing-window restatement: the Meta upsert scans by pulled_at to re-pull the recent window.';

-- --- sync matchers: external-key lookups without an index ------------
-- The contact resolver (sync/contacts.ts, sync/normalize.ts) finds existing
-- rows by these keys on every inbound record. close_id is already unique
-- (0011); these were bare. lower() functional indexes because the resolver
-- matches case-insensitively (where lower(primary_email) = lower($1)).
create index if not exists idx_contact_ghl_marketing_id
  on core.contact (ghl_marketing_id)
  where ghl_marketing_id is not null;
comment on index core.idx_contact_ghl_marketing_id is
  'Sync matcher: contact resolver looks up existing contacts by ghl_marketing_id.';

create index if not exists idx_contact_ghl_repair_id
  on core.contact (ghl_repair_id)
  where ghl_repair_id is not null;
comment on index core.idx_contact_ghl_repair_id is
  'Sync matcher: contact resolver / fulfilment sync looks up by ghl_repair_id.';

create index if not exists idx_contact_lower_email
  on core.contact (lower(primary_email))
  where primary_email is not null;
comment on index core.idx_contact_lower_email is
  'Sync matcher: contact resolver matches case-insensitively on lower(primary_email) (Stripe/NMI payer resolve).';

create index if not exists idx_contact_primary_phone
  on core.contact (primary_phone)
  where primary_phone is not null;
comment on index core.idx_contact_primary_phone is
  'Sync matcher: contact resolver matches on primary_phone.';

-- contact_identifier is resolved by (type, lower(value)) WITHOUT contact_id;
-- 0021 uq_identifier_per_contact leads with contact_id, so it cannot serve
-- that lookup. This is the reverse-direction index the resolver needs.
create index if not exists idx_identifier_type_lower_value
  on core.contact_identifier (type, lower(value));
comment on index core.idx_identifier_type_lower_value is
  'Sync matcher: resolve a contact from an inbound email/phone by (type, lower(value)); the 0021 uniqueness index leads with contact_id and cannot serve this.';

-- successful_payment external ids: the Stripe/NMI dispute+refund matchers
-- find the original payment by these; both were bare.
create index if not exists idx_payment_stripe_charge_id
  on finance.successful_payment (stripe_charge_id)
  where stripe_charge_id is not null;
comment on index finance.idx_payment_stripe_charge_id is
  'Sync matcher: Stripe dispute/refund normalization finds the original payment by stripe_charge_id.';

create index if not exists idx_payment_nmi_transaction_id
  on finance.successful_payment (nmi_transaction_id)
  where nmi_transaction_id is not null;
comment on index finance.idx_payment_nmi_transaction_id is
  'Sync matcher: NMI refund/void normalization finds the original payment by nmi_transaction_id.';

-- =====================================================================
-- PART 2 — RLS-POLICY BACKFILL (honor 0015's authenticated read-only intent)
-- These tables have RLS enabled + `grant select to authenticated` but no
-- SELECT policy, so authenticated reads return zero rows. Add the read policy.
-- Idempotent: drop-if-exists then create. No new grants. intake_submission and
-- app_user (PII / password hashes) are intentionally EXCLUDED — they keep no
-- authenticated grant and no policy. The dashboard's direct DATABASE_URL role
-- bypasses RLS regardless, so this is inert for the app today.
-- =====================================================================
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('core','lost_reason'),
      ('core','goal'),
      ('core','announcement'),
      ('core','kb_article'),
      ('core','contact_note'),
      ('sales','commission_rule'),
      ('sales','rep_commission_setting'),
      ('sales','eod_report'),
      ('sales','agreement'),
      ('finance','dispute'),
      ('finance','payment_link'),
      ('finance','payment_product')
    ) v(schema_name, table_name)
  loop
    execute format('drop policy if exists %I on %I.%I', r.table_name || '_auth_read', r.schema_name, r.table_name);
    execute format('create policy %I on %I.%I for select to authenticated using (true)', r.table_name || '_auth_read', r.schema_name, r.table_name);
  end loop;
end $$;
-- Note: core.app_setting also has RLS on + a grant only to service_role (NO
-- authenticated grant), so it is correctly locked and needs no policy.

-- =====================================================================
-- PART 3 — BARE FK INDEXES on post-0015 tables (house style; low traffic)
-- Trim any you consider not worth the write cost — none are on a hot path.
-- =====================================================================
create index if not exists idx_dispute_deal_fk
  on finance.dispute (deal_id);
comment on index finance.idx_dispute_deal_fk is 'FK index: finance.dispute -> deal.';

create index if not exists idx_payment_link_contact_fk
  on finance.payment_link (contact_id);
comment on index finance.idx_payment_link_contact_fk is 'FK index: finance.payment_link -> contact.';

create index if not exists idx_payment_link_product_fk
  on finance.payment_link (product_id);
comment on index finance.idx_payment_link_product_fk is 'FK index: finance.payment_link -> payment_product.';

create index if not exists idx_payment_link_paid_payment_fk
  on finance.payment_link (paid_payment_id);
comment on index finance.idx_payment_link_paid_payment_fk is 'FK index: finance.payment_link -> successful_payment (settling payment).';

create index if not exists idx_rep_comm_setting_rule_fk
  on sales.rep_commission_setting (rule_id);
comment on index sales.idx_rep_comm_setting_rule_fk is 'FK index: rep_commission_setting -> commission_rule (reverse lookup; the PK leads with rep_id).';

-- --- author/creator FKs on write surfaces (audit trail joins) ---------
create index if not exists idx_announcement_created_by_fk
  on core.announcement (created_by_user_id);
comment on index core.idx_announcement_created_by_fk is 'FK index: announcement -> app_user (author).';

create index if not exists idx_kb_article_updated_by_fk
  on core.kb_article (updated_by_user_id);
comment on index core.idx_kb_article_updated_by_fk is 'FK index: kb_article -> app_user (last editor).';

create index if not exists idx_contact_note_author_fk
  on core.contact_note (author_user_id);
comment on index core.idx_contact_note_author_fk is 'FK index: contact_note -> app_user (author).';

create index if not exists idx_eod_report_created_by_fk
  on sales.eod_report (created_by_user_id);
comment on index sales.idx_eod_report_created_by_fk is 'FK index: eod_report -> app_user (submitter).';

-- End of migration 0032.
