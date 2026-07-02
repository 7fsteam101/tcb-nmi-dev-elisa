-- =====================================================================
-- 0010: Launch prep (2026-07-02).
--  1) core.lost_reason lookup + opportunity.lost_reason_id (lost vs DQ tracked separately)
--  2) core.app_user (dashboard login) + core.app_setting (app config)
--  3) is_demo flags on funnel/money tables (demo mode: obviously-fake data, easy purge)
--  4) KPI indexes
--  5) Reference seeds: reasons, objections, sources, offers, pricing plans,
--     commission plan + tiers, reps. Lists mirror the client-approval doc
--     ("Confirmations & Lists to Approve") — editable after TCB signs off.
--  6) Demo funnel data (names prefixed DEMO, is_demo=true, purge = one delete)
-- =====================================================================

-- 1) lost_reason ------------------------------------------------------
create table core.lost_reason (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  sort_order int,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table core.lost_reason is 'Why a QUALIFIED lead did not convert (distinct from dq_reason, which is why a lead was screened out). Referenced by sales.opportunity.lost_reason_id.';
comment on column core.lost_reason.id is 'Primary key (uuid, auto-generated).';
comment on column core.lost_reason.name is 'The option label shown in the UI and reports.';
comment on column core.lost_reason.category is 'Optional grouping for the option.';
comment on column core.lost_reason.sort_order is 'Display order.';
comment on column core.lost_reason.active is 'Whether the option is currently selectable.';
comment on column core.lost_reason.created_at is 'When this row was created.';
comment on column core.lost_reason.updated_at is 'When this row was last updated (auto-maintained).';

alter table sales.opportunity add column lost_reason_id uuid references core.lost_reason(id);
comment on column sales.opportunity.lost_reason_id is 'FK to the lost reason (why a qualified lead did not convert). dq_reason_id covers screened-out leads.';

-- 2) app_user + app_setting ------------------------------------------
create type public.app_role as enum ('admin','leadership','closer','setter','csm');

create table core.app_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  password_hash text not null,
  role public.app_role not null default 'closer',
  rep_id uuid references sales.rep(id),
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table core.app_user is 'Dashboard login accounts (scrypt password hashes). Verified server-side only; no client access. rep_id links a login to their sales.rep record so forms pre-fill.';
comment on column core.app_user.id is 'Primary key (uuid, auto-generated).';
comment on column core.app_user.email is 'Login email (unique).';
comment on column core.app_user.full_name is 'Display name.';
comment on column core.app_user.password_hash is 'scrypt hash (scrypt$N$r$p$salt$hash). Never a plaintext password.';
comment on column core.app_user.role is 'Dashboard role: admin / leadership / closer / setter / csm — drives what pages and actions are visible.';
comment on column core.app_user.rep_id is 'FK to sales.rep, when this login belongs to a rep.';
comment on column core.app_user.active is 'Whether the login is enabled.';
comment on column core.app_user.last_login_at is 'Last successful login.';
comment on column core.app_user.created_at is 'When this row was created.';
comment on column core.app_user.updated_at is 'When this row was last updated (auto-maintained).';

