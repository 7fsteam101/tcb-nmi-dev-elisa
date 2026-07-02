-- =====================================================================
-- 0016: Persist the calendar's is_booking flag on the call (design-audit P1.7).
-- The admin's calendar toggle ("counts as booked") now genuinely gates the
-- funnel KPIs: calls created from non-booking calendars carry is_booking=false
-- and drop out of Booked / leakage / close-rate denominators.
-- =====================================================================

alter table sales.call add column is_booking boolean not null default true;
comment on column sales.call.is_booking is 'Whether this call counts toward the "booked" funnel KPIs. Set from sync.calendar_map.is_booking at creation; admin-managed per calendar.';
create index idx_call_is_booking on sales.call(is_booking) where not is_booking;

-- End of migration 0016.
