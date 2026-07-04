-- =====================================================================
-- 0026: Writable collaboration + operations surfaces (Katie 2026-07-03 goal):
--   core.announcement  — admin/leadership post banners + team announcements
--   core.kb_article    — knowledge space (team-wide, admin-editable)
--   finance.payment_link — NMI payment/checkout links generated in-app
-- All three are WRITE surfaces (create/edit in the dashboard -> Supabase).
-- =====================================================================

-- announcements ------------------------------------------------------
create table core.announcement (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  level text not null default 'info',
  pinned_to_banner boolean not null default false,
  active boolean not null default true,
  starts_at timestamptz default now(),
  ends_at timestamptz,
  created_by_user_id uuid references core.app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_announcement_level check (level in ('info','success','warning','critical'))
);
comment on table core.announcement is 'Team announcements + banner messages posted by admin/leadership in the dashboard.';
comment on column core.announcement.id is 'Primary key (uuid, auto-generated).';
comment on column core.announcement.title is 'Announcement headline.';
comment on column core.announcement.body is 'Optional longer text.';
comment on column core.announcement.level is 'info / success / warning / critical — drives the color tint.';
comment on column core.announcement.pinned_to_banner is 'Whether it shows as a top banner across the app (vs only on the Announcements page).';
comment on column core.announcement.active is 'Whether it is shown at all.';
comment on column core.announcement.starts_at is 'Show from this time (default now).';
comment on column core.announcement.ends_at is 'Auto-hide after this time (null = no expiry).';
comment on column core.announcement.created_by_user_id is 'FK to the author (core.app_user).';
comment on column core.announcement.created_at is 'When this row was created.';
comment on column core.announcement.updated_at is 'When this row was last updated (auto-maintained).';
create trigger trg_announcement_updated before update on core.announcement for each row execute function public.set_updated_at();
alter table core.announcement enable row level security;
grant all on core.announcement to service_role;
grant select on core.announcement to authenticated;
create index idx_announcement_active on core.announcement(active, pinned_to_banner);

-- knowledge base -----------------------------------------------------
create table core.kb_article (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  body text not null default '',
  sort_order int,
  published boolean not null default true,
  updated_by_user_id uuid references core.app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table core.kb_article is 'Knowledge-space articles (SOPs, scripts, playbooks) — team-wide read, admin/leadership editable.';
comment on column core.kb_article.id is 'Primary key (uuid, auto-generated).';
comment on column core.kb_article.title is 'Article title.';
comment on column core.kb_article.category is 'Grouping category shown in the index.';
comment on column core.kb_article.body is 'Article body (markdown-lite: # h2, ## h3, - list, blank line = paragraph).';
comment on column core.kb_article.sort_order is 'Order within a category.';
comment on column core.kb_article.published is 'Draft (admins only) vs published (everyone).';
comment on column core.kb_article.updated_by_user_id is 'FK to the last editor (core.app_user).';
comment on column core.kb_article.created_at is 'When this row was created.';
comment on column core.kb_article.updated_at is 'When this row was last updated (auto-maintained).';
create trigger trg_kb_article_updated before update on core.kb_article for each row execute function public.set_updated_at();
alter table core.kb_article enable row level security;
grant all on core.kb_article to service_role;
grant select on core.kb_article to authenticated;
create index idx_kb_category on core.kb_article(category, sort_order);

-- payment links (NMI) ------------------------------------------------
create table finance.payment_link (
  id uuid primary key default gen_random_uuid(),
  amount_minor int not null,
  description text,
  customer_name text,
  customer_email text,
  contact_id uuid references core.contact(id),
  processor public.payment_processor not null default 'nmi',
  external_id text,
  url text,
  status text not null default 'created',
  created_by_user_id uuid references core.app_user(id),
  paid_payment_id uuid references finance.successful_payment(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_payment_link_status check (status in ('created','sent','paid','void','failed'))
);
comment on table finance.payment_link is 'Payment / checkout links generated in the dashboard (NMI). status tracks lifecycle to paid.';
comment on column finance.payment_link.id is 'Primary key (uuid, auto-generated).';
comment on column finance.payment_link.amount_minor is 'Link amount (minor units).';
comment on column finance.payment_link.description is 'What the payment is for.';
comment on column finance.payment_link.customer_name is 'Payer name.';
comment on column finance.payment_link.customer_email is 'Payer email (for emailed invoices).';
comment on column finance.payment_link.contact_id is 'FK to the matched contact, when known.';
comment on column finance.payment_link.processor is 'stripe or nmi (nmi for now).';
comment on column finance.payment_link.external_id is 'The invoice/link id in the processor.';
comment on column finance.payment_link.url is 'The shareable payment URL (null if the processor only emails an invoice).';
comment on column finance.payment_link.status is 'created / sent / paid / void / failed.';
comment on column finance.payment_link.created_by_user_id is 'FK to the creator (core.app_user).';
comment on column finance.payment_link.paid_payment_id is 'FK to the payment that settled this link.';
comment on column finance.payment_link.created_at is 'When this row was created.';
comment on column finance.payment_link.updated_at is 'When this row was last updated (auto-maintained).';
create trigger trg_payment_link_updated before update on finance.payment_link for each row execute function public.set_updated_at();
alter table finance.payment_link enable row level security;
grant all on finance.payment_link to service_role;
grant select on finance.payment_link to authenticated;
create index idx_payment_link_status on finance.payment_link(status);

-- End of migration 0026.
