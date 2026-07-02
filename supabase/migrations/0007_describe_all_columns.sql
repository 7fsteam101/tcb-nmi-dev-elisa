-- =====================================================================
-- 0007: Describe EVERY remaining column (8FS standard — every field has a
-- description). Fills the gaps 0002 left (ids, timestamps, lookup fields, and
-- the columns that were "obvious"). After this, no column is left blank.
-- =====================================================================

-- universal columns on every table -----------------------------------
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('comment on column public.%I.id is %L', t, 'Primary key (uuid, auto-generated).');
    execute format('comment on column public.%I.created_at is %L', t, 'When this row was created.');
    execute format('comment on column public.%I.updated_at is %L', t, 'When this row was last updated (auto-maintained).');
  end loop;
end $$;

-- reference / lookup tables ------------------------------------------
do $$ declare t text; begin
  foreach t in array array['cancellation_reason','dq_reason','source_channel','credit_account_type','call_outcome','objection_type'] loop
    execute format('comment on column public.%I.name is %L', t, 'The option label shown in the UI and reports.');
    execute format('comment on column public.%I.category is %L', t, 'Optional grouping for the option.');
    execute format('comment on column public.%I.sort_order is %L', t, 'Display order.');
    execute format('comment on column public.%I.active is %L', t, 'Whether the option is currently selectable.');
  end loop;
end $$;

-- contact / identity --------------------------------------------------
comment on column public.contact.full_name is 'The person''s full name.';
comment on column public.contact.first_name is 'First name (for personalization).';
comment on column public.contact.last_name is 'Last name (for personalization).';
comment on column public.contact.ghl_marketing_id is 'Cross-system key: the contact id in GHL Marketing.';
comment on column public.contact.ghl_repair_id is 'Cross-system key: the contact id in GHL Repair / Fulfilment.';
comment on column public.contact.monday_lead_id is 'Cross-system key: the lead id in Monday.';
comment on column public.contact_identifier.contact_id is 'FK to the owning contact.';
comment on column public.contact_identifier.source is 'Where this email/phone came from.';

-- opt_in --------------------------------------------------------------
comment on column public.opt_in.contact_id is 'FK to the contact who submitted.';
comment on column public.opt_in.opportunity_id is 'FK to the opportunity this opt-in belongs to.';
comment on column public.opt_in.submitted_at is 'When the form was submitted.';
comment on column public.opt_in.source_campaign is 'The campaign that drove this opt-in (via Dub).';
comment on column public.opt_in.utm is 'UTM parameters captured at opt-in.';
comment on column public.opt_in.form_id is 'Which GHL form was submitted.';
comment on column public.opt_in.ghl_marketing_id is 'Cross-system key: the submission id in GHL Marketing.';

-- opportunity ---------------------------------------------------------
comment on column public.opportunity.contact_id is 'FK to the contact.';
comment on column public.opportunity.dq_reason_id is 'FK to the disqualification reason (if disqualified).';
comment on column public.opportunity.owner_rep_id is 'FK to the owning rep.';
comment on column public.opportunity.opened_at is 'When the opportunity was opened.';
comment on column public.opportunity.closed_at is 'When the opportunity was closed (won or lost).';
comment on column public.opportunity.close_id is 'Cross-system key: the opportunity id in Close.';
comment on column public.opportunity.ghl_marketing_opp_id is 'Cross-system key: the opportunity id in GHL Marketing.';
comment on column public.opportunity.monday_lead_source_item is 'Cross-system key: the Monday lead-source item.';

-- call ----------------------------------------------------------------
comment on column public.call.opportunity_id is 'FK to the opportunity.';
comment on column public.call.dq_reason_id is 'FK to the disqualification reason (if the outcome was a DQ).';
comment on column public.call.booking_source_campaign is 'Campaign that drove the booking (the converting touch).';
comment on column public.call.booking_utm is 'UTM captured at booking.';
comment on column public.call.booking_dub_link_id is 'Dub link id captured at booking.';
comment on column public.call.cancellation_reason_id is 'FK to the cancellation reason (if cancelled).';
comment on column public.call.chk_intake is 'Readiness checklist: intake form submitted.';
comment on column public.call.chk_video is 'Readiness checklist: pre-call video watched.';
comment on column public.call.chk_partner is 'Readiness checklist: partner / spouse handled.';
comment on column public.call.chk_price is 'Readiness checklist: price pre-qualified.';
comment on column public.call.chk_40day is 'Readiness checklist: clear of the 40-day dispute window.';
comment on column public.call.chk_not_at_work is 'Readiness checklist: not at work / not driving at call time.';

