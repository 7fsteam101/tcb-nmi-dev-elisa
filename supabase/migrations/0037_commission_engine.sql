-- =====================================================================
-- 0037: Commission ENGINE — computes and persists the July 2 comp plan.
--
--   finance.recompute_commissions(p_is_demo boolean default false) -> void
--
-- Idempotent. Recomputes every OPEN (status = 'calculated') monthly payout for the
-- given demo scope from the current payments/reversals/deals/rules/toggles/bonuses,
-- and NEVER touches a payout that is already 'approved' or 'paid' (those are frozen
-- statements). A refund whose month is already frozen is re-dated onto the current
-- open month, which is the "subtract from the rep's next check" rule.
--
-- Call it from the NMI / Stripe payment + reversal webhooks (after the row lands)
-- and from the nightly receivables cron:   select finance.recompute_commissions(false);
--
-- REVIEW BEFORE PROD: apply to a Supabase branch, run supabase/tests/commission_smoke.sql,
-- confirm the numbers, THEN promote. Do not run first against production.
--
-- Model (all money = integer minor units / cents; all month bucketing = America/New_York):
--   * Closer base (rule base_rate): rate x invoice (total_contract_value_minor).
--       Locked by the collection_gate until 25% of the invoice is collected (gross,
--       excl. the $25 booking fee). payout_basis full_at_gate = the whole amount once
--       the gate is met; proportional = rate x net cash collected, released after gate.
--   * Setter % (setter_pct): rate x invoice on deals they set, same gate. Setter base
--       (setter_base): a flat monthly amount once they log >= N qualified calls that
--       showed that month.
--   * Partner (partner_pct): rate x invoice on deals they're attributed on, same gate.
--   * Refund clawback (refund_clawback): on a refunded deal, reverse that client's
--       commission (full_reversal) or deduct rate x refunded cash (rate_on_cash),
--       dated at the refund; lands on the next open check.
--   * Bonus (sales.commission_bonus): flat, or percent of own commission / cash
--       collected / a manual base, for a chosen month.
-- Each line is written to finance.commission_line (rate frozen) under a
-- finance.commission_payout (rep x month). The dashboard reads those.
-- =====================================================================

create or replace function finance.recompute_commissions(p_is_demo boolean default false)
returns void
language plpgsql
as $$
declare
  v_tz text := 'America/New_York';
  v_current_month date := (date_trunc('month', (now() at time zone 'America/New_York')))::date;
