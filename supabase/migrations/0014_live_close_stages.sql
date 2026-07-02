-- =====================================================================
-- 0014: Accept TCB's LIVE Close pipeline (discovered on connect, 2026-07-02).
-- The org currently runs: Lead Opt-In, Eligibility Call Booked, Strategy Call
-- Booked, Intake Submitted, Audit Complete, Call Completed, Closing, Contract
-- Signed, Closed Won, Lost, Not a Fit, plus a partner track (Interested /
-- Active Partner). The 18-stage spec pipeline is not yet rolled out in Close.
-- The DB mirrors Close faithfully, so the enum accepts BOTH vocabularies —
-- today's pipeline works now, the redesigned one works the day they switch.
-- (intake_submitted maps onto the existing intake_form_submitted; the rest
-- are new values.)
-- =====================================================================

alter type public.opportunity_stage add value if not exists 'eligibility_call_booked';
alter type public.opportunity_stage add value if not exists 'call_completed';
alter type public.opportunity_stage add value if not exists 'closing';
alter type public.opportunity_stage add value if not exists 'closed_won';
alter type public.opportunity_stage add value if not exists 'interested_partner';
alter type public.opportunity_stage add value if not exists 'active_partner';
alter type public.opportunity_stage add value if not exists 'not_a_fit';

comment on column sales.opportunity.stage is
  'The Close pipeline stage; a faithful mirror of Close. Users can move it to any stage, in any direction, and this reflects it. Our automations never overwrite a won opportunity; they create a new one for new activity. The enum holds BOTH the live pipeline (eligibility_call_booked, call_completed, closing, closed_won, interested_partner, active_partner, not_a_fit, ...) and the redesigned 18-stage pipeline, so the mirror survives the client''s migration. WON-type today: closed_won, active_partner (redesign: deposit, won_pif, won_pp). LOST-type: lost, not_a_fit (redesign adds: call_canceled_by_team, dq_on_call). Reaching a won stage triggers client onboarding.';

-- End of migration 0014.
