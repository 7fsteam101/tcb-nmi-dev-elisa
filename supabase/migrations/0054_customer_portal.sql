-- 0054_customer_portal.sql
-- Customer self-service billing portal (v1).
--
-- The portal is scoped to ONE customer by a durable, revocable token. This is
-- deliberately distinct from finance.payment_link.token (that one is per-LINK,
-- short-lived, single-purpose). This token is per-CONTACT and long-lived: it is
-- how /portal/<token> resolves "which customer is this" for every query.
--
-- Server-only table: no `authenticated` grant. The Next app reads it via the
-- direct `sql` connection (service_role over the pooler); it must never be
-- exposed through the PostgREST/authenticated surface, because the token IS the
-- credential.

create table core.portal_token (
  token               text primary key,
  contact_id          uuid not null references core.contact(id) on delete cascade,
  expires_at          timestamptz,                      -- null = never expires
  revoked_at          timestamptz,                      -- set to kill the link (kept for audit, not deleted)
  created_by_user_id  uuid references core.app_user(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table  core.portal_token             is 'Per-customer billing-portal access token. Resolves token -> contact_id for /portal/<token>. Every portal query is scoped by contact_id. Revoke by setting revoked_at; never reuse a token across contacts.';
comment on column core.portal_token.token       is 'Public URL token (opaque, url-safe hex; not the row id).';
comment on column core.portal_token.contact_id  is 'The single contact this portal link belongs to.';
comment on column core.portal_token.expires_at  is 'Optional hard expiry. Null = does not expire.';
comment on column core.portal_token.revoked_at  is 'When set, the token is dead (admin revoke).';

create index idx_portal_token_contact on core.portal_token(contact_id);

create trigger trg_portal_token_updated before update on core.portal_token
  for each row execute function public.set_updated_at();

-- fail-closed, server-only (mirrors the post-0015 authenticated-read model but
-- withholds the authenticated grant on purpose; see header note).
alter table core.portal_token enable row level security;
grant all on core.portal_token to service_role;

-- ---------------------------------------------------------------------------
-- Customer-portal feature flags. The portal READS these now; the Admin UI to
-- flip them ships later. Defaults expose the read surfaces and business-info
-- edit; cancellation is off until lib/nmi.ts gains cancelSubscription().
-- ---------------------------------------------------------------------------
insert into core.app_setting (key, value) values
  ('portal_show_invoices',        'true'::jsonb),
  ('portal_show_payment_methods', 'true'::jsonb),
  ('portal_allow_card_update',    'true'::jsonb),
  ('portal_edit_business_info',   'true'::jsonb),
  ('portal_show_subscriptions',   'true'::jsonb),
  ('portal_allow_cancel',         'false'::jsonb),
  ('portal_brand_name',           '"The Credit Brothers"'::jsonb),
  ('portal_brand_accent',         '"#3b82f6"'::jsonb)
on conflict (key) do nothing;

-- End of migration 0054.