create table core.app_setting (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table core.app_setting is 'App-level configuration (key/value). e.g. demo_mode, report timezone.';
comment on column core.app_setting.key is 'Setting name.';
comment on column core.app_setting.value is 'Setting value (jsonb).';
comment on column core.app_setting.created_at is 'When this row was created.';
comment on column core.app_setting.updated_at is 'When this row was last updated (auto-maintained).';

insert into core.app_setting(key, value) values
  ('demo_mode', 'true'),
  ('report_timezone', '"America/New_York"'),
  ('org_name', '"The Credit Brothers"');

-- triggers + RLS + grants for the new tables
create trigger trg_lost_reason_updated before update on core.lost_reason for each row execute function public.set_updated_at();
create trigger trg_app_user_updated    before update on core.app_user    for each row execute function public.set_updated_at();
create trigger trg_app_setting_updated before update on core.app_setting for each row execute function public.set_updated_at();
alter table core.lost_reason enable row level security;
alter table core.app_user    enable row level security;
alter table core.app_setting enable row level security;
grant all on core.lost_reason, core.app_user, core.app_setting to service_role;
grant select on core.lost_reason to authenticated;

-- 3) is_demo flags ----------------------------------------------------
alter table core.contact              add column is_demo boolean not null default false;
alter table sales.opt_in              add column is_demo boolean not null default false;
alter table sales.opportunity         add column is_demo boolean not null default false;
alter table sales.call                add column is_demo boolean not null default false;
alter table sales.appointment         add column is_demo boolean not null default false;
alter table sales.deal                add column is_demo boolean not null default false;
alter table finance.payment_plan      add column is_demo boolean not null default false;
alter table finance.receivable        add column is_demo boolean not null default false;
alter table finance.successful_payment add column is_demo boolean not null default false;
alter table finance.reversal          add column is_demo boolean not null default false;
alter table marketing.ad_spend        add column is_demo boolean not null default false;
alter table delivery.fulfilment       add column is_demo boolean not null default false;
do $$ declare r record; begin
  for r in select * from (values ('core','contact'),('sales','opt_in'),('sales','opportunity'),('sales','call'),('sales','appointment'),('sales','deal'),('finance','payment_plan'),('finance','receivable'),('finance','successful_payment'),('finance','reversal'),('marketing','ad_spend'),('delivery','fulfilment')) v(s,t) loop
    execute format('comment on column %I.%I.is_demo is %L', r.s, r.t, 'Demo-mode row (obviously fake data for verifying features). Purge = delete where is_demo.');
  end loop;
end $$;

-- 4) KPI indexes ------------------------------------------------------
create index idx_opportunity_stage      on sales.opportunity(stage);
create index idx_opportunity_opened     on sales.opportunity(opened_at);
create index idx_optin_submitted        on sales.opt_in(submitted_at);
create index idx_call_type              on sales.call(type);
create index idx_appt_scheduled_for     on sales.appointment(scheduled_for);
create index idx_appt_status            on sales.appointment(status);
create index idx_receivable_due         on finance.receivable(due_date);
create index idx_receivable_status      on finance.receivable(status);
create index idx_payment_occurred       on finance.successful_payment(occurred_at);
create index idx_adspend_date           on marketing.ad_spend(date);
create index idx_writeback_status       on sync.writeback_queue(status);
create index idx_rawevents_status       on sync.raw_events(status);

-- 5) Reference seeds --------------------------------------------------
insert into core.dq_reason(name, sort_order) values
  ('In an active dispute within the last 40 days', 1),
  ('Already working with another credit company', 2),
  ('Does not qualify (fewer than 5 violation opportunities)', 3),
  ('Does not qualify (fewer than 2 accounts with violations)', 4),
  ('Cannot afford the program', 5),
  ('Not the decision maker', 6),
  ('No negative items to work on', 7),
  ('Other', 99);

insert into core.lost_reason(name, sort_order) values
  ('Price or budget', 1),
  ('Partner or spouse not on the call', 2),
  ('Went with a competitor', 3),
  ('Stopped responding (ghosted)', 4),
  ('Wanted to think about it', 5),
  ('Timing not right', 6),
  ('Did not trust the process', 7),
  ('Other', 99);

insert into core.cancellation_reason(name, sort_order) values
  ('Scheduling conflict', 1),
  ('At work or driving at call time', 2),
  ('40-day dispute window not yet clear', 3),
  ('Personal emergency', 4),
  ('No longer interested', 5),
  ('Cancelled by the team (screened out as unqualified)', 6),
  ('Other', 99);

insert into core.objection_type(name, sort_order) values
  ('Price or cost', 1),
  ('Partner or spouse', 2),
  ('Needs to think about it', 3),
  ('Timing', 4),
  ('Trust or skepticism', 5),
  ('Has tried credit repair before', 6),
  ('Wants to do it themselves', 7),
  ('Other', 99);

insert into core.source_channel(name, category, sort_order) values
  ('Meta Ads', 'paid', 1),
  ('DM Setting (tagged link)', 'outbound', 2),
  ('Referral', 'organic', 3),
  ('Organic / Direct', 'organic', 4),
  ('Affiliate', 'partner', 5),
  ('Demo', 'internal', 98),
  ('Other', null, 99);

-- offers + pricing plans (BDCR is the engine; legacy offers inactive)
insert into marketing.offer(name, type, default_price_minor, active) values
  ('Backdoor Credit Reset (BDCR)', 'core', 250000, true),
  ('Coaching', 'coaching', 200000, true),
  ('Business Funding', 'funding', null, true),
  ('School Membership', 'community', 4700, false),
  ('Credit Maxing (LTO)', 'lto', 2700, false),
  ('Strategy Call Booking Fee', 'booking_fee', 2500, true);

