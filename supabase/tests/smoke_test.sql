-- =====================================================================
-- TCB schema smoke test.
-- Seeds a realistic mini-funnel, checks the KPI queries return the right
-- numbers, then tries to violate three locked rules to prove the database
-- rejects them. Runs entirely inside a transaction and ROLLS BACK, so it
-- leaves ZERO rows behind — safe to run against the live (empty) project.
-- =====================================================================
begin;

-- ---- people + offer ----
insert into rep(id, full_name, role) values
  ('00000000-0000-0000-0000-000000000001','Test Setter','setter'),
  ('00000000-0000-0000-0000-000000000002','Test Closer','closer');
insert into offer(id, name, type) values
  ('00000000-0000-0000-0000-000000000010','Backdoor Credit Reset','core');

-- ---- Jordan: books, reschedules twice, shows, closes ----
insert into contact(id, full_name, lifecycle_status) values
  ('00000000-0000-0000-0000-0000000000a1','Jordan Test','customer');
insert into opportunity(id, contact_id, stage) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','closed_won');
insert into opt_in(contact_id, opportunity_id, submitted_at, source_channel) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','2026-06-20 10:00+00','paid_meta');
insert into call(id, opportunity_id, type, rep_id, is_primary, offer_made, disposition) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','strategy','00000000-0000-0000-0000-000000000002', true, true, 'closed');
-- the per-slot model: one booking, three scheduled slots (moved twice, then taken)
insert into appointment(call_id, seq, scheduled_for, status, is_current) values
  ('00000000-0000-0000-0000-0000000000c1',1,'2026-06-23 09:00+00','rescheduled', false),
  ('00000000-0000-0000-0000-0000000000c1',2,'2026-06-25 09:00+00','rescheduled', false),
  ('00000000-0000-0000-0000-0000000000c1',3,'2026-06-27 09:00+00','taken',       true);
-- the $25 booking fee, the deal, the plan, a paid installment, and the commission
insert into successful_payment(strategy_call_id, processor, type, amount_minor, occurred_at) values
  ('00000000-0000-0000-0000-0000000000c1','stripe','booking_25',2500,'2026-06-20 10:05+00');
insert into deal(id, opportunity_id, contact_id, closer_rep_id, offer_id, total_contract_value_minor, plan_type_snapshot, deal_close_date) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010',350000,'3pay','2026-06-27');
insert into payment_plan(id, deal_id, version, plan_type, total_minor) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1',1,'3pay',350000);
insert into receivable(payment_plan_id, deal_id, installment_no, due_date, amount_minor, status) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1',1,'2026-06-27',116700,'paid');
insert into successful_payment(deal_id, rep_id, processor, type, amount_minor, occurred_at) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000002','nmi','deposit',116700,'2026-06-27 11:00+00');
insert into commission_line(rep_id, deal_id, type, rate_applied, commission_amount_minor) values
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000d1','base',0.10,11670);

-- ---- Dana: books, no-shows ----
insert into contact(id, full_name) values
  ('00000000-0000-0000-0000-0000000000a2','Dana Test');
insert into opportunity(id, contact_id, stage) values
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a2','booked');
insert into call(id, opportunity_id, type, rep_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2','strategy','00000000-0000-0000-0000-000000000002', true);
insert into appointment(call_id, seq, scheduled_for, status, is_current) values
  ('00000000-0000-0000-0000-0000000000c2',1,'2026-06-27 14:00+00','no_show', true);
insert into successful_payment(strategy_call_id, processor, type, amount_minor, occurred_at) values
  ('00000000-0000-0000-0000-0000000000c2','stripe','booking_25',2500,'2026-06-21 09:00+00');

\echo ''
\echo '================ KPI CHECKS (value | expected) ================'
select 'Booked (unique primary strategy calls)' as kpi, count(*) as value, 2 as expected
  from call where type='strategy' and is_primary and not coalesce(is_duplicate,false);
select 'Taken (bookings with a taken slot)', count(distinct call_id), 1
  from appointment where status='taken';
select 'No-shows', count(*), 1 from appointment where status='no_show';
select 'Total reschedules', count(*), 2 from appointment where status='rescheduled';
select 'Calls on calendar for 2026-06-27', count(*), 2
  from appointment where scheduled_for::date = '2026-06-27';
select 'Cash collected (excl $25), minor', coalesce(sum(amount_minor),0)::int, 116700
  from successful_payment where type <> 'booking_25';
select 'Commission owed, minor', coalesce(sum(commission_amount_minor),0)::int, 11670
  from commission_line;

\echo ''
\echo '================ RULE ENFORCEMENT (negative tests) ================'
do $$ begin
  insert into call(opportunity_id, type, is_primary) values ('00000000-0000-0000-0000-0000000000b1','strategy', true);
  raise notice 'FAIL: a 2nd primary strategy call was allowed';
exception when unique_violation then
  raise notice 'PASS: 2nd primary strategy call rejected (uq_primary_strategy)';
end $$;

do $$ begin
  insert into opportunity(contact_id, stage) values ('00000000-0000-0000-0000-0000000000a2','strategy_taken');
  raise notice 'FAIL: a 2nd OPEN opportunity for the same contact was allowed';
exception when unique_violation then
  raise notice 'PASS: 2nd open opportunity rejected (uq_open_opp_per_contact)';
end $$;

do $$ begin
  insert into appointment(call_id, seq, scheduled_for, status, is_current)
    values ('00000000-0000-0000-0000-0000000000c1',4,'2026-06-29 09:00+00','scheduled', true);
  raise notice 'FAIL: a 2nd current appointment was allowed';
exception when unique_violation then
  raise notice 'PASS: 2nd current appointment rejected (uq_current_appt)';
end $$;

rollback;
\echo ''
\echo '================ ROLLED BACK — TCB database is untouched ================'
