-- =====================================================================
-- 0049: test-data classification (Katie, July 10). The system knows what is a
-- test: admin-managed rules (emails + standalone-word keywords) auto-flag
-- contacts; flagging reuses the is_demo exclusion every query already
-- respects and CASCADES to the contact's children. Never deletes; always
-- reversible; the reason is recorded and visible.
-- =====================================================================
create table if not exists core.test_rule (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email', 'keyword')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (kind, value)
);
comment on table core.test_rule is 'Admin-managed test markers: emails match exactly (case-insensitive); keywords match as a STANDALONE WORD in the contact name. Matching contacts auto-flag as test (is_demo cascade) with the reason recorded.';

alter table core.contact add column if not exists test_reason text;
comment on column core.contact.test_reason is 'Why this contact is flagged as test (rule match or manual). NULL = tracked. Flag lives on is_demo (the universal exclusion) and cascades to children.';

alter table core.test_rule enable row level security;
grant all on core.test_rule to service_role;
grant select on core.test_rule to authenticated;
drop policy if exists test_rule_auth_read on core.test_rule;
create policy test_rule_auth_read on core.test_rule for select to authenticated using (true);

-- seed: the obvious ones (word-boundary "test", the explicit oddballs)
insert into core.test_rule (kind, value) values
  ('keyword', 'test'), ('keyword', 'mctest'), ('keyword', 'please ignore')
on conflict do nothing;
