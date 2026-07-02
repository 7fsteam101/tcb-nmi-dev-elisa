-- =====================================================================
-- 0021: Docs-vs-schema audit fixes (19 findings; this closes every schema-level
-- one — automation/backlog items are noted in the audit, not here).
-- P1s: the GHL reschedule match key, the $25-refund row shape, the
-- "reschedule with no new date yet" state. Plus P2/P3 hardening.
-- =====================================================================

-- A1 [P1]: the documented reschedule match key — GHL appointment id on the call
alter table sales.call add column ghl_appointment_id text;
comment on column sales.call.ghl_appointment_id is 'GHL appointment id — THE match key for reschedules (locked rule: a reschedule UPDATES the same booking, never creates a new one). Set by the GHL sync.';
create unique index uq_call_ghl_appt on sales.call(ghl_appointment_id) where ghl_appointment_id is not null;
alter table sales.appointment add column external_event_id text;
comment on column sales.appointment.external_event_id is 'Per-slot external event id from the source system (GHL), for idempotent slot updates.';

-- A2 [P2]: complete the redesigned pipeline vocabulary
alter type public.opportunity_stage add value if not exists 'hot_lead';
alter type public.opportunity_stage add value if not exists 'cold_list';

-- A3 [P3]: wave-2 providers can have connection rows
alter type sync.provider add value if not exists 'sendblue';
alter type sync.provider add value if not exists 'dub';
alter type sync.provider add value if not exists 'monday';

-- B1 [P2]: PII purge is trackable (the purge job itself = automation backlog)
alter table credit.intake_submission add column purged_at timestamptz;
comment on column credit.intake_submission.purged_at is 'When the encrypted credential fields were purged (policy: within 30 days of the pull — client decision #6). Null = not yet purged.';

-- B2 [P1]: a $25 booking-fee refund has a valid row shape (pre-deal reversals)
alter table finance.reversal alter column deal_id drop not null;
alter table finance.reversal add constraint chk_reversal_target check (deal_id is not null or payment_id is not null);
comment on column finance.reversal.deal_id is 'FK to the deal — NULLABLE: a duplicate-$25 refund happens before any deal exists (locked rule: duplicate bookings are excluded and refunded). Then payment_id carries the link.';

-- B3 [P1] part 1: "rescheduled, no new date yet" is a real state (setter smart view:
-- Reschedule-no-date). The CHECK referencing the new enum value lives in 0022 —
-- a new enum value cannot be used in the transaction that adds it.
alter type public.appointment_status add value if not exists 'pending_rebook';
alter table sales.appointment alter column scheduled_for drop not null;

-- C1 [P2]: seed the source-channel lookup with the real discovered channels
-- (soft-normalized in the sync; FK retrofit deferred until values stabilize)
insert into core.source_channel (name, category, sort_order)
select v.name, v.category, v.sort_order from (values
  ('quiz_website', 'organic', 10), ('opt_in_form', 'organic', 11),
  ('organic', 'organic', 12), ('affiliate_referral', 'partner', 13),
  ('dm_setter', 'outbound', 14), ('email', 'owned', 15), ('direct', 'organic', 16), ('paid_meta', 'paid', 17)
) v(name, category, sort_order)
where not exists (select 1 from core.source_channel s where s.name = v.name);

-- C2 [P2]: Fulfilment : Deal is 1:1 — enforce it
create unique index uq_fulfilment_deal on delivery.fulfilment(deal_id);

-- C4 [P3]: objection.source constrained to its two documented values
alter table sales.objection add constraint chk_objection_source check (source in ('rep_logged', 'ai_extracted'));

-- C5 [P3]: identifier uniqueness scoped per contact (couples share phones/emails)
drop index if exists core.uq_identifier_value;
create unique index uq_identifier_per_contact on core.contact_identifier(contact_id, type, lower(value));

-- C7 [P3]: commission plans exist only for setter/closer
alter table finance.commission_plan add constraint chk_comm_plan_role check (role in ('setter', 'closer'));

