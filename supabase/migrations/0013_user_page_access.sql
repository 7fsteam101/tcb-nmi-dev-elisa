-- =====================================================================
-- 0013: Per-user page access (Katie 2026-07-02).
-- Roles carry sensible default page-sets; the admin can override any single
-- page per user (allow or deny) without changing the role. Stored as jsonb:
-- {"receivables": true, "marketing": false} — absent key = role default.
-- =====================================================================

alter table core.app_user add column page_overrides jsonb not null default '{}';
comment on column core.app_user.page_overrides is 'Per-user page access overrides on top of the role defaults: {"<page>": true|false}. Absent key = role default. Pages: overview, funnel, calls, receivables, reps, marketing, forms. Admin-only pages (connections, admin) never override.';

-- End of migration 0013.
