-- =====================================================================
-- 0036: Commission comp plan (July 2 rebuild) — SCHEMA ONLY.
--
-- Turns the seeded old plan (10% base / 15% at 33% close rate, on cash) into
-- the July 2 comp plan and adds the pieces the engine (0037) needs:
--   1. Rule catalog rewritten to the July 2 plan (closer 10% of invoice, a 25%-
--      collected unlock gate, full refund reversal, setter base + %, partner %).
--   2. Setter + partner attribution on the deal/call (none existed before).
--   3. sales.commission_bonus — per-rep, per-month flat OR percent bonus (new).
--   4. commission_line_type widened for setter/partner/bonus lines.
--   5. finance.v_deal_collection — per-deal % of invoice collected (the gate input).
--
-- Additive + idempotent. Enum values are added here and only USED in 0037, so no
-- "unsafe use of new enum value in same transaction" error. This migration does
-- not itself compute anything; 0037 holds the engine.
--
-- All money is integer minor units (cents). Convention notes: enums live in
-- public; set_updated_at() lives in public; new tables get RLS + grant service_role
-- + grant select authenticated + a permissive select policy (per 0032); FK columns
-- get an explicit index.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RULE CATALOG → July 2 comp plan
-- ---------------------------------------------------------------------
-- Kept as an upsert-by-key so it is safe to re-run and preserves rule ids that
-- sales.rep_commission_setting already references. The three original keys are
-- repurposed in place (ids unchanged); three new keys are added.
--   base_rate       -> closer base, now 10% of INVOICE (was 10% of cash)
--   tier_bonus      -> RETIRED (default off); the flat plan has no close-rate tier
--   refund_clawback -> full reversal of the client's commission (was 10% of cash)
--   collection_gate -> NEW: lock commission until 25% of invoice is collected
--   setter_base     -> NEW: $1,000/mo on 25 qualified calls that showed
--   setter_pct      -> NEW: 5%, tied to the closer's payment (same gate)
--   partner_pct     -> NEW: partner commission %, per-partner rate via override
insert into sales.commission_rule (key, name, description, params, default_enabled, sort_order) values
  ('base_rate', 'Closer base (10% of invoice)',
   'Closer commission = rate x the deal invoice (total_contract_value). Released per the collection gate. payout_basis: full_at_gate = the whole 10% once the gate is met; proportional = 10% of net cash collected, released after the gate.',
   '{"rate":0.10,"basis":"invoice","payout_basis":"full_at_gate"}'::jsonb, true, 1),
  ('collection_gate', '25% collected unlock',
   'Commission on a deal is locked until this fraction of the invoice is collected (gross, excluding the $25 booking fee). Turn OFF for a rep to pay immediately on close.',
   '{"threshold":0.25}'::jsonb, true, 2),
  ('refund_clawback', 'Refund clawback',
   'On a refunded/charged-back deal, subtract that client''s commission from the rep''s next check. mode full_reversal = reverse the whole accrued commission for the deal; rate_on_cash = deduct rate x refunded cash.',
   '{"mode":"full_reversal"}'::jsonb, true, 3),
  ('setter_base', 'Setter monthly base',
   'Flat monthly amount for a setter who logs at least N qualified calls that showed (showed up, need not close). Paid once per month.',
   '{"amount_minor":100000,"qualified_calls_threshold":25}'::jsonb, false, 4),
  ('setter_pct', 'Setter % (tied to closer)',
   'Setter percentage on deals they set, released on the same collection gate as the closer.',
   '{"rate":0.05}'::jsonb, false, 5),
  ('partner_pct', 'Partner commission %',
   'Percentage paid to a partner (rep with is_partner = true) attributed on a deal. Set a per-partner rate via rep_commission_setting.override_params ({"rate":0.xx}).',
   '{"rate":0.10}'::jsonb, false, 6)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      params = excluded.params,
      default_enabled = excluded.default_enabled,
      sort_order = excluded.sort_order,
      updated_at = now();

-- Retire the old close-rate tier bonus (superseded by the flat plan). Keep the row
-- so any existing per-rep setting FK stays valid; just default it off.
update sales.commission_rule
   set default_enabled = false,
       name = 'Tier bonus (retired)',
       description = 'RETIRED July 2 2026: the flat comp plan has no close-rate tier. Kept only so existing rep settings keep a valid FK. Do not re-enable.',
       updated_at = now()
 where key = 'tier_bonus';

