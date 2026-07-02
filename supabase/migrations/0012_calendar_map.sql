-- =====================================================================
-- 0012: GHL calendar categorization (Katie 2026-07-02).
-- All calendars live in GHL; each maps to a call type so bookings land
-- categorized (readiness / strategy / follow_up). Managed in the admin panel;
-- the GHL sync reads it on every appointment event. Unmapped calendars default
-- to strategy and surface in the admin panel for mapping.
-- =====================================================================

create table sync.calendar_map (
  id uuid primary key default gen_random_uuid(),
  location_id   text not null,             -- GHL sub-account (location) id
  calendar_id   text not null,
  calendar_name text,
  call_type     public.call_type not null default 'strategy',
  is_booking    boolean not null default true,  -- counts toward "booked" KPIs (strategy calendars)
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (location_id, calendar_id)
);
comment on table sync.calendar_map is 'GHL calendar -> call type mapping. The GHL sync categorizes every appointment through this; edited in the admin panel. Unmapped calendars default to strategy and appear here automatically for review.';
comment on column sync.calendar_map.id is 'Primary key (uuid, auto-generated).';
comment on column sync.calendar_map.location_id is 'GHL sub-account (location) id the calendar belongs to.';
comment on column sync.calendar_map.calendar_id is 'GHL calendar id.';
comment on column sync.calendar_map.calendar_name is 'Human-readable calendar name (auto-filled from events, editable).';
comment on column sync.calendar_map.call_type is 'Which call type bookings on this calendar create: readiness / strategy / follow_up.';
comment on column sync.calendar_map.is_booking is 'Whether bookings on this calendar count toward the "booked" funnel KPIs (true for paid strategy calendars).';
comment on column sync.calendar_map.active is 'Whether this mapping is in use.';
comment on column sync.calendar_map.created_at is 'When this row was created.';
comment on column sync.calendar_map.updated_at is 'When this row was last updated (auto-maintained).';

create trigger trg_calendar_map_updated before update on sync.calendar_map for each row execute function public.set_updated_at();
alter table sync.calendar_map enable row level security;
grant all on sync.calendar_map to service_role;
grant select on sync.calendar_map to authenticated;
create policy calendar_map_auth_read on sync.calendar_map for select to authenticated using (true);

-- End of migration 0012.
