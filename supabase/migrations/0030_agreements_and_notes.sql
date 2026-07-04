-- =====================================================================
-- 0030: Contracts/agreements tracking + contact notes.
--   sales.agreement    — one row per contract/agreement, status signed/unsigned
--   core.contact_note  — freeform notes on a contact (profile + activity feed)
-- Backfills agreements from existing deals (signed) and contract_sent
-- opportunities (sent, awaiting signature) so the page is populated today.
-- =====================================================================

create table sales.agreement (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references core.contact(id),
  deal_id uuid references sales.deal(id),
  opportunity_id uuid references sales.opportunity(id),
  title text not null default 'Service Agreement',
  status text not null default 'draft',
  amount_minor int,
  sent_at timestamptz,
  signed_at timestamptz,
  document_url text,
  source text not null default 'system',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_agreement_status check (status in ('draft','sent','signed','declined','voided'))
);
comment on table sales.agreement is 'Contracts / agreements and their signature status. Fed today from deals + contract_sent opportunities; a contract tool (PandaDoc/DocuSign/GHL) can sync into it later.';
comment on column sales.agreement.id is 'Primary key (uuid, auto-generated).';
comment on column sales.agreement.contact_id is 'FK to the signer contact.';
comment on column sales.agreement.deal_id is 'FK to the deal this agreement backs (when won).';
comment on column sales.agreement.opportunity_id is 'FK to the opportunity.';
comment on column sales.agreement.title is 'Agreement name shown in the list.';
comment on column sales.agreement.status is 'draft / sent / signed / declined / voided.';
comment on column sales.agreement.amount_minor is 'Contract value (minor units), when known.';
comment on column sales.agreement.sent_at is 'When it was sent for signature.';
comment on column sales.agreement.signed_at is 'When it was signed.';
comment on column sales.agreement.document_url is 'Link to the signed document, when available.';
comment on column sales.agreement.source is 'Where the row came from (system backfill / manual / a contract tool).';
comment on column sales.agreement.is_demo is 'Demo vs live row.';
comment on column sales.agreement.created_at is 'When created.';
comment on column sales.agreement.updated_at is 'When last updated (auto-maintained).';
create trigger trg_agreement_updated before update on sales.agreement for each row execute function public.set_updated_at();
alter table sales.agreement enable row level security;
grant all on sales.agreement to service_role;
grant select on sales.agreement to authenticated;
create index idx_agreement_status on sales.agreement(status);
create index idx_agreement_contact on sales.agreement(contact_id);

create table core.contact_note (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references core.contact(id),
  body text not null,
  author_user_id uuid references core.app_user(id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table core.contact_note is 'Freeform notes on a contact, shown on the profile and in the activity feed.';
comment on column core.contact_note.id is 'Primary key (uuid, auto-generated).';
comment on column core.contact_note.contact_id is 'FK to the contact.';
comment on column core.contact_note.body is 'Note text.';
comment on column core.contact_note.author_user_id is 'FK to the app user who wrote it.';
comment on column core.contact_note.is_demo is 'Demo vs live row.';
comment on column core.contact_note.created_at is 'When written.';
create index idx_contact_note_contact on core.contact_note(contact_id, created_at desc);
alter table core.contact_note enable row level security;
grant all on core.contact_note to service_role;
grant select on core.contact_note to authenticated;

-- backfill: signed agreements from every non-refunded deal
insert into sales.agreement (contact_id, deal_id, opportunity_id, title, status, amount_minor, signed_at, source, is_demo)
select d.contact_id, d.id, d.opportunity_id,
       'Service Agreement', 'signed', d.total_contract_value_minor,
       (d.deal_close_date)::timestamptz, 'backfill_deal', d.is_demo
from sales.deal d
where d.status <> 'refunded';

-- backfill: sent-but-unsigned agreements from opportunities parked at contract_sent
insert into sales.agreement (contact_id, opportunity_id, title, status, sent_at, source, is_demo)
select o.contact_id, o.id, 'Service Agreement', 'sent', coalesce(o.updated_at, o.opened_at), 'backfill_opp', o.is_demo
from sales.opportunity o
where o.stage = 'contract_sent'
  and not exists (select 1 from sales.agreement a where a.opportunity_id = o.id);

-- End of migration 0030.