-- ---------------------------------------------------------------------
-- 2. SETTER + PARTNER ATTRIBUTION (did not exist)
-- ---------------------------------------------------------------------
-- The deal only carried the closer (closer_rep_id). Setter and partner commission
-- cannot be computed without knowing WHO set the call and WHICH partner is on the
-- deal. These columns are the commission source of truth; they must be populated
-- at deal creation (setter from the strategy call, partner chosen by the closer).
-- See the FLAGS in COMMISSION-SYSTEM-BUILD.md — the booking automation has to start
-- capturing the setter's identity (today booked_by only says self_book vs setter).

alter table sales.deal add column if not exists setter_rep_id uuid references sales.rep(id);
comment on column sales.deal.setter_rep_id is
  'The setter credited for this deal (the rep who set the strategy call that closed). NULL for self-booked or unattributed. Drives setter_pct and the setter''s qualified-call credit. Must be set at deal creation.';
create index if not exists idx_deal_setter on sales.deal(setter_rep_id);

alter table sales.deal add column if not exists commission_partner_rep_id uuid references sales.rep(id);
comment on column sales.deal.commission_partner_rep_id is
  'A partner (sales.rep with is_partner = true) who earns a commission on this deal. Distinct from partner_contact_id (a couple''s 2nd buyer). NULL when no partner is owed. Drives partner_pct.';
create index if not exists idx_deal_comm_partner on sales.deal(commission_partner_rep_id);

-- Setter identity on the call itself (source for the monthly qualified-call count).
alter table sales.call add column if not exists setter_rep_id uuid references sales.rep(id);
comment on column sales.call.setter_rep_id is
  'The setter who booked this call, when booked_by = setter. Source for the setter''s monthly qualified-calls-that-showed count (setter_base). NULL for self-booked.';
create index if not exists idx_call_setter on sales.call(setter_rep_id);

-- ---------------------------------------------------------------------
-- 3. MONTHLY BONUS (new) — flat amount OR a percentage, per rep per month
-- ---------------------------------------------------------------------
create table if not exists sales.commission_bonus (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references sales.rep(id),
  period_month date not null,                       -- first day of the month (EST) it applies to
  bonus_kind text not null,                         -- 'flat' | 'percent'
  amount_minor int,                                 -- required when kind = flat
  percent numeric,                                  -- required when kind = percent (0.05 = 5%)
  percent_basis text,                               -- what the percent multiplies: own_commission | cash_collected | manual
  manual_base_minor int,                            -- the base when percent_basis = manual
  note text,
  is_demo boolean not null default false,
  created_by_rep_id uuid references sales.rep(id),  -- the admin (as a rep) who granted it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_bonus_kind check (bonus_kind in ('flat','percent')),
  constraint chk_bonus_flat check (bonus_kind <> 'flat' or amount_minor is not null),
  constraint chk_bonus_percent check (bonus_kind <> 'percent' or (percent is not null and percent_basis is not null)),
  constraint chk_bonus_percent_basis check (percent_basis is null or percent_basis in ('own_commission','cash_collected','manual')),
  constraint chk_bonus_manual_base check (percent_basis is distinct from 'manual' or manual_base_minor is not null),
  constraint chk_bonus_month_is_first check (period_month = date_trunc('month', period_month)::date)
);
comment on table sales.commission_bonus is
  'Ad-hoc monthly bonus per rep: either a flat amount_minor or a percent of a chosen base. Rolled into that month''s commission_payout by the engine (0037). Multiple rows per rep+month allowed (e.g. a flat plus a percent).';
comment on column sales.commission_bonus.period_month is 'First day of the month (EST) the bonus lands in. The engine buckets it into that month''s statement.';
comment on column sales.commission_bonus.bonus_kind is 'flat = pay amount_minor; percent = pay percent x the percent_basis.';
comment on column sales.commission_bonus.amount_minor is 'The flat bonus in minor units (cents). Required when bonus_kind = flat.';
comment on column sales.commission_bonus.percent is 'The bonus rate (0.05 = 5%). Required when bonus_kind = percent.';
comment on column sales.commission_bonus.percent_basis is 'own_commission = percent of the rep''s other commission that month; cash_collected = percent of the rep''s cash collected that month; manual = percent of manual_base_minor.';
comment on column sales.commission_bonus.manual_base_minor is 'The explicit base (cents) when percent_basis = manual.';
comment on column sales.commission_bonus.created_by_rep_id is 'Which admin (as a rep) added the bonus, for audit.';