-- appointment ---------------------------------------------------------
comment on column public.appointment.call_id is 'FK to the strategy-call booking this slot belongs to.';

-- intake / nafa -------------------------------------------------------
comment on column public.intake_submission.opportunity_id is 'FK to the opportunity.';
comment on column public.intake_submission.contact_id is 'FK to the contact.';
comment on column public.intake_submission.submitted_at is 'When the intake form was submitted.';
comment on column public.nafa.opportunity_id is 'FK to the opportunity.';
comment on column public.nafa.contact_id is 'FK to the contact.';
comment on column public.nafa.intake_id is 'FK to the intake submission whose credentials were used.';
comment on column public.nafa.provider is 'The credit-monitoring provider used (identityiq or myscoreiq).';
comment on column public.nafa.other_negative_accounts is 'Count of other negative accounts (included at no extra cost).';
comment on column public.nafa.ineligible_accounts is 'Count of ineligible accounts (student loan, bankruptcy, government, child support).';
comment on column public.nafa.hard_inquiries is 'Count of eligible hard inquiries.';
comment on column public.nafa.credit_score is 'The credit score on this pull.';
comment on column public.nafa.utilization_pct is 'Credit utilization percentage.';
comment on column public.nafa.monday_audit_id is 'Cross-system key: the Monday audit id.';
comment on column public.nafa.monday_credit_audit_item is 'Cross-system key: the Monday credit-audit item.';

-- deal / contract -----------------------------------------------------
comment on column public.deal.opportunity_id is 'FK to the won opportunity.';
comment on column public.deal.contact_id is 'FK to the contact (the buyer).';
comment on column public.deal.closer_rep_id is 'FK to the closer who won it.';
comment on column public.deal.discount_pct is 'Discount applied (e.g. for couples).';
comment on column public.deal.close_id is 'Cross-system key: the opportunity/deal id in Close.';
comment on column public.contract.deal_id is 'FK to the deal.';
comment on column public.contract.issued_at is 'When the agreement was issued.';
comment on column public.contract.signed_at is 'When the agreement was signed.';
comment on column public.contract.contract_value_minor is 'The contract value in this version (minor units).';
comment on column public.contract.document_url is 'Link to the agreement document.';
comment on column public.contract.ghl_marketing_id is 'Cross-system key: the contract id in GHL Marketing.';

-- payment plan / receivable / payment / reversal ----------------------
comment on column public.payment_plan.deal_id is 'FK to the deal.';
comment on column public.payment_plan.plan_type is 'The plan structure (pif / 3pay / ... / zero_down).';
comment on column public.payment_plan.total_minor is 'Total plan amount (minor units).';
comment on column public.receivable.payment_plan_id is 'FK to the payment-plan version.';
comment on column public.receivable.deal_id is 'FK to the deal (denormalized for convenience).';
comment on column public.receivable.due_date is 'When this installment is due.';
comment on column public.receivable.paid_at is 'When this installment was paid.';
comment on column public.receivable.monday_payment_schedule_id is 'Cross-system key: the Monday payment-schedule id.';
comment on column public.successful_payment.occurred_at is 'When the payment cleared.';
comment on column public.successful_payment.nmi_transaction_id is 'Cross-system key: the NMI transaction id.';
comment on column public.successful_payment.stripe_charge_id is 'Cross-system key: the Stripe charge id.';
comment on column public.reversal.deal_id is 'FK to the deal.';
comment on column public.reversal.amount_minor is 'Reversed amount (minor units).';
comment on column public.reversal.reason is 'Reason for the refund / chargeback.';
comment on column public.reversal.occurred_at is 'When the reversal occurred.';

