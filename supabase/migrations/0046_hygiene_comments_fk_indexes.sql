-- =====================================================================
-- 0046: hygiene from the July 9 read-only audit.
--   1. Table + column comments (documentation-in-schema, house style).
--   2. The 28 missing FK indexes (house rule: FK columns get an index; the
--      reversal/commission/deal ones sit on money paths).
-- Deliberately NOT done: dropping "unused" indexes (7 weeks of stats,
-- contradictions with visible query patterns); view extraction (candidates
-- recorded in the launch plan); RLS policy changes (the 5 zero-policy tables
-- core.app_setting/app_user, credit.intake_submission, sync.raw_events,
-- sync.writeback_queue are deny-all-except-service-role BY DESIGN).
-- =====================================================================

-- ---- 1. table comments -------------------------------------------------
comment on table core.call_outcome is 'Option list: call outcome labels used by reports and drill-downs. Editable in Admin, Form Options.';
comment on table core.cancellation_reason is 'Option list: appointment cancellation reasons. Editable in Admin, Form Options.';
comment on table core.credit_account_type is 'Option list: credit account types referenced by the credit pipeline.';
comment on table core.dq_reason is 'Option list: disqualification reasons for DQ reporting. Editable in Admin, Form Options.';
comment on table core.objection_type is 'Option list: sales objection types picked on the Sales Call Report. Editable in Admin, Form Options.';
comment on table core.source_channel is 'Option list: lead source channels (attribution stamps + opt-in source).';
comment on table finance.commission_payout is 'One monthly commission statement per rep (period, total, lifecycle status calculated -> approved -> paid). Rebuilt by finance.recompute_commissions while status = calculated; approved/paid are immutable history.';
comment on table finance.commission_plan is 'Versioned commission plan headers (legacy of the pre-July-2 engine; current rules live in sales.commission_rule).';
comment on table finance.commission_tier is 'Rate tiers attached to finance.commission_plan (legacy of the pre-July-2 engine).';
comment on table finance.reversal is 'Money OUT: refunds and chargebacks, linked to the payment and deal they reverse. Feeds refund-rate reporting and commission clawbacks.';
comment on table marketing.offer is 'Sellable offers (the catalog): name, active flag; priced by marketing.pricing_plan. Managed in Admin, Offers and Pricing.';
comment on table marketing.pricing_plan is 'Price points per offer (PIF / split options, amounts in cents). Managed in Admin, Offers and Pricing.';
comment on table sales.contract is 'Contract records tied to deals (superseded by sales.agreement for e-sign tracking; kept for history).';
comment on table sales.objection is 'Objections raised on a strategy call (from the Sales Call Report), joined to core.objection_type.';
comment on table sales.rep is 'The sales team roster: closers, setters, csm, admin; is_partner marks external commission payees. Joined by app_user.rep_id for login-to-rep linkage.';
comment on table sales.report_submission is 'Rep-filed reports (sales_call, missed_call, post_call_notes) with validation lifecycle; the source of attendance truth, deals, and objections. Monday-imported history carries payload->>monday_item_id.';
comment on table sync.sync_runs is 'One row per connector run (backfill or scheduled pull): counts, window, errors. The audit trail behind the Connections page.';

-- ---- 2. column comments -------------------------------------------------
comment on column finance.payment_link.expires_at is 'When the checkout link stops working (null = no expiry).';
comment on column finance.payment_link.viewed_at is 'First time the prospect opened the pay page (null = never opened).';
comment on column sales.commission_bonus.rep_id is 'Rep receiving the bonus (FK sales.rep).';
comment on column sales.commission_bonus.note is 'Free-text reason shown on the statement line.';
comment on column sync.form_map.location_id is 'GHL sub-account (location) the form belongs to.';
comment on column sync.form_map.form_id is 'GHL form id (join key to sales.opt_in.form_id).';
comment on column sync.form_map.form_name is 'Human name for the form (auto-filled from GHL when available; editable in Admin, Forms).';
comment on column sync.form_map.first_seen is 'When the first submission from this form arrived.';
comment on column sync.stage_map.platform is 'Source platform of the stage label (close today; room for others).';
comment on column sync.stage_map.external_label is 'The exact stage label as the platform sends it.';
comment on column sync.stage_map.mapped_stage is 'Our pipeline stage this label means (null = unmapped, surfaces in Admin, Stages).';
comment on column sync.stage_map.active is 'Whether the mapping applies. Inactive/unmapped labels record events without a stage change.';
comment on column sync.stage_map.first_seen is 'When this label was first seen from the platform.';

-- ---- 3. missing FK indexes ----------------------------------------------
create index if not exists idx_app_user_rep_fk on core.app_user (rep_id);
create index if not exists idx_contact_merged_into_fk on core.contact (merged_into_contact_id) where merged_into_contact_id is not null;
create index if not exists idx_contact_owner_rep_fk on core.contact (owner_rep_id) where owner_rep_id is not null;
create index if not exists idx_goal_rep_fk on core.goal (rep_id) where rep_id is not null;
create index if not exists idx_intake_contact_fk on credit.intake_submission (contact_id);
create index if not exists idx_nafa_contact_fk on credit.nafa (contact_id);
create index if not exists idx_nafa_intake_fk on credit.nafa (intake_id) where intake_id is not null;
create index if not exists idx_fulfilment_contact_fk on delivery.fulfilment (contact_id);
create index if not exists idx_fulfilment_csm_fk on delivery.fulfilment (csm_rep_id) where csm_rep_id is not null;
create index if not exists idx_commline_plan_fk on finance.commission_line (commission_plan_id) where commission_plan_id is not null;
create index if not exists idx_commline_payment_fk on finance.commission_line (payment_id) where payment_id is not null;
create index if not exists idx_payout_approver_fk on finance.commission_payout (approved_by_rep_id) where approved_by_rep_id is not null;
create index if not exists idx_commtier_plan_fk on finance.commission_tier (commission_plan_id);
create index if not exists idx_paylink_creator_fk on finance.payment_link (created_by_user_id) where created_by_user_id is not null;
create index if not exists idx_reversal_deal_fk on finance.reversal (deal_id) where deal_id is not null;
create index if not exists idx_reversal_payment_fk on finance.reversal (payment_id) where payment_id is not null;
create index if not exists idx_payment_charger_fk on finance.successful_payment (charged_by_user_id) where charged_by_user_id is not null;
create index if not exists idx_pricing_offer_fk on marketing.pricing_plan (offer_id);
create index if not exists idx_commbonus_creator_fk on sales.commission_bonus (created_by_rep_id) where created_by_rep_id is not null;
create index if not exists idx_deal_closer_fk on sales.deal (closer_rep_id) where closer_rep_id is not null;
create index if not exists idx_deal_offer_fk on sales.deal (offer_id);
create index if not exists idx_deal_partner_contact_fk on sales.deal (partner_contact_id) where partner_contact_id is not null;
create index if not exists idx_objection_type_fk on sales.objection (objection_type_id);
create index if not exists idx_objection_call_fk on sales.objection (strategy_call_id);
create index if not exists idx_report_followup_fk on sales.report_submission (follow_up_call_id) where follow_up_call_id is not null;
create index if not exists idx_report_rep_fk on sales.report_submission (rep_id);
create index if not exists idx_report_supersedes_fk on sales.report_submission (supersedes_id) where supersedes_id is not null;
create index if not exists idx_syncruns_connection_fk on sync.sync_runs (connection_id);

-- End of migration 0046.
