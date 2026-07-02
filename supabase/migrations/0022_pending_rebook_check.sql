-- =====================================================================
-- 0022: B3 part 2 — the dateless-slot guard (separate migration because the
-- pending_rebook enum value from 0021 cannot be referenced in its own txn).
-- =====================================================================

alter table sales.appointment add constraint chk_slot_dated check (scheduled_for is not null or status = 'pending_rebook');
comment on column sales.appointment.scheduled_for is 'The appointment date/time. Null ONLY while status = pending_rebook (a reschedule whose new date is not set yet).';

-- End of migration 0022.
