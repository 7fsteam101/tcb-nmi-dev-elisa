# The Credit Brothers — Supabase

This folder holds TCB's database schema as versioned SQL migrations. TCB owns this Supabase project; 8 Figure Systems authored the schema.

## Structure

```
supabase/
  migrations/
    0001_initial_schema.sql   # the full schema (from the doc-13 spec)
```

The migration is the **source of truth** for the schema. Every future change is a new
numbered migration in this folder, never an edit to an applied one. That is what lets
the schema move cleanly between a sandbox and production without drifting.

## What 0001 builds

The complete sales-system data model: contacts and identifiers, opt-ins, opportunities,
the unified call table with the per-slot appointment model, the NAFA / intake pipeline,
deals, contracts, the versioned payment plan, receivables, payments, reversals, the
three-level commission engine, ad spend, fulfilment, report submissions, and the
reference lookups. The locked business rules are enforced as database constraints
(one open opportunity per contact, one primary strategy call per opportunity, one
current appointment per booking, one current plan version per deal, and so on).

## How to apply it

The project should be **empty** the first time (greenfield). Two ways:

**A. Supabase CLI (recommended)**
```bash
supabase link --project-ref <TCB_PROJECT_REF>
supabase db push
```

**B. Dashboard SQL editor**
Open the project, go to SQL Editor, paste the contents of
`migrations/0001_initial_schema.sql`, and run it.

## Notes

- **PII.** `intake_submission` holds credit-monitoring logins and the last 4 of the SSN.
  Those columns must hold **ciphertext only** (encrypt at the application layer via
  pgcrypto or Supabase Vault), the table is RLS-locked to the service role, and the
  values are purged after the pull / at engagement end. Confirm the retention policy
  with TCB before going live.
- **Row-Level Security** is enabled on every table. The backend sync writes via the
  service role (which bypasses RLS); the dashboard reads as `authenticated`. Tighten
  the policies to TCB's role model in a follow-up migration once the dashboard auth is set.
- **Money** is stored as integer minor units (cents), suffix `_minor`.
- **Ad-account timezone** must be locked (EST vs PST) before loading ad spend.