-- people / commission -------------------------------------------------
comment on column public.rep.full_name is 'The team member''s full name.';
comment on column public.rep.email is 'The team member''s email.';
comment on column public.rep.sendblue_owner is 'SendBlue owner handle (matches calls to this rep).';
comment on column public.rep.sendblue_owner_email is 'SendBlue owner email (matches calls to this rep).';
comment on column public.rep.active is 'Whether the rep is currently active.';
comment on column public.commission_plan.name is 'Plan name (e.g. "Closer comp v2").';
comment on column public.commission_plan.effective_from is 'When this plan version takes effect.';
comment on column public.commission_plan.effective_to is 'When this plan version ends (null = current).';
comment on column public.commission_tier.commission_plan_id is 'FK to the commission plan.';
comment on column public.commission_tier.label is 'Tier label (e.g. "Base" / "Elevated").';
comment on column public.commission_line.rep_id is 'FK to the rep earning the commission.';
comment on column public.commission_line.deal_id is 'FK to the deal (if applicable).';
comment on column public.commission_line.payout_id is 'FK to the period payout this line rolls into.';
comment on column public.commission_line.commission_plan_id is 'FK to the commission plan applied.';
comment on column public.commission_payout.rep_id is 'FK to the rep being paid.';
comment on column public.commission_payout.period_start is 'Pay-period start.';
comment on column public.commission_payout.period_end is 'Pay-period end.';
comment on column public.commission_payout.approved_by_rep_id is 'FK to the admin/VA who approved.';
comment on column public.commission_payout.approved_at is 'When it was approved.';
comment on column public.commission_payout.paid_at is 'When it was paid out.';

-- ad spend / offer / pricing ------------------------------------------
comment on column public.ad_spend.campaign_id is 'Meta campaign id.';
comment on column public.ad_spend.campaign_name is 'Meta campaign name.';
comment on column public.ad_spend.adset_id is 'Meta adset id.';
comment on column public.ad_spend.adset_name is 'Meta adset name.';
comment on column public.ad_spend.ad_name is 'Meta ad name.';
comment on column public.ad_spend.spend_minor is 'Spend for the day (minor units).';
comment on column public.ad_spend.impressions is 'Impressions.';
comment on column public.ad_spend.reach is 'Reach.';
comment on column public.ad_spend.clicks is 'Clicks.';
comment on column public.ad_spend.ctr is 'Click-through rate.';
comment on column public.ad_spend.cpm_minor is 'Cost per 1,000 impressions (minor units).';
comment on column public.ad_spend.cpc_minor is 'Cost per click (minor units).';
comment on column public.ad_spend.leads is 'Meta-reported leads.';
comment on column public.offer.name is 'Offer name (BDCR, Coaching, etc.).';
comment on column public.offer.default_price_minor is 'Default price (minor units).';
comment on column public.offer.active is 'Whether the offer is currently sold.';
comment on column public.pricing_plan.offer_id is 'FK to the offer.';
comment on column public.pricing_plan.name is 'Plan name (pif / 3pay / ... / zero_down).';
comment on column public.pricing_plan.version is 'Plan version (the zero-down model changes plans over time).';
comment on column public.pricing_plan.installments is 'Number of installments.';
comment on column public.pricing_plan.installment_amount_minor is 'Per-installment amount (minor units).';
comment on column public.pricing_plan.effective_from is 'When this plan version takes effect.';
comment on column public.pricing_plan.effective_to is 'When this plan version ends.';

-- fulfilment ----------------------------------------------------------
comment on column public.fulfilment.deal_id is 'FK to the deal being delivered.';
comment on column public.fulfilment.contact_id is 'FK to the client (the contact).';
comment on column public.fulfilment.onboarded_at is 'When the client was onboarded.';
comment on column public.fulfilment.ghl_repair_id is 'Cross-system key: the client id in GHL Repair.';
comment on column public.fulfilment.monday_client_source_id is 'Cross-system key: the Monday client-source id.';

-- capture -------------------------------------------------------------
comment on column public.report_submission.rep_id is 'FK to the rep who submitted.';
comment on column public.report_submission.strategy_call_id is 'FK to the strategy call (if a strategy-call report).';
comment on column public.report_submission.follow_up_call_id is 'FK to the follow-up call (if a follow-up report).';
comment on column public.report_submission.submitted_at is 'When the report was submitted.';
comment on column public.report_submission.status is 'submitted / validated / superseded / rejected.';
comment on column public.report_submission.is_duplicate is 'Flagged if this is a duplicate submission.';
comment on column public.objection.strategy_call_id is 'FK to the strategy call where the objection arose.';

-- End of migration 0007.
