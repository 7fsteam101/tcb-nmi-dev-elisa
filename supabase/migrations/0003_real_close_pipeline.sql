-- =====================================================================
-- 0003: Opportunity stage = the real Close pipeline (confirmed by Katie 2026-06-27).
-- Replaces the placeholder canonical lifecycle with the ACTUAL Close stages so
-- the sync mirrors Close one-to-one. Table is empty (greenfield) → clean swap.
--
-- Grouping (the WON/LOST grouping is metadata, not stored in the enum):
--   ACTIVE: lead_opt_in, strategy_call_booked, intake_form_submitted, audit_complete,
--           intake_form_needed, call_confirmed, no_show, call_canceled_by_lead,
--           follow_up_call_booked, warm_list, contract_sent, contract_signed
--   WON:    deposit, won_pif, won_pp
--   LOST:   call_canceled_by_team, lost, dq_on_call
--
-- Onboarding (a fulfilment record) is triggered when stage reaches won_pif or won_pp.
-- =====================================================================

-- the partial index references old stage values → drop, swap the enum, recreate
drop index if exists public.uq_open_opp_per_contact;

alter table public.opportunity alter column stage drop default;
alter type public.opportunity_stage rename to opportunity_stage__old;

create type public.opportunity_stage as enum (
  'lead_opt_in',
  'strategy_call_booked',
  'intake_form_submitted',
  'audit_complete',
  'intake_form_needed',
  'call_confirmed',
  'no_show',
  'call_canceled_by_lead',
  'call_canceled_by_team',
  'follow_up_call_booked',
  'warm_list',
  'contract_sent',
  'contract_signed',
  'deposit',
  'won_pif',
  'won_pp',
  'lost',
  'dq_on_call'
);

alter table public.opportunity
  alter column stage type public.opportunity_stage
  using stage::text::public.opportunity_stage;
alter table public.opportunity alter column stage set default 'lead_opt_in';

drop type public.opportunity_stage__old;

-- one OPEN opportunity per contact (WON + LOST stages are closed cycles → a new one may open)
create unique index uq_open_opp_per_contact on public.opportunity (contact_id)
  where stage not in ('deposit','won_pif','won_pp','call_canceled_by_team','lost','dq_on_call');

comment on column public.opportunity.stage is
  'The Close pipeline stage (mirrors Close one-to-one). ACTIVE: lead_opt_in, strategy_call_booked, intake_form_submitted, audit_complete, intake_form_needed, call_confirmed, no_show, call_canceled_by_lead, follow_up_call_booked, warm_list, contract_sent, contract_signed. WON: deposit, won_pif, won_pp. LOST: call_canceled_by_team, lost, dq_on_call. Reaching won_pif or won_pp triggers client onboarding (a fulfilment record).';

comment on table public.fulfilment is
  'Delivery of ONE purchased service (1:1 deal). The client is the contact; contact:deal = 1:N. Created when the opportunity reaches stage won_pif or won_pp (the onboarding trigger).';

-- End of migration 0003.
