-- =====================================================================
-- Column descriptions (the 8FS "every field has a description" standard).
-- Makes the database self-documenting: these show up in Supabase's Table
-- Editor, API docs, and Schema Visualizer, and in the generated schema docs.
-- Source: doc 13 (Entity Field Specifications).
-- =====================================================================

-- ---- contact ----
comment on column public.contact.primary_email is 'Current primary email; the full set lives in contact_identifier.';
comment on column public.contact.primary_phone is 'Current primary phone; the full set lives in contact_identifier.';
comment on column public.contact.company_name is 'For business-funding leads.';
comment on column public.contact.website is 'For business-funding leads.';
comment on column public.contact.lifecycle_status is 'lead / qualified / customer / do_not_contact. Never downgrade from customer or do_not_contact.';
comment on column public.contact.owner_rep_id is 'Current owning rep. Per-activity owners live on each Call.';
comment on column public.contact.merged_into_contact_id is 'Set when this person is merged into another during dedup; keeps both histories.';
comment on column public.contact.close_id is 'Cross-system sync key (Close Lead id).';

-- ---- contact_identifier ----
comment on column public.contact_identifier.type is 'email or phone.';
comment on column public.contact_identifier.value is 'The email or phone. Append a new one if different, never overwrite.';
comment on column public.contact_identifier.is_primary is 'One primary per type.';

-- ---- opt_in ----
comment on column public.opt_in.goal is 'What the lead wants: house / car / credit_cards / business_credit / other.';
comment on column public.opt_in.credit_score_range is 'Self-reported range.';
comment on column public.opt_in.blocker is 'What has held them back.';
comment on column public.opt_in.source_channel is 'Source of this opt-in (via Dub); feeds first-touch.';
comment on column public.opt_in.dub_link_id is 'Dub link identifier for this opt-in.';
comment on column public.opt_in.counts_as_unique is 'Derived; applies the >30-day re-count rule.';

-- ---- opportunity ----
comment on column public.opportunity.stage is 'Canonical lifecycle stage; only moves forward (opt_in → ... → closed_won → onboarded; terminal: lost, dq).';
comment on column public.opportunity.qualified is 'Default true until disqualified.';
comment on column public.opportunity.dq_stage is 'Where disqualification happened: setting or closing.';
comment on column public.opportunity.first_touch_channel is 'Snapshot at close: the first opt-in source (how acquired). The Deal inherits it.';
comment on column public.opportunity.converting_touch_channel is 'Snapshot at close: the booking source (what closed them). The Deal inherits it.';
comment on column public.opportunity.cohort_month is 'Opt-in / book month, for cohorting lead quality.';
comment on column public.opportunity.current_nafa_id is 'The latest valid NAFA.';

-- ---- call (one table; type = readiness / strategy / follow_up) ----
comment on column public.call.type is 'readiness / strategy / follow_up. The strategy call is the booking; funnel KPIs filter type=strategy.';
comment on column public.call.rep_id is 'Owner: setter (readiness) or closer (strategy / follow_up).';
comment on column public.call.scheduled_at is 'Original event start.';
comment on column public.call.current_scheduled_at is 'After reschedules (the same call moves); the live slot is on appointment.';
comment on column public.call.occurred_at is 'When the call was taken.';
comment on column public.call.recording_url is 'SendBlue recording.';
comment on column public.call.transcript_text is 'For AI call analysis.';
comment on column public.call.booking_payment_id is 'The $25 booking fee (strategy calls).';
comment on column public.call.booking_source_channel is 'Source of the booking (can differ from the opt-in, e.g. a DM-setter link); = the converting touch.';
comment on column public.call.nafa_id is 'The NAFA used at call time.';
comment on column public.call.offer_made is 'Was the offer pitched (strategy).';
comment on column public.call.disposition is 'Result of a taken strategy call: closed / follow_up / dq_on_call / no_decision.';
comment on column public.call.is_primary is 'The canonical strategy call for the opportunity (exactly one).';
comment on column public.call.is_duplicate is 'Excluded from all KPIs (the extra $25 is refunded).';
comment on column public.call.expected_payment_minor is 'Affordability signal from the price pre-qual (readiness).';
comment on column public.call.readiness_outcome is 'confirmed_ready / reschedule / dq / no_contact (readiness).';
comment on column public.call.sub_type is 'follow_up / enrollment (enrollment = partial-pay-with-a-call-to-follow).';
comment on column public.call.sequence_no is 'Which follow-up (2nd, 3rd, ...).';
comment on column public.call.partial_payment_minor is 'For enrollment calls.';
comment on column public.call.followup_outcome is 'closed / follow_up / dq / no_show / reschedule (follow_up).';

