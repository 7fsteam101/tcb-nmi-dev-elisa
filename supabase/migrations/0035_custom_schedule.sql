-- =====================================================================
-- 0035: custom payment plans. A custom plan has per-installment amounts and
-- dates that a fixed NMI subscription cannot express, so we store the explicit
-- schedule on the link and (for custom only) charge each installment ourselves
-- on its date via the vaulted card. Regular cadences still use an NMI
-- subscription. custom_schedule is a jsonb array of
--   { no, dueDate (YYYY-MM-DD), amountMinor, status ('scheduled'|'paid'|'failed'), txnId }.
-- =====================================================================

alter table finance.payment_link add column if not exists custom_schedule jsonb;
comment on column finance.payment_link.custom_schedule is
  'Explicit per-installment schedule for a custom plan: [{no, dueDate, amountMinor, status, txnId}]. Charged installment-by-installment on the vaulted card by the receivables cron (custom cannot be a fixed NMI subscription).';

-- End of migration 0035.
