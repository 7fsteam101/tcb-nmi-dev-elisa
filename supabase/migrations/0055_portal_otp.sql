-- 0055_portal_otp.sql
-- Email one-time passcode for the customer portal (Stripe-parity login).
--
-- The v1 per-customer URL token granted access on its own (link = access). This
-- adds the missing layer: the customer must prove control of their email by
-- entering a 6-digit code before a session is issued. Codes are HASHED (never
-- stored raw), single-use, short-lived, and attempt-capped.
--
-- Server-only table (no authenticated grant), same posture as core.portal_token.

create table core.portal_otp (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references core.contact(id) on delete cascade,
  email        text not null,                 -- the challenged address (lowercased)
  code_hash    text not null,                 -- sha256(code + server pepper); raw code never stored
  expires_at   timestamptz not null,          -- ~10 min TTL
  consumed_at  timestamptz,                   -- set on success OR lockout (single-use)
  attempts     int not null default 0,        -- wrong-code counter; locks at 5
  created_at   timestamptz not null default now()
);

comment on table  core.portal_otp            is 'Short-lived, hashed, single-use email OTP challenges for customer-portal login.';
comment on column core.portal_otp.code_hash  is 'sha256(code + SESSION_SECRET). A DB leak alone cannot brute the 6-digit space offline without the pepper.';
comment on column core.portal_otp.consumed_at is 'Set on successful verify or on attempt-lockout. A consumed row can never be reused.';
comment on column core.portal_otp.attempts   is 'Wrong-code attempts; the row locks (is consumed) at 5.';

-- fast lookup of the latest active challenge for an email
create index idx_portal_otp_email_active on core.portal_otp (lower(email), created_at desc);

alter table core.portal_otp enable row level security;
grant all on core.portal_otp to service_role;

-- End of migration 0055.
