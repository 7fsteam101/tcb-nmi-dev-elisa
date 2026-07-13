-- =====================================================================
-- 0043 (renumbered from 0041, version collision): stage map — the admin-managed mapping from platform stage labels to
-- our pipeline enum (the same counts-only-when-mapped pattern as calendars).
-- Every stage label ever seen from Close lands here; unmapped labels surface
-- in Admin -> Stages for a human to assign meaning. New stages the client
-- invents need zero code. Seeded below from the current alias table.
-- =====================================================================

create table if not exists sync.stage_map (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'close',
  external_label text not null,
  mapped_stage public.opportunity_stage,
  active boolean not null default false,
  first_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_label)
);
comment on table sync.stage_map is
  'Platform stage label -> our opportunity_stage. Unmapped rows (mapped_stage null / active false) surface in Admin, Stages; the mirror only applies ACTIVE mappings. New client-invented stages land here automatically.';

drop trigger if exists set_updated_at on sync.stage_map;
create trigger set_updated_at before update on sync.stage_map
  for each row execute function public.set_updated_at();

alter table sync.stage_map enable row level security;
grant select on sync.stage_map to authenticated;
grant all on sync.stage_map to service_role;
drop policy if exists stage_map_auth_read on sync.stage_map;
create policy stage_map_auth_read on sync.stage_map for select to authenticated using (true);

-- Seed: every label the alias table knows today, active and mapped.
insert into sync.stage_map (platform, external_label, mapped_stage, active) values
  ('close', 'Lead Opt In', 'lead_opt_in', true),
  ('close', 'Lead Opt-In', 'lead_opt_in', true),
  ('close', 'Setter Booked', 'setter_booked', true),
  ('close', 'Self Booked', 'self_booked', true),
  ('close', 'Strategy Call Booked', 'strategy_call_booked', true),
  ('close', 'Eligibility Call Booked', 'eligibility_call_booked', true),
  ('close', 'Intake Form Submitted', 'intake_form_submitted', true),
  ('close', 'Intake Submitted', 'intake_form_submitted', true),
  ('close', 'Intake Form Needed', 'intake_form_needed', true),
  ('close', 'Audit Complete', 'audit_complete', true),
  ('close', 'Call Confirmed', 'call_confirmed', true),
  ('close', 'No Show', 'no_show', true),
  ('close', 'Call Canceled (by Lead)', 'call_canceled_by_lead', true),
  ('close', 'Call Cancelled (by Lead)', 'call_canceled_by_lead', true),
  ('close', 'Call Canceled (by Team)', 'call_canceled_by_team', true),
  ('close', 'Call Cancelled (by Team)', 'call_canceled_by_team', true),
  ('close', 'Follow Up Call Booked', 'follow_up_call_booked', true),
  ('close', 'Warm List', 'warm_list', true),
  ('close', 'Contract Sent', 'contract_sent', true),
  ('close', 'Contract Signed', 'contract_signed', true),
  ('close', 'Deposit', 'deposit', true),
  ('close', 'Won PIF', 'won_pif', true),
  ('close', 'Won PP', 'won_pp', true),
  ('close', 'Lost', 'lost', true),
  ('close', 'DQ On Call', 'dq_on_call', true),
  ('close', 'Call Completed', 'call_completed', true),
  ('close', 'Closing', 'closing', true),
  ('close', 'Closed Won', 'closed_won', true),
  ('close', 'Interested Partner', 'interested_partner', true),
  ('close', 'Active Partner', 'active_partner', true),
  ('close', 'Not a Fit', 'not_a_fit', true)
on conflict (platform, external_label) do nothing;

-- End of migration 0041.