-- ---- appointment (per-slot model) ----
comment on column public.appointment.seq is '1st / 2nd / 3rd scheduled time for the booking.';
comment on column public.appointment.scheduled_for is 'The appointment date/time (the calendar slot).';
comment on column public.appointment.status is 'This slot''s outcome: scheduled (booked) → confirmed / taken / no_show / cancelled_by_* / rescheduled. Terminal slots never change.';
comment on column public.appointment.is_current is 'The live (latest) slot; exactly one per booking.';
comment on column public.appointment.reason_id is 'If rescheduled or cancelled, the reason.';
comment on column public.appointment.moved_by is 'lead_link (self-serve link) or closer.';
comment on column public.appointment.rescheduled_at is 'When this slot was moved.';

-- ---- intake_submission (PII) ----
comment on column public.intake_submission.provider is 'identityiq or myscoreiq.';
comment on column public.intake_submission.idiq_username is 'ENCRYPTED PII — ciphertext only. Purge after use.';
comment on column public.intake_submission.idiq_password is 'ENCRYPTED PII — ciphertext only. Purge after use.';
comment on column public.intake_submission.msiq_username is 'ENCRYPTED PII — ciphertext only. Purge after use.';
comment on column public.intake_submission.msiq_password is 'ENCRYPTED PII — ciphertext only. Purge after use.';
comment on column public.intake_submission.last_4_ssn is 'ENCRYPTED PII (last 4 of SSN) — ciphertext only. Purge after use.';
comment on column public.intake_submission.status is 'submitted / verified / failed (login tested by the worker).';

-- ---- nafa ----
comment on column public.nafa.pulled_at is 'The snapshot date of this credit pull.';
comment on column public.nafa.violation_opportunities is 'Headline count of violation opportunities.';
comment on column public.nafa.accounts_with_violations is 'Accounts with violations — pricing is based on these.';
comment on column public.nafa.version is 'A / B / C / D — lead-profile / script class.';
comment on column public.nafa.qualifies is 'Derived: >=5 violation ops AND >=2 accounts with violations.';
comment on column public.nafa.is_canonical is 'Latest valid NAFA = the one used for auto-DQ, scoring, and the pitch.';
comment on column public.nafa.report_pdf_url is 'The NAFA PDF (stored on Close Files).';
comment on column public.nafa.report_url is 'The NAFA report URL closers send.';

-- ---- deal ----
comment on column public.deal.offer_id is 'The single offer sold — always one offer per deal.';
comment on column public.deal.total_contract_value_minor is 'Booked revenue (contract value), in minor units.';
comment on column public.deal.plan_type_snapshot is 'The plan as sold — a frozen snapshot, not a pointer to a mutable plan.';
comment on column public.deal.is_couple is 'True if a couple enrolled together.';
comment on column public.deal.partner_contact_id is 'The other person, for couples.';
comment on column public.deal.deal_close_date is 'The moment the opportunity was marked Won (the deal-close date).';
comment on column public.deal.status is 'active / refunded / churned. Never deleted.';

-- ---- contract ----
comment on column public.contract.status is 'sent / viewed / completed / void.';
comment on column public.contract.viewed_at is 'When viewed — the honesty signal.';
comment on column public.contract.is_canonical is 'The latest signed contract = canonical.';

-- ---- payment_plan ----
comment on column public.payment_plan.version is 'Bumped on every re-split.';
comment on column public.payment_plan.is_current is 'Only one current version per deal.';
comment on column public.payment_plan.superseded_at is 'When this version was replaced.';

-- ---- receivable ----
comment on column public.receivable.installment_no is 'Installment number within the plan version.';
comment on column public.receivable.amount_minor is 'Scheduled amount, in minor units.';
comment on column public.receivable.status is 'scheduled / paid / late / delinquent / waived. Delinquent = 14+ days late.';
comment on column public.receivable.payment_id is 'The successful_payment that fulfilled this installment.';

