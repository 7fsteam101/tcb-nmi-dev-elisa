-- =====================================================================
-- 0017: Link every call to its GHL calendar + taggable calendars.
-- Powers per-calendar KPIs — most immediately "A1 calendar bookings"
-- (the 30-day dispute-hold leads) from the client's KPI list: tag the A1
-- calendar in Admin -> Calendars and its bookings become countable.
-- =====================================================================

alter table sales.call add column calendar_map_id uuid references sync.calendar_map(id);
comment on column sales.call.calendar_map_id is 'FK to the GHL calendar this call was booked on (set by the GHL sync). Powers per-calendar KPIs, e.g. A1 dispute-hold bookings.';
create index idx_call_calendar_map on sales.call(calendar_map_id);

alter table sync.calendar_map add column tag text;
comment on column sync.calendar_map.tag is 'Optional label for KPI grouping (e.g. A1 for the 30-day dispute-hold calendar). Managed in Admin -> Calendars.';

-- End of migration 0017.
