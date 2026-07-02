-- =====================================================================
-- 0004: Opportunity stage regression guard (Katie 2026-06-27).
-- Replaces the too-strict "only moves forward" rule.
--
--   ACTIVE stages may move backward freely (mirror Close as-is) — e.g. No Show ->
--   Strategy Call Booked on a rebook, Call Confirmed -> Strategy Call Booked, etc.
--
--   Once an opportunity reaches a COMMITTED/WON stage (contract_signed, deposit,
--   won_pif, won_pp) it may only move FORWARD in that closing sequence; it may NOT
--   regress to an earlier stage. lost / dq_on_call stay reachable from any stage as
--   a terminal exit (that is an exit, not a backward step).
-- =====================================================================

create or replace function public.guard_opportunity_stage_regression()
returns trigger language plpgsql as $$
declare
  -- rank within the closing sequence; every active stage = 0
  old_rank int := case OLD.stage
    when 'contract_signed' then 1 when 'deposit' then 2
    when 'won_pif' then 3 when 'won_pp' then 3 else 0 end;
  new_rank int := case NEW.stage
    when 'contract_signed' then 1 when 'deposit' then 2
    when 'won_pif' then 3 when 'won_pp' then 3 else 0 end;
begin
  if old_rank >= 1                                    -- currently committed / won
     and new_rank < old_rank                           -- moving to an earlier rank...
     and NEW.stage not in ('lost','dq_on_call') then   -- ...that is not a terminal exit
    raise exception
      'Opportunity % cannot move backward from % to % — committed/won stages do not regress (active stages can).',
      OLD.id, OLD.stage, NEW.stage
      using errcode = 'check_violation';
  end if;
  return NEW;
end $$;

create trigger trg_opportunity_no_regression
  before update of stage on public.opportunity
  for each row
  when (OLD.stage is distinct from NEW.stage)
  execute function public.guard_opportunity_stage_regression();

comment on column public.opportunity.stage is
  'The Close pipeline stage (mirrors Close). ACTIVE stages may move backward freely; once at contract_signed / deposit / won_pif / won_pp the opportunity cannot regress to an earlier stage (enforced by trg_opportunity_no_regression), though lost / dq_on_call remain reachable as a terminal exit. Reaching won_pif or won_pp triggers client onboarding (a fulfilment record). ACTIVE: lead_opt_in, strategy_call_booked, intake_form_submitted, audit_complete, intake_form_needed, call_confirmed, no_show, call_canceled_by_lead, follow_up_call_booked, warm_list, contract_sent, contract_signed. WON: deposit, won_pif, won_pp. LOST: call_canceled_by_team, lost, dq_on_call.';

-- End of migration 0004.