begin
  -- ---- 0. effective per-rep rule resolution -------------------------------
  -- enabled = per-rep setting if present else rule default; params = override else rule.
  drop table if exists _rule;
  create temporary table _rule on commit drop as
  select r.id as rep_id, cr.key,
         coalesce(s.enabled, cr.default_enabled) as enabled,
         coalesce(s.override_params, cr.params)  as params
  from sales.rep r
  cross join sales.commission_rule cr
  left join sales.rep_commission_setting s on s.rep_id = r.id and s.rule_id = cr.id
  where r.active;

  -- ---- 1. per-deal cash + unlock inputs -----------------------------------
  -- running gross collected per payment (for the unlock date), plus per-deal totals.
  drop table if exists _pay;
  create temporary table _pay on commit drop as
  select p.deal_id, p.occurred_at,
         sum(p.amount_minor) over (partition by p.deal_id
                                   order by p.occurred_at, p.id
                                   rows between unbounded preceding and current row) as running_gross
  from finance.successful_payment p
  where p.deal_id is not null and p.type <> 'booking_25' and p.is_demo = p_is_demo;

  drop table if exists _deal;
  create temporary table _deal on commit drop as
  select d.id as deal_id,
         d.closer_rep_id,
         d.setter_rep_id,
         d.commission_partner_rep_id,
         d.total_contract_value_minor as invoice_minor,
         d.status,
         d.deal_close_date,
         (d.status = 'refunded') as is_refunded,
         coalesce(pt.gross, 0)  as collected_gross,
         coalesce(rv.reversed, 0) as reversed_minor,
         coalesce(pt.gross, 0) - coalesce(rv.reversed, 0) as collected_net,
         rv.last_reversal_date
  from sales.deal d
  left join (select deal_id, max(running_gross) as gross from _pay group by deal_id) pt
         on pt.deal_id = d.id
  left join (select r.deal_id, sum(r.amount_minor) as reversed,
                    max(r.occurred_at at time zone 'America/New_York')::date as last_reversal_date
             from finance.reversal r where r.deal_id is not null and r.is_demo = p_is_demo
             group by r.deal_id) rv
         on rv.deal_id = d.id
  where d.is_demo = p_is_demo;

  -- ---- 2. participants (one row per deal x rep x role) --------------------
  -- Unifies closer/setter/partner so the gate + accrual + clawback logic is shared.
  drop table if exists _part;
  create temporary table _part on commit drop as
  -- closer
  select d.deal_id, d.closer_rep_id as rep_id, 'base'::text as role,
         d.invoice_minor, d.collected_net, d.reversed_minor, d.status, d.is_refunded,
         d.deal_close_date, d.last_reversal_date,
         (b.params->>'rate')::numeric as rate,
         coalesce(b.params->>'payout_basis','full_at_gate') as payout_basis,
         coalesce(g.enabled,false) as gate_enabled,
         coalesce(nullif(g.params->>'threshold','')::numeric, 0.25) as gate_threshold,
         coalesce(cl.enabled,false) as claw_enabled,
         coalesce(cl.params->>'mode','full_reversal') as claw_mode
  from _deal d
  join _rule b on b.rep_id = d.closer_rep_id and b.key = 'base_rate' and b.enabled
  left join _rule g  on g.rep_id  = d.closer_rep_id and g.key  = 'collection_gate'
  left join _rule cl on cl.rep_id = d.closer_rep_id and cl.key = 'refund_clawback'
  where d.closer_rep_id is not null
  union all
  -- setter percentage
  select d.deal_id, d.setter_rep_id, 'setter_pct',
         d.invoice_minor, d.collected_net, d.reversed_minor, d.status, d.is_refunded,
         d.deal_close_date, d.last_reversal_date,
         (sp.params->>'rate')::numeric, 'full_at_gate',
         coalesce(g.enabled,false), coalesce(nullif(g.params->>'threshold','')::numeric, 0.25),
         coalesce(cl.enabled,false), coalesce(cl.params->>'mode','full_reversal')
  from _deal d
  join _rule sp on sp.rep_id = d.setter_rep_id and sp.key = 'setter_pct' and sp.enabled
  left join _rule g  on g.rep_id  = d.setter_rep_id and g.key  = 'collection_gate'
  left join _rule cl on cl.rep_id = d.setter_rep_id and cl.key = 'refund_clawback'
  where d.setter_rep_id is not null
  union all
  -- partner
  select d.deal_id, d.commission_partner_rep_id, 'partner',
         d.invoice_minor, d.collected_net, d.reversed_minor, d.status, d.is_refunded,
         d.deal_close_date, d.last_reversal_date,
         (pp.params->>'rate')::numeric, 'full_at_gate',
         coalesce(g.enabled,false), coalesce(nullif(g.params->>'threshold','')::numeric, 0.25),
         coalesce(cl.enabled,false), coalesce(cl.params->>'mode','full_reversal')
  from _deal d
  join _rule pp on pp.rep_id = d.commission_partner_rep_id and pp.key = 'partner_pct' and pp.enabled
  left join _rule g  on g.rep_id  = d.commission_partner_rep_id and g.key  = 'collection_gate'
  left join _rule cl on cl.rep_id = d.commission_partner_rep_id and cl.key = 'refund_clawback'
  where d.commission_partner_rep_id is not null;

  -- ---- 3. stage events ----------------------------------------------------
  drop table if exists _evt;
  create temporary table _evt (
    rep_id uuid,
    deal_id uuid,
    role text,
    line_type public.commission_line_type,
    rate_applied numeric,
    amount_minor int,
    event_date date
  ) on commit drop;

  -- 3a. accruals (closer base / setter_pct / partner). Gated: if the gate is on,
  --     only accrue once the collected running total crosses threshold x invoice,
  --     and date the accrual at that unlock payment.
  insert into _evt (rep_id, deal_id, role, line_type, rate_applied, amount_minor, event_date)
  select pt.rep_id, pt.deal_id, pt.role,
         (case pt.role when 'base' then 'base' when 'setter_pct' then 'setter_pct' else 'partner' end)::public.commission_line_type,
         pt.rate,
         (case when pt.payout_basis = 'proportional'
               then round(pt.collected_net * pt.rate)
               else round(pt.invoice_minor * pt.rate) end)::int,
         case when pt.gate_enabled then u.unlock_date else pt.deal_close_date end
  from _part pt
  left join lateral (
    select min(p.occurred_at at time zone 'America/New_York')::date as unlock_date
    from _pay p
    where p.deal_id = pt.deal_id
      and p.running_gross >= pt.gate_threshold * pt.invoice_minor
  ) u on true
  where (not pt.gate_enabled) or (u.unlock_date is not null);

  -- 3b. refund clawback: reverse the accrued commission (full_reversal) or deduct
  --     rate x refunded cash (rate_on_cash), dated at the refund.
  insert into _evt (rep_id, deal_id, role, line_type, rate_applied, amount_minor, event_date)
  select a.rep_id, a.deal_id, a.role, 'clawback'::public.commission_line_type, a.rate_applied,
         (case when pt.claw_mode = 'rate_on_cash'
               then -round(pt.reversed_minor * a.rate_applied)
               else -a.amount_minor end)::int,
         coalesce(pt.last_reversal_date, pt.deal_close_date)
  from _evt a
  join _part pt on pt.rep_id = a.rep_id and pt.deal_id = a.deal_id and pt.role = a.role
  where a.line_type in ('base','setter_pct','partner')
    and pt.claw_enabled
    and pt.is_refunded;

  -- 3c. setter monthly base: flat amount once a setter logs >= N qualified calls that
  --     showed (appointment taken, opportunity qualified) in a month. Dated month-end.
  insert into _evt (rep_id, deal_id, role, line_type, rate_applied, amount_minor, event_date)
  select q.setter_rep_id, null, 'setter_base', 'setter_base'::public.commission_line_type, null,
         (sb.params->>'amount_minor')::int,
         (q.mth + interval '1 month - 1 day')::date
  from (
    select c.setter_rep_id,
           date_trunc('month', (a.scheduled_for at time zone 'America/New_York'))::date as mth,
           count(*) as shown_qualified
    from sales.call c
    join sales.appointment a on a.call_id = c.id and a.status = 'taken'
    join sales.opportunity o on o.id = c.opportunity_id and o.qualified
    where c.type = 'strategy' and c.setter_rep_id is not null and c.is_demo = p_is_demo
    group by c.setter_rep_id, date_trunc('month', (a.scheduled_for at time zone 'America/New_York'))::date
  ) q
  join _rule sb on sb.rep_id = q.setter_rep_id and sb.key = 'setter_base' and sb.enabled
  where q.shown_qualified >= (sb.params->>'qualified_calls_threshold')::int;

  -- 3d. bonuses. percent-of-own-commission uses the events staged so far.
  drop table if exists _repmonth;
  create temporary table _repmonth on commit drop as
  select rep_id, date_trunc('month', event_date)::date as period_month, sum(amount_minor) as subtotal
  from _evt group by rep_id, date_trunc('month', event_date)::date;

  insert into _evt (rep_id, deal_id, role, line_type, rate_applied, amount_minor, event_date)
  select b.rep_id, null, 'bonus', 'bonus'::public.commission_line_type, b.percent,
         (case b.bonus_kind
            when 'flat' then b.amount_minor
            else round(b.percent * (case b.percent_basis
                 when 'own_commission' then coalesce(rm.subtotal, 0)
                 when 'cash_collected' then coalesce(rc.cash, 0)
                 when 'manual'         then coalesce(b.manual_base_minor, 0)
                 else 0 end)) end)::int,
         b.period_month
  from sales.commission_bonus b
  left join _repmonth rm on rm.rep_id = b.rep_id and rm.period_month = b.period_month
  left join lateral (
    select coalesce(sum(p.amount_minor), 0) as cash
    from finance.successful_payment p
    where p.rep_id = b.rep_id and p.type <> 'booking_25' and p.is_demo = p_is_demo
      and date_trunc('month', (p.occurred_at at time zone 'America/New_York'))::date = b.period_month
  ) rc on true
  where b.is_demo = p_is_demo;

  -- ---- 4. assign each event to an OPEN monthly statement ------------------
  -- natural month = the event's own month. If that month is already frozen
  -- (approved/paid), an accrual is dropped (it is locked into the paid statement and
  -- must not move); a clawback is re-dated to the current open month (next check).
  drop table if exists _line;
  create temporary table _line on commit drop as
  select e.rep_id, e.deal_id, e.line_type, e.rate_applied, e.amount_minor,
         case
           when exists (select 1 from finance.commission_payout cp
                        where cp.rep_id = e.rep_id
                          and cp.period_start = date_trunc('month', e.event_date)::date
                          and cp.is_demo = p_is_demo
                          and cp.status in ('approved','paid'))
           then case when e.line_type = 'clawback' then v_current_month else null end
           else date_trunc('month', e.event_date)::date
         end as period_month
  from _evt e;
  delete from _line where period_month is null;

  -- ---- 5. persist: rebuild OPEN payouts only -----------------------------
  -- 5a. ensure a payout row exists for each (rep, effective month) with events
  insert into finance.commission_payout (rep_id, period_start, period_end, status, total_commission_minor, is_demo)
  select distinct l.rep_id, l.period_month, (l.period_month + interval '1 month - 1 day')::date, 'calculated', 0, p_is_demo
  from _line l
  on conflict (rep_id, period_start, period_end, is_demo) do nothing;

  -- 5b. wipe lines under every OPEN payout in scope, then re-insert from _line
  delete from finance.commission_line cl
  using finance.commission_payout cp
  where cl.payout_id = cp.id and cp.is_demo = p_is_demo and cp.status = 'calculated';

  insert into finance.commission_line
    (rep_id, payment_id, deal_id, payout_id, type, rate_applied, commission_amount_minor, is_demo)
  select l.rep_id, null, l.deal_id, cp.id, l.line_type, coalesce(l.rate_applied, 0), l.amount_minor, p_is_demo
  from _line l
  join finance.commission_payout cp
    on cp.rep_id = l.rep_id and cp.period_start = l.period_month
   and cp.is_demo = p_is_demo and cp.status = 'calculated';

  -- 5c. recompute totals on the open payouts
  update finance.commission_payout cp
  set total_commission_minor = coalesce(
        (select sum(cl.commission_amount_minor) from finance.commission_line cl where cl.payout_id = cp.id), 0),
      updated_at = now()
  where cp.is_demo = p_is_demo and cp.status = 'calculated';

  -- 5d. drop open payouts that ended up empty (keeps the list tidy)
  delete from finance.commission_payout cp
  where cp.is_demo = p_is_demo and cp.status = 'calculated'
    and not exists (select 1 from finance.commission_line cl where cl.payout_id = cp.id);
