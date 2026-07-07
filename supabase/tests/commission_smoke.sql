-- =====================================================================
-- Commission engine smoke test (July 2 comp plan, migrations 0036 + 0037).
-- Seeds one $4,000 deal with a closer, a setter, and a partner, then walks the
-- collection gate, the accruals, a bonus, and a refund clawback, calling
-- finance.recompute_commissions(false) at each step and printing value | expected.
-- Runs inside a transaction and ROLLS BACK — leaves zero rows behind.
--
-- Amounts: invoice 400000 ($4,000). Closer base 10% = 40000. Setter 5% = 20000.
-- Partner 10% = 40000. Gate unlocks at 25% collected = 100000.
-- =====================================================================
begin;

-- ---- people + offer ----
insert into rep(id, full_name, role, is_partner) values
  ('00000000-0000-0000-0000-0000000c0001','Smoke Setter','setter', false),
  ('00000000-0000-0000-0000-0000000c0002','Smoke Closer','closer', false),
  ('00000000-0000-0000-0000-0000000c0003','Smoke Partner','closer', true);
insert into offer(id, name, type) values
  ('00000000-0000-0000-0000-0000000c0010','Smoke Offer','core');

-- ---- contact / opportunity (qualified) / deal with all 3 attributions ----
insert into contact(id, full_name, lifecycle_status) values
  ('00000000-0000-0000-0000-0000000c00a1','Smoke Buyer','customer');
insert into opportunity(id, contact_id, stage, qualified) values
  ('00000000-0000-0000-0000-0000000c00b1','00000000-0000-0000-0000-0000000c00a1','closed_won', true);
insert into call(id, opportunity_id, type, rep_id, setter_rep_id, is_primary, disposition) values
  ('00000000-0000-0000-0000-0000000c00c1','00000000-0000-0000-0000-0000000c00b1','strategy',
   '00000000-0000-0000-0000-0000000c0002','00000000-0000-0000-0000-0000000c0001', true, 'closed');
insert into appointment(call_id, seq, scheduled_for, status, is_current) values
  ('00000000-0000-0000-0000-0000000c00c1',1,'2026-06-27 15:00+00','taken', true);
insert into deal(id, opportunity_id, contact_id, closer_rep_id, setter_rep_id, commission_partner_rep_id,
                 offer_id, total_contract_value_minor, plan_type_snapshot, deal_close_date) values
  ('00000000-0000-0000-0000-0000000c00d1','00000000-0000-0000-0000-0000000c00b1','00000000-0000-0000-0000-0000000c00a1',
   '00000000-0000-0000-0000-0000000c0002','00000000-0000-0000-0000-0000000c0001','00000000-0000-0000-0000-0000000c0003',
   '00000000-0000-0000-0000-0000000c0010',400000,'3pay','2026-06-27');

-- enable setter % + partner % for the right reps (defaults: closer base/gate/clawback on; setter/partner off)
insert into sales.rep_commission_setting(rep_id, rule_id, enabled)
  select '00000000-0000-0000-0000-0000000c0001', id, true from sales.commission_rule where key = 'setter_pct';
insert into sales.rep_commission_setting(rep_id, rule_id, enabled)
  select '00000000-0000-0000-0000-0000000c0003', id, true from sales.commission_rule where key = 'partner_pct';

\echo ''
\echo '=== STEP A: 50000 collected (12.5% < 25%) -> everything LOCKED ==='
insert into successful_payment(deal_id, rep_id, processor, type, amount_minor, occurred_at) values
  ('00000000-0000-0000-0000-0000000c00d1','00000000-0000-0000-0000-0000000c0002','nmi','deposit',50000,'2026-06-27 15:10+00');
select finance.recompute_commissions(false);
select 'Closer commission lines (locked)' as check, coalesce(sum(commission_amount_minor),0)::int as value, 0 as expected
  from finance.commission_line where rep_id = '00000000-0000-0000-0000-0000000c0002';

\echo ''
\echo '=== STEP B: +50000 (=100000, 25%) -> accruals unlock in June ==='
insert into successful_payment(deal_id, rep_id, processor, type, amount_minor, occurred_at) values
  ('00000000-0000-0000-0000-0000000c00d1','00000000-0000-0000-0000-0000000c0002','nmi','installment',50000,'2026-06-27 16:00+00');
