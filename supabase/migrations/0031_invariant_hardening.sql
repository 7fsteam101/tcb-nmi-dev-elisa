-- =====================================================================
-- 0031: DB-level invariant hardening (audit follow-up). ADDITIVE ONLY.
-- Nothing here blocks the permissive Close mirror. Safe to re-run (guards).
--
-- Deliberately NOT included (would fight the permissive mirror, per
-- CLIENT-DECISIONS + migrations 0005/0006/0021):
--   * one-open-opportunity-per-contact  (dropped in 0006 on purpose)
--   * opportunity stage-regression guard (dropped in 0005 on purpose)
--   * global contact_identifier uniqueness (relaxed in 0021 C5 for couples)
--   * NOT NULL on close_id / deal-required-when-won (breaks hand-created
--     Close records and "won in Close, no deal yet")
-- =====================================================================

-- 1. Missing FK indexes (Postgres does not auto-index FKs).
create index if not exists idx_payment_receivable_fk on finance.successful_payment (receivable_id);
comment on index finance.idx_payment_receivable_fk is 'FK index: the NMI matcher filters payments by the receivable they fulfil.';
create index if not exists idx_agreement_opportunity_fk on sales.agreement (opportunity_id);
comment on index sales.idx_agreement_opportunity_fk is 'FK index for sales.agreement -> opportunity lookups.';
create index if not exists idx_agreement_deal_fk on sales.agreement (deal_id);
comment on index sales.idx_agreement_deal_fk is 'FK index for sales.agreement -> deal lookups.';

-- 2. House-standard: rep_commission_setting (0027) had updated_at but no created_at.
alter table sales.rep_commission_setting add column if not exists created_at timestamptz not null default now();
comment on column sales.rep_commission_setting.created_at is 'When this per-rep commission-rule setting was created.';

-- 3. Appointment is_current self-healing. uq_current_appt already guarantees
--    AT MOST ONE current slot per call (a second live slot is rejected). This
--    trigger makes ANY writer (backfill, manual dashboard edit, future
--    connector) behave like the app's addSlot: when a slot is written current,
--    demote the call's other slots in the same statement -> the intended flip
--    instead of a unique-violation. Inert for the app (it demotes first).
--    is_current is our internal per-slot flag; Close has no equivalent, so this
--    does NOT fight the mirror. set_updated_at runs with search_path='' (0015),
--    so this function schema-qualifies every reference too.
create or replace function sales.demote_sibling_current_slots()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.is_current then
    update sales.appointment
       set is_current = false
     where call_id = new.call_id and is_current and id is distinct from new.id;
  end if;
  return new;
end $$;
comment on function sales.demote_sibling_current_slots() is
  'Keeps exactly one is_current slot per call: when a slot is written current, demote the others in the same statement. Complements uq_current_appt.';

drop trigger if exists trg_appointment_single_current on sales.appointment;
create trigger trg_appointment_single_current
  before insert or update of is_current on sales.appointment
  for each row when (new.is_current)
  execute function sales.demote_sibling_current_slots();

-- End of migration 0031.
