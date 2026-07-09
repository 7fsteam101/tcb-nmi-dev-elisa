-- 0039: Monday import idempotency key on the deal (receivables + nafa already
-- carry theirs). One column + index; the importer upserts by it.
alter table sales.deal add column if not exists monday_item_id text;
create unique index if not exists uq_deal_monday_item on sales.deal (monday_item_id) where monday_item_id is not null;
comment on column sales.deal.monday_item_id is 'Monday.com item id from the In-House Payment Schedule board (historical import join key).';