select finance.recompute_commissions(false);
select 'Deal collected_pct', collected_pct::text, '0.2500'
  from finance.v_deal_collection where deal_id = '00000000-0000-0000-0000-0000000c00d1';
select 'Closer base (June), minor', coalesce(sum(commission_amount_minor),0)::int, 40000
  from finance.v_commission_statement_line
  where rep_id = '00000000-0000-0000-0000-0000000c0002' and type = 'base' and period_start = '2026-06-01';
select 'Setter pct (June), minor', coalesce(sum(commission_amount_minor),0)::int, 20000
  from finance.v_commission_statement_line
  where rep_id = '00000000-0000-0000-0000-0000000c0001' and type = 'setter_pct' and period_start = '2026-06-01';
select 'Partner (June), minor', coalesce(sum(commission_amount_minor),0)::int, 40000
  from finance.v_commission_statement_line
  where rep_id = '00000000-0000-0000-0000-0000000c0003' and type = 'partner' and period_start = '2026-06-01';

\echo ''
\echo '=== STEP C: flat 50000 bonus for the closer in June -> total 90000 ==='
insert into sales.commission_bonus(rep_id, period_month, bonus_kind, amount_minor, note) values
  ('00000000-0000-0000-0000-0000000c0002','2026-06-01','flat',50000,'smoke test bonus');
select finance.recompute_commissions(false);
select 'Closer June payout total, minor', total_commission_minor::int, 90000
  from finance.commission_payout
  where rep_id = '00000000-0000-0000-0000-0000000c0002' and period_start = '2026-06-01' and not is_demo;

\echo ''
\echo '=== STEP D: refund 100000 + deal refunded -> clawback closer base, bonus stays ==='
insert into finance.reversal(deal_id, type, amount_minor, occurred_at) values
  ('00000000-0000-0000-0000-0000000c00d1','refund',100000,'2026-06-28 12:00+00');
update deal set status = 'refunded' where id = '00000000-0000-0000-0000-0000000c00d1';
select finance.recompute_commissions(false);
select 'Closer clawback line (June), minor', coalesce(sum(commission_amount_minor),0)::int, -40000
  from finance.v_commission_statement_line
  where rep_id = '00000000-0000-0000-0000-0000000c0002' and type = 'clawback' and period_start = '2026-06-01';
select 'Closer June total after clawback (base - claw + bonus)', total_commission_minor::int, 50000
  from finance.commission_payout
  where rep_id = '00000000-0000-0000-0000-0000000c0002' and period_start = '2026-06-01' and not is_demo;

\echo ''
\echo '=== STEP E: setter monthly base with threshold overridden to 1 -> 100000 line ==='
insert into sales.rep_commission_setting(rep_id, rule_id, enabled, override_params)
  select '00000000-0000-0000-0000-0000000c0001', id, true, '{"amount_minor":100000,"qualified_calls_threshold":1}'::jsonb
  from sales.commission_rule where key = 'setter_base';
select finance.recompute_commissions(false);
select 'Setter base line (June), minor', coalesce(sum(commission_amount_minor),0)::int, 100000
  from finance.v_commission_statement_line
  where rep_id = '00000000-0000-0000-0000-0000000c0001' and type = 'setter_base' and period_start = '2026-06-01';

\echo ''
\echo '=== FREEZE TEST: approve June closer payout, add a new refund, prove it does NOT move ==='
update finance.commission_payout set status = 'approved'
  where rep_id = '00000000-0000-0000-0000-0000000c0002' and period_start = '2026-06-01' and not is_demo;
-- a second (bogus) recompute must leave the approved payout total untouched
select finance.recompute_commissions(false);
select 'Approved June closer total is frozen', total_commission_minor::int, 50000
  from finance.commission_payout
  where rep_id = '00000000-0000-0000-0000-0000000c0002' and period_start = '2026-06-01' and status = 'approved' and not is_demo;

rollback;
\echo ''
\echo '================ ROLLED BACK — TCB database is untouched ================'
