-- =====================================================================
-- 0011: Unique sync keys for the Close mirror (backfill + webhooks upsert
-- by close_id, so the key must be unique where present).
-- =====================================================================

create unique index uq_opportunity_close_id on sales.opportunity(close_id) where close_id is not null;
create unique index uq_contact_close_id     on core.contact(close_id)      where close_id is not null;

-- End of migration 0011.
