# Migrations applied out of band (0053, 0054, 0055)

**TL;DR:** Migrations `0053_charge_now`, `0054_customer_portal`, and `0055_portal_otp`
were applied **by hand directly to production** (SQL editor, service role) instead of
through `supabase db push`. Their SQL objects exist in prod, but the CLI's tracking
table had no record of them. On 2026-07-15 we reconciled by inserting the three version
rows directly into `supabase_migrations.schema_migrations`. **No migration SQL was
re-run during reconciliation.** If you are about to run `supabase db push`, you do not
need to do anything — these three are already recorded as applied.

## What tracks migrations here

Supabase records applied migrations in `supabase_migrations.schema_migrations`
(`version text PK`, `name text`, `statements text[]`). `supabase db push` diffs the
local `supabase/migrations/*.sql` files against the `version` values already in that
table and runs only the ones that are missing. The `version` is the numeric filename
prefix — `0053`, `0054`, `0055`.

## What happened

- 0053/0054/0055 were run against prod **outside the CLI** (pasted into the Supabase SQL
  editor during the portal build), so the physical objects landed in prod but no
  `schema_migrations` rows were written for them. The tracking table topped out at 0052
  (`notification_identity`) while the database actually contained everything through 0055.
- Left unreconciled, the next `supabase db push` would have tried to (re-)apply 0053–0055.
  0054 (`create table core.portal_token`) and 0055 (`create table core.portal_otp`) would
  have **collided** — the tables already exist. (0053 is idempotent — `add value if not
  exists` / `add column if not exists` — so it alone would not have errored, but leaving a
  gap below two tracked migrations also triggers the CLI's out-of-order warnings.)

## How it was reconciled (2026-07-15)

Because the Supabase CLI was not installed on the machine doing the reconciliation, the
normal command —

```bash
supabase migration repair --status applied 0053 0054 0055
```

— was not available. We did the exact equivalent: a direct insert of version + name only,
executing **none** of the migrations' SQL.

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('0053', 'charge_now'),
       ('0054', 'customer_portal'),
       ('0055', 'portal_otp')
on conflict (version) do nothing;
```

Before inserting, we verified each migration's objects actually exist in prod, so marking
them "applied" reflects reality rather than hiding an unrun migration:

| Migration            | Object verified in prod                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| 0053 `charge_now`    | `public.payment_type` enum has value `'manual'` + `finance.successful_payment.charged_by_user_id` column |
| 0054 `customer_portal` | `core.portal_token` table                                                    |
| 0055 `portal_otp`    | `core.portal_otp` table                                                         |

## Consequences to be aware of

- These three rows have **`statements = null`** (and no timestamp array), unlike rows
  written by `db push`, which store the executed SQL. This is cosmetic — `db push` keys
  only on `version` — but it is the marker that these were **reconciled by hand, not
  pushed**. `supabase migration list` will show them as remote-applied.
- Do not edit 0053/0054/0055 and expect a push to update prod — they are recorded as
  applied and will be skipped. Any further change is a new numbered migration, as usual.
- Side note on the 0053 filename: it was renumbered from `0038_charge_now` to `0053` (see
  commit 42c223d) to resolve a collision with canonical's `0038_commission_engine_enum_fix`.
  That is why the SQL comments inside `0053_charge_now.sql` still say "0038".