end;
$$;

comment on function finance.recompute_commissions(boolean) is
  'Recomputes and persists all OPEN monthly commission statements (finance.commission_payout + commission_line) for the July 2 comp plan. Never modifies approved/paid statements. Call after each payment/reversal webhook and from the nightly cron. p_is_demo scopes to demo vs real data.';

-- ---------------------------------------------------------------------
-- Reporting views for the dashboard
-- ---------------------------------------------------------------------

-- Leaderboard: per rep per month, total commission + rank ("who is getting the most").
create or replace view finance.v_commission_leaderboard as
select cp.rep_id, r.full_name, r.role, r.is_partner,
       cp.period_start, cp.period_end, cp.total_commission_minor, cp.status, cp.is_demo,
       rank() over (partition by cp.period_start, cp.is_demo
                    order by cp.total_commission_minor desc) as rank_in_period
from finance.commission_payout cp
join sales.rep r on r.id = cp.rep_id;
comment on view finance.v_commission_leaderboard is
  'Per-rep monthly commission totals with a rank inside each month. Drives the Commissions leaderboard (top performers).';
grant select on finance.v_commission_leaderboard to service_role, authenticated;

-- Statement lines: every commission line joined to its deal/contact + the payout it sits on.
create or replace view finance.v_commission_statement_line as
select cl.id, cl.payout_id, cp.rep_id, cp.period_start, cp.period_end, cp.status,
       cl.type, cl.deal_id, d.contact_id, cl.rate_applied, cl.commission_amount_minor, cl.is_demo
from finance.commission_line cl
join finance.commission_payout cp on cp.id = cl.payout_id
left join sales.deal d on d.id = cl.deal_id;
comment on view finance.v_commission_statement_line is
  'One row per commission line (accrual, clawback, setter/partner, bonus) with its deal/contact and the payout period. Drives the per-closer Commissions tab and the admin statement view.';
grant select on finance.v_commission_statement_line to service_role, authenticated;

-- End of migration 0037.