insert into marketing.pricing_plan(offer_id, name, version, installments, installment_amount_minor, requires_first_last, effective_from)
select o.id, v.name::public.plan_type, 1, v.n, v.amt, v.fl, date '2026-01-01'
from marketing.offer o,
 (values ('pif', 1, 250000, false),
         ('3pay', 3, 99700, false),
         ('6pay', 6, 49700, true),
         ('7pay', 7, 49700, false),
         ('12pay', 12, 29700, true),
         ('13pay', 13, 29700, false)) v(name, n, amt, fl)
where o.type = 'core';

-- commission: closer plan, 10% base / 15% at a 33.3%+ rolling-2-week close rate
insert into finance.commission_plan(name, role, basis, eval_metric, eval_window_days, refund_handling, effective_from, is_current)
values ('Closer standard', 'closer', 'cash_collected', 'close_rate', 14, 'clawback', date '2026-01-01', true);
insert into finance.commission_tier(commission_plan_id, label, min_metric_value, rate)
select id, t.label, t.min, t.rate from finance.commission_plan p,
 (values ('Base 10%', 0, 0.10), ('Elevated 15%', 0.333, 0.15)) t(label, min, rate)
where p.is_current;

-- known team (client confirms/extends; demo reps prefixed for easy purge)
insert into sales.rep(full_name, email, role, active) values
  ('Chris Steil', null, 'hybrid', true),
  ('Josh Steil', null, 'admin', true),
  ('Randi', null, 'csm', true),
  ('Jane', null, 'admin', true),
  ('DEMO Closer One', null, 'closer', true),
  ('DEMO Closer Two', null, 'closer', true),
  ('DEMO Setter One', null, 'setter', true);

-- 6) Demo funnel data --------------------------------------------------
-- 40 DEMO contacts over the last 35 days: opt-in -> $25 booking -> appointments
-- (with the real-world reschedule mess) -> taken calls -> 6 deals -> plans,
-- receivables, payments, one refund. Deterministic (seeded), all is_demo=true.
do $$
declare
  v_closer1 uuid; v_closer2 uuid; v_setter uuid;
  v_contact uuid; v_opp uuid; v_call uuid; v_deal uuid; v_plan uuid; v_recv uuid; v_pay uuid;
  v_offer uuid;
  i int; k int; n_appts int; slot timestamptz; base_day timestamptz;
  first_names text[] := array['Ava','Liam','Maya','Noah','Zoe','Eli','Ruby','Max','Ivy','Leo','Nia','Kai','Ana','Ray','Sky','Joy','Ben','Gia','Sam','Lux','Mia','Ace','Eva','Jax','Lia','Rex','Ida','Ozzy','Una','Vic','Wes','Xia','Yara','Zed','Omar','Pia','Quinn','Rosa','Seth','Tara'];
  stages public.opportunity_stage[] := array['lead_opt_in','strategy_call_booked','call_confirmed','no_show','warm_list','contract_sent','won_pif','won_pp','lost','dq_on_call']::public.opportunity_stage[];
  won_count int := 0;
  plan_names public.plan_type[] := array['pif','pif','3pay','6pay','12pay','3pay']::public.plan_type[];
  plan_insts int[]  := array[1,1,3,6,12,3];
  plan_amts int[]   := array[250000,250000,99700,49700,29700,99700];
  j int;
