-- =====================================================================
-- 0045: form registry — the counts-only-when-mapped pattern for GHL forms
-- (same as calendars and stages). Every form that ever submits auto-registers;
-- an admin marks it "counts as lead" or leaves it ignored. New funnels need
-- zero code; un-decided forms surface in the needs-attention banner.
--   opt_in.form_id      -> which form produced the opt-in (join key for re-flags)
--   opt_in.counted      -> the FORM gate (admin decision), separate from
--                          counts_as_unique (the 30-day per-person dedupe).
--   Leads KPI = counts_as_unique AND counted.
-- =====================================================================

create table if not exists sync.form_map (
  id uuid primary key default gen_random_uuid(),
  location_id text not null,
  form_id text not null,
  form_name text,
  counts_as_lead boolean not null default false,
  reviewed_at timestamptz,
  first_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, form_id)
);
comment on table sync.form_map is
  'GHL form -> lead-counting decision. Forms auto-register on first submission; an admin marks counts_as_lead in Admin, Forms. reviewed_at NULL = never reviewed (needs-attention banner). Tracking-follows-mapping, July 9 policy.';
comment on column sync.form_map.counts_as_lead is 'Admin decision: submissions from this form count as lead opt-ins. Toggling re-applies to the form''s historical opt-ins.';
comment on column sync.form_map.reviewed_at is 'Set by any admin action on the row. NULL = never reviewed.';

drop trigger if exists set_updated_at on sync.form_map;
create trigger set_updated_at before update on sync.form_map
  for each row execute function public.set_updated_at();

alter table sync.form_map enable row level security;
grant select on sync.form_map to authenticated;
grant all on sync.form_map to service_role;
drop policy if exists form_map_auth_read on sync.form_map;
create policy form_map_auth_read on sync.form_map for select to authenticated using (true);

alter table sales.opt_in add column if not exists form_id text;
comment on column sales.opt_in.form_id is 'GHL form id that produced this opt-in (sync.form_map join key; re-flag target when the admin toggles counts_as_lead).';
alter table sales.opt_in add column if not exists counted boolean not null default true;
comment on column sales.opt_in.counted is 'The FORM gate: true when the producing form is admin-marked counts_as_lead (or predates the registry). Separate from counts_as_unique (30-day dedupe). Leads = counted AND counts_as_unique.';
create index if not exists idx_opt_in_form on sales.opt_in (form_id) where form_id is not null;

-- Baseline: every form seen in history counts and is blessed (the current
-- funnel forms are exactly what has been flowing). New arrivals start
-- unreviewed + not counted.
insert into sync.form_map (location_id, form_id, form_name, counts_as_lead, reviewed_at)
select distinct
  coalesce(payload->>'location_id', 'default'),
  payload->'form'->>'id',
  null,
  true,
  now()
from sync.raw_events
where provider = 'ghl' and event_type = 'form_submitted' and payload->'form'->>'id' is not null
on conflict (location_id, form_id) do nothing;

-- Backfill opt_in.form_id from the raw events that produced them (best effort:
-- match by contact email + close submission time). Cheap and optional; the
-- registry gates go-forward regardless.
-- (Skipped where ambiguous; historical opt-ins keep counted = true.)

-- End of migration 0045.
