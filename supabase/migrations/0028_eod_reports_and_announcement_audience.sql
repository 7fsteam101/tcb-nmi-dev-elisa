-- =====================================================================
-- 0028: Setter end-of-day reports + announcement audience targeting.
--   sales.eod_report            — appointment setters' daily activity reports
--   core.announcement.audience_roles — restrict an announcement to roles
-- =====================================================================

create table sales.eod_report (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references sales.rep(id),
  report_date date not null default (now() at time zone 'America/New_York')::date,
  dials int not null default 0,
  conversations int not null default 0,
  appointments_set int not null default 0,
  follow_ups int not null default 0,
  notes text,
  created_by_user_id uuid references core.app_user(id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rep_id, report_date)
);
comment on table sales.eod_report is 'Appointment setters'' end-of-day activity reports (one per rep per day).';
comment on column sales.eod_report.id is 'Primary key (uuid, auto-generated).';
comment on column sales.eod_report.rep_id is 'FK to the setter (sales.rep).';
comment on column sales.eod_report.report_date is 'The day the report covers (report timezone).';
comment on column sales.eod_report.dials is 'Outbound dials made.';
comment on column sales.eod_report.conversations is 'Live conversations had.';
comment on column sales.eod_report.appointments_set is 'Appointments booked.';
comment on column sales.eod_report.follow_ups is 'Follow-ups scheduled.';
comment on column sales.eod_report.notes is 'Free-text summary / blockers.';
comment on column sales.eod_report.created_by_user_id is 'FK to the submitting app user.';
comment on column sales.eod_report.is_demo is 'Demo vs live row.';
comment on column sales.eod_report.created_at is 'When created.';
comment on column sales.eod_report.updated_at is 'When last updated (auto-maintained).';
create trigger trg_eod_report_updated before update on sales.eod_report for each row execute function public.set_updated_at();
alter table sales.eod_report enable row level security;
grant all on sales.eod_report to service_role;
grant select on sales.eod_report to authenticated;
create index idx_eod_report_date on sales.eod_report(report_date desc, rep_id);

alter table core.announcement add column audience_roles text[];
comment on column core.announcement.audience_roles is 'Roles that should see this announcement (admin/leadership/closer/setter/csm). Null or empty = everyone.';

-- End of migration 0028.