create trigger trg_commission_bonus_updated before update on sales.commission_bonus
  for each row execute function public.set_updated_at();
create index if not exists idx_commission_bonus_rep_month on sales.commission_bonus(rep_id, period_month);

alter table sales.commission_bonus enable row level security;
grant all on sales.commission_bonus to service_role;
grant select on sales.commission_bonus to authenticated;
create policy "commission_bonus_auth_read" on sales.commission_bonus for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 4. WIDEN commission_line_type for the new line kinds
-- ---------------------------------------------------------------------
-- Existing: base, residual, adjustment, clawback. Add the new plan's line kinds.
alter type public.commission_line_type add value if not exists 'setter_base';
alter type public.commission_line_type add value if not exists 'setter_pct';
alter type public.commission_line_type add value if not exists 'partner';
alter type public.commission_line_type add value if not exists 'bonus';

-- ---------------------------------------------------------------------
-- 5. finance.v_deal_collection — per-deal % of invoice collected
-- ---------------------------------------------------------------------
-- The 25%-collected unlock gate reads this. Collected = successful_payment gross
-- (excluding the $25 booking fee) minus reversals, over the deal. Demo-aware via
-- the is_demo column so the dashboard and the engine can both filter.
create or replace view finance.v_deal_collection as
select
  d.id                                as deal_id,
  d.is_demo                           as is_demo,
  d.closer_rep_id                     as closer_rep_id,
  d.setter_rep_id                     as setter_rep_id,
  d.commission_partner_rep_id         as commission_partner_rep_id,
  d.status                            as deal_status,
  d.total_contract_value_minor        as invoice_minor,
  coalesce(pay.gross_minor, 0)        as collected_gross_minor,
  coalesce(rev.reversed_minor, 0)     as reversed_minor,
  coalesce(pay.gross_minor, 0) - coalesce(rev.reversed_minor, 0) as collected_net_minor,
  case when d.total_contract_value_minor > 0
       then round((coalesce(pay.gross_minor,0) - coalesce(rev.reversed_minor,0))::numeric
                  / d.total_contract_value_minor, 4)
       else 0 end                     as collected_pct
from sales.deal d
left join lateral (
  select coalesce(sum(p.amount_minor), 0) as gross_minor
  from finance.successful_payment p
  where p.deal_id = d.id
    and p.type <> 'booking_25'
    and p.is_demo = d.is_demo
) pay on true
left join lateral (
  select coalesce(sum(r.amount_minor), 0) as reversed_minor
  from finance.reversal r
  where r.deal_id = d.id
    and r.is_demo = d.is_demo
) rev on true;

comment on view finance.v_deal_collection is
  'Per-deal collected amount and fraction of invoice collected (gross minus reversals, excluding the $25 booking fee). Feeds the 25%-collected commission unlock gate and the dashboard collection column.';

grant select on finance.v_deal_collection to service_role, authenticated;

-- ---------------------------------------------------------------------
-- 6. DEMO ISOLATION on the (legacy) payout + line tables
-- ---------------------------------------------------------------------
-- finance.commission_payout / commission_line predate is_demo (0010). The engine
-- persists REAL commission for payroll; a Supabase branch / test run can persist
-- demo data in parallel without colliding. The dashboard's demo-mode preview keeps
-- using the on-the-fly estimate (lib/commission.ts); only real payouts are stored
-- in production. The unique period key includes is_demo so both can coexist.
alter table finance.commission_payout add column if not exists is_demo boolean not null default false;
alter table finance.commission_line   add column if not exists is_demo boolean not null default false;
create unique index if not exists uq_commission_payout_period
  on finance.commission_payout (rep_id, period_start, period_end, is_demo);
create index if not exists idx_commission_line_payout on finance.commission_line(payout_id);
create index if not exists idx_commission_line_deal on finance.commission_line(deal_id);

-- End of migration 0036.