begin
  perform setseed(0.42);
  select id into v_closer1 from sales.rep where full_name='DEMO Closer One';
  select id into v_closer2 from sales.rep where full_name='DEMO Closer Two';
  select id into v_setter  from sales.rep where full_name='DEMO Setter One';
  select id into v_offer   from marketing.offer where type='core';

  for i in 1..40 loop
    base_day := now() - ((35 - (i % 35)) || ' days')::interval - interval '3 hours';

    insert into core.contact(full_name, first_name, last_name, primary_email, primary_phone, lifecycle_status, is_demo)
    values ('DEMO '||first_names[i]||' Example', first_names[i], 'Example',
            lower(first_names[i])||'.demo'||i||'@example.com', '+1555000'||lpad(i::text,4,'0'), 'lead', true)
    returning id into v_contact;

    insert into sales.opportunity(contact_id, stage, opened_at, owner_rep_id, first_touch_channel, cohort_month, is_demo)
    values (v_contact, 'lead_opt_in', base_day, case when i % 2 = 0 then v_closer1 else v_closer2 end,
            'meta_ads', date_trunc('month', base_day)::date, true)
    returning id into v_opp;

    insert into sales.opt_in(contact_id, opportunity_id, submitted_at, goal, credit_score_range, source_channel, source_campaign, counts_as_unique, is_demo)
    values (v_contact, v_opp, base_day, (array['house','car','credit_cards','business_credit']::public.optin_goal[])[1 + (i % 4)],
            (array['500-549','550-599','600-649','650-699'])[1 + (i % 4)], 'meta_ads', 'DEMO-BDCR-VSL-'||(1 + i % 3), true, true);

    -- ~70% book a $25 strategy call
    if i % 10 < 7 then
      insert into sales.call(opportunity_id, type, rep_id, scheduled_at, booking_source_channel, booking_source_campaign, is_primary, is_demo)
      values (v_opp, 'strategy', case when i % 2 = 0 then v_closer1 else v_closer2 end,
              base_day + interval '2 days', 'meta_ads', 'DEMO-BDCR-VSL-'||(1 + i % 3), true, true)
      returning id into v_call;

      insert into finance.successful_payment(strategy_call_id, processor, type, amount_minor, processing_fee_minor, occurred_at, is_demo)
      values (v_call, 'stripe', 'booking_25', 2500, 103, base_day + interval '90 minutes', true)
      returning id into v_pay;
      update sales.call set booking_payment_id = v_pay where id = v_call;

      update sales.opportunity set stage='strategy_call_booked' where id = v_opp;

      -- appointment history: ~1/3 reschedule once, a few twice (the leakage story)
      n_appts := case when i % 3 = 0 then 2 when i % 11 = 0 then 3 else 1 end;
      slot := base_day + interval '2 days';
      for k in 1..n_appts loop
        insert into sales.appointment(call_id, seq, scheduled_for, status, is_current, moved_by, rescheduled_at, is_demo)
        values (v_call, k, slot,
                case when k < n_appts then 'rescheduled'::public.appointment_status
                     when i % 7 = 0 then 'no_show'::public.appointment_status
                     when slot > now() then 'scheduled'::public.appointment_status
                     else 'taken'::public.appointment_status end,
                k = n_appts,
                case when k < n_appts and i % 2 = 0 then 'lead_link'::public.appointment_actor
                     when k < n_appts then 'closer'::public.appointment_actor else null end,
                case when k < n_appts then slot - interval '5 hours' else null end, true);
        slot := slot + ((2 + k) || ' days')::interval;
      end loop;
      update sales.call set current_scheduled_at = slot - ((2 + n_appts) || ' days')::interval where id = v_call;

      -- outcomes for calls whose final slot was taken
      if exists (select 1 from sales.appointment a where a.call_id = v_call and a.is_current and a.status = 'taken') then
        update sales.call set occurred_at = (select scheduled_for from sales.appointment where call_id = v_call and is_current),
                              offer_made = true,
                              disposition = case
                                when won_count < 6 and i % 4 = 1 then 'closed'::public.call_disposition
                                when i % 5 = 0 then 'follow_up'::public.call_disposition
                                when i % 9 = 0 then 'dq_on_call'::public.call_disposition
                                else 'no_decision'::public.call_disposition end
        where id = v_call;

        if (select disposition from sales.call where id = v_call) = 'closed' then
          won_count := won_count + 1; j := won_count;
          update sales.opportunity
            set stage = case when plan_names[j] = 'pif' then 'won_pif'::public.opportunity_stage else 'won_pp'::public.opportunity_stage end,
                closed_at = base_day + interval '4 days'
            where id = v_opp;
          update core.contact set lifecycle_status='customer' where id = v_contact;

          insert into sales.deal(opportunity_id, contact_id, closer_rep_id, offer_id, total_contract_value_minor, plan_type_snapshot, deal_close_date, status, is_demo)
          values (v_opp, v_contact, case when i % 2 = 0 then v_closer1 else v_closer2 end, v_offer,
                  plan_insts[j] * plan_amts[j], plan_names[j], (base_day + interval '4 days')::date,
                  case when j = 6 then 'refunded'::public.deal_status else 'active'::public.deal_status end, true)
          returning id into v_deal;

          insert into finance.payment_plan(deal_id, version, plan_type, total_minor, is_current, is_demo)
          values (v_deal, 1, plan_names[j], plan_insts[j] * plan_amts[j], true, true)
          returning id into v_plan;

          for k in 1..plan_insts[j] loop
            insert into finance.receivable(payment_plan_id, deal_id, installment_no, due_date, amount_minor, status, paid_at, is_demo)
            values (v_plan, v_deal, k, (base_day + interval '4 days')::date + ((k-1) || ' months')::interval,
                    plan_amts[j],
                    case when k = 1 then 'paid'::public.receivable_status
                         when (base_day + interval '4 days')::date + ((k-1) || ' months')::interval > current_date then 'scheduled'::public.receivable_status
                         when k = 2 and i % 2 = 0 then 'late'::public.receivable_status
                         when k = 2 then 'delinquent'::public.receivable_status
                         else 'paid'::public.receivable_status end,
                    case when k = 1 then (base_day + interval '4 days')::date else null end, true)
            returning id into v_recv;
            if k = 1 then
              insert into finance.successful_payment(deal_id, receivable_id, rep_id, processor, type, amount_minor, processing_fee_minor, occurred_at, is_demo)
              values (v_deal, v_recv, case when i % 2 = 0 then v_closer1 else v_closer2 end, 'nmi',
                      case when plan_names[j] = 'pif' then 'pif'::public.payment_type else 'installment'::public.payment_type end,
                      plan_amts[j], plan_amts[j] / 34, base_day + interval '4 days', true)
              returning id into v_pay;
              update finance.receivable set payment_id = v_pay where id = v_recv;
            end if;
          end loop;

          if j = 6 then
            insert into finance.reversal(deal_id, payment_id, type, amount_minor, reason, occurred_at, is_demo)
            values (v_deal, v_pay, 'refund', plan_amts[j], 'DEMO changed mind within guarantee window', base_day + interval '9 days', true);
          end if;

          insert into delivery.fulfilment(deal_id, contact_id, csm_rep_id, onboarded_at, program_start, program_end, onboarding_complete, status, is_demo)
          values (v_deal, v_contact, (select id from sales.rep where full_name='Randi'),
                  (base_day + interval '6 days')::date, (base_day + interval '6 days')::date,
                  ((base_day + interval '6 days')::date + interval '6 months')::date, j % 2 = 0,
                  case when j = 6 then 'refunded'::public.fulfilment_status else 'active'::public.fulfilment_status end, true);
        elsif (select disposition from sales.call where id = v_call) = 'dq_on_call' then
          update sales.opportunity set stage='dq_on_call', qualified=false, dq_stage='closing',
            dq_reason_id=(select id from core.dq_reason where sort_order=5), closed_at=base_day + interval '4 days' where id=v_opp;
        elsif i % 8 = 0 then
          update sales.opportunity set stage='lost',
            lost_reason_id=(select id from core.lost_reason where sort_order=1 + (i % 6)), closed_at=base_day + interval '6 days' where id=v_opp;
        else
          update sales.opportunity set stage='warm_list' where id=v_opp;
        end if;
      else
        update sales.opportunity set stage = case when i % 7 = 0 then 'no_show'::public.opportunity_stage else 'call_confirmed'::public.opportunity_stage end where id = v_opp;
      end if;
    end if;
  end loop;

  -- ad spend: 35 days x 3 demo ads
  insert into marketing.ad_spend(date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend_minor, impressions, reach, clicks, ctr, cpm_minor, cpc_minor, leads, pulled_at, is_demo)
  select d::date, 'demo_cmp_1', 'DEMO BDCR VSL', 'demo_adset_'||a, 'DEMO Adset '||a, 'demo_ad_'||a, 'DEMO Ad '||a,
         14000 + (a * 3000) + (extract(day from d)::int % 7) * 900,
         9000 + a * 2200, 7200 + a * 1700, 160 + a * 40, 1.8 + a * 0.2,
         1500 + a * 120, 85 + a * 12, 3 + (extract(day from d)::int + a) % 5,
         now(), true
  from generate_series(current_date - 34, current_date, interval '1 day') d, generate_series(1,3) a;
end $$;

-- End of migration 0010.
