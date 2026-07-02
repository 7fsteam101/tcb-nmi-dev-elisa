-- =====================================================================
-- 0018: Deals are born from the Sales Call Report, not from Close (Katie
-- 2026-07-02). Close mirrors the pipeline; the closer's report is the moment
-- of record for a deal (terms, value, plan, closer). `source` makes provenance
-- auditable: the historical bootstrap from Close values stays marked as such.
-- =====================================================================

alter table sales.deal add column source text not null default 'sales_call_report';
comment on column sales.deal.source is 'Where this deal record was born: sales_call_report (the authoritative path — the closer''s form), close_import (historical bootstrap from Close opportunity values, pre-system), manual.';

-- the 44 bootstrapped deals were created from Close opportunity values
update sales.deal set source = 'close_import'
where not exists (
  select 1 from sales.report_submission rs
  join sales.call c on c.id = rs.strategy_call_id
  where c.opportunity_id = sales.deal.opportunity_id and rs.type = 'sales_call'
);

comment on table sales.deal is 'A won deal and its terms. BORN FROM THE SALES CALL REPORT (the closer''s form) — Close mirrors the pipeline but never creates deals; a Close-won opportunity without a report surfaces as a compliance exception. Always one offer per deal. Never deleted.';

-- End of migration 0018.
