-- =====================================================================
-- 0019: Fields from the authoritative form flowcharts (Katie 2026-07-02).
--  - Payment plans gain a CADENCE (monthly / bi-weekly / weekly / custom) and a
--    start date: the Sales Call Report's Won-PP path schedules receivables on
--    the chosen cadence, custom = arbitrary installment rows.
--  - Opportunities gain expected_close_date: the Deposit outcome records when
--    the full close is expected.
-- =====================================================================

create type public.payment_cadence as enum ('monthly', 'biweekly', 'weekly', 'custom');

alter table finance.payment_plan add column cadence public.payment_cadence not null default 'monthly';
comment on column finance.payment_plan.cadence is 'Installment rhythm chosen on the Sales Call Report: monthly / biweekly / weekly / custom (custom = closer-entered amount+date rows).';

alter table finance.payment_plan add column start_date date;
comment on column finance.payment_plan.start_date is 'First-payment date chosen on the Sales Call Report (Won PIF records it too).';

alter table sales.opportunity add column expected_close_date date;
comment on column sales.opportunity.expected_close_date is 'For the Deposit outcome: when the full close is expected (from the Sales Call Report).';

-- End of migration 0019.
