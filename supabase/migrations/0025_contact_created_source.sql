-- =====================================================================
-- 0025: Contacts always know their creation source (Katie 2026-07-02:
-- "for the contacts we need to always know the creation source").
--  - core.contact.created_source: set once at creation, never overwritten.
--  - finance.successful_payment.contact_id: payments link directly to their
--    payer (deal_id alone loses pre-deal / historical payments) — this is what
--    lets NMI-history payers exist as contacts with their money attached.
-- =====================================================================

alter table core.contact add column created_source text not null default 'unknown';
comment on column core.contact.created_source is 'Where this contact record was born (set once at creation): close_import, close_lead_sync, ghl_form_submission, ghl_appointment, ghl_contact_sync, nmi_successful_payment, stripe_charge, sales_call_form, manual, unknown.';

-- backfill: everything currently in the system came from the Close import
update core.contact set created_source = 'close_import' where close_id is not null;

alter table finance.successful_payment add column contact_id uuid references core.contact(id);
comment on column finance.successful_payment.contact_id is 'FK to the payer. Set even when no deal exists (historical/pre-deal payments), so money is always attributable to a person.';
create index idx_payment_contact on finance.successful_payment(contact_id);

-- backfill: payments matched to a deal inherit the deal''s contact
update finance.successful_payment p set contact_id = d.contact_id
from sales.deal d where d.id = p.deal_id and p.contact_id is null;

-- End of migration 0025.
