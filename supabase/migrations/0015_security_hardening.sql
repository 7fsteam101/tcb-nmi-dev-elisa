-- =====================================================================
-- 0015: Security hardening + FK indexes (pre-data readiness audit, 2026-07-02).
--  1) Strip ALL grants from anon (leftover default-privilege grants from when
--     tables lived in public — RLS blocked actual access, but the grants are wrong).
--  2) Reset authenticated to read-only on non-sensitive tables ONLY
--     (no PII intake, no app_user password hashes, no write anywhere).
--  3) Pin set_updated_at's search_path (mutable-search-path advisor finding).
--  4) Index every hot-path foreign key the audit found bare.
-- =====================================================================

-- 1) anon: nothing, anywhere
revoke all on all tables in schema core, sales, credit, finance, marketing, delivery, sync from anon;
revoke all on all sequences in schema core, sales, credit, finance, marketing, delivery, sync from anon;
revoke usage on schema core, sales, credit, finance, marketing, delivery, sync from anon;

-- 2) authenticated: read-only, minus the sensitive tables
revoke all on all tables in schema core, sales, credit, finance, marketing, delivery, sync from authenticated;
grant select on all tables in schema core, sales, finance, marketing, delivery to authenticated;
revoke select on core.app_user from authenticated;             -- password hashes: service only
grant select on credit.nafa to authenticated;                  -- report figures are dashboard data
-- credit.intake_submission: NO authenticated grant (encrypted PII, backend only)
grant select on sync.connections, sync.sync_runs, sync.writeback_queue, sync.calendar_map to authenticated;

-- 3) pin the trigger function's search_path
alter function public.set_updated_at() set search_path = '';

-- 4) FK indexes flagged by the audit
create index if not exists idx_receivable_payment_fk   on finance.receivable(payment_id);
create index if not exists idx_payment_rep_fk          on finance.successful_payment(rep_id);
create index if not exists idx_payment_strategy_fk     on finance.successful_payment(strategy_call_id);
create index if not exists idx_appt_reason_fk          on sales.appointment(reason_id);
create index if not exists idx_call_booking_payment_fk on sales.call(booking_payment_id);
create index if not exists idx_call_cancel_reason_fk   on sales.call(cancellation_reason_id);
create index if not exists idx_call_dq_reason_fk       on sales.call(dq_reason_id);
create index if not exists idx_call_nafa_fk            on sales.call(nafa_id);
create index if not exists idx_call_rep_fk             on sales.call(rep_id);
create index if not exists idx_opp_current_nafa_fk     on sales.opportunity(current_nafa_id);
create index if not exists idx_opp_dq_reason_fk        on sales.opportunity(dq_reason_id);
create index if not exists idx_opp_lost_reason_fk      on sales.opportunity(lost_reason_id);
create index if not exists idx_opp_owner_rep_fk        on sales.opportunity(owner_rep_id);
create index if not exists idx_writeback_connection_fk on sync.writeback_queue(connection_id);

-- End of migration 0015.