-- C8 [P3]: sync schema column descriptions (8FS standard: every field described)
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'sync' loop
    execute format('comment on column sync.%I.id is %L', t, 'Primary key (uuid, auto-generated).');
    execute format('comment on column sync.%I.created_at is %L', t, 'When this row was created.');
    execute format('comment on column sync.%I.updated_at is %L', t, 'When this row was last updated (auto-maintained).');
  end loop;
end $$;
comment on column sync.connections.provider is 'Which system this account belongs to (close / ghl / stripe / nmi / meta / sendblue / dub / monday).';
comment on column sync.connections.external_account_id is 'The account id in the source system (GHL location, Close org, Stripe account, ...).';
comment on column sync.connections.account_label is 'Human-readable label shown on the Connections page.';
comment on column sync.connections.status is 'connected / expired / error / disconnected.';
comment on column sync.connections.token_secret_ref is 'Vault secret id holding the credential (never the credential itself).';
comment on column sync.connections.scopes is 'Granted OAuth scopes, when applicable.';
comment on column sync.connections.settings is 'Per-connection configuration (jsonb).';
comment on column sync.connections.sync_cursor is 'Incremental sync/backfill resume state (jsonb).';
comment on column sync.connections.last_synced_at is 'Last successful sync for this connection.';
comment on column sync.connections.last_error is 'Most recent sync error, null when healthy.';
comment on column sync.raw_events.connection_id is 'FK to the connection the event arrived on.';
comment on column sync.raw_events.provider is 'Source system of the payload.';
comment on column sync.raw_events.external_id is 'Idempotency key: the event id in the source system (or a payload hash).';
comment on column sync.raw_events.event_type is 'Event discriminator used by the normalizer.';
comment on column sync.raw_events.payload is 'The raw payload as received (plus normalizer notes).';
comment on column sync.raw_events.status is 'pending / processed / failed.';
comment on column sync.raw_events.received_at is 'When the event arrived.';
comment on column sync.raw_events.processed_at is 'When normalization succeeded.';
comment on column sync.sync_runs.connection_id is 'FK to the connection this run belongs to.';
comment on column sync.sync_runs.run_type is 'backfill / reconcile / webhook / writeback.';
comment on column sync.sync_runs.started_at is 'Run start.';
comment on column sync.sync_runs.finished_at is 'Run end.';
comment on column sync.sync_runs.rows_in is 'Rows read from the source.';
comment on column sync.sync_runs.rows_normalized is 'Rows written to business tables.';
comment on column sync.sync_runs.status is 'running / success / partial / error.';
comment on column sync.sync_runs.details is 'Run detail (jsonb).';
comment on column sync.sync_runs.error is 'Failure detail, null when clean.';
comment on column sync.writeback_queue.connection_id is 'FK to the target connection.';
comment on column sync.writeback_queue.operation is 'Allow-listed operation name (e.g. close_update_opportunity_stage).';
comment on column sync.writeback_queue.target_external_id is 'The record to update in the target system.';
comment on column sync.writeback_queue.payload is 'The change to push (jsonb).';
comment on column sync.writeback_queue.status is 'pending / sent / failed / skipped.';
comment on column sync.writeback_queue.enabled is 'Allow-list gate: only enabled rows dispatch.';
comment on column sync.writeback_queue.origin is 'Where the change came from (echo-loop guard).';
comment on column sync.writeback_queue.attempts is 'Dispatch attempts so far (fails at 5).';
comment on column sync.writeback_queue.last_error is 'Most recent dispatch error.';
comment on column sync.writeback_queue.sent_at is 'When the push succeeded.';
comment on column sync.calendar_map.location_id is 'GHL sub-account (location) id.';
comment on column sync.calendar_map.calendar_id is 'GHL calendar id.';
comment on column sync.calendar_map.calendar_name is 'Calendar name (auto-filled, editable).';
comment on column sync.calendar_map.call_type is 'Call type bookings on this calendar create.';
comment on column sync.calendar_map.is_booking is 'Whether bookings count toward funnel KPIs.';
comment on column sync.calendar_map.tag is 'KPI grouping label (e.g. A1).';
comment on column sync.calendar_map.active is 'Whether the mapping is in use.';

-- End of migration 0021.
