-- =====================================================================
-- 0009: The connector backbone — dynamic, multi-account, and two-way.
-- A `sync` schema holding the plumbing that every connector shares:
--   connections    : one row per connected account (the dynamic / multi-account core)
--   sync_runs      : an audit of every sync attempt
--   raw_events     : an idempotent landing zone for raw provider payloads
--   writeback_queue: controlled write-back, so a dashboard edit pushes to Close / GHL
-- Adapted from the proven Pulse platform pattern, single-tenant for TCB.
-- =====================================================================

create schema if not exists sync;

create type sync.provider          as enum ('ghl','close','stripe','nmi','meta');
create type sync.connection_status as enum ('connected','expired','error','disconnected');
create type sync.run_type          as enum ('backfill','reconcile','webhook','writeback');
create type sync.run_status        as enum ('running','success','partial','error');
create type sync.raw_status        as enum ('pending','processed','failed');
create type sync.writeback_status  as enum ('pending','sent','failed','skipped');

-- One row per connected account. Adding an account = a new row → this is what makes
-- the connectors dynamic and multi-account (e.g. one GHL agency, many sub-account rows).
create table sync.connections (
  id uuid primary key default gen_random_uuid(),
  provider            sync.provider not null,
  external_account_id text not null,                 -- GHL location id, Close org, Stripe acct, Meta ad account, ...
  account_label       text,                          -- human label, e.g. "GHL Marketing sub-account"
  status              sync.connection_status not null default 'connected',
  token_secret_ref    text,                          -- pointer to the OAuth token in Supabase Vault (NEVER the token itself)
  scopes              text,
  settings            jsonb not null default '{}',   -- per-connection config (Stripe direct flag, location details, ...)
  sync_cursor         jsonb not null default '{}',   -- incremental sync state per stream
  last_synced_at      timestamptz,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, external_account_id)
);
comment on table sync.connections is 'One row per connected account. Adding an account is a new row — this is what makes the connectors dynamic / multi-account. One GHL agency can have many location rows. OAuth tokens live in Supabase Vault (token_secret_ref), never inline.';

-- An audit of every sync attempt.
create table sync.sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id   uuid not null references sync.connections(id) on delete cascade,
  run_type        sync.run_type not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  rows_in         int,
  rows_normalized int,
  status          sync.run_status not null default 'running',
  details         jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Idempotent landing zone: every raw provider payload lands here first (webhook or
-- backfill), then a normalizer projects it into the business tables.
create table sync.raw_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references sync.connections(id) on delete cascade,
  provider      sync.provider not null,
  external_id   text not null,
  event_type    text not null,
  payload       jsonb not null,
  status        sync.raw_status not null default 'pending',
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (connection_id, external_id, event_type)    -- re-delivery / re-pull = a no-op
);
comment on table sync.raw_events is 'Idempotent landing zone for raw provider payloads. The UNIQUE key makes a re-delivered webhook or a re-pulled record a no-op.';

-- Controlled two-way sync: a dashboard edit lands here, a writeback worker pushes it to
-- Close / GHL. Curated allow-list (enabled gate) + echo-loop guard (origin) so a
-- write-back never bounces back through the inbound sync and loops.
create table sync.writeback_queue (
  id uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references sync.connections(id),
  operation         text not null,                   -- e.g. 'update_opportunity_stage' (curated allow-list)
  target_external_id text not null,                  -- the Close / GHL record to update
  payload           jsonb not null,                  -- the change to push
  status            sync.writeback_status not null default 'pending',
  enabled           bool not null default false,     -- allow-list gate: only enabled operations dispatch
  origin            text,                            -- 'dashboard' etc. — feeds the echo-loop guard
  attempts          int not null default 0,
  last_error        text,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table sync.writeback_queue is 'Two-way sync. A dashboard edit (e.g. move an opportunity stage) lands here, then a writeback worker pushes it to Close / GHL. Curated allow-list via `enabled`; echo-loop guard via `origin`, so the write-back does not come straight back through the inbound sync.';

-- updated_at triggers
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='sync' loop
    execute format('create trigger trg_%s_updated before update on sync.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- grants + RLS (service role = the backend workers; dashboard reads connection/run status)
grant usage on schema sync to authenticated, service_role;
grant all on all tables    in schema sync to service_role;
grant all on all sequences in schema sync to service_role;
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='sync' loop
    execute format('alter table sync.%I enable row level security', t);
  end loop;
end $$;
grant select on sync.connections, sync.sync_runs to authenticated;
create policy connections_auth_read on sync.connections for select to authenticated using (true);
create policy sync_runs_auth_read   on sync.sync_runs   for select to authenticated using (true);

-- End of migration 0009.
