-- =====================================================================
-- 0005: Move the stage discipline OUT of the database, into the automation
-- layer (Katie 2026-06-27).
--
-- The database is a faithful MIRROR of Close (the system of record). Users move
-- opportunities however they like, in any direction, and our records reflect it.
-- The rule that OUR automations never OVERWRITE a won opportunity (they create a
-- NEW opportunity for new activity instead) lives in the sync/automation logic,
-- NOT as a hard DB constraint that would block the sync from mirroring a user's
-- action in Close. So we drop the regression guard added in 0004.
-- =====================================================================

drop trigger if exists trg_opportunity_no_regression on public.opportunity;
drop function if exists public.guard_opportunity_stage_regression();

comment on column public.opportunity.stage is
  'The Close pipeline stage — a faithful mirror of Close (the system of record). Users may move an opportunity to any stage, in any direction, and this reflects it. The discipline that our automations never OVERWRITE a won opportunity (they create a NEW opportunity for new activity instead) is enforced in the sync/automation layer, NOT by a database constraint. Reaching won_pif or won_pp triggers client onboarding (a fulfilment record). ACTIVE: lead_opt_in, strategy_call_booked, intake_form_submitted, audit_complete, intake_form_needed, call_confirmed, no_show, call_canceled_by_lead, follow_up_call_booked, warm_list, contract_sent, contract_signed. WON: deposit, won_pif, won_pp. LOST: call_canceled_by_team, lost, dq_on_call.';

-- End of migration 0005.