-- ---- successful_payment ----
comment on column public.successful_payment.deal_id is 'Null for the $25 booking fee.';
comment on column public.successful_payment.strategy_call_id is 'Set for the $25 booking fee.';
comment on column public.successful_payment.receivable_id is 'The installment this payment fulfils.';
comment on column public.successful_payment.rep_id is 'For commission attribution.';
comment on column public.successful_payment.processor is 'stripe (the $25) or nmi (all program payments).';
comment on column public.successful_payment.type is 'booking_25 / deposit / installment / pif.';
comment on column public.successful_payment.amount_minor is 'Gross amount, in minor units.';
comment on column public.successful_payment.processing_fee_minor is 'Processor fee (commission is on gross).';

-- ---- reversal (refund / chargeback) ----
comment on column public.reversal.type is 'refund or chargeback.';
comment on column public.reversal.payment_id is 'The reversed payment.';

-- ---- rep ----
comment on column public.rep.role is 'setter / closer / hybrid / csm / admin.';
comment on column public.rep.current_commission_tier is 'Derived from the rep''s rolling 2-week close rate.';
comment on column public.rep.gusto_employee_id is 'Payroll (Gusto).';

-- ---- commission_plan / tier (rules-as-data) ----
comment on column public.commission_plan.role is 'Who it applies to: setter or closer.';
comment on column public.commission_plan.basis is 'cash_collected — calculated on gross cash, excluding the $25.';
comment on column public.commission_plan.eval_metric is 'The metric that sets the tier (close_rate).';
comment on column public.commission_plan.eval_window_days is 'The lookback window in days (e.g. 14 = prior 2 weeks).';
comment on column public.commission_plan.residual_rate is 'Rate on plan-installment residuals.';
comment on column public.commission_plan.refund_handling is 'clawback or none.';
comment on column public.commission_plan.is_current is 'One current plan per role (versioned config).';
comment on column public.commission_tier.min_metric_value is 'Threshold to reach this tier (e.g. 0.0 or 0.333 close rate).';
comment on column public.commission_tier.rate is 'Commission rate at this tier (e.g. 0.10 or 0.15).';

-- ---- commission_line / payout ----
comment on column public.commission_line.payment_id is 'The cash this commission is on (null for clawback / adjustment lines).';
comment on column public.commission_line.type is 'base / residual / adjustment / clawback.';
comment on column public.commission_line.rate_applied is 'The rate, frozen at calculation time.';
comment on column public.commission_line.commission_amount_minor is 'payment x rate, in minor units (negative for a clawback).';
comment on column public.commission_payout.total_commission_minor is 'Sum of the payout''s commission lines.';
comment on column public.commission_payout.status is 'calculated / approved / paid.';
comment on column public.commission_payout.gusto_payout_id is 'The Gusto payout reference.';

-- ---- ad_spend ----
comment on column public.ad_spend.date is 'In the ad-account timezone (lock EST vs PST before loading).';
comment on column public.ad_spend.ad_id is 'Grain = (date x ad_id) — the unique key.';
comment on column public.ad_spend.pulled_at is 'For restatement — re-pull a trailing window and upsert.';

-- ---- offer / pricing_plan ----
comment on column public.offer.type is 'core / coaching / funding / community / lto / booking_fee.';
comment on column public.pricing_plan.requires_first_last is 'The first-and-last-payment-upfront rule.';

-- ---- fulfilment ----
comment on column public.fulfilment.csm_rep_id is 'The client-success manager.';
comment on column public.fulfilment.program_start is '6-month program start.';
comment on column public.fulfilment.program_end is '12-month team-access end.';
comment on column public.fulfilment.onboarding_complete is 'Drives the onboarding-completion KPI.';
comment on column public.fulfilment.status is 'active / completed / churned / refunded.';

-- ---- report_submission / objection ----
comment on column public.report_submission.type is 'sales_call / missed_call / post_call_notes.';
comment on column public.report_submission.supersedes_id is 'The prior submission this one corrects.';
comment on column public.report_submission.on_time is 'For the report-submission-compliance KPI.';
comment on column public.report_submission.payload is 'The raw submission (jsonb).';
comment on column public.objection.objection_type_id is 'FK to the objection_type taxonomy.';
comment on column public.objection.led_to_loss is 'Did this objection cause the loss.';
comment on column public.objection.source is 'rep_logged or ai_extracted.';

-- End of migration 0002.
