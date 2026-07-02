# The Credit Brothers — Sales System

Sales reporting, forms, and two-way CRM sync for The Credit Brothers (built by 8 Figure Systems).

## What is in here

| Path | What it is |
|---|---|
| `dashboard/` | The Next.js app deployed on Vercel: dashboards, rep forms, inbound webhooks, Meta puller, and the write-back worker that pushes form outcomes to Close/GHL |
| `supabase/migrations/` | The full database schema (Supabase Postgres, client-owned project), applied in order |
| `supabase/docs/` | Auto-generated schema reference (per-table docs + ER diagrams), regenerated with `tbls` |
| `supabase/tests/` | Smoke test that seeds a funnel in a rollback transaction and checks the KPIs |
| `TCB-Dashboard-Mockups-v2.html` | The approved dashboard mockups the app is built from |

## The architecture in one paragraph

The client-owned Supabase Postgres is the reporting database, organized into domain schemas
(`core`, `sales`, `credit`, `finance`, `marketing`, `delivery`) plus `sync` for the plumbing.
Close stays the CRM system of record: inbound webhooks land in `sync.raw_events` (idempotent)
and normalize into the business tables; the dashboard and rep forms write outcomes locally and
queue rows in `sync.writeback_queue`, which a worker pushes back to Close (opportunity stage,
notes) and GHL. One row in `sync.connections` per connected account, so adding another GHL
sub-account or ad account later is data, not code.

## Running the app

```bash
cd dashboard
cp .env.example .env.local   # fill in DATABASE_URL etc.
npm install
npm run dev
```

Deployed on Vercel with the same env vars (use the Supabase transaction-pooler connection
string in production). Crons are defined in `dashboard/vercel.json`.

## Applying schema changes

```bash
supabase db push --db-url "$SUPABASE_DB_URL"   # from supabase/, applies migrations/ in order
tbls doc --rm-dist "$SUPABASE_DB_URL" docs      # regenerate the schema reference
```
